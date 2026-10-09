// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — fixture outlines are plain literals; the module under test types them.
import { describe, expect, it } from 'vitest'

import {
  CurveParamError,
  arc,
  bezier,
  catmullRom,
  curvePoints,
  describeCurve,
  ellipse,
  naca4,
  naca4Ordinates,
  resampleByArcLength,
} from './curves.js'
import { selfIntersects, signedAreaMm2 } from './profile.js'

/**
 * The open-trailing-edge 4-digit half-thickness polynomial, in chord fractions — written
 * out here independently of the module, so a typo in either copy shows up.
 *
 * @param {number} t Thickness as a fraction of chord.
 * @param {number} x Station as a fraction of chord.
 */
function halfThickness(t, x) {
  return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1015 * x ** 4)
}

/** @param {number[][]} points */
function perimeter(points, closed = true) {
  let total = 0
  const edges = closed ? points.length : points.length - 1
  for (let index = 0; index < edges; index += 1) {
    const a = points[index]
    const b = points[(index + 1) % points.length]
    total += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return total
}

/**
 * The airfoil's surface heights at chord station `xMm`, read off the sampled ring by linear
 * interpolation: the upper surface is the first half of the ring, the lower the second.
 *
 * @param {number[][]} ring
 * @param {number} xMm
 */
function surfaceAt(ring, xMm) {
  /** @type {number[]} */
  const ys = []
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index]
    const b = ring[(index + 1) % ring.length]
    if ((a[0] - xMm) * (b[0] - xMm) <= 0 && a[0] !== b[0]) {
      const t = (xMm - a[0]) / (b[0] - a[0])
      ys.push(a[1] + (b[1] - a[1]) * t)
    }
  }
  return { upper: Math.max(...ys), lower: Math.min(...ys) }
}

describe('naca4Ordinates — the standard 4-digit equations, in chord fractions', () => {
  it('NACA 0012 is 12 % thick at 30 % chord — twice the half-thickness polynomial there', () => {
    const at = naca4Ordinates('0012', 0.3, { closedTrailingEdge: false })
    expect(at.yUpper - at.yLower).toBeCloseTo(2 * halfThickness(0.12, 0.3), 10)
    // The polynomial at 0.3 is 0.100029…, so the full thickness is 0.12 × 1.00029 of chord.
    expect(at.yUpper - at.yLower).toBeCloseTo(0.12 * 1.00029, 5)
    expect(at.yCamber).toBe(0)
  })

  it('NACA 2412 has its 2 % maximum camber at 40 % chord', () => {
    const peak = naca4Ordinates('2412', 0.4).yCamber
    expect(peak).toBeCloseTo(0.02, 12)
    for (const x of [0.1, 0.2, 0.3, 0.39, 0.41, 0.5, 0.7, 0.9]) {
      expect(naca4Ordinates('2412', x).yCamber, `x ${x}`).toBeLessThan(peak)
    }
  })

  it('closes the trailing edge with the modified last coefficient (−0.1036): zero thickness at x = 1', () => {
    const closed = naca4Ordinates('0012', 1, { closedTrailingEdge: true })
    expect(closed.yUpper - closed.yLower).toBeCloseTo(0, 12)
    const open = naca4Ordinates('0012', 1, { closedTrailingEdge: false })
    // The textbook coefficients leave a 0.252 %-of-thickness gap — the tiny blunt edge.
    expect(open.yUpper - open.yLower).toBeCloseTo(2 * 5 * 0.12 * 0.0021, 10)
  })
})

describe('naca4 — an airfoil as a closed sketch outline', () => {
  const CHORD = 120

  it('starts at the trailing edge, winds counter-clockwise and closes the trailing edge', () => {
    const ring = naca4('2412', CHORD)
    expect(ring[0][0]).toBeCloseTo(CHORD, 9)
    expect(ring[0][1]).toBeCloseTo(0, 9)
    expect(signedAreaMm2(ring)).toBeGreaterThan(0)
    // No repeated closing point, and no second trailing-edge point: the edge is shut.
    const last = ring[ring.length - 1]
    expect(Math.hypot(last[0] - ring[0][0], last[1] - ring[0][1])).toBeGreaterThan(1e-6)
    expect(ring.filter((point) => Math.abs(point[0] - CHORD) < 1e-9)).toHaveLength(1)
  })

  it('goes over the top first: point 1 is on the upper surface, the last point on the lower', () => {
    const ring = naca4('0012', CHORD)
    expect(ring[1][1]).toBeGreaterThan(0)
    expect(ring[ring.length - 1][1]).toBeLessThan(0)
  })

  it('makes exactly the points asked for, with the leading edge at the sketch origin', () => {
    for (const points of [8, 9, 80, 81, 160]) {
      const ring = naca4('2412', CHORD, { points })
      expect(ring, `${points}`).toHaveLength(points)
      expect(Math.min(...ring.map((point) => point[0]))).toBeCloseTo(0, 6)
    }
  })

  it('samples the 0012 surface: 12 % thickness at 30 % chord within 0.5 %', () => {
    const ring = naca4('0012', CHORD, { points: 160, closedTrailingEdge: false })
    const { upper, lower } = surfaceAt(ring, 0.3 * CHORD)
    expect(Math.abs(upper - lower - 2 * halfThickness(0.12, 0.3) * CHORD) / (0.12 * CHORD)).toBeLessThan(0.005)
  })

  it('crowds the leading edge (cosine spacing): the first 10 % of chord gets about twice its share of the points', () => {
    const ring = naca4('0012', CHORD, { points: 80 })
    const nose = ring.filter((point) => point[0] < 0.1 * CHORD).length
    // x = (1 − cos β)/2 < 0.1 for β < 0.6435 rad: 20.5 % of each surface's stations.
    expect(nose / ring.length).toBeGreaterThan(0.18)
  })

  it('never crosses itself, for thin, thick and cambered sections', () => {
    for (const code of ['0006', '0012', '2412', '4415', '6409', '0024']) {
      const ring = naca4(code, CHORD, { points: 80 })
      expect(selfIntersects({ id: 'a', kind: 'polyline', role: 'solid', closed: true, pointsMm: ring }), code).toBe(false)
    }
  })

  it('an open trailing edge is a short blunt edge from the last point back to point 0', () => {
    const ring = naca4('0012', CHORD, { points: 81, closedTrailingEdge: false })
    expect(ring).toHaveLength(81)
    const last = ring[ring.length - 1]
    expect(ring[0][0]).toBeCloseTo(CHORD, 6)
    expect(last[0]).toBeCloseTo(CHORD, 6)
    expect(ring[0][1] - last[1]).toBeCloseTo(2 * 5 * 0.12 * 0.0021 * CHORD, 6)
  })

  it('scales linearly with chord', () => {
    const a = naca4('2412', 100, { points: 40 })
    const b = naca4('2412', 50, { points: 40 })
    a.forEach((point, index) => {
      expect(b[index][0]).toBeCloseTo(point[0] / 2, 9)
      expect(b[index][1]).toBeCloseTo(point[1] / 2, 9)
    })
  })

  it('refuses bad input with a CurveParamError naming the field', () => {
    const cases = [
      [() => naca4('2412', CHORD, { points: 3 }), 'points'],
      [() => naca4('2412', 0), 'chordMm'],
      [() => naca4('2412', -10), 'chordMm'],
      [() => naca4('2412', Number.NaN), 'chordMm'],
      [() => naca4('abcd', CHORD), 'code'],
      [() => naca4('241', CHORD), 'code'],
      [() => naca4('2400', CHORD), 'code'],
      [() => naca4('2012', CHORD), 'code'],
      [() => naca4('2412', CHORD, { points: 4097 }), 'points'],
      [() => naca4('2412', CHORD, { points: 12.5 }), 'points'],
    ]
    for (const [call, field] of cases) {
      let caught = null
      try {
        call()
      } catch (error) {
        caught = error
      }
      expect(caught, field).toBeInstanceOf(CurveParamError)
      expect(caught.name).toBe('CurveParamError')
      expect(caught.field).toBe(field)
      expect(caught.message).toContain(field)
    }
  })
})

describe('ellipse, arc, bezier, catmullRom', () => {
  it('ellipse: a CCW ring starting on +X, area close to πab', () => {
    const ring = ellipse(30, 10, { points: 128, centerMm: [5, -2] })
    expect(ring).toHaveLength(128)
    expect(ring[0][0]).toBeCloseTo(35, 9)
    expect(ring[0][1]).toBeCloseTo(-2, 9)
    expect(signedAreaMm2(ring)).toBeGreaterThan(0)
    expect(Math.abs(signedAreaMm2(ring) - Math.PI * 300) / (Math.PI * 300)).toBeLessThan(0.002)
    expect(() => ellipse(0, 10)).toThrow(CurveParamError)
    expect(() => ellipse(10, -1)).toThrow(/radiusYMm/)
  })

  it('arc: an open run of points from startDeg to endDeg, both ends included', () => {
    const run = arc(10, 0, 90, { points: 5 })
    expect(run).toHaveLength(5)
    expect(run[0][0]).toBeCloseTo(10, 9)
    expect(run[4][1]).toBeCloseTo(10, 9)
    for (const point of run) expect(Math.hypot(point[0], point[1])).toBeCloseTo(10, 9)
    expect(() => arc(10, 0, 90, { points: 1 })).toThrow(/points/)
  })

  it('bezier: passes through its end control points, stays inside the hull', () => {
    const run = bezier(
      [
        [0, 0],
        [10, 20],
        [30, 20],
        [40, 0],
      ],
      { points: 21 },
    )
    expect(run).toHaveLength(21)
    expect(run[0]).toEqual([0, 0])
    expect(run[20][0]).toBeCloseTo(40, 9)
    expect(run[20][1]).toBeCloseTo(0, 9)
    // The cubic's mid-point: (0 + 3·10 + 3·30 + 40)/8, (3·20 + 3·20)/8.
    expect(run[10][0]).toBeCloseTo(20, 9)
    expect(run[10][1]).toBeCloseTo(15, 9)
    expect(() => bezier([[0, 0]], { points: 5 })).toThrow(CurveParamError)
  })

  it('catmullRom: passes through every control point; closed makes a ring', () => {
    const controls = [
      [0, 0],
      [20, 0],
      [20, 10],
      [0, 10],
    ]
    const ring = catmullRom(controls, { closed: true, samplesPerSegment: 8 })
    expect(ring).toHaveLength(32)
    for (const control of controls) {
      expect(ring.some((point) => Math.hypot(point[0] - control[0], point[1] - control[1]) < 1e-9), `${control}`).toBe(true)
    }
    const open = catmullRom(controls, { closed: false, samplesPerSegment: 8 })
    expect(open).toHaveLength(25)
    expect(open[open.length - 1]).toEqual([0, 10])
    expect(() => catmullRom([[0, 0]], { closed: true })).toThrow(CurveParamError)
  })

  it('catmullRom: coincident neighbours (a doubled click) do not make NaNs', () => {
    const ring = catmullRom(
      [
        [0, 0],
        [0, 0],
        [20, 0],
        [10, 10],
      ],
      { closed: true, samplesPerSegment: 4 },
    )
    for (const point of ring) expect(Number.isFinite(point[0]) && Number.isFinite(point[1])).toBe(true)
  })
})

describe('resampleByArcLength', () => {
  it('spaces points evenly along a closed ring and keeps its perimeter', () => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]
    const out = resampleByArcLength(square, 40)
    expect(out).toHaveLength(40)
    expect(perimeter(out)).toBeCloseTo(40, 9)
    for (let index = 0; index < out.length; index += 1) {
      const a = out[index]
      const b = out[(index + 1) % out.length]
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(1, 9)
    }
    expect(out[0]).toEqual([0, 0])
  })

  it('an open run keeps both ends', () => {
    const out = resampleByArcLength(
      [
        [0, 0],
        [3, 0],
        [3, 4],
      ],
      8,
      { closed: false },
    )
    expect(out).toHaveLength(8)
    expect(out[0]).toEqual([0, 0])
    expect(out[7][0]).toBeCloseTo(3, 9)
    expect(out[7][1]).toBeCloseTo(4, 9)
  })

  it('refuses a zero-length run and a count below what the run needs', () => {
    expect(() => resampleByArcLength([[1, 1], [1, 1], [1, 1]], 8)).toThrow(CurveParamError)
    expect(() => resampleByArcLength([[0, 0], [1, 0], [1, 1]], 2)).toThrow(/count/)
  })
})

describe('curvePoints / describeCurve — a polyline’s `source`, regenerated and named', () => {
  it('regenerates an airfoil at its placement point', () => {
    const source = { curve: 'naca4', params: { code: '2412', chordMm: 120, points: 80 }, atMm: [10, -5] }
    const ring = curvePoints(source)
    const plain = naca4('2412', 120, { points: 80 })
    expect(ring).toHaveLength(80)
    expect(ring[0][0]).toBeCloseTo(plain[0][0] + 10, 9)
    expect(ring[0][1]).toBeCloseTo(plain[0][1] - 5, 9)
    expect(describeCurve(source)).toBe('Airfoil NACA 2412 · 120 mm chord')
  })

  it('regenerates an ellipse and a spline', () => {
    expect(curvePoints({ curve: 'ellipse', params: { radiusXMm: 20, radiusYMm: 8, points: 48 }, atMm: [0, 0] })).toHaveLength(48)
    expect(describeCurve({ curve: 'ellipse', params: { radiusXMm: 20, radiusYMm: 8, points: 48 }, atMm: [0, 0] })).toBe('Ellipse · 40 × 16 mm')
    const spline = { curve: 'spline', params: { controlPointsMm: [[0, 0], [20, 0], [20, 10], [0, 10]], samplesPerSegment: 6 }, atMm: [0, 0] }
    expect(curvePoints(spline)).toHaveLength(24)
    expect(describeCurve(spline)).toBe('Spline · 4 points')
  })

  it('refuses an unknown curve by name', () => {
    expect(() => curvePoints({ curve: 'spiral', params: {}, atMm: [0, 0] })).toThrow(/spiral/)
  })
})
