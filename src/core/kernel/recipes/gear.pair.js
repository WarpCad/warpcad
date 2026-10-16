// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `gear.pair` composite recipe — two external spur (or helical) gears, already meshed
 * (TODO/core-044, `docs/decisions/gears.md`).
 *
 * V1 meshed gears only through `GearSet`; here the meshing is `src/core/gear/mesh.js`, and
 * this recipe is its first caller. Like every composite it builds nothing: it expands one
 * param record into op records the same fold replays, and imports no `@jscad/modeling`.
 *
 * ## The expansion
 *
 * Two `gear.spur` records (`recipes/gear.spur.js` — one expansion, not a copy of it), then a
 * `transform.rotate` that turns the pinion to {@link meshPhaseDeg} about its own axis and a
 * `transform.translate` that moves it one {@link centerDistanceMm} along +X. Both numbers are
 * computed **from the params**, never by measuring the built gears
 * (`docs/decisions/composite-recipe-geometry.md`: a recipe expands against an empty fold).
 * For `pitchPlane` `'xz'` or `'yz'` each gear then gets one more `transform.rotate`
 * ({@link PITCH_PLANE_BASIS}'s angles), so the pair is meshed in XY and stood up whole.
 *
 * Two named parts, **`drive`** and **`pinion`** — the names `window-motor` already uses
 * (`gears.parts.drive`, `.pinion`), so a V1 author's model carries over. The drive is centred
 * on the origin with tooth 0 on +X, mid-thickness at Z = 0, exactly as a lone `gear.spur`; the
 * pinion sits on +X (on `u` of the pitch plane). The Library's trailing `transform.translate`
 * places the pair; there is no `center` param.
 *
 * ## Params
 *
 * `driveTeeth`, `pinionTeeth`, `moduleMm` and `thicknessMm` (required — `module`, and V1's
 * `circularPitch` etc., through `src/core/gear/aliases.js`), and shared by both gears:
 * `pressureAngleDeg`, `clearanceMm`, `backlashMm` (the pair's total play, each gear thinned by
 * half, call 4), `helixAngleDeg`, `handedness` (the **drive's**; the pinion gets the opposite
 * hand, as parallel helical shafts need) and `herringbone`. Per gear: `driveProfileShift` /
 * `pinionProfileShift` and `driveBoreMm` / `pinionBoreMm` — a plain `teeth`, `profileShift` or
 * `boreMm` is refused by name, since a pair has one of each per gear. `pitchPlane` is `'xy'`
 * (default), `'xz'` or `'yz'`.
 *
 * Every value is capped (`src/core/gear/limits.js`) and each gear checked exactly as
 * `gear.spur` checks it, then the pair checked by `mesh.js`'s `compatibility`, **before** a
 * record is emitted — so a hostile or unmeshable record fails by name instead of reaching
 * the kernel.
 *
 * @module core/kernel/recipes/gear.pair
 */

import { resolveGearAliases } from '../../gear/aliases.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { GearMeshError } from '../../gear/internal.js'
import { GEAR_LIMITS, GearLimitError, checkGearLimits } from '../../gear/limits.js'
import { PITCH_PLANES, PITCH_PLANE_BASIS, centerDistanceMm, compatibility, meshPhaseDeg } from '../../gear/mesh.js'
import { spur } from './gear.spur.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */
/** @typedef {import('../../gear/mesh.js').PitchPlane} PitchPlane */

const OP = 'gear.pair'

/** The params `gear.pair` takes, canonical spelling. */
export const PAIR_PARAMS = Object.freeze([
  'driveTeeth',
  'pinionTeeth',
  'moduleMm',
  'pressureAngleDeg',
  'clearanceMm',
  'backlashMm',
  'thicknessMm',
  'helixAngleDeg',
  'handedness',
  'herringbone',
  'driveProfileShift',
  'pinionProfileShift',
  'driveBoreMm',
  'pinionBoreMm',
  'pitchPlane',
])

/** Params both gears get as they are. */
const SHARED_PARAMS = Object.freeze(['moduleMm', 'pressureAngleDeg', 'clearanceMm', 'backlashMm', 'thicknessMm', 'helixAngleDeg', 'herringbone'])

/** `src/core/gear/limits.js`'s caps under the pair's names. */
const PAIR_LIMITS = Object.freeze({
  driveTeeth: GEAR_LIMITS.teeth,
  pinionTeeth: GEAR_LIMITS.teeth,
  moduleMm: GEAR_LIMITS.moduleMm,
  pressureAngleDeg: GEAR_LIMITS.pressureAngleDeg,
  helixAngleDeg: GEAR_LIMITS.helixAngleDeg,
  thicknessMm: GEAR_LIMITS.thicknessMm,
  driveProfileShift: GEAR_LIMITS.profileShift,
  pinionProfileShift: GEAR_LIMITS.profileShift,
})

/** @typedef {'drive' | 'pinion'} Role */

/**
 * A `gear.spur` error re-raised as this op's, naming the gear — class, code and param kept
 * (the param under the pair's spelling).
 *
 * @param {unknown} error
 * @param {Role} role
 * @returns {unknown}
 */
function asPairError(error, role) {
  if (!(error instanceof GearParameterError)) return error
  const message = error.message.replace(/^gear\.spur: /, '')
  error.message = `${OP}: ${role} gear — ${message}`
  if (error instanceof GearLimitError) {
    const renamed = { teeth: `${role}Teeth`, profileShift: `${role}ProfileShift`, boreMm: `${role}BoreMm` }[error.param]
    if (renamed) error.param = renamed
  }
  return error
}

/**
 * Expand a `gear.pair` document line into the records that define it.
 *
 * @param {Record<string, unknown>} params See the module doc.
 * @param {unknown} [_tables] Unused — a gear has no size table.
 * @returns {OpRecord[]}
 * @throws {GearParameterError} Named: an alias, limit, bore, twist, dimension or mesh
 *   ({@link GearMeshError}, with `mesh.js`'s code) error.
 */
export function pair(params, _tables) {
  const canonical = resolveGearAliases(params, { op: OP, canonical: PAIR_PARAMS }).params
  checkGearLimits(canonical, { op: OP, required: ['driveTeeth', 'pinionTeeth', 'moduleMm', 'thicknessMm'], limits: PAIR_LIMITS })
  for (const name of ['driveBoreMm', 'pinionBoreMm']) {
    const bore = canonical[name]
    if (bore !== undefined && (typeof bore !== 'number' || !Number.isFinite(bore) || bore < 0)) {
      throw new GearLimitError(`${OP}: ${name} must be a finite number, 0 or more, got ${String(bore)}`, name)
    }
  }
  const pitchPlane = /** @type {PitchPlane} */ (canonical.pitchPlane ?? 'xy')
  if (!PITCH_PLANES.includes(pitchPlane)) {
    throw new GearLimitError(`${OP}: pitchPlane must be ${PITCH_PLANES.map((p) => `'${p}'`).join(', ')}, got ${String(pitchPlane)}`, 'pitchPlane')
  }

  // The drive's hand as given (right by default on a helical pair); the pinion the other.
  const helical = typeof canonical.helixAngleDeg === 'number' && canonical.helixAngleDeg > 0
  const driveHand = canonical.handedness ?? (helical ? 'right' : undefined)
  /**
   * @param {Role} role
   * @returns {Record<string, unknown>}
   */
  const gearParams = (role) => {
    /** @type {Record<string, unknown>} */
    const out = { teeth: canonical[`${role}Teeth`] }
    for (const key of SHARED_PARAMS) {
      if (canonical[key] !== undefined) out[key] = canonical[key]
    }
    if (driveHand !== undefined) out.handedness = role === 'drive' ? driveHand : driveHand === 'right' ? 'left' : 'right'
    const shift = canonical[`${role}ProfileShift`]
    if (shift !== undefined) out.profileShift = shift
    const bore = canonical[`${role}BoreMm`]
    if (bore !== undefined) out.boreMm = bore
    return out
  }
  const driveParams = gearParams('drive')
  const pinionParams = gearParams('pinion')

  // Each gear as gear.spur checks it (bore against root, twist past a turn, a vanished tooth),
  // and then the pair as mesh.js checks it — all before a record exists.
  for (const [role, gear] of /** @type {[Role, Record<string, unknown>][]} */ ([
    ['drive', driveParams],
    ['pinion', pinionParams],
  ])) {
    try {
      spur(gear)
    } catch (error) {
      throw asPairError(error, role)
    }
  }
  /** @param {Record<string, unknown>} gear */
  const meshGear = ({ boreMm: _bore, ...gear }) => /** @type {import('../../gear/mesh.js').MeshGear} */ (gear)
  const drive = meshGear(driveParams)
  const pinion = meshGear(pinionParams)
  const problem = compatibility(drive, pinion).find((r) => r.severity === 'error')
  if (problem) throw new GearMeshError(`${OP}: ${problem.message}`, problem.code)
  const distanceMm = centerDistanceMm(drive, pinion)
  const phaseDeg = meshPhaseDeg(drive, pinion)

  const standUp = pitchPlane !== 'xy'
  const angles = [...PITCH_PLANE_BASIS[pitchPlane].rotateDeg]
  /** @type {OpRecord[]} */
  const records = [{ id: 'driveGear', op: 'gear.spur', params: driveParams, ...(standUp ? {} : { name: 'drive' }) }]
  if (standUp) records.push({ id: 'drive', op: 'transform.rotate', target: 'driveGear', params: { angles }, name: 'drive' })
  records.push(
    { id: 'pinionGear', op: 'gear.spur', params: pinionParams },
    { id: 'pinionTurned', op: 'transform.rotate', target: 'pinionGear', params: { angles: [0, 0, phaseDeg] } },
    {
      id: standUp ? 'pinionPlaced' : 'pinion',
      op: 'transform.translate',
      target: 'pinionTurned',
      params: { vector: [distanceMm, 0, 0] },
      ...(standUp ? {} : { name: 'pinion' }),
    }
  )
  if (standUp) records.push({ id: 'pinion', op: 'transform.rotate', target: 'pinionPlaced', params: { angles: [...angles] }, name: 'pinion' })
  return records
}
