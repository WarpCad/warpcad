// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The 4 × 4 placement an imported part's mesh carries (`TODO/io-024`): JSCAD `mat4` order, which
 * 3MF's twelve row-vector numbers map onto directly, and the one check every copy of it passes.
 */
import { describe, expect, it } from 'vitest'

import {
  IDENTITY_MATRIX,
  linearDeterminant,
  matrixFromThreeMf,
  matrixProblem,
  multiplyMatrices,
  transformPoint,
  withTranslation,
} from './meshMatrix.js'

describe('matrixFromThreeMf', () => {
  it('maps the twelve numbers onto mat4 order, translation last', () => {
    expect(matrixFromThreeMf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0, 10, 11, 12, 1])
  })

  it('a FreeCAD quarter turn with 2.22045e-16 terms moves a point as 3MF says', () => {
    const m = matrixFromThreeMf([2.22045e-16, -1, 0, 1, 2.22045e-16, 0, 0, 0, 1, 4.445, 11.43, 1.57])
    // 3MF: [x y z 1] × M, so x' = y + 4.445, y' = -x + 11.43, z' = z + 1.57.
    const [x, y, z] = transformPoint(m, 10, 20, 5)
    expect(x).toBeCloseTo(24.445, 9)
    expect(y).toBeCloseTo(1.43, 9)
    expect(z).toBeCloseTo(6.57, 9)
  })
})

describe('multiplyMatrices', () => {
  it('applies the inner matrix first, then the outer', () => {
    const turn = matrixFromThreeMf([0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0]) // x' = -y, y' = x
    const move = withTranslation(IDENTITY_MATRIX, 10, 0, 0)
    const both = multiplyMatrices(move, turn)
    const [x, y] = transformPoint(both, 1, 0, 0)
    expect(x).toBeCloseTo(10, 12)
    expect(y).toBeCloseTo(1, 12)
  })
})

describe('linearDeterminant', () => {
  it('is negative for a mirror and 1 for a turn', () => {
    expect(linearDeterminant(matrixFromThreeMf([-1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))).toBeCloseTo(-1, 12)
    expect(linearDeterminant(matrixFromThreeMf([0, 1, 0, -1, 0, 0, 0, 0, 1, 5, 5, 5]))).toBeCloseTo(1, 12)
  })
})

describe('matrixProblem', () => {
  it('accepts the identity and a quarter turn', () => {
    expect(matrixProblem(IDENTITY_MATRIX)).toBeNull()
    expect(matrixProblem(matrixFromThreeMf([2.22045e-16, -1, 0, 1, 2.22045e-16, 0, 0, 0, 1, 4.445, 11.43, 1.57]))).toBeNull()
  })

  it('refuses the wrong length, a non-number, a non-finite entry', () => {
    expect(matrixProblem([1, 0, 0])).toMatch(/16 numbers/)
    expect(matrixProblem('1 0 0')).toMatch(/16 numbers/)
    const nan = [...IDENTITY_MATRIX]
    nan[5] = Number.NaN
    expect(matrixProblem(nan)).toMatch(/finite/)
    const text = /** @type {any[]} */ ([...IDENTITY_MATRIX])
    text[0] = '1'
    expect(matrixProblem(text)).toMatch(/finite/)
  })

  it('refuses a projective (non-affine) matrix', () => {
    const projective = [...IDENTITY_MATRIX]
    projective[3] = 0.5
    expect(matrixProblem(projective)).toMatch(/affine/)
    const w = [...IDENTITY_MATRIX]
    w[15] = 2
    expect(matrixProblem(w)).toMatch(/affine/)
  })

  it('refuses a singular matrix (it would flatten the part)', () => {
    expect(matrixProblem(matrixFromThreeMf([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]))).toMatch(/flat|singular/)
  })

  it('refuses an unbounded scale or translation', () => {
    expect(matrixProblem(matrixFromThreeMf([1e7, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]))).toMatch(/scale/)
    expect(matrixProblem(withTranslation(IDENTITY_MATRIX, 1e8, 0, 0))).toMatch(/beyond/)
  })
})
