// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { mmToCssPx, seededRng, scatterTaps, tally } from './tap-scatter.mjs'

describe('tap-scatter', () => {
  it('converts millimetres to CSS pixels at 96 dpi', () => {
    expect(mmToCssPx(25.4)).toBeCloseTo(96, 9)
    expect(mmToCssPx(3.5)).toBeCloseTo(13.228, 3)
  })

  it('is deterministic for a seed and different across seeds', () => {
    const a = seededRng(7)
    const b = seededRng(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(seededRng(7)()).not.toBe(seededRng(8)())
  })

  it('scatters n taps with the requested mean and sigma', () => {
    const pts = scatterTaps({ x: 100, y: 200 }, 13, 4000, seededRng(1))
    expect(pts).toHaveLength(4000)
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length
    const sx = Math.sqrt(pts.reduce((s, p) => s + (p.x - mx) ** 2, 0) / pts.length)
    expect(mx).toBeCloseTo(100, 0)
    expect(my).toBeCloseTo(200, 0)
    expect(sx).toBeGreaterThan(12)
    expect(sx).toBeLessThan(14)
  })

  it('zero sigma puts every tap on the aim point; zero taps gives an empty list', () => {
    expect(scatterTaps({ x: 5, y: 6 }, 0, 3, seededRng(1))).toEqual([{ x: 5, y: 6 }, { x: 5, y: 6 }, { x: 5, y: 6 }])
    expect(scatterTaps({ x: 5, y: 6 }, 13, 0, seededRng(1))).toEqual([])
  })

  it('tallies hits and what the misses landed on', () => {
    const r = tally(['a', 'a', 'b', null, 'a', 'b'], 'a')
    expect(r).toEqual({ n: 6, hits: 3, hitRate: 0.5, misses: { b: 2, '(nothing)': 1 } })
  })

  it('tallies an empty run without dividing by zero', () => {
    expect(tally([], 'a')).toEqual({ n: 0, hits: 0, hitRate: 0, misses: {} })
  })
})
