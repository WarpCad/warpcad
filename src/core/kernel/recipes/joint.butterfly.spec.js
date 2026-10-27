// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, partMetaOf, volumeOf } from '../group.js'
import { planJoint, splitWarnings, splitWithJoint } from '../split.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { layFlat } from '../../printPrep.js'
import { contains, offsetOutline, offsetTrapezoid as commonOffsetTrapezoid, sectionOutline, trapezoidOutline } from './joint.common.js'
import { offsetTrapezoid as wedgeOffsetTrapezoid } from './joint.wedge.js'
import {
  BUTTERFLY_MAX_WIDTH_MM,
  BUTTERFLY_MIN_WIDTH_MM,
  BUTTERFLY_SIDES,
  bowtieOutline,
  butterflySideLabel,
  butterflySizing,
  describeButterfly,
  snapToOutline,
} from './joint.butterfly.js'

const { booleans, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/** A 300 × 120 × 10 mm plank along X, its minimum face at x = 0 — the docs' example plank. */
function plank(thicknessMm = 10) {
  return primitives.cuboid({ size: [300, 120, thicknessMm], center: [150, 0, thicknessMm / 2] })
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

/** Shoelace area of a polygon given as `[x, y]` corners. @param {[number, number][]} corners */
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
 * The nominal bowtie for waist `w`, written out by hand (shares nothing with the recipe):
 * ends 2w wide, 4w long across the seam, the waist w wide at the seam.
 *
 * @param {number} w
 * @returns {[number, number][]} `(along the cut axis, across)`, counter-clockwise.
 */
function handBowtie(w) {
  return [
    [-2 * w, -w],
    [0, -w / 2],
    [2 * w, -w],
    [2 * w, w],
    [0, w / 2],
    [-2 * w, w],
  ]
}

/**
 * A mitred offset written independently of the recipe: each edge's line moved out by `c`
 * along its outward normal, consecutive lines intersected.
 *
 * @param {[number, number][]} corners Counter-clockwise.
 * @param {number} c
 * @returns {[number, number][]}
 */
function handOffset(corners, c) {
  const n = corners.length
  const lines = corners.map((p, i) => {
    const q = corners[(i + 1) % n]
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const length = Math.hypot(dx, dy)
    const nx = dy / length
    const ny = -dx / length
    return { px: p[0] + nx * c, py: p[1] + ny * c, dx, dy }
  })
  return corners.map((_, i) => {
    const a = lines[(i + n - 1) % n]
    const b = lines[i]
    const det = a.dx * b.dy - a.dy * b.dx
    const t = ((b.px - a.px) * b.dy - (b.py - a.py) * b.dx) / det
    return /** @type {[number, number]} */ ([a.px + a.dx * t, a.py + a.dy * t])
  })
}

describe('butterfly sizing — a double-dovetail key (TODO/core-075 stage 2)', () => {
  it('waist w, ends 2w, 4w long across the seam, so each wing slopes 1 : 4', () => {
    const sizing = butterflySizing(9)
    expect(sizing.waistMm).toBeCloseTo(9, 12)
    expect(sizing.endMm).toBeCloseTo(18, 12)
    expect(sizing.lengthMm).toBeCloseTo(36, 12)
    // Each wing: half-width from w/2 to w over 2w along the seam — 1 : 4.
    expect((sizing.endMm / 2 - sizing.waistMm / 2) / (sizing.lengthMm / 2)).toBeCloseTo(1 / 4, 12)
    expect(BUTTERFLY_MIN_WIDTH_MM).toBe(3)
    expect(BUTTERFLY_MAX_WIDTH_MM).toBe(20)
    expect(BUTTERFLY_SIDES).toEqual(['u-', 'u+', 'v-', 'v+'])
  })

  it('the outline is the hand-written bowtie, and its grown copy is the mitred offset', () => {
    const w = 8
    const outline = bowtieOutline(w)
    expect(area(outline)).toBeCloseTo(area(handBowtie(w)), 9)
    expect(area(outline)).toBeCloseTo(6 * w * w, 9)
    const grown = bowtieOutline(w, 0.2)
    expect(area(grown)).toBeCloseTo(area(handOffset(handBowtie(w), 0.2)), 9)
    // The waist corners are reflex: growing moves them out by c·√(1 + 1/16), not c.
    const waistHalf = Math.max(...grown.filter(([along]) => Math.abs(along) < 1e-9).map(([, across]) => across))
    expect(waistHalf).toBeCloseTo(w / 2 + 0.2 * Math.hypot(1, 1 / 4), 9)
  })

  it('a key is described the way the Split sheet and assembly.txt say it: length × ends × depth', () => {
    const words = describeButterfly(9, 9)
    expect(words.keyLabel).toBe('Butterfly key 36 × 18 × 9 mm')
    expect(words.keySizeMm).toEqual([36, 18, 9])
  })

  it('names each side of the cut face the way a person does: an X cut has Front, Back, Bottom, Top', () => {
    expect(BUTTERFLY_SIDES.map((side) => butterflySideLabel(0, side))).toEqual(['Front', 'Back', 'Bottom', 'Top'])
    expect(BUTTERFLY_SIDES.map((side) => butterflySideLabel(1, side))).toEqual(['Bottom', 'Top', 'Left', 'Right'])
    expect(BUTTERFLY_SIDES.map((side) => butterflySideLabel(2, side))).toEqual(['Left', 'Right', 'Front', 'Back'])
  })
})

describe('the grown-pocket helper, lifted out of joint.wedge.js (unchanged output)', () => {
  it('joint.wedge.js still exports the same offsetTrapezoid', () => {
    expect(wedgeOffsetTrapezoid).toBe(commonOffsetTrapezoid)
    expect(wedgeOffsetTrapezoid({ wideMm: 10, narrowMm: 5, lengthMm: 30 }, 0.2)).toEqual(
      commonOffsetTrapezoid({ wideMm: 10, narrowMm: 5, lengthMm: 30 }, 0.2)
    )
  })

  it('offsetOutline on a trapezoid is offsetTrapezoid’s trapezoid', () => {
    const trapezoid = { wideMm: 10, narrowMm: 5, lengthMm: 30 }
    const byOutline = offsetOutline(trapezoidOutline(trapezoid, true), 0.3)
    const byTrapezoid = trapezoidOutline(commonOffsetTrapezoid(trapezoid, 0.3), true)
    byOutline.forEach(([u, v], index) => {
      expect(u).toBeCloseTo(byTrapezoid[index][0], 9)
      expect(v).toBeCloseTo(byTrapezoid[index][1], 9)
    })
  })
})

describe('sectionOutline — the cut face’s outline, for snapping and the key search', () => {
  it('a plank cut across X has four straight sides, each with its outward normal', () => {
    const { segments } = sectionOutline(plank(), 0, 150)
    expect(segments.length).toBeGreaterThanOrEqual(4)
    const top = segments.filter((segment) => segment.normal[1] > 0.99)
    expect(top.length).toBeGreaterThanOrEqual(1)
    for (const segment of top) {
      expect(segment.a[1]).toBeCloseTo(10, 9)
      expect(segment.b[1]).toBeCloseTo(10, 9)
    }
    const length = top.reduce((sum, segment) => sum + Math.abs(segment.b[0] - segment.a[0]), 0)
    expect(length).toBeCloseTo(120, 6)
  })

  it('snapToOutline puts a tap on the nearest edge and says which side that is', () => {
    const { segments } = sectionOutline(plank(), 0, 150)
    const flat = segments.flatMap((segment) => [...segment.a, ...segment.b, ...segment.normal])
    expect(snapToOutline(flat, 12.3, 8.5)).toEqual({ uMm: 12.3, vMm: 10, side: 'v+' })
    expect(snapToOutline(flat, -12, 1)).toEqual({ uMm: -12, vMm: 0, side: 'v-' })
    expect(snapToOutline(flat, 58, 5)).toEqual({ uMm: 60, vMm: 5, side: 'u+' })
    expect(snapToOutline([], 0, 0)).toBeNull()
  })
})

describe('splitWithJoint — butterfly keys across a 300 mm plank (the docs’ “Try it”)', () => {
  const params = {
    axis: 'x',
    offsetMm: 150,
    joint: 'butterfly',
    jointOptions: { side: 'v+', depthMm: 5 },
    clearanceMm: 0.2,
    names: ['Plank A', 'Plank B'],
  }

  it('two keys on the top face, one per ~50 mm of the 120 mm seam, named after the body', () => {
    const result = splitWithJoint(plank(), params)
    expect(result.names).toEqual(['Plank A', 'Plank B', 'Plank key 1', 'Plank key 2'])
    for (const name of keyNames(result)) {
      const meta = /** @type {any} */ (partMetaOf(result, name))
      expect(meta).toMatchObject({ role: 'key', kind: 'butterfly', joins: ['Plank A', 'Plank B'], axis: 'x' })
      // It prints on its floor: the face pointing into the part, down for a key on the top.
      expect(meta.bedNormal).toEqual([0, 0, -1])
      expect(meta.insert).toEqual([0, 0, -1])
      expect(meta.label).toMatch(/^Butterfly key \d+(\.\d+)? × \d+(\.\d+)? × 5 mm$/)
      // Inlaid: the key's top is flush with the plank's top, straddling the seam.
      const [min, max] = boundsOf(result.parts[name])
      expect(max[2]).toBeCloseTo(10, 6)
      expect(min[2]).toBeCloseTo(5, 6)
      expect(min[0]).toBeLessThan(150)
      expect(max[0]).toBeGreaterThan(150)
    }
    // Two identical keys share one shape, so Print pieces writes one file.
    const [one, two] = keyNames(result).map((name) => partMetaOf(result, name)?.shape)
    expect(one).toBe(two)
  })

  it('volume identity: A + B + keys = uncut − (pockets − keys), the gaps measured independently', () => {
    const original = plank()
    const plan = planJoint(original, params)
    const result = splitWithJoint(original, params)
    const keys = keyNames(result)
    expect(plan.connectors.length).toBe(keys.length)
    const c = 0.2
    const depth = 5
    const gaps = plan.connectors.reduce((sum, connector) => {
      const w = connector.sizeMm
      // The pocket is open above the top face, so inside the plank it is (depth + c) deep.
      return sum + area(handOffset(handBowtie(w), c)) * (depth + c) - area(handBowtie(w)) * depth
    }, 0)
    const keyVolume = keys.reduce((sum, name) => sum + volumeOf(result.parts[name]), 0)
    const [a, b] = ['Plank A', 'Plank B'].map((name) => volumeOf(result.parts[name]))
    expect(gaps).toBeGreaterThan(0)
    expect(relativeError(a + b + keyVolume, volumeOf(original) - gaps)).toBeLessThan(1e-6)
    // Each key is exactly the nominal bowtie, depth deep.
    for (const connector of plan.connectors) expect(connector.depthMm).toBeCloseTo(depth, 9)
    expect(relativeError(keyVolume, plan.connectors.reduce((sum, k) => sum + area(handBowtie(k.sizeMm)) * depth, 0))).toBeLessThan(1e-6)
  })

  it('no interference when assembled at 0.2 mm: A∩B, key∩A and key∩B are all empty', () => {
    const result = splitWithJoint(plank(), params)
    const [a, b] = [result.parts['Plank A'], result.parts['Plank B']]
    expect(overlap(a, b)).toBeLessThan(1e-6)
    for (const name of keyNames(result)) {
      expect(overlap(result.parts[name], a), `${name} ∩ A`).toBeLessThan(1e-6)
      expect(overlap(result.parts[name], b), `${name} ∩ B`).toBeLessThan(1e-6)
    }
  })

  it('goes together: each key lifts straight out of its pocket, and moving it any other way collides', () => {
    const result = splitWithJoint(plank(), params)
    const pieces = booleans.union(result.parts['Plank A'], result.parts['Plank B'])
    for (const name of keyNames(result)) {
      const key = result.parts[name]
      for (let step = 0; step <= 5 + 1; step += 0.5) {
        expect(overlap(transforms.translate([0, 0, step], key), pieces), `${name} lifted ${step} mm`).toBeLessThan(1e-6)
      }
      for (const move of /** @type {[number, number, number][]} */ ([[0.5, 0, 0], [-0.5, 0, 0], [0, 0.5, 0], [0, -0.5, 0], [0, 0, -0.5]])) {
        expect(overlap(transforms.translate(move, key), pieces), `${name} moved ${move}`).toBeGreaterThan(1e-3)
      }
    }
  })

  it('and holds: with the keys in, piece B cannot pull away from A along the cut axis', () => {
    const result = splitWithJoint(plank(), params)
    const seated = booleans.union(result.parts['Plank A'], ...keyNames(result).map((name) => result.parts[name]))
    // The wings slope 1 : 4, so 0.2 mm square to them is 0.2·√17 ≈ 0.82 mm of play along the
    // cut axis; past that, B is stopped by the keys.
    expect(overlap(transforms.translate([1, 0, 0], result.parts['Plank B']), seated)).toBeGreaterThan(1e-3)
    // Without the keys, A and B part freely: nothing printed onto either piece.
    expect(overlap(transforms.translate([1, 0, 0], result.parts['Plank B']), result.parts['Plank A'])).toBeLessThan(1e-6)
  })

  it('print orientation: layFlat on the key’s bed normal puts the bowtie (and its waist) in the XY plane', () => {
    const result = splitWithJoint(plank(), params)
    const name = keyNames(result)[0]
    const meta = /** @type {any} */ (partMetaOf(result, name))
    const { solid } = layFlat(result.parts[name], { bedNormal: meta.bedNormal })
    const [min, max] = boundsOf(solid)
    const size = [0, 1, 2].map((i) => max[i] - min[i])
    expect(min[2]).toBeCloseTo(0, 6)
    expect(size[2]).toBeCloseTo(5, 6)
    expect(Math.max(size[0], size[1])).toBeCloseTo(4 * meta.sizeMm, 6)
    expect(Math.min(size[0], size[1])).toBeCloseTo(2 * meta.sizeMm, 6)
  })

  it('the search picks the longest straight run when no side is given, and a count overrides ~50 mm', () => {
    const auto = splitWithJoint(plank(), { ...params, jointOptions: undefined })
    expect(keyNames(auto)).toHaveLength(2)
    const three = splitWithJoint(plank(), { ...params, jointOptions: { side: 'v-', count: 3, depthMm: 4 } })
    expect(keyNames(three)).toHaveLength(3)
    for (const name of keyNames(three)) {
      expect(partMetaOf(three, name)?.bedNormal).toEqual([0, 0, 1])
      expect(boundsOf(three.parts[name])[0][2]).toBeCloseTo(0, 6)
    }
  })

  it('a waist size from jointOptions is used as given, and out of range is refused by name', () => {
    const sized = splitWithJoint(plank(), { ...params, jointOptions: { side: 'v+', depthMm: 5, sizeMm: 6 } })
    for (const name of keyNames(sized)) expect(partMetaOf(sized, name)?.sizeMm).toBeCloseTo(6, 9)
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { sizeMm: 25 } })).toThrow(
      /jointOptions\.sizeMm must be 3 to 20 mm, got 25/
    )
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { side: 'top' } })).toThrow(
      /jointOptions\.side must be one of u-, u\+, v-, v\+, got "top"/
    )
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { stock: 'steel' } })).toThrow(/jointOptions has no field "stock"/)
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { through: true, depthMm: 5 } })).toThrow(
      /give jointOptions\.depthMm or through, not both/
    )
  })
})

describe('splitWithJoint — butterfly degenerate cases', () => {
  it('on a curved surface the key’s top follows the surface and it stays watertight', () => {
    const rod = transforms.rotateY(Math.PI / 2, primitives.cylinder({ radius: 20, height: 300, segments: 64 }))
    const placed = transforms.translate([150, 0, 0], rod)
    const result = splitWithJoint(placed, {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      names: ['Rod A', 'Rod B'],
      placements: [{ kind: 'butterfly', uMm: 0, vMm: 20, sizeMm: 6, depthMm: 6 }],
    })
    const [name] = keyNames(result)
    const key = result.parts[name]
    // Watertight as written: after the export's own repair of the boolean's T-junctions.
    expect(openEdgesOf(makeWatertight(key)).openEdges).toBe(0)
    expect(contains(placed, key)).toBe(true)
    const [min, max] = boundsOf(key)
    expect(max[2]).toBeLessThanOrEqual(20 + 1e-6)
    expect(max[2]).toBeGreaterThan(19.5)
    // Flat floor 6 mm below the surface at the key's centre line.
    expect(min[2]).toBeCloseTo(boundsOf(key)[1][2] - 6, 1)
    // The top is curved, so the key is less than a flat-topped bowtie prism of the same height.
    const flatTopped = 6 * 36 * (max[2] - min[2])
    expect(volumeOf(key)).toBeLessThan(flatTopped - 1)
    expect(partMetaOf(result, name)?.bedNormal).toEqual([0, 0, -1])
  })

  it('a pocket whose floor would break through is refused, unless the key goes through', () => {
    const thin = plank(4)
    expect(() =>
      splitWithJoint(thin, { axis: 'x', offsetMm: 150, joint: 'butterfly', jointOptions: { side: 'v+' }, clearanceMm: 0.2 })
    ).toThrow(/no room for a butterfly key.*floor.*through/)
    const through = splitWithJoint(thin, {
      axis: 'x',
      offsetMm: 150,
      joint: 'butterfly',
      jointOptions: { side: 'v+', through: true },
      clearanceMm: 0.2,
      names: ['Thin A', 'Thin B'],
    })
    for (const name of keyNames(through)) {
      const [min, max] = boundsOf(through.parts[name])
      expect(max[2] - min[2]).toBeCloseTo(4, 6)
    }
    expect(keyNames(through).length).toBeGreaterThanOrEqual(1)
  })

  it('a face with a hole through it: the search keeps clear of the hole, a hand-placed key over it is refused by name', () => {
    const hole = transforms.rotateY(Math.PI / 2, primitives.cylinder({ radius: 3, height: 400, segments: 32 }))
    const holed = booleans.subtract(plank(), transforms.translate([150, 0, 5], hole))
    const result = splitWithJoint(holed, {
      axis: 'x',
      offsetMm: 150,
      joint: 'butterfly',
      jointOptions: { side: 'v+', depthMm: 4 },
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
    })
    expect(keyNames(result)).toHaveLength(2)
    for (const name of keyNames(result)) {
      const [min, max] = boundsOf(result.parts[name])
      expect(min[1] > 3 || max[1] < -3, `${name} clear of the hole`).toBe(true)
    }
    expect(() =>
      splitWithJoint(holed, {
        axis: 'x',
        offsetMm: 150,
        clearanceMm: 0.2,
        placements: [{ kind: 'butterfly', uMm: 0, vMm: 10, depthMm: 5 }],
      })
    ).toThrow(/placement 1 \(butterfly at y = 0, z = 10 mm\).*floor/)
  })

  it('zero clearance warns, and still builds', () => {
    expect(splitWarnings({ joint: 'butterfly', clearanceMm: 0 })).toEqual([expect.stringMatching(/Zero clearance.*key/)])
    const result = splitWithJoint(plank(), {
      axis: 'x',
      offsetMm: 150,
      joint: 'butterfly',
      jointOptions: { side: 'v+', depthMm: 5 },
      clearanceMm: 0,
    })
    expect(keyNames(result)).toHaveLength(2)
  })

  it('a key too long for a piece is refused: a cut 4 mm from the end has no room for one', () => {
    expect(() =>
      splitWithJoint(plank(), { axis: 'x', offsetMm: 4, joint: 'butterfly', jointOptions: { side: 'v+' }, clearanceMm: 0.2 })
    ).toThrow(/no room for a butterfly key/)
  })

  it('hand-placed keys snap to their side from where they sit, and two that overlap are refused', () => {
    const one = splitWithJoint(plank(), {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      names: ['Plank A', 'Plank B'],
      placements: [
        { kind: 'butterfly', uMm: -30, vMm: 10, sizeMm: 8, depthMm: 5 },
        { kind: 'butterfly', uMm: 30, vMm: 0, sizeMm: 8, depthMm: 5 },
      ],
    })
    const [top, bottom] = keyNames(one)
    expect(partMetaOf(one, top)?.insert).toEqual([0, 0, -1])
    expect(partMetaOf(one, bottom)?.insert).toEqual([0, 0, 1])
    expect(() =>
      splitWithJoint(plank(), {
        axis: 'x',
        offsetMm: 150,
        clearanceMm: 0.2,
        placements: [
          { kind: 'butterfly', uMm: 0, vMm: 10, sizeMm: 8, depthMm: 5 },
          { kind: 'butterfly', uMm: 5, vMm: 10, sizeMm: 8, depthMm: 5 },
        ],
      })
    ).toThrow(/placement 2 \(butterfly.*overlaps placement 1/)
  })
})
