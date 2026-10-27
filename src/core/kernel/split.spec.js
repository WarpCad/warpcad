// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, isGroup, mapGeometry, partMetaOf, removePart, translate, volumeOf } from './group.js'
import { packGeometry, unpackGeometry } from './transport.js'
import { exportBodies } from '../export.js'
import { createDocument } from '../document.js'
import { parseProject, serializeProject } from '../project.js'
import golden from './__fixtures__/split-golden.json'
import { getEntry, acceptsOperandCount } from './registry.js'
import {
  DEFAULT_JOINT_CLEARANCE_MM,
  JOINT_TYPES,
  MAX_PLACEMENTS,
  PLACEMENT_KINDS,
  planJoint,
  previewSplitFace,
  splitWarnings,
  splitWithJoint,
} from './split.js'
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

  it('offers the joint types a record may name (TODO/core-075 stage 1 adds the loose dowel)', () => {
    expect(JOINT_TYPES).toEqual(['pins', 'tongue', 'dowel', 'butterfly', 'tenon', 'magnets', 'none'])
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
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'glue-gun' })).toThrow(
      /joint must be one of pins, tongue, dowel, butterfly, tenon, magnets, none, got "glue-gun"/
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

// ## Hand-placed connectors (TODO/core-059)
//
// Every expected volume below is computed from the connector's own sizing rule at the size
// asked for, not read back off the plan: a pin of diameter d stands clamp(2d, 4, 12) mm proud,
// a tongue of width w stands clamp(2.5w, 3, 10) mm, a wedge of wide end w is 3w long with a
// w/2 narrow end and stands clamp(1.5w, 2, 8) mm, a screw boss for an Ms screw is Ø(bore + 4)
// standing clamp(1.5s, 3, 8) mm with a 2.5s-deep bore in B. Every cylinder is the fixed
// 32-segment polygon `joint.common.js` builds, so its exact area is the polygon's, not πr².

/** Exact area of the 32-gon every joint cylinder is built from. @param {number} radiusMm */
function ngonArea(radiusMm) {
  return 0.5 * 32 * radiusMm * radiusMm * Math.sin((2 * Math.PI) / 32)
}

/** A 300 × 40 × 20 mm slab along X — room on its cut face for more than one connector. */
function slab() {
  return primitives.cuboid({ size: [300, 40, 20], center: [150, 0, 0] })
}

/** @param {number} got @param {number} want */
function relativeError(got, want) {
  return Math.abs(got - want) / Math.abs(want)
}

describe('splitWithJoint — hand-placed connectors (TODO/core-059)', () => {
  const RELATIVE_TOLERANCE = 1e-6
  // The bar's halves before any joint: 150 × 20 × 20 mm each.
  const HALF = 150 * 20 * 20

  /** @param {Record<string, any>[]} placements @param {number} [clearanceMm] */
  const split = (placements, clearanceMm = 0.2) =>
    splitWithJoint(bar(), { axis: 'x', offsetMm: 150, clearanceMm, placements })

  /** @param {any} result */
  const pieceVolumes = (result) => result.names.map((/** @type {string} */ name) => volumeOf(result.parts[name]))

  it('lists the connector kinds a placement may ask for (TODO/core-075 adds the dowel)', () => {
    expect(PLACEMENT_KINDS).toEqual(['pins', 'tongue', 'wedge', 'screwBoss', 'dowel', 'butterfly', 'tenon', 'magnet'])
    // Placements are a separate input from the joint list.
    expect(JOINT_TYPES).toEqual(['pins', 'tongue', 'dowel', 'butterfly', 'tenon', 'magnets', 'none'])
  })

  it('a pin placed by hand is sized by the same rule as a searched one: Ø5 stands 10 mm proud', () => {
    const [a, b] = pieceVolumes(split([{ kind: 'pins', uMm: 0, vMm: 0, sizeMm: 5 }]))
    expect(relativeError(a, HALF + ngonArea(2.5) * 10)).toBeLessThan(RELATIVE_TOLERANCE)
    // The socket is wider by the clearance per side and deeper by it.
    expect(relativeError(b, HALF - ngonArea(2.7) * 10.2)).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('placing pins exactly where the search put them gives the search’s own pieces', () => {
    const auto = planJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'pins', clearanceMm: 0.2 })
    expect(auto.connectors.length).toBe(auto.pins.length)
    expect(auto.connectors.every((c) => c.source === 'search' && c.kind === 'pins')).toBe(true)
    const placements = auto.connectors.map((c) => ({ kind: 'pins', uMm: c.uMm, vMm: c.vMm, sizeMm: c.sizeMm }))
    const searched = pieceVolumes(splitWithJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'pins', clearanceMm: 0.2 }))
    const placed = pieceVolumes(split(placements))
    expect(relativeError(placed[0], searched[0])).toBeLessThan(RELATIVE_TOLERANCE)
    expect(relativeError(placed[1], searched[1])).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('a tongue placed by hand: 4 mm wide, 16 mm long, standing 10 mm proud along the face', () => {
    const [a, b] = pieceVolumes(split([{ kind: 'tongue', uMm: 0, vMm: 0, sizeMm: 4, lengthMm: 16 }]))
    expect(relativeError(a, HALF + 16 * 4 * 10)).toBeLessThan(RELATIVE_TOLERANCE)
    expect(relativeError(b, HALF - 16.4 * 4.4 * 10.2)).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('placing a tongue exactly where the search put it gives the search’s own pieces', () => {
    const params = { axis: 'x', offsetMm: 150, joint: 'tongue', clearanceMm: 0.2 }
    const auto = planJoint(bar(), params)
    expect(auto.connectors).toHaveLength(1)
    const [rib] = auto.connectors
    expect(rib.source).toBe('search')
    const searched = pieceVolumes(splitWithJoint(bar(), params))
    const placed = pieceVolumes(
      split([{ kind: 'tongue', uMm: rib.uMm, vMm: rib.vMm, sizeMm: rib.sizeMm, lengthMm: rib.lengthMm }])
    )
    expect(relativeError(placed[0], searched[0])).toBeLessThan(RELATIVE_TOLERANCE)
    expect(relativeError(placed[1], searched[1])).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('a wedge is a tapered key: 4 mm at its wide end, 2 mm at its narrow end, 12 mm long, 6 mm proud', () => {
    const [a, b] = pieceVolumes(split([{ kind: 'wedge', uMm: 0, vMm: 0, sizeMm: 4 }]))
    expect(relativeError(a, HALF + ((4 + 2) / 2) * 12 * 6)).toBeLessThan(RELATIVE_TOLERANCE)
    // Its socket is the key's outline offset by the clearance — the slanted sides move out by
    // 0.2 mm square to themselves, so the half-width grows by 0.2·√(1 + slope²), not 0.2.
    const slope = (1 - 2) / 12
    const meanHalfWidth = 1.5 + 0.2 * Math.hypot(1, slope)
    const socketArea = 2 * meanHalfWidth * (12 + 0.4)
    expect(relativeError(b, HALF - socketArea * 6.2)).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('a self-tapping screw boss: an M3 boss on A bored through for the screw, a 2.4 mm pilot in B', () => {
    const result = split([{ kind: 'screwBoss', uMm: 0, vMm: 0, sizeMm: 3 }])
    const [a, b] = pieceVolumes(result)
    // Boss Ø(3.4 clearance bore + 2 × 2 mm wall) = 7.4, 4.5 mm proud; the 3.4 mm bore runs
    // through the boss and all of piece A, out of its far face, so the screw is driven from
    // outside.
    expect(relativeError(a, HALF + ngonArea(3.7) * 4.5 - ngonArea(1.7) * (150 + 4.5))).toBeLessThan(RELATIVE_TOLERANCE)
    // B: the boss's socket (radius + clearance, depth + clearance) and a 7.5 mm pilot past it.
    expect(relativeError(b, HALF - ngonArea(3.9) * 4.7 - ngonArea(1.2) * 7.5)).toBeLessThan(RELATIVE_TOLERANCE)
    for (const name of result.names) expect(openEdges(result.parts[name])).toBe(0)
  })

  it('a heat-set insert boss: insertMm sets B’s bore, and the boss grows to keep its wall', () => {
    const [a, b] = pieceVolumes(split([{ kind: 'screwBoss', uMm: 0, vMm: 0, sizeMm: 3, insertMm: 4 }]))
    expect(relativeError(a, HALF + ngonArea(4) * 4.5 - ngonArea(1.7) * 154.5)).toBeLessThan(RELATIVE_TOLERANCE)
    expect(relativeError(b, HALF - ngonArea(4.2) * 4.7 - ngonArea(2) * 7.5)).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('zero clearance builds sockets exactly the size of their pins', () => {
    const [a, b] = pieceVolumes(split([{ kind: 'pins', uMm: 0, vMm: 0, sizeMm: 5 }], 0))
    expect(relativeError(a, HALF + ngonArea(2.5) * 10)).toBeLessThan(RELATIVE_TOLERANCE)
    expect(relativeError(b, HALF - ngonArea(2.5) * 10)).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('a hand-placed pin plus a searched pair: the search keeps clear, nothing is counted twice', () => {
    const params = {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      placements: [{ kind: 'pins', uMm: -12, vMm: 0, sizeMm: 6 }, { kind: 'pins' }],
    }
    const plan = planJoint(slab(), params)
    expect(plan.connectors[0]).toMatchObject({ kind: 'pins', source: 'placed', uMm: -12, vMm: 0, sizeMm: 6 })
    const searched = plan.connectors.slice(1)
    expect(searched.length).toBeGreaterThanOrEqual(1)
    expect(searched.every((c) => c.source === 'search')).toBe(true)
    // No two sockets share material: their walls stay apart, as the search's own pairs do.
    for (let i = 0; i < plan.connectors.length; i += 1) {
      for (let j = i + 1; j < plan.connectors.length; j += 1) {
        const p = plan.connectors[i]
        const q = plan.connectors[j]
        const apart = Math.hypot(p.uMm - q.uMm, p.vMm - q.vMm)
        expect(apart).toBeGreaterThanOrEqual(p.sizeMm / 2 + q.sizeMm / 2 + 2 * (0.2 + 1.2) - 1e-9)
      }
    }
    const result = splitWithJoint(slab(), params)
    const added = plan.pins.reduce((sum, pin) => sum + volumeBeyond(pin, 0, 150), 0)
    const removed = plan.sockets.reduce((sum, socket) => sum + volumeBeyond(socket, 0, 150), 0)
    const total = result.names.reduce((sum, name) => sum + volumeOf(result.parts[name]), 0)
    const expected = volumeOf(slab()) + added - removed
    expect(relativeError(total, expected)).toBeLessThan(RELATIVE_TOLERANCE)
  })

  it('a mixed list — a screw boss by hand, pins by search — keeps every socket apart', () => {
    const params = {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      placements: [{ kind: 'screwBoss', uMm: -12, vMm: 0, sizeMm: 3 }, { kind: 'pins' }],
    }
    const plan = planJoint(slab(), params)
    expect(plan.kind).toBe('placements')
    expect(plan.connectors.map((c) => c.kind)).toContain('screwBoss')
    expect(plan.connectors.filter((c) => c.kind === 'pins').length).toBeGreaterThanOrEqual(1)
    // The boss's socket and each pin's socket share no material. Sockets come in connector
    // order, and a screw boss cuts two: the boss's socket, then the bore past it.
    const [bossSocket, , ...pinSockets] = plan.sockets
    expect(pinSockets.length).toBeGreaterThanOrEqual(1)
    for (const socket of pinSockets) {
      expect(volumeOf(booleans.intersect(bossSocket, socket))).toBeCloseTo(0, 6)
    }
    const result = splitWithJoint(slab(), params)
    for (const name of result.names) expect(openEdges(result.parts[name])).toBe(0)
  })

  it('leaving placements out is today’s search; an empty list is refused, not read as no joint', () => {
    const withUndefined = planJoint(bar(), { axis: 'x', offsetMm: 150, joint: 'pins', clearanceMm: 0.2, placements: undefined })
    expect(withUndefined.kind).toBe('pins')
    expect(() => split([])).toThrow(/placements must list at least one connector/)
  })
})

describe('splitWithJoint — hand-placed connectors that do not fit are refused by name and position', () => {
  /** @param {Record<string, any>[]} placements @param {any} [body] */
  const split = (placements, body = bar()) =>
    splitWithJoint(body, { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements })

  it('a placement off the cut face', () => {
    expect(() => split([{ kind: 'pins', uMm: 50, vMm: 0, sizeMm: 5 }])).toThrow(
      /modify\.splitWithJoint: placement 1 \(pins at y = 50, z = 0 mm\) is outside the cut face \(y -10 to 10, z -10 to 10 mm\)/
    )
    expect(() => split([{ kind: 'wedge', uMm: 0, vMm: -10.5, sizeMm: 4 }])).toThrow(/placement 1 .* outside the cut face/)
  })

  it('a socket whose wall would break out of piece B — refused, never clipped', () => {
    // Ø5 at y = 6.5: the pin's base is in the material (to y = 9), but its socket and 1.2 mm
    // wall reach y = 10.4, past the bar's side at y = 10.
    expect(() => split([{ kind: 'pins', uMm: 6.5, vMm: 0, sizeMm: 5 }])).toThrow(
      /placement 1 \(pins at y = 6\.5, z = 0 mm\).*would break out of piece B/
    )
    expect(() => split([{ kind: 'tongue', uMm: 0, vMm: 0, sizeMm: 4, lengthMm: 18 }])).toThrow(
      /placement 1 \(tongue at y = 0, z = 0 mm\).*would break out of piece B/
    )
  })

  it('a placement on top of an existing hole in the cut face', () => {
    const holed = booleans.subtract(bar(), primitives.cuboid({ size: [8, 40, 8], center: [150, 0, 0] }))
    expect(() => split([{ kind: 'pins', uMm: 0, vMm: 0, sizeMm: 3 }], holed)).toThrow(
      /placement 1 \(pins at y = 0, z = 0 mm\) is not on solid material/
    )
    // Beside the hole, in the 6 mm strip, a small pin still fits.
    expect(() => split([{ kind: 'pins', uMm: 0, vMm: 7, sizeMm: 2 }], holed)).not.toThrow()
  })

  it('a screw bore that would break out of piece A’s side before reaching its far face', () => {
    // Piece A narrows to a 4 mm plate (z -2 to 2) before its far end; the screw's bore through
    // A at z = 4 fits B and A's thick part, then would leave the plate.
    const stepped = booleans.union(
      primitives.cuboid({ size: [200, 20, 20], center: [200, 0, 0] }),
      primitives.cuboid({ size: [101, 20, 4], center: [50.5, 0, 0] })
    )
    expect(() => split([{ kind: 'screwBoss', uMm: 0, vMm: 4, sizeMm: 3 }], stepped)).toThrow(
      /placement 1 \(screwBoss at y = 0, z = 4 mm\).*screw bore.*piece A/
    )
  })

  it('two placements whose walls would meet', () => {
    expect(() =>
      split([
        { kind: 'pins', uMm: -2, vMm: 0, sizeMm: 4 },
        { kind: 'pins', uMm: 2, vMm: 0, sizeMm: 4 },
      ])
    ).toThrow(/placement 2 \(pins at y = 2, z = 0 mm\) overlaps placement 1 \(pins at y = -2, z = 0 mm\)/)
  })

  it('malformed placements are refused by name', () => {
    expect(() => split([{ kind: 'rivet', uMm: 0, vMm: 0 }])).toThrow(/kind must be one of pins, tongue, wedge, screwBoss, dowel, butterfly, tenon, magnet, got "rivet"/)
    expect(() => split([{ kind: 'pins', uMm: 0 }])).toThrow(/placement 1.*uMm and vMm/)
    expect(() => split([{ kind: 'wedge' }])).toThrow(/placement 1 \(wedge\).*needs uMm and vMm/)
    expect(() => split([{ kind: 'pins', uMm: 0, vMm: 0, sizeMm: 9 }])).toThrow(/placement 1.*sizeMm.*2 to 8/)
    expect(() => split([{ kind: 'pins', uMm: 0, vMm: 0, sizeMm: Number.NaN }])).toThrow(/sizeMm/)
    expect(() => split([{ kind: 'pins', uMm: 0, vMm: 0, insertMm: 4 }])).toThrow(/insertMm.*screwBoss/)
    expect(() => split([{ kind: 'screwBoss', uMm: 0, vMm: 0, sizeMm: 3, insertMm: 3 }])).toThrow(/insertMm/)
    expect(() => split([{ kind: 'tongue', uMm: 0, vMm: 0, sizeMm: 4, lengthMm: 6 }])).toThrow(/lengthMm/)
    expect(() => split(Array.from({ length: 17 }, () => ({ kind: 'pins' })))).toThrow(/at most 16/)
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 150, placements: 'pins' })).toThrow(/placements must be a list/)
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

describe('splitWithJoint — key parts across repeated splits (TODO/core-075 stage 1)', () => {
  /** A 300 × 120 × 10 mm plank. */
  const plank = () => primitives.cuboid({ size: [300, 120, 10], center: [150, 0, 5] })
  const dowels = { joint: 'dowel', clearanceMm: 0.2 }
  /** @param {any} group */
  const keysOf = (group) => group.names.filter((/** @type {string} */ name) => partMetaOf(group, name)?.role === 'key')

  it('a second split keeps the first split’s keys and numbers its own from the next free number', () => {
    const first = splitWithJoint(plank(), { axis: 'x', offsetMm: 100, ...dowels, names: ['Plank A', 'Plank B'] })
    const firstKeys = keysOf(first)
    expect(firstKeys.length).toBeGreaterThanOrEqual(1)
    // 200 mm crosses only Plank B (100 → 300), well clear of the first split's dowels.
    const second = splitWithJoint(first, { axis: 'x', offsetMm: 200, ...dowels, names: ['Plank B', 'Plank C'] })
    const secondKeys = keysOf(second)
    expect(secondKeys.slice(0, firstKeys.length)).toEqual(firstKeys)
    const added = secondKeys.slice(firstKeys.length)
    expect(added.length).toBeGreaterThanOrEqual(1)
    expect(added).toEqual(added.map((/** @type {string} */ _, /** @type {number} */ index) => `Plank key ${firstKeys.length + index + 1}`))
    for (const name of added) expect(partMetaOf(second, name)?.joins).toEqual(['Plank B', 'Plank C'])
    for (const name of firstKeys) expect(partMetaOf(second, name)?.joins).toEqual(['Plank A', 'Plank B'])
    expect(second.names.slice(0, 3)).toEqual(['Plank A', 'Plank B', 'Plank C'])
  })

  it('a later plane through a key is refused by the key’s name', () => {
    const first = splitWithJoint(plank(), { axis: 'x', offsetMm: 150, ...dowels, names: ['Plank A', 'Plank B'] })
    expect(() => splitWithJoint(first, { axis: 'x', offsetMm: 151, ...dowels, names: ['Plank B', 'Plank C'] })).toThrow(
      /the cut plane crosses Plank key \d — move it clear of the keys/
    )
  })

  it('the key metadata survives a move, the export worker’s transport and a removed sibling', () => {
    const result = splitWithJoint(plank(), { axis: 'x', offsetMm: 150, ...dowels, names: ['Plank A', 'Plank B'] })
    const [key] = keysOf(result)
    const want = partMetaOf(result, key)
    expect(partMetaOf(translate(result, [5, 0, 0]), key)).toEqual(want)
    expect(partMetaOf(mapGeometry(result, (geometry) => geometry), key)).toEqual(want)
    expect(partMetaOf(/** @type {any} */ (unpackGeometry(packGeometry(result))), key)).toEqual(want)
    expect(partMetaOf(removePart(result, 'Plank B'), key)).toEqual(want)
    expect(partMetaOf(removePart(result, key), key)).toBeUndefined()
  })

  it('the metadata is derived from the record at fold time: it survives the project file round trip', () => {
    const local = { origin: 'local' }
    const document = createDocument({ resolution: 'normal' })
    document.append({ id: 'plank', op: 'primitive.cuboid', name: 'Plank', params: { size: [300, 120, 10], center: [0, 0, 5] } }, local)
    document.append(
      {
        id: 'split-1',
        op: 'modify.splitWithJoint',
        target: 'plank',
        supersedes: 'plank',
        params: { axis: 'x', offsetMm: 150, joint: 'dowel', clearanceMm: 0.2, names: ['Plank A', 'Plank B'] },
      },
      local
    )
    const text = serializeProject(document)
    // Nothing but the record's own params is written: no mesh, no metadata.
    expect(text).not.toContain('bedNormal')
    const loaded = createDocument({ resolution: 'normal' })
    const parsed = parseProject(text)
    loaded.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution)
    const geometry = /** @type {any} */ (loaded.bodies()[0].geometry)
    const keys = keysOf(geometry)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    expect(partMetaOf(geometry, keys[0])).toMatchObject({ role: 'key', kind: 'dowel', joins: ['Plank A', 'Plank B'] })
  })

  it('jointOptions are checked by name', () => {
    const base = { axis: 'x', offsetMm: 150, clearanceMm: 0.2 }
    expect(() => splitWithJoint(plank(), { ...base, joint: 'dowel', jointOptions: { stock: 'gold' } })).toThrow(
      /jointOptions\.stock must be one of printed, steel, filament, got "gold"/
    )
    expect(() => splitWithJoint(plank(), { ...base, joint: 'dowel', jointOptions: { count: 3 } })).toThrow(
      /jointOptions has no field "count"/
    )
    expect(() => splitWithJoint(plank(), { ...base, joint: 'dowel', jointOptions: { sizeMm: 12 } })).toThrow(
      /jointOptions\.sizeMm must be 2 to 10 mm, got 12/
    )
    expect(() => splitWithJoint(plank(), { ...base, joint: 'pins', jointOptions: { stock: 'steel' } })).toThrow(
      /jointOptions is only for joint dowel/
    )
    expect(() => splitWithJoint(plank(), { ...base, joint: 'glue-gun' })).toThrow(
      /joint must be one of pins, tongue, dowel, butterfly, tenon, magnets, none, got "glue-gun"/
    )
  })
})

describe('splitWithJoint — today’s records fold byte-identically (TODO/core-075 closed-finding regression)', () => {
  /** @param {Uint8Array} bytes */
  const sha256 = async (bytes) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {BufferSource} */ (bytes)))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const bar300 = () => primitives.cuboid({ size: [300, 20, 20], center: [150, 0, 0] })

  for (const label of ['pins', 'tongue', 'placements']) {
    it(`a ${label} split: the same group shape and the same STL bytes per piece as before stage 1`, async () => {
      const { params, keys, names, sha256: want } = /** @type {any} */ (golden)[label]
      const group = splitWithJoint(bar300(), params)
      expect(Object.keys(group)).toEqual(keys)
      expect([...group.names]).toEqual(names)
      for (const name of names) {
        const { bytes } = exportBodies([{ id: name, name, geometry: group.parts[name] }], 'stl')
        expect(await sha256(bytes), name).toBe(want[name])
      }
    })
  }

  // Stage 3 (tenon, magnets) must leave the stage-1 and stage-2 joints exactly as they were:
  // these were recorded from the code before stage 3, keys and metadata included.
  for (const label of ['dowel', 'dowel-steel', 'butterfly']) {
    it(`a ${label} split: the same parts, metadata and STL bytes as before stage 3`, async () => {
      const { params, keys, names, sha256: want, meta } = /** @type {any} */ (golden)[label]
      const group = splitWithJoint(bar300(), params)
      expect(Object.keys(group)).toEqual(keys)
      expect([...group.names]).toEqual(names)
      expect(JSON.parse(JSON.stringify(group.meta ?? null))).toEqual(meta)
      for (const name of names) {
        const { bytes } = exportBodies([{ id: name, name, geometry: group.parts[name] }], 'stl')
        expect(await sha256(bytes), name).toBe(want[name])
      }
    })
  }
})

describe('splitWithJoint — butterfly keys across repeated splits and the face preview (TODO/core-075 stage 2)', () => {
  /** A 300 × 120 × 10 mm plank. */
  const plank = () => primitives.cuboid({ size: [300, 120, 10], center: [150, 0, 5] })
  const butterflies = { joint: 'butterfly', jointOptions: { side: 'v+', depthMm: 5 }, clearanceMm: 0.2 }
  /** @param {any} group */
  const keysOf = (group) => group.names.filter((/** @type {string} */ name) => partMetaOf(group, name)?.role === 'key')

  it('a second split keeps the first split’s keys and numbers its own from the next free number', () => {
    const first = splitWithJoint(plank(), { axis: 'x', offsetMm: 100, ...butterflies, names: ['Plank A', 'Plank B'] })
    expect(keysOf(first)).toEqual(['Plank key 1', 'Plank key 2'])
    const second = splitWithJoint(first, { axis: 'x', offsetMm: 200, ...butterflies, names: ['Plank B', 'Plank C'] })
    expect(keysOf(second)).toEqual(['Plank key 1', 'Plank key 2', 'Plank key 3', 'Plank key 4'])
    expect(partMetaOf(second, 'Plank key 3')).toMatchObject({ kind: 'butterfly', joins: ['Plank B', 'Plank C'] })
    expect(partMetaOf(second, 'Plank key 1')).toMatchObject({ kind: 'butterfly', joins: ['Plank A', 'Plank B'] })
    expect(second.names.slice(0, 3)).toEqual(['Plank A', 'Plank B', 'Plank C'])
  })

  it('a later plane through a butterfly key is refused by the key’s name', () => {
    const first = splitWithJoint(plank(), { axis: 'x', offsetMm: 150, ...butterflies, names: ['Plank A', 'Plank B'] })
    expect(() => splitWithJoint(first, { axis: 'x', offsetMm: 160, ...butterflies, names: ['Plank B', 'Plank C'] })).toThrow(
      /the cut plane crosses Plank key 1 — move it clear of the keys/
    )
  })

  it('MAX_PLACEMENTS holds for butterflies, as a placement list and as a key count', () => {
    const many = Array.from({ length: MAX_PLACEMENTS + 1 }, (_, i) => ({ kind: 'butterfly', uMm: -55 + i * 6, vMm: 10 }))
    expect(() => splitWithJoint(plank(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements: many })).toThrow(
      new RegExp(`at most ${MAX_PLACEMENTS} connectors, got ${MAX_PLACEMENTS + 1}`)
    )
    expect(() =>
      splitWithJoint(plank(), { axis: 'x', offsetMm: 150, joint: 'butterfly', jointOptions: { count: MAX_PLACEMENTS + 1 }, clearanceMm: 0.2 })
    ).toThrow(new RegExp(`jointOptions\\.count must be a whole number from 1 to ${MAX_PLACEMENTS}, got ${MAX_PLACEMENTS + 1}`))
  })

  it('butterfly placement fields are checked by name', () => {
    const base = { axis: 'x', offsetMm: 150, clearanceMm: 0.2 }
    expect(() => splitWithJoint(plank(), { ...base, placements: [{ kind: 'butterfly', uMm: 0, vMm: 10, side: 'top' }] })).toThrow(
      /placement 1 \(butterfly\): side must be one of u-, u\+, v-, v\+, got "top"/
    )
    expect(() => splitWithJoint(plank(), { ...base, placements: [{ kind: 'pins', uMm: 0, vMm: 5, depthMm: 3 }] })).toThrow(
      /placement 1 \(pins\): depthMm is only for a butterfly/
    )
    expect(() => splitWithJoint(plank(), { ...base, placements: [{ kind: 'butterfly', uMm: 0, vMm: 10, sizeMm: 2 }] })).toThrow(
      /placement 1 \(butterfly\): sizeMm must be 3 to 20 mm, got 2/
    )
  })

  it('a butterfly search entry in a placement list keeps clear of a hand-placed dowel', () => {
    const result = splitWithJoint(plank(), {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
      placements: [{ kind: 'dowel', uMm: 0, vMm: 5, sizeMm: 4 }, { kind: 'butterfly', side: 'v+', depthMm: 4 }],
    })
    const kinds = keysOf(result).map((/** @type {string} */ name) => partMetaOf(result, name)?.kind)
    expect(kinds[0]).toBe('dowel')
    expect(kinds.slice(1).every((/** @type {string | undefined} */ kind) => kind === 'butterfly')).toBe(true)
    expect(kinds.length).toBeGreaterThanOrEqual(2)
  })

  it('the face preview seeds butterflies with their side and depth, and carries the outline to snap taps to', () => {
    const face = previewSplitFace(plank(), { axis: 'x', offsetMm: 150, seed: 'butterfly', seedOptions: { side: 'v+', depthMm: 5 } })
    expect(face.autoError).toBe('')
    expect(face.auto).toHaveLength(2)
    for (const entry of face.auto) expect(entry).toMatchObject({ kind: 'butterfly', side: 'v+', depthMm: 5, vMm: 10 })
    // Six numbers per edge: from (u, v), to (u, v), outward normal (u, v).
    expect(face.outline.length % 6).toBe(0)
    expect(face.outline.length).toBeGreaterThanOrEqual(24)
    const verdict = previewSplitFace(plank(), { axis: 'x', offsetMm: 150, placements: [{ kind: 'butterfly', uMm: 0, vMm: 10 }] })
    expect(verdict.verdicts).toEqual([{ ok: true, reason: '' }])
    expect(verdict.resolved).toEqual([expect.objectContaining({ kind: 'butterfly', side: 'v+', uMm: 0, vMm: 10, depthMm: 5 })])
  })

  it('the metadata is derived from the record at fold time: it survives the project file round trip', () => {
    const local = { origin: 'local' }
    const document = createDocument({ resolution: 'normal' })
    document.append({ id: 'plank', op: 'primitive.cuboid', name: 'Plank', params: { size: [300, 120, 10], center: [0, 0, 5] } }, local)
    document.append(
      {
        id: 'split-1',
        op: 'modify.splitWithJoint',
        target: 'plank',
        supersedes: 'plank',
        params: { axis: 'x', offsetMm: 150, ...butterflies, names: ['Plank A', 'Plank B'] },
      },
      local
    )
    const text = serializeProject(document)
    expect(text).not.toContain('bedNormal')
    const loaded = createDocument({ resolution: 'normal' })
    const parsed = parseProject(text)
    loaded.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution)
    const geometry = /** @type {any} */ (loaded.bodies()[0].geometry)
    expect(keysOf(geometry)).toEqual(['Plank key 1', 'Plank key 2'])
    expect(partMetaOf(geometry, 'Plank key 1')).toMatchObject({ role: 'key', kind: 'butterfly', bedNormal: [0, 0, -1] })
  })
})

describe('splitWithJoint — tenons and magnets in placement lists and the face preview (TODO/core-075 stage 3)', () => {
  /** A 300 × 120 × 10 mm plank. */
  const plank = () => primitives.cuboid({ size: [300, 120, 10], center: [150, 0, 5] })
  /** @param {any} group */
  const keysOf = (group) => group.names.filter((/** @type {string} */ name) => partMetaOf(group, name)?.role === 'key')

  it('the face preview seeds tenons and magnets with their sizes, and resolves a hand placement’s defaults', () => {
    const tenons = previewSplitFace(plank(), { axis: 'x', offsetMm: 150, seed: 'tenon' })
    expect(tenons.autoError).toBe('')
    expect(tenons.auto).toHaveLength(2)
    for (const entry of tenons.auto) expect(entry).toMatchObject({ kind: 'tenon', vMm: 5, sizeMm: 14, thicknessMm: 3.5 })
    const magnets = previewSplitFace(plank(), { axis: 'x', offsetMm: 150, seed: 'magnets', seedOptions: { sizeMm: 6, thicknessMm: 2 } })
    expect(magnets.auto).toEqual([
      expect.objectContaining({ kind: 'magnet', sizeMm: 6, thicknessMm: 2, vMm: 5 }),
      expect.objectContaining({ kind: 'magnet', sizeMm: 6, thicknessMm: 2, vMm: 5 }),
    ])
    const tooBig = previewSplitFace(plank(), { axis: 'x', offsetMm: 150, seed: 'magnets', seedOptions: { sizeMm: 10, thicknessMm: 3 } })
    expect(tooBig.autoError).toMatch(/finds no room for a magnet/)
    const placed = previewSplitFace(plank(), {
      axis: 'x',
      offsetMm: 150,
      placements: [
        { kind: 'tenon', uMm: 0, vMm: 5 },
        { kind: 'magnet', uMm: 40, vMm: 5 },
      ],
    })
    expect(placed.verdicts).toEqual([
      { ok: true, reason: '' },
      { ok: true, reason: '' },
    ])
    expect(placed.resolved).toEqual([
      expect.objectContaining({ kind: 'tenon', sizeMm: 14, thicknessMm: 3.5 }),
      expect.objectContaining({ kind: 'magnet', sizeMm: 6, thicknessMm: 3 }),
    ])
  })

  it('a tenon search keeps clear of a hand-placed magnet, and the magnets are bought on piece A', () => {
    const result = splitWithJoint(plank(), {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
      placements: [{ kind: 'magnet', uMm: 0, vMm: 5, sizeMm: 6, thicknessMm: 3 }, { kind: 'tenon' }],
    })
    const keys = keysOf(result)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    for (const name of keys) {
      expect(partMetaOf(result, name)?.kind).toBe('tenon')
      const [min, max] = boundsOf(result.parts[name])
      // The magnet's pocket and wall reach 4.4 mm either side of y = 0; no tenon comes near it.
      expect(min[1] > 4.4 || max[1] < -4.4, name).toBe(true)
    }
    expect(partMetaOf(result, 'Plank A')?.hardware).toEqual([expect.objectContaining({ item: 'magnet', count: 2 })])
  })

  it('the metadata is derived from the record at fold time: tenons and magnets survive the project file round trip', () => {
    const local = { origin: 'local' }
    const document = createDocument({ resolution: 'normal' })
    document.append({ id: 'plank', op: 'primitive.cuboid', name: 'Plank', params: { size: [300, 120, 10], center: [0, 0, 5] } }, local)
    document.append(
      {
        id: 'split-1',
        op: 'modify.splitWithJoint',
        target: 'plank',
        supersedes: 'plank',
        params: { axis: 'x', offsetMm: 100, joint: 'tenon', clearanceMm: 0.2, names: ['Plank A', 'Plank B'] },
      },
      local
    )
    document.append(
      {
        id: 'split-2',
        op: 'modify.splitWithJoint',
        target: 'split-1',
        supersedes: 'split-1',
        params: { axis: 'x', offsetMm: 200, joint: 'magnets', clearanceMm: 0.2, names: ['Plank B', 'Plank C'] },
      },
      local
    )
    const text = serializeProject(document)
    expect(text).not.toContain('bedNormal')
    expect(text).not.toContain('hardware')
    const loaded = createDocument({ resolution: 'normal' })
    const parsed = parseProject(text)
    loaded.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution)
    const geometry = /** @type {any} */ (loaded.bodies()[0].geometry)
    expect(keysOf(geometry)).toEqual(['Plank key 1', 'Plank key 2'])
    expect(partMetaOf(geometry, 'Plank key 1')).toMatchObject({ role: 'key', kind: 'tenon', thicknessMm: 3.5, bedNormal: [0, 0, -1] })
    expect(partMetaOf(geometry, 'Plank B')?.hardware).toEqual([
      expect.objectContaining({ item: 'magnet', count: 4, joins: ['Plank B', 'Plank C'], axis: 'x' }),
    ])
  })

  it('tenon and magnet placement fields are checked by name', () => {
    const base = { axis: 'x', offsetMm: 150, clearanceMm: 0.2 }
    expect(() => splitWithJoint(plank(), { ...base, placements: [{ kind: 'magnet', sizeMm: 6, thicknessMm: 3 }] })).toThrow(
      /placement 1 \(magnet\): the search picks its own size/
    )
    expect(() => splitWithJoint(plank(), { ...base, placements: [{ kind: 'tenon', uMm: 0, vMm: 5, stock: 'steel' }] })).toThrow(
      /placement 1 \(tenon\): stock is only for a dowel/
    )
    expect(() =>
      splitWithJoint(plank(), { ...base, placements: [{ kind: 'tenon', uMm: 0, vMm: 5, sizeMm: 10, thicknessMm: 6 }] })
    ).toThrow(/placement 1 \(tenon\): a tenon's width must be at least twice its thickness/)
  })
})
