// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `gear.bevel` composite recipe — a straight bevel gear with a real pitch cone and
 * Tredgold back-cone teeth (TODO/core-045, `docs/decisions/gears.md` Decision 3), replacing
 * V1 `drive-wheel`'s hard-wired 45° `Bevel()`.
 *
 * Like every composite it builds nothing: it expands `params` into op records the same fold
 * replays, and imports no `@jscad/modeling`. The geometry is `src/core/gear/bevel.js`'s.
 *
 * ## The expansion
 *
 * `profile.gear` with `kind: 'bevel'` (the large-end section: the virtual gear's tooth on
 * this gear's pitch circle, in the plane through it) → `profile.extrudeToApex`, which lofts
 * that section toward the cone apex at the origin, so every flank is a cone through the
 * apex. Named parts:
 *
 * - **`gear`** — the toothed body, with its bore and hub. The only visible part.
 * - **`bore`** — the hole's negative, hidden, the full length of gear and hub (absent when
 *   `boreMm` is 0 or omitted), so a shaft can be snapped into it.
 * - **`pitchCone`** — a hidden frustum of the pitch cone over the face width: its large end
 *   is the pitch circle, `m·z/2`, on the large-end plane.
 * - **`apex`** — a hidden {@link APEX_MARKER_MM} cube centred on the cone apex: the point
 *   two meshing bevels share (`core-046` makes them coincide). A solid cannot be a point,
 *   so it is as small as a body can usefully be; its centre is what matters.
 *
 * ## The bore and hub are part of the loft — no 3D boolean
 *
 * The bore is a hole through the loft that keeps its size while the teeth taper, and the
 * hub (`hubLengthMm`) a boss behind the large end, both built by `profile.extrudeToApex`
 * itself. A 3D subtract of a cylinder from a tapered gear, or a union of a hub onto its back,
 * leaves open edges on the re-tessellated caps (measured while building this: 12 to 122 at
 * 20 to 80 teeth, the same failure `gear.spur.js` documents for its bore), and the bore
 * cannot be cut in 2D first as the spur gear does — the loft would taper it too. The hub's
 * diameter is the root circle at the small end, the widest circle the whole toothed body
 * clears, so it never stands proud of the teeth; the bore must be smaller than that.
 *
 * ## Axis and placement
 *
 * Axis local Z, **apex at the origin**, +Z toward the large end (`src/core/gear/bevel.js`):
 * the small end at `z = k·Z`, the large end at `z = Z`, the hub beyond it. Tooth 0 on +X.
 * No `center` param — the Library's trailing `transform.translate` places a composite.
 *
 * ## Params
 *
 * `teeth`, `mateTeeth`, `moduleMm` (required; the module at the large end), `shaftAngleDeg`
 * (default 90), `faceWidthMm` (default `min(L/3, 10·m)`; past `L/3` it still builds and
 * `bevelGearDimensions` warns), `pressureAngleDeg`, `clearanceMm`, `backlashMm`, `boreMm`,
 * `hubLengthMm`. **`moduleMm`, not the TODO's `module`**: Decision 2's canonical name; the
 * TODO's spelling and V1's (`toothCount`, `circularPitch`, `clearance`, `backlash`,
 * `centerHoleDiameter`) come through `src/core/gear/aliases.js`, as on `gear.spur`. A bevel
 * has no profile shift, so V1's `profileShift` is refused. Every value is capped
 * (`BEVEL_LIMITS`) and the pair checked by `bevelGearDimensions` **before** a record is
 * emitted, so a hostile record fails by name instead of reaching the kernel.
 *
 * @module core/kernel/recipes/gear.bevel
 */

import { resolveGearAliases } from '../../gear/aliases.js'
import { bevelGearDimensions } from '../../gear/bevel.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { BEVEL_LIMITS, GearBoreError, checkGearLimits } from '../../gear/limits.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'gear.bevel'

/** The params `gear.bevel` takes, canonical spelling. */
export const BEVEL_PARAMS = Object.freeze([
  'teeth',
  'mateTeeth',
  'moduleMm',
  'shaftAngleDeg',
  'faceWidthMm',
  'pressureAngleDeg',
  'clearanceMm',
  'backlashMm',
  'boreMm',
  'hubLengthMm',
])

/** The subset that shapes the large-end section, passed on to `profile.gear`. */
const PROFILE_PARAMS = Object.freeze(['teeth', 'moduleMm', 'pressureAngleDeg', 'clearanceMm', 'backlashMm'])

/** Edge of the hidden `apex` marker cube, mm. */
export const APEX_MARKER_MM = 0.01

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
 * Expand a `gear.bevel` document line into the records that define it.
 *
 * @param {Record<string, unknown>} params See the module doc, or their aliases.
 * @param {unknown} [_tables] Unused — a gear has no size table.
 * @returns {OpRecord[]}
 * @throws {GearParameterError} Named: an alias, limit, bore, shaft-angle, face-width or
 *   crown-gear error.
 */
export function bevel(params, _tables) {
  const canonical = resolveGearAliases(params, { op: OP, canonical: BEVEL_PARAMS }).params
  checkGearLimits(canonical, { op: OP, required: ['teeth', 'mateTeeth', 'moduleMm'], limits: BEVEL_LIMITS })

  /** @type {import('../../gear/bevel.js').BevelGearDimensions} */
  let dims
  try {
    dims = bevelGearDimensions(/** @type {any} */ (canonical))
  } catch (error) {
    throw withOp(error)
  }

  const boreMm = /** @type {number} */ (canonical.boreMm ?? 0)
  const hubLengthMm = /** @type {number} */ (canonical.hubLengthMm ?? 0)
  const smallRootDiameterMm = 2 * dims.smallEndRootRadiusMm
  if (boreMm >= smallRootDiameterMm) {
    throw new GearBoreError(
      `${OP}: boreMm ${boreMm} must be smaller than the root diameter at the small end ` +
        `(${smallRootDiameterMm.toFixed(3)} mm) — a larger bore would cut through the teeth there`
    )
  }

  /** @type {Record<string, unknown>} */
  const profileParams = { kind: 'bevel' }
  for (const key of PROFILE_PARAMS) {
    if (canonical[key] !== undefined) profileParams[key] = canonical[key]
  }
  profileParams.pitchConeAngleDeg = dims.pitchConeAngleDeg

  /** @type {Record<string, unknown>} */
  const loftParams = { apexDistanceMm: dims.apexDistanceMm, lengthMm: dims.axialLengthMm }
  if (boreMm > 0) loftParams.boreMm = boreMm
  if (hubLengthMm > 0) {
    loftParams.hubLengthMm = hubLengthMm
    loftParams.hubDiameterMm = smallRootDiameterMm
  }

  /** @type {OpRecord[]} */
  const records = [
    { id: 'profile', op: 'profile.gear', params: profileParams },
    { id: 'gear', op: 'profile.extrudeToApex', target: 'profile', params: loftParams, name: 'gear' },
  ]
  const smallZMm = dims.smallEndApexDistanceMm
  if (boreMm > 0) {
    const boreLengthMm = dims.axialLengthMm + hubLengthMm
    records.push({
      id: 'bore',
      op: 'primitive.cylinder',
      params: { diameter: boreMm, height: boreLengthMm, center: [0, 0, smallZMm + boreLengthMm / 2] },
      name: 'bore',
      hidden: true,
    })
  }
  records.push(
    {
      id: 'pitchCone',
      op: 'primitive.cone',
      params: {
        diameter: dims.pitchDiameterMm * dims.smallEndScale,
        topDiameter: dims.pitchDiameterMm,
        height: dims.axialLengthMm,
        center: [0, 0, smallZMm + dims.axialLengthMm / 2],
      },
      name: 'pitchCone',
      hidden: true,
    },
    {
      id: 'apex',
      op: 'primitive.cuboid',
      params: { size: [APEX_MARKER_MM, APEX_MARKER_MM, APEX_MARKER_MM], center: [0, 0, 0] },
      name: 'apex',
      hidden: true,
    }
  )
  return records
}
