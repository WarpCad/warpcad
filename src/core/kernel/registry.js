/**
 * The `op` → kernel-call map (`Initial design.md` §4).
 *
 * Every op the document can name has exactly one entry here, and this is the only
 * module in the project that calls `@jscad/modeling` primitives and booleans
 * directly. Two things are encoded per entry, and they are orthogonal:
 *
 * - **`kind`** — `'native'` entries build geometry themselves; `'composite'` entries
 *   hold a recipe that expands into more op records and build nothing. Composite is
 *   the default for library items; native is the minority exception reserved for the
 *   base vocabulary (primitives, transforms, booleans — there is nothing left to
 *   compose *them* from) and, later, for genuinely procedural point-sampled geometry.
 * - **`operandCount`** — `0` for ops that create geometry from nothing, `1` for
 *   single-object edits, `'2+'` for ops needing two or more. This is the mechanism
 *   `CLAUDE.md`'s creation-vs-operation rule asks for: the UI reads
 *   {@link acceptsOperandCount} to decide whether a tool is enabled for the current
 *   selection, instead of hardcoding a duplicate list of which tools need operands.
 *   Every future catalogue entry copies this shape, so it is worth getting right now.
 *
 * ## Unit and convention boundaries
 *
 * This module is where document units meet kernel units. Documents are millimetres,
 * Z-up (`CLAUDE.md`), which `@jscad/modeling` matches, so lengths pass through. Two
 * things do not pass through and are converted here, once:
 *
 * - **Diameters.** The V1 libraries and the fastener tables talk in diameters;
 *   `@jscad/modeling` takes radii. `params.diameter` is halved at the call site.
 * - **Angles.** Any future rotation op takes degrees in `params` (human-facing, per
 *   §5) and converts to radians here — never in a component, never in a recipe.
 *
 * @module core/kernel/registry
 */

import modeling from '@jscad/modeling'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { booleans, extrusions, geometries, measurements, primitives, transforms } = modeling

import { chamferRim, filletRim } from './fillet.js'
import {
  add,
  align,
  bisect,
  calcCenterWith,
  calcSnap,
  createGroup,
  enlarge,
  fit,
  isGroup,
  mapGeometry,
  mirror,
  pick,
  removePart,
  snap,
} from './group.js'
import { label } from './text.js'
import {
  EXTRUSION_DEFAULTS as SKETCH_EXTRUSION_DEFAULTS,
  regionOf as sketchRegionOf,
  sketchProblem,
  validateSketchParams,
} from '../../sketch/profile.js'
import { loftRings } from '../../sketch/resample.js'
import { LEGACY_SEGMENTS, rimSlicesFor, segmentsFor } from './tessellation.js'
import { bolt } from './recipes/hardware.bolt.js'
import { nut } from './recipes/hardware.nut.js'
import { washer } from './recipes/hardware.washer.js'
import { bearing } from './recipes/hardware.bearing.js'
import { screw, SCREW_HEADS } from './recipes/hardware.screw.js'
import { anchor } from './recipes/kit.anchor.js'
import { board } from './recipes/kit.board.js'
import { boardFrame } from './recipes/kit.boardFrame.js'
import { activeCoolingFan } from './recipes/raspberrypi.activeCoolingFan.js'
import { BPLUS_MODELS, BPLUS_PART_ALIASES, DEFAULT_CLEARANCE_MM, bplus } from './recipes/raspberrypi.bplus.js'
import { boltSpecs } from './tables/bolt-specs.js'
import { nutSpecs } from './tables/nut-specs.js'
import { screwSpecs } from './tables/screw-specs.js'
import { washerSpecs } from './tables/washer-specs.js'
import { bearingSpecs } from './tables/bearing-specs.js'
import { FIT_CLEARANCE_MM } from './tables/fit-clearances.js'
import { CAMERA_MODULE_MODELS, cameraModule } from './recipes/raspberrypi.cameraModule.js'
import { hat } from './recipes/raspberrypi.hat.js'
import { hatStandoff } from './recipes/raspberrypi.hatStandoff.js'
import { hyperPixel4Rectangular } from './recipes/raspberrypi.hyperPixel4Rectangular.js'
import { miniPiTFT } from './recipes/raspberrypi.miniPiTFT.js'
import { piTFT22 } from './recipes/raspberrypi.piTFT22.js'
import { piTFT24 } from './recipes/raspberrypi.piTFT24.js'
import { spacer } from './recipes/raspberrypi.spacer.js'
import { touchDisplay7inch } from './recipes/raspberrypi.touchDisplay7inch.js'
import { touchScreen2 } from './recipes/raspberrypi.touchScreen2.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('@jscad/modeling').geometries.geom2.Geom2} Geom2 */
/** @typedef {import('./group.js').Group} Group */
/**
 * What a native op's `build` may hand back. Almost always a solid. Two exceptions,
 * both narrow and both deliberate: the `profile.*` pair (TODO/core-012) produces and
 * consumes the flat `geom2` profiles a composite kit recipe subtracts and extrudes
 * before anything renders, and the `group.*` pair (TODO/core-013) hands back the
 * `Group` it moved, parts intact, so the next record can still name one of them.
 * Only a *named* record's value reaches the mesh bridge, and a `Group` collapses to
 * a solid on the way in (`group.js`'s `add`), so nothing downstream widens.
 *
 * @typedef {Geom3 | Geom2 | Group} KernelGeometry
 */
/**
 * One operand as a `rawOperands` op sees it: the value still un-combined, and the
 * piece names the record addressed it by, if any (TODO/core-013).
 *
 * @typedef {object} ResolvedOperand
 * @property {Geom3 | Group} value The value bound to the id, *not* flattened.
 * @property {string} [pieces] Comma-separated part names; absent means the whole thing.
 */
/** @typedef {[number, number, number]} Vec3Mm */

/**
 * How a record names an operand: a bare id — every op's shape, and the only shape
 * before TODO/core-013 — or `{ id, pieces }`, naming a subset of that record's parts.
 * The ops that accept the second form are the ones carrying `subPartOperands`:
 * `group.snap`/`group.align` (TODO/core-013) and the three `boolean.*` ops
 * (TODO/core-024). Every other op rejects it rather than quietly consuming the whole
 * thing. See `index.js`'s `normalizeRef`.
 *
 * @typedef {string | { id: string, pieces?: string }} OperandRef
 */

/**
 * One line of the document, or one line of a composite recipe's expansion — the
 * schema is the same either way (`Initial design.md` §3), which is what lets both
 * replay through one fold.
 *
 * @typedef {object} OpRecord
 * @property {string} [id] Referenceable by `target`/`operands` from later records.
 * @property {string} op Registry key.
 * @property {Record<string, any>} [params] Plain JSON; never a function or code.
 * @property {OperandRef} [target] The primary operand.
 * @property {OperandRef[]} [operands] Additional operands.
 * @property {string} [supersedes] Id of the record whose *logical body* this
 *   record replaces — a move or a turn of an existing object rather than a new
 *   one. `src/core/document.js` reads this to report one body per lineage instead
 *   of one per record; the kernel fold itself ignores it. See that module's
 *   supersession note.
 * @property {string[]} [consumes] Ids of the logical bodies this record **retires
 *   into itself** — a boolean or a grouping, where two or more existing bodies go
 *   in and one new one comes out (TODO/ui-014). Mutually exclusive with
 *   `supersedes`, and a different claim: `supersedes` *continues* one body's
 *   identity, while a consuming record is its own new body that happens to have
 *   been built from others. Like `supersedes`, the kernel fold ignores it
 *   entirely — it is `src/core/document.js` that stops reporting the operands as
 *   independently selectable bodies.
 * @property {string} [name] Names the result as a part of the resulting group.
 * @property {boolean} [hidden] Named but excluded from the group's default combine.
 * @property {number} [color] The named part's colour as a `0xRRGGBB` integer
 *   (TODO/core-026). Composite recipes set it from V1's `.color(name)` through
 *   `./colors.js`'s `v1ColorToRecord`. Absent means uncoloured, not a default colour.
 * @property {number} [colorAlpha] Its alpha in `(0, 1]` — V1's `.color(name, alpha)`.
 *   Omitted when 1, and never present without `color`. Doubles as `colorOverride`'s
 *   own alpha on a `style.recolor` record (TODO/data-005) — the two colour fields
 *   never coexist on one record, so one alpha field serves both.
 * @property {number | null} [colorOverride] A **user** colour override, `0xRRGGBB`
 *   (TODO/data-005) — distinct from `color`, which is a composite recipe's own
 *   baked-in default. Only ever set on a `style.recolor` record; the kernel fold
 *   does not interpret it, exactly as it does not interpret `hidden` or `color`.
 *   `null` is a **reset** of that record's key back to the default (TODO/ui-037's
 *   `document.clearColorOverride`).
 * @property {string} [subPart] Narrows a `style.recolor` record's `colorOverride`
 *   to one named part of the superseded body's `Group` (TODO/data-005), mirroring
 *   `ui-016`'s single-part selection address rather than `pieces`'s comma-list
 *   operand addressing (TODO/core-024) — a colour override always targets exactly
 *   one part, never a set. Absent means the override applies to the whole body.
 * @property {{ ref: string, param: string, in: any[] }} [when] A **condition**
 *   (`TODO/ui-052`): the record takes part in the fold only while the body `ref` names
 *   has its `param` set to one of the values in `in` — "this cut-out only exists on a
 *   Pi 4". One enum param, membership only, plain JSON; `src/core/condition.js`
 *   evaluates it and `src/core/document.js`'s fold honours it. The kernel fold itself
 *   never reads it — by the time a record reaches `evaluate`, the document has already
 *   decided whether it takes part.
 */

/**
 * @typedef {object} BuildArgs
 * @property {Record<string, any>} params The record's `params`, plain JSON.
 * @property {Geom3[]} inputs Resolved operand geometry, `target` first. Typed as
 *   solids because that is what almost every op consumes; the two op families that
 *   consume something else narrow it themselves, since the fold does not track which
 *   flavour of geometry an id holds (see {@link KernelGeometry}).
 *   `profile.extrudeLinear` is handed a `geom2`; an entry declaring `rawOperands` is
 *   handed {@link ResolvedOperand}s instead of geometry at all.
 * @property {import('./tessellation.js').TessellationPolicy} [policy] The design's
 *   resolution (`TODO/core-035`). A curve whose record carries no explicit `segments`
 *   takes its count from this; absent means `legacy`, the old fixed 32.
 */

/** @typedef {(params: any, tables: any) => OpRecord[]} Recipe */

/**
 * @typedef {object} OpUiOption
 * @property {any} value The param value this option sets.
 * @property {string} label Human name for it, e.g. `"Pi 5"`.
 */

/**
 * @typedef {object} OpUiChoice
 * @property {string} param Which param the control sets — always one of
 *   {@link OpUi}`.defaults`' own keys, so the row opens showing its real default.
 * @property {string} label Label for the control itself, e.g. `"Model"`.
 * @property {readonly OpUiOption[]} options Every value the recipe accepts.
 */

/**
 * @typedef {object} OpUi
 * @property {string} label Human name for the op — the Library panel's row title.
 * @property {Record<string, any>} defaults Params a fresh instance is created with.
 * @property {OpUiChoice} [choice] A variant the user picks **before** dragging
 *   (`TODO/ui-031`). Present on the two recipes that are one factory parameterised
 *   by `model` (`core-014a`'s "one factory, not one draggable per revision"), and
 *   on nothing else: a row with no choice is a fixed shape the way a Bolt is. The
 *   panel renders whatever is here and names no recipe of its own, so a third
 *   variant-bearing recipe is a change in this file alone.
 * @property {'sketch'} [editor] Dropping this row opens an editor instead of committing a
 *   record (`TODO/sketch-001`): a Sketch has no geometry until the user draws it, so the
 *   drop places the editor's plane and Done appends the one record. `defaults` is then
 *   only what the placement ghost previews.
 */

/**
 * Build a `model` choice out of a recipe's **own** exported list of valid models.
 *
 * Derived rather than hand-copied on purpose: a sixth camera added to
 * `recipes/raspberrypi.cameraModule.js` appears in the panel automatically, and
 * cannot silently go missing the way a second list would drift. Only the labels
 * are written here, because a display name is not something the recipe knows.
 *
 * @param {readonly any[]} values The recipe's exported model list.
 * @param {Record<string, string>} labels Display name per model, keyed by `String(value)`.
 * @returns {OpUiChoice}
 */
function modelChoice(values, labels) {
  return Object.freeze({
    param: 'model',
    label: 'Model',
    options: Object.freeze(
      values.map((value) => {
        const label = labels[String(value)]
        if (!label) throw new Error(`modelChoice: no label for model ${JSON.stringify(value)}`)
        return Object.freeze({ value, label })
      })
    ),
  })
}

/**
 * @typedef {object} RegistryEntry
 * @property {'native' | 'composite'} kind
 * @property {0 | 1 | '2+'} operandCount How many operands the op consumes.
 * @property {(args: BuildArgs) => KernelGeometry} [build] Native ops only.
 * @property {boolean} [rawOperands] Native ops only. The fold flattens every operand
 *   to a solid before `build` sees it, which is right for a boolean or a transform
 *   and wrong for the `group.*` pair — snapping a bolt by its head needs the head,
 *   and the result has to keep the thread and tap so the next record can name them.
 *   Setting this asks the fold for {@link ResolvedOperand}s instead. The `group.*`
 *   pair and the `transform.*` ops use it; anything else consuming a composite
 *   still gets the combined solid.
 * @property {boolean} [subPartOperands] May an operand be addressed as
 *   `{ id, pieces }` — a named subset of a composite's parts (TODO/core-024)?
 *   Orthogonal to `rawOperands`, which asks a different question (does `build` see
 *   the value un-combined?): `group.snap`/`group.align` set both, the three
 *   `boolean.*` ops set only this one and still receive a flat solid, and
 *   `transform.*` sets only `rawOperands` because it must keep a group whole.
 *   Without this flag the fold refuses a `pieces` address rather than dropping it,
 *   since dropping it would consume the whole bolt while the record plainly says
 *   `tap`.
 * @property {Recipe} [recipe] Composite ops only.
 * @property {OpUi} [ui] Present on ops the UI offers as a catalogue row.
 */

/**
 * A native entry: it builds geometry itself.
 *
 * @param {0 | 1 | '2+'} operandCount
 * @param {(args: BuildArgs) => KernelGeometry} build
 * @param {OpUi} [ui] Catalogue metadata; see {@link OpUi} and `src/core/library.js`.
 * @returns {RegistryEntry}
 */
function native(operandCount, build, ui) {
  return Object.freeze(
    ui
      ? { kind: 'native', operandCount, build, ui: Object.freeze(ui) }
      : { kind: 'native', operandCount, build }
  )
}

/**
 * A native entry that wants its operands un-combined **and** may be addressed by
 * sub-part. See `rawOperands` and `subPartOperands` on {@link RegistryEntry}.
 *
 * @param {0 | 1 | '2+'} operandCount
 * @param {(args: BuildArgs) => KernelGeometry} build
 * @returns {RegistryEntry}
 */
function rawNative(operandCount, build) {
  return Object.freeze({
    kind: 'native',
    operandCount,
    rawOperands: true,
    subPartOperands: true,
    build,
  })
}

/**
 * A native entry that receives its operand **un-combined but whole** — a group in,
 * a group out — and refuses a sub-part address (TODO/core-024).
 *
 * The `transform.*` ops (plus `style.recolor`/`group.removePart`, for the reasons
 * their own entries give; `transform.mirror` builds a new body rather than editing
 * one, but must keep its copy whole for the same reason). A transform edits one
 * body *in place*: honouring a `pieces` address would have to throw away the parts
 * it did not name, so a record saying "move the bolt's head" would silently delete
 * the thread. Refusing is the same reasoning the fold has always applied, now
 * stated as a property of the op rather than as a property of being flattened.
 *
 * @param {0 | 1 | '2+'} operandCount
 * @param {(args: BuildArgs) => KernelGeometry} build
 * @returns {RegistryEntry}
 */
function wholeGroupNative(operandCount, build) {
  return Object.freeze({ kind: 'native', operandCount, rawOperands: true, build })
}

/**
 * A native entry whose operands arrive **flattened, but may be flattened from a
 * named subset of a composite's parts** (TODO/core-024).
 *
 * The three booleans. A boolean consumes its operands into one new solid, so
 * naming a subset costs nothing that was not already being discarded — which is
 * exactly what makes it safe here and unsafe on a transform. The real `.jscad`
 * corpus behind this decision does it constantly and in both directions:
 * `.subtract([bolt.combine('tap')])`, `.subtract([motor.combine('pto,screw1,
 * screw2')])`, `.union(pi.combine('ethernet,usb1,usb2'))`.
 *
 * @param {0 | 1 | '2+'} operandCount
 * @param {(args: BuildArgs) => KernelGeometry} build
 * @returns {RegistryEntry}
 */
function subPartNative(operandCount, build) {
  return Object.freeze({ kind: 'native', operandCount, subPartOperands: true, build })
}

/**
 * A composite entry: it expands into more op records and builds nothing.
 *
 * The optional `ui` is the same catalogue metadata {@link native} already takes,
 * threaded through here by `TODO/ui-030` so a recipe can earn a Library row on
 * exactly the same terms a primitive does — one mechanism reading the registry,
 * not a second hand-maintained list of "the composites worth offering". A recipe
 * without it stays invisible to the panel, which is how `kit.*` and
 * `raspberrypi.*` remain out of scope until `ui-031` gives them one.
 *
 * @param {0 | 1 | '2+'} operandCount
 * @param {Recipe} recipe
 * @param {OpUi} [ui] Catalogue metadata; see {@link OpUi} and `src/core/library.js`.
 * @returns {RegistryEntry}
 */
function composite(operandCount, recipe, ui) {
  return Object.freeze(
    ui
      ? { kind: 'composite', operandCount, recipe, ui: Object.freeze(ui) }
      : { kind: 'composite', operandCount, recipe }
  )
}

/**
 * The two operands a `group.*` op needs: the thing being moved, then the thing it is
 * moved against. `operandCount` cannot say "exactly two" — its vocabulary is
 * `0 | 1 | '2+'`, and widening it would change the UI's tool-enablement contract for
 * every op — so `'2+'` gates the selection and this makes the extra operand loud
 * rather than silently ignored.
 *
 * @param {any[]} inputs
 * @param {string} op
 * @returns {[ResolvedOperand, ResolvedOperand]}
 */
function requireTwoOperands(inputs, op) {
  if (inputs.length !== 2) {
    throw new Error(
      `${op}: expected exactly 2 operands — the item to move, then the item to move ` +
        `it against — got ${inputs.length}`
    )
  }
  return /** @type {[ResolvedOperand, ResolvedOperand]} */ (inputs)
}

/**
 * The single operand of a one-operand `rawOperands` op, typed (TODO/core-024).
 *
 * The count itself is already guaranteed by `assertOperandCount` in the fold; this
 * is the narrowing {@link requireTwoOperands} does for the `group.*` pair, for the
 * two `transform.*` ops that consume exactly one.
 *
 * @param {any[]} inputs
 * @returns {ResolvedOperand}
 */
function soleOperand(inputs) {
  return /** @type {ResolvedOperand} */ (inputs[0])
}

/**
 * @param {unknown} axes
 * @param {string} op
 * @returns {string}
 */
function requireAxes(axes, op) {
  if (typeof axes !== 'string' || axes.length === 0) {
    throw new Error(
      `${op}: axes must name one or more of x, y, z — e.g. "z" or "xy" — got ${String(axes)}`
    )
  }
  return axes
}

/**
 * What a `group.*` op measures its reference against: the whole value, or just the
 * parts the record named. The fold has already checked that a named-pieces operand
 * really is a group, so this cannot be handed a bare solid with pieces set.
 *
 * @param {ResolvedOperand} operand
 * @returns {Geom3 | Group}
 */
function referenceOf(operand) {
  return operand.pieces === undefined
    ? operand.value
    : pick(/** @type {Group} */ (operand.value), operand.pieces)
}

/**
 * Positive, finite millimetre value or a clear error — degenerate dimensions produce
 * empty or self-intersecting solids downstream rather than failing loudly, so they
 * are rejected at the boundary (`CLAUDE.md`: cover the degenerate cases).
 *
 * @param {unknown} value
 * @param {string} label Parameter name, used in the error message.
 * @param {string} op
 * @returns {number}
 */
function requirePositive(value, label, op) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${op}: ${label} must be a positive number of millimetres, got ${String(value)}`)
  }
  return value
}

/**
 * Like {@link requirePositive}, but zero is a meaningful value rather than a
 * degenerate one — a cone's top radius of zero is the point of a cone, not a
 * mistake.
 *
 * @param {unknown} value
 * @param {string} label
 * @param {string} op
 * @returns {number}
 */
function requireNonNegative(value, label, op) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `${op}: ${label} must be a non-negative number of millimetres, got ${String(value)}`
    )
  }
  return value
}

/**
 * `@jscad/modeling`'s own `EPS`, which its `roundedRectangle` subtracts before
 * comparing a corner radius against the half-dimension. Mirrored here so this
 * module's error message wins for every radius upstream would have rejected,
 * including the sliver just below the half-dimension.
 */
const KERNEL_EPS_MM = 1e-5

/**
 * A rounded corner cannot be larger than the half-dimension it has to fit inside —
 * upstream throws "roundRadius must be smaller than the radius of all dimensions",
 * which names neither the op nor the parameter a user actually typed.
 *
 * @param {number} radiusMm
 * @param {number} smallerSideMm The shorter of the two side lengths.
 * @param {string} label Parameter name, as the caller's own params spell it.
 * @param {string} op
 * @returns {void}
 */
function assertCornerRadiusFits(radiusMm, smallerSideMm, label, op) {
  if (radiusMm > 0 && radiusMm >= smallerSideMm / 2 - KERNEL_EPS_MM) {
    throw new Error(
      `${op}: ${label} must be smaller than half the shortest side ` +
        `(${smallerSideMm / 2} mm), got ${radiusMm}`
    )
  }
}

/**
 * A geometry's type name, for an error message. `@jscad/modeling` values are plain
 * objects with no constructor to report, so this reads their shape instead.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describeGeometry(value) {
  if (geometries.geom3.isA(value)) return 'a 3D solid (geom3)'
  if (geometries.path2.isA(value)) return 'a 2D path (path2)'
  return typeof value === 'object' && value !== null ? 'an unrecognised geometry' : String(value)
}

/**
 * The segment count every curve used before `TODO/core-035` — `@jscad/modeling`'s own
 * cylinder default. Now the `legacy` resolution's fixed count: a record with no explicit
 * `segments` takes its count from the design resolution via {@link segmentsFor}, and
 * only a `legacy` document still gets this.
 */
export const DEFAULT_SEGMENTS = LEGACY_SEGMENTS

/**
 * Degrees to radians. V1 rotations were in degrees and the UI stays in degrees; the
 * registry is the single place that conversion happens (`Initial design.md` §5).
 *
 * @param {number} degrees
 * @returns {number} Radians.
 */
export function degToRad(degrees) {
  return (degrees * Math.PI) / 180
}


// ## The Sketch primitive (TODO/sketch-001)
//
// A sketch is a way of *defining* a primitive, the way a hexagon is a 6-sided profile
// extruded to a height: a stack of 2D slices whose closed outlines are Solid or Hole, and
// one extrusion method. `src/sketch/profile.js` owns the data model and every static
// check; this is the only place it becomes `@jscad/modeling` geometry.
//
// `center` is the body's **origin** — where the sketch plane sits — not a bounding-box
// centre as for the other primitives: a sketch drawn off-centre must stay where it was
// drawn. Angles arrive in degrees and are converted by `degToRad`, here and nowhere else.

const SKETCH_OP = 'primitive.sketch'

/**
 * What the placement ghost previews while a Sketch row is dragged: a thin 40 mm square,
 * which reads as "a flat plane goes here". Never committed by a drop — see `OpUi.editor`.
 */
const SKETCH_GHOST_DEFAULTS = Object.freeze({
  slices: [{ id: 's1', zMm: 0, profiles: [{ id: 'ghost', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 40, heightMm: 40 }] }],
  extrusion: { method: 'linear', heightMm: 0.5, twistDeg: 0, twistSteps: 1 },
})

/**
 * One slice's region as a `geom2`: closed outlines applied largest first — a solid
 * unioned in, a hole subtracted — so a solid drawn inside a hole survives as an island.
 *
 * @param {import('../../sketch/profile.js').Slice} slice
 * @param {import('./tessellation.js').TessellationPolicy | undefined} policy
 * @returns {Geom2}
 */
function sketchSliceGeom2(slice, policy) {
  const region = sketchRegionOf(slice, (profile) =>
    profile.kind === 'circle' ? segmentsFor(profile.radiusMm, policy) : 64
  )
  /** @type {Geom2 | null} */
  let shape = null
  for (const step of region.steps) {
    const outline = primitives.polygon({ points: step.pointsMm })
    if (step.role === 'solid') shape = shape === null ? outline : booleans.union(shape, outline)
    else if (shape !== null) shape = booleans.subtract(shape, outline)
  }
  if (shape === null || geometries.geom2.toSides(shape).length === 0) {
    throw new Error(`${SKETCH_OP}: the holes cover every solid outline, so there is nothing left to extrude`)
  }
  return shape
}

/**
 * Build a sketch body.
 *
 * @param {Record<string, any>} params
 * @param {import('./tessellation.js').TessellationPolicy | undefined} policy
 * @returns {Geom3}
 */
function buildSketch(params, policy) {
  // Untrusted input first (a document can arrive from a URL): a malformed shape is named,
  // never handed to the kernel. Then the static Done gate, so the kernel and the editor
  // refuse a sketch for the same reason in the same words.
  const shape = validateSketchParams(params)
  if (shape !== null) throw new Error(`${SKETCH_OP}: ${shape}`)
  const problem = sketchProblem(/** @type {any} */ (params))
  if (problem !== null) throw new Error(`${SKETCH_OP}: ${problem}`)

  /** @type {'linear' | 'revolve' | 'helical' | 'outline' | 'loft'} */
  const method = params.extrusion.method
  const options = { ...SKETCH_EXTRUSION_DEFAULTS[method], ...params.extrusion }
  const [first] = params.slices

  /** @type {Geom3} */
  let solid
  if (method === 'linear') {
    solid = extrusions.extrudeLinear(
      { height: options.heightMm, twistAngle: degToRad(options.twistDeg), twistSteps: options.twistSteps },
      sketchSliceGeom2(first, policy)
    )
  } else if (method === 'revolve') {
    // Sketch X is the radius and sketch Y the height; the axis is local Z.
    // `sketchProblem` has already refused an outline crossing x = 0, so upstream's
    // silent `overflow: 'cap'` never runs.
    solid = extrusions.extrudeRotate(
      { angle: degToRad(options.angleDeg), startAngle: degToRad(options.startAngleDeg), segments: options.segments },
      sketchSliceGeom2(first, policy)
    )
  } else if (method === 'helical') {
    solid = extrusions.extrudeHelical(
      {
        angle: degToRad(options.turns * 360),
        startAngle: 0,
        pitch: options.pitchMm,
        endOffset: options.endOffsetMm,
        segmentsPerRotation: options.segmentsPerTurn,
      },
      sketchSliceGeom2(first, policy)
    )
  } else if (method === 'outline') {
    // Each closed outline becomes a wall; Solid/Hole is deliberately ignored here — the
    // Extrude panel says so.
    const walls = sketchRegionOf(first, (profile) =>
      profile.kind === 'circle' ? segmentsFor(profile.radiusMm, policy) : 64
    ).steps.map((step) =>
      extrusions.extrudeRectangular(
        // `extrudeRectangular` expands the outline by `size` on *each* side, so the wall
        // it makes is twice `size` thick (read from extrudeRectangularGeom2.js, and
        // measured: 2 mm in gave a 4 mm wall). `wallMm` is the wall a user means.
        { size: options.wallMm / 2, height: options.heightMm },
        primitives.polygon({ points: step.pointsMm })
      )
    )
    solid = walls.length === 1 ? walls[0] : booleans.union(walls)
  } else {
    // Loft: one Solid outline per slice (sketchProblem enforced it), resampled so
    // `extrudeFromSlices` can wall them by vertex index.
    const rings = loftRings(
      params.slices.map((/** @type {import('../../sketch/profile.js').Slice} */ slice) => ({
        zMm: slice.zMm,
        pointsMm: sketchRegionOf(slice, (profile) =>
          profile.kind === 'circle' ? segmentsFor(profile.radiusMm, policy) : 64
        ).solids[0],
      })),
      options.resolution
    )
    const sections = rings.map((ring) =>
      extrusions.slice.fromPoints(ring.pointsMm.map((point) => [point[0], point[1], ring.zMm]))
    )
    solid = extrusions.extrudeFromSlices(
      { numberOfSlices: sections.length, capStart: true, capEnd: true, callback: (_t, index) => sections[index] },
      sections[0]
    )
  }

  // Linear/Revolve/Helical/Outline build from z = 0; the slice's own offset lifts them.
  // Loft's rings already sit at their own Z.
  const lift = method === 'loft' ? 0 : first.zMm
  const center = params.center ?? [0, 0, 0]
  return transforms.translate([center[0], center[1], center[2] + lift], solid)
}

/**
 * The op catalogue.
 *
 * @type {Readonly<Record<string, RegistryEntry>>}
 */
export const registry = Object.freeze({
  'primitive.cuboid': native(
    0,
    ({ params }) =>
      primitives.cuboid({
        size: [
          requirePositive(params.size?.[0], 'size[0]', 'primitive.cuboid'),
          requirePositive(params.size?.[1], 'size[1]', 'primitive.cuboid'),
          requirePositive(params.size?.[2], 'size[2]', 'primitive.cuboid'),
        ],
        center: params.center ?? [0, 0, 0],
      }),
    { label: 'Cube', defaults: { size: [40, 40, 40] } }
  ),

  'primitive.cylinder': native(
    0,
    ({ params, policy }) => {
      const radius = requirePositive(params.diameter, 'diameter', 'primitive.cylinder') / 2
      return primitives.cylinder({
        radius,
        height: requirePositive(params.height, 'height', 'primitive.cylinder'),
        segments: params.segments ?? segmentsFor(radius, policy),
        center: params.center ?? [0, 0, 0],
      })
    },
    { label: 'Cylinder', defaults: { diameter: 40, height: 50 } }
  ),

  // `@jscad/modeling` has no `cone` primitive either, and this is the same
  // composition situation `primitive.hexagon` below documents: the cone family is
  // reachable from `cylinderElliptic`, whose real V3 signature (confirmed by
  // reading node_modules, not from memory) is
  // `{ height, startRadius: [x, y], endRadius: [x, y], startAngle, endAngle,
  // segments, center }` — *not* the `radiusEnd` a cylinder-with-a-taper guess
  // would reach for. A point-topped cone is `endRadius: [0, 0]`; leaving
  // `topDiameter` set instead gives the truncated cone (frustum) a CAD user
  // expects the same row to produce, so it is one op with an optional param
  // rather than two near-identical registry entries.
  'primitive.cone': native(
    0,
    ({ params, policy }) => {
      const baseRadius = requirePositive(params.diameter, 'diameter', 'primitive.cone') / 2
      const topRadius =
        params.topDiameter === undefined || params.topDiameter === null
          ? 0
          : requireNonNegative(params.topDiameter, 'topDiameter', 'primitive.cone') / 2
      return primitives.cylinderElliptic({
        height: requirePositive(params.height, 'height', 'primitive.cone'),
        startRadius: [baseRadius, baseRadius],
        endRadius: [topRadius, topRadius],
        segments: params.segments ?? segmentsFor(Math.max(baseRadius, topRadius), policy),
        center: params.center ?? [0, 0, 0],
      })
    },
    { label: 'Cone', defaults: { diameter: 40, height: 50 } }
  ),

  // `@jscad/modeling` has no `hexagon` primitive. jscad-utils' `Parts.Hexagon` was a
  // 6-point CAG extruded to height, with a vertex on +X and flats at r*sqrt(3)/2 —
  // which is exactly a 6-segment cylinder in V3, phase included. Verified against V1
  // output in hardware.bolt.spec.js rather than assumed.
  'primitive.hexagon': native(
    0,
    ({ params }) =>
      primitives.cylinder({
        radius: requirePositive(params.diameter, 'diameter', 'primitive.hexagon') / 2,
        height: requirePositive(params.height, 'height', 'primitive.hexagon'),
        segments: 6,
        center: params.center ?? [0, 0, 0],
      }),
    { label: 'Hexagon', defaults: { diameter: 40, height: 20 } }
  ),

  // `@jscad/modeling` *does* export `triangle`, but it is a **2D** primitive — it
  // returns a `geom2` (a `sides` array), not the `geom3` every other entry here
  // produces and the only thing the mesh bridge can render. §6's "Triangle" base
  // creation row is a solid, so this composes the 2D triangle with
  // `extrusions.extrudeLinear`, exactly the CAG-extruded-to-height shape V1 used.
  // The 2D triangle is also built in the +X/+Y quadrant with a vertex at the
  // origin, unlike every other primitive here, so the prism is re-centred on its
  // own bounding box afterwards — otherwise a dropped triangle would land beside
  // the pointer rather than under it.
  'primitive.triangle': native(
    0,
    ({ params }) => {
      const sides = params.sides ?? [40, 40, 40]
      const profile = primitives.triangle({
        type: 'SSS',
        values: [
          requirePositive(sides[0], 'sides[0]', 'primitive.triangle'),
          requirePositive(sides[1], 'sides[1]', 'primitive.triangle'),
          requirePositive(sides[2], 'sides[2]', 'primitive.triangle'),
        ],
      })
      const prism = extrusions.extrudeLinear(
        { height: requirePositive(params.height, 'height', 'primitive.triangle') },
        profile
      )
      const [min, max] = measurements.measureBoundingBox(prism)
      const center = params.center ?? [0, 0, 0]
      return transforms.translate(
        [
          center[0] - (min[0] + max[0]) / 2,
          center[1] - (min[1] + max[1]) / 2,
          center[2] - (min[2] + max[2]) / 2,
        ],
        prism
      )
    },
    { label: 'Triangle', defaults: { sides: [45, 45, 45], height: 30 } }
  ),

  // No `tube` primitive upstream, and no extruded-ring helper either
  // (`extrudeRectangular` thickens a path outward, which is a different shape and
  // gets the wall thickness wrong on the inside). A tube is therefore the boolean
  // it has always been: the bore subtracted from the outer cylinder. The two end
  // caps are deliberately coplanar — checked against the kernel rather than
  // assumed, and V3's subtract handles them exactly (identical polygon count and
  // volume to an epsilon-lengthened bore), so no fudge factor is introduced.
  'primitive.tube': native(
    0,
    ({ params, policy }) => {
      const op = 'primitive.tube'
      const outerRadius = requirePositive(params.diameter, 'diameter', op) / 2
      const innerRadius = requirePositive(params.innerDiameter, 'innerDiameter', op) / 2
      if (innerRadius >= outerRadius) {
        throw new Error(
          `${op}: innerDiameter must be smaller than diameter, got ` +
            `${params.innerDiameter} against ${params.diameter}`
        )
      }
      const height = requirePositive(params.height, 'height', op)
      // One count for both walls, taken from the outer: the bore and the outside keep
      // matching vertices, as they always have.
      const segments = params.segments ?? segmentsFor(outerRadius, policy)
      const center = params.center ?? [0, 0, 0]
      return booleans.subtract(
        primitives.cylinder({ radius: outerRadius, height, segments, center }),
        primitives.cylinder({ radius: innerRadius, height, segments, center })
      )
    },
    { label: 'Tube', defaults: { diameter: 40, innerDiameter: 26, height: 50 } }
  ),

  'primitive.sketch': native(0, ({ params, policy }) => buildSketch(params, policy), {
    label: 'Sketch',
    defaults: SKETCH_GHOST_DEFAULTS,
    editor: 'sketch',
  }),

  'primitive.sphere': native(
    0,
    ({ params, policy }) => {
      const radius = requirePositive(params.diameter, 'diameter', 'primitive.sphere') / 2
      return primitives.sphere({
        radius,
        segments: params.segments ?? segmentsFor(radius, policy),
        center: params.center ?? [0, 0, 0],
      })
    },
    { label: 'Sphere', defaults: { diameter: 40 } }
  ),

  // ## The 2D profile layer (TODO/core-012)
  //
  // Two ops that deal in `geom2`, not `geom3`. They exist because §6's Kit-part rows
  // (Board, BoardFrame) are *composite* — a recipe expands into other registry ops
  // and builds nothing itself — and a rounded-rectangle slab has no expansion in
  // terms of the 3D vocabulary above. `primitive.triangle` faced the same
  // profile-then-extrude shape and solved it inside one native entry; that works for
  // a single primitive but not for BoardFrame, which has to subtract two profiles
  // **while they are still 2D** (see recipes/kit.boardFrame.js for why that ordering
  // is load-bearing). Splitting the profile and the extrude into two ops is what lets
  // `boolean.subtract` — already polymorphic over geom2/geom3 upstream — sit between
  // them as a plain record.
  //
  // They are deliberately **not** named `primitive.*`. `src/core/library.js` builds
  // the Library panel by filtering registry keys on that prefix and requires `ui`
  // metadata on every match, so a `primitive.roundedRectangle` would either break
  // that build or offer a flat `geom2` as a draggable body. A `profile.*` op is an
  // intermediate value, never a placeable one.
  'profile.roundedRectangle': native(0, ({ params, policy }) => {
    const op = 'profile.roundedRectangle'
    const size = params.size ?? []
    const width = requirePositive(size[0], 'size[0]', op)
    const length = requirePositive(size[1], 'size[1]', op)
    const roundRadius = requireNonNegative(params.roundRadius ?? 0, 'roundRadius', op)
    assertCornerRadiusFits(roundRadius, Math.min(width, length), 'roundRadius', op)
    return primitives.roundedRectangle({
      size: [width, length],
      roundRadius,
      // A full circle's count at the corner radius; `roundedRectangle` spends a quarter
      // of it on each corner, which is why every count is a multiple of 4.
      segments: params.segments ?? segmentsFor(roundRadius, policy),
      center: params.center ?? [0, 0],
    })
  }),

  // Extrudes a 2D profile up from `z = 0` to `z = height`, exactly as V1's
  // `CAG.extrude({ offset: [0, 0, thickness] })` did. The result is *not* re-centred
  // here: a recipe that wants the registry's usual centred-on-`center` convention
  // emits its own `transform.translate`, which keeps that placement visible in the
  // expansion the way `hardware.bolt.js` argues for.
  'profile.extrudeLinear': native(1, ({ params, inputs }) => {
    const op = 'profile.extrudeLinear'
    // `BuildArgs.inputs` is typed as solids because every other op consumes solids;
    // this is the one op whose operand is a profile, so it narrows here.
    const profile = /** @type {Geom2} */ (/** @type {unknown} */ (inputs[0]))
    if (!geometries.geom2.isA(profile)) {
      // Upstream `extrudeLinear` returns anything that is neither a geom2 nor a
      // path2 *unchanged*, so without this the op would silently pass a solid
      // through and the mistake would surface as wrong geometry much later.
      throw new Error(`${op}: operand must be a 2D profile (geom2), got ${describeGeometry(profile)}`)
    }
    return extrusions.extrudeLinear(
      { height: requirePositive(params.height, 'height', op) },
      profile
    )
  }),

  // TODO/render-002: `jscad-utils`' `label()` — a string as a thin extruded body.
  // A native op taking `center` like a primitive, so the Library places it by the same
  // `restingCenter` arithmetic. See text.js for why this is not `profile.extrudeLinear`.
  'text.label': native(0, ({ params }) => label(params), {
    label: 'Text',
    defaults: { text: 'Label', size: 10, strokeWidth: 1.5, height: 2 },
  }),

  // ## A transform preserves what it is handed (TODO/core-024)
  //
  // Both `transform.*` ops map their geometry function over a group's parts and
  // holes rather than collapsing it first, so **a bolt you moved is still a
  // bolt**: its `head`, `thread` and `tap` are still addressable afterwards.
  //
  // This is not a convenience. Every composite a user places commits a trailing
  // `transform.translate` to put it where they dropped it (`src/core/library.js`'s
  // `recordsForDrop`), and the gizmo commits another every time they drag it — so
  // before this, no composite a user could actually *see* had any parts left to
  // name, and `boolean.subtract(shell, { id: bolt, pieces: 'tap' })` had nothing to
  // resolve against. It also matches V1, whose `Group.translate` mapped over parts,
  // which is why `bolt.combine('tap')` works after a `.snap()` in the real corpus.
  //
  // They are `rawOperands` (to see the group at all) but **not** `subPartOperands`
  // — see `wholeGroupNative`.
  'transform.translate': wholeGroupNative(1, ({ params, inputs }) =>
    mapGeometry(soleOperand(inputs).value, (geometry) =>
      transforms.translate(/** @type {Vec3Mm} */ (params.vector), geometry)
    )
  ),

  // Degrees in `params`, radians here — this module is the single place that
  // conversion happens (see the unit-boundary note at the top of the file), so
  // no component and no recipe ever handles a radian.
  //
  // `center` is what makes this usable as a *gizmo* rotate rather than a bare
  // kernel call: `transforms.rotate` turns about the world origin, so rotating a
  // body sitting 300 mm out would fling it across the scene instead of turning
  // it on the spot. Translating to the centre, rotating, and translating back is
  // the transform a user means when they drag a rotate ring.
  'transform.rotate': wholeGroupNative(1, ({ params, inputs }) => {
    const op = 'transform.rotate'
    const angles = params.angles ?? [0, 0, 0]
    if (!Array.isArray(angles) || angles.length !== 3 || !angles.every(Number.isFinite)) {
      throw new Error(`${op}: angles must be three finite degree values, got ${JSON.stringify(angles)}`)
    }
    const center = params.center ?? [0, 0, 0]
    if (!Array.isArray(center) || center.length !== 3 || !center.every(Number.isFinite)) {
      throw new Error(`${op}: center must be three finite millimetre values`)
    }
    // One transform, applied to every part — a turn about the *group's* centre,
    // not each part turning about its own. See `mapGeometry`.
    return mapGeometry(soleOperand(inputs).value, (geometry) => {
      const turned = transforms.rotate(
        [degToRad(angles[0]), degToRad(angles[1]), degToRad(angles[2])],
        transforms.translate(
          /** @type {Vec3Mm} */ ([-center[0], -center[1], -center[2]]),
          geometry
        )
      )
      return transforms.translate(/** @type {Vec3Mm} */ (center), turned)
    })
  }),

  // ## Mirror makes a second body; it does not edit the first (TODO/core-028)
  //
  // The geometry is `group.js`'s `mirror` — a reflection across the axis-aligned
  // plane through `params.pointMm` (default: the body's own bounding-box centre),
  // whose normal is `params.axis`. `wholeGroupNative` for the reason the two
  // transforms above give: a mirrored bolt must still be a bolt, and honouring a
  // `pieces` address would silently drop the parts it did not name.
  //
  // **The document semantics are the real decision, and they need nothing from
  // this entry.** Every surveyed real use (`cableTie2 = cableTie.mirrorY()`) keeps
  // the original and gains a reflected copy — creation-shaped, two independent
  // bodies afterwards. `modify.*`/`transform.*` are the nearest precedent and the
  // *wrong* one: their callers append with `supersedes`, which continues the
  // operand's lineage so the original stops being reported. A mirror record is
  // appended with **`target` and neither `supersedes` nor `consumes`**:
  //
  //   { id, op: 'transform.mirror', name, target: document.currentIdOf(source),
  //     params: { axis, pointMm?, rotation? } }
  //
  // and `document.js`'s `append` already makes any record without those two fields
  // its own new lineage root — the same default every primitive and a `consumes`-
  // bearing boolean rely on. So `operandCount: 1` alone suffices and **no registry
  // marker was added**, deliberately:
  //
  // - `target` *is* the "read another body's current geometry" reference. It goes
  //   through the fold's own operand resolution, the deleted-body guard in
  //   `append`, `dependents.js`'s impact check and `referencedIdsOf` — a
  //   `params.sourceId` would bypass all four and hand `build` nothing to reflect.
  // - Lineage is chosen by whoever *writes* the record (`supersedes`/`consumes` are
  //   record fields the kernel fold never reads), so a marker here would be read by
  //   nothing that decides it. `operandCount` already answers the one question the
  //   registry is asked about operands — is the tool enabled for this selection —
  //   and the answer for Mirror is "exactly one", same as Enlarge.
  // - The copy is a **snapshot**: `target` names the source's terminal *at commit
  //   time*, so moving the original afterwards does not drag the copy with it —
  //   V1's `mirrorY()` returned a new, unlinked solid too.
  //
  // `params.rotation`, if present, is not read here — like a transform record's, it
  // is state carried for `document.js`'s `Body.rotationDeg`. A command that mirrors
  // a turned body should set it to `group.js`'s `mirrorRotationDeg(source's
  // rotationDeg, axis)`, or the copy's dimension lines measure its shadow.
  'transform.mirror': wholeGroupNative(1, ({ params, inputs }) =>
    mirror(soleOperand(inputs).value, params.axis, params.pointMm)
  ),

  // ## A colour override changes nothing about the geometry (TODO/data-005)
  //
  // `src/core/document.js`'s `setColorOverride` appends this record the same way
  // `transform.translate`/`rotate` append theirs — `target`/`supersedes` both set
  // to the lineage's current terminal, unnamed (see `src/core/transform.js`'s "Why
  // transform records are unnamed") — but unlike a transform it does not move
  // anything: `colorOverride`/`colorAlpha`/`subPart` are metadata the kernel fold
  // is deliberately incurious about, exactly as it already is about `hidden` and
  // `color`. `wholeGroupNative` is still the right shape rather than plain
  // `native`: a `native` entry would flatten a composite's `Group` to a solid via
  // `combine()` on the way in, discarding the very part breakdown a per-part
  // override needs `Body.geometry` to still have afterwards. So the operand
  // arrives and leaves whole, byte-identical — the override lives entirely on the
  // record, for `document.js`'s `bodies()` to read back, not on the geometry.
  'style.recolor': wholeGroupNative(1, ({ inputs }) => soleOperand(inputs).value),

  // ## Removing one part from a placed group (TODO/ui-051)
  //
  // `src/core/document.js`'s `removePart` appends this over the body's current
  // terminal (`target`/`supersedes`, unnamed — the body survives, its lineage just
  // continues), exactly as a recolour or a transform does. Unlike those it really
  // changes the geometry: the group comes back without `params.part`, so every
  // consumer (bounds, export, a later boolean, the parts list) sees the same thing
  // with no special case. `wholeGroupNative` for the reason `style.recolor` above
  // gives — a plain `native` entry would flatten the group before it arrived, and
  // there would be no part left to take out. Validation lives in `group.js`'s
  // `removePart`.
  'group.removePart': wholeGroupNative(1, ({ params, inputs }) =>
    removePart(soleOperand(inputs).value, params.part)
  ),

  // ## The three booleans, and why they may name a composite's parts
  //
  // All three are `subPartNative` (TODO/core-024): an operand may arrive as
  // `{ id, pieces }`, and the fold hands `build` the union of just those named
  // parts — still one flat solid, so nothing below changes. The decision and the
  // corpus evidence behind it live on `subPartNative` itself; what matters here is
  // that it is the *family* rule, not a `subtract`-only special case, because the
  // real call sites union port clearances as readily as they subtract tap holes.
  'boolean.union': subPartNative('2+', ({ inputs }) => booleans.union(inputs)),

  'boolean.subtract': subPartNative('2+', ({ inputs }) => booleans.subtract(inputs)),

  // The third of §6's Operation rows (TODO/ui-014). `subtract` and `intersect`
  // are both order-dependent in the same way — `inputs[0]` is the base, and the
  // fold puts `target` there before any `operands` (see `index.js`'s
  // `inputRefs`) — which is what lets the Operations toolbar map "first
  // selected" onto "base" without the document layer knowing about selection.
  'boolean.intersect': subPartNative('2+', ({ inputs }) => booleans.intersect(inputs)),

  // The fourth Operations-toolbar button (TODO/ui-015), placed beside the booleans
  // rather than beside `group.snap`/`group.align` below despite the shared `group.`
  // prefix: its *shape* matches the booleans exactly — `2+` operands, each already
  // flattened to a plain `Geom3` by the fold before `build` ever sees it — while
  // `group.snap`/`align`'s `rawOperands` machinery (un-combined `ResolvedOperand`s,
  // so a bolt can be snapped by its head alone) is irrelevant here.
  //
  // Unlike a boolean, nothing is discarded: every operand becomes its own named
  // part of a new Group, addressable later (TODO/ui-016) rather than merged away.
  // `params.names` supplies one display name per operand, in the same order as
  // `inputs` — the toolbar builds that array from each operand's current body name
  // (`OperationsToolbar.vue`'s `run()`), so a grouped part reads as "Cube 1" rather
  // than an opaque record id once `ui-016` surfaces a per-part breadcrumb.
  //
  // Deliberately **not** `rawOperands`: a composite operand (a placed
  // `hardware.bolt`, say) arrives here with its own internal parts already
  // collapsed into one solid by `toGeom3`, so grouping two composites does not
  // preserve either one's own sub-structure inside the new outer group. That is a
  // real, stated scope limit, not an oversight — preserving a *nested* composite's
  // parts would need `rawOperands` and `add()`'s `subpartPrefix` option
  // (`group.js:398-420`, already built for exactly this), but wiring that through
  // has no consumer until a UI can address a doubly-nested part, which is
  // `ui-016`-or-later work. Building it here would be exactly the premature
  // generality CLAUDE.md warns against.
  'group.assemble': native('2+', ({ params, inputs }) => {
    const op = 'group.assemble'
    const names = params.names
    if (!Array.isArray(names) || names.length !== inputs.length) {
      throw new Error(
        `${op}: expected one name per operand (${inputs.length}), got ${JSON.stringify(names)}`
      )
    }
    // `add()` below assigns `parts[partName] = object` by plain assignment — a
    // duplicate name would silently overwrite an earlier part instead of erroring,
    // which is the "wrong geometry with no error" failure class `index.js`'s own
    // `normalizeRef` comment already calls out for a different case. Sibling
    // bodies can't collide in practice (`document.js`'s `nextName` counter
    // guarantees "Cube 1"/"Cube 2"), but this op should not *trust* that
    // invariant from outside its own module.
    if (new Set(names).size !== names.length) {
      throw new Error(`${op}: operand names must be unique, got ${JSON.stringify(names)}`)
    }
    let group = createGroup()
    inputs.forEach((geometry, index) => {
      group = add(group, geometry, names[index])
    })
    return group
  }),

  // ## Positioning one placed item against another (TODO/core-013)
  //
  // The arithmetic under both of these is `core-001`'s, already ported and covered
  // by `group.spec.js`; these entries are wiring, and deliberately contain no maths
  // of their own. What they add is *reach*: until now `snap`/`align` could only be
  // called as pure functions inside a single recipe's own expansion (which is all
  // `kit.anchor` does), because the fold flattened every operand before any op saw
  // it. They are `rawOperands` entries for that reason — see that flag on
  // `RegistryEntry`, and `index.js`'s `normalizeRef` for the `{ id, pieces }`
  // address a record uses to name one part of another placed item.
  //
  // A survey of 1,617 real `.snap(`/`.align(` calls across 109 of the user's own
  // `.jscad` projects backs the shape of these two entries, and every test case in
  // `registry.spec.js` reproduces a cited call site rather than an invented one;
  // `recipes/__fixtures__/group-snap-align.real-usage.md` is the table.
  //
  // Two things follow V1 exactly and are worth stating, because both look like bugs
  // from the outside:
  //
  //  1. **The named pieces drive the offset; the whole group still moves.** V1's
  //     `Group.prototype.snap(part, ...)` computes from `combine(part)` and then
  //     `map`s the translate over *every* part. A bolt snapped by its head brings
  //     its thread and tap along — that is the entire point of a group.
  //  2. **The result is still a group.** `.snap(...).snap(...)` is the dominant idiom
  //     in the survey, and it only works if the first result's parts are still there
  //     to be named by the second.
  //
  // A bare solid (a placed primitive, not a composite) is not a special case: it has
  // no parts to name, and `calcSnap`/`calcCenterWith` already take `Geom3 | Group`
  // uniformly, so it falls through the same branch minus the group bookkeeping.
  'group.snap': rawNative('2+', ({ params, inputs }) => {
    const op = 'group.snap'
    const [moving, reference] = requireTwoOperands(inputs, op)
    const axes = requireAxes(params.axes, op)
    if (isGroup(moving.value)) {
      return snap(
        moving.value,
        /** @type {string} */ (moving.pieces),
        referenceOf(reference),
        axes,
        params.orientation,
        params.deltaMm
      )
    }
    return transforms.translate(
      calcSnap(moving.value, referenceOf(reference), axes, params.orientation, params.deltaMm),
      moving.value
    )
  }),

  // Same shape as `group.snap`, one argument shorter: V1's `align` has no
  // orientation because it always centres. `deltaMm` may be a scalar or a per-axis
  // vector, exactly as `calcCenterWith` takes it.
  'group.align': rawNative('2+', ({ params, inputs }) => {
    const op = 'group.align'
    const [moving, reference] = requireTwoOperands(inputs, op)
    const axes = requireAxes(params.axes, op)
    if (isGroup(moving.value)) {
      return align(
        moving.value,
        /** @type {string} */ (moving.pieces),
        referenceOf(reference),
        axes,
        params.deltaMm
      )
    }
    return transforms.translate(
      calcCenterWith(moving.value, axes, referenceOf(reference), params.deltaMm),
      moving.value
    )
  }),

  // Rim ops, not edge ops. These round or bevel the whole rim of one axis-aligned
  // face — exactly what V1's `.fillet()`/`.chamfer()` did, and the most `@jscad/
  // modeling` can support. See fillet.js and the TODO/core-003 addendum in
  // docs/decisions/geometry-kernel.md. `orientation` is a face name, not an axis
  // vector, so no angle conversion happens here.
  'modify.filletRim': native(1, ({ params, inputs, policy }) =>
    filletRim(
      {
        radius: params.radius,
        orientation: params.orientation ?? 'z+',
        segments: params.segments ?? rimSlicesFor(Number(params.radius) || 0, policy),
      },
      inputs[0]
    )
  ),

  'modify.chamferRim': native(1, ({ params, inputs }) =>
    chamferRim({ radius: params.radius, orientation: params.orientation ?? 'z+' }, inputs[0])
  ),

  // ## Resizing and cutting one placed item (TODO/core-019)
  //
  // Three more `jscad-utils` ports, all `operandCount: 1` — they edit one existing
  // solid, so the UI's creation-vs-operation rule keeps them out of the Library panel
  // (which reads `primitive.*` alone) and disables them unless exactly one object is
  // selected. Like the rim pair above, the arithmetic lives in `group.js` and is
  // diffed there against measured V1 output; these entries are dispatch only.
  //
  // No `ui` metadata, and no UI task claims them yet — stated rather than left to be
  // discovered, the same way the `kit.*` trio below says so. A future control that
  // exposes `modify.bisect` should append its record with `supersedes: <original id>`:
  // one body goes in and one two-part group comes out, which is the same "same object,
  // new geometry" lineage `transform.*` already established, not the `consumes` shape
  // a boolean uses.

  // `deltaMm` here is a per-axis `[x, y, z]` vector — deliberately *not* the scalar
  // that `group.snap`'s identically-named param takes. Both are millimetres; only the
  // shape differs, and `enlarge` throws by name rather than coercing a scalar.
  'modify.enlarge': native(1, ({ params, inputs }) => enlarge(inputs[0], params.deltaMm)),

  // `sizeMm` is an absolute target size, not a delta; a `0` on an axis means "leave
  // this one alone" (V1's own sentinel). See `fit`'s doc comment for the aspect-ratio
  // quirk a zero axis introduces.
  'modify.fit': native(1, ({ params, inputs }) =>
    fit(inputs[0], params.sizeMm, params.keepAspectRatio ?? false)
  ),

  // Returns a two-part `Group` (`negative`, `positive`), not a solid — which is why
  // `KernelGeometry` admits a `Group` at all.
  //
  // `angleDeg`/`rotateAxis`/`rotateOffsetMm` (TODO/core-021) tilt the cut plane away
  // from perpendicular; all three are optional and omitting them is exactly the
  // straight cut, down to the float. Two defaults are worth knowing before writing a
  // record: an omitted `rotateAxis` follows V1's per-cut-axis table (`x→y`, `y→x`,
  // `z→x`), and an omitted `rotateOffsetMm` hinges on the third axis's **centre**, not
  // on zero. See `bisect`'s doc comment for both, and for why a `y` cut names its
  // halves the opposite way round from an `x` or `z` one.
  'modify.bisect': native(1, ({ params, inputs }) =>
    bisect(
      inputs[0],
      params.axis,
      params.offsetMm,
      params.angleDeg,
      params.rotateAxis,
      params.rotateOffsetMm
    )
  ),

  // TODO/ui-030: the four entries below are the first composites to carry `ui`
  // metadata, which is the whole of what puts them in the Library panel's new
  // Hardware section — `src/core/library.js` reads the registry, so nothing there
  // or in `LibraryPanel.vue` names a bolt.
  //
  // Each `defaults` picks **one** representative size out of that part's own
  // table, because a row is a starting point a user then edits, not a catalogue
  // browser: `m10 hex`/20 mm is the bolt `hardware.bolt.spec.js` diffs against V1,
  // `m4` the only metric nut in `nut-specs.js`, `m6` a mid metric washer from
  // core-011's ISO-7089 port, and `608` the skate bearing core-023/core-003
  // measured. Every `fit` is `'loose'` — V1's own and only stated default
  // (`Hardware.Bolt`'s `fit = fit || 'loose'`) — rather than three different
  // judgement calls. `hardware.nut` has no default fit of its own (see its module
  // doc) so naming one here is required, not decorative.
  'hardware.bolt': composite(0, bolt, {
    label: 'Bolt',
    defaults: { spec: 'm10 hex', length: 20, fit: 'loose' },
  }),

  // TODO/core-010: single-record expansion — Hardware.Nut returns one bare CSG in
  // V1, not a Group, so there is no second part to snap this one against. See
  // recipes/hardware.nut.js's module doc for the V1→V3 centring difference this
  // makes explicit.
  'hardware.nut': composite(0, nut, { label: 'Nut', defaults: { spec: 'm4', fit: 'loose' } }),

  // TODO/core-011: `Hardware.Washer` returns a two-part Group in V1 — `washer`
  // always, `clearance` only `if (fit)`. See recipes/hardware.washer.js's module doc
  // for the V1→V3 hidden-clearance divergence this makes explicit.
  'hardware.washer': composite(0, washer, {
    label: 'Washer',
    defaults: { spec: 'm6', fit: 'loose' },
  }),

  // TODO/core-023: no V1 source exists at all — `jscad-hardware` has no `Bearing`
  // factory (`docs/decisions/geometry-kernel.md`, Finding 2). One-record expansion,
  // simpler than washer: no `fit`/conditional second part. See
  // recipes/hardware.bearing.js's module doc.
  'hardware.bearing': composite(0, bearing, { label: 'Bearing', defaults: { spec: '608' } }),

  // TODO/core-027: `Hardware.Screw.PanHead`/`.FlatHead` — a Group of head + thread
  // (+ a hidden headClearSpace when `clearLength` is given). Not a bolt variant: no
  // fit/tap solids, and FlatHead's head is a cone, not a countersink cut. See
  // recipes/hardware.screw.js's module doc.
  //
  // Deliberately **no `ui` block**: `library.js` builds a Library row from any 0-operand
  // entry that has one, and a row is a new user-visible control — which needs its own
  // e2e spec and docs page, neither of which this kernel-only task owns. Same as
  // hardware.nut/washer/bearing sat until `ui-030`. The follow-up adds `ui: { label:
  // 'Screw', defaults: { spec: 'm4', length: 12, head: 'PanHead' } }` and a ROW_ORDER
  // slot. Its Inspector dropdowns (PARAM_SCHEMAS below) don't depend on `ui`.
  'hardware.screw': composite(0, screw),

  // TODO/core-012: §6's three Kit-part rows. All three expand through the
  // `profile.*` pair above rather than building geometry themselves; `kit.anchor` is
  // the one recipe in the project that touches `@jscad/modeling` at all, and only to
  // measure throwaway probe geometry for a snap it then bakes in as a number (see
  // recipes/kit.anchor.js). TODO/ui-031 gave all three `ui` metadata, which was
  // indeed the only thing standing between them and the panel — no recipe, fold or
  // component change was needed, exactly as the note here predicted.
  //
  // `kit.board` and `kit.boardFrame` are the two entries in the whole catalogue
  // whose recipes have **required** params with no default of their own
  // (`cornerRadius`; the frame's four sizes), so `defaults` here is load-bearing
  // rather than a convenience: without it the row would throw the instant it was
  // picked up. The numbers are core-012's own spec fixtures — a representative
  // starting board a user then edits, the same way `hardware.bolt` names one spec
  // out of a table rather than offering the table.
  'kit.board': composite(0, board, {
    label: 'Board',
    defaults: { width: 40, height: 30, cornerRadius: 3 },
  }),
  'kit.boardFrame': composite(0, boardFrame, {
    label: 'Board Frame',
    defaults: { outerWidth: 40, outerHeight: 30, innerWidth: 30, innerHeight: 20, cornerRadius: 3 },
  }),
  // V1's own `Anchor(width = 10, height = 10)` defaults, named here rather than
  // left implicit, so the Inspector shows what the row actually placed.
  'kit.anchor': composite(0, anchor, { label: 'Anchor', defaults: { width: 10, height: 10 } }),

  // TODO/core-014: the catalogue's largest recipe — a whole Raspberry Pi board, every
  // connector, with one `model` param picking the revision (2/3/4/5) the way
  // `hardware.bolt`'s `spec` picks a size. Like `kit.anchor` it measures throwaway
  // probe geometry to resolve V1's ~120 chained snap/align/midlineTo calls, and bakes
  // each result in as a plain translate; see recipes/raspberrypi.bplus.js's module
  // doc for the two deliberate narrowings from V1 (no `dimCheck` rulers, and mounting
  // holes as hidden parts rather than subtracted `group.holes`).
  //
  // TODO/ui-031: **one row with a `model` choice on it**, not four rows. That is
  // `core-014a`'s own "one factory, not one draggable per revision" decision carried
  // into the UI, and the alternative was weighed rather than assumed — four Pi rows
  // plus five camera rows would turn a 26-row panel into a 33-row one in which nine
  // of the rows are the same two parts, and would bake a revision list into the
  // panel that the recipe is supposed to own.
  //
  // The default is **4**, not the recipe's own `DEFAULT_MODEL` of 2. Those are
  // answering different questions: the recipe's default is V1's (`BPlus(model = 2)`,
  // a 2014 board) and has to stay put or every existing document line changes
  // meaning, while a Library row is a starting point for new work, where the
  // current-generation board is the honest guess. Same reason `hardware.nut`'s row
  // names a `fit` the recipe itself has no default for.
  'raspberrypi.bplus': composite(0, bplus, {
    label: 'Raspberry Pi',
    defaults: { model: 4 },
    choice: modelChoice(BPLUS_MODELS, {
      2: 'Pi 2 / B+',
      3: 'Pi 3',
      4: 'Pi 4',
      5: 'Pi 5',
    }),
  }),

  // TODO/core-015: the five Raspberry Pi camera boards — v1, v2, v3, the official HQ
  // and Arducam's HQ clone — behind one `model` param, the same shape as `bplus` above
  // and for the same reason. Same probe-and-bake mechanism too; what is new is that
  // some parts are derived from *another part's record* rather than from a primitive
  // (`modify.enlarge` for the `-nogo` keep-outs, `transform.rotate` for the HQ
  // variants' three copied corner holes), which the fold already supports and no new
  // op was needed for.
  //
  // TODO/ui-031: the second and last row with a choice, same shape as `bplus` above.
  // Its default *is* the recipe's own `v3` here, because that default was already a
  // port decision rather than a carried-over V1 constant (V1 ships five separate
  // factories with no shared entry point) and was already chosen as "the
  // current-generation standard camera" — the same question a Library row asks.
  'raspberrypi.cameraModule': composite(0, cameraModule, {
    label: 'Camera Module',
    defaults: { model: 'v3' },
    choice: modelChoice(CAMERA_MODULE_MODELS, {
      v1: 'Camera v1',
      v2: 'Camera v2',
      v3: 'Camera v3',
      hq: 'HQ Camera',
      'arducam-hq': 'Arducam HQ',
    }),
  }),

  // TODO/core-016: the two Raspberry Pi touch displays. These are the first recipes to
  // hit `docs/decisions/composite-recipe-geometry.md`'s Family B requirement — V1's
  // factories take the *board* as a required argument — and the decision it records is
  // to drop it. Both expand standalone in their own lens-corner frame; V1's closing
  // `align('piMountingPad1'/'piMountingPost1', rpi.parts.hole1, 'xy')` +
  // `snap(..., rpi.parts.mb, 'z', 'outside+')` is not geometry but an assembly step,
  // and it is already shipped as ui-026's Snap/Align control, sub-part addressed as
  // `{ id, pieces: 'piMountingPad1' }`. Each pad and post is therefore its own named
  // part rather than one merged solid, so ui-016's pick-depth can reach it.
  //
  // See raspberrypi.touchScreen2.js's NO_GO_POWER_MM for the one call that genuinely
  // mixed frames, and what dropping the board narrows about it.
  //
  // TODO/ui-031 gave both `ui` metadata. `touchScreen2` keeps V1's own factory name
  // rather than the product name its module doc quotes: that doc calls it "the
  // HyperPixel 4 rectangular display", which is also what `hyperPixel4Rectangular`
  // below is called, and the two are measurably different parts (143 x 91 x 15 mm
  // against 98 x 58 x 24). Labelling both "HyperPixel 4" would put two
  // indistinguishable rows in the panel, so the ambiguity is left where V1 put it
  // instead of being resolved by guess.
  'raspberrypi.touchDisplay7inch': composite(0, touchDisplay7inch, {
    label: '7-inch Touch Display',
    defaults: {},
  }),
  'raspberrypi.touchScreen2': composite(0, touchScreen2, {
    label: 'Touchscreen 2',
    defaults: {},
  }),

  // TODO/core-017: the four small displays. Family B again — every one of these takes
  // an external board in V1 and every one of them drops it here — but with a wrinkle
  // the touch pair did not have: `PiTFT22`/`PiTFT24` never *use* the board, they
  // forward it into `Hat(piMotherBoard, options)`, so dropping it means calling a
  // standalone Hat. That expansion lives in recipes/raspberrypi.hat.js and is shared
  // by both; TODO/core-018 should register it as `raspberrypi.hat` rather than
  // re-porting `hat.js` (see that module's header).
  //
  // These are also the first recipes to use `boolean.*` and `modify.*` ops *inside*
  // an expansion rather than as document-level operators. Two things came out of
  // that, both written up in recipes/raspberrypi.miniPiTFT.js's module doc: a
  // composite cannot address a sibling record's sub-part except through
  // `group.snap`/`group.align` (an op-level rule, not a nesting one), so V1's chained
  // `.bisect().parts.negative` ports as the same half-space subtraction `bisect`
  // itself performs; and `modify.chamferRim` had to learn V1's negative-radius
  // semantics, because `miniPiTFT`'s display clearance is an outward flare rather
  // than a bevel. All four gained `ui` metadata in TODO/ui-031.
  'raspberrypi.miniPiTFT': composite(0, miniPiTFT, { label: 'Mini PiTFT', defaults: {} }),
  'raspberrypi.piTFT22': composite(0, piTFT22, { label: 'PiTFT 2.2', defaults: {} }),
  'raspberrypi.piTFT24': composite(0, piTFT24, { label: 'PiTFT 2.4', defaults: {} }),
  'raspberrypi.hyperPixel4Rectangular': composite(0, hyperPixel4Rectangular, {
    label: 'HyperPixel 4',
    defaults: {},
  }),

  // TODO/core-018: the four accessories. `raspberrypi.hat` is the standalone Hat
  // expansion core-017 already shipped as a module because PiTFT22/PiTFT24 needed it
  // first — registered here rather than re-ported, so all three ops are the same
  // geometry from the same call. The other three are new, and each contributes
  // something the catalogue did not have:
  //
  // - `activeCoolingFan` is the only recipe with nothing to measure. Every offset is
  //   a literal constant, so it expands to a plain boolean chain with no probe.
  // - `hatStandoff` takes its two *diameters* from core-014's tables/rpi-parts.js and
  //   neither of its heights, which V1 passes explicitly (10 and 13, not the table's
  //   1.5 and 4). That split is asserted in its spec because taking the table
  //   wholesale builds a plausible-looking standoff that is 8.5mm too short.
  // - `spacer` is the Family B recipe whose board parameter V1 *itself* probes away
  //   (`spacer.js:52`), the first to reuse a sibling composite (`kit.boardFrame`) as
  //   a record rather than re-port it, and the only one with real trigonometry. It
  //   also found the catalogue's sharpest V1 quirk: `CAG.roundedRectangle` silently
  //   clamps a too-large corner radius rather than rejecting it, so the brace V1
  //   asks to round at 3.1 is really rounded at 3.0. See rpi-recipe-kit.js's
  //   `clampCornerRadius`, and that recipe's module doc for the rest.
  //
  // All four gained `ui` metadata in TODO/ui-031.
  'raspberrypi.activeCoolingFan': composite(0, activeCoolingFan, {
    label: 'Active Cooling Fan',
    defaults: {},
  }),
  'raspberrypi.hat': composite(0, hat, { label: 'HAT', defaults: {} }),
  'raspberrypi.hatStandoff': composite(0, hatStandoff, { label: 'HAT Standoff', defaults: {} }),
  'raspberrypi.spacer': composite(0, spacer, { label: 'Spacer', defaults: {} }),

  // Deliberately absent, and not an oversight — TODO/core-003 spiked this:
  //
  // - `modify.fillet`/`modify.chamfer` on a *selected edge*. Not viable on this
  //   kernel: V3 has no fillet op, cannot erode a solid (`expand` throws on a
  //   negative delta), and leaves boolean results as polygon soup with no shared-edge
  //   topology to name an edge with. Registering the rim ops above under the bare
  //   names `fillet`/`chamfer` would misrepresent what they do to the UI's tool
  //   enablement, which is why they carry `Rim` in their names.
  //
  // `hardware.bearing` was in this same "spiked, not yet registered" state as of
  // core-003 — see `docs/decisions/geometry-kernel.md` Finding 2 — but TODO/core-023
  // supplied the missing spec table and it is now registered above, alongside
  // `hardware.bolt`/`nut`/`washer`.
})

/**
 * Look up an op, failing by name rather than returning `undefined` — a mistyped or
 * malicious `op` in an NDJSON document must be a loud error, never a silent skip.
 *
 * @param {string} op
 * @param {Readonly<Record<string, RegistryEntry>>} [ops] Catalogue to look up
 *   against; defaults to the real one. A caller evaluating against a different
 *   registry (`evaluate`'s `options.registry` — a test's fake registry, or a
 *   future document-scoped registry) must pass that same registry here, or this
 *   would report one of its ops as unknown regardless of what `ops` it was found
 *   in a moment earlier.
 * @returns {RegistryEntry}
 */
export function getEntry(op, ops = registry) {
  const entry = ops[op]
  if (!entry) {
    throw new Error(`unknown op "${op}" — not in the kernel registry`)
  }
  return entry
}

/**
 * Whether an op can run against a selection of exactly `count` objects.
 *
 * This is the predicate the UI's tool-enablement logic calls: a creation tool is
 * offered when nothing is selected, a single-object tool only at exactly one, a
 * boolean only at two or more. Answering from the registry is what stops the
 * creation-vs-operation rule from being re-implemented (and drifting) in the UI.
 *
 * @param {string} op
 * @param {number} count Number of currently selected operands.
 * @param {Readonly<Record<string, RegistryEntry>>} [ops] See {@link getEntry}.
 * @returns {boolean}
 */
export function acceptsOperandCount(op, count, ops = registry) {
  const { operandCount } = getEntry(op, ops)
  return operandCount === '2+' ? count >= 2 : count === operandCount
}

/**
 * Throw unless `count` operands satisfy the op's `operandCount`.
 *
 * @param {string} op
 * @param {number} count
 * @param {Readonly<Record<string, RegistryEntry>>} [ops] See {@link getEntry}.
 * @returns {void}
 */
export function assertOperandCount(op, count, ops = registry) {
  if (!acceptsOperandCount(op, count, ops)) {
    const { operandCount } = getEntry(op, ops)
    throw new Error(
      `${op}: expected ${operandCount === '2+' ? '2 or more' : operandCount} operand(s), got ${count}`
    )
  }
}

// ## Editable composite params (TODO/ui-052)
//
// `OpUiChoice` above answers "which variant do you want **before** dragging?" for two
// recipes. This answers the same question **after** placement, for every param of every
// composite that has a real catalogue behind it — a Pi's `model`, a bolt's `spec`/`fit`/
// `length` — so the Inspector can render a dropdown instead of a read-only text field.
//
// The same "derived, not hand-copied" rule `modelChoice` follows: every option list is
// read off the recipe's own exported list or the size table the recipe itself looks the
// value up in, so a new bolt spec appears in the dropdown the moment it is in the table,
// and a dropdown can never offer a value the recipe then throws on.
//
// **A composite with no entry here stays read-only** — the fail-safe default. A recipe
// whose params nobody has described is not guessed at: `kit.*` (plain sizes) and the
// fixed-shape `raspberrypi.*` accessories are absent on purpose until someone asks.

/**
 * @typedef {object} EnumParamSchema
 * @property {'enum'} kind
 * @property {string} label What the Inspector calls the field, e.g. `"Model"`.
 * @property {readonly OpUiOption[]} options Every value the recipe accepts **given the
 *   other params** — a bolt's `fit` list is read from the chosen `spec`'s own table row.
 */

/**
 * @typedef {object} NumberParamSchema
 * @property {'number'} kind
 * @property {string} label
 * @property {'mm' | ''} unit
 * @property {number} [exclusiveMin] Values must be strictly greater than this — every
 *   composite length here is a positive size.
 * @property {number} [default] The recipe's own default, for a param the record does not
 *   carry — a Pi placed from the Library has no `clearance` field, yet the recipe used 5.
 */

/** @typedef {EnumParamSchema | NumberParamSchema} ParamSchema */

/**
 * The size tables a schema reads its option lists from — the same objects
 * `index.js`'s `DEFAULT_TABLES` hands a recipe, so a dropdown and the recipe that will
 * receive its value always agree. A test passes a fake (CLAUDE.md: mock at the boundary).
 *
 * @typedef {object} ParamTables
 * @property {Readonly<Record<string, { fitDiameterMm: Readonly<Record<string, number>> }>>} boltSpecs
 * @property {Readonly<Record<string, unknown>>} nutSpecs
 * @property {Readonly<Record<string, unknown>>} washerSpecs
 * @property {Readonly<Record<string, unknown>>} bearingSpecs
 * @property {Readonly<Record<string, unknown>>} screwSpecs
 * @property {Readonly<Record<string, number>>} FIT_CLEARANCE_MM
 */

/** @type {ParamTables} */
const PARAM_TABLES = Object.freeze({
  boltSpecs,
  nutSpecs,
  washerSpecs,
  bearingSpecs,
  screwSpecs,
  FIT_CLEARANCE_MM,
})

/**
 * One option per key of a table, labelled by the key itself — a spec name like
 * `m10 hex` is already what a user reads on the part.
 *
 * @param {Readonly<Record<string, unknown>> | undefined} table
 * @returns {readonly OpUiOption[]}
 */
function keyOptions(table) {
  return Object.freeze(Object.keys(table ?? {}).map((key) => Object.freeze({ value: key, label: key })))
}

/**
 * @param {string} label
 * @param {readonly OpUiOption[]} options
 * @returns {EnumParamSchema}
 */
function enumParam(label, options) {
  return Object.freeze({ kind: 'enum', label, options })
}

/**
 * @param {string} label
 * @param {number} [fallback] The recipe's own default, when it has one.
 * @returns {NumberParamSchema}
 */
function mmParam(label, fallback) {
  return Object.freeze({
    kind: 'number',
    label,
    unit: 'mm',
    exclusiveMin: 0,
    ...(fallback === undefined ? {} : { default: fallback }),
  })
}

/**
 * The Library's own labelled choice for `op` — reused rather than re-labelled, so the
 * pre-drag picker and the Inspector's dropdown can never name one model two ways.
 *
 * @param {string} op
 * @returns {readonly OpUiOption[]}
 */
function choiceOptionsOf(op) {
  const options = registry[op]?.ui?.choice?.options
  if (!options) throw new Error(`paramOptions: ${op} has no Library choice to read its options from`)
  return options
}

/**
 * @typedef {object} ParamSchemaEntry
 * @property {(params: Record<string, any>, tables: ParamTables) => Record<string, ParamSchema>} params
 * @property {Readonly<Record<string, string>>} [partAliases] Real part renames between
 *   variants — see `BPLUS_PART_ALIASES` for what qualifies.
 */

/** @type {Readonly<Record<string, ParamSchemaEntry>>} */
const PARAM_SCHEMAS = Object.freeze({
  'raspberrypi.bplus': {
    params: () => ({
      model: enumParam('Model', choiceOptionsOf('raspberrypi.bplus')),
      clearance: mmParam('Clearance', DEFAULT_CLEARANCE_MM),
    }),
    partAliases: BPLUS_PART_ALIASES,
  },
  'raspberrypi.cameraModule': {
    params: () => ({ model: enumParam('Model', choiceOptionsOf('raspberrypi.cameraModule')) }),
  },
  'hardware.bolt': {
    // `fit` follows `spec`: `tables.boltSpecs[spec].fitDiameterMm` is what the recipe
    // looks the fit up in, so that row's keys *are* the valid fits for that spec.
    params: (params, tables) => ({
      spec: enumParam('Spec', keyOptions(tables.boltSpecs)),
      length: mmParam('Length'),
      fit: enumParam('Fit', keyOptions(tables.boltSpecs[params.spec]?.fitDiameterMm)),
    }),
  },
  'hardware.nut': {
    params: (_params, tables) => ({
      spec: enumParam('Spec', keyOptions(tables.nutSpecs)),
      fit: enumParam('Fit', keyOptions(tables.FIT_CLEARANCE_MM)),
    }),
  },
  'hardware.washer': {
    params: (_params, tables) => ({
      spec: enumParam('Spec', keyOptions(tables.washerSpecs)),
      fit: enumParam('Fit', keyOptions(tables.FIT_CLEARANCE_MM)),
    }),
  },
  'hardware.bearing': {
    params: (_params, tables) => ({ spec: enumParam('Spec', keyOptions(tables.bearingSpecs)) }),
  },
  // `clearLength` is optional and absent by default, so it stays out of the schema: a
  // schema param with no value would be an editable field the recipe never asked for.
  'hardware.screw': {
    params: (_params, tables) => ({
      spec: enumParam('Spec', keyOptions(tables.screwSpecs)),
      head: enumParam('Head', Object.freeze(SCREW_HEADS.map((head) => Object.freeze({ value: head, label: head })))),
      length: mmParam('Length'),
    }),
  },
})

/**
 * Which of a composite's params may be edited after placement, and how — the
 * registry-driven schema the Inspector's dropdowns and `src/core/paramEdit.js`'s
 * validation both read (`TODO/ui-052`).
 *
 * @param {string} op
 * @param {Record<string, any>} [params] The params as they will be **after** the edit,
 *   so a dependent option list (a bolt's `fit`) is the one for the new `spec`.
 * @param {ParamTables} [tables] Size tables; the real ones by default.
 * @returns {Readonly<Record<string, ParamSchema>>} Empty for a native op and for a
 *   composite nobody has described — which is what keeps it read-only.
 */
export function paramOptions(op, params = {}, tables = PARAM_TABLES) {
  const entry = PARAM_SCHEMAS[op]
  if (!entry) return Object.freeze({})
  return Object.freeze(entry.params(params ?? {}, tables))
}

/**
 * Whether a composite has any editable param at all — the Inspector's and the History
 * row's single yes/no.
 *
 * @param {string} op
 * @returns {boolean}
 */
export function hasEditableParams(op) {
  return PARAM_SCHEMAS[op] !== undefined
}

/**
 * The recipe's real part renames between variants, for a Remap suggestion. Empty when
 * the recipe declares none — the dialog then suggests nothing rather than guessing.
 *
 * @param {string} op
 * @returns {Readonly<Record<string, string>>}
 */
export function partAliasesOf(op) {
  return PARAM_SCHEMAS[op]?.partAliases ?? Object.freeze({})
}
