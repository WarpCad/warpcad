// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — fixture outlines are plain literals; the module under test types them.
import { describe, expect, it } from 'vitest'

import {
  EXTRUSION_DEFAULTS,
  addProfile,
  addSlice,
  circleFromDrag,
  emptySketchParams,
  isClosed,
  methodProblem,
  polygonFromDrag,
  profileAtPoint,
  rectFromDrag,
  regionOf,
  removeProfile,
  removeSlice,
  selfIntersects,
  setRole,
  signedAreaMm2,
  sketchProblem,
  sliceProblem,
  toPointsMm,
  validateSketchParams,
  withMethod,
} from './profile.js'

/** @returns {import('./profile.js').Slice} */
function slice(profiles, zMm = 0) {
  return { id: 's1', zMm, profiles }
}

const circle = (id, role, radiusMm, centerMm = [0, 0]) => ({ id, kind: 'circle', role, centerMm, radiusMm })
const square = (id, role, sizeMm, centerMm = [0, 0]) => ({
  id,
  kind: 'rect',
  role,
  centerMm,
  widthMm: sizeMm,
  heightMm: sizeMm,
})

describe('toPointsMm', () => {
  it('builds a counter-clockwise ring for every closed kind', () => {
    for (const profile of [
      circle('c', 'solid', 10),
      square('r', 'solid', 20),
      { id: 'p', kind: 'polygon', role: 'solid', centerMm: [0, 0], radiusMm: 10, sides: 6, rotationDeg: 0 },
      { id: 'l', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [0, 10], [10, 10], [10, 0]] },
    ]) {
      const points = toPointsMm(profile, 32)
      expect(signedAreaMm2(points), profile.kind).toBeGreaterThan(0)
    }
  })

  it('makes a regular hexagon with a vertex on +X — primitive.hexagon expressed as a sketch', () => {
    const points = toPointsMm({ id: 'p', kind: 'polygon', role: 'solid', centerMm: [0, 0], radiusMm: 20, sides: 6, rotationDeg: 0 })
    expect(points).toHaveLength(6)
    expect(points[0][0]).toBeCloseTo(20, 9)
    expect(points[0][1]).toBeCloseTo(0, 9)
    // Area of a regular hexagon of circumradius r: (3√3/2)·r².
    expect(signedAreaMm2(points)).toBeCloseTo((3 * Math.sqrt(3) / 2) * 400, 6)
  })

  it('approximates a circle to within segmentation', () => {
    const points = toPointsMm(circle('c', 'solid', 20), 64)
    expect(points).toHaveLength(64)
    expect(signedAreaMm2(points)).toBeCloseTo(Math.PI * 400, -1)
  })
})

describe('isClosed — the degenerate cases', () => {
  it('a zero-radius circle is not a closed outline', () => {
    expect(isClosed(circle('c', 'solid', 0))).toBe(false)
  })

  it('a rectangle with no height is not closed', () => {
    expect(isClosed({ id: 'r', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 10, heightMm: 0 })).toBe(false)
  })

  it('an open polyline is not closed, even with plenty of points', () => {
    expect(
      isClosed({ id: 'l', kind: 'polyline', role: 'solid', closed: false, pointsMm: [[0, 0], [10, 0], [10, 10]] }),
    ).toBe(false)
  })

  it('a "closed" polyline of coincident points is not closed — it encloses nothing', () => {
    expect(
      isClosed({ id: 'l', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[5, 5], [5, 5], [5, 5], [5, 5]] }),
    ).toBe(false)
  })

  it('a polyline with a zero-length segment (a doubled point) still closes', () => {
    expect(
      isClosed({ id: 'l', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 0], [10, 0], [10, 10]] }),
    ).toBe(true)
  })

  it('a closed polyline whose points are all collinear is not closed', () => {
    expect(
      isClosed({ id: 'l', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [5, 0], [10, 0]] }),
    ).toBe(false)
  })
})

describe('selfIntersects', () => {
  it('flags a bow-tie', () => {
    const bowTie = { id: 'l', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 10], [10, 0], [0, 10]] }
    expect(selfIntersects(bowTie)).toBe(true)
  })

  it('does not flag a plain square, or a doubled point', () => {
    expect(
      selfIntersects({ id: 'l', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 0], [10, 0], [10, 10], [0, 10]] }),
    ).toBe(false)
  })

  it('never flags a circle, rectangle or polygon', () => {
    expect(selfIntersects(circle('c', 'solid', 5))).toBe(false)
    expect(selfIntersects(square('r', 'solid', 5))).toBe(false)
  })
})

describe('regionOf', () => {
  it('splits a slice into solid and hole rings, ignoring open and degenerate outlines', () => {
    const region = regionOf(
      slice([
        circle('outer', 'solid', 20),
        circle('inner', 'hole', 15),
        circle('dot', 'solid', 0),
        { id: 'open', kind: 'polyline', role: 'solid', closed: false, pointsMm: [[0, 0], [5, 5]] },
      ]),
      32,
    )
    expect(region.solids).toHaveLength(1)
    expect(region.holes).toHaveLength(1)
    expect(region.openCount).toBe(1)
  })

  it('orders steps largest first, so a solid inside a hole stays as an island', () => {
    // Nested solid-in-hole-in-solid: 40 mm square, a 30 mm hole, a 10 mm island.
    const region = regionOf(
      slice([square('island', 'solid', 10), square('outer', 'solid', 40), square('hole', 'hole', 30)]),
      32,
    )
    expect(region.steps.map((step) => step.id)).toEqual(['outer', 'hole', 'island'])
    expect(region.steps.map((step) => step.role)).toEqual(['solid', 'hole', 'solid'])
  })

  it('keeps a hole outside every solid without throwing — it simply removes nothing', () => {
    const region = regionOf(slice([square('a', 'solid', 10), square('b', 'hole', 4, [100, 100])]), 32)
    expect(region.holes).toHaveLength(1)
    expect(sliceProblem(slice([square('a', 'solid', 10), square('b', 'hole', 4, [100, 100])]))).toBeNull()
  })
})

describe('sliceProblem — what keeps Done disabled', () => {
  it('needs at least one closed solid outline', () => {
    expect(sliceProblem(slice([]))).toMatch(/closed solid outline/)
    expect(sliceProblem(slice([circle('h', 'hole', 5)]))).toMatch(/closed solid outline/)
  })

  it('refuses a hole equal to its solid — the region would be empty', () => {
    expect(sliceProblem(slice([square('a', 'solid', 10), square('b', 'hole', 10)]))).toMatch(/nothing left/)
  })

  it('refuses a self-intersecting outline', () => {
    const bowTie = { id: 'l', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 10], [10, 0], [0, 10]] }
    expect(sliceProblem(slice([bowTie]))).toMatch(/crosses itself/)
  })
})

describe('methodProblem — method gating by slice count', () => {
  // Clear of the revolve axis (x = 10..30), so every single-slice method accepts it.
  const one = { ...emptySketchParams(), slices: [slice([circle('a', 'solid', 10, [20, 0])])] }
  const three = {
    ...emptySketchParams(),
    slices: [
      { id: 's1', zMm: 0, profiles: [circle('a', 'solid', 10)] },
      { id: 's2', zMm: 100, profiles: [circle('b', 'solid', 8)] },
      { id: 's3', zMm: 200, profiles: [circle('c', 'solid', 6)] },
    ],
  }

  it('Loft needs two or more slices', () => {
    expect(methodProblem(one, 'loft')).toBe('Loft needs two or more slices')
    expect(methodProblem(three, 'loft')).toBeNull()
  })

  it('every other method uses exactly one slice', () => {
    for (const method of ['linear', 'revolve', 'helical', 'outline']) {
      expect(methodProblem(one, method), method).toBeNull()
      expect(methodProblem(three, method), method).toMatch(/uses one slice — remove the others or pick Loft/)
    }
  })

  it('Revolve and Helical refuse an outline crossing the axis (x < 0)', () => {
    const crossing = { ...one, slices: [slice([circle('a', 'solid', 10, [5, 20])])] }
    expect(methodProblem(crossing, 'revolve')).toMatch(/axis/)
    expect(methodProblem(crossing, 'helical')).toMatch(/axis/)
    const clear = { ...one, slices: [slice([square('a', 'solid', 10, [15, 5])])] }
    expect(methodProblem(clear, 'revolve')).toBeNull()
  })

  it('Loft refuses holes, and two slices at the same Z', () => {
    const withHole = {
      ...three,
      slices: [
        { id: 's1', zMm: 0, profiles: [circle('a', 'solid', 10), circle('h', 'hole', 3)] },
        { id: 's2', zMm: 100, profiles: [circle('b', 'solid', 8)] },
      ],
    }
    expect(methodProblem(withHole, 'loft')).toMatch(/one Solid outline and no Holes/)
    const sameZ = {
      ...three,
      slices: [
        { id: 's1', zMm: 50, profiles: [circle('a', 'solid', 10)] },
        { id: 's2', zMm: 50, profiles: [circle('b', 'solid', 8)] },
      ],
    }
    expect(methodProblem(sameZ, 'loft')).toMatch(/same Z/)
  })
})

describe('sketchProblem — the whole-sketch Done gate', () => {
  it('is null for a buildable tube', () => {
    const params = { ...emptySketchParams(), slices: [slice([circle('a', 'solid', 20), circle('b', 'hole', 15)])] }
    expect(sketchProblem(params)).toBeNull()
  })

  it('names the slice that has nothing to extrude', () => {
    expect(sketchProblem(emptySketchParams())).toMatch(/closed solid outline/)
  })
})

describe('draft edits — pure, never mutating', () => {
  it('adds, re-roles and removes a profile on one slice', () => {
    const start = emptySketchParams()
    const added = addProfile(start, 0, circle('p1', 'solid', 10))
    expect(start.slices[0].profiles).toHaveLength(0)
    expect(added.slices[0].profiles).toHaveLength(1)
    const holed = setRole(added, 0, 'p1', 'hole')
    expect(holed.slices[0].profiles[0].role).toBe('hole')
    expect(added.slices[0].profiles[0].role).toBe('solid')
    expect(removeProfile(holed, 0, 'p1').slices[0].profiles).toHaveLength(0)
  })

  it('adds a slice above the highest one, and refuses to delete the last', () => {
    const one = emptySketchParams()
    const two = addSlice(one, 's2')
    expect(two.slices).toHaveLength(2)
    expect(two.slices[1].zMm).toBeGreaterThan(two.slices[0].zMm)
    expect(removeSlice(two, 1).slices).toHaveLength(1)
    expect(() => removeSlice(one, 0)).toThrow(/at least one slice/)
  })

  it('switches method with that method’s defaults, keeping the slices', () => {
    const params = withMethod(emptySketchParams(), 'revolve')
    expect(params.extrusion).toEqual({ method: 'revolve', ...EXTRUSION_DEFAULTS.revolve })
  })
})

describe('drag → profile', () => {
  it('a circle from centre to rim', () => {
    expect(circleFromDrag('c', [1, 2], [4, 6])).toMatchObject({ kind: 'circle', centerMm: [1, 2], radiusMm: 5, role: 'solid' })
  })

  it('a rectangle from corner to corner, in either direction', () => {
    expect(rectFromDrag('r', [10, 10], [0, 4])).toMatchObject({ kind: 'rect', centerMm: [5, 7], widthMm: 10, heightMm: 6 })
  })

  it('a polygon from centre to a vertex keeps that vertex', () => {
    const polygon = polygonFromDrag('p', [0, 0], [0, 10], 6)
    const points = toPointsMm(polygon)
    expect(points[0][0]).toBeCloseTo(0, 9)
    expect(points[0][1]).toBeCloseTo(10, 9)
  })
})

describe('profileAtPoint — editor picking', () => {
  it('prefers the smallest closed outline containing the point, so the inner of two concentric circles wins', () => {
    const profiles = [circle('outer', 'solid', 20), circle('inner', 'hole', 15)]
    expect(profileAtPoint(profiles, [2, 1], 0.5)).toBe('inner')
    expect(profileAtPoint(profiles, [17, 0], 0.5)).toBe('outer')
    expect(profileAtPoint(profiles, [50, 50], 0.5)).toBeNull()
  })

  it('picks an open polyline by its stroke', () => {
    const open = { id: 'open', kind: 'polyline', role: 'solid', closed: false, pointsMm: [[0, 0], [10, 0]] }
    expect(profileAtPoint([open], [5, 0.2], 0.5)).toBe('open')
    expect(profileAtPoint([open], [5, 3], 0.5)).toBeNull()
  })
})

describe('validateSketchParams — untrusted input never throws past a reason', () => {
  it('accepts the documented record shape', () => {
    expect(
      validateSketchParams({
        center: [0, 0, 0],
        slices: [
          {
            id: 's1',
            zMm: 0,
            profiles: [
              { id: 'p1', kind: 'circle', role: 'solid', centerMm: [0, 0], radiusMm: 20 },
              { id: 'p2', kind: 'circle', role: 'hole', centerMm: [0, 0], radiusMm: 15 },
            ],
          },
        ],
        extrusion: { method: 'linear', heightMm: 30, twistDeg: 0, twistSteps: 1 },
      }),
    ).toBeNull()
  })

  it.each([
    ['no slices', { slices: [], extrusion: { method: 'linear', heightMm: 1 } }],
    ['an unknown kind', { slices: [{ id: 's', zMm: 0, profiles: [{ id: 'p', kind: 'spline', role: 'solid' }] }], extrusion: { method: 'linear', heightMm: 1 } }],
    ['an unknown role', { slices: [{ id: 's', zMm: 0, profiles: [{ ...circle('p', 'solid', 1), role: 'void' }] }], extrusion: { method: 'linear', heightMm: 1 } }],
    ['a NaN radius', { slices: [{ id: 's', zMm: 0, profiles: [circle('p', 'solid', Number.NaN)] }], extrusion: { method: 'linear', heightMm: 1 } }],
    ['an unknown method', { slices: [{ id: 's', zMm: 0, profiles: [] }], extrusion: { method: 'sweep' } }],
    ['a non-numeric height', { slices: [{ id: 's', zMm: 0, profiles: [] }], extrusion: { method: 'linear', heightMm: '30' } }],
    ['a string for slices', { slices: 'lots', extrusion: { method: 'linear', heightMm: 1 } }],
  ])('rejects %s with a reason', (_label, params) => {
    expect(validateSketchParams(params)).toEqual(expect.any(String))
  })
})
