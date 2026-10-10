// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Pin-and-socket joint for a split (`TODO/io-007`): round pins standing proud of piece A's
 * cut face, matching sockets — wider and deeper by the clearance — sunk into piece B.
 *
 * ## Sizing, and where the pins go
 *
 * - **Diameter** starts at 35 % of the face's narrower side, clamped to 2–8 mm, and steps
 *   down by a quarter until the pins find room — a pin needs its socket plus a
 *   {@link JOINT_WALL_MM} wall on every side to sit inside piece B.
 * - **Length** (how far a pin stands proud) is twice its diameter, clamped to 4–12 mm.
 * - **Placement** is searched, not assumed: the face's clearance field (`joint.common.js`)
 *   says where a socket of that size fits, so a cut through an existing hole puts its pins
 *   in the material either side rather than in the hole. Two pins if two fit apart (a pair
 *   also stops the pieces turning), the pair furthest apart; otherwise one.
 * - When no pin fits at the smallest size — a 3 mm trailing edge — this returns `null` and
 *   the op says so, naming tongue and groove as the joint that does fit.
 *
 * Returns geometry only, like the rest of the recipe kit's helpers: the op unions the pins
 * onto A and subtracts the sockets from B.
 *
 * @module core/kernel/recipes/joint.pins
 */

import { JOINT_BASE_DEPTH_MM, JOINT_EMBED_MM, JOINT_WALL_MM, clearanceTo, contains, prismAlong } from './joint.common.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').ClearanceField} ClearanceField */

/** Smallest pin tried, mm. A 2 mm PLA pin is about as thin as survives being pressed in. */
export const PIN_MIN_DIAMETER_MM = 2
/** Largest pin tried, mm. */
export const PIN_MAX_DIAMETER_MM = 8
/** The deepest a pin's socket (plus its wall) reaches past the face, for sizing the field. */
export const PIN_MAX_REACH_MM = 12 + 1 + JOINT_WALL_MM

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

/**
 * @typedef {object} JointGeometry
 * @property {'pins' | 'tongue'} kind
 * @property {Geom3[]} pins Unioned onto piece A. Each is sunk {@link JOINT_EMBED_MM} into A.
 * @property {Geom3[]} sockets Subtracted from piece B. Each starts {@link JOINT_EMBED_MM}
 *   short of the face, so the boolean never meets a coplanar face.
 * @property {string} summary One line for a person: what was made and how big.
 */

/**
 * Plan pins and sockets on a cut face.
 *
 * @param {object} args
 * @param {ClearanceField} args.field The uncut solid's clearance field at this cut.
 * @param {Geom3} args.lower Piece A, the minimum side.
 * @param {Geom3} args.upper Piece B.
 * @param {number} args.clearanceMm Added to each socket's radius and depth.
 * @returns {JointGeometry | null} `null` when no pin fits.
 */
export function pinJoint({ field, lower, upper, clearanceMm }) {
  const { axisIndex, cutMm, uRange, vRange } = field
  const minor = Math.min(uRange[1] - uRange[0], vRange[1] - vRange[0])
  /** @type {number[]} */
  const diameters = []
  for (let d = clamp(minor * 0.35, PIN_MIN_DIAMETER_MM, PIN_MAX_DIAMETER_MM); d >= PIN_MIN_DIAMETER_MM - 1e-9; d *= 0.75) {
    diameters.push(d)
  }
  if (diameters.at(-1) !== PIN_MIN_DIAMETER_MM) diameters.push(PIN_MIN_DIAMETER_MM)

  /** @type {{ diameterMm: number, lengthMm: number, centres: { uMm: number, vMm: number }[] } | null} */
  let single = null
  for (const diameterMm of diameters) {
    const radiusMm = diameterMm / 2
    const lengthMm = clamp(2 * diameterMm, 4, 12)
    const socketRadiusMm = radiusMm + clearanceMm
    const socketDepthMm = lengthMm + clearanceMm
    // Spheres at each sample along the axis stand in for the socket's wall cylinder; the
    // slack for the gap between neighbouring samples keeps that conservative.
    const wallNeed = Math.hypot(socketRadiusMm + JOINT_WALL_MM, field.depthStepMm / 2)
    const baseNeed = Math.hypot(radiusMm, field.depthStepMm / 2)
    const fits = field.points.filter(
      (point) => point.baseClearMm >= baseNeed && clearanceTo(field, point, socketDepthMm + JOINT_WALL_MM) >= wallNeed
    )
    if (fits.length === 0) continue

    // The pair furthest apart whose walls do not overlap; failing that, the best-cleared one.
    const apart = 2 * (socketRadiusMm + JOINT_WALL_MM)
    let best = /** @type {[number, number] | null} */ (null)
    let bestDistance = apart
    for (let i = 0; i < fits.length; i += 1) {
      for (let j = i + 1; j < fits.length; j += 1) {
        const distance = Math.hypot(fits[i].uMm - fits[j].uMm, fits[i].vMm - fits[j].vMm)
        if (distance >= bestDistance) {
          bestDistance = distance
          best = [i, j]
        }
      }
    }
    const centres = best
      ? [fits[best[0]], fits[best[1]]]
      : [fits.reduce((a, b) => (clearanceTo(field, b, socketDepthMm) > clearanceTo(field, a, socketDepthMm) ? b : a))]

    // The field is conservative; the boolean is exact. Keep only centres it confirms.
    const confirmed = centres.filter(
      (centre) =>
        contains(
          upper,
          prismAlong(axisIndex, cutMm, cutMm + socketDepthMm + JOINT_WALL_MM, centre.uMm, centre.vMm, {
            radiusMm: socketRadiusMm + JOINT_WALL_MM,
          })
        ) &&
        contains(
          lower,
          prismAlong(axisIndex, cutMm - JOINT_BASE_DEPTH_MM, cutMm, centre.uMm, centre.vMm, { radiusMm })
        )
    )
    if (confirmed.length >= 2) return build(field, diameterMm, lengthMm, clearanceMm, confirmed)
    if (confirmed.length === 1 && single === null) single = { diameterMm, lengthMm, centres: confirmed }
  }
  return single ? build(field, single.diameterMm, single.lengthMm, clearanceMm, single.centres) : null
}

/**
 * @param {ClearanceField} field
 * @param {number} diameterMm
 * @param {number} lengthMm
 * @param {number} clearanceMm
 * @param {{ uMm: number, vMm: number }[]} centres
 * @returns {JointGeometry}
 */
function build(field, diameterMm, lengthMm, clearanceMm, centres) {
  const { axisIndex, cutMm } = field
  const pins = centres.map((centre) =>
    prismAlong(axisIndex, cutMm - JOINT_EMBED_MM, cutMm + lengthMm, centre.uMm, centre.vMm, { radiusMm: diameterMm / 2 })
  )
  const sockets = centres.map((centre) =>
    prismAlong(axisIndex, cutMm - JOINT_EMBED_MM, cutMm + lengthMm + clearanceMm, centre.uMm, centre.vMm, {
      radiusMm: diameterMm / 2 + clearanceMm,
    })
  )
  const size = Number(diameterMm.toFixed(1))
  return {
    kind: 'pins',
    pins,
    sockets,
    summary: `${centres.length} pin${centres.length === 1 ? '' : 's'}, Ø${size} × ${Number(lengthMm.toFixed(1))} mm`,
  }
}
