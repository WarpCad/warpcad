// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Loft numerics: make every slice's outline wall-able to the next (`TODO/sketch-001`).
 *
 * `@jscad/modeling`'s `extrudeFromSlices` walls slice *n* to slice *n + 1* **by vertex
 * index**. So every ring must have the same vertex count, the same winding, and
 * corresponding start points, or the skin twists or tears — `src/core/kernel/fillet.js`
 * already met the "cannot wall two rings of different lengths" version of this. For each
 * slice's single Solid outline this module:
 *
 * 1. normalizes the winding to counter-clockwise;
 * 2. rotates the vertex list to start at the vertex nearest the +X ray from the
 *    outline's centroid, so the skin does not twist;
 * 3. resamples by arc length to N points — **keeping every original vertex**. Extra
 *    points are spread along the edges in proportion to their length, so a corner is
 *    never rounded off by the resample. A requested N below a ring's own vertex count is
 *    raised to it rather than honoured by dropping corners.
 *
 * Framework-free and kernel-free: plain point lists in, plain point lists out.
 *
 * @module sketch/resample
 */

import { signedAreaMm2 } from './profile.js'

/** @typedef {import('./profile.js').Vec2Mm} Vec2Mm */

/** The most points a Loft ring is ever resampled to. */
export const MAX_LOFT_POINTS = 256

/** Below this, in mm², an outline encloses nothing. */
const AREA_EPS_MM2 = 1e-9

/**
 * The same ring, counter-clockwise.
 *
 * @param {readonly Vec2Mm[]} pointsMm
 * @returns {Vec2Mm[]} A new array when reversed; the input when already CCW.
 */
export function normalizeCcw(pointsMm) {
  return signedAreaMm2(pointsMm) < 0 ? [...pointsMm].reverse() : /** @type {Vec2Mm[]} */ (pointsMm)
}

/**
 * The ring rotated to start at the vertex whose direction from the centroid is closest
 * to +X. Choosing by *angle* rather than by distance to the ray keeps the choice stable
 * for rings of very different sizes, which is exactly the Loft case.
 *
 * @param {readonly Vec2Mm[]} pointsMm
 * @returns {Vec2Mm[]}
 */
export function rotateToPlusX(pointsMm) {
  let cx = 0
  let cy = 0
  for (const point of pointsMm) {
    cx += point[0]
    cy += point[1]
  }
  cx /= pointsMm.length
  cy /= pointsMm.length
  let start = 0
  let bestAngle = Infinity
  pointsMm.forEach((point, index) => {
    const angle = Math.abs(Math.atan2(point[1] - cy, point[0] - cx))
    if (angle < bestAngle - 1e-12) {
      bestAngle = angle
      start = index
    }
  })
  return [...pointsMm.slice(start), ...pointsMm.slice(0, start)]
}

/**
 * Resample a closed ring to `count` points by arc length, keeping every original vertex.
 *
 * @param {readonly Vec2Mm[]} pointsMm A closed ring, without a repeated closing point.
 * @param {number} count Wanted point count; raised to the ring's vertex count if lower.
 * @returns {Vec2Mm[]}
 * @throws {Error} For a ring that encloses no area (collinear or coincident points).
 */
export function resampleClosed(pointsMm, count) {
  const ring = pointsMm.filter((point, index) => {
    const next = pointsMm[(index + 1) % pointsMm.length]
    return Math.hypot(next[0] - point[0], next[1] - point[1]) > 1e-12
  })
  if (ring.length < 3 || Math.abs(signedAreaMm2(ring)) <= AREA_EPS_MM2) {
    throw new Error('resample: this outline encloses no area — its points are collinear or coincident')
  }
  const total = Math.max(ring.length, Math.round(count))
  const extra = total - ring.length
  const lengths = ring.map((point, index) => {
    const next = ring[(index + 1) % ring.length]
    return Math.hypot(next[0] - point[0], next[1] - point[1])
  })
  const perimeter = lengths.reduce((sum, length) => sum + length, 0)

  // Largest-remainder apportionment of the extra points over the edges.
  const ideal = lengths.map((length) => (extra * length) / perimeter)
  const given = ideal.map(Math.floor)
  let left = extra - given.reduce((sum, value) => sum + value, 0)
  const byRemainder = ideal.map((value, index) => [value - Math.floor(value), index]).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0; k += 1, left -= 1) given[byRemainder[k % byRemainder.length][1]] += 1

  /** @type {Vec2Mm[]} */
  const out = []
  ring.forEach((point, index) => {
    const next = ring[(index + 1) % ring.length]
    out.push([point[0], point[1]])
    const between = given[index]
    for (let step = 1; step <= between; step += 1) {
      const t = step / (between + 1)
      out.push([point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t])
    }
  })
  return out
}

/**
 * @typedef {object} LoftRing
 * @property {number} zMm
 * @property {Vec2Mm[]} pointsMm
 */

/**
 * Every Loft slice's outline, ready to wall: sorted by Z, CCW, started toward +X, and all
 * resampled to one shared count.
 *
 * @param {readonly LoftRing[]} rings One outline per slice, in any order.
 * @param {number} resolution Wanted points per ring; `0` means automatic (the largest
 *   vertex count). Capped at {@link MAX_LOFT_POINTS}, and never below a ring's own count.
 * @returns {LoftRing[]}
 * @throws {Error} When two slices share a Z, or a ring encloses no area.
 */
export function loftRings(rings, resolution) {
  const sorted = [...rings].sort((a, b) => a.zMm - b.zMm)
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].zMm === sorted[index - 1].zMm) {
      throw new Error(`resample: two slices are at the same Z (${sorted[index].zMm} mm) — Loft needs each at its own height`)
    }
  }
  const largest = Math.max(...sorted.map((ring) => ring.pointsMm.length))
  if (largest > MAX_LOFT_POINTS) {
    throw new Error(`resample: a Loft outline has ${largest} points — the limit is ${MAX_LOFT_POINTS}`)
  }
  const wanted = Math.min(MAX_LOFT_POINTS, Math.max(resolution > 0 ? resolution : largest, largest))
  return sorted.map((ring) => ({
    zMm: ring.zMm,
    pointsMm: resampleClosed(rotateToPlusX(normalizeCcw(ring.pointsMm)), wanted),
  }))
}
