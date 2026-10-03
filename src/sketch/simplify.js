// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Ramer–Douglas–Peucker simplification with a tolerance in millimetres (`TODO/sketch-002`).
 *
 * The profile panel's **Simplify** runs it on the selected outline, so a 400-point traced
 * outline can be thinned to something a person can edit by hand; auto-trace
 * (`TODO/sketch-004`) is meant to use the same pass.
 *
 * Framework-free and pure: plain `[x, y]` millimetre pairs in, a new list out.
 *
 * ## Closed rings
 *
 * RDP is defined on an open chain between two fixed ends. A closed ring has no ends, so it
 * is split at two anchors — point 0 and the point farthest from it — and each half is
 * simplified as a chain with both anchors kept. The result is a ring again (no repeated
 * closing point), in the same order and winding as the input.
 *
 * ## Degenerate cases (CLAUDE.md's numerical convention)
 *
 * - Tolerance `0` is the identity: even exactly collinear points stay. RDP drops a point
 *   whose distance is "not greater than" the tolerance, so a literal 0 would still drop
 *   collinear points; a person who types 0 means "change nothing".
 * - A result with fewer than 3 points on a closed ring (or fewer than 2 on an open chain) is
 *   **rejected** with `null`, never returned: it would not be an outline any more.
 * - Coincident points measure their distance to the single point, never divide by zero.
 *
 * @module sketch/simplify
 */

/** @typedef {[number, number]} Vec2Mm Millimetres in the sketch plane, X then Y. */

/**
 * Distance from `p` to the segment `a`–`b`, in mm. A zero-length segment measures to `a`.
 *
 * @param {readonly number[]} p @param {readonly number[]} a @param {readonly number[]} b
 */
function distanceToSegmentMm(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/**
 * Mark which points of `points[first..last]` survive, both ends included. Iterative (an
 * explicit stack), so a 4096-point outline cannot overflow the call stack.
 *
 * @param {readonly (readonly number[])[]} points
 * @param {number} first
 * @param {number} last
 * @param {number} toleranceMm
 * @param {Uint8Array} keep
 */
function markChain(points, first, last, toleranceMm, keep) {
  keep[first] = 1
  keep[last] = 1
  const stack = [first, last]
  while (stack.length > 0) {
    const end = /** @type {number} */ (stack.pop())
    const start = /** @type {number} */ (stack.pop())
    let farthest = -1
    let farthestDistance = toleranceMm
    for (let index = start + 1; index < end; index += 1) {
      const distance = distanceToSegmentMm(points[index], points[start], points[end])
      if (distance > farthestDistance) {
        farthestDistance = distance
        farthest = index
      }
    }
    if (farthest === -1) continue
    keep[farthest] = 1
    stack.push(start, farthest, farthest, end)
  }
}

/**
 * Drop consecutive duplicates (and, for a ring, a closing duplicate of the first point).
 *
 * @param {readonly (readonly number[])[]} pointsMm
 * @param {boolean} closed
 * @returns {Vec2Mm[]}
 */
function withoutDuplicates(pointsMm, closed) {
  /** @type {Vec2Mm[]} */
  const out = []
  for (const point of pointsMm) {
    const last = out[out.length - 1]
    if (last && last[0] === point[0] && last[1] === point[1]) continue
    out.push([point[0], point[1]])
  }
  while (closed && out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop()
  return out
}

/**
 * Simplify an outline's points.
 *
 * @param {readonly (readonly number[])[]} pointsMm
 * @param {number} toleranceMm How far, at most, a dropped point may lie from the simplified
 *   outline. `0` changes nothing.
 * @param {boolean} closed Whether the points form a ring (last joins back to first).
 * @returns {Vec2Mm[] | null} A new list, or `null` when the result would no longer be an
 *   outline (fewer than 3 points for a ring, 2 for a chain).
 */
export function simplifyPoints(pointsMm, toleranceMm, closed) {
  if (typeof toleranceMm !== 'number' || !Number.isFinite(toleranceMm) || toleranceMm < 0) {
    throw new Error('simplify: the tolerance must be a finite number of millimetres, 0 or more')
  }
  const minimum = closed ? 3 : 2
  if (toleranceMm === 0) {
    const copy = pointsMm.map((point) => /** @type {Vec2Mm} */ ([point[0], point[1]]))
    return withoutDuplicates(copy, closed).length >= minimum ? copy : null
  }
  const points = withoutDuplicates(pointsMm, closed)
  if (points.length < minimum) return null
  const keep = new Uint8Array(points.length)
  if (!closed) {
    markChain(points, 0, points.length - 1, toleranceMm, keep)
  } else {
    // Anchor at point 0 and the point farthest from it; simplify each half as a chain.
    let far = 1
    let farDistance = -1
    for (let index = 1; index < points.length; index += 1) {
      const distance = Math.hypot(points[index][0] - points[0][0], points[index][1] - points[0][1])
      if (distance > farDistance) {
        farDistance = distance
        far = index
      }
    }
    markChain(points, 0, far, toleranceMm, keep)
    // The second half wraps from `far` back round to point 0: simplify it on a copy that
    // ends with point 0 again, then map the indices back.
    const tail = [...points.slice(far), points[0]]
    const tailKeep = new Uint8Array(tail.length)
    markChain(tail, 0, tail.length - 1, toleranceMm, tailKeep)
    for (let index = 0; index < tail.length - 1; index += 1) if (tailKeep[index]) keep[far + index] = 1
  }
  /** @type {Vec2Mm[]} */
  const out = []
  for (let index = 0; index < points.length; index += 1) if (keep[index]) out.push(points[index])
  return out.length >= minimum ? out : null
}
