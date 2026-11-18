// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tongue-and-groove for a **thin shell wall** (`TODO/ai-048`): the hollow box of an enclosure,
 * whose cut face is a ring a couple of millimetres wide.
 *
 * The ordinary tongue (`joint.tongueGroove.js`) wants a groove plus {@link JOINT_WALL_MM} of
 * plastic on each side of it, so it needs a wall of 3.8 mm or more, and its search samples the
 * face too coarsely to see a 2 mm ring at all. This recipe measures the wall instead and sizes
 * the rib from it: the tongue and each wall left beside its groove are a third of what the wall
 * has after the clearance, `(wall − 2 × clearance) / 3`, none under 0.5 mm (one printed line).
 * A 2 mm wall at 0.2 mm clearance gives a 0.53 mm rib. A wall under {@link wallTongueMinWallMm}
 * is refused.
 *
 * ## Where the ribs go
 *
 * One rib down the middle of each side of the face's bounding box that has a wall, as long as
 * 60 %, then 40 %, then 25 % of that side fits — a lid with ribs on all four sides registers in
 * both directions. A side is skipped when a port, a post or a corner leaves no clear stretch.
 * Every candidate is confirmed by exact boolean containment (`tongueMisfit`), so the thin-wall
 * sizing can only be wrong by refusing, never by breaking out of the wall.
 *
 * @module core/kernel/recipes/joint.tongueWall
 */

import { boundsOf } from '../group.js'
import { contains, faceAxes, footprintsOverlap, prismAlong } from './joint.common.js'
import { tongueAt, tongueFootprint, tongueMisfit } from './joint.tongueGroove.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./joint.pins.js').JointGeometry} JointGeometry */
/** @typedef {import('./joint.common.js').Footprint} Footprint */

/** Narrowest tongue, and narrowest wall beside its groove, mm. */
export const WALL_TONGUE_MIN_MM = 0.5
/** Widest tongue this recipe makes, mm: a thicker wall belongs to the ordinary tongue. */
const WALL_TONGUE_MAX_MM = 2
/** Walls thicker than this are not a shell wall, mm. */
const MAX_WALL_MM = 8
/** Rib lengths tried, as fractions of the side. */
const LENGTH_FRACTIONS = [0.6, 0.4, 0.25]
/** Where along a side the wall is measured and a rib tried, as fractions of its length. */
const SPOTS = [0.5, 0.25, 0.75, 0.12, 0.88]

/**
 * The thinnest wall that takes a tongue at this clearance, mm.
 *
 * @param {number} clearanceMm
 * @returns {number}
 */
export function wallTongueMinWallMm(clearanceMm) {
  return 3 * WALL_TONGUE_MIN_MM + 2 * clearanceMm
}

/**
 * How thick the wall is on one side of the face at one spot along it, by bisecting a slab
 * pushed in from the bounding edge until it no longer lies in the solid. `0` where even the
 * thinnest slab pokes out (a port, a gap).
 *
 * @param {Geom3} solid
 * @param {number} axisIndex
 * @param {number} cutMm
 * @param {{ alongU: boolean, edgeMm: number, inward: 1 | -1, atMm: number }} side
 * @returns {number}
 */
function wallThickness(solid, axisIndex, cutMm, side) {
  const slab = (/** @type {number} */ x) => {
    const centre = side.edgeMm + (side.inward * x) / 2
    const section = side.alongU ? { uSizeMm: 4, vSizeMm: x } : { uSizeMm: x, vSizeMm: 4 }
    return side.alongU
      ? prismAlong(axisIndex, cutMm - 1, cutMm + 3, side.atMm, centre, section)
      : prismAlong(axisIndex, cutMm - 1, cutMm + 3, centre, side.atMm, section)
  }
  let low = WALL_TONGUE_MIN_MM
  if (!contains(solid, slab(low))) return 0
  let high = MAX_WALL_MM
  if (contains(solid, slab(high))) return high
  for (let i = 0; i < 7; i += 1) {
    const mid = (low + high) / 2
    if (contains(solid, slab(mid))) low = mid
    else high = mid
  }
  return low
}

/**
 * Plan tongues in the walls of a hollow shell on a cut face.
 *
 * @param {object} args
 * @param {Geom3} args.solid The uncut shell.
 * @param {number} args.axisIndex
 * @param {number} args.cutMm
 * @param {Geom3} args.lower Piece A.
 * @param {Geom3} args.upper Piece B.
 * @param {number} args.clearanceMm
 * @param {Footprint[]} [args.keepOut] Connectors already on the face.
 * @returns {JointGeometry | null} `null` when no side takes a rib.
 */
export function wallTongueJoint({ solid, axisIndex, cutMm, lower, upper, clearanceMm, keepOut = [] }) {
  const [u, v] = faceAxes(axisIndex)
  const [min, max] = boundsOf(solid)
  const field = /** @type {any} */ ({ axisIndex, cutMm })
  const sides = [
    { alongU: true, edgeMm: min[v], inward: /** @type {const} */ (1), lo: min[u], hi: max[u] },
    { alongU: true, edgeMm: max[v], inward: /** @type {const} */ (-1), lo: min[u], hi: max[u] },
    { alongU: false, edgeMm: min[u], inward: /** @type {const} */ (1), lo: min[v], hi: max[v] },
    { alongU: false, edgeMm: max[u], inward: /** @type {const} */ (-1), lo: min[v], hi: max[v] },
  ]
  /** @type {JointGeometry[]} */
  const made = []
  /** @type {Footprint[]} */
  const placed = [...keepOut]
  for (const side of sides) {
    const span = side.hi - side.lo
    const rib = findRib(side, span)
    if (rib === null) continue
    made.push(tongueAt({ field, clearanceMm, rib }))
    placed.push(tongueFootprint(rib, clearanceMm))
  }
  if (made.length === 0) return null
  return {
    kind: 'tongue',
    pins: made.flatMap((m) => m.pins),
    sockets: made.flatMap((m) => m.sockets),
    holes: [],
    connectors: made.flatMap((m) => m.connectors),
    summary: `${made.length} tongue${made.length === 1 ? '' : 's'} in the wall, ${made[0].summary.replace(/^tongue /, '')} each at most`,
  }

  /**
   * @param {(typeof sides)[number]} side
   * @param {number} span
   * @returns {import('./joint.tongueGroove.js').Rib | null}
   */
  function findRib(side, span) {
    for (const spot of SPOTS) {
      const atMm = side.lo + spot * span
      const wall = wallThickness(solid, axisIndex, cutMm, { ...side, atMm })
      const widthMm = Math.min((wall - 2 * clearanceMm) / 3, WALL_TONGUE_MAX_MM)
      if (!(widthMm >= WALL_TONGUE_MIN_MM - 1e-9)) continue
      const across = side.edgeMm + (side.inward * wall) / 2
      for (const fraction of LENGTH_FRACTIONS) {
        const lengthMm = fraction * span
        if (!(lengthMm >= 2 * widthMm)) continue
        // Centred on the spot where the wall was measured, but kept inside the side.
        const along = Math.min(Math.max(atMm, side.lo + lengthMm / 2), side.hi - lengthMm / 2)
        const rib = {
          uMm: side.alongU ? along : across,
          vMm: side.alongU ? across : along,
          widthMm,
          lengthMm,
          alongU: side.alongU,
          wallMm: widthMm,
        }
        if (placed.some((other) => footprintsOverlap(other, tongueFootprint(rib, clearanceMm)))) continue
        if (tongueMisfit({ field, lower, upper, clearanceMm, rib }) !== null) continue
        return rib
      }
    }
    return null
  }
}
