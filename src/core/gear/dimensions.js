// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Spur-gear derived dimensions — the **one** place a gear's pitch, base, tip and root
 * circles, and the generating rack's geometry, are computed (TODO/core-040).
 *
 * The Inspector readout (`ui-057`), the mesh math (`core-044`) and the profile generator
 * (`./involute.js`) all call {@link gearDimensions}, so a number shown to the user can
 * never disagree with the solid built from it.
 *
 * Vocabulary is `docs/decisions/gears.md` Decision 2: the stored size is `moduleMm`;
 * circular pitch and diametral pitch are only ever conversions, named here, at the
 * import / Inspector boundary. Backlash follows call 4 (total circumferential play of a
 * pair, each gear thinned by half of it at the pitch circle), clearance follows call 5
 * (default `0.25 · module`, ISO 53's 1.25 m dedendum).
 *
 * Framework-free (CLAUDE.md Project Structure): no Vue, no DOM, no three.js and no
 * `@jscad/modeling`. Every length is millimetres, every angle carries its unit in its name.
 *
 * @module core/gear/dimensions
 */

import { transverseModuleMm, transversePressureAngleDeg } from './helix.js'

/** ISO 53 addendum, in modules. */
export const ADDENDUM_COEFFICIENT = 1
/**
 * ISO 53 dedendum, in modules, when `clearanceMm` is not given: `1 + 0.25`. An explicit
 * `clearanceMm` replaces the `0.25 m` part, exactly as V1's `clearance` did.
 */
export const DEDENDUM_COEFFICIENT = 1.25
/** Pressure-angle range accepted, degrees (inclusive). */
export const PRESSURE_ANGLE_RANGE_DEG = Object.freeze([0, 45])
/**
 * Helix-angle range accepted, degrees (inclusive): what still makes a gear. The registry's
 * tighter cap (45°, `./limits.js`) is what an op accepts; a hand is `handedness`, never a sign.
 */
export const HELIX_ANGLE_RANGE_DEG = Object.freeze([0, 60])

const DEG_TO_RAD = Math.PI / 180

/** A gear parameter that cannot produce a gear, with a message safe to show as-is. */
export class GearParameterError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'GearParameterError'
  }
}

/** The parameters are well-formed but leave no tooth (e.g. a backlash wider than the tooth). */
export class GearToothVanishedError extends GearParameterError {
  /** @param {string} message */
  constructor(message) {
    super(message)
    this.name = 'GearToothVanishedError'
  }
}

// --- unit conversions (Decision 2) ------------------------------------------------

/**
 * @param {number} circularPitchMm Pitch-circle distance tooth to tooth, mm.
 * @returns {number} module, mm
 */
export function circularPitchMmToModuleMm(circularPitchMm) {
  return circularPitchMm / Math.PI
}

/**
 * @param {number} moduleMm
 * @returns {number} circular pitch, mm
 */
export function moduleMmToCircularPitchMm(moduleMm) {
  return Math.PI * moduleMm
}

/**
 * A standard (inch) diametral pitch — teeth per inch of pitch diameter — as a module.
 *
 * @param {number} diametralPitchPerInch
 * @returns {number} module, mm
 */
export function diametralPitchPerInchToModuleMm(diametralPitchPerInch) {
  return 25.4 / diametralPitchPerInch
}

/**
 * V1's `diametralPitch`, which is **1/module in 1/mm** (`π / circularPitch` with
 * `circularPitch` in mm), not teeth per inch — Decision 5 defect 7.
 *
 * @param {number} v1DiametralPitchPerMm
 * @returns {number} module, mm
 */
export function v1DiametralPitchToModuleMm(v1DiametralPitchPerMm) {
  return 1 / v1DiametralPitchPerMm
}

/**
 * V1's `backlash` thins each tooth by `backlash / cos α` at the pitch circle; WarpCad's
 * `backlashMm` thins each by half of itself (call 4). This keeps imported geometry
 * unchanged: `backlashMm = 2 · backlashV1 / cos α`, with α V1's own nominal angle.
 *
 * @param {number} v1BacklashMm
 * @param {number} v1PressureAngleDeg
 * @returns {number} backlashMm
 */
export function v1BacklashToBacklashMm(v1BacklashMm, v1PressureAngleDeg) {
  return (2 * v1BacklashMm) / Math.cos(v1PressureAngleDeg * DEG_TO_RAD)
}

/**
 * V1's **rack** thins each tooth by `backlash / (2 cos α)` — half what a V1 gear does
 * (Decision 5 defect 8: its rack cutter widens each side by a quarter of the backlash).
 * Keeping an imported rack unchanged therefore takes `backlashMm = backlashV1 / cos α`
 * (TODO/core-043), half {@link v1BacklashToBacklashMm}'s rate.
 *
 * @param {number} v1BacklashMm
 * @param {number} v1PressureAngleDeg
 * @returns {number} backlashMm
 */
export function v1RackBacklashToBacklashMm(v1BacklashMm, v1PressureAngleDeg) {
  return v1BacklashMm / Math.cos(v1PressureAngleDeg * DEG_TO_RAD)
}

/**
 * Clearance for a new gear when none is given: `0.25 · module` (call 5).
 *
 * @param {number} moduleMm
 * @returns {number} clearance, mm
 */
export function defaultClearanceMm(moduleMm) {
  return (DEDENDUM_COEFFICIENT - ADDENDUM_COEFFICIENT) * moduleMm
}

// --- dimensions -------------------------------------------------------------------

/**
 * @typedef {object} GearParams
 * @property {number} teeth Integer ≥ 3.
 * @property {number} moduleMm Module, mm (> 0). Pitch Ø = `moduleMm · teeth`.
 * @property {number} [pressureAngleDeg=20] Degrees, 0…45.
 * @property {number} [profileShift=0] Coefficient × module (unitless): the generating
 *   rack is moved `profileShift · moduleMm` outward. Positive lengthens the tooth and
 *   cures undercut; negative shortens it.
 * @property {number} [clearanceMm] Root depth beyond one module, mm. Default
 *   `0.25 · moduleMm`. May be 0 (V1 gears that omitted it) or negative.
 * @property {number} [backlashMm=0] Total circumferential play of a meshing pair, mm,
 *   measured along the pitch circle. **Sign convention:** positive thins this gear's tooth
 *   by `backlashMm / 2` at the pitch circle; negative thickens it. On a helical gear the
 *   pitch circle is the transverse one, so this is the transverse play.
 * @property {number} [helixAngleDeg=0] Helix angle, degrees, 0…60 (TODO/core-042). When
 *   non-zero, `moduleMm` and `pressureAngleDeg` are the **normal** values and every
 *   dimension below describes the transverse section (`./helix.js`'s conventions).
 */

/**
 * @typedef {object} GearDimensions
 * @property {number} teeth
 * @property {number} moduleMm The (normal) module given.
 * @property {number} pressureAngleDeg The (normal) pressure angle given.
 * @property {number} helixAngleDeg 0 for a spur gear.
 * @property {number} transverseModuleMm `moduleMm / cos β` — sets the pitch circle;
 *   `moduleMm` itself at β = 0.
 * @property {number} transversePressureAngleDeg `atan(tan α / cos β)` — the involute's
 *   angle in the transverse section; `pressureAngleDeg` itself at β = 0.
 * @property {number} profileShift
 * @property {number} clearanceMm Resolved (default applied).
 * @property {number} backlashMm
 * @property {number} circularPitchMm `π · module` (transverse module on a helical gear: the
 *   pitch measured along the pitch circle).
 * @property {number} pitchDiameterMm `module · teeth` (transverse module).
 * @property {number} pitchRadiusMm
 * @property {number} baseDiameterMm Pitch Ø · cos α.
 * @property {number} baseRadiusMm
 * @property {number} addendumMm `module · (1 + x)`.
 * @property {number} dedendumMm Pitch radius − root radius: `module + clearance − x · module`
 *   (`1.25 m − x m` at the default clearance), or less when the rack tip is pointed.
 * @property {number} outsideRadiusMm Nominal tip circle, `pitch R + addendum`. The real
 *   outline's tip is this unless the tooth is pointed — see `involuteProfile().tipRadiusMm`.
 * @property {number} rootRadiusMm Root circle: the generating rack's tip line.
 * @property {number} toothThicknessAtPitchMm Arc length along the pitch circle:
 *   `circularPitch / 2 + 2 x m tan α − backlash / 2` (transverse α on a helical gear).
 * @property {number} toothAngleDeg `360 / teeth`.
 * @property {number} rackCornerTangentialMm Generating rack's tip corner, distance from the
 *   tooth-space centre line along the rolling line, mm (≥ 0; 0 when the rack tip is pointed).
 * @property {number} rackCornerRadialMm The same corner's distance from the gear centre at
 *   the start of the roll, mm — equal to `rootRadiusMm`.
 * @property {boolean} pointedRoot The rack's flanks meet before its nominal tip line (very
 *   high α or small clearance), so the tooth space comes to a point at the root.
 * @property {boolean} undercut The rack corner reaches below the interference point, so its
 *   trochoid cuts into the involute: corner depth `> pitch R · sin²α`.
 * @property {number} minTeethWithoutUndercut `2 · depth / (module · sin²α)`, with depth the
 *   rack corner's depth below the rolling line, `module · (1 − x) + clearance` — the
 *   textbook `2 (1 − x) / sin²α` (≈ 17 at 20°) when clearance is 0. `Infinity` at α = 0.
 * @property {number} involuteStartRadiusMm Radius where the generated involute begins: the
 *   base circle when undercut, else the form circle where the rack tip line crosses the
 *   line of action.
 */

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {number}
 */
function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new GearParameterError(`${name} must be a finite number`)
  }
  return value
}

/**
 * Derived dimensions of an external spur gear, and the generating rack it is cut by.
 * Throws {@link GearParameterError} for parameters that cannot make a gear, and
 * {@link GearToothVanishedError} when the tooth has no thickness at the pitch circle.
 *
 * @param {GearParams} params
 * @returns {GearDimensions}
 */
export function gearDimensions(params) {
  const { teeth } = params
  if (typeof teeth !== 'number' || !Number.isInteger(teeth) || teeth < 3) {
    throw new GearParameterError('teeth must be a whole number, 3 or more')
  }
  return dimensionsFor(params, teeth)
}

/**
 * {@link gearDimensions} for a gear that exists only as a construction: the **back-cone
 * virtual gear** of a bevel (TODO/core-045, Tredgold's approximation), whose tooth count is
 * `z / cos δ` and is almost never whole. Every formula is the spur gear's; only the
 * whole-number check is relaxed to "a finite number, 3 or more". `teeth` in the result is
 * that real count, so `toothAngleDeg` is `360 / z'` and is not a divisor of 360.
 *
 * @param {Omit<GearParams, 'teeth'> & { teeth: number }} params
 * @returns {GearDimensions}
 */
export function virtualGearDimensions(params) {
  const { teeth } = params
  if (typeof teeth !== 'number' || !Number.isFinite(teeth) || teeth < 3) {
    throw new GearParameterError('the virtual gear’s teeth must be a finite number, 3 or more')
  }
  return dimensionsFor(params, teeth)
}

/**
 * The body of {@link gearDimensions}, after the tooth count has been checked.
 *
 * @param {GearParams} params
 * @param {number} teeth
 * @returns {GearDimensions}
 */
function dimensionsFor(params, teeth) {
  const moduleMm = finite(params.moduleMm, 'moduleMm')
  if (!(moduleMm > 0)) throw new GearParameterError('moduleMm must be greater than 0')
  const pressureAngleDeg = finite(params.pressureAngleDeg ?? 20, 'pressureAngleDeg')
  const [minDeg, maxDeg] = PRESSURE_ANGLE_RANGE_DEG
  if (pressureAngleDeg < minDeg || pressureAngleDeg > maxDeg) {
    throw new GearParameterError(`pressureAngleDeg must be between ${minDeg}° and ${maxDeg}°`)
  }
  const profileShift = finite(params.profileShift ?? 0, 'profileShift')
  const clearanceMm = finite(params.clearanceMm ?? defaultClearanceMm(moduleMm), 'clearanceMm')
  const backlashMm = finite(params.backlashMm ?? 0, 'backlashMm')
  const helixAngleDeg = finite(params.helixAngleDeg ?? 0, 'helixAngleDeg')
  const [minHelixDeg, maxHelixDeg] = HELIX_ANGLE_RANGE_DEG
  if (helixAngleDeg < minHelixDeg || helixAngleDeg > maxHelixDeg) {
    throw new GearParameterError(`helixAngleDeg must be between ${minHelixDeg}° and ${maxHelixDeg}°`)
  }

  // The transverse section (TODO/core-042): pitch and pressure angle from the transverse
  // values, depth from the normal module. Both helpers return their input unchanged at
  // β = 0, so a spur gear's arithmetic below is exactly what it was before helix angles.
  const pitchModuleMm = transverseModuleMm(moduleMm, helixAngleDeg)
  const profileAngleDeg = transversePressureAngleDeg(pressureAngleDeg, helixAngleDeg)
  const alphaRad = profileAngleDeg * DEG_TO_RAD
  const tanAlpha = Math.tan(alphaRad)
  const sinAlpha = Math.sin(alphaRad)
  const circularPitchMm = moduleMmToCircularPitchMm(pitchModuleMm)
  const pitchRadiusMm = (pitchModuleMm * teeth) / 2
  const baseRadiusMm = pitchRadiusMm * Math.cos(alphaRad)
  const shiftMm = profileShift * moduleMm
  const addendumMm = moduleMm * (ADDENDUM_COEFFICIENT + profileShift)
  const outsideRadiusMm = pitchRadiusMm + addendumMm

  const toothThicknessAtPitchMm = circularPitchMm / 2 + 2 * shiftMm * tanAlpha - backlashMm / 2
  if (!(toothThicknessAtPitchMm > 0)) {
    throw new GearToothVanishedError(
      'backlash leaves no tooth at the pitch circle — reduce backlashMm or raise profileShift'
    )
  }

  // Generating rack (the cutter is the tooth *space*): its rolling line is tangent to the
  // pitch circle, its datum line sits `shiftMm` further out. Half-width of the space at
  // radial height v is `circularPitch/4 + backlash/4 + (v − datum) · tan α`.
  const datumRadialMm = pitchRadiusMm + shiftMm
  const halfSpaceAtDatumMm = circularPitchMm / 4 + backlashMm / 4
  let cornerRadialMm = datumRadialMm - (moduleMm + clearanceMm)
  let cornerTangentialMm = halfSpaceAtDatumMm - (moduleMm + clearanceMm) * tanAlpha
  let pointedRoot = false
  if (cornerTangentialMm <= 0) {
    // The rack's flanks meet above its nominal tip line: clip it at the apex.
    pointedRoot = true
    cornerRadialMm = datumRadialMm - halfSpaceAtDatumMm / tanAlpha
    cornerTangentialMm = 0
  }
  const rootRadiusMm = cornerRadialMm
  if (!(rootRadiusMm > 0)) {
    throw new GearParameterError(
      'the root circle reaches the gear centre — raise profileShift or teeth, or reduce clearanceMm'
    )
  }
  if (!(outsideRadiusMm > rootRadiusMm)) {
    throw new GearToothVanishedError('the tip circle is inside the root circle')
  }

  const cornerDepthMm = pitchRadiusMm - cornerRadialMm
  const interferenceDepthMm = pitchRadiusMm * sinAlpha * sinAlpha
  const undercut = cornerDepthMm > interferenceDepthMm
  const minTeethWithoutUndercut =
    sinAlpha === 0 ? Number.POSITIVE_INFINITY : (2 * cornerDepthMm) / (pitchModuleMm * sinAlpha * sinAlpha)
  const involuteStartRadiusMm =
    undercut || tanAlpha === 0 ? baseRadiusMm : Math.hypot(cornerRadialMm, cornerDepthMm / tanAlpha)

  return {
    teeth,
    moduleMm,
    pressureAngleDeg,
    helixAngleDeg,
    transverseModuleMm: pitchModuleMm,
    transversePressureAngleDeg: profileAngleDeg,
    profileShift,
    clearanceMm,
    backlashMm,
    circularPitchMm,
    pitchDiameterMm: 2 * pitchRadiusMm,
    pitchRadiusMm,
    baseDiameterMm: 2 * baseRadiusMm,
    baseRadiusMm,
    addendumMm,
    dedendumMm: pitchRadiusMm - rootRadiusMm,
    outsideRadiusMm,
    rootRadiusMm,
    toothThicknessAtPitchMm,
    toothAngleDeg: 360 / teeth,
    rackCornerTangentialMm: cornerTangentialMm,
    rackCornerRadialMm: cornerRadialMm,
    pointedRoot,
    undercut,
    minTeethWithoutUndercut,
    involuteStartRadiusMm,
  }
}
