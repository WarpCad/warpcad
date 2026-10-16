// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `gear.spur` composite recipe — an extruded, optionally bored, external spur gear
 * (TODO/core-041, `docs/decisions/gears.md` Decision 3).
 *
 * Like every composite (`hardware.bolt.js`'s module doc), it builds nothing: it expands
 * `params` into op records the same fold replays, so a gear's definition is reviewable
 * JSON. Nothing here imports `@jscad/modeling`.
 *
 * ## The expansion
 *
 * `profile.gear` (the involute outline, `src/core/gear/involute.js`) → when there is a
 * bore, `boolean.subtract` of a `profile.circle` **in 2D** → `profile.extrudeLinear`
 * (0 → thickness) → a `transform.translate` down by half the thickness. Three named parts:
 *
 * - **`gear`** — the toothed body, bored. The only visible part.
 * - **`bore`** — the hole's negative, hidden, kept so a shaft can be snapped into it or
 *   subtracted from something else (`{ id, pieces: 'bore' }`, TODO/core-024). Absent when
 *   `boreMm` is 0 or omitted.
 * - **`pitch`** — a hidden cylinder of the **pitch diameter** and the gear's thickness:
 *   the reference `core-044`'s mating snaps to. The TODO asks for a zero-thickness one; a
 *   solid cannot have zero height, so it spans the gear's own thickness — which also lets
 *   a Z-align against it mean "the gear's faces". Being hidden, it never widens the body.
 *
 * ## The bore is cut in 2D, and that ordering is load-bearing
 *
 * The same lesson `kit.boardFrame.js` carries over from V1: subtracting the bore from the
 * *extruded* gear leaves open edges along the tooth flanks on both caps once the gear has
 * a few dozen teeth (measured while building this: 56 open edges at 60 teeth, 196 at 120,
 * even after `makeWatertight`), because the boolean re-tessellates the large non-convex
 * cap. Cutting the circle from the profile first and extruding the annulus is watertight
 * at every tooth count. The 2D boolean is not exact — it moves the outline's vertices by
 * up to ~2e-4 mm (upstream routes `geom2` booleans through `martinez`) — which is far under
 * any print tolerance; an unbored gear has no boolean and keeps its exact outline. The
 * hole and the hidden `bore` cylinder take the same policy-driven segment count, so they
 * coincide.
 *
 * ## Placement
 *
 * Axis is local Z, centred on the origin, mid-thickness at Z = 0, tooth 0 on +X (the
 * outline's own layout). There is **no `center` param**: the Library's trailing
 * `transform.translate` places a composite (`src/core/library.js`), and a `center` is
 * refused by name rather than silently ignored.
 *
 * ## Params and resolution
 *
 * Canonical names per Decision 2 (`moduleMm`, not the TODO's `module`, which is accepted
 * only through `src/core/gear/aliases.js` along with V1's names). Every value is capped by
 * `src/core/gear/limits.js` and the bore checked against the root circle **before** a
 * record is emitted, so a hostile record never reaches the generator. Resolution is not a
 * param: points per flank come from the design's policy inside `profile.gear`, and the
 * bore takes `primitive.cylinder`'s own policy-driven segment count (`TODO/core-035`).
 *
 * @module core/kernel/recipes/gear.spur
 */

import { resolveGearAliases } from '../../gear/aliases.js'
import { GearParameterError, gearDimensions } from '../../gear/dimensions.js'
import { GEAR_LIMITS, GearBoreError, checkGearLimits } from '../../gear/limits.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {import('../registry.js').OpUi} OpUi */
/** @typedef {import('../../gear/limits.js').GearLimit} GearLimit */

const OP = 'gear.spur'

/** The params `gear.spur` takes, canonical spelling. */
export const SPUR_PARAMS = Object.freeze([
  'teeth',
  'moduleMm',
  'pressureAngleDeg',
  'profileShift',
  'clearanceMm',
  'backlashMm',
  'thicknessMm',
  'boreMm',
])

/** The subset that shapes the 2D outline, passed on to `profile.gear`. */
const PROFILE_PARAMS = Object.freeze(['teeth', 'moduleMm', 'pressureAngleDeg', 'profileShift', 'clearanceMm', 'backlashMm'])

/**
 * Catalogue metadata for the Spur gear row. **Not attached to the registry entry yet**:
 * a `ui` on the entry makes it a Library row and an AI-creatable op at once
 * (`src/ai/tools/create.js`'s `creatableOps`), and the row's panel, Inspector, docs and
 * e2e coverage are `ui-057`'s. That task attaches this object; nothing else changes.
 *
 * @type {Readonly<OpUi & { paramRanges: Readonly<Record<'teeth' | 'moduleMm' | 'pressureAngleDeg' | 'thicknessMm' | 'profileShift', Readonly<GearLimit>>> }>}
 */
export const GEAR_SPUR_UI = Object.freeze({
  label: 'Spur gear',
  defaults: Object.freeze({ teeth: 24, moduleMm: 2, pressureAngleDeg: 20, thicknessMm: 8, boreMm: 8 }),
  nameFor: (/** @type {Record<string, any>} */ params) => `Spur gear ${params.teeth}T`,
  paramRanges: GEAR_LIMITS,
})

/**
 * A core-040 error re-raised with this op in front, keeping its class and name.
 *
 * @param {unknown} error
 * @returns {unknown}
 */
function withOp(error) {
  if (error instanceof GearParameterError && !error.message.startsWith(`${OP}: `)) {
    const Named = /** @type {new (message: string) => GearParameterError} */ (error.constructor)
    return new Named(`${OP}: ${error.message}`)
  }
  return error
}

/**
 * Expand a `gear.spur` document line into the records that define it.
 *
 * @param {Record<string, unknown>} params `teeth`, `moduleMm`, `thicknessMm` (required),
 *   `pressureAngleDeg`, `profileShift`, `clearanceMm`, `backlashMm`, `boreMm` (optional),
 *   or their aliases (`src/core/gear/aliases.js`).
 * @param {unknown} [_tables] Unused — a gear has no size table.
 * @returns {OpRecord[]}
 * @throws {import('../../gear/dimensions.js').GearParameterError} Named: an alias, limit,
 *   bore or core-040 dimension error.
 */
export function spur(params, _tables) {
  const canonical = resolveGearAliases(params, { op: OP, canonical: SPUR_PARAMS }).params
  checkGearLimits(canonical, { op: OP, required: ['teeth', 'moduleMm', 'thicknessMm'] })

  /** @type {import('../../gear/dimensions.js').GearDimensions} */
  let dims
  try {
    dims = gearDimensions(/** @type {any} */ (canonical))
  } catch (error) {
    throw withOp(error)
  }

  const thicknessMm = /** @type {number} */ (canonical.thicknessMm)
  const boreMm = /** @type {number} */ (canonical.boreMm ?? 0)
  const rootDiameterMm = 2 * dims.rootRadiusMm
  if (boreMm >= rootDiameterMm) {
    throw new GearBoreError(
      `${OP}: boreMm ${boreMm} must be smaller than the root diameter (${rootDiameterMm.toFixed(3)} mm) — ` +
        `a larger bore would cut through the teeth`
    )
  }

  /** @type {Record<string, unknown>} */
  const profileParams = {}
  for (const key of PROFILE_PARAMS) {
    if (canonical[key] !== undefined) profileParams[key] = canonical[key]
  }

  /** @type {OpRecord[]} */
  const records = [{ id: 'profile', op: 'profile.gear', params: profileParams }]
  let face = 'profile'
  if (boreMm > 0) {
    // In 2D, before the extrude — see the module doc: a 3D subtract leaves open edges on
    // the caps of a many-toothed gear.
    records.push(
      { id: 'hole', op: 'profile.circle', params: { diameter: boreMm } },
      { id: 'face', op: 'boolean.subtract', target: 'profile', operands: ['hole'] }
    )
    face = 'face'
  }
  records.push(
    { id: 'blank', op: 'profile.extrudeLinear', target: face, params: { height: thicknessMm } },
    { id: 'gear', op: 'transform.translate', target: 'blank', params: { vector: [0, 0, -thicknessMm / 2] }, name: 'gear' }
  )
  if (boreMm > 0) {
    records.push({ id: 'bore', op: 'primitive.cylinder', params: { diameter: boreMm, height: thicknessMm }, name: 'bore', hidden: true })
  }
  records.push({
    id: 'pitch',
    op: 'primitive.cylinder',
    params: { diameter: dims.pitchDiameterMm, height: thicknessMm },
    name: 'pitch',
    hidden: true,
  })
  return records
}
