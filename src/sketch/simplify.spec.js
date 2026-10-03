// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — fixture rings are plain literals.
import { describe, expect, it } from 'vitest'

import { simplifyPoints } from './simplify.js'
import { signedAreaMm2 } from './profile.js'

/**
 * Ramer–Douglas–Peucker with a tolerance in millimetres (`TODO/sketch-002`): the profile
 * panel's **Simplify**, and later auto-trace's thinning pass (`TODO/sketch-004`).
 */
describe('simplifyPoints — Ramer–Douglas–Peucker in mm', () => {
  it('collapses collinear points on an open chain, keeping both ends', () => {
    const chain = [[0, 0], [10, 0], [20, 0], [30, 0], [30, 10]]
    expect(simplifyPoints(chain, 0.01, false)).toEqual([[0, 0], [30, 0], [30, 10]])
  })

  it('collapses collinear points on a closed ring — a square with mid-edge points is four corners', () => {
    const ring = [[0, 0], [5, 0], [10, 0], [10, 5], [10, 10], [5, 10], [0, 10], [0, 5]]
    const out = simplifyPoints(ring, 0.01, true)
    expect(out).toHaveLength(4)
    for (const corner of [[0, 0], [10, 0], [10, 10], [0, 10]]) {
      expect(out).toContainEqual(corner)
    }
    expect(Math.abs(signedAreaMm2(out))).toBeCloseTo(100, 9)
  })

  it('tolerance 0 is the identity — even exactly collinear points stay', () => {
    const ring = [[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]]
    const out = simplifyPoints(ring, 0, true)
    expect(out).toEqual(ring)
    // A copy, never the caller's array.
    expect(out).not.toBe(ring)
  })

  it('a closed ring stays closed: no repeated closing point appears, and wobble under the tolerance goes', () => {
    // A 20 mm square whose edges wobble by ±0.2 mm.
    const ring = []
    for (let i = 0; i < 20; i += 1) ring.push([i, i % 2 === 0 ? 0 : 0.2])
    for (let i = 0; i < 20; i += 1) ring.push([20 + (i % 2 === 0 ? 0 : 0.2), i])
    for (let i = 0; i < 20; i += 1) ring.push([20 - i, 20 + (i % 2 === 0 ? 0 : 0.2)])
    for (let i = 0; i < 20; i += 1) ring.push([i % 2 === 0 ? 0 : 0.2, 20 - i])
    const out = simplifyPoints(ring, 0.5, true)
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(out.length).toBeLessThanOrEqual(6)
    const first = out[0]
    const last = out[out.length - 1]
    expect(first[0] === last[0] && first[1] === last[1]).toBe(false)
    expect(Math.abs(signedAreaMm2(out))).toBeCloseTo(400, -1)
  })

  it('keeps a corner that sticks out further than the tolerance', () => {
    const chain = [[0, 0], [10, 2], [20, 0]]
    expect(simplifyPoints(chain, 1, false)).toEqual(chain)
    expect(simplifyPoints(chain, 3, false)).toEqual([[0, 0], [20, 0]])
  })

  it('rejects a result with fewer than 3 points on a closed ring rather than returning it', () => {
    // A very thin triangle: at 5 mm tolerance it would collapse to its long edge.
    const sliver = [[0, 0], [100, 0], [50, 1]]
    expect(simplifyPoints(sliver, 5, true)).toBeNull()
  })

  it('degenerate input: coincident points and an empty list', () => {
    expect(simplifyPoints([], 1, false)).toBeNull()
    expect(simplifyPoints([[1, 1], [1, 1], [1, 1]], 1, true)).toBeNull()
  })

  it('rejects a negative or non-finite tolerance', () => {
    expect(() => simplifyPoints([[0, 0], [1, 0], [1, 1]], -1, true)).toThrow(/tolerance/)
    expect(() => simplifyPoints([[0, 0], [1, 0], [1, 1]], Number.NaN, true)).toThrow(/tolerance/)
  })

  it('thins a 400-point traced circle to something hand-editable', () => {
    const ring = Array.from({ length: 400 }, (_, i) => {
      const a = (i / 400) * Math.PI * 2
      return [50 * Math.cos(a), 50 * Math.sin(a)]
    })
    const out = simplifyPoints(ring, 0.5, true)
    expect(out.length).toBeLessThan(40)
    expect(out.length).toBeGreaterThan(8)
    // Area within 2 % of the true circle.
    expect(Math.abs(Math.abs(signedAreaMm2(out)) - Math.PI * 2500) / (Math.PI * 2500)).toBeLessThan(0.02)
  })
})
