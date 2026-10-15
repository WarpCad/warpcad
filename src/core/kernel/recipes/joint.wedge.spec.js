// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { WEDGE_MAX_WIDTH_MM, WEDGE_MIN_WIDTH_MM, offsetTrapezoid, trapezoidOutline, wedgeSizing } from './joint.wedge.js'

/** Shoelace area of an outline. @param {[number, number][]} outline */
function areaOf(outline) {
  let twice = 0
  for (let i = 0; i < outline.length; i += 1) {
    const [x0, y0] = outline[i]
    const [x1, y1] = outline[(i + 1) % outline.length]
    twice += x0 * y1 - x1 * y0
  }
  return twice / 2
}

describe('wedgeSizing — a tapered key sized from its wide end', () => {
  it('is 3× its width long, half as wide at the narrow end, and stands 1.5× its width proud (2–8 mm)', () => {
    expect(wedgeSizing(4)).toEqual({ wideMm: 4, narrowMm: 2, lengthMm: 12, heightMm: 6 })
    expect(wedgeSizing(1)).toMatchObject({ heightMm: 2 })
    expect(wedgeSizing(10)).toMatchObject({ heightMm: 8 })
    expect(WEDGE_MIN_WIDTH_MM).toBe(1)
    expect(WEDGE_MAX_WIDTH_MM).toBe(10)
  })
})

describe('offsetTrapezoid — a trapezoid grown by a gap square to every side', () => {
  it('a zero offset is the trapezoid itself', () => {
    const trapezoid = { wideMm: 4, narrowMm: 2, lengthMm: 12 }
    const same = offsetTrapezoid(trapezoid, 0)
    expect(same.wideMm).toBeCloseTo(4, 12)
    expect(same.narrowMm).toBeCloseTo(2, 12)
    expect(same.lengthMm).toBeCloseTo(12, 12)
  })

  it('parallel sides (a rectangle) grow by exactly twice the offset', () => {
    const grown = offsetTrapezoid({ wideMm: 4, narrowMm: 4, lengthMm: 10 }, 0.5)
    expect(grown.wideMm).toBeCloseTo(5, 12)
    expect(grown.narrowMm).toBeCloseTo(5, 12)
    expect(grown.lengthMm).toBeCloseTo(11, 12)
  })

  it('slanted sides move out square to themselves: each end widens by 2c·√(1 + slope²) ∓ the taper over c', () => {
    const c = 0.2
    const slope = (1 - 2) / 12 // half-width change per mm along
    const grown = offsetTrapezoid({ wideMm: 4, narrowMm: 2, lengthMm: 12 }, c)
    const k = Math.hypot(1, slope)
    expect(grown.lengthMm).toBeCloseTo(12.4, 12)
    expect(grown.wideMm).toBeCloseTo(2 * (2 - slope * c + c * k), 12)
    expect(grown.narrowMm).toBeCloseTo(2 * (1 + slope * c + c * k), 12)
    // The slope is unchanged: the offset is the same shape, further out.
    expect((grown.narrowMm - grown.wideMm) / 2 / grown.lengthMm).toBeCloseTo(slope, 12)
  })

  it('refuses a negative offset', () => {
    expect(() => offsetTrapezoid({ wideMm: 4, narrowMm: 2, lengthMm: 12 }, -0.1)).toThrow(/offset/)
  })
})

describe('trapezoidOutline — the key’s outline on the face, along its long direction', () => {
  it('runs along u or v, wide end first, counter-clockwise, with the trapezoid’s area', () => {
    const trapezoid = { wideMm: 4, narrowMm: 2, lengthMm: 12 }
    const alongU = trapezoidOutline(trapezoid, true)
    const alongV = trapezoidOutline(trapezoid, false)
    expect(areaOf(alongU)).toBeCloseTo(36, 12)
    expect(areaOf(alongV)).toBeCloseTo(36, 12)
    // Wide end at the low end of the long direction.
    expect(Math.min(...alongU.map(([u]) => u))).toBeCloseTo(-6, 12)
    expect(Math.max(...alongU.filter(([u]) => u < 0).map(([, v]) => v))).toBeCloseTo(2, 12)
    expect(Math.max(...alongV.filter(([, v]) => v > 0).map(([u]) => u))).toBeCloseTo(1, 12)
  })
})
