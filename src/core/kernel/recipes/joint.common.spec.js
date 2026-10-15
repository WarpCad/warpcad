// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, volumeOf } from '../group.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { footprintsOverlap, outlinePrismAlong, prismAlong } from './joint.common.js'

const { booleans, primitives } = modeling

/** @typedef {import('./joint.common.js').Footprint} Footprint */

describe('outlinePrismAlong — a prism of any convex outline on a cut face', () => {
  // A 4 × 2 rectangle as an outline, counter-clockwise in (u, v).
  /** @type {[number, number][]} */
  const rectangle = [
    [-2, -1],
    [2, -1],
    [2, 1],
    [-2, 1],
  ]

  it.each([0, 1, 2])('on axis %i: the same solid prismAlong builds as a box, outward-facing', (axisIndex) => {
    const outline = outlinePrismAlong(axisIndex, 10, 13, 5, -7, rectangle)
    const box = prismAlong(axisIndex, 10, 13, 5, -7, { uSizeMm: 4, vSizeMm: 2 })
    // A wrongly wound outline measures a negative volume.
    expect(volumeOf(outline)).toBeCloseTo(4 * 2 * 3, 9)
    expect(boundsOf(outline)).toEqual(boundsOf(box))
    expect(openEdgesOf(makeWatertight(outline)).openEdges).toBe(0)
    // And it behaves under a boolean: the box minus the outline prism is empty.
    expect(volumeOf(booleans.subtract(box, outline))).toBeCloseTo(0, 6)
  })

  it('a trapezoid keeps its exact area — no faceting', () => {
    /** @type {[number, number][]} */
    const trapezoid = [
      [-6, -2],
      [6, -1],
      [6, 1],
      [-6, 2],
    ]
    expect(volumeOf(outlinePrismAlong(2, 0, 5, 0, 0, trapezoid))).toBeCloseTo(((4 + 2) / 2) * 12 * 5, 9)
  })

  it('refuses an outline with fewer than three corners, or a zero-length prism', () => {
    expect(() =>
      outlinePrismAlong(2, 0, 5, 0, 0, [
        [0, 0],
        [1, 0],
      ])
    ).toThrow(/at least three/)
    expect(() => outlinePrismAlong(2, 5, 5, 0, 0, rectangle)).toThrow(/length/)
  })
})

describe('footprintsOverlap — whether two connectors’ walls would meet on the face', () => {
  /** @returns {Footprint} @param {number} u @param {number} v @param {number} r */
  const circle = (u, v, r) => ({ shape: 'circle', uMm: u, vMm: v, radiusMm: r })
  /** @returns {Footprint} @param {number} u @param {number} v @param {number} hu @param {number} hv */
  const rect = (u, v, hu, hv) => ({ shape: 'rect', uMm: u, vMm: v, halfUMm: hu, halfVMm: hv })

  it('two circles: touching is apart (the search’s own pairs touch), any closer overlaps', () => {
    expect(footprintsOverlap(circle(0, 0, 2), circle(5, 0, 3))).toBe(false)
    expect(footprintsOverlap(circle(0, 0, 2), circle(4.999, 0, 3))).toBe(true)
    // Coincident centres overlap, even at zero radius — two connectors in one place.
    expect(footprintsOverlap(circle(1, 1, 0), circle(1, 1, 0))).toBe(true)
  })

  it('a circle and a rectangle: measured to the rectangle’s nearest point, corners included', () => {
    expect(footprintsOverlap(circle(5, 0, 2), rect(0, 0, 3, 1))).toBe(false)
    expect(footprintsOverlap(circle(4.9, 0, 2), rect(0, 0, 3, 1))).toBe(true)
    // Diagonal off the corner (3, 1): distance √2 ≈ 1.414.
    expect(footprintsOverlap(circle(4, 2, 1.4), rect(0, 0, 3, 1))).toBe(false)
    expect(footprintsOverlap(circle(4, 2, 1.42), rect(0, 0, 3, 1))).toBe(true)
    // Symmetric in its arguments.
    expect(footprintsOverlap(rect(0, 0, 3, 1), circle(4, 2, 1.42))).toBe(true)
  })

  it('two rectangles: edge-to-edge is apart, any overlap on both axes meets', () => {
    expect(footprintsOverlap(rect(0, 0, 1, 1), rect(2, 0, 1, 1))).toBe(false)
    expect(footprintsOverlap(rect(0, 0, 1, 1), rect(1.99, 0.5, 1, 1))).toBe(true)
    expect(footprintsOverlap(rect(0, 0, 1, 1), rect(1, 3, 1, 1))).toBe(false)
  })
})

// The prisms these build are checked with the kernel elsewhere; this is only the cylinder
// used above, kept honest against its own primitive.
describe('prismAlong is unchanged', () => {
  it('a cylinder on Z is the 32-segment primitive, moved', () => {
    const prism = prismAlong(2, 0, 4, 0, 0, { radiusMm: 1 })
    const primitive = primitives.cylinder({ radius: 1, height: 4, segments: 32, center: [0, 0, 2] })
    expect(volumeOf(prism)).toBeCloseTo(volumeOf(primitive), 9)
  })
})
