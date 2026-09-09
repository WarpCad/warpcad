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
const { booleans, extrusions, measurements, primitives, transforms } = modeling

import { chamferRim, filletRim } from './fillet.js'
import { bolt } from './recipes/hardware.bolt.js'
import { nut } from './recipes/hardware.nut.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {[number, number, number]} Vec3Mm */

/**
 * One line of the document, or one line of a composite recipe's expansion — the
 * schema is the same either way (`Initial design.md` §3), which is what lets both
 * replay through one fold.
 *
 * @typedef {object} OpRecord
 * @property {string} [id] Referenceable by `target`/`operands` from later records.
 * @property {string} op Registry key.
 * @property {Record<string, any>} [params] Plain JSON; never a function or code.
 * @property {string} [target] Id of the primary operand.
 * @property {string[]} [operands] Ids of additional operands.
 * @property {string} [supersedes] Id of the record whose *logical body* this
 *   record replaces — a move or a turn of an existing object rather than a new
 *   one. `src/core/document.js` reads this to report one body per lineage instead
 *   of one per record; the kernel fold itself ignores it. See that module's
 *   supersession note.
 * @property {string} [name] Names the result as a part of the resulting group.
 * @property {boolean} [hidden] Named but excluded from the group's default combine.
 */

/**
 * @typedef {object} BuildArgs
 * @property {Record<string, any>} params The record's `params`, plain JSON.
 * @property {Geom3[]} inputs Resolved operand geometry, `target` first.
 */

/** @typedef {(params: any, tables: any) => OpRecord[]} Recipe */

/**
 * @typedef {object} OpUi
 * @property {string} label Human name for the op — the Library panel's row title.
 * @property {Record<string, any>} defaults Params a fresh instance is created with.
 */

/**
 * @typedef {object} RegistryEntry
 * @property {'native' | 'composite'} kind
 * @property {0 | 1 | '2+'} operandCount How many operands the op consumes.
 * @property {(args: BuildArgs) => Geom3} [build] Native ops only.
 * @property {Recipe} [recipe] Composite ops only.
 * @property {OpUi} [ui] Present on ops the UI offers as a catalogue row.
 */

/**
 * A native entry: it builds geometry itself.
 *
 * @param {0 | 1 | '2+'} operandCount
 * @param {(args: BuildArgs) => Geom3} build
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
 * A composite entry: it expands into more op records and builds nothing.
 *
 * @param {0 | 1 | '2+'} operandCount
 * @param {Recipe} recipe
 * @returns {RegistryEntry}
 */
function composite(operandCount, recipe) {
  return Object.freeze({ kind: 'composite', operandCount, recipe })
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
 * Default segment count for cylindrical surfaces — `@jscad/modeling`'s own cylinder
 * default, kept explicit here so the value is one constant rather than a library
 * default that could move underneath the fixtures.
 */
export const DEFAULT_SEGMENTS = 32

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
    ({ params }) =>
      primitives.cylinder({
        radius: requirePositive(params.diameter, 'diameter', 'primitive.cylinder') / 2,
        height: requirePositive(params.height, 'height', 'primitive.cylinder'),
        segments: params.segments ?? DEFAULT_SEGMENTS,
        center: params.center ?? [0, 0, 0],
      }),
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
    ({ params }) => {
      const baseRadius = requirePositive(params.diameter, 'diameter', 'primitive.cone') / 2
      const topRadius =
        params.topDiameter === undefined || params.topDiameter === null
          ? 0
          : requireNonNegative(params.topDiameter, 'topDiameter', 'primitive.cone') / 2
      return primitives.cylinderElliptic({
        height: requirePositive(params.height, 'height', 'primitive.cone'),
        startRadius: [baseRadius, baseRadius],
        endRadius: [topRadius, topRadius],
        segments: params.segments ?? DEFAULT_SEGMENTS,
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
    ({ params }) => {
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
      const segments = params.segments ?? DEFAULT_SEGMENTS
      const center = params.center ?? [0, 0, 0]
      return booleans.subtract(
        primitives.cylinder({ radius: outerRadius, height, segments, center }),
        primitives.cylinder({ radius: innerRadius, height, segments, center })
      )
    },
    { label: 'Tube', defaults: { diameter: 40, innerDiameter: 26, height: 50 } }
  ),

  'primitive.sphere': native(
    0,
    ({ params }) =>
      primitives.sphere({
        radius: requirePositive(params.diameter, 'diameter', 'primitive.sphere') / 2,
        segments: params.segments ?? DEFAULT_SEGMENTS,
        center: params.center ?? [0, 0, 0],
      }),
    { label: 'Sphere', defaults: { diameter: 40 } }
  ),

  'transform.translate': native(1, ({ params, inputs }) =>
    transforms.translate(/** @type {Vec3Mm} */ (params.vector), inputs[0])
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
  'transform.rotate': native(1, ({ params, inputs }) => {
    const op = 'transform.rotate'
    const angles = params.angles ?? [0, 0, 0]
    if (!Array.isArray(angles) || angles.length !== 3 || !angles.every(Number.isFinite)) {
      throw new Error(`${op}: angles must be three finite degree values, got ${JSON.stringify(angles)}`)
    }
    const center = params.center ?? [0, 0, 0]
    if (!Array.isArray(center) || center.length !== 3 || !center.every(Number.isFinite)) {
      throw new Error(`${op}: center must be three finite millimetre values`)
    }
    const turned = transforms.rotate(
      [degToRad(angles[0]), degToRad(angles[1]), degToRad(angles[2])],
      transforms.translate(
        /** @type {Vec3Mm} */ ([-center[0], -center[1], -center[2]]),
        inputs[0]
      )
    )
    return transforms.translate(/** @type {Vec3Mm} */ (center), turned)
  }),

  'boolean.union': native('2+', ({ inputs }) => booleans.union(inputs)),

  'boolean.subtract': native('2+', ({ inputs }) => booleans.subtract(inputs)),

  // Rim ops, not edge ops. These round or bevel the whole rim of one axis-aligned
  // face — exactly what V1's `.fillet()`/`.chamfer()` did, and the most `@jscad/
  // modeling` can support. See fillet.js and the TODO/core-003 addendum in
  // docs/decisions/geometry-kernel.md. `orientation` is a face name, not an axis
  // vector, so no angle conversion happens here.
  'modify.filletRim': native(1, ({ params, inputs }) =>
    filletRim(
      {
        radius: params.radius,
        orientation: params.orientation ?? 'z+',
        segments: params.segments ?? DEFAULT_SEGMENTS,
      },
      inputs[0]
    )
  ),

  'modify.chamferRim': native(1, ({ params, inputs }) =>
    chamferRim({ radius: params.radius, orientation: params.orientation ?? 'z+' }, inputs[0])
  ),

  'hardware.bolt': composite(0, bolt),

  // TODO/core-010: single-record expansion — Hardware.Nut returns one bare CSG in
  // V1, not a Group, so there is no second part to snap this one against. See
  // recipes/hardware.nut.js's module doc for the V1→V3 centring difference this
  // makes explicit.
  'hardware.nut': composite(0, nut),

  // Deliberately absent, and not an oversight — TODO/core-003 spiked both:
  //
  // - `modify.fillet`/`modify.chamfer` on a *selected edge*. Not viable on this
  //   kernel: V3 has no fillet op, cannot erode a solid (`expand` throws on a
  //   negative delta), and leaves boolean results as polygon soup with no shared-edge
  //   topology to name an edge with. Registering the rim ops above under the bare
  //   names `fillet`/`chamfer` would misrepresent what they do to the UI's tool
  //   enablement, which is why they carry `Rim` in their names.
  // - `hardware.bearing`. Not blocked, just unverified: there is no `Bearing` factory
  //   in the vendored jscad-hardware to port or diff against, and its geometry is an
  //   ordinary tube, so it belongs here as a `composite` recipe alongside washer once
  //   someone supplies a real spec table. It is not a native op.
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
