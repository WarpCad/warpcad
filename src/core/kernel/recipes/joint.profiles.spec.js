// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, partMetaOf, volumeOf } from '../group.js'
import { planJoint, previewSplitFace, splitWarnings, splitWithJoint } from '../split.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import {
  DOVETAIL_FLARE_DEG,
  DOVETAIL_MAX_HEIGHT_MM,
  DOVETAIL_MIN_HEIGHT_MM,
  DOVETAIL_MIN_NECK_MM,
  PROFILE_JOINTS,
  profileSizing,
} from './joint.profiles.js'

const { booleans, geometries, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/** A 300 × 120 × 10 mm plank along X, its minimum face at x = 0 — plate-like (10 ≤ 120 / 4). */
function plank() {
  return primitives.cuboid({ size: [300, 120, 10], center: [150, 0, 5] })
}

/** A 300 × 120 × 24 mm slab: plate-like, with room for a magnet or a dowel in half its thickness. */
function slab() {
  return primitives.cuboid({ size: [300, 120, 24], center: [150, 0, 12] })
}

/** A 300 × 20 × 20 mm bar — not plate-like. */
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

/** Boolean noise on an intersection of touching faces, mm³. */
const NOISE_MM3 = 1e-6

/** The half-space x ≥ 150 (piece B's side of the cut), as a big box. */
const beyondCut = () => primitives.cuboid({ size: [1000, 1000, 1000], center: [650, 0, 0] })

/** A box from per-axis ranges, written out here (shares nothing with the recipe). */
function handBox(/** @type {[number, number][]} */ ranges) {
  return primitives.cuboid({
    size: /** @type {[number, number, number]} */ (ranges.map(([a, b]) => b - a)),
    center: /** @type {[number, number, number]} */ (ranges.map(([a, b]) => (a + b) / 2)),
  })
}

/**
 * Translate `b` along `axis` in `step` mm steps up to `toMm` and return the first step that
 * collides with `a` (or `null` when none does).
 *
 * @param {Geom3} a
 * @param {Geom3} b
 * @param {[number, number, number]} direction Unit.
 * @param {number} toMm
 */
function firstCollision(a, b, direction, toMm, step = 0.5) {
  for (let along = 0; along <= toMm + 1e-9; along += step) {
    const moved = transforms.translate(/** @type {[number, number, number]} */ (direction.map((d) => d * along)), b)
    if (overlap(a, moved) > NOISE_MM3) return along
  }
  return null
}

/** Whether moving `b` by `mm` along `direction` collides with `a`. */
function collidesAfter(/** @type {Geom3} */ a, /** @type {Geom3} */ b, /** @type {[number, number, number]} */ direction, mm = 1) {
  return overlap(a, transforms.translate(/** @type {[number, number, number]} */ (direction.map((d) => d * mm)), b)) > NOISE_MM3
}

describe('seam profiles — the joint list and sizing (TODO/core-075 stage 4)', () => {
  it('four profiles, each a joint the op accepts', () => {
    expect([...PROFILE_JOINTS]).toEqual(['dovetail', 'puzzle', 'lap', 'finger'])
  })

  it('dovetail ranges: 3–8 mm proud, a neck of at least two walls, 15° flare per side', () => {
    expect([DOVETAIL_MIN_HEIGHT_MM, DOVETAIL_MAX_HEIGHT_MM, DOVETAIL_FLARE_DEG]).toEqual([3, 8, 15])
    expect(DOVETAIL_MIN_NECK_MM).toBeCloseTo(2.4, 12)
  })

  it('default sizes follow the TODO: lap 2t (at least 10 mm), finger depth 2t and an odd count near L / 3t', () => {
    const face = { lengthMm: 120, thicknessMm: 10 }
    expect(profileSizing('lap', face, 0.2, {}).lapMm).toBeCloseTo(20, 12)
    expect(profileSizing('lap', { lengthMm: 120, thicknessMm: 3 }, 0.2, {}).lapMm).toBeCloseTo(10, 12)
    const finger = profileSizing('finger', face, 0.2, {})
    expect(finger.depthMm).toBeCloseTo(20, 12)
    expect(finger.count % 2).toBe(1)
    expect(finger.count).toBe(5) // 120 / 30 = 4, the nearest odd above it
    const puzzle = profileSizing('puzzle', face, 0.2, {})
    expect(puzzle.headMm).toBeCloseTo(2 * puzzle.neckMm, 12)
  })
})

describe('half lap across a 300 × 120 × 10 mm plank', () => {
  const params = { axis: 'x', offsetMm: 150, joint: 'lap', clearanceMm: 0.2, names: ['Plank A', 'Plank B'] }

  it('A keeps the −z half for the lap past the cut, so it is longer than the offset by the lap', () => {
    const result = splitWithJoint(plank(), params)
    const [aMin, aMax] = boundsOf(result.parts['Plank A'])
    expect(aMin[0]).toBeCloseTo(0, 6)
    expect(aMax[0]).toBeCloseTo(170, 6)
    expect(boundsOf(result.parts['Plank B'])[0][0]).toBeCloseTo(150, 6)
    expect(partMetaOf(result, 'Plank A')).toMatchObject({ role: 'piece', seam: { kind: 'lap', along: 'z' } })
  })

  it('volume identity: A + B = uncut − gap, the gap computed by hand as grown − nominal', () => {
    const original = plank()
    const result = splitWithJoint(original, params)
    const [L, halfT, lap, c] = [120, 5, 20, 0.2]
    const gap = L * ((halfT + c) * (lap + c) - halfT * lap)
    const [a, b] = ['Plank A', 'Plank B'].map((name) => volumeOf(result.parts[name]))
    expect(relativeError(a + b, volumeOf(original) - gap)).toBeLessThan(1e-6)
  })

  it('no interference, goes together along z, and locates in two directions', () => {
    const result = splitWithJoint(plank(), params)
    const [a, b] = [result.parts['Plank A'], result.parts['Plank B']]
    expect(overlap(a, b)).toBeLessThan(NOISE_MM3)
    expect(firstCollision(a, b, [0, 0, 1], 6)).toBeNull()
    // Locates in two directions: pushed along −x both steps meet, and B rests on A's lap along −z.
    // Pulling apart along +x is free — a lap holds that with glue.
    expect(collidesAfter(a, b, [-1, 0, 0])).toBe(true)
    expect(collidesAfter(a, b, [0, 0, -1])).toBe(true)
    expect(collidesAfter(a, b, [1, 0, 0])).toBe(false)
  })

  it('both pieces are watertight', () => {
    const result = splitWithJoint(plank(), params)
    for (const name of ['Plank A', 'Plank B']) expect(openEdgesOf(makeWatertight(result.parts[name])).openEdges, name).toBe(0)
  })

  it('a lapMm from jointOptions is used; out of range is refused by name', () => {
    const result = splitWithJoint(plank(), { ...params, jointOptions: { lapMm: 30 } })
    expect(boundsOf(result.parts['Plank A'])[1][0]).toBeCloseTo(180, 6)
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { lapMm: 500 } })).toThrow(/jointOptions\.lapMm must be 2 to 200 mm, got 500/)
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { count: 3 } })).toThrow(/jointOptions has no field "count"/)
  })

  it('a section that is not plate-like is refused, with the reason', () => {
    expect(() => splitWithJoint(bar(), { ...params, names: ['Bar A', 'Bar B'] })).toThrow(
      /a half lap needs a plate-like section: the cut face is 20 mm thick and 20 mm long, and the thickness must be at most a quarter of the length/
    )
  })

  it('a cut too near B’s end for the lap is refused by name', () => {
    expect(() => splitWithJoint(plank(), { ...params, offsetMm: 285 })).toThrow(/a half lap needs piece B to run at least 21\.4 mm past the cut/)
  })
})

describe('half lap with magnets and dowels (the owner-allowed pairing)', () => {
  const lap = { axis: 'x', offsetMm: 150, joint: 'lap', clearanceMm: 0.2, names: ['Slab A', 'Slab B'] }

  it('a hand-placed magnet and a searched dowel sit in the half where A meets B, with nothing in the way', () => {
    const result = splitWithJoint(slab(), {
      ...lap,
      placements: [{ kind: 'magnet', uMm: -30, vMm: 18, sizeMm: 6, thicknessMm: 3 }, { kind: 'dowel' }],
    })
    const [a, b] = [result.parts['Slab A'], result.parts['Slab B']]
    expect(boundsOf(a)[1][0]).toBeCloseTo(150 + 48, 6) // lap = 2t = 48 mm
    const meta = /** @type {any} */ (partMetaOf(result, 'Slab A'))
    expect(meta.seam).toMatchObject({ kind: 'lap', along: 'x' })
    expect(meta.hardware.map((/** @type {any} */ item) => item.item)).toEqual(['magnet'])
    const keys = result.names.filter((name) => partMetaOf(result, name)?.role === 'key')
    expect(keys.length).toBeGreaterThanOrEqual(1)
    expect(overlap(a, b)).toBeLessThan(NOISE_MM3)
    for (const name of keys) {
      const dowel = result.parts[name]
      expect(boundsOf(dowel)[0][2], name).toBeGreaterThan(12) // in the +z half, where A meets B
      expect(overlap(dowel, a), `${name} ∩ A`).toBeLessThan(NOISE_MM3)
      expect(overlap(dowel, b), `${name} ∩ B`).toBeLessThan(NOISE_MM3)
    }
    // With connectors along the cut axis, B slides on along x.
    const seated = booleans.union(a, ...keys.map((name) => result.parts[name]))
    expect(firstCollision(seated, b, [1, 0, 0], 50, 2)).toBeNull()
  })

  it('a magnet in the half that is A’s own lap is refused by number, kind and position', () => {
    expect(() => splitWithJoint(slab(), { ...lap, placements: [{ kind: 'magnet', uMm: 0, vMm: 6, sizeMm: 6, thicknessMm: 3 }] })).toThrow(
      /placement 1 \(magnet at y = 0, z = 6 mm\)/
    )
  })

  it('only magnets and dowels pair with a half lap; the other profiles take no placements', () => {
    expect(() => splitWithJoint(slab(), { ...lap, placements: [{ kind: 'pins', uMm: 0, vMm: 18 }] })).toThrow(
      /placement 1 \(pins\): a half lap takes only magnets and dowels as extra connectors/
    )
    for (const joint of ['dovetail', 'puzzle', 'finger']) {
      expect(() => splitWithJoint(slab(), { ...lap, joint, placements: [{ kind: 'magnet' }] }), joint).toThrow(
        /shapes the whole seam, so it takes no placements — leave placements out, or choose Half lap to add magnets or dowels/
      )
    }
  })

  it('the face preview checks markers against the lapped pieces and reports the real piece bounds', () => {
    const preview = previewSplitFace(slab(), {
      axis: 'x',
      offsetMm: 150,
      clearanceMm: 0.2,
      profile: { joint: 'lap' },
      placements: [
        { kind: 'magnet', uMm: -30, vMm: 18, sizeMm: 6, thicknessMm: 3 },
        { kind: 'magnet', uMm: 30, vMm: 6, sizeMm: 6, thicknessMm: 3 },
      ],
    })
    expect(preview.verdicts[0].ok).toBe(true)
    expect(preview.verdicts[1].ok).toBe(false)
    expect(preview.profileError).toBe('')
    const bounds = /** @type {any} */ (preview.pieceBounds)
    expect(bounds[0][1][0]).toBeCloseTo(198, 6)
    expect(bounds[1][0][0]).toBeCloseTo(150, 6)
  })
})

describe('finger joint across the plank', () => {
  const params = { axis: 'x', offsetMm: 150, joint: 'finger', clearanceMm: 0.2, names: ['Plank A', 'Plank B'] }

  it('five fingers by default, A owning both ends, 20 mm deep; A is that much longer', () => {
    const result = splitWithJoint(plank(), params)
    expect(boundsOf(result.parts['Plank A'])[1][0]).toBeCloseTo(170, 6)
    expect(partMetaOf(result, 'Plank A')).toMatchObject({ seam: { kind: 'finger', along: 'z' } })
  })

  it('volume identity: the gap by hand — three A fingers, each end one grown on one side only', () => {
    const original = plank()
    const result = splitWithJoint(original, params)
    const [T, w, d, c] = [10, 24, 20, 0.2]
    // Grown widths inside the solid: 24 + 0.2 at each end, 24 + 0.4 in the middle.
    const gap = T * ((d + c) * (3 * w + 4 * c) - d * 3 * w)
    const [a, b] = ['Plank A', 'Plank B'].map((name) => volumeOf(result.parts[name]))
    expect(relativeError(a + b, volumeOf(original) - gap)).toBeLessThan(1e-6)
  })

  it('no interference, goes together through the thickness, and holds against shear along the seam', () => {
    const result = splitWithJoint(plank(), params)
    const [a, b] = [result.parts['Plank A'], result.parts['Plank B']]
    expect(overlap(a, b)).toBeLessThan(NOISE_MM3)
    expect(firstCollision(a, b, [0, 0, 1], 11)).toBeNull()
    expect(collidesAfter(a, b, [0, 1, 0])).toBe(true)
    expect(collidesAfter(a, b, [0, -1, 0])).toBe(true)
  })

  it('count and depth from jointOptions; fingers too narrow for their clearance are refused by name', () => {
    const result = splitWithJoint(plank(), { ...params, jointOptions: { count: 3, depthMm: 12 } })
    expect(boundsOf(result.parts['Plank A'])[1][0]).toBeCloseTo(162, 6)
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { count: 31 }, clearanceMm: 1 })).toThrow(
      /31 fingers across 120 mm are 3\.87 mm wide/
    )
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { count: 1 } })).toThrow(/jointOptions\.count must be a whole number from 2 to 31, got 1/)
  })

  it('works on a section that is not plate-like (a square bar), through its thickness', () => {
    const result = splitWithJoint(bar(), { ...params, names: ['Bar A', 'Bar B'] })
    expect(overlap(result.parts['Bar A'], result.parts['Bar B'])).toBeLessThan(NOISE_MM3)
  })
})

describe('sliding dovetail along a 300 × 20 × 20 mm bar', () => {
  const params = { axis: 'x', offsetMm: 150, joint: 'dovetail', clearanceMm: 0.2, names: ['Bar A', 'Bar B'] }
  const tan = Math.tan((15 * Math.PI) / 180)

  it('a rail the full length of the face, standing proud of A by its height', () => {
    const result = splitWithJoint(bar(), params)
    const plan = /** @type {any} */ (planJoint(bar(), params))
    const { heightMm } = plan.seam
    expect(heightMm).toBeGreaterThanOrEqual(3)
    expect(heightMm).toBeLessThanOrEqual(8)
    expect(boundsOf(result.parts['Bar A'])[1][0]).toBeCloseTo(150 + heightMm, 6)
    expect(partMetaOf(result, 'Bar A')).toMatchObject({ seam: { kind: 'dovetail', along: 'y' } })
  })

  it('volume identity: the gap from the 15° trapezoid, by hand', () => {
    const original = bar()
    const result = splitWithJoint(original, params)
    const { heightMm: h, neckMm: nw } = /** @type {any} */ (planJoint(original, params)).seam
    const c = 0.2
    const L = 20
    const grown = (h + c) * (nw + (2 * c) / Math.cos((15 * Math.PI) / 180)) + tan * (h + c) ** 2
    const nominal = h * nw + tan * h * h
    const gap = L * (grown - nominal)
    const [a, b] = ['Bar A', 'Bar B'].map((name) => volumeOf(result.parts[name]))
    expect(relativeError(a + b, volumeOf(original) - gap)).toBeLessThan(1e-6)
  })

  it('slides together along the rail, and locks on every other axis', () => {
    const result = splitWithJoint(bar(), params)
    const [a, b] = [result.parts['Bar A'], result.parts['Bar B']]
    expect(overlap(a, b)).toBeLessThan(NOISE_MM3)
    expect(firstCollision(a, b, [0, 1, 0], 21)).toBeNull()
    expect(collidesAfter(a, b, [1, 0, 0])).toBe(true)
    expect(collidesAfter(a, b, [0, 0, 1])).toBe(true)
    expect(collidesAfter(a, b, [0, 0, -1])).toBe(true)
  })

  it('a section too thin for the rail and its walls is refused, with the sizes', () => {
    const thin = primitives.cuboid({ size: [300, 120, 5], center: [150, 0, 2.5] })
    expect(() => splitWithJoint(thin, { ...params, names: ['Thin A', 'Thin B'] })).toThrow(
      /a sliding dovetail needs the section at least 6\.81 mm thick across the rail/
    )
  })

  it('height and neck from jointOptions, checked by name', () => {
    const result = splitWithJoint(bar(), { ...params, jointOptions: { heightMm: 4, sizeMm: 5 } })
    expect(boundsOf(result.parts['Bar A'])[1][0]).toBeCloseTo(154, 6)
    expect(() => splitWithJoint(bar(), { ...params, jointOptions: { heightMm: 9 } })).toThrow(/jointOptions\.heightMm must be 3 to 8 mm, got 9/)
    expect(() => splitWithJoint(bar(), { ...params, jointOptions: { sizeMm: 2 } })).toThrow(/jointOptions\.sizeMm must be 2\.4 to 30 mm, got 2/)
  })
})

describe('puzzle tabs across the plank', () => {
  const params = { axis: 'x', offsetMm: 150, joint: 'puzzle', clearanceMm: 0.2, names: ['Plank A', 'Plank B'] }

  /**
   * The tabs by hand, in the plank's frame: neck rectangles and 32-gon heads in (x, y), through z
   * (padded 1 mm past each face), from the seam's stated sizes.
   *
   * @param {{ count: number, neckMm: number, headMm: number, neckLengthMm: number }} seam
   * @param {number} grow The clearance to grow by (0 for nominal).
   */
  function handTabs(seam, grow) {
    const { count, neckMm, headMm, neckLengthMm } = seam
    const pitch = 120 / count
    const r = headMm / 2
    /** @type {Geom3[]} */
    const shapes = []
    for (let i = 0; i < count; i += 1) {
      const y = -60 + (i + 0.5) * pitch
      const cx = 150 + neckLengthMm + r
      shapes.push(handBox([[149.5 - grow, cx], [y - neckMm / 2 - grow, y + neckMm / 2 + grow], [-1 - grow, 11 + grow]]))
      // A regular 32-gon of circumradius r, grown square to each side by `grow`: apothem + grow.
      const rho = r + grow / Math.cos(Math.PI / 32)
      const corners = Array.from({ length: 32 }, (_, k) => [cx + rho * Math.cos((2 * Math.PI * k) / 32), y + rho * Math.sin((2 * Math.PI * k) / 32)])
      const bottom = corners.map(([x, yy]) => [x, yy, -1 - grow])
      const top = corners.map(([x, yy]) => [x, yy, 11 + grow])
      const faces = [[...bottom].reverse(), top]
      for (let k = 0; k < 32; k += 1) faces.push([bottom[k], bottom[(k + 1) % 32], top[(k + 1) % 32], top[k]])
      shapes.push(geometries.geom3.create(faces.map((vertices) => geometries.poly3.create(/** @type {any} */ (vertices)))))
    }
    return booleans.union(...shapes)
  }

  it('volume identity: the gap is the hand-built grown tabs minus the nominal ones, beyond the cut', () => {
    const original = plank()
    const result = splitWithJoint(original, params)
    const seam = /** @type {any} */ (partMetaOf(result, 'Plank A'))?.seam
    expect(seam).toMatchObject({ kind: 'puzzle', along: 'z' })
    const inB = (/** @type {Geom3} */ shape) => volumeOf(booleans.intersect(original, beyondCut(), shape))
    const gap = inB(handTabs(seam, 0.2)) - inB(handTabs(seam, 0))
    const [a, b] = ['Plank A', 'Plank B'].map((name) => volumeOf(result.parts[name]))
    expect(gap).toBeGreaterThan(0)
    expect(relativeError(a + b, volumeOf(original) - gap)).toBeLessThan(1e-6)
    expect(boundsOf(result.parts['Plank A'])[1][0]).toBeCloseTo(150 + seam.neckLengthMm + seam.headMm, 6)
  })

  it('no interference; drops together through the thickness; locks against pull-apart and shear', () => {
    const result = splitWithJoint(plank(), params)
    const [a, b] = [result.parts['Plank A'], result.parts['Plank B']]
    expect(overlap(a, b)).toBeLessThan(NOISE_MM3)
    expect(firstCollision(a, b, [0, 0, 1], 11)).toBeNull()
    expect(collidesAfter(a, b, [1, 0, 0])).toBe(true)
    expect(collidesAfter(a, b, [0, 1, 0])).toBe(true)
    expect(collidesAfter(a, b, [0, -1, 0])).toBe(true)
  })

  it('count and neck from jointOptions; tabs too crowded are refused with the sizes', () => {
    const result = splitWithJoint(plank(), { ...params, jointOptions: { count: 2, sizeMm: 6 } })
    expect(/** @type {any} */ (partMetaOf(result, 'Plank A'))?.seam).toMatchObject({ count: 2, neckMm: 6, headMm: 12 })
    expect(() => splitWithJoint(plank(), { ...params, jointOptions: { count: 8, sizeMm: 10 } })).toThrow(
      /8 puzzle tabs with a 10 mm neck need 22\.8 mm each along the seam, and there are 15 mm/
    )
  })

  it('a bar is not plate-like: refused with the reason', () => {
    expect(() => splitWithJoint(bar(), { ...params, names: ['Bar A', 'Bar B'] })).toThrow(/puzzle tabs need a plate-like section/)
  })
})

describe('seam profiles — shared rules', () => {
  it('zero clearance warns, and still builds every profile', () => {
    expect(splitWarnings({ joint: 'lap', clearanceMm: 0 }).join(' ')).toMatch(/Zero clearance/)
    for (const joint of PROFILE_JOINTS) {
      const body = joint === 'dovetail' ? bar() : plank()
      const result = splitWithJoint(body, { axis: 'x', offsetMm: 150, joint, clearanceMm: 0, names: ['P A', 'P B'] })
      expect(result.names, joint).toEqual(['P A', 'P B'])
    }
  })

  it('a profile makes no key parts and nothing to buy', () => {
    for (const joint of PROFILE_JOINTS) {
      const body = joint === 'dovetail' ? bar() : plank()
      const result = splitWithJoint(body, { axis: 'x', offsetMm: 150, joint, clearanceMm: 0.2, names: ['P A', 'P B'] })
      expect(result.names.filter((name) => partMetaOf(result, name)?.role === 'key'), joint).toEqual([])
      expect(/** @type {any} */ (partMetaOf(result, 'P A'))?.hardware, joint).toBeUndefined()
    }
  })

  it('the face preview reports a profile’s real piece bounds, or its refusal', () => {
    const preview = previewSplitFace(plank(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, profile: { joint: 'lap' } })
    expect(/** @type {any} */ (preview.pieceBounds)[0][1][0]).toBeCloseTo(170, 6)
    const refused = previewSplitFace(bar(), { axis: 'x', offsetMm: 150, clearanceMm: 0.2, profile: { joint: 'puzzle' } })
    expect(refused.pieceBounds).toBeNull()
    expect(refused.profileError).toMatch(/puzzle tabs need a plate-like section/)
  })
})
