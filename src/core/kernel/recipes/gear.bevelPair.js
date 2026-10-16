// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `gear.bevelPair` composite recipe — two straight bevel gears, already meshed, with their
 * apexes on the origin (TODO/core-046, `docs/decisions/gears.md`).
 *
 * V1's `drive-wheel` meshed its bevels by hand: `rotateY(±90/180)`, then
 * `snap(..., ±addendum)` to fudge the apexes together, and a hand-tuned pinion phase. Here
 * the placement is `src/core/gear/mesh.js`'s {@link bevelMeshPlacement}, the function the
 * interactive *Mesh* operation (`ui-058`) calls too, so the two cannot disagree. Like every
 * composite it builds nothing: it expands one param record into op records the same fold
 * replays, and imports no `@jscad/modeling`.
 *
 * ## The expansion
 *
 * Two `gear.bevel` records (`recipes/gear.bevel.js`, one expansion, not a copy of it), each
 * cut for the other's tooth count, then for the pinion a `transform.rotate` about its own
 * axis to the mesh phase and a `transform.rotate` that stands it up Σ from the drive (about
 * +Y, so the pinion leans toward +X). Both are rotations about the origin, where every
 * `gear.bevel` has its apex — so the apexes coincide by construction and there is no
 * translate. Both numbers come **from the params**, never from measuring the built gears
 * (`docs/decisions/composite-recipe-geometry.md`).
 *
 * Two named parts, **`drive`** (axis +Z, large end up, exactly a lone `gear.bevel`) and
 * **`pinion`**. The nested bevels' hidden `bore`, `pitchCone` and `apex` parts stay inside
 * each gear's value, as `gear.pair` keeps its spurs' — `ui-057` / `ui-058` may want them
 * surfaced. The Library's trailing `transform.translate` places the pair; there is no
 * `center` param. A larger train (drive-wheel's four bevels) is a *document* of pairs, not a
 * recipe: see `__fixtures__/gear.bevelPair.drive-wheel-train.json`.
 *
 * ## Params
 *
 * `driveTeeth`, `pinionTeeth` and `moduleMm` (required; the module at the large end —
 * `module` and V1's `circularPitch` come through `src/core/gear/aliases.js`), and shared by
 * both gears: `shaftAngleDeg` (Σ, default 90), `faceWidthMm` (default `min(L/3, 10·m)`, the
 * same for both since they share the cone distance `L`), `pressureAngleDeg`, `clearanceMm`,
 * `backlashMm` (the pair's total play, each gear thinned by half, call 4). Per gear:
 * `driveBoreMm` / `pinionBoreMm` and `driveHubLengthMm` / `pinionHubLengthMm`. A plain
 * `teeth`, `mateTeeth`, `boreMm` or `hubLengthMm` is refused by name: on a pair it would not
 * say which gear it means, and each gear's `mateTeeth` is the other's count.
 *
 * Every value is capped (`src/core/gear/limits.js`), each gear checked exactly as `gear.bevel`
 * checks it (crown gear, face width, bore), then the pair by `mesh.js`'s
 * {@link bevelCompatibility} — all **before** a record is emitted.
 *
 * @module core/kernel/recipes/gear.bevelPair
 */

import { resolveGearAliases } from '../../gear/aliases.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { GearMeshError } from '../../gear/internal.js'
import { BEVEL_LIMITS, GearLimitError, checkGearLimits } from '../../gear/limits.js'
import { bevelCompatibility, bevelMeshPlacement } from '../../gear/mesh.js'
import { bevel } from './gear.bevel.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'gear.bevelPair'

/** The params `gear.bevelPair` takes, canonical spelling. */
export const BEVEL_PAIR_PARAMS = Object.freeze([
  'driveTeeth',
  'pinionTeeth',
  'moduleMm',
  'shaftAngleDeg',
  'faceWidthMm',
  'pressureAngleDeg',
  'clearanceMm',
  'backlashMm',
  'driveBoreMm',
  'pinionBoreMm',
  'driveHubLengthMm',
  'pinionHubLengthMm',
])

/** Params both gears get as they are. */
const SHARED_PARAMS = Object.freeze(['moduleMm', 'shaftAngleDeg', 'faceWidthMm', 'pressureAngleDeg', 'clearanceMm', 'backlashMm'])

/** `src/core/gear/limits.js`'s bevel caps under the pair's names. */
const PAIR_LIMITS = Object.freeze({
  driveTeeth: BEVEL_LIMITS.teeth,
  pinionTeeth: BEVEL_LIMITS.teeth,
  moduleMm: BEVEL_LIMITS.moduleMm,
  pressureAngleDeg: BEVEL_LIMITS.pressureAngleDeg,
  faceWidthMm: BEVEL_LIMITS.faceWidthMm,
  driveHubLengthMm: BEVEL_LIMITS.hubLengthMm,
  pinionHubLengthMm: BEVEL_LIMITS.hubLengthMm,
})

/** @typedef {'drive' | 'pinion'} Role */

/**
 * A `gear.bevel` error re-raised as this op's, naming the gear — class, code and param kept
 * (the param under the pair's spelling).
 *
 * @param {unknown} error
 * @param {Role} role
 * @returns {unknown}
 */
function asPairError(error, role) {
  if (!(error instanceof GearParameterError)) return error
  const message = error.message.replace(/^gear\.bevel: /, '')
  error.message = `${OP}: ${role} gear — ${message}`
  if (error instanceof GearLimitError) {
    const mate = role === 'drive' ? 'pinion' : 'drive'
    const renamed = { teeth: `${role}Teeth`, mateTeeth: `${mate}Teeth`, boreMm: `${role}BoreMm`, hubLengthMm: `${role}HubLengthMm` }[error.param]
    if (renamed) error.param = renamed
  }
  return error
}

/**
 * Expand a `gear.bevelPair` document line into the records that define it.
 *
 * @param {Record<string, unknown>} params See the module doc.
 * @param {unknown} [_tables] Unused — a gear has no size table.
 * @returns {OpRecord[]}
 * @throws {GearParameterError} Named: an alias, limit, bore, shaft-angle, face-width,
 *   crown-gear or mesh ({@link GearMeshError}, with `mesh.js`'s code) error.
 */
export function bevelPair(params, _tables) {
  const canonical = resolveGearAliases(params, { op: OP, canonical: BEVEL_PAIR_PARAMS }).params
  checkGearLimits(canonical, { op: OP, required: ['driveTeeth', 'pinionTeeth', 'moduleMm'], limits: PAIR_LIMITS })
  for (const name of ['driveBoreMm', 'pinionBoreMm']) {
    const bore = canonical[name]
    if (bore !== undefined && (typeof bore !== 'number' || !Number.isFinite(bore) || bore < 0)) {
      throw new GearLimitError(`${OP}: ${name} must be a finite number, 0 or more, got ${String(bore)}`, name)
    }
  }

  /**
   * @param {Role} role
   * @returns {Record<string, unknown>}
   */
  const gearParams = (role) => {
    const mate = role === 'drive' ? 'pinion' : 'drive'
    /** @type {Record<string, unknown>} */
    const out = { teeth: canonical[`${role}Teeth`], mateTeeth: canonical[`${mate}Teeth`] }
    for (const key of SHARED_PARAMS) {
      if (canonical[key] !== undefined) out[key] = canonical[key]
    }
    const bore = canonical[`${role}BoreMm`]
    if (bore !== undefined) out.boreMm = bore
    const hub = canonical[`${role}HubLengthMm`]
    if (hub !== undefined) out.hubLengthMm = hub
    return out
  }
  const driveParams = gearParams('drive')
  const pinionParams = gearParams('pinion')

  // Each gear as gear.bevel checks it (crown gear, face width, bore against the small end),
  // then the pair as mesh.js checks it — all before a record exists.
  for (const [role, gear] of /** @type {[Role, Record<string, unknown>][]} */ ([
    ['drive', driveParams],
    ['pinion', pinionParams],
  ])) {
    try {
      bevel(gear)
    } catch (error) {
      throw asPairError(error, role)
    }
  }
  /** @param {Record<string, unknown>} gear */
  const meshGear = ({ boreMm: _bore, hubLengthMm: _hub, ...gear }) => /** @type {import('../../gear/mesh.js').BevelMeshGear} */ (gear)
  const drive = meshGear(driveParams)
  const pinion = meshGear(pinionParams)
  const problem = bevelCompatibility(drive, pinion).find((r) => r.severity === 'error')
  if (problem) throw new GearMeshError(`${OP}: ${problem.message}`, problem.code)
  const placed = bevelMeshPlacement(drive, pinion)

  return [
    { id: 'driveGear', op: 'gear.bevel', params: driveParams, name: 'drive' },
    { id: 'pinionGear', op: 'gear.bevel', params: pinionParams },
    { id: 'pinionTurned', op: 'transform.rotate', target: 'pinionGear', params: { angles: [0, 0, placed.phaseDeg] } },
    { id: 'pinion', op: 'transform.rotate', target: 'pinionTurned', params: { angles: [...placed.rotateDeg] }, name: 'pinion' },
  ]
}
