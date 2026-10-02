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
