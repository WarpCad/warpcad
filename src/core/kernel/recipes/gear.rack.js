// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `gear.rack` composite recipe — an extruded gear rack (TODO/core-043,
 * `docs/decisions/gears.md` Decision 3).
 *
 * Like every composite it builds nothing: it expands `params` into op records the same fold
 * replays, and imports no `@jscad/modeling`.
 *
 * ## The expansion
 *
 * `profile.gear` with `kind: 'rack'` (`src/core/gear/rack.js`: the tooth row along +X,
 * teeth pointing +Y, pitch line on y = 0, a true-length bar centred on x = 0) →
 * `profile.extrudeLinear` → a `transform.translate` down by half the thickness. Two named
 * parts:
 *
 * - **`gear`** — the toothed bar. The only visible part.
 * - **`pitch`** — a hidden box from the back of the bar up to the pitch line, the rack's
 *   full length and thickness: its **+Y face is the pitch line**, the reference a pinion
 *   snaps onto (`core-044`), as `gear.spur`'s pitch cylinder's surface is its pitch circle.
 *   A pitch *line* cannot be a solid, so the box carries it as a face.
 *
 * ## Params
 *
 * `teeth` (default 10, at most 200 — V1 always made 41), `moduleMm`, `pressureAngleDeg`,
 * `clearanceMm`, `backlashMm` (the same rule as the gear and the ring, call 4), `heightMm`
 * (the bar behind the root line, default 4 modules) and `thicknessMm` (along Z). No helix
 * (a helical rack is not in this task), no `center`, no bore: each is refused by name.
 * Every value is capped by `src/core/gear/limits.js`'s `RACK_LIMITS` before anything is
 * built. V1's `toothCount: 0` is this op's, and becomes V1's 41 teeth.
 *
 * @module core/kernel/recipes/gear.rack
 */

import { resolveGearAliases } from '../../gear/aliases.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { RACK_LIMITS, checkGearLimits } from '../../gear/limits.js'
import { DEFAULT_RACK_TEETH, rackDimensions } from '../../gear/rack.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'gear.rack'

/** The params `gear.rack` takes, canonical spelling. */
export const RACK_PARAMS = Object.freeze(['teeth', 'moduleMm', 'pressureAngleDeg', 'clearanceMm', 'backlashMm', 'heightMm', 'thicknessMm'])

/** The subset that shapes the 2D bar, passed on to `profile.gear`. */
const PROFILE_PARAMS = Object.freeze(['teeth', 'moduleMm', 'pressureAngleDeg', 'clearanceMm', 'backlashMm', 'heightMm'])

/**
 * Expand a `gear.rack` document line into the records that define it.
 *
 * @param {Record<string, unknown>} params `moduleMm`, `thicknessMm` (required), `teeth`,
 *   `pressureAngleDeg`, `clearanceMm`, `backlashMm`, `heightMm` (optional), or their aliases.
 * @param {unknown} [_tables] Unused.
 * @returns {OpRecord[]}
 * @throws {GearParameterError} Named: an alias, limit or dimension error.
 */
export function rack(params, _tables) {
  const resolved = resolveGearAliases(params, { op: OP, canonical: RACK_PARAMS, kind: 'rack' }).params
  /** @type {Record<string, unknown>} */
  const canonical = { ...resolved, teeth: resolved.teeth ?? DEFAULT_RACK_TEETH }
  checkGearLimits(canonical, { op: OP, required: ['moduleMm', 'thicknessMm'], limits: RACK_LIMITS })

  /** @type {import('../../gear/rack.js').RackDimensions} */
  let dims
  try {
    dims = rackDimensions(/** @type {any} */ (canonical))
  } catch (error) {
    if (error instanceof GearParameterError) {
      const Named = /** @type {new (message: string) => GearParameterError} */ (error.constructor)
      throw new Named(`${OP}: ${error.message}`)
    }
    throw error
  }

  const thicknessMm = /** @type {number} */ (canonical.thicknessMm)
  /** @type {Record<string, unknown>} */
  const profileParams = { kind: 'rack' }
  for (const key of PROFILE_PARAMS) {
    if (canonical[key] !== undefined) profileParams[key] = canonical[key]
  }

  return [
    { id: 'profile', op: 'profile.gear', params: profileParams },
    { id: 'blank', op: 'profile.extrudeLinear', target: 'profile', params: { height: thicknessMm } },
    { id: 'gear', op: 'transform.translate', target: 'blank', params: { vector: [0, 0, -thicknessMm / 2] }, name: 'gear' },
    {
      id: 'pitch',
      op: 'primitive.cuboid',
      params: { size: [dims.lengthMm, -dims.backYMm, thicknessMm], center: [0, dims.backYMm / 2, 0] },
      name: 'pitch',
      hidden: true,
    },
  ]
}
