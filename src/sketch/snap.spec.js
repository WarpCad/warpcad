// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { SNAP_LABELS, createSnapResult, snapPoint, snapTargets } from './snap.js'

/** @typedef {import('./profile.js').Profile} Profile */

/** @returns {Profile} */
const rect = (id = 'r', cx = 0, cy = 0, w = 40, h = 20) => ({ id, kind: 'rect', role: 'solid', centerMm: [cx, cy], widthMm: w, heightMm: h })
/** @returns {Profile} */
const circle = (id = 'c', cx = 0, cy = 0, r = 10) => ({ id, kind: 'circle', role: 'solid', centerMm: [cx, cy], radiusMm: r })
/** @param {string} id @param {[number, number][]} points @returns {Profile} */
const poly = (id, points, closed = false) => ({ id, kind: 'polyline', role: 'solid', closed, pointsMm: points })
/** @returns {Profile} */
const polygon = (id = 'g', cx = 0, cy = 0, r = 10, sides = 4, rotationDeg = 0) => ({ id, kind: 'polygon', role: 'solid', centerMm: [cx, cy], radiusMm: r, sides, rotationDeg })

/** @param {Profile[]} profiles @param {number[]} point @param {number} radius @param {string} [exclude] */
const snap = (profiles, point, radius, exclude = '') => snapPoint(point, snapTargets(profiles, exclude), radius)

describe('snapTargets / snapPoint — each tier', () => {
  it('vertex: a rectangle corner', () => {
    const hit = snap([rect('r', 100, 100)], [120.6, 110.4], 2)
    expect(hit?.kind).toBe('vertex')
    expect(hit?.pointMm[0]).toBeCloseTo(120, 12)
    expect(hit?.pointMm[1]).toBeCloseTo(110, 12)
  })

  it('vertex: a polyline point and a polygon vertex', () => {
    const line = snap([poly('p', [[0, 0], [50, 0], [50, 30]])], [49, 31], 3)
    expect(line).toMatchObject({ kind: 'vertex' })
    expect(line?.pointMm[0]).toBeCloseTo(50, 12)
    expect(line?.pointMm[1]).toBeCloseTo(30, 12)
    // A 4-gon at 0° has a vertex on +X at the circumradius.
    const gon = snap([polygon('g', 0, 0, 10, 4, 0)], [10.5, 0.4], 1)
    expect(gon?.kind).toBe('vertex')
    expect(gon?.pointMm[0]).toBeCloseTo(10, 12)
    expect(gon?.pointMm[1]).toBeCloseTo(0, 12)
  })

  it('centre: a circle, a rectangle and a polygon centre', () => {
    for (const profile of [circle('c', 30, -20, 15), rect('r', 30, -20), polygon('g', 30, -20, 15, 6)]) {
      const hit = snap([profile], [31, -19], 2)
      expect(hit?.kind).toBe('centre')
      expect(hit?.pointMm[0]).toBeCloseTo(30, 12)
      expect(hit?.pointMm[1]).toBeCloseTo(-20, 12)
    }
  })

  it('quadrant: the top of a circle', () => {
    const hit = snap([circle('c', 0, 0, 10)], [0.8, 10.3], 1)
    expect(hit?.kind).toBe('quadrant')
    expect(hit?.pointMm[0]).toBeCloseTo(0, 12)
    expect(hit?.pointMm[1]).toBeCloseTo(10, 12)
  })

  it('midpoint: a rectangle edge and a polyline segment', () => {
    const edge = snap([rect('r', 0, 0, 40, 20)], [0.5, 10.5], 1)
    expect(edge?.kind).toBe('midpoint')
    expect(edge?.pointMm[0]).toBeCloseTo(0, 12)
    expect(edge?.pointMm[1]).toBeCloseTo(10, 12)
    const segment = snap([poly('p', [[0, 0], [40, 20]])], [20.5, 9.5], 1)
    expect(segment?.kind).toBe('midpoint')
    expect(segment?.pointMm[0]).toBeCloseTo(20, 12)
    expect(segment?.pointMm[1]).toBeCloseTo(10, 12)
  })

  it('edge: the nearest point on a rectangle edge, perpendicular to it', () => {
    const hit = snap([rect('r', 0, 0, 40, 20)], [7, 10.6], 1)
    expect(hit?.kind).toBe('edge')
    expect(hit?.pointMm[0]).toBeCloseTo(7, 12)
    expect(hit?.pointMm[1]).toBeCloseTo(10, 12)
  })

  it('edge: a point on the circumference lands exactly r from the centre', () => {
    const c = circle('c', 3.25, -7.5, 12.345)
    const hit = snap([c], [3.25 + 9, -7.5 + 9], 1)
    expect(hit?.kind).toBe('edge')
    const [x, y] = /** @type {number[]} */ (hit?.pointMm)
    expect(Math.abs(Math.hypot(x - 3.25, y + 7.5) - 12.345)).toBeLessThan(1e-9)
    // …and along the ray from the centre through the pointer.
    expect(Math.atan2(y + 7.5, x - 3.25)).toBeCloseTo(Math.PI / 4, 9)
  })

  it('edge: an open polyline has no closing segment', () => {
    const open = poly('p', [[0, 0], [40, 0], [40, 40]])
    // Near the would-be closing edge (0,0)→(40,40) at (10,10) — but nowhere near any real one.
    expect(snap([open], [10, 11], 1)).toBeNull()
    const closed = poly('p', [[0, 0], [40, 0], [40, 40]], true)
    expect(snap([closed], [10, 11], 1)?.kind).toBe('edge')
  })

  it('origin: only when another outline is on the slice, and only as the last resort', () => {
    const far = rect('r', 500, 500)
    const hit = snap([far], [0.4, -0.3], 1)
    expect(hit?.kind).toBe('origin')
    expect(hit?.pointMm).toEqual([0, 0])
    expect(snap([], [0.4, -0.3], 1)).toBeNull()
  })

  it('labels name every kind in words', () => {
    expect(SNAP_LABELS).toMatchObject({ vertex: 'Corner', centre: 'Centre', midpoint: 'Midpoint', edge: 'On edge' })
    expect(typeof SNAP_LABELS.quadrant).toBe('string')
    expect(typeof SNAP_LABELS.origin).toBe('string')
  })
})

describe('snapPoint — priority, radius and exclusion', () => {
  it('a vertex beats a nearer point on an edge', () => {
    // 0.2 mm from the top edge, 0.9 mm from the corner: the corner wins.
    const hit = snap([rect('r', 0, 0, 40, 20)], [19.3, 10.2], 1)
    expect(hit?.kind).toBe('vertex')
    expect(hit?.pointMm[0]).toBeCloseTo(20, 12)
    expect(hit?.pointMm[1]).toBeCloseTo(10, 12)
  })

  it('a centre beats a midpoint, a midpoint beats an edge', () => {
    // A segment's midpoint at (0, 0) is 0.2 mm away, a big circle's centre 0.8 mm: the centre wins.
    const segment = poly('p', [[-10, 0], [10, 0]])
    const big = circle('c', 0, 1, 50)
    const hit = snap([segment, big], [0, 0.2], 1)
    expect(hit?.kind).toBe('centre')
    expect(hit?.pointMm[1]).toBeCloseTo(1, 12)
    expect(snap([rect('r', 0, 0, 40, 20)], [1.5, 10.1], 2)?.kind).toBe('midpoint')
  })

  it('the nearest wins inside a tier', () => {
    const a = rect('a', 0, 0, 10, 10) // corner (5, 5)
    const b = rect('b', 11, 11, 10, 10) // corner (6, 6)
    const hit = snap([a, b], [5.7, 5.8], 2)
    expect(hit?.kind).toBe('vertex')
    expect(hit?.pointMm[0]).toBeCloseTo(6, 12)
    expect(hit?.pointMm[1]).toBeCloseTo(6, 12)
  })

  it('outside the radius returns null; on the radius snaps', () => {
    const r = rect('r', 100, 100, 40, 20)
    // The top edge's midpoint (100, 110) is exactly 5 mm away.
    expect(snap([r], [100, 115], 4.999)).toBeNull()
    expect(snap([r], [100, 115], 5)?.kind).toBe('midpoint')
  })

  it('the outline being drawn is excluded', () => {
    const own = poly('own', [[0, 0], [10, 0]])
    expect(snap([own], [10.2, 0.1], 1, 'own')).toBeNull()
    const other = rect('o', 200, 200)
    // Only the other outline's targets remain — the origin among them, its own points not.
    const hit = snap([own, other], [10.2, 0.1], 1, 'own')
    expect(hit).toBeNull()
  })

  it('a live Line chain keeps its first point as a vertex target (close on first)', () => {
    const chain = poly('chain', [[0, 0], [30, 0], [30, 30]])
    const targets = snapTargets([chain], 'chain', { keepFirstVertex: true })
    const hit = snapPoint([0.5, 0.5], targets, 1)
    expect(hit?.kind).toBe('vertex')
    expect(hit?.pointMm[0]).toBeCloseTo(0, 12)
    // Its other vertices and edges are still not targets.
    expect(snapPoint([30.2, 0.2], targets, 1)).toBeNull()
    expect(snapPoint([15, 0.2], targets, 1)).toBeNull()
    // A two-point chain cannot close, so its first point is no target yet.
    expect(snapPoint([0.5, 0.5], snapTargets([poly('chain', [[0, 0], [30, 0]])], 'chain', { keepFirstVertex: true }), 1)).toBeNull()
  })

  it('writes into a caller-owned result instead of allocating one', () => {
    const targets = snapTargets([rect('r', 0, 0, 40, 20)])
    const out = createSnapResult()
    const first = snapPoint([20.2, 10.1], targets, 1, out)
    expect(first).toBe(out)
    const second = snapPoint([-20.2, -10.1], targets, 1, out)
    expect(second).toBe(out)
    expect(out.pointMm[0]).toBeCloseTo(-20, 12)
    expect(out.pointMm[1]).toBeCloseTo(-10, 12)
  })
})

describe('snapTargets / snapPoint — degenerate input never throws', () => {
  it('an empty slice', () => {
    expect(() => snap([], [0, 0], 5)).not.toThrow()
    expect(snap([], [0, 0], 5)).toBeNull()
  })

  it('a zero-length segment snaps to its point', () => {
    const hit = snap([poly('p', [[5, 5], [5, 5], [20, 5]])], [5.3, 5.2], 1)
    expect(hit?.pointMm[0]).toBeCloseTo(5, 12)
    expect(hit?.pointMm[1]).toBeCloseTo(5, 12)
  })

  it('a zero-radius circle is just its centre', () => {
    const hit = snap([circle('c', 7, 7, 0)], [7.2, 7.1], 1)
    expect(hit?.pointMm[0]).toBeCloseTo(7, 12)
    expect(hit?.pointMm[1]).toBeCloseTo(7, 12)
    // A pointer exactly on the centre of a zero-radius circle: no NaN direction.
    const exact = snap([circle('c', 7, 7, 0)], [7, 7], 1)
    expect(Number.isFinite(exact?.pointMm[0])).toBe(true)
  })

  it('a pointer on a circle centre never yields NaN from the circumference', () => {
    const targets = snapTargets([circle('c', 0, 0, 0.5)])
    // Radius large enough that only the edge tier could compete — but the centre wins anyway.
    const hit = snapPoint([0, 0], targets, 2)
    expect(hit?.kind).toBe('centre')
    expect(Number.isFinite(hit?.pointMm[1])).toBe(true)
  })

  it('coincident vertices from two outlines', () => {
    const hit = snap([rect('a', 0, 0, 10, 10), rect('b', 10, 10, 10, 10)], [5.1, 4.9], 1)
    expect(hit?.kind).toBe('vertex')
    expect(hit?.pointMm[0]).toBeCloseTo(5, 12)
    expect(hit?.pointMm[1]).toBeCloseTo(5, 12)
  })

  it('a single profile, non-finite pointer, and non-finite geometry', () => {
    expect(() => snap([circle()], [Number.NaN, 0], 1)).not.toThrow()
    expect(snap([circle()], [Number.NaN, 0], 1)).toBeNull()
    expect(() => snap([circle('c', Number.NaN, 0, 5)], [0, 0], 1)).not.toThrow()
    expect(snap([circle()], [0, 0], 0)).toEqual({ pointMm: [0, 0], kind: 'centre' })
    expect(snap([circle()], [0, 0], -1)).toBeNull()
  })
})
