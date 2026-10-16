// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Helical-gear maths — the twist a helix angle asks for, and the normal ↔ transverse
 * conversions a helical gear needs (TODO/core-042, `docs/decisions/gears.md` Decision 3).
 *
 * A helical gear here is the spur outline of its **transverse** section, extruded with a
 * twist (`profile.extrudeLinear`'s `twistDeg`). There is no helical-gear op: this module
 * only turns a helix angle into that twist, and names the conversions so the profile,
 * the Inspector readout (`ui-057`) and the mesh math (`core-044`) never re-derive them.
 *
 * ## Conventions
 *
 * - **`moduleMm` and `pressureAngleDeg` are the normal values** on a helical gear, as on
 *   a store-bought one: it is cut by a standard rack in the plane normal to the teeth. The
 *   transverse section the outline is drawn in has module `mₙ / cos β` and pressure angle
 *   `atan(tan αₙ / cos β)`; tooth depth (addendum, dedendum, clearance, profile shift)
 *   stays in the normal module, because a radial height is the same in both planes.
 *   `./dimensions.js` applies these when `helixAngleDeg` is given.
 * - **Twist** over a thickness `t` on pitch radius `r` is `t · tan β / r` radians: the
 *   rotation that makes a tooth cross the pitch cylinder at β.
 * - **Hand**: a right-hand gear twists CCW about +Z going up (positive radians), like a
 *   right-hand thread; left is the opposite sign. A meshing pair on parallel axes needs
 *   opposite hands; on crossed axes the same hand (`core-044` warns on a bad pair).
 *
 * Framework-free and kernel-free: no Vue, no DOM, no `@jscad/modeling`.
 *
 * @module core/gear/helix
 */

const DEG_TO_RAD = Math.PI / 180

/** The steepest helix angle a gear op accepts, degrees (TODO/core-042). */
export const MAX_HELIX_ANGLE_DEG = 45

/**
 * The most one twisted run (a whole helical gear, or one herringbone half) may turn,
 * degrees. Past a full turn the part is a worm or a screw, and the vertex count grows with
 * the twist, so a thick, small gear at a steep angle is refused rather than sampled.
 */
export const MAX_TWIST_DEG = 360

/** @typedef {'right' | 'left'} Handedness */

/** The hands a helical gear can have; `'right'` is the default. */
export const HANDEDNESS = Object.freeze(/** @type {const} */ (['right', 'left']))

/**
 * The transverse module of a helical gear: the module its transverse section (the
 * outline that is extruded) has, `mₙ / cos β`. Exactly `normalModuleMm` at β = 0.
 *
 * @param {number} normalModuleMm The gear's (normal) module, mm.
 * @param {number} helixAngleDeg
 * @returns {number} mm
 */
export function transverseModuleMm(normalModuleMm, helixAngleDeg) {
  if (helixAngleDeg === 0) return normalModuleMm
  return normalModuleMm / Math.cos(helixAngleDeg * DEG_TO_RAD)
}

/**
 * The inverse of {@link transverseModuleMm}: `mₜ · cos β`.
 *
 * @param {number} transverseModuleMmValue mm
 * @param {number} helixAngleDeg
 * @returns {number} the normal module, mm
 */
export function normalModuleMm(transverseModuleMmValue, helixAngleDeg) {
  if (helixAngleDeg === 0) return transverseModuleMmValue
  return transverseModuleMmValue * Math.cos(helixAngleDeg * DEG_TO_RAD)
}

/**
 * The transverse pressure angle, `atan(tan αₙ / cos β)`. Returns `normalPressureAngleDeg`
 * itself at β = 0, so a spur gear's arithmetic never goes through an `atan(tan α)` round
 * trip.
 *
 * @param {number} normalPressureAngleDeg
 * @param {number} helixAngleDeg
 * @returns {number} degrees
 */
export function transversePressureAngleDeg(normalPressureAngleDeg, helixAngleDeg) {
  if (helixAngleDeg === 0) return normalPressureAngleDeg
  return Math.atan(Math.tan(normalPressureAngleDeg * DEG_TO_RAD) / Math.cos(helixAngleDeg * DEG_TO_RAD)) / DEG_TO_RAD
}

/**
 * The twist that puts a helical tooth at `helixAngleDeg` on the pitch cylinder:
 * `t · tan β / r`, positive (CCW about +Z going up) for a right hand. A negative helix
 * angle reads as the other hand. Exactly `0` (never `−0`) at β = 0.
 *
 * @param {object} args
 * @param {number} args.thicknessMm The axial length the twist is spread over.
 * @param {number} args.pitchRadiusMm The **transverse** pitch radius (`./dimensions.js`).
 * @param {number} args.helixAngleDeg
 * @param {Handedness} [args.handedness='right']
 * @returns {number} radians
 */
export function helixTwistRad({ thicknessMm, pitchRadiusMm, helixAngleDeg, handedness = 'right' }) {
  if (helixAngleDeg === 0) return 0
  const sign = handedness === 'left' ? -1 : 1
  return (sign * thicknessMm * Math.tan(helixAngleDeg * DEG_TO_RAD)) / pitchRadiusMm
}
