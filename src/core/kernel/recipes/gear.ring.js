// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `gear.ring` composite recipe — an extruded internal (ring) gear (TODO/core-043,
 * `docs/decisions/gears.md` Decision 3 and call 7).
 *
 * Like every composite it builds nothing: it expands `params` into op records the same fold
 * replays, and imports no `@jscad/modeling`.
 *
 * ## The expansion
 *
 * `profile.gear` with `kind: 'internal'` (the rim annulus with the teeth on its inside
 * edge, `src/core/gear/internal.js`) → `profile.extrudeLinear` (0 → thickness, twisted when
 * helical) → a `transform.translate` down by half the thickness. Three named parts:
 *
 * - **`gear`** — the toothed ring. The only visible part.
 * - **`bore`** — a hidden cylinder of the ring's **tip** (inner) diameter: the clear space
 *   through the middle that nothing inside the ring may cross, so a planet carrier
 *   (`core-049`) can be sized against it or subtracted from it.
 * - **`pitch`** — a hidden cylinder of the pitch diameter, as on `gear.spur`: the reference
 *   `core-044`'s mating snaps to.
 *
 * ## No pinion
 *
 * A ring is a **creation**, defined by its own params (call 7): there is no `connectedGear`
 * and no pinion selection. Which pinions fit is a readout (`maxPinionTeeth`,
 * `ringGearDimensions`), and a ring no pinion can mesh with is refused by name before any
 * record is emitted (`GearMeshError` `'no-pinion-fits'`).
 *
 * ## Helical
 *
 * `helixAngleDeg`, `handedness` and `herringbone` work exactly as on `gear.spur`
 * (`helicalExtrude`). On parallel axes a ring and its pinion have the **same** hand.
 *
 * ## Placement and params
 *
 * Axis local Z, centred on the origin, mid-thickness at Z = 0, ring tooth 0 on +X. No
 * `center`, no `boreMm`, no `profileShift`: each is refused by name through the alias table.
 * The rim (`rimThicknessMm`, default 4 modules) is measured outward from the root circle.
 * Every value is capped by `src/core/gear/limits.js`'s `RING_LIMITS` before anything is built.
 *
 * @module core/kernel/recipes/gear.ring
 */

import { resolveGearAliases } from '../../gear/aliases.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { ringGearDimensions } from '../../gear/internal.js'
import { RING_LIMITS, checkGearLimits } from '../../gear/limits.js'
import { helicalExtrude } from './gear.spur.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'gear.ring'

/** The params `gear.ring` takes, canonical spelling. */
export const RING_PARAMS = Object.freeze([
  'teeth',
  'moduleMm',
  'pressureAngleDeg',
  'clearanceMm',
  'backlashMm',
  'thicknessMm',
  'rimThicknessMm',
  'helixAngleDeg',
  'handedness',
  'herringbone',
])

/** The subset that shapes the 2D annulus, passed on to `profile.gear`. */
const PROFILE_PARAMS = Object.freeze(['teeth', 'moduleMm', 'pressureAngleDeg', 'clearanceMm', 'backlashMm', 'rimThicknessMm'])

/**
 * A gear-core error re-raised with this op in front, keeping its class, name and code.
 *
 * @param {unknown} error
 * @returns {unknown}
 */
function withOp(error) {
  if (error instanceof GearParameterError && !error.message.startsWith(`${OP}: `)) {
    const Named = /** @type {new (message: string, code?: unknown) => GearParameterError} */ (error.constructor)
    return new Named(`${OP}: ${error.message}`, /** @type {{ code?: unknown }} */ (error).code)
  }
  return error
}

/**
 * Expand a `gear.ring` document line into the records that define it.
 *
 * @param {Record<string, unknown>} params `teeth`, `moduleMm`, `thicknessMm` (required),
 *   `pressureAngleDeg`, `clearanceMm`, `backlashMm`, `rimThicknessMm`, `helixAngleDeg`,
 *   `handedness`, `herringbone` (optional), or their aliases (`src/core/gear/aliases.js`,
 *   where V1's negative `toothCount` is this op's).
 * @param {unknown} [_tables] Unused — a gear has no size table.
 * @returns {OpRecord[]}
 * @throws {GearParameterError} Named: an alias, limit, mesh, twist or dimension error.
 */
export function ring(params, _tables) {
  const canonical = resolveGearAliases(params, { op: OP, canonical: RING_PARAMS, kind: 'internal' }).params
  checkGearLimits(canonical, { op: OP, required: ['teeth', 'moduleMm', 'thicknessMm'], limits: RING_LIMITS })

  /** @type {import('../../gear/internal.js').RingGearDimensions} */
  let dims
  try {
    dims = ringGearDimensions(/** @type {any} */ (canonical))
  } catch (error) {
    throw withOp(error)
  }

  const thicknessMm = /** @type {number} */ (canonical.thicknessMm)
  /** @type {Record<string, unknown>} */
  const profileParams = { kind: 'internal' }
  for (const key of PROFILE_PARAMS) {
    if (canonical[key] !== undefined) profileParams[key] = canonical[key]
  }
  const { helixAngleDeg, twistParams } = helicalExtrude(OP, canonical, dims)
  if (helixAngleDeg !== 0) profileParams.helixAngleDeg = helixAngleDeg

  return [
    { id: 'profile', op: 'profile.gear', params: profileParams },
    { id: 'blank', op: 'profile.extrudeLinear', target: 'profile', params: { height: thicknessMm, ...twistParams } },
    { id: 'gear', op: 'transform.translate', target: 'blank', params: { vector: [0, 0, -thicknessMm / 2] }, name: 'gear' },
    { id: 'bore', op: 'primitive.cylinder', params: { diameter: 2 * dims.tipRadiusMm, height: thicknessMm }, name: 'bore', hidden: true },
    { id: 'pitch', op: 'primitive.cylinder', params: { diameter: dims.pitchDiameterMm, height: thicknessMm }, name: 'pitch', hidden: true },
  ]
}
