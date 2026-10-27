// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { partMetaOf, volumeOf } from '../group.js'
import { planJoint, splitWithJoint } from '../split.js'
import {
  DOWEL_CHAMFER_MM,
  DOWEL_MAX_DIAMETER_MM,
  DOWEL_MIN_DIAMETER_MM,
  FILAMENT_DIAMETER_MM,
  dowelSizing,
} from './joint.dowel.js'

const { booleans, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/** A 300 × 120 × 10 mm plank along X, its minimum face at x = 0 — the docs' example plank. */
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

/** @param {any} group @returns {string[]} */
function keyNames(group) {
  return group.names.filter((/** @type {string} */ name) => partMetaOf(group, name)?.role === 'key')
}

describe('dowelSizing — a loose dowel and its two sockets', () => {
  it('socket 1.5× the diameter deep in each piece, the dowel 2 × clearance shorter than both, 0.5 mm chamfers', () => {
    const sizing = dowelSizing(4, 0.2)
    expect(sizing.diameterMm).toBeCloseTo(4, 12)
    expect(sizing.socketRadiusMm).toBeCloseTo(2.2, 12)
    expect(sizing.socketDepthMm).toBeCloseTo(6, 12)
    expect(sizing.lengthMm).toBeCloseTo(2 * 6 - 2 * 0.2, 12)
    // The D-flat: a fifth of the diameter deep.
    expect(sizing.flatDepthMm).toBeCloseTo(0.8, 12)
    expect(DOWEL_CHAMFER_MM).toBe(0.5)
    expect(DOWEL_MIN_DIAMETER_MM).toBe(2)
    expect(DOWEL_MAX_DIAMETER_MM).toBe(10)
  })

  it('a bought steel pin is a standard size no longer than the printed dowel would be', () => {
    const steel = dowelSizing(4, 0.2, 'steel')
    expect(steel.diameterMm).toBe(4)
    expect(steel.stockLengthMm).toBe(10)
    expect(steel.stockLengthMm).toBeLessThanOrEqual(steel.lengthMm)
  })

  it('filament is always 1.75 mm, whatever diameter is asked for', () => {
    const filament = dowelSizing(6, 0.2, 'filament')
    expect(FILAMENT_DIAMETER_MM).toBe(1.75)
    expect(filament.diameterMm).toBeCloseTo(1.75, 12)
    expect(filament.socketRadiusMm).toBeCloseTo(0.875 + 0.2, 12)
    expect(filament.stockLengthMm).toBeGreaterThan(0)
    expect(filament.stockLengthMm).toBeLessThanOrEqual(filament.lengthMm)
  })
})

describe('splitWithJoint — printed loose dowels (TODO/core-075 stage 1)', () => {
  const params = { axis: 'x', offsetMm: 150, joint: 'dowel', clearanceMm: 0.2, names: ['Plank A', 'Plank B'] }

  it('makes key parts after A and B, named after the body, with a sockets in both pieces', () => {
    const result = splitWithJoint(plank(), params)
    expect(result.names.slice(0, 2)).toEqual(['Plank A', 'Plank B'])
    const keys = keyNames(result)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    expect(keys).toEqual(keys.map((_, index) => `Plank key ${index + 1}`))
    for (const name of keys) {
      const meta = /** @type {any} */ (partMetaOf(result, name))
      expect(meta).toMatchObject({ role: 'key', kind: 'dowel', joins: ['Plank A', 'Plank B'], axis: 'x' })
      expect(Math.hypot(...meta.bedNormal)).toBeCloseTo(1, 9)
      // The bed face is along the dowel's side, never an end cap: square to the cut axis.
      expect(meta.bedNormal[0]).toBeCloseTo(0, 9)
    }
  })

  it('volume identity: A + B + keys = uncut − (sockets − keys), the sockets measured independently', () => {
    const original = plank()
    const plan = planJoint(original, params)
    const result = splitWithJoint(original, params)
    const keys = keyNames(result)
    expect(plan.connectors.length).toBe(keys.length)
    const sockets = plan.connectors.reduce((sum, connector) => {
      const sizing = dowelSizing(connector.sizeMm, 0.2)
      return sum + 2 * ngonArea(sizing.socketRadiusMm) * sizing.socketDepthMm
    }, 0)
    const keyVolume = keys.reduce((sum, name) => sum + volumeOf(result.parts[name]), 0)
    expect(keyVolume).toBeGreaterThan(0)
    const [a, b] = ['Plank A', 'Plank B'].map((name) => volumeOf(result.parts[name]))
    const gaps = sockets - keyVolume
    expect(gaps).toBeGreaterThan(0)
    expect(relativeError(a + b + keyVolume, volumeOf(original) - gaps)).toBeLessThan(1e-6)
  })

  it('no interference when assembled at 0.2 mm: A∩B, key∩A and key∩B are all empty', () => {
    const result = splitWithJoint(bar(), { ...params, names: ['Bar A', 'Bar B'] })
    const [a, b] = [result.parts['Bar A'], result.parts['Bar B']]
    expect(overlap(a, b)).toBeLessThan(1e-6)
    for (const name of keyNames(result)) {
      expect(overlap(result.parts[name], a), `${name} ∩ A`).toBeLessThan(1e-6)
      expect(overlap(result.parts[name], b), `${name} ∩ B`).toBeLessThan(1e-6)
    }
  })

  it('goes together along the cut axis: B slides on over the dowels in A with nothing in the way', () => {
    const result = splitWithJoint(bar(), { ...params, names: ['Bar A', 'Bar B'] })
    const keys = keyNames(result)
    const seated = booleans.union(result.parts['Bar A'], ...keys.map((name) => result.parts[name]))
    const depth = dowelSizing(/** @type {any} */ (partMetaOf(result, keys[0])).sizeMm, 0.2).socketDepthMm
    for (let step = 0; step <= depth + 1; step += 0.5) {
      const moved = transforms.translate([step, 0, 0], result.parts['Bar B'])
      expect(overlap(seated, moved), `B moved ${step} mm along +x`).toBeLessThan(1e-6)
    }
  })

  it('needs a wall in BOTH pieces: a cut 3 mm from the end takes pins, but no dowel fits', () => {
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 3, joint: 'pins', clearanceMm: 0.2 })).not.toThrow()
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 3, joint: 'dowel', clearanceMm: 0.2 })).toThrow(
      /no room for a dowel/
    )
  })

  it('a hand-placed dowel whose socket would break out of piece A is refused by name', () => {
    expect(() =>
      splitWithJoint(bar(), { axis: 'x', offsetMm: 3, clearanceMm: 0.2, placements: [{ kind: 'dowel', uMm: 0, vMm: 0, sizeMm: 3 }] })
    ).toThrow(/placement 1 \(dowel at y = 0, z = 0 mm\).*break out of piece A/)
  })

  it('a hand-placed dowel and a searched one, by placements', () => {
    const result = splitWithJoint(plank(), {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
      placements: [{ kind: 'dowel', uMm: -40, vMm: 5, sizeMm: 4 }, { kind: 'pins' }],
    })
    expect(keyNames(result)).toEqual(['Plank key 1'])
    expect(partMetaOf(result, 'Plank key 1')?.sizeMm).toBeCloseTo(4, 9)
  })
})

describe('splitWithJoint — bought dowels: steel pins or 1.75 mm filament (no key part)', () => {
  it('steel: sockets in both pieces, no key part, and the pins to buy on piece A', () => {
    const original = bar()
    const result = splitWithJoint(original, {
      axis: 'x',
      offsetMm: 150,
      joint: 'dowel',
      jointOptions: { stock: 'steel' },
      clearanceMm: 0.2,
      names: ['Bar A', 'Bar B'],
    })
    expect(result.names).toEqual(['Bar A', 'Bar B'])
    const hardware = partMetaOf(result, 'Bar A')?.hardware ?? []
    expect(hardware.length).toBe(1)
    expect(hardware[0]).toMatchObject({ item: 'dowel', stock: 'steel', joins: ['Bar A', 'Bar B'], axis: 'x' })
    expect(hardware[0].count).toBeGreaterThanOrEqual(1)
    expect([2, 3, 4, 5, 6, 8, 10]).toContain(hardware[0].diameterMm)
    const [a, b] = ['Bar A', 'Bar B'].map((name) => volumeOf(result.parts[name]))
    expect(a).toBeLessThan(150 * 20 * 20)
    expect(b).toBeLessThan(150 * 20 * 20)
  })

  it('filament: 1.75 mm sockets, and a length of filament to cut', () => {
    const result = splitWithJoint(bar(), {
      axis: 'x',
      offsetMm: 150,
      joint: 'dowel',
      jointOptions: { stock: 'filament' },
      clearanceMm: 0.2,
      names: ['Bar A', 'Bar B'],
    })
    const [entry] = partMetaOf(result, 'Bar A')?.hardware ?? []
    expect(entry).toMatchObject({ item: 'dowel', stock: 'filament' })
    expect(entry.diameterMm).toBeCloseTo(1.75, 9)
  })
})
