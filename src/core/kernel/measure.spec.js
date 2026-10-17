// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'
import modeling from '@jscad/modeling'

import { add, addHole, boundsOf, combine, createGroup, volumeOf } from './group.js'
import { evaluate, evaluateOp } from './index.js'
import {
  analyseGeometry,
  cachedMeasurementOf,
  measureGeometry,
  minimumDistance,
  overlapVolume,
  rememberMeasurement,
  wallThickness,
} from './measure.js'

// Heavy kernel/library work: slow-but-correct under full-suite load, so a file-level budget (TODO/testing-004).
vi.setConfig({ testTimeout: 30_000 })

const { booleans, measurements, primitives, transforms } = modeling

/**
 * Measuring a body without paying for a kernel union on the main thread (`TODO/core-029`).
 *
 * `core-029` measured where the main thread's kernel time actually goes on every
 * mutation, and the largest single share was not the fold at all: it was
 * `stores/document.js`'s `summarizeBody` calling `boundsOf` and `volumeOf` on every body,
 * each of which ran `toGeom3` — a full `booleans.union` of every part of every composite.
 * 97-144 ms per mutation on `perf-001`'s 24-body scene, on a drag-place of a Cube.
 *
 * Two different answers, because the two measurements are different kinds of question:
 *
 * - **Bounds need no union.** The box around a union of solids is the box around their
 *   boxes. So `boundsOf` a hole-free group measures its visible parts and never unions
 *   them — asserted against the real union on real library composites, to 1e-9 mm.
 * - **Volume does.** Overlapping parts are counted once, which only a union knows. That
 *   one belongs in the evaluation worker; {@link measureGeometry} is the single function
 *   both the worker and the no-worker fallback call, so the two cannot drift.
 */

/** The union's box, the old way: combine, then measure. */
function unionBounds(/** @type {any} */ group) {
  const [min, max] = measurements.measureBoundingBox(combine(group))
  return [[...min], [...max]]
}

/** @param {number[][]} actual @param {number[][]} expected */
function expectBoxClose(actual, expected) {
  for (let corner = 0; corner < 2; corner += 1) {
    for (let axis = 0; axis < 3; axis += 1) {
      expect(actual[corner][axis]).toBeCloseTo(expected[corner][axis], 9)
    }
  }
}

describe('boundsOf a group, without a union (TODO/core-029)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['raspberrypi.bplus', {}],
    ['hardware.bolt', { spec: 'm10 hex', length: 30 }],
    ['kit.anchor', {}],
  ])('matches the union\'s box for a real %s', (op, params) => {
    const group = /** @type {any} */ (evaluateOp(op, params))
    expectBoxClose(boundsOf(group), unionBounds(group))
  })

  it('matches the union for overlapping, moved parts', () => {
    const cube = primitives.cuboid({ size: [10, 10, 10] })
    let group = createGroup('g')
    group = add(group, cube, 'a')
    group = add(group, transforms.translate([6, 3, -2], cube), 'b')
    group = add(group, transforms.rotateZ(0.4, transforms.translate([-4, 8, 1], cube)), 'c')
    expectBoxClose(boundsOf(group), unionBounds(group))
  })

  it('ignores hidden parts, exactly as combine() does', () => {
    const cube = primitives.cuboid({ size: [10, 10, 10] })
    let group = add(createGroup('g'), cube, 'shown')
    group = add(group, transforms.translate([100, 0, 0], cube), 'tap', { hidden: true })
    const [min, max] = boundsOf(group)
    expect(max[0]).toBeCloseTo(5, 9)
    expect(min[0]).toBeCloseTo(-5, 9)
  })

  it('never runs a boolean union for a hole-free composite', () => {
    const group = evaluateOp('raspberrypi.bplus', {})
    const union = vi.spyOn(booleans, 'union')
    boundsOf(group)
    expect(union).not.toHaveBeenCalled()
  })

  it('still subtracts holes — a hole can shrink the box, so that case keeps the exact union', () => {
    const block = primitives.cuboid({ size: [20, 10, 10], center: [0, 0, 0] })
    // Cuts the whole +X end off: the box must end at x=5, not x=10.
    const cutter = primitives.cuboid({ size: [10, 20, 20], center: [10, 0, 0] })
    const group = addHole(add(createGroup('g'), block, 'block'), cutter)
    const [, max] = boundsOf(group)
    expect(max[0]).toBeCloseTo(5, 6)
  })

  it('still refuses a group with nothing visible, with the same error combine() gives', () => {
    const group = add(createGroup('empty'), primitives.cuboid({ size: [1, 1, 1] }), 'hidden', { hidden: true })
    expect(() => boundsOf(group)).toThrow(/no pieces to combine/)
  })
})

describe('measureGeometry — the one measurement both sides of the worker call', () => {
  it('is boundsOf + volumeOf, for a bare solid and for a composite', () => {
    const cube = evaluateOp('primitive.cuboid', { size: [10, 20, 30] })
    expect(measureGeometry(cube)).toEqual({ bounds: boundsOf(cube), volumeMm3: volumeOf(cube) })
    const bolt = evaluateOp('hardware.bolt', { spec: 'm10 hex', length: 30 })
    expect(measureGeometry(bolt)).toEqual({ bounds: boundsOf(bolt), volumeMm3: volumeOf(bolt) })
  })

  it('counts overlapping parts once — the reason volume needs the union at all', () => {
    const { byId } = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
      { id: 'b', op: 'primitive.cuboid', params: { size: [10, 10, 10], center: [5, 0, 0] } },
      { id: 'g', op: 'group.assemble', target: 'a', operands: ['b'], params: { names: ['a', 'b'] } },
    ])
    expect(measureGeometry(/** @type {any} */ (byId.get('g'))).volumeMm3).toBeCloseTo(1500, 6)
  })
})

describe('the measurement cache', () => {
  it('is keyed by the geometry object, so an unchanged body is never re-measured', () => {
    const cube = evaluateOp('primitive.cuboid', { size: [2, 2, 2] })
    expect(cachedMeasurementOf(cube)).toBeUndefined()
    const measured = measureGeometry(cube)
    rememberMeasurement(cube, measured)
    expect(cachedMeasurementOf(cube)).toBe(measured)
    // A new object with identical content is a different body state — not a hit.
    expect(cachedMeasurementOf(evaluateOp('primitive.cuboid', { size: [2, 2, 2] }))).toBeUndefined()
  })
})

// --- TODO/ai-007: what the assistant measures ------------------------------------------
//
// Known solids with analytic answers, and the degenerate cases the CLAUDE.md numerical-code
// rule asks for. Faceted solids are inscribed in the analytic shape, so curved answers are
// held to a stated relative tolerance rather than to `toBeCloseTo`'s default digits.

describe('analyseGeometry — bounds, volume, area, centre of mass', () => {
  it('a 10 mm cube is 1000 mm³, 600 mm², centred where it was placed', () => {
    const cube = primitives.cuboid({ size: [10, 10, 10], center: [5, 5, 5] })
    const result = analyseGeometry(cube)
    expect(result.volumeMm3).toBeCloseTo(1000, 6)
    expect(result.surfaceAreaMm2).toBeCloseTo(600, 6)
    expect(result.centerOfMassMm[0]).toBeCloseTo(5, 6)
    expect(result.centerOfMassMm[1]).toBeCloseTo(5, 6)
    expect(result.centerOfMassMm[2]).toBeCloseTo(5, 6)
    expectBoxClose(result.bounds, [[0, 0, 0], [10, 10, 10]])
  })

  it('a group counts its overlapping parts once, through the same union measureGeometry uses', () => {
    const { byId } = evaluate([
      { id: 'a', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
      { id: 'b', op: 'primitive.cuboid', params: { size: [10, 10, 10], center: [5, 0, 0] } },
      { id: 'g', op: 'group.assemble', target: 'a', operands: ['b'], params: { names: ['a', 'b'] } },
    ])
    const result = analyseGeometry(/** @type {any} */ (byId.get('g')))
    expect(result.volumeMm3).toBeCloseTo(1500, 6)
    expect(result.centerOfMassMm[0]).toBeCloseTo(2.5, 6)
  })

  it('an empty solid measures zero, with no NaN anywhere', () => {
    const empty = modeling.geometries.geom3.create()
    const result = analyseGeometry(empty)
    expect(result.volumeMm3).toBe(0)
    expect(result.surfaceAreaMm2).toBe(0)
    expect(result.centerOfMassMm.every(Number.isFinite)).toBe(true)
  })
})

describe('wallThickness — the thinnest wall, by sampling', () => {
  it('a 2 mm-wall tube reports 2 mm', () => {
    const tube = booleans.subtract(
      primitives.cylinder({ radius: 10, height: 20, segments: 64 }),
      primitives.cylinder({ radius: 8, height: 20, segments: 64 })
    )
    const result = wallThickness(tube)
    expect(result.minMm).not.toBeNull()
    expect(/** @type {number} */ (result.minMm)).toBeCloseTo(2, 1)
  })

  it('a solid cube is as thick as it is wide', () => {
    const result = wallThickness(primitives.cuboid({ size: [10, 10, 10] }))
    expect(/** @type {number} */ (result.minMm)).toBeCloseTo(10, 6)
  })

  it('finds a 0.3 mm sliver on a 20 mm block, and says where it is', () => {
    const block = booleans.union(
      primitives.cuboid({ size: [20, 20, 20] }),
      // A fin standing out of the +X face, thin across Y.
      primitives.cuboid({ size: [10, 0.3, 10], center: [15, 0, 0] })
    )
    const result = wallThickness(block, { belowMm: 1.2 })
    expect(/** @type {number} */ (result.minMm)).toBeCloseTo(0.3, 3)
    expect(result.thin.length).toBeGreaterThan(0)
    const [x, y, z] = result.thin[0].atMm
    // On the fin, not somewhere on the block.
    expect(x).toBeGreaterThan(9.99)
    expect(x).toBeLessThan(20.01)
    expect(Math.abs(y)).toBeLessThanOrEqual(0.1501)
    expect(Math.abs(z)).toBeLessThanOrEqual(5.0001)
  })

  it('an empty solid has no wall to measure', () => {
    expect(wallThickness(modeling.geometries.geom3.create())).toMatchObject({ minMm: null, samples: 0, thin: [] })
  })
})

describe('minimumDistance and overlapVolume — clearance between two bodies', () => {
  it('two 10 mm cubes 3 mm apart are 3 mm apart, closest points on the facing faces', () => {
    const a = primitives.cuboid({ size: [10, 10, 10] })
    const b = primitives.cuboid({ size: [10, 10, 10], center: [13, 0, 0] })
    const result = minimumDistance(a, b)
    expect(result.distanceMm).toBeCloseTo(3, 9)
    expect(result.onAMm[0]).toBeCloseTo(5, 9)
    expect(result.onBMm[0]).toBeCloseTo(8, 9)
    expect(overlapVolume(a, b)).toBe(0)
  })

  it('two overlapping spheres give the analytic lens volume', () => {
    const r = 10
    const d = 10
    const a = primitives.sphere({ radius: r, segments: 96 })
    const b = primitives.sphere({ radius: r, segments: 96, center: [d, 0, 0] })
    // A lens of two equal spheres: V = π(4r + d)(2r − d)² / 12.
    const analytic = (Math.PI * (4 * r + d) * (2 * r - d) ** 2) / 12
    const measured = overlapVolume(a, b)
    expect(measured / analytic).toBeCloseTo(1, 1)
    expect(Math.abs(measured - analytic) / analytic).toBeLessThan(0.02)
  })

  it('touching faces are 0 mm apart and do not overlap', () => {
    const a = primitives.cuboid({ size: [10, 10, 10] })
    const b = primitives.cuboid({ size: [10, 10, 10], center: [10, 0, 0] })
    expect(minimumDistance(a, b).distanceMm).toBeCloseTo(0, 9)
    expect(overlapVolume(a, b)).toBeCloseTo(0, 6)
  })

  it('an empty operand has no distance', () => {
    expect(minimumDistance(modeling.geometries.geom3.create(), primitives.cuboid({ size: [1, 1, 1] })).distanceMm).toBeNull()
  })
})
