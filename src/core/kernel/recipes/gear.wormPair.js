// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `gear.wormPair` composite recipe — a worm and its wheel, already meshed (TODO/core-047,
 * `docs/decisions/gears.md`).
 *
 * The placement is `src/core/gear/mesh.js`'s {@link meshPlacement} with the worm as a gear
 * kind of its own — the crossed-axis rules `core-046` wrote for helical gears, which the
 * interactive *Mesh* operation (`ui-058`) calls too, so the two cannot disagree. Like every
 * composite it builds nothing and imports no `@jscad/modeling`; both numbers come from the
 * params, never from measuring the built parts (`docs/decisions/composite-recipe-geometry.md`).
 *
 * ## The expansion
 *
 * A `gear.wormWheel` record, named **`wheel`**: axis +Z, centred on the origin, exactly a lone
 * wheel. A `gear.worm` record, then a `transform.rotate` that turns it about its own axis to
 * the mesh phase, a `transform.rotate` that stands it square to the wheel (its axis along +Y
 * for a right hand, −Y for a left — the wheel's axis turned ∓90° about the line of centres),
 * and a `transform.translate` one centre distance, `(d_worm + d_wheel) / 2`, along +X: named
 * **`worm`**. The parts' hidden `bore` / `pitch` stay inside each value, as `gear.pair` keeps
 * its spurs'. The Library's trailing `transform.translate` places the pair; no `center` param.
 *
 * ## Params
 *
 * Shared — the worm's, which the wheel is cut to: `starts`, `moduleMm` (axial), and optionally
 * `pressureAngleDeg` (axial), `handedness`, `clearanceMm`, `backlashMm` (the pair's total
 * play, each part thinned by half, call 4). The worm's: `wormPitchDiameterMm`, `wormLengthMm`,
 * `wormBoreMm`, `frictionCoefficient` (the self-locking readout's assumption). The wheel's:
 * `wheelTeeth`, `faceWidthMm`, `wheelBoreMm`. A plain `teeth`, `boreMm`, `pitchDiameterMm` or
 * `lengthMm` is refused by name: on a pair it would not say which part it means.
 *
 * Every value is capped, each part checked exactly as its own recipe checks it, then the pair
 * by `mesh.js` — all **before** a record is emitted.
 *
 * @module core/kernel/recipes/gear.wormPair
 */

import { resolveGearAliases } from '../../gear/aliases.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { GearMeshError } from '../../gear/internal.js'
import { GearLimitError, WORM_LIMITS, WORM_WHEEL_LIMITS, checkGearLimits } from '../../gear/limits.js'
import { compatibility, meshPlacement } from '../../gear/mesh.js'
import { wormWheelGearParams } from '../../gear/worm.js'
import { worm } from './gear.worm.js'
import { wormWheel } from './gear.wormWheel.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'gear.wormPair'

/** The params `gear.wormPair` takes, canonical spelling. */
export const WORM_PAIR_PARAMS = Object.freeze([
  'starts',
  'moduleMm',
  'pressureAngleDeg',
  'handedness',
  'clearanceMm',
  'backlashMm',
  'wormPitchDiameterMm',
  'wormLengthMm',
  'wormBoreMm',
  'frictionCoefficient',
  'wheelTeeth',
  'faceWidthMm',
  'wheelBoreMm',
])

/** Params both parts get as they are. */
const SHARED_PARAMS = Object.freeze(['starts', 'moduleMm', 'pressureAngleDeg', 'handedness', 'clearanceMm', 'backlashMm'])

/** `src/core/gear/limits.js`'s caps under the pair's names. */
const PAIR_LIMITS = Object.freeze({
  starts: WORM_LIMITS.starts,
  moduleMm: WORM_LIMITS.moduleMm,
  pressureAngleDeg: WORM_LIMITS.pressureAngleDeg,
  wormPitchDiameterMm: WORM_LIMITS.pitchDiameterMm,
  wormLengthMm: WORM_LIMITS.lengthMm,
  frictionCoefficient: WORM_LIMITS.frictionCoefficient,
  wheelTeeth: WORM_WHEEL_LIMITS.teeth,
  faceWidthMm: WORM_WHEEL_LIMITS.faceWidthMm,
})

/** @typedef {'worm' | 'wheel'} Role */

/**
 * A part recipe's error re-raised as this op's, naming the part — class, code and param kept.
 *
 * @param {unknown} error
 * @param {Role} role
 * @returns {unknown}
 */
function asPairError(error, role) {
  if (!(error instanceof GearParameterError)) return error
  const message = error.message.replace(/^gear\.worm(?:Wheel)?: /, '')
  error.message = `${OP}: ${role} — ${message}`
  return error
}

/**
 * Expand a `gear.wormPair` document line into the records that define it.
 *
 * @param {Record<string, unknown>} params See the module doc.
 * @param {unknown} [_tables] Unused — a gear has no size table.
 * @returns {OpRecord[]}
 * @throws {GearParameterError} Named: an alias, limit, root, lead-angle, bore or mesh
 *   ({@link GearMeshError}, with `mesh.js`'s code) error.
 */
export function wormPair(params, _tables) {
  const canonical = resolveGearAliases(params, { op: OP, canonical: WORM_PAIR_PARAMS }).params
  checkGearLimits(canonical, {
    op: OP,
    required: ['starts', 'moduleMm', 'wormPitchDiameterMm', 'wormLengthMm', 'wheelTeeth', 'faceWidthMm'],
    limits: PAIR_LIMITS,
  })
  for (const name of ['wormBoreMm', 'wheelBoreMm']) {
    const bore = canonical[name]
    if (bore !== undefined && (typeof bore !== 'number' || !Number.isFinite(bore) || bore < 0)) {
      throw new GearLimitError(`${OP}: ${name} must be a finite number, 0 or more, got ${String(bore)}`, name)
    }
  }

  /** @type {Record<string, unknown>} */
  const shared = {}
  for (const key of SHARED_PARAMS) {
    if (canonical[key] !== undefined) shared[key] = canonical[key]
  }
  /** @type {Record<string, unknown>} */
  const wheelParams = {
    teeth: canonical.wheelTeeth,
    ...shared,
    wormPitchDiameterMm: canonical.wormPitchDiameterMm,
    faceWidthMm: canonical.faceWidthMm,
    ...(canonical.wheelBoreMm === undefined ? {} : { boreMm: canonical.wheelBoreMm }),
  }
  /** @type {Record<string, unknown>} */
  const wormParams = {
    ...shared,
    pitchDiameterMm: canonical.wormPitchDiameterMm,
    lengthMm: canonical.wormLengthMm,
    ...(canonical.wormBoreMm === undefined ? {} : { boreMm: canonical.wormBoreMm }),
    ...(canonical.frictionCoefficient === undefined ? {} : { frictionCoefficient: canonical.frictionCoefficient }),
  }

  // Each part as its own recipe checks it (root, lead angle, bore, twist), then the pair as
  // mesh.js checks it — all before a record exists.
  for (const [role, check] of /** @type {[Role, () => unknown][]} */ ([
    ['worm', () => worm(wormParams)],
    ['wheel', () => wormWheel(wheelParams)],
  ])) {
    try {
      check()
    } catch (error) {
      throw asPairError(error, role)
    }
  }
  const { boreMm: _wheelBore, ...wheelGear } = wormWheelGearParams(/** @type {any} */ (wheelParams))
  const { boreMm: _wormBore, frictionCoefficient: _mu, ...wormGear } = /** @type {Record<string, unknown>} */ ({ kind: 'worm', ...wormParams })
  const wheel = /** @type {import('../../gear/mesh.js').MeshGear} */ (wheelGear)
  const wormMesh = /** @type {import('../../gear/mesh.js').MeshGear} */ (wormGear)
  const problem = compatibility(wheel, wormMesh).find((r) => r.severity === 'error')
  if (problem) throw new GearMeshError(`${OP}: ${problem.message}`, problem.code)
  const placed = meshPlacement(wheel, wormMesh)

  return [
    { id: 'wheel', op: 'gear.wormWheel', params: wheelParams, name: 'wheel' },
    { id: 'wormGear', op: 'gear.worm', params: wormParams },
    { id: 'wormTurned', op: 'transform.rotate', target: 'wormGear', params: { angles: [0, 0, placed.phaseDeg] } },
    { id: 'wormStood', op: 'transform.rotate', target: 'wormTurned', params: { angles: [...placed.orientationDeg] } },
    { id: 'worm', op: 'transform.translate', target: 'wormStood', params: { vector: [...placed.centerMm] }, name: 'worm' },
  ]
}
