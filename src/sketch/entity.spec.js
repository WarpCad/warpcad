import { describe, expect, it } from 'vitest'

import { isDegenerate, lengthOf } from './entity.js'

describe('lengthOf', () => {
  it('measures a 3-4-5 triangle’s hypotenuse', () => {
    expect(lengthOf([0, 0], [30, 40])).toBeCloseTo(50, 9)
  })

  it('reports a zero-length segment as 0 without throwing', () => {
    expect(lengthOf([7, -2], [7, -2])).toBe(0)
  })
})

describe('isDegenerate', () => {
  it('is true within the tolerance and false beyond it', () => {
    expect(isDegenerate([0, 0], [0.05, 0], 0.1)).toBe(true)
    expect(isDegenerate([0, 0], [0.5, 0], 0.1)).toBe(false)
  })
})
