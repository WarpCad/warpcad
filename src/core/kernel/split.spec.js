// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, isGroup, volumeOf } from './group.js'
import { getEntry, acceptsOperandCount } from './registry.js'
import { DEFAULT_JOINT_CLEARANCE_MM, JOINT_TYPES, planJoint, splitWarnings, splitWithJoint } from './split.js'
import { makeWatertight, openEdgesOf } from './watertight.js'
import { DEFAULT_BUILD_VOLUME, buildVolumeVector, fitVerdict } from '../buildVolume.js'

const { booleans, geometries, primitives } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/**
 * A 300 mm bar along X, 20 × 20 mm, its minimum face at x = 0 — the "longer than the bed"
 * case `TODO/io-007` opens with, in its simplest shape.
 *
 * @returns {Geom3}
 */
function bar() {
  return primitives.cuboid({ size: [300, 20, 20], center: [150, 0, 0] })
}

/**
 * The part of `solid` beyond `cutMm` on `axisIndex` — how much of a pin actually sticks out
 * of the face (or of a socket actually reaches into piece B), measured with the kernel rather
 * than predicted from the joint's own maths. Both are built half a millimetre past the face
 * on the other side, so the booleans never meet a coplanar face; only this part counts.
 *
 * @param {Geom3} solid
 * @param {number} axisIndex
 * @param {number} cutMm
 */
function volumeBeyond(solid, axisIndex, cutMm) {
  /** @type {[number, number, number]} */
  const size = [1000, 1000, 1000]
  /** @type {[number, number, number]} */
  const centre = [0, 0, 0]
  centre[axisIndex] = cutMm + 500
  return volumeOf(booleans.intersect(solid, primitives.cuboid({ size, center: centre })))
}

/** @param {Geom3} solid */
function openEdges(solid) {
  return openEdgesOf(makeWatertight(solid)).openEdges
}

describe('modify.splitWithJoint — the registry entry', () => {
  it('is a single-object operation: Split is enabled at exactly one selected body', () => {
    const entry = getEntry('modify.splitWithJoint')
    expect(entry.kind).toBe('native')
    expect(entry.operandCount).toBe(1)
    // Multi-split needs an already-split body's parts, not their union.
    expect(entry.rawOperands).toBe(true)
    expect(entry.subPartOperands).toBeUndefined()
    expect(acceptsOperandCount('modify.splitWithJoint', 1)).toBe(true)
    expect(acceptsOperandCount('modify.splitWithJoint', 0)).toBe(false)
    expect(acceptsOperandCount('modify.splitWithJoint', 2)).toBe(false)
  })

  it('returns a group of two named parts, so each piece stays addressable', () => {
    const entry = getEntry('modify.splitWithJoint')
    if (!entry.build) throw new Error('native op expected')
    const result = /** @type {any} */ (
      entry.build({
        params: { axis: 'x', offsetMm: 150, joint: 'pins', clearanceMm: 0.2, names: ['Wing A', 'Wing B'] },
        // A whole-group op: the fold hands it the operand un-combined, as `{ value }`.
        inputs: /** @type {any} */ ([{ value: bar() }]),
      })
    )
    expect(isGroup(result)).toBe(true)
    expect(result.names).toEqual(['Wing A', 'Wing B'])
  })

  it('offers the three joint types the Split sheet lists', () => {
    expect(JOINT_TYPES).toEqual(['pins', 'tongue', 'none'])
    expect(DEFAULT_JOINT_CLEARANCE_MM).toBeCloseTo(0.2, 9)
  })
})

describe('splitWithJoint — a 300 mm bar split at 150 mm', () => {
  // Tolerance: every volume below is measured by the kernel off real faceted solids, so the
  // only error is the boolean's own float noise — a relative 1e-6 is generous for that.
  const RELATIVE_TOLERANCE = 1e-6

  it('the pieces sum to the original, plus the pins that stick out, minus the sockets', () => {
    const original = bar()
    const params = { axis: 'x', offsetMm: 150, joint: 'pins', clearanceMm: 0.2 }
    const result = splitWithJoint(original, params)
    const plan = planJoint(original, params)
    expect(plan.kind).toBe('pins')
    expect(plan.pins.length).toBeGreaterThanOrEqual(1)
    expect(plan.sockets.length).toBe(plan.pins.length)

    const added = plan.pins.reduce((sum, pin) => sum + volumeBeyond(pin, 0, 150), 0)
    const removed = plan.sockets.reduce((sum, socket) => sum + volumeBeyond(socket, 0, 150), 0)
    expect(added).toBeGreaterThan(0)
    // A socket is wider and deeper than its pin by the clearance, so more comes out than goes in.
    expect(removed).toBeGreaterThan(added)

    const [a, b] = result.names.map((name) => volumeOf(result.parts[name]))
    const expected = volumeOf(original) + added - removed
    expect(Math.abs(a + b - expected) / expected).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('both pieces fit the default 220 × 220 × 250 mm build volume, and each is watertight', () => {
    const result = splitWithJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'pins', clearanceMm: 0.2 })
    for (const name of result.names) {
      const [min, max] = boundsOf(result.parts[name])
      const size = /** @type {[number, number, number]} */ ([0, 1, 2].map((i) => max[i] - min[i]))
      expect(fitVerdict(size, DEFAULT_BUILD_VOLUME).verdict).toBe('fits')
      expect(openEdges(result.parts[name])).toBe(0)
    }
    // The uncut bar does not: 300 mm is longer than any edge of the volume.
    expect(fitVerdict([300, 20, 20], DEFAULT_BUILD_VOLUME).verdict).toBe('too-large')
    expect(buildVolumeVector(DEFAULT_BUILD_VOLUME)).toEqual([220, 220, 250])
  })

  it('no joint is a plain cut — the two halves sum to the original exactly', () => {
    const original = bar()
    const result = splitWithJoint(original, { axis: 'x', offsetMm: 150, joint: 'none' })
    const total = result.names.reduce((sum, name) => sum + volumeOf(result.parts[name]), 0)
    expect(total).toBeCloseTo(volumeOf(original), 3)
    const [min, max] = boundsOf(result.parts[result.names[0]])
    expect(max[0] - min[0]).toBeCloseTo(150, 6)
  })

  it('tongue and groove puts one rib on A and a matching, wider groove in B', () => {
    const original = bar()
    const params = { axis: 'x', offsetMm: 150, joint: 'tongue', clearanceMm: 0.2 }
    const plan = planJoint(original, params)
    expect(plan.kind).toBe('tongue')
    expect(plan.pins.length).toBe(1)
    expect(plan.sockets.length).toBe(1)
    const result = splitWithJoint(original, params)
    const added = volumeBeyond(plan.pins[0], 0, 150)
    const removed = volumeBeyond(plan.sockets[0], 0, 150)
    const total = result.names.reduce((sum, name) => sum + volumeOf(result.parts[name]), 0)
    const expected = volumeOf(original) + added - removed
    expect(Math.abs(total - expected) / expected).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('a thin section too narrow for a pin is refused by name, pointing at tongue and groove', () => {
    // 3 mm thick — a pin and its wall cannot fit, the trailing-edge case the spec names.
    const thin = primitives.cuboid({ size: [300, 60, 3], center: [150, 0, 0] })
    expect(() => splitWithJoint(thin, { axis: 'x', offsetMm: 150, joint: 'pins', clearanceMm: 0.2 })).toThrow(
      /no room for a pin.*[Tt]ongue and groove/
    )
  })
})

describe('splitWithJoint — refusals and warnings', () => {
  it('a split plane outside the body is refused, naming the plane and the body’s extent', () => {
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 400, joint: 'pins' })).toThrow(
      /modify\.splitWithJoint: the cut plane at x = 400 mm is outside the body \(x 0 to 300 mm\)/
    )
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 0, joint: 'pins' })).toThrow(/outside the body/)
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: -5, joint: 'none' })).toThrow(/outside the body/)
  })

  it('an unknown axis or joint type is refused by name', () => {
    expect(() => splitWithJoint(bar(), { axis: 'w', offsetMm: 150 })).toThrow(/axis must be one of x, y, z/)
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'dovetail' })).toThrow(
      /joint must be one of pins, tongue, none/
    )
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 150, clearanceMm: -0.1 })).toThrow(/clearanceMm/)
  })

  it('a plane through an existing hole places its pins in the material, not in the hole', () => {
    // An 8 mm hole along Y straight through the bar at x = 150: the cut face is two 6 mm
    // strips either side of the hole. A pin dropped at the face centre would sit in thin air,
    // and the volume identity below is what catches it — a socket cut into a hole removes
    // less than its own volume.
    const hole = primitives.cuboid({ size: [8, 40, 8], center: [150, 0, 0] })
    const holed = booleans.subtract(bar(), hole)
    const params = { axis: 'x', offsetMm: 150, joint: 'pins', clearanceMm: 0.2 }
    const plan = planJoint(holed, params)
    expect(plan.pins.length).toBeGreaterThanOrEqual(1)
    const result = splitWithJoint(holed, params)
    const added = plan.pins.reduce((sum, pin) => sum + volumeBeyond(pin, 0, 150), 0)
    const removed = plan.sockets.reduce((sum, socket) => sum + volumeBeyond(socket, 0, 150), 0)
    const total = result.names.reduce((sum, name) => sum + volumeOf(result.parts[name]), 0)
    const expected = volumeOf(holed) + added - removed
    expect(Math.abs(total - expected) / expected).toBeLessThan(1e-6)
    for (const name of result.names) expect(openEdges(result.parts[name])).toBe(0)
  })

  it('zero clearance is allowed but warns — a print never matches its model exactly', () => {
    expect(splitWarnings({ joint: 'pins', clearanceMm: 0 })).toEqual([
      expect.stringMatching(/[Zz]ero clearance/),
    ])
    expect(splitWarnings({ joint: 'pins', clearanceMm: 0.2 })).toEqual([])
    // No joint, no fit to worry about.
    expect(splitWarnings({ joint: 'none', clearanceMm: 0 })).toEqual([])
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'pins', clearanceMm: 0 })).not.toThrow()
  })

  it('a non-watertight input is refused, not silently split into pieces that will not print', () => {
    // A 10 mm cube with its top face missing: an open box.
    const closed = geometries.geom3.toPolygons(primitives.cuboid({ size: [10, 10, 10] }))
    const open = geometries.geom3.create(
      closed.filter((polygon) => !polygon.vertices.every((vertex) => Math.abs(vertex[2] - 5) < 1e-9))
    )
    expect(openEdges(open)).toBeGreaterThan(0)
    expect(() => splitWithJoint(open, { axis: 'x', offsetMm: 5, joint: 'none' })).toThrow(/not watertight/)
  })

  it('part names must be two distinct names with no commas (a comma would split a pieces address)', () => {
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'none', names: ['A', 'A'] })).toThrow(
      /names/
    )
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'none', names: ['A,1', 'B'] })).toThrow(
      /names/
    )
  })
})

describe('splitWithJoint — multi-split is N applications', () => {
  it('splitting an already-split body cuts only the part the plane crosses, and keeps the rest', () => {
    const first = splitWithJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'none', names: ['Bar A', 'Bar B'] })
    // 225 mm from the minimum face crosses only "Bar B" (150 → 300).
    const second = splitWithJoint(first, { axis: 'x', offsetMm: 225, joint: 'none', names: ['Bar B', 'Bar C'] })
    expect(second.names).toEqual(['Bar A', 'Bar B', 'Bar C'])
    const lengths = second.names.map((name) => {
      const [min, max] = boundsOf(second.parts[name])
      return max[0] - min[0]
    })
    expect(lengths[0]).toBeCloseTo(150, 6)
    expect(lengths[1]).toBeCloseTo(75, 6)
    expect(lengths[2]).toBeCloseTo(75, 6)
  })

  it('a plane that crosses two parts at once is refused by name rather than guessed at', () => {
    const across = splitWithJoint(
      primitives.cuboid({ size: [300, 20, 20], center: [150, 0, 0] }),
      { axis: 'y', offsetMm: 10, joint: 'none', names: ['Front', 'Back'] }
    )
    expect(() => splitWithJoint(across, { axis: 'x', offsetMm: 100, joint: 'none' })).toThrow(
      /crosses 2 parts.*Front.*Back/
    )
  })
})
