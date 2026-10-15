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

import {
  JOINT_BASE_DEPTH_MM,
  JOINT_EMBED_MM,
  JOINT_WALL_MM,
  clearanceTo,
  contains,
  footprintsOverlap,
  prismAlong,
} from './joint.common.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').ClearanceField} ClearanceField */
/** @typedef {import('./joint.common.js').Footprint} Footprint */

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
 * One connector on the cut face, as built (`TODO/core-059`): where it is, how big, and whether
 * a search or a person put it there — what a caller needs to show it, or to place the same
 * connector again by hand.
 *
 * @typedef {object} Connector
 * @property {'pins' | 'tongue' | 'wedge' | 'screwBoss'} kind
 * @property {'search' | 'placed'} source
 * @property {number} uMm Centre on the face, document millimetres along the field's `u` axis.
 * @property {number} vMm
 * @property {number} sizeMm The kind's size: a pin's diameter, a tongue's or a wedge's width
 *   (a wedge's at its wide end), a screw boss's nominal screw diameter.
 * @property {number} [lengthMm] A pin's or a tongue's length (how far a pin stands proud; a
 *   tongue's rib along the face), a wedge's along the face.
 * @property {number} [heightMm] How far a tongue, wedge or screw boss stands proud.
 * @property {number} [insertMm] A screw boss's heat-set insert bore, when it has one.
 * @property {Footprint} footprint Its socket plus wall on the face.
 */

/**
 * @typedef {object} JointGeometry
 * @property {'pins' | 'tongue' | 'placements'} kind `placements` when built from a hand-given
 *   list (`TODO/core-059`), which may mix kinds.
 * @property {Geom3[]} pins Unioned onto piece A. Each is sunk {@link JOINT_EMBED_MM} into A.
 * @property {Geom3[]} sockets Subtracted from piece B. Each starts {@link JOINT_EMBED_MM}
 *   short of the face, so the boolean never meets a coplanar face.
 * @property {Geom3[]} holes Subtracted from piece A **after** the pins are unioned on — a screw
 *   boss's bore through A and its own boss. Empty for pins, tongues and wedges.
 * @property {Connector[]} connectors In the order their pins and sockets are listed.
 * @property {string} summary One line for a person: what was made and how big.
 */

/**
 * A pin's sizing at one diameter — the one rule both the search and a hand placement use.
 *
 * @param {number} diameterMm
 * @param {number} clearanceMm
 * @returns {{ radiusMm: number, lengthMm: number, socketRadiusMm: number, socketDepthMm: number }}
 */
export function pinSizing(diameterMm, clearanceMm) {
  const radiusMm = diameterMm / 2
  const lengthMm = clamp(2 * diameterMm, 4, 12)
  return { radiusMm, lengthMm, socketRadiusMm: radiusMm + clearanceMm, socketDepthMm: lengthMm + clearanceMm }
}

/**
 * A pin's socket plus wall on the face.
 *
 * @param {number} diameterMm
 * @param {number} clearanceMm
 * @param {{ uMm: number, vMm: number }} centre
 * @returns {Footprint}
 */
export function pinFootprint(diameterMm, clearanceMm, centre) {
  return { shape: 'circle', uMm: centre.uMm, vMm: centre.vMm, radiusMm: diameterMm / 2 + clearanceMm + JOINT_WALL_MM }
}

/**
 * Why a pin does not fit at `centre`, by exact boolean containment — `null` when it does. The
 * search's confirmation step and a hand placement both ask this, so they can never disagree.
 *
 * - `wall`: its socket plus a {@link JOINT_WALL_MM} wall would break out of piece B.
 * - `base`: there is not {@link JOINT_BASE_DEPTH_MM} of solid under it in piece A.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {number} args.diameterMm
 * @param {{ uMm: number, vMm: number }} args.centre
 * @returns {'wall' | 'base' | null}
 */
export function pinMisfit({ field, lower, upper, clearanceMm, diameterMm, centre }) {
  const { axisIndex, cutMm } = field
  const { radiusMm, socketRadiusMm, socketDepthMm } = pinSizing(diameterMm, clearanceMm)
  const wall = prismAlong(axisIndex, cutMm, cutMm + socketDepthMm + JOINT_WALL_MM, centre.uMm, centre.vMm, {
    radiusMm: socketRadiusMm + JOINT_WALL_MM,
  })
  if (!contains(upper, wall)) return 'wall'
  const base = prismAlong(axisIndex, cutMm - JOINT_BASE_DEPTH_MM, cutMm, centre.uMm, centre.vMm, { radiusMm })
  if (!contains(lower, base)) return 'base'
  return null
}

/**
 * Pins and sockets at exactly these centres — no search, no check (ask {@link pinMisfit}
 * first). What the search builds once it has found its centres, and what a hand placement
 * builds at the person's.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {number} args.clearanceMm
 * @param {number} args.diameterMm
 * @param {{ uMm: number, vMm: number }[]} args.centres
 * @param {'search' | 'placed'} [args.source] Default `search`.
 * @returns {JointGeometry}
 */
export function pinsAt({ field, clearanceMm, diameterMm, centres, source = 'search' }) {
  return build(field, diameterMm, pinSizing(diameterMm, clearanceMm).lengthMm, clearanceMm, centres, source)
}

/**
 * Plan pins and sockets on a cut face.
 *
 * @param {object} args
 * @param {ClearanceField} args.field The uncut solid's clearance field at this cut.
 * @param {Geom3} args.lower Piece A, the minimum side.
 * @param {Geom3} args.upper Piece B.
 * @param {number} args.clearanceMm Added to each socket's radius and depth.
 * @param {Footprint[]} [args.keepOut] Connectors already on the face (`TODO/core-059`): no
 *   pin's socket and wall may overlap one. Default none — the search as it always was.
 * @returns {JointGeometry | null} `null` when no pin fits.
 */
export function pinJoint({ field, lower, upper, clearanceMm, keepOut = [] }) {
  const { uRange, vRange } = field
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
    const { radiusMm, lengthMm, socketRadiusMm, socketDepthMm } = pinSizing(diameterMm, clearanceMm)
    // Spheres at each sample along the axis stand in for the socket's wall cylinder; the
    // slack for the gap between neighbouring samples keeps that conservative.
    const wallNeed = Math.hypot(socketRadiusMm + JOINT_WALL_MM, field.depthStepMm / 2)
    const baseNeed = Math.hypot(radiusMm, field.depthStepMm / 2)
    const fits = field.points.filter(
      (point) =>
        point.baseClearMm >= baseNeed &&
        clearanceTo(field, point, socketDepthMm + JOINT_WALL_MM) >= wallNeed &&
        keepOut.every((other) => !footprintsOverlap(other, pinFootprint(diameterMm, clearanceMm, point)))
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
      (centre) => pinMisfit({ field, lower, upper, clearanceMm, diameterMm, centre }) === null
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
 * @param {'search' | 'placed'} [source]
 * @returns {JointGeometry}
 */
function build(field, diameterMm, lengthMm, clearanceMm, centres, source = /** @type {const} */ ('search')) {
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
    holes: [],
    connectors: centres.map((centre) => ({
      kind: /** @type {const} */ ('pins'),
      source,
      uMm: centre.uMm,
      vMm: centre.vMm,
      sizeMm: diameterMm,
      lengthMm,
      footprint: pinFootprint(diameterMm, clearanceMm, centre),
    })),
    summary: `${centres.length} pin${centres.length === 1 ? '' : 's'}, Ø${size} × ${Number(lengthMm.toFixed(1))} mm`,
  }
}
