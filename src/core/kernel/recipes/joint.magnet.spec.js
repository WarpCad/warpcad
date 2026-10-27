// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { hardwareOf, partMetaOf, volumeOf } from '../group.js'
import { MAX_PLACEMENTS, planJoint, splitWarnings, splitWithJoint } from '../split.js'
import { MAGNET_SIZES, defaultMagnet, describeMagnet, magnetSizing } from './joint.magnet.js'

const { booleans, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/** A 300 × 120 × 10 mm plank along X, its minimum face at x = 0. */
function plank() {
  return primitives.cuboid({ size: [300, 120, 10], center: [150, 0, 5] })
}

/** A 300 × 20 × 20 mm bar along X — the io-007 bar. */
function bar() {
  return primitives.cuboid({ size: [300, 20, 20], center: [150, 0, 0] })
}

/** Area of the 32-gon every joint cylinder is built from. @param {number} radiusMm */
function ngonArea(radiusMm) {
  return 0.5 * 32 * radiusMm * radiusMm * Math.sin((2 * Math.PI) / 32)
}

/** @param {number} got @param {number} want */
function relativeError(got, want) {
  return Math.abs(got - want) / Math.abs(want)
}

/** @param {Geom3} a @param {Geom3} b */
function overlap(a, b) {
  return volumeOf(booleans.intersect(a, b))
}

describe('magnet sizes — disc magnets you buy (TODO/core-075 stage 3)', () => {
  it('the six common sizes, diameter × thickness', () => {
    expect(MAGNET_SIZES.map(({ diameterMm, thicknessMm }) => `${diameterMm}x${thicknessMm}`)).toEqual([
      '6x2',
      '6x3',
      '8x3',
      '10x2',
      '10x3',
      '12x3',
    ])
  })

  it('a pocket is d + 2 × clearance across and thickness + clearance deep, in each face', () => {
    const sizing = magnetSizing(6, 3, 0.2)
    expect(sizing.pocketRadiusMm).toBeCloseTo(3.2, 12)
    expect(sizing.pocketDepthMm).toBeCloseTo(3.2, 12)
  })

  it('is described the way the BOM, the sheet and assembly.txt say it', () => {
    expect(describeMagnet(6, 3).hardwareLabel).toBe('magnets 6 × 3 mm')
  })

  it('the default is the largest common size that leaves a wall on the face', () => {
    expect(defaultMagnet(10)).toEqual({ diameterMm: 6, thicknessMm: 3 })
    expect(defaultMagnet(20)).toEqual({ diameterMm: 12, thicknessMm: 3 })
    expect(defaultMagnet(4)).toEqual({ diameterMm: 6, thicknessMm: 2 })
  })
})

describe('splitWithJoint — magnets', () => {
  const params = { axis: 'x', offsetMm: 150, joint: 'magnets', clearanceMm: 0.2, names: ['Plank A', 'Plank B'] }

  it('pockets in both faces, no key part, and two magnets per pocket pair to buy, on piece A', () => {
    const result = splitWithJoint(plank(), params)
    expect(result.names).toEqual(['Plank A', 'Plank B'])
    const plan = planJoint(plank(), params)
    const hardware = partMetaOf(result, 'Plank A')?.hardware ?? []
    expect(hardware).toEqual([
      expect.objectContaining({ item: 'magnet', diameterMm: 6, thicknessMm: 3, count: 2 * plan.connectors.length, joins: ['Plank A', 'Plank B'], axis: 'x' }),
    ])
    expect(hardware[0].label).toBe('magnets 6 × 3 mm')
    expect(plan.connectors.length).toBe(2)
  })

  it('volume identity: A + B = uncut − pockets, the pockets measured independently', () => {
    const original = plank()
    const plan = planJoint(original, params)
    const result = splitWithJoint(original, params)
    const pockets = plan.connectors.reduce(
      (sum, connector) => sum + 2 * ngonArea(connector.sizeMm / 2 + 0.2) * (/** @type {number} */ (connector.thicknessMm) + 0.2),
      0
    )
    const [a, b] = ['Plank A', 'Plank B'].map((name) => volumeOf(result.parts[name]))
    expect(relativeError(a + b, volumeOf(original) - pockets)).toBeLessThan(1e-6)
  })

  it('no interference, and B comes straight off along the cut axis', () => {
    const result = splitWithJoint(bar(), { ...params, names: ['Bar A', 'Bar B'] })
    const [a, b] = [result.parts['Bar A'], result.parts['Bar B']]
    expect(overlap(a, b)).toBeLessThan(1e-6)
    for (let step = 0; step <= 5; step += 0.5) {
      expect(overlap(a, transforms.translate([step, 0, 0], b)), `B moved ${step} mm along +x`).toBeLessThan(1e-6)
    }
  })

  it('a size from jointOptions, common or custom; half a size or out of range is refused by name', () => {
    const custom = splitWithJoint(plank(), { ...params, jointOptions: { sizeMm: 5, thicknessMm: 2 } })
    expect(partMetaOf(custom, 'Plank A')?.hardware?.[0]).toMatchObject({ diameterMm: 5, thicknessMm: 2, label: 'magnets 5 × 2 mm' })
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { sizeMm: 6 } })).toThrow(
      /give jointOptions\.sizeMm and jointOptions\.thicknessMm together/
    )
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { sizeMm: 40, thicknessMm: 3 } })).toThrow(
      /jointOptions\.sizeMm must be 2 to 25 mm, got 40/
    )
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { sizeMm: 6, thicknessMm: 0.5 } })).toThrow(
      /jointOptions\.thicknessMm must be 1 to 10 mm, got 0.5/
    )
  })

  it('needs a floor wall in both pieces: a cut 3 mm from an end has no room for a magnet pocket', () => {
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 3, joint: 'magnets', clearanceMm: 0.2 })).toThrow(/no room for a magnet/)
  })

  it('zero clearance warns, and still builds', () => {
    expect(splitWarnings({ joint: 'magnets', clearanceMm: 0 }).join(' ')).toMatch(/Zero clearance/)
    expect(() => splitWithJoint(plank(), { ...params, clearanceMm: 0 })).not.toThrow()
  })

  it('hand-placed magnets: the bought count adds up across them, and one off the material is refused by name', () => {
    const result = splitWithJoint(plank(), {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
      placements: [
        { kind: 'magnet', uMm: -40, vMm: 5, sizeMm: 6, thicknessMm: 3 },
        { kind: 'magnet', uMm: 40, vMm: 5, sizeMm: 6, thicknessMm: 3 },
        { kind: 'dowel', uMm: 0, vMm: 5, sizeMm: 4 },
      ],
    })
    expect(hardwareOf(result)).toEqual([expect.objectContaining({ item: 'magnet', count: 4, label: 'magnets 6 × 3 mm' })])
    expect(() =>
      splitWithJoint(plank(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements: [{ kind: 'magnet', uMm: 0, vMm: 1 }] })
    ).toThrow(/placement 1 \(magnet at y = 0, z = 1 mm\): its pocket and 1.2 mm wall would break out of piece B/)
    expect(() =>
      splitWithJoint(plank(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements: [{ kind: 'magnet', uMm: 0, vMm: 5, sizeMm: 6 }] })
    ).toThrow(/placement 1 \(magnet\): give sizeMm and thicknessMm together/)
  })

  it('MAX_PLACEMENTS holds for magnets', () => {
    const many = Array.from({ length: MAX_PLACEMENTS + 1 }, (_, i) => ({ kind: 'magnet', uMm: -55 + i * 7, vMm: 5 }))
    expect(() => splitWithJoint(plank(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements: many })).toThrow(
      new RegExp(`at most ${MAX_PLACEMENTS} connectors, got ${MAX_PLACEMENTS + 1}`)
    )
  })
})
