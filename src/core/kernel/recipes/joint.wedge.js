// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Wedge (tapered key) joint for a split (`TODO/core-059`): a flat trapezoidal key standing
 * proud of piece A's cut face, and a matching socket — its outline grown by the clearance — in
 * piece B. Only ever placed by hand: there is no wedge search.
 *
 * ## Why a taper
 *
 * A straight tongue is symmetric end to end, so it goes in either way round and, with its
 * clearance, gives a little in every direction along its length. A trapezoid is not: it seats
 * one way only, and its slanted sides take up the clearance as it is pressed home, so the
 * halves locate in both face directions and cannot turn on the face. The key lies in the cut
 * plane — wide and long across the face, shallow along the cut axis — rather than being a
 * deep round pin drilled into each half.
 *
 * It still needs a {@link JOINT_WALL_MM} wall around its socket, like every joint here, so it
 * fits no thinner a section than a tongue of the same width does.
 *
 * ## Sizing
 *
 * From the width of its wide end `w` (1–10 mm): the narrow end is `w / 2`, it is `3w` long
 * along the face's longer direction (the same direction a tongue runs), and it stands
 * `1.5w` proud, clamped to 2–8 mm. The socket is the key's outline offset by the clearance
 * square to every side — on a slanted side that widens the socket by `c·√(1 + slope²)` per
 * side, not `c`, so the gap is the same all round — and is deeper by the clearance.
 *
 * Millimetres, document frame, Z-up. Framework-free.
 *
 * @module core/kernel/recipes/joint.wedge
 */

import { JOINT_BASE_DEPTH_MM, JOINT_EMBED_MM, JOINT_WALL_MM, contains, outlinePrismAlong } from './joint.common.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.common.js').ClearanceField} ClearanceField */
/** @typedef {import('./joint.common.js').Footprint} Footprint */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */

/** Narrowest wedge (at its wide end), mm. */
export const WEDGE_MIN_WIDTH_MM = 1
/** Widest wedge, mm. */
export const WEDGE_MAX_WIDTH_MM = 10

/**
 * A trapezoid on the face: `wideMm` across at one end, `narrowMm` at the other, `lengthMm`
 * between them.
 *
 * @typedef {{ wideMm: number, narrowMm: number, lengthMm: number }} Trapezoid
 */

/**
 * @param {number} value
 * @param {number} low
 * @param {number} high
 */
const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

/**
 * A wedge's sizing from the width of its wide end.
 *
 * @param {number} widthMm
 * @returns {Trapezoid & { heightMm: number }}
 */
export function wedgeSizing(widthMm) {
  return { wideMm: widthMm, narrowMm: widthMm / 2, lengthMm: 3 * widthMm, heightMm: clamp(1.5 * widthMm, 2, 8) }
}

/**
 * A trapezoid grown by `byMm` square to every side (a mitred offset), which is again a
 * trapezoid with the same slope: its ends move out by `byMm`, its slanted sides by `byMm`
 * along their own normals.
 *
 * @param {Trapezoid} trapezoid
 * @param {number} byMm
 * @returns {Trapezoid}
 */
export function offsetTrapezoid({ wideMm, narrowMm, lengthMm }, byMm) {
  if (!(byMm >= 0)) throw new Error(`a trapezoid offset must be zero or more, got ${byMm}`)
  if (!(lengthMm > 0)) throw new Error(`a trapezoid needs a positive length, got ${lengthMm}`)
  // Half-width change per millimetre along, from the wide end to the narrow.
  const slope = (narrowMm - wideMm) / (2 * lengthMm)
  const sideGrowth = byMm * Math.hypot(1, slope)
  return {
    wideMm: wideMm + 2 * (sideGrowth - slope * byMm),
    narrowMm: narrowMm + 2 * (sideGrowth + slope * byMm),
    lengthMm: lengthMm + 2 * byMm,
  }
}

/**
 * A trapezoid's outline about its centre, counter-clockwise in `(u, v)`, running along `u` or
 * `v` with its wide end at the low end.
 *
 * @param {Trapezoid} trapezoid
 * @param {boolean} alongU
 * @returns {[number, number][]}
 */
export function trapezoidOutline({ wideMm, narrowMm, lengthMm }, alongU) {
  const half = lengthMm / 2
  /** @type {[number, number][]} along, across */
  const corners = [
    [-half, -wideMm / 2],
    [half, -narrowMm / 2],
    [half, narrowMm / 2],
    [-half, wideMm / 2],
  ]
  // Along v is a quarter turn, which keeps the winding.
  return alongU ? corners : corners.map(([along, across]) => [-across, along])
}

/**
 * The wedge's socket plus wall on the face: the bounding rectangle of its outline offset by
 * the clearance and the wall (conservative — see {@link Footprint}).
 *
 * @param {{ uMm: number, vMm: number, widthMm: number, alongU: boolean }} wedge
 * @param {number} clearanceMm
 * @returns {Footprint}
 */
export function wedgeFootprint({ uMm, vMm, widthMm, alongU }, clearanceMm) {
  const outer = offsetTrapezoid(wedgeSizing(widthMm), clearanceMm + JOINT_WALL_MM)
  const halfLong = outer.lengthMm / 2
  const halfWide = Math.max(outer.wideMm, outer.narrowMm) / 2
  return { shape: 'rect', uMm, vMm, halfUMm: alongU ? halfLong : halfWide, halfVMm: alongU ? halfWide : halfLong }
}

/**
 * Why a wedge does not fit, by exact boolean containment — `null` when it does.
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {Geom3} args.lower
 * @param {Geom3} args.upper
 * @param {number} args.clearanceMm
 * @param {{ uMm: number, vMm: number, widthMm: number, alongU: boolean }} args.wedge
 * @returns {'wall' | 'base' | null}
 */
export function wedgeMisfit({ field, lower, upper, clearanceMm, wedge }) {
  const { axisIndex, cutMm } = field
  const sizing = wedgeSizing(wedge.widthMm)
  const wall = outlinePrismAlong(
    axisIndex,
    cutMm,
    cutMm + sizing.heightMm + clearanceMm + JOINT_WALL_MM,
    wedge.uMm,
    wedge.vMm,
    trapezoidOutline(offsetTrapezoid(sizing, clearanceMm + JOINT_WALL_MM), wedge.alongU)
  )
  if (!contains(upper, wall)) return 'wall'
  const base = outlinePrismAlong(
    axisIndex,
    cutMm - JOINT_BASE_DEPTH_MM,
    cutMm,
    wedge.uMm,
    wedge.vMm,
    trapezoidOutline(sizing, wedge.alongU)
  )
  if (!contains(lower, base)) return 'base'
  return null
}

/**
 * A wedge and its socket at exactly this centre — no check (ask {@link wedgeMisfit} first).
 *
 * @param {object} args
 * @param {ClearanceField} args.field
 * @param {number} args.clearanceMm
 * @param {{ uMm: number, vMm: number, widthMm: number, alongU: boolean }} args.wedge
 * @returns {JointGeometry}
 */
export function wedgeAt({ field, clearanceMm, wedge }) {
  const { axisIndex, cutMm } = field
  const sizing = wedgeSizing(wedge.widthMm)
  const key = outlinePrismAlong(
    axisIndex,
    cutMm - JOINT_EMBED_MM,
    cutMm + sizing.heightMm,
    wedge.uMm,
    wedge.vMm,
    trapezoidOutline(sizing, wedge.alongU)
  )
  const socket = outlinePrismAlong(
    axisIndex,
    cutMm - JOINT_EMBED_MM,
    cutMm + sizing.heightMm + clearanceMm,
    wedge.uMm,
    wedge.vMm,
    trapezoidOutline(offsetTrapezoid(sizing, clearanceMm), wedge.alongU)
  )
  const mm = (/** @type {number} */ value) => Number(value.toFixed(1))
  return {
    // A wedge is only ever hand-placed, inside a `placements` plan.
    kind: 'placements',
    pins: [key],
    sockets: [socket],
    holes: [],
    connectors: [
      {
        kind: 'wedge',
        source: 'placed',
        uMm: wedge.uMm,
        vMm: wedge.vMm,
        sizeMm: wedge.widthMm,
        lengthMm: sizing.lengthMm,
        heightMm: sizing.heightMm,
        footprint: wedgeFootprint(wedge, clearanceMm),
      },
    ],
    summary: `wedge ${mm(sizing.wideMm)}–${mm(sizing.narrowMm)} × ${mm(sizing.lengthMm)} × ${mm(sizing.heightMm)} mm`,
  }
}
