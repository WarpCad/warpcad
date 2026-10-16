// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Worm and worm wheel — derived dimensions, the worm's transverse section, and the helical
 * gear its wheel is (TODO/core-047, `docs/decisions/gears.md`).
 *
 * `drive-mount/DriveMount.jscad` stood a `Parts.Cylinder(6, 86)` in for its right-ascension
 * worm, because V1 had none. A worm is a threaded shaft whose **axial** section is a rack —
 * core-043's straight-sided tooth — wound round it `starts` times; its wheel is a gear whose
 * transverse section meshes that rack.
 *
 * ## What is built: a ZA worm and a non-throated wheel (point contact)
 *
 * - **The worm** is a ZA (straight-sided axial profile) worm. Its axial module `m` and axial
 *   pressure angle `α` are the params; the axial pitch is `π·m`, the lead `starts·π·m`, and the
 *   lead angle `γ = atan(lead / (π·d))` on the pitch diameter `d` (a free param: a worm's
 *   pitch circle is not `z·m`). It is built as its **transverse section twisted once per
 *   lead** (`profile.extrudeLinear`'s `leadMm`): a point at axial offset `a` from a tooth
 *   centre lies, in the section, at bearing `θ = 2π·a / lead`, so the section is the polar
 *   curve `r(θ) = r_p + (s/2 − |θ|·lead/2π) / tan α` clamped between the root and tip circles
 *   — the flanks are Archimedean spirals, the lands arcs. One twisted extrude, no boolean, so
 *   it is watertight by construction ({@link wormSection}).
 * - **The wheel** is a helical `gear.spur` with helix angle `γ` and the **worm's hand**, cut in
 *   the worm's normal module `mₙ = m·cos γ` and normal pressure angle
 *   `αₙ = atan(tan α · cos γ)` ({@link wormWheelGearParams}). Its transverse section is then
 *   exactly the spur gear of module `m` and pressure angle `α` that meshes the worm's axial
 *   rack, so its pitch diameter is `z·m`, the centre distance `(d_worm + d_wheel) / 2`, and
 *   the worm and the wheel are a crossed helical pair whose helix angles (`90° − γ`, `γ`) add
 *   up to the 90° between the shafts — `./mesh.js`'s crossed-axis rules (core-046) place it.
 *   It is **non-throated**: its teeth are straight across the face instead of wrapping round
 *   the worm, so the two touch at a point, not along a line — adequate for a light-duty
 *   printed drive. The **throated** (enveloping) wheel is a stated follow-up, not built here.
 * - **Tooth depth is in the normal module**, as on every helical gear here (`./helix.js`):
 *   addendum `mₙ`, dedendum `mₙ + clearance` (default `0.25·mₙ`). With the wheel cut the same
 *   way, worm tip and wheel root clear by `clearanceMm` each way. The axial tooth is thinned
 *   by `backlashMm / 2` on the pitch line (call 4, as the rack and the gear).
 *
 * ## Self-locking is information, not a guarantee
 *
 * `selfLocking` is `tan γ < μ`: a wheel cannot drive the worm back when the lead angle is
 * below the friction angle. `μ` is an **assumption** (`frictionCoefficient`, default
 * {@link DEFAULT_WORM_FRICTION_COEFFICIENT}); real friction depends on material, finish,
 * lubrication and vibration, and a printed worm under load can creep where this says it
 * will not. The readout carries that sentence ({@link SELF_LOCKING_NOTE}).
 *
 * ## Layout
 *
 * Axis local Z, like every gear here; the section is drawn with tooth 0 centred on +X, and
 * the extrude starts there — so a built worm has tooth 0 on +X at its **bottom** face, the
 * same convention a helical `gear.spur`'s twist starts from (`./mesh.js` relies on it).
 *
 * Framework-free and kernel-free: no Vue, no DOM, no three.js, no `@jscad/modeling`.
 *
 * @module core/gear/worm
 */

import { ADDENDUM_COEFFICIENT, GearParameterError, GearToothVanishedError, defaultClearanceMm, moduleMmToCircularPitchMm } from './dimensions.js'
import { MAX_HELIX_ANGLE_DEG } from './helix.js'
import { rackHalfWidthMmAt } from './involute.js'
import { GearLimitError, WORM_LIMITS, WORM_WHEEL_LIMITS, checkGearLimits } from './limits.js'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const TWO_PI = 2 * Math.PI

/** The most starts a worm may have (TODO/core-047). */
export const WORM_MAX_STARTS = WORM_LIMITS.starts.max

/**
 * The steepest lead angle a worm may have, degrees: its wheel is a helical gear with that
 * helix, and a gear op takes at most `MAX_HELIX_ANGLE_DEG`.
 */
export const MAX_LEAD_ANGLE_DEG = MAX_HELIX_ANGLE_DEG

/**
 * The friction coefficient the self-locking readout assumes when none is given — the
 * conventional figure for a lubricated steel worm on a bronze wheel, which makes the rule
 * of thumb "self-locking below about 5.7°". Printed plastic on plastic is usually higher;
 * this default errs toward *not* calling a worm self-locking.
 */
export const DEFAULT_WORM_FRICTION_COEFFICIENT = 0.1

/** What the self-locking readout always says about itself. */
export const SELF_LOCKING_NOTE =
  'An estimate from the lead angle and an assumed friction coefficient — not a guarantee. ' +
  'Material, finish, lubrication, load and vibration all change it; add a brake if the drive must never back-drive.'

/**
 * @typedef {'shorter-than-lead' | 'pointed-tip' | 'pointed-root'} WormWarning
 * `'shorter-than-lead'`: the worm is shorter than one lead, so once a turn the thread is not
 * at the contact point and the drive loses contact. `'pointed-tip'` / `'pointed-root'`: the
 * axial flanks meet before the tip (or root) line, as on a rack (`./rack.js`).
 */

/** @typedef {'wheel-undercut'} WormWheelWarning Fewer teeth than the undercut limit. */

/**
 * @typedef {object} WormParams
 * @property {number} starts 1…4.
 * @property {number} moduleMm The **axial** module, mm.
 * @property {number} pitchDiameterMm mm.
 * @property {number} [pressureAngleDeg=20] The **axial** pressure angle (the rack tooth's).
 * @property {number} [lengthMm] Needed to build one, not to size one.
 * @property {'right' | 'left'} [handedness='right']
 * @property {number} [clearanceMm] Root depth beyond the addendum. Default `0.25·mₙ`.
 * @property {number} [backlashMm=0] Thins the axial tooth by half of it on the pitch line.
 * @property {number} [frictionCoefficient=0.1] The self-locking readout's assumed μ.
 */

/**
 * @typedef {object} WormDimensions
 * @property {number} starts
 * @property {number} moduleMm Axial.
 * @property {number} pressureAngleDeg Axial.
 * @property {number} normalModuleMm `m·cos γ` — the wheel's module.
 * @property {number} normalPressureAngleDeg `atan(tan α·cos γ)` — the wheel's.
 * @property {number} axialPitchMm `π·m`, thread to thread along the axis.
 * @property {number} leadMm `starts·π·m`, how far one thread advances in one turn.
 * @property {number} pitchDiameterMm
 * @property {number} pitchRadiusMm
 * @property {number} leadAngleDeg γ, from the plane square to the axis.
 * @property {number} helixAngleDeg `90° − γ`, from the axis — the worm read as a helical gear.
 * @property {'right' | 'left'} handedness
 * @property {number} addendumMm
 * @property {number} dedendumMm
 * @property {number} clearanceMm Resolved.
 * @property {number} backlashMm
 * @property {number} axialToothThicknessMm On the pitch line: `π·m / 2 − backlash / 2`.
 * @property {number} tipRadiusMm As built (a pointed tooth's apex).
 * @property {number} rootRadiusMm As built (a pointed space's apex).
 * @property {number} minPitchDiameterMm The smallest pitch diameter with a root circle.
 * @property {boolean} pointedTip
 * @property {boolean} pointedRoot
 * @property {number | undefined} lengthMm
 * @property {number | undefined} turns `lengthMm / leadMm`.
 * @property {number} frictionCoefficient Resolved.
 * @property {boolean} selfLocking `tan γ < μ` — information, not a guarantee.
 * @property {string} selfLockingNote {@link SELF_LOCKING_NOTE}.
 * @property {WormWarning[]} warnings
 */

/**
 * @param {unknown} value
 * @returns {number}
 */
const num = (value) => /** @type {number} */ (value)

/**
 * A worm's derived dimensions. Hostile values are refused first (`./limits.js`'s
 * `WORM_LIMITS`), before any arithmetic.
 *
 * @param {WormParams} params
 * @param {{ op?: string }} [options] `op` prefixes a limit error (default `'worm'`).
 * @returns {WormDimensions}
 * @throws {GearLimitError} a value outside its cap or missing; a pitch diameter with no root
 *   circle, or a lead angle past {@link MAX_LEAD_ANGLE_DEG} (param `pitchDiameterMm`).
 * @throws {GearToothVanishedError} a backlash that leaves no tooth.
 */
export function wormDimensions(params, { op = 'worm' } = {}) {
  const p = /** @type {Record<string, unknown>} */ (params)
  checkGearLimits(p, { op, required: ['starts', 'moduleMm', 'pitchDiameterMm'], limits: WORM_LIMITS })
  const starts = num(p.starts)
  const moduleMm = num(p.moduleMm)
  const pitchDiameterMm = num(p.pitchDiameterMm)
  const pressureAngleDeg = num(p.pressureAngleDeg ?? 20)
  const handedness = /** @type {'right' | 'left'} */ (p.handedness ?? 'right')
  const backlashMm = num(p.backlashMm ?? 0)
  const lengthMm = /** @type {number | undefined} */ (p.lengthMm)
  const frictionCoefficient = num(p.frictionCoefficient ?? DEFAULT_WORM_FRICTION_COEFFICIENT)

  const axialPitchMm = moduleMmToCircularPitchMm(moduleMm)
  const leadMm = starts * axialPitchMm
  // tan γ = lead / (π·d) = starts·m / d — taken as that ratio, not through π, so it is exact.
  const tanGamma = (starts * moduleMm) / pitchDiameterMm
  const leadAngleDeg = Math.atan(tanGamma) * RAD_TO_DEG
  if (leadAngleDeg > MAX_LEAD_ANGLE_DEG) {
    throw new GearLimitError(
      `${op}: a ${starts}-start worm of module ${moduleMm} on a ${pitchDiameterMm} mm pitch diameter has a lead angle of ` +
        `${leadAngleDeg.toFixed(2)}° — steeper than ${MAX_LEAD_ANGLE_DEG}°, the most its wheel's helix can be; ` +
        'raise pitchDiameterMm or use fewer starts',
      'pitchDiameterMm'
    )
  }
  const cosGamma = Math.cos(leadAngleDeg * DEG_TO_RAD)
  const normalModuleMm = moduleMm * cosGamma
  const normalPressureAngleDeg = Math.atan(Math.tan(pressureAngleDeg * DEG_TO_RAD) * cosGamma) * RAD_TO_DEG

  const clearanceMm = num(p.clearanceMm ?? defaultClearanceMm(normalModuleMm))
  const addendumMm = ADDENDUM_COEFFICIENT * normalModuleMm
  const dedendumMm = normalModuleMm + clearanceMm
  if (!(addendumMm > -dedendumMm)) {
    throw new GearToothVanishedError(`${op}: the root line is above the tip line — raise clearanceMm`)
  }
  const pitchRadiusMm = pitchDiameterMm / 2
  const minPitchDiameterMm = 2 * dedendumMm

  const axialToothThicknessMm = axialPitchMm / 2 - backlashMm / 2
  if (!(axialToothThicknessMm > 0)) {
    throw new GearToothVanishedError(`${op}: backlash leaves no thread on the pitch line — reduce backlashMm`)
  }
  if (!(axialToothThicknessMm < axialPitchMm)) {
    throw new GearParameterError(`${op}: a negative backlash that large leaves no space between the threads`)
  }

  // The axial section is a rack (`./involute.js`'s straight flank), heights from the pitch line.
  const flank = { toothThicknessAtPitchMm: axialToothThicknessMm, transversePressureAngleDeg: pressureAngleDeg }
  const tanAlpha = Math.tan(pressureAngleDeg * DEG_TO_RAD)
  let tipHeightMm = addendumMm
  const pointedTip = !(rackHalfWidthMmAt(flank, tipHeightMm) > 0)
  if (pointedTip) tipHeightMm = axialToothThicknessMm / 2 / tanAlpha
  let rootHeightMm = -dedendumMm
  const pointedRoot = rackHalfWidthMmAt(flank, rootHeightMm) >= axialPitchMm / 2
  if (pointedRoot) rootHeightMm = (axialToothThicknessMm / 2 - axialPitchMm / 2) / tanAlpha

  const rootRadiusMm = pitchRadiusMm + rootHeightMm
  if (!(rootRadiusMm > 0)) {
    throw new GearLimitError(
      `${op}: pitchDiameterMm ${pitchDiameterMm} leaves no root circle — the root diameter would be ` +
        `${(2 * rootRadiusMm).toFixed(3)} mm; pitchDiameterMm must be more than ${minPitchDiameterMm.toFixed(3)} mm (twice the dedendum)`,
      'pitchDiameterMm'
    )
  }

  /** @type {WormWarning[]} */
  const warnings = []
  if (lengthMm !== undefined && lengthMm < leadMm) warnings.push('shorter-than-lead')
  if (pointedTip) warnings.push('pointed-tip')
  if (pointedRoot) warnings.push('pointed-root')

  return {
    starts,
    moduleMm,
    pressureAngleDeg,
    normalModuleMm,
    normalPressureAngleDeg,
    axialPitchMm,
    leadMm,
    pitchDiameterMm,
    pitchRadiusMm,
    leadAngleDeg,
    helixAngleDeg: 90 - leadAngleDeg,
    handedness,
    addendumMm,
    dedendumMm,
    clearanceMm,
    backlashMm,
    axialToothThicknessMm,
    tipRadiusMm: pitchRadiusMm + tipHeightMm,
    rootRadiusMm,
    minPitchDiameterMm,
    pointedTip,
    pointedRoot,
    lengthMm,
    turns: lengthMm === undefined ? undefined : lengthMm / leadMm,
    frictionCoefficient,
    selfLocking: tanGamma < frictionCoefficient,
    selfLockingNote: SELF_LOCKING_NOTE,
    warnings,
  }
}

/**
 * @typedef {object} WormWheelParams
 * @property {number} teeth The wheel's.
 * @property {number} starts The worm's.
 * @property {number} moduleMm The worm's axial module — the wheel's transverse module.
 * @property {number} wormPitchDiameterMm
 * @property {number} [pressureAngleDeg=20] The worm's axial pressure angle.
 * @property {'right' | 'left'} [handedness='right'] The worm's — and so the wheel's.
 * @property {number} [faceWidthMm] Needed to build one.
 * @property {number} [boreMm]
 * @property {number} [clearanceMm]
 * @property {number} [backlashMm]
 */

/**
 * @typedef {object} WormWheelDimensions
 * @property {number} teeth
 * @property {number} leadAngleDeg The worm's γ.
 * @property {number} helixAngleDeg γ: the wheel's helix *is* the worm's lead angle.
 * @property {'right' | 'left'} handedness The worm's.
 * @property {number} normalModuleMm
 * @property {number} normalPressureAngleDeg
 * @property {number} transverseModuleMm The worm's axial module.
 * @property {number} pitchDiameterMm `z·m`.
 * @property {number} ratio `teeth / starts` — worm turns per wheel turn.
 * @property {number} centerDistanceMm `(d_worm + d_wheel) / 2`.
 * @property {number} minTeethWithoutUndercut `2·cos γ / sin² α`, rounded (17 at 20°).
 * @property {WormWheelWarning[]} warnings
 */

/**
 * The wheel a worm needs: its helix is the worm's lead angle (the same hand), its module and
 * pressure angle the worm's normal ones. Refuses what {@link wormDimensions} refuses.
 *
 * @param {WormWheelParams} params
 * @param {{ op?: string }} [options] `op` prefixes a limit error (default `'worm wheel'`).
 * @returns {WormWheelDimensions}
 * @throws {GearLimitError} as {@link wormDimensions}, and for a missing or out-of-range
 *   `teeth`, `starts`, `moduleMm`, `wormPitchDiameterMm` or `faceWidthMm`.
 */
export function wormWheelDimensions(params, { op = 'worm wheel' } = {}) {
  const p = /** @type {Record<string, unknown>} */ (params)
  checkGearLimits(p, { op, required: ['teeth', 'starts', 'moduleMm', 'wormPitchDiameterMm'], limits: WORM_WHEEL_LIMITS })
  const worm = wormDimensions(wormParamsOf(p), { op })
  const teeth = num(p.teeth)
  const pitchDiameterMm = teeth * worm.moduleMm
  const gamma = worm.leadAngleDeg * DEG_TO_RAD
  // Undercut on the wheel's transverse section: addendum mₙ = m·cos γ in units of its module m.
  const minTeethWithoutUndercut = Math.round((2 * ADDENDUM_COEFFICIENT * Math.cos(gamma)) / Math.sin(worm.pressureAngleDeg * DEG_TO_RAD) ** 2)
  /** @type {WormWheelWarning[]} */
  const warnings = teeth < minTeethWithoutUndercut ? ['wheel-undercut'] : []
  return {
    teeth,
    leadAngleDeg: worm.leadAngleDeg,
    helixAngleDeg: worm.leadAngleDeg,
    handedness: worm.handedness,
    normalModuleMm: worm.normalModuleMm,
    normalPressureAngleDeg: worm.normalPressureAngleDeg,
    transverseModuleMm: worm.moduleMm,
    pitchDiameterMm,
    ratio: teeth / worm.starts,
    centerDistanceMm: (worm.pitchDiameterMm + pitchDiameterMm) / 2,
    minTeethWithoutUndercut,
    warnings,
  }
}

/**
 * The worm half of a wheel's params, under the worm's own names.
 *
 * @param {Record<string, unknown>} p
 * @returns {WormParams}
 */
function wormParamsOf(p) {
  /** @type {Record<string, unknown>} */
  const out = { starts: p.starts, moduleMm: p.moduleMm, pitchDiameterMm: p.wormPitchDiameterMm }
  for (const key of ['pressureAngleDeg', 'handedness', 'clearanceMm', 'backlashMm']) {
    if (p[key] !== undefined) out[key] = p[key]
  }
  return /** @type {WormParams} */ (/** @type {unknown} */ (out))
}

/**
 * The `gear.spur` params of the wheel a worm needs — a helical gear at the worm's lead angle,
 * the worm's hand, in its normal module and pressure angle; `faceWidthMm` is its thickness.
 * `boreMm`, `clearanceMm` and `backlashMm` pass through when given.
 *
 * @param {WormWheelParams} params
 * @param {{ op?: string }} [options] As {@link wormWheelDimensions}.
 * @returns {Record<string, unknown>} Canonical `gear.spur` params.
 * @throws {GearLimitError} as {@link wormWheelDimensions}.
 */
export function wormWheelGearParams(params, options) {
  const wheel = wormWheelDimensions(params, options)
  const p = /** @type {Record<string, unknown>} */ (params)
  /** @type {Record<string, unknown>} */
  const out = {
    teeth: wheel.teeth,
    moduleMm: wheel.normalModuleMm,
    pressureAngleDeg: wheel.normalPressureAngleDeg,
    helixAngleDeg: wheel.helixAngleDeg,
    handedness: wheel.handedness,
  }
  if (p.faceWidthMm !== undefined) out.thicknessMm = p.faceWidthMm
  for (const key of ['boreMm', 'clearanceMm', 'backlashMm']) {
    if (p[key] !== undefined) out[key] = p[key]
  }
  return out
}

/** @typedef {[number, number]} Vec2Mm */

/**
 * The worm's transverse section at its bottom face: a closed CCW outline with tooth 0
 * centred on +X, `starts` teeth round it (module doc). Sampled at `pointsPerTurn` points per
 * full turn — each land and each flank gets its share, at least one segment, the tip land an
 * even number so a vertex sits on each tooth's centre line — plus the four corners of every
 * tooth exactly. The resolution is the caller's to choose (the kernel, from the design's
 * policy); both hands share the section — the hand is the twist's.
 *
 * @param {WormParams & { pointsPerTurn: number }} params
 * @returns {WormDimensions & { outline: Vec2Mm[] }}
 * @throws {GearParameterError} as {@link wormDimensions}, and for a `pointsPerTurn` that is
 *   not a whole number from 3 up.
 */
export function wormSection(params) {
  const { pointsPerTurn, ...wormParams } = params
  if (typeof pointsPerTurn !== 'number' || !Number.isInteger(pointsPerTurn) || pointsPerTurn < 3) {
    throw new GearParameterError(`pointsPerTurn must be a whole number, 3 or more, got ${String(pointsPerTurn)}`)
  }
  const dims = wormDimensions(/** @type {WormParams} */ (wormParams))
  const { starts, leadMm, pitchRadiusMm, axialToothThicknessMm, tipRadiusMm, rootRadiusMm, pressureAngleDeg } = dims
  const tanAlpha = Math.tan(pressureAngleDeg * DEG_TO_RAD)
  const toBearing = TWO_PI / leadMm
  // Half the tooth, as a bearing, at the tip and at the root (0 / half a period when pointed).
  const tipHalfRad = dims.pointedTip ? 0 : (axialToothThicknessMm / 2 - (tipRadiusMm - pitchRadiusMm) * tanAlpha) * toBearing
  const rootHalfRad = dims.pointedRoot ? Math.PI / starts : (axialToothThicknessMm / 2 - (rootRadiusMm - pitchRadiusMm) * tanAlpha) * toBearing
  const periodRad = TWO_PI / starts
  /** @param {number} spanRad */
  const segmentsOver = (spanRad) => Math.max(1, Math.ceil((pointsPerTurn * spanRad) / TWO_PI))
  /** The flank radius at bearing `theta` from the tooth's centre line. */
  const flankRadius = (/** @type {number} */ theta) =>
    Math.min(tipRadiusMm, Math.max(rootRadiusMm, pitchRadiusMm + (axialToothThicknessMm / 2 - Math.abs(theta) / toBearing) / tanAlpha))

  // One tooth, from the start of its rising flank (−rootHalf) round to the next tooth's: each
  // stretch emits its start point and its interior, never its end (the next stretch's start).
  /** @type {[number, number][]} [bearing, radius] */
  const tooth = []
  /**
   * @param {number} fromRad
   * @param {number} toRad
   * @param {number} segments
   * @param {(theta: number) => number} radiusAt
   */
  const stretch = (fromRad, toRad, segments, radiusAt) => {
    // An empty (pointed) stretch, allowing for the rounding in `periodRad − 2·rootHalfRad`.
    if (!(toRad - fromRad > 1e-12)) return
    for (let i = 0; i < segments; i++) {
      const theta = fromRad + ((toRad - fromRad) * i) / segments
      tooth.push([theta, radiusAt(theta)])
    }
  }
  const flankSegments = segmentsOver(rootHalfRad - tipHalfRad)
  const tipSegments = 2 * segmentsOver(tipHalfRad)
  // A pointed tip has no land: the falling flank's first point is the apex. A pointed root has
  // none either: the next tooth's rising flank starts on it.
  stretch(-rootHalfRad, -tipHalfRad, flankSegments, flankRadius)
  stretch(-tipHalfRad, tipHalfRad, tipSegments, () => tipRadiusMm)
  stretch(tipHalfRad, rootHalfRad, flankSegments, flankRadius)
  stretch(rootHalfRad, periodRad - rootHalfRad, segmentsOver(periodRad - 2 * rootHalfRad), () => rootRadiusMm)

  /** @type {Vec2Mm[]} */
  const outline = []
  for (let k = 0; k < starts; k++) {
    for (const [theta, r] of tooth) {
      const bearing = theta + k * periodRad
      outline.push([r * Math.cos(bearing), r * Math.sin(bearing)])
    }
  }
  return { ...dims, outline }
}
