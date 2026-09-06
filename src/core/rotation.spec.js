import modeling from '@jscad/modeling'
import { describe, expect, it } from 'vitest'

import { composeDeg, degFromMatrix, matrixFromDeg, relativeDeg } from './rotation.js'

/**
 * Euler composition arithmetic (`TODO/core-004`).
 *
 * Everything here is checked against `@jscad/modeling`'s **own** matrix builder
 * rather than against this module's other functions, so a sign or an axis-order
 * mistake cannot agree with itself and pass. `src/core/kernel/registry.js`'s
 * `transform.rotate` calls `transforms.rotate`, which calls
 * `mat4.fromTaitBryanRotation(out, yaw, pitch, roll)` — so that call *is* the
 * definition of what a `rotationDeg` triple means, and it is what this spec
 * compares to.
 */

const { maths } = modeling
const { mat4, vec3 } = maths

/** @param {number} degrees */
const rad = (degrees) => (degrees * Math.PI) / 180

/**
 * The kernel's own matrix for a degree triple: `R = Rz(z)·Ry(y)·Rx(x)`.
 *
 * Returns a column-major `mat4`.
 *
 * @param {readonly number[]} degrees
 */
function kernelMatrix(degrees) {
  return mat4.fromTaitBryanRotation(mat4.create(), rad(degrees[2]), rad(degrees[1]), rad(degrees[0]))
}

/** @type {[number, number, number][]} */
const UNIT_AXES = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

/**
 * Where a rotation sends the three unit axes — an orientation stated as nine
 * numbers with no convention left implicit, which is what makes two rotations
 * comparable without trusting either one's angle triple.
 *
 * @param {readonly number[]} degrees
 * @returns {number[][]}
 */
function axesUnder(degrees) {
  const matrix = kernelMatrix(degrees)
  return UNIT_AXES.map((axis) => Array.from(vec3.transform(vec3.create(), axis, matrix)))
}

/**
 * Where a *history* of world-frame deltas sends the three unit axes, by applying
 * each delta in turn. Deliberately sequential rather than one matrix product:
 * "apply this, then that" has no multiply-order convention to get wrong, so this
 * is the ground truth the composed triple has to match.
 *
 * @param {readonly (readonly number[])[]} deltas
 * @returns {number[][]}
 */
function axesAfterHistory(deltas) {
  return UNIT_AXES.map((axis) => {
    /** @type {[number, number, number]} */
    let point = [axis[0], axis[1], axis[2]]
    for (const delta of deltas) {
      const turned = vec3.transform(vec3.create(), point, kernelMatrix(delta))
      point = [turned[0], turned[1], turned[2]]
    }
    return point
  })
}

/**
 * @param {number[][]} actual
 * @param {number[][]} expected
 */
function expectSameAxes(actual, expected) {
  for (let axis = 0; axis < 3; axis += 1) {
    for (let component = 0; component < 3; component += 1) {
      expect(actual[axis][component]).toBeCloseTo(expected[axis][component], 9)
    }
  }
}

describe('matrixFromDeg / degFromMatrix', () => {
  it('builds exactly the matrix the kernel builds, for a fully mixed triple', () => {
    // 20 × 40 × 60-style asymmetry in the angles too, so a transposed or
    // reordered matrix cannot coincide with the right one.
    const degrees = [30, 40, 50]
    const mine = matrixFromDeg(degrees)
    const theirs = kernelMatrix(degrees)
    // Mine is row-major 3×3, theirs is column-major 4×4: `mine[row * 3 + col]`
    // is `theirs[col * 4 + row]`.
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        expect(mine[row * 3 + col]).toBeCloseTo(theirs[col * 4 + row], 12)
      }
    }
  })

  it('round-trips an arbitrary triple back to the same orientation', () => {
    for (const degrees of [
      [0, 0, 0],
      [30, 0, 0],
      [0, 45, 0],
      [0, 0, 90],
      [30, 40, 50],
      [-12.5, 71.25, -160],
      [179, -89, 179],
    ]) {
      const roundTripped = degFromMatrix(matrixFromDeg(degrees))
      expectSameAxes(axesUnder(roundTripped), axesUnder(degrees))
    }
  })

  it('returns a faithful orientation at gimbal lock, where the triple is not unique', () => {
    // Pitch at exactly ±90° collapses roll and yaw onto the same axis, so the
    // decomposition has to pick one of infinitely many equivalent triples. Any
    // of them is correct as long as it names the same orientation — which is the
    // whole reason this module compares orientations and never angle triples.
    for (const degrees of [
      [40, 90, 25],
      [40, -90, 25],
      [0, 90, 0],
    ]) {
      const decomposed = degFromMatrix(matrixFromDeg(degrees))
      expect(decomposed.every(Number.isFinite)).toBe(true)
      expectSameAxes(axesUnder(decomposed), axesUnder(degrees))
    }
  })
})

describe('composeDeg — the composition the geometry actually performs', () => {
  it('composes an out-of-order history rather than adding it', () => {
    // The finding's sharpest case. Turn 90° about Z, then 90° about X: the solid
    // is at `Rx(90)·Rz(90)`, which is *not* `R(90, 0, 90)` — the sum the old code
    // carried, and which denotes `Rz(90)·Rx(90)` instead.
    const composed = composeDeg([90, 0, 0], [0, 0, 90])
    expectSameAxes(axesUnder(composed), axesAfterHistory([[0, 0, 90], [90, 0, 0]]))

    // ...and it is genuinely a different orientation from the sum, so this test
    // is not passing by coincidence.
    expect(() => expectSameAxes(axesUnder(composed), axesUnder([90, 0, 90]))).toThrow()
  })

  it('composes the reverse order to the other, equally different, orientation', () => {
    const composed = composeDeg([0, 0, 90], [90, 0, 0])
    expectSameAxes(axesUnder(composed), axesAfterHistory([[90, 0, 0], [0, 0, 90]]))
    expect(() =>
      expectSameAxes(axesUnder(composed), axesUnder(composeDeg([90, 0, 0], [0, 0, 90]))),
    ).toThrow()
  })

  it('leaves a single-axis history at exactly the values it has always had', () => {
    // The overwhelmingly common path — one ring drag, one typed field — where
    // adding was already right. It must stay bit-exact, not merely close: these
    // numbers are shown in the Inspector, and 44.99999999999999 is a bug report.
    expect(composeDeg([0, 0, 30], [0, 0, 0])).toEqual([0, 0, 30])
    expect(composeDeg([0, 0, 15], [0, 0, 30])).toEqual([0, 0, 45])
    expect(composeDeg([30, 0, 0], [60, 0, 0])).toEqual([90, 0, 0])
    expect(composeDeg([0, 25, 0], [0, 20, 0])).toEqual([0, 45, 0])
  })

  it('leaves an X-then-Y-then-Z history at exactly the values it has always had', () => {
    // `Rz(z)·Ry(y)·Rx(x)` is literally the composition in that order, so the sum
    // was already exactly right here too.
    let carried = composeDeg([30, 0, 0], [0, 0, 0])
    carried = composeDeg([0, 40, 0], carried)
    carried = composeDeg([0, 0, 50], carried)
    expect(carried).toEqual([30, 40, 50])
  })

  it('is unmoved by a zero delta and unmoved from a zero start', () => {
    expect(composeDeg([0, 0, 0], [30, 40, 50])).toEqual([30, 40, 50])
    expect(composeDeg([30, 40, 50], [0, 0, 0])).toEqual([30, 40, 50])
  })

  it('rejects a non-finite angle rather than carrying NaN into a record', () => {
    expect(() => composeDeg([Number.NaN, 0, 0], [0, 0, 0])).toThrow(/finite/)
    expect(() => composeDeg([0, 0, 0], [0, Number.POSITIVE_INFINITY, 0])).toThrow(/finite/)
  })
})

describe('relativeDeg — the delta that lands on a typed absolute rotation', () => {
  it('produces a delta which, composed onto the current rotation, is the target', () => {
    // What a typed Inspector field means. Under composition this can no longer be
    // `target − current`: the delta has to satisfy `R(d)·R(current) = R(target)`.
    /** @type {[number[], number[]][]} */
    const cases = [
      [[0, 0, 50], [0, 0, 20]],
      [[30, 40, 50], [90, 0, 90]],
      [[0, 0, 0], [45, 45, 0]],
      [[12, -34, 56], [-78, 9, 10]],
    ]
    for (const [target, current] of cases) {
      const delta = relativeDeg(target, current)
      expectSameAxes(axesUnder(composeDeg(delta, current)), axesUnder(target))
    }
  })

  it('stays the plain difference on the single-axis path', () => {
    expect(relativeDeg([0, 0, 50], [0, 0, 20])).toEqual([0, 0, 30])
    expect(relativeDeg([45, 0, 0], [0, 0, 0])).toEqual([45, 0, 0])
  })

  it('is a no-op delta when the target is already the current rotation', () => {
    expect(relativeDeg([30, 40, 50], [30, 40, 50])).toEqual([0, 0, 0])
  })
})
