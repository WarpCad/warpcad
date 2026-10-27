// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, partMetaOf, volumeOf } from '../group.js'
import { MAX_PLACEMENTS, planJoint, splitWarnings, splitWithJoint } from '../split.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { layFlat } from '../../printPrep.js'
import {
  TENON_MAX_THICKNESS_MM,
  TENON_MAX_WIDTH_MM,
  TENON_MIN_THICKNESS_MM,
  TENON_MIN_WIDTH_MM,
  describeTenon,
  stadiumOutline,
  tenonProfile,
  tenonSizing,
} from './joint.tenon.js'

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

/**
 * The nominal stadium for width `w` and thickness `t`, written out by hand (shares nothing with
 * the recipe): two half 32-gons of radius t/2, (w − t) apart, joined by straight sides.
 *
 * @param {number} w
 * @param {number} t
 * @returns {[number, number][]} `(along, across)`, counter-clockwise.
 */
function handStadium(w, t) {
  const r = t / 2
  const a = (w - t) / 2
  /** @type {[number, number][]} */
  const corners = []
  for (let k = 0; k <= 16; k += 1) {
    const angle = -Math.PI / 2 + (k * Math.PI) / 16
    corners.push([a + r * Math.cos(angle), r * Math.sin(angle)])
  }
  for (let k = 0; k <= 16; k += 1) {
    const angle = Math.PI / 2 + (k * Math.PI) / 16
    corners.push([-a + r * Math.cos(angle), r * Math.sin(angle)])
  }
  return corners
}

/**
 * The key's section by hand: the stadium with the bed-side (across < 0) quarter of each round end
 * replaced by a straight chamfer from the flat's end to the end's widest point.
 *
 * @param {number} w
 * @param {number} t
 */
function handProfile(w, t) {
  const r = t / 2
  const a = (w - t) / 2
  return handStadium(w, t).filter(([along, across]) => !(across < -1e-12 && Math.abs(along) > a + 1e-12))
}

/** Shoelace area. @param {[number, number][]} corners */
function area(corners) {
  let twice = 0
  for (let i = 0; i < corners.length; i += 1) {
    const [x0, y0] = corners[i]
    const [x1, y1] = corners[(i + 1) % corners.length]
    twice += x0 * y1 - x1 * y0
  }
  return Math.abs(twice) / 2
}

/**
 * The area of a convex polygon grown by `c` square to every side (a mitred offset), by the
 * closed form A + P·c + c²·Σ tan(θ/2) over its turning angles θ — independent of the recipe's
 * line-intersection offset.
 *
 * @param {[number, number][]} corners Convex, counter-clockwise.
 * @param {number} c
 */
function grownArea(corners, c) {
  const n = corners.length
  let perimeter = 0
  let tangents = 0
  for (let i = 0; i < n; i += 1) {
    const [x0, y0] = corners[(i + n - 1) % n]
    const [x1, y1] = corners[i]
    const [x2, y2] = corners[(i + 1) % n]
    perimeter += Math.hypot(x2 - x1, y2 - y1)
    const turn = Math.atan2(y2 - y1, x2 - x1) - Math.atan2(y1 - y0, x1 - x0)
    const theta = Math.atan2(Math.sin(turn), Math.cos(turn))
    tangents += Math.tan(theta / 2)
  }
  return area(corners) + perimeter * c + c * c * tangents
}

describe('tenon sizing — a flat stadium key in matching mortises (TODO/core-075 stage 3)', () => {
  it('ranges: width 6–30 mm, thickness 3–8 mm', () => {
    expect([TENON_MIN_WIDTH_MM, TENON_MAX_WIDTH_MM, TENON_MIN_THICKNESS_MM, TENON_MAX_THICKNESS_MM]).toEqual([6, 30, 3, 8])
  })

  it('a mortise 1.5× the width deep in each piece; the tenon 2 × clearance shorter than both', () => {
    const sizing = tenonSizing(14, 3.5, 0.2)
    expect(sizing.mortiseDepthMm).toBeCloseTo(21, 12)
    expect(sizing.lengthMm).toBeCloseTo(2 * 21 - 2 * 0.2, 12)
  })

  it('the outline is the hand-written stadium, along u or a quarter turn along v', () => {
    const outline = stadiumOutline(14, 3.5, true)
    const hand = handStadium(14, 3.5)
    expect(outline).toHaveLength(hand.length)
    outline.forEach(([u, v], i) => {
      expect(u).toBeCloseTo(hand[i][0], 12)
      expect(v).toBeCloseTo(hand[i][1], 12)
    })
    const alongV = stadiumOutline(14, 3.5, false)
    alongV.forEach(([u, v], i) => {
      expect(u).toBeCloseTo(-hand[i][1], 12)
      expect(v).toBeCloseTo(hand[i][0], 12)
    })
  })

  it('the key’s own section chamfers the bed side of each round end at 45°, inside the stadium', () => {
    const profile = tenonProfile(14, 3.5, true)
    const hand = handProfile(14, 3.5)
    expect(profile).toHaveLength(hand.length)
    profile.forEach(([u, v], i) => {
      expect(u).toBeCloseTo(hand[i][0], 12)
      expect(v).toBeCloseTo(hand[i][1], 12)
    })
    // The chamfer runs from the flat's end (5.25, −1.75) to the end's widest point (7, 0): 45°.
    const start = hand.findIndex(([along, across]) => Math.abs(along - 5.25) < 1e-9 && Math.abs(across + 1.75) < 1e-9)
    const [[x0, y0], [x1, y1]] = [hand[start], hand[(start + 1) % hand.length]]
    expect(Math.atan2(y1 - y0, x1 - x0)).toBeCloseTo(Math.PI / 4, 12)
    expect(area(hand)).toBeLessThan(area(handStadium(14, 3.5)))
  })

  it('a tenon is described as it lies on the bed: length × width × thickness', () => {
    const words = describeTenon(14, 3.5, 0.2)
    expect(words.keyLabel).toBe('Tenon 41.6 × 14 × 3.5 mm')
    expect(words.keySizeMm).toEqual([41.6, 14, 3.5])
  })
})

describe('splitWithJoint — loose tenons across a 300 mm plank', () => {
  const params = { axis: 'x', offsetMm: 150, joint: 'tenon', clearanceMm: 0.2, names: ['Plank A', 'Plank B'] }

  it('makes tenon key parts after A and B, lying the long way of the face, printed on their big face', () => {
    const result = splitWithJoint(plank(), params)
    expect(result.names.slice(0, 2)).toEqual(['Plank A', 'Plank B'])
    const keys = keyNames(result)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    expect(keys).toEqual(keys.map((_, index) => `Plank key ${index + 1}`))
    for (const name of keys) {
      const meta = /** @type {any} */ (partMetaOf(result, name))
      expect(meta).toMatchObject({ role: 'key', kind: 'tenon', joins: ['Plank A', 'Plank B'], axis: 'x', bedNormal: [0, 0, -1] })
      expect(meta.insert).toBeUndefined()
      // The long axis runs along the face's longer side (y on this plank), like the tongue.
      const [min, max] = boundsOf(result.parts[name])
      expect(max[1] - min[1]).toBeCloseTo(meta.sizeMm, 6)
      expect(max[1] - min[1]).toBeGreaterThan(max[2] - min[2])
    }
  })

  it('volume identity: A + B + tenons = uncut − (mortises − tenons), the mortises measured independently', () => {
    const original = plank()
    const plan = planJoint(original, params)
    const result = splitWithJoint(original, params)
    const keys = keyNames(result)
    expect(plan.connectors.length).toBe(keys.length)
    let gaps = 0
    for (const connector of plan.connectors) {
      const w = connector.sizeMm
      const t = /** @type {number} */ (connector.thicknessMm)
      const depth = 1.5 * w
      const stadium = handStadium(w, t)
      gaps += 2 * grownArea(stadium, 0.2) * depth - area(handProfile(w, t)) * (2 * depth - 2 * 0.2)
    }
    const keyVolume = keys.reduce((sum, name) => sum + volumeOf(result.parts[name]), 0)
    const [a, b] = ['Plank A', 'Plank B'].map((name) => volumeOf(result.parts[name]))
    expect(gaps).toBeGreaterThan(0)
    expect(relativeError(a + b + keyVolume, volumeOf(original) - gaps)).toBeLessThan(1e-6)
  })

  it('no interference when assembled at 0.2 mm: A∩B, tenon∩A and tenon∩B are all empty', () => {
    const result = splitWithJoint(plank(), params)
    const [a, b] = [result.parts['Plank A'], result.parts['Plank B']]
    expect(overlap(a, b)).toBeLessThan(1e-6)
    for (const name of keyNames(result)) {
      expect(overlap(result.parts[name], a), `${name} ∩ A`).toBeLessThan(1e-6)
      expect(overlap(result.parts[name], b), `${name} ∩ B`).toBeLessThan(1e-6)
    }
  })

  it('goes together along the cut axis: B slides on over the tenons seated in A, nothing in the way at any step', () => {
    const result = splitWithJoint(bar(), { ...params, names: ['Bar A', 'Bar B'] })
    const keys = keyNames(result)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    const seated = booleans.union(result.parts['Bar A'], ...keys.map((name) => result.parts[name]))
    const depth = 1.5 * /** @type {number} */ (partMetaOf(result, keys[0])?.sizeMm)
    for (let step = 0; step <= depth + 1; step += 0.5) {
      const moved = transforms.translate([step, 0, 0], result.parts['Bar B'])
      expect(overlap(seated, moved), `B moved ${step} mm along +x`).toBeLessThan(1e-6)
    }
  })

  it('print orientation: layFlat on the bed normal lays a tenon on its big face, thickness up', () => {
    const result = /** @type {any} */ (splitWithJoint(plank(), params))
    const [key] = keyNames(result)
    const meta = result.meta[key]
    const words = describeTenon(meta.sizeMm, meta.thicknessMm, 0.2)
    for (const options of [{ bedNormal: meta.bedNormal }, {}]) {
      const { solid } = layFlat(result.parts[key], options)
      const [min, max] = boundsOf(solid)
      expect(min[2]).toBeCloseTo(0, 6)
      expect(max[2] - min[2]).toBeCloseTo(words.keySizeMm[2], 6)
      const footprint = [max[0] - min[0], max[1] - min[1]].sort((p, q) => q - p)
      expect(footprint[0]).toBeCloseTo(words.keySizeMm[0], 6)
      expect(footprint[1]).toBeCloseTo(words.keySizeMm[1], 6)
    }
  })

  it('laid on its bed normal a tenon needs no supports, whichever way its long axis runs on the face', () => {
    // A plank (long axis along y) and an upright board (60 mm tall: the long axis runs along z).
    const flat = splitWithJoint(plank(), params)
    const upright = splitWithJoint(primitives.cuboid({ size: [300, 12, 60], center: [150, 0, 30] }), {
      ...params,
      names: ['Board A', 'Board B'],
    })
    for (const result of [flat, upright]) {
      const keys = keyNames(result)
      expect(keys.length).toBeGreaterThanOrEqual(1)
      for (const name of keys) {
        const meta = /** @type {any} */ (partMetaOf(result, name))
        const laid = layFlat(result.parts[name], { bedNormal: meta.bedNormal })
        expect(laid.mayNeedSupports, name).toBe(false)
        const [min, max] = boundsOf(laid.solid)
        expect(max[2] - min[2], name).toBeCloseTo(meta.thicknessMm, 6)
      }
    }
    expect(partMetaOf(upright, keyNames(upright)[0])?.bedNormal).toEqual([0, 1, 0])
  })

  it('every tenon is watertight and identical tenons share a shape id', () => {
    const result = splitWithJoint(plank(), params)
    const keys = keyNames(result)
    for (const name of keys) expect(openEdgesOf(makeWatertight(result.parts[name])).openEdges, name).toBe(0)
    const shapes = new Set(keys.map((name) => partMetaOf(result, name)?.shape))
    expect(shapes.size).toBe(1)
  })

  it('a size from jointOptions is used as given; out of range or too thick for its width is refused by name', () => {
    const result = splitWithJoint(plank(), { ...params, jointOptions: { sizeMm: 20, thicknessMm: 4 } })
    for (const name of keyNames(result)) {
      expect(partMetaOf(result, name)).toMatchObject({ sizeMm: 20, thicknessMm: 4 })
    }
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { sizeMm: 40 } })).toThrow(/jointOptions\.sizeMm must be 6 to 30 mm, got 40/)
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { thicknessMm: 2 } })).toThrow(
      /jointOptions\.thicknessMm must be 3 to 8 mm, got 2/
    )
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { sizeMm: 10, thicknessMm: 6 } })).toThrow(
      /a tenon's width must be at least twice its thickness/
    )
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { stock: 'steel' } })).toThrow(/jointOptions has no field "stock"/)
  })
})

describe('splitWithJoint — tenon degenerate cases', () => {
  it('a face with a hole through it: the search keeps clear of the hole, a hand-placed tenon over it is refused by name', () => {
    // A 300 × 60 × 20 mm bar with a 12 mm hole along X through the middle of the cut face.
    const hole = transforms.rotate([0, Math.PI / 2, 0], primitives.cylinder({ radius: 6, height: 400, segments: 32 }))
    const body = booleans.subtract(primitives.cuboid({ size: [300, 60, 20], center: [150, 0, 0] }), transforms.translate([150, 0, 0], hole))
    const result = splitWithJoint(body, { axis: 'x', offsetMm: 150, joint: 'tenon', clearanceMm: 0.2, names: ['Bar A', 'Bar B'] })
    const keys = keyNames(result)
    expect(keys.length).toBeGreaterThanOrEqual(1)
    const lumen = transforms.translate([150, 0, 0], hole)
    for (const name of keys) expect(overlap(result.parts[name], lumen), name).toBeLessThan(1e-6)
    expect(() =>
      splitWithJoint(body, { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements: [{ kind: 'tenon', uMm: 0, vMm: 0, sizeMm: 12, thicknessMm: 4 }] })
    ).toThrow(/placement 1 \(tenon at y = 0, z = 0 mm\) is not on solid material/)
  })

  it('zero clearance warns, and still builds', () => {
    expect(splitWarnings({ joint: 'tenon', clearanceMm: 0 }).join(' ')).toMatch(/Zero clearance/)
    const result = splitWithJoint(plank(), { axis: 'x', offsetMm: 150, joint: 'tenon', clearanceMm: 0, names: ['Plank A', 'Plank B'] })
    expect(keyNames(result).length).toBeGreaterThanOrEqual(1)
  })

  it('a cut too near an end has no room for a mortise in piece A: refused by name', () => {
    expect(() => splitWithJoint(bar(), { axis: 'x', offsetMm: 4, joint: 'tenon', clearanceMm: 0.2 })).toThrow(/no room for a tenon/)
  })

  it('MAX_PLACEMENTS holds for tenons', () => {
    const many = Array.from({ length: MAX_PLACEMENTS + 1 }, () => ({ kind: 'tenon' }))
    expect(() => splitWithJoint(plank(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements: many })).toThrow(
      new RegExp(`at most ${MAX_PLACEMENTS} connectors, got ${MAX_PLACEMENTS + 1}`)
    )
  })

  it('a later plane through a tenon is refused by the key’s name', () => {
    const first = splitWithJoint(plank(), { axis: 'x', offsetMm: 150, joint: 'tenon', clearanceMm: 0.2, names: ['Plank A', 'Plank B'] })
    expect(() =>
      splitWithJoint(first, { axis: 'x', offsetMm: 160, joint: 'tenon', clearanceMm: 0.2, names: ['Plank B', 'Plank C'] })
    ).toThrow(/the cut plane crosses Plank key \d+ — move it clear of the keys/)
  })

  it('multi-split: a second split keeps the first split’s tenons and numbers its own from the next free number', () => {
    const tenons = { joint: 'tenon', clearanceMm: 0.2 }
    const first = splitWithJoint(plank(), { axis: 'x', offsetMm: 100, ...tenons, names: ['Plank A', 'Plank B'] })
    const firstKeys = keyNames(first)
    const second = splitWithJoint(first, { axis: 'x', offsetMm: 200, ...tenons, names: ['Plank B', 'Plank C'] })
    const secondKeys = keyNames(second)
    expect(secondKeys.slice(0, firstKeys.length)).toEqual(firstKeys)
    const added = secondKeys.slice(firstKeys.length)
    expect(added.length).toBeGreaterThanOrEqual(1)
    expect(added).toEqual(added.map((_, index) => `Plank key ${firstKeys.length + index + 1}`))
    for (const name of added) expect(partMetaOf(second, name)).toMatchObject({ kind: 'tenon', joins: ['Plank B', 'Plank C'] })
  })

  it('hand-placed: a tenon where it fits, its sizes checked by name, and a searched one beside it', () => {
    const result = splitWithJoint(plank(), {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
      placements: [{ kind: 'tenon', uMm: -30, vMm: 5, sizeMm: 16, thicknessMm: 4 }, { kind: 'tenon' }],
    })
    const keys = keyNames(result)
    expect(keys.length).toBeGreaterThanOrEqual(2)
    expect(partMetaOf(result, keys[0])).toMatchObject({ kind: 'tenon', sizeMm: 16, thicknessMm: 4 })
    expect(() =>
      splitWithJoint(plank(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements: [{ kind: 'tenon', uMm: 0, vMm: 5, thicknessMm: 9 }] })
    ).toThrow(/placement 1 \(tenon\): thicknessMm must be 3 to 8 mm, got 9/)
    expect(() =>
      splitWithJoint(plank(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements: [{ kind: 'pins', uMm: 0, vMm: 5, thicknessMm: 4 }] })
    ).toThrow(/placement 1 \(pins\): thicknessMm is only for a tenon or a magnet/)
    expect(() =>
      splitWithJoint(plank(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, placements: [{ kind: 'tenon', uMm: 0, vMm: 1, sizeMm: 16, thicknessMm: 4 }] })
    ).toThrow(/placement 1 \(tenon at y = 0, z = 1 mm\): its mortise and 1.2 mm wall would break out of piece B/)
  })
})
