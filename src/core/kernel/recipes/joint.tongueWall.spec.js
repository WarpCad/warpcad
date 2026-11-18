// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, volumeOf } from '../group.js'
import { planJoint, splitWithJoint } from '../split.js'
import { wallTongueMinWallMm } from './joint.tongueWall.js'

const { booleans, primitives } = modeling

/**
 * A hollow box, 60 × 40 × 30 mm outside, open nowhere: the enclosure shell of
 * `create-enclosure` with the given wall.
 *
 * @param {number} wall
 */
function hollowBox(wall) {
  const outer = primitives.cuboid({ size: [60, 40, 30], center: [0, 0, 15] })
  const inner = primitives.cuboid({ size: [60 - 2 * wall, 40 - 2 * wall, 30 - 2 * wall], center: [0, 0, 15] })
  return booleans.subtract(outer, inner)
}

const params = (extra = {}) => ({ axis: 'z', offsetMm: 20, joint: 'tongue', clearanceMm: 0.2, ...extra })

describe('tongue joint on a hollow box (TODO/ai-048)', () => {
  it('a 2 mm wall (the enclosure default) gets a tongue inside the wall', () => {
    const plan = planJoint(hollowBox(2), params())
    expect(plan.kind).toBe('tongue')
    expect(plan.pins.length).toBeGreaterThanOrEqual(2)
    expect(plan.sockets.length).toBe(plan.pins.length)
    for (const connector of plan.connectors) {
      // Sized from the wall: tongue and each side wall a third of (wall − 2 × clearance).
      expect(connector.sizeMm).toBeCloseTo((2 - 0.4) / 3, 1)
    }
  })

  it('a 4 mm wall still splits, and the halves rejoin to the original plus tongues minus grooves', () => {
    const original = hollowBox(4)
    const plan = planJoint(original, params())
    expect(plan.kind).toBe('tongue')
    const result = splitWithJoint(original, params())
    /** @param {import('@jscad/modeling').geometries.geom3.Geom3} solid */
    const beyond = (solid) =>
      volumeOf(booleans.intersect(solid, primitives.cuboid({ size: [1000, 1000, 1000], center: [0, 0, 520] })))
    const added = plan.pins.reduce((sum, pin) => sum + beyond(pin), 0)
    const removed = plan.sockets.reduce((sum, socket) => sum + beyond(socket), 0)
    const total = result.names.reduce((sum, name) => sum + volumeOf(result.parts[name]), 0)
    const expected = volumeOf(original) + added - removed
    expect(Math.abs(total - expected) / expected).toBeLessThan(1e-3)
  })

  it('the tongue stands in the wall: it fits in the footprint of the shell', () => {
    const result = splitWithJoint(hollowBox(2), params())
    const [min, max] = boundsOf(result.parts[result.names[0]])
    expect(min[0]).toBeCloseTo(-30, 3)
    expect(max[0]).toBeCloseTo(30, 3)
    expect(min[1]).toBeCloseTo(-20, 3)
    expect(max[1]).toBeCloseTo(20, 3)
  })

  it('a wall exactly at the minimum splits; just under it is refused naming the minimum wall', () => {
    const minimum = wallTongueMinWallMm(0.2)
    expect(minimum).toBeCloseTo(1.9, 6)
    expect(planJoint(hollowBox(minimum + 0.01), params()).kind).toBe('tongue')
    expect(() => splitWithJoint(hollowBox(1.5), params())).toThrow(/no room for a tongue and groove.*wall of at least 1\.9 mm/)
  })

  it('a solid block still takes the ordinary tongue, unchanged by the wall path', () => {
    const block = primitives.cuboid({ size: [60, 40, 30], center: [0, 0, 15] })
    const plan = planJoint(block, params())
    expect(plan.kind).toBe('tongue')
    expect(plan.pins.length).toBe(1)
  })
})
