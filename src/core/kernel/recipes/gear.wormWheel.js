// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `gear.wormWheel` composite recipe — the wheel a worm drives (TODO/core-047,
 * `docs/decisions/gears.md`).
 *
 * **Non-throated, point contact.** The wheel is a helical gear whose helix angle is the
 * worm's lead angle γ, of the worm's hand, cut in the worm's normal module and pressure angle
 * (`src/core/gear/worm.js`'s {@link wormWheelGearParams}) — so its transverse section is the
 * spur gear that meshes the worm's axial rack, and its teeth run straight across the face.
 * It touches the worm at a point, not along a line as a throated (enveloping) wheel would;
 * that is adequate for a light-duty printed drive, and the throated wheel is a stated
 * follow-up, not silently omitted.
 *
 * ## The expansion
 *
 * Exactly `gear.spur`'s records for those helical params (`recipes/gear.spur.js` — one
 * expansion, not a copy of it), so the parts are a lone gear's: **`gear`**, hidden **`bore`**
 * (with `boreMm`) and hidden **`pitch`** (the pitch cylinder, `z · m` across). Axis local Z,
 * centred, mid-face at Z = 0, tooth 0 on +X at the bottom face.
 *
 * ## Params
 *
 * The wheel's own `teeth` and `faceWidthMm`, and the worm it meshes: `starts`, `moduleMm`
 * (the worm's **axial** module — the wheel's transverse one), `wormPitchDiameterMm`, and
 * optionally `pressureAngleDeg` (axial, default 20) and `handedness` (the worm's, default
 * `'right'`). `boreMm`, `clearanceMm` and `backlashMm` are the wheel's. A `helixAngleDeg` is
 * refused as unknown: the worm fixes it. A tooth count under the undercut limit (17 at 20°)
 * builds; `wormWheelDimensions().warnings` names it (`'wheel-undercut'`) for the Inspector —
 * a recipe has no warning channel.
 *
 * @module core/kernel/recipes/gear.wormWheel
 */

import { resolveGearAliases } from '../../gear/aliases.js'
import { WORM_WHEEL_LIMITS, checkGearLimits } from '../../gear/limits.js'
import { wormWheelGearParams } from '../../gear/worm.js'
import { spur } from './gear.spur.js'
import { withWormOp } from './gear.worm.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'gear.wormWheel'

/** The params `gear.wormWheel` takes, canonical spelling. */
export const WORM_WHEEL_PARAMS = Object.freeze([
  'teeth',
  'starts',
  'moduleMm',
  'pressureAngleDeg',
  'wormPitchDiameterMm',
  'handedness',
  'faceWidthMm',
  'boreMm',
  'clearanceMm',
  'backlashMm',
])

/**
 * Expand a `gear.wormWheel` document line into the records that define it.
 *
 * @param {Record<string, unknown>} params See the module doc.
 * @param {unknown} [_tables] Unused — a gear has no size table.
 * @returns {OpRecord[]}
 * @throws {import('../../gear/dimensions.js').GearParameterError} Named: an alias, limit,
 *   lead-angle, root, bore or twist error, prefixed with this op.
 */
export function wormWheel(params, _tables) {
  const canonical = resolveGearAliases(params, { op: OP, canonical: WORM_WHEEL_PARAMS }).params
  checkGearLimits(canonical, { op: OP, required: ['teeth', 'starts', 'moduleMm', 'wormPitchDiameterMm', 'faceWidthMm'], limits: WORM_WHEEL_LIMITS })
  try {
    return spur(wormWheelGearParams(/** @type {any} */ (canonical), { op: OP }))
  } catch (error) {
    // gear.spur's own prefix (`gear.spur: …`) is the wheel's here.
    if (error instanceof Error && error.message.startsWith('gear.spur: ')) error.message = `${OP}: ${error.message.slice('gear.spur: '.length)}`
    throw withWormOp(error, OP)
  }
}
