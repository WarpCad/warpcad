// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect } from 'vitest'
import { nearestCapView } from './orientationHit.js'

const caps = [
  { view: 'left', x: 0.5, y: 0, depth: 0.2 },
  { view: 'front', x: 0.5, y: 0.2, depth: 0.6 },
  { view: 'top', x: 0, y: -0.5, depth: 0.5 },
]

describe('nearestCapView', () => {
  it('picks the cap whose centre is closest to the tap', () => {
    // dial 100 px, cap centres at (50 + x*34, 50 + y*34) → left (67,50), front (67,56.8)
    expect(nearestCapView(caps, 100, { x: 67, y: 51 })).toBe('left')
    expect(nearestCapView(caps, 100, { x: 67, y: 56 })).toBe('front')
  })

  it('resolves a tap in an overlap to the nearer centre, not the topmost box', () => {
    // 3 px nearer to left's centre even though front is drawn on top
    expect(nearestCapView(caps, 100, { x: 67, y: 52 })).toBe('left')
  })

  it('breaks an exact tie toward the cap nearer the viewer', () => {
    const tied = [
      { view: 'top', x: 0, y: 0, depth: 0.9 },
      { view: 'bottom', x: 0, y: 0, depth: -0.9 },
    ]
    expect(nearestCapView(tied, 100, { x: 50, y: 50 })).toBe('top')
  })

  it('returns null for a tap outside the dial or with no caps', () => {
    expect(nearestCapView(caps, 100, { x: -5, y: 50 })).toBeNull()
    expect(nearestCapView([], 100, { x: 50, y: 50 })).toBeNull()
  })
})
