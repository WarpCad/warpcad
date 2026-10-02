// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest'
import modeling from '@jscad/modeling'

import { add, addHole, boundsOf, combine, createGroup, volumeOf } from './group.js'
import { evaluate, evaluateOp } from './index.js'
import { cachedMeasurementOf, measureGeometry, rememberMeasurement } from './measure.js'

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
