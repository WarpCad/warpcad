// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — fixture outlines are plain literals; the module under test types them.
import { describe, expect, it } from 'vitest'

import { loftRings, normalizeCcw, resampleClosed, rotateToPlusX } from './resample.js'
import { signedAreaMm2 } from './profile.js'

/** @param {number[][]} points */
function perimeter(points) {
  let total = 0
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

/** @param {number[][]} points @param {number[]} target */
function hasPoint(points, target, tolerance) {
  return points.some((point) => Math.hypot(point[0] - target[0], point[1] - target[1]) <= tolerance)
}

const SQUARE = [
  [-10, -10],
  [10, -10],
  [10, 10],
  [-10, 10],
]

describe('normalizeCcw', () => {
  it('turns clockwise input counter-clockwise and leaves CCW alone', () => {
    const cw = [...SQUARE].reverse()
    expect(signedAreaMm2(cw)).toBeLessThan(0)
    expect(signedAreaMm2(normalizeCcw(cw))).toBeGreaterThan(0)
    expect(normalizeCcw(SQUARE)).toEqual(SQUARE)
  })
})

describe('rotateToPlusX', () => {
  it('starts at the vertex nearest the +X ray from the centroid, however the list was rotated', () => {
    const diamond = [
      [0, -10],
      [10, 0],
      [0, 10],
      [-10, 0],
    ]
    for (let shift = 0; shift < 4; shift += 1) {
      const rotated = [...diamond.slice(shift), ...diamond.slice(0, shift)]
      expect(rotateToPlusX(rotated)[0], `shift ${shift}`).toEqual([10, 0])
    }
  })
})

describe('resampleClosed', () => {
  it('keeps a square’s perimeter at 64 points', () => {
    const resampled = resampleClosed(SQUARE, 64)
    expect(resampled).toHaveLength(64)
    expect(perimeter(resampled)).toBeCloseTo(perimeter(SQUARE), 6)
  })

  it('keeps every corner, to within 0.01 mm, at any point count it uses', () => {
    for (const count of [4, 5, 9, 64]) {
      const resampled = resampleClosed(SQUARE, count)
      for (const corner of SQUARE) expect(hasPoint(resampled, corner, 0.01), `${count}: ${corner}`).toBe(true)
    }
  })

  it('never drops a corner to meet a smaller count: N below the vertex count is raised to it', () => {
    const resampled = resampleClosed(SQUARE, 3)
    expect(resampled).toHaveLength(4)
    for (const corner of SQUARE) expect(hasPoint(resampled, corner, 0.01)).toBe(true)
  })

  it('rejects an outline whose points are all collinear', () => {
    expect(() => resampleClosed([[0, 0], [5, 0], [10, 0]], 8)).toThrow(/encloses no area/)
  })
})

describe('loftRings', () => {
  const ring = (size) => [
    [-size, -size],
    [size, -size],
    [size, size],
    [-size, size],
  ]

  it('gives every slice the same count, CCW, starting toward +X, sorted by Z', () => {
    const rings = loftRings(
      [
        { zMm: 200, pointsMm: ring(5) },
        { zMm: 0, pointsMm: [...ring(10)].reverse() },
        { zMm: 100, pointsMm: ring(8) },
      ],
      0,
    )
    expect(rings.map((entry) => entry.zMm)).toEqual([0, 100, 200])
    const counts = new Set(rings.map((entry) => entry.pointsMm.length))
    expect(counts.size).toBe(1)
    for (const entry of rings) expect(signedAreaMm2(entry.pointsMm)).toBeGreaterThan(0)
  })

  it('rejects two slices at the same Z', () => {
    expect(() =>
      loftRings(
        [
          { zMm: 10, pointsMm: ring(5) },
          { zMm: 10, pointsMm: ring(6) },
        ],
        0,
      ),
    ).toThrow(/same Z/)
  })

  it('caps the resolution at 256 points', () => {
    const rings = loftRings(
      [
        { zMm: 0, pointsMm: ring(5) },
        { zMm: 10, pointsMm: ring(6) },
      ],
      10000,
    )
    expect(rings[0].pointsMm).toHaveLength(256)
  })
})

describe('loftRings with airfoils (TODO/sketch-008) — trailing edge to trailing edge, never inside out', () => {
  /** @param {number[][]} ring @param {number} by */
  const roll = (ring, by) => [...ring.slice(by), ...ring.slice(0, by)]
  /** The index of the ring's trailing edge: its point farthest along +X. */
  const trailingEdgeOf = (ring) => ring.reduce((best, point, index) => (point[0] > ring[best][0] ? index : best), 0)
  /** The index of the ring's leading edge: its point farthest along −X. */
  const leadingEdgeOf = (ring) => ring.reduce((best, point, index) => (point[0] < ring[best][0] ? index : best), 0)
  /** Every point in chord fractions about the leading edge, so different chords compare. */
  const normalized = (ring) => {
    const le = ring[leadingEdgeOf(ring)]
    const te = ring[trailingEdgeOf(ring)]
    const chord = Math.hypot(te[0] - le[0], te[1] - le[1])
    return ring.map((point) => [(point[0] - le[0]) / chord, (point[1] - le[1]) / chord])
  }

  /** @param {number[][][]} rings */
  const worstMismatch = (a, b) => {
    const na = normalized(a)
    const nb = normalized(b)
    return Math.max(...na.map((point, index) => Math.hypot(point[0] - nb[index][0], point[1] - nb[index][1])))
  }

  it.each([
    ['same count, same start', 80, 80, 0],
    ['different counts', 80, 61, 0],
    ['different counts and a 180° start mismatch', 80, 61, 30],
    ['a start one vertex off', 80, 80, 1],
    ['a start one vertex back', 80, 80, 79],
  ])('%s: index i on the root is the same chord station on the tip', async (_label, rootPoints, tipPoints, rollBy) => {
    const { naca4 } = await import('./curves.js')
    const root = naca4('2412', 120, { points: rootPoints })
    const tip = roll(
      naca4('2412', 70, { points: tipPoints }).map(([x, y]) => [x + 30, y]),
      rollBy,
    )
    const [a, b] = loftRings(
      [
        { zMm: 0, pointsMm: root },
        { zMm: 200, pointsMm: tip },
      ],
      0,
    )
    expect(a.pointsMm).toHaveLength(b.pointsMm.length)
    expect(trailingEdgeOf(b.pointsMm)).toBe(trailingEdgeOf(a.pointsMm))
    expect(leadingEdgeOf(b.pointsMm)).toBe(leadingEdgeOf(a.pointsMm))
    // No station is further than 3 % of chord from its partner: the skin runs straight back.
    expect(worstMismatch(a.pointsMm, b.pointsMm)).toBeLessThan(0.03)
  })

  it('a 2° washout on the tip keeps the trailing edges paired', async () => {
    const { naca4 } = await import('./curves.js')
    const turn = (ring, deg) => {
      const r = (deg * Math.PI) / 180
      return ring.map(([x, y]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)])
    }
    const [a, b] = loftRings(
      [
        { zMm: 0, pointsMm: naca4('4415', 120, { points: 80 }) },
        { zMm: 200, pointsMm: turn(naca4('4415', 70, { points: 64 }), -2) },
      ],
      0,
    )
    // Turned 2°, the tip's farthest +X point is an upper-surface station, not its trailing
    // edge — so find each trailing edge by where it is.
    const nearest = (ring, target) =>
      ring.reduce((best, point, index) => (Math.hypot(point[0] - target[0], point[1] - target[1]) < Math.hypot(ring[best][0] - target[0], ring[best][1] - target[1]) ? index : best), 0)
    const r = (-2 * Math.PI) / 180
    expect(nearest(b.pointsMm, [70 * Math.cos(r), 70 * Math.sin(r)])).toBe(nearest(a.pointsMm, [120, 0]))
  })

  it('still pairs squares corner to corner (the sketch-001 case is unchanged)', () => {
    const square = (size) => [
      [-size, -size],
      [size, -size],
      [size, size],
      [-size, size],
    ]
    const [a, b] = loftRings(
      [
        { zMm: 0, pointsMm: square(10) },
        { zMm: 50, pointsMm: roll(square(5), 2) },
      ],
      0,
    )
    a.pointsMm.forEach((point, index) => {
      expect(b.pointsMm[index][0] * 2).toBeCloseTo(point[0], 9)
      expect(b.pointsMm[index][1] * 2).toBeCloseTo(point[1], 9)
    })
  })
})
