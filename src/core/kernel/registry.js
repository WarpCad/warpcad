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
const { booleans, primitives, transforms } = modeling

import { chamferRim, filletRim } from './fillet.js'
import { bolt } from './recipes/hardware.bolt.js'

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
 * @typedef {object} RegistryEntry
 * @property {'native' | 'composite'} kind
 * @property {0 | 1 | '2+'} operandCount How many operands the op consumes.
 * @property {(args: BuildArgs) => Geom3} [build] Native ops only.
 * @property {Recipe} [recipe] Composite ops only.
 */

/**
 * A native entry: it builds geometry itself.
 *
 * @param {0 | 1 | '2+'} operandCount
 * @param {(args: BuildArgs) => Geom3} build
 * @returns {RegistryEntry}
 */
function native(operandCount, build) {
  return Object.freeze({ kind: 'native', operandCount, build })
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
  'primitive.cuboid': native(0, ({ params }) =>
    primitives.cuboid({
      size: [
        requirePositive(params.size?.[0], 'size[0]', 'primitive.cuboid'),
        requirePositive(params.size?.[1], 'size[1]', 'primitive.cuboid'),
        requirePositive(params.size?.[2], 'size[2]', 'primitive.cuboid'),
      ],
      center: params.center ?? [0, 0, 0],
    })
  ),

  'primitive.cylinder': native(0, ({ params }) =>
    primitives.cylinder({
      radius: requirePositive(params.diameter, 'diameter', 'primitive.cylinder') / 2,
      height: requirePositive(params.height, 'height', 'primitive.cylinder'),
      segments: params.segments ?? DEFAULT_SEGMENTS,
      center: params.center ?? [0, 0, 0],
    })
  ),

  // `@jscad/modeling` has no `hexagon` primitive. jscad-utils' `Parts.Hexagon` was a
  // 6-point CAG extruded to height, with a vertex on +X and flats at r*sqrt(3)/2 —
  // which is exactly a 6-segment cylinder in V3, phase included. Verified against V1
  // output in hardware.bolt.spec.js rather than assumed.
  'primitive.hexagon': native(0, ({ params }) =>
    primitives.cylinder({
      radius: requirePositive(params.diameter, 'diameter', 'primitive.hexagon') / 2,
      height: requirePositive(params.height, 'height', 'primitive.hexagon'),
      segments: 6,
      center: params.center ?? [0, 0, 0],
    })
  ),

  'transform.translate': native(1, ({ params, inputs }) =>
    transforms.translate(/** @type {Vec3Mm} */ (params.vector), inputs[0])
  ),

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
  //   ordinary tube, so it belongs here as a `composite` recipe alongside bolt/nut/
  //   washer once someone supplies a real spec table. It is not a native op.
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
