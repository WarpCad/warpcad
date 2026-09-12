import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import {
  add,
  addHole,
  align,
  axisApply,
  bisect,
  calcCenterWith,
  calcSnap,
  centroidOf,
  combine,
  createGroup,
  enlarge,
  fit,
  isGroup,
  pick,
  sizeOf,
  snap,
  toGeom3,
  translate,
} from './group.js'
import v1Reference from './__fixtures__/modify.v1-reference.json'

const { measurements, primitives } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./group.js').Group} Group */

/** A 10mm cube centred on the origin: bounds [-5,-5,-5] .. [5,5,5]. */
const big = () => primitives.cuboid({ size: [10, 10, 10] })
/** A 4mm cube centred on the origin: bounds [-2,-2,-2] .. [2,2,2]. */
const small = () => primitives.cuboid({ size: [4, 4, 4] })

/** @param {Geom3} geometry */
const boundsOf = (geometry) => measurements.measureBoundingBox(geometry)

describe('axisApply', () => {
  it('writes only the named axes and leaves the rest at zero', () => {
    expect(axisApply('z', () => 7)).toEqual([0, 0, 7])
    expect(axisApply('xy', (index) => index + 1)).toEqual([1, 2, 0])
  })

  it('passes both the index and the axis letter to the callback', () => {
    /** @type {[number, string][]} */
    const seen = []
    axisApply('xz', (index, axis) => {
      seen.push([index, axis])
      return 0
    })
    expect(seen).toEqual([
      [0, 'x'],
      [2, 'z'],
    ])
  })
})

describe('sizeOf / centroidOf', () => {
  it('reports size and centroid in millimetres', () => {
    const geometry = primitives.cuboid({ size: [10, 20, 30], center: [1, 2, 3] })
    expect(sizeOf(geometry)).toEqual([10, 20, 30])
    const centroid = centroidOf(geometry)
    expect(centroid[0]).toBeCloseTo(1, 9)
    expect(centroid[1]).toBeCloseTo(2, 9)
    expect(centroid[2]).toBeCloseTo(3, 9)
  })
})

describe('calcSnap', () => {
  // The six orientations and their [withSide, moveSide] bound indices come straight
  // from jscad-utils' own `util.flushSide` table (src/util.js) — see group.js.
  it.each([
    ['outside-', 7],
    ['outside+', -7],
    ['inside+', 3],
    ['inside-', -3],
    ['center+', -2],
    ['center-', 2],
  ])('resolves %s on z to a translation of %d mm', (orientation, expected) => {
    const vector = calcSnap(small(), big(), 'z', orientation)
    expect(vector[0]).toBe(0)
    expect(vector[1]).toBe(0)
    expect(vector[2]).toBeCloseTo(expected, 9)
  })

  it('adds a scalar delta on the snapped axes only', () => {
    const vector = calcSnap(small(), big(), 'z', 'outside-', 1.5)
    expect(vector).toEqual([0, 0, 8.5])
  })

  it('rejects an unknown orientation rather than silently returning zero', () => {
    expect(() => calcSnap(small(), big(), 'z', 'sideways')).toThrow(/sideways/)
  })
})

describe('calcCenterWith', () => {
  it('centres one solid on another along the named axes only', () => {
    const target = primitives.cuboid({ size: [2, 2, 2], center: [10, 20, 30] })
    expect(calcCenterWith(small(), 'xy', target)).toEqual([10, 20, 0])
  })

  it('accepts a vector delta', () => {
    const target = primitives.cuboid({ size: [2, 2, 2], center: [10, 0, 0] })
    expect(calcCenterWith(small(), 'x', target, [1, 0, 0])).toEqual([11, 0, 0])
  })
})

describe('createGroup / isGroup / add', () => {
  it('starts empty and is recognisable', () => {
    const group = createGroup('bolt')
    expect(isGroup(group)).toBe(true)
    expect(group.name).toBe('bolt')
    expect(group.names).toEqual([])
    expect(group.parts).toEqual({})
    expect(isGroup(big())).toBe(false)
    expect(isGroup(null)).toBe(false)
  })

  it('returns a new group rather than mutating the one passed in', () => {
    const empty = createGroup()
    const one = add(empty, big(), 'body')
    expect(one).not.toBe(empty)
    expect(empty.names).toEqual([])
    expect(one.names).toEqual(['body'])
    expect(Object.keys(one.parts)).toEqual(['body'])
  })

  it('keeps a hidden part addressable but out of the default combine list', () => {
    const group = add(add(createGroup(), big(), 'body'), small(), 'clearance', {
      hidden: true,
    })
    expect(group.names).toEqual(['body'])
    expect(Object.keys(group.parts)).toEqual(['body', 'clearance'])
  })

  it('flattens a nested group into a combined part plus prefixed subparts', () => {
    const inner = add(add(createGroup(), big(), 'head'), small(), 'shaft')
    const outer = add(createGroup(), inner, 'tap', { subpartPrefix: 'tap-' })
    expect(outer.names).toEqual(['tap'])
    expect(Object.keys(outer.parts)).toEqual(['tap', 'tap-head', 'tap-shaft'])
  })
})

describe('combine', () => {
  it('unions the default names when no pieces are named', () => {
    const group = add(
      add(createGroup(), primitives.cuboid({ size: [2, 2, 2], center: [-3, 0, 0] }), 'a'),
      primitives.cuboid({ size: [2, 2, 2], center: [3, 0, 0] }),
      'b'
    )
    expect(boundsOf(combine(group))).toEqual([
      [-4, -1, -1],
      [4, 1, 1],
    ])
  })

  it('unions only the pieces asked for', () => {
    const group = add(
      add(createGroup(), primitives.cuboid({ size: [2, 2, 2], center: [-3, 0, 0] }), 'a'),
      primitives.cuboid({ size: [2, 2, 2], center: [3, 0, 0] }),
      'b'
    )
    expect(boundsOf(combine(group, 'a'))).toEqual([
      [-4, -1, -1],
      [-2, 1, 1],
    ])
  })

  it('throws with a useful message when the group has nothing to combine', () => {
    expect(() => combine(createGroup('empty'))).toThrow(/empty/)
  })

  it('throws when a named piece does not exist', () => {
    const group = add(createGroup('bolt'), big(), 'body')
    expect(() => combine(group, 'nope')).toThrow(/nope/)
  })
})

describe('pick', () => {
  it('returns a new group holding only the named parts', () => {
    const group = add(add(createGroup(), big(), 'a'), small(), 'b')
    const picked = pick(group, 'b')
    expect(picked.names).toEqual(['b'])
    expect(Object.keys(picked.parts)).toEqual(['b'])
    // the source group is untouched
    expect(group.names).toEqual(['a', 'b'])
  })

  it('shares the underlying geometry values, which are immutable in V3', () => {
    const group = add(createGroup(), big(), 'a')
    expect(pick(group, 'a').parts.a).toBe(group.parts.a)
  })
})

describe('snap / align / translate', () => {
  it('moves every part of the group by the snap of one named part', () => {
    const group = add(add(createGroup(), small(), 'moving'), big(), 'passenger')
    const snapped = snap(group, 'moving', big(), 'z', 'outside-')
    expect(boundsOf(snapped.parts.moving)[0][2]).toBeCloseTo(5, 9)
    expect(boundsOf(snapped.parts.passenger)[0][2]).toBeCloseTo(2, 9)
    // original untouched
    expect(boundsOf(group.parts.moving)[0][2]).toBeCloseTo(-2, 9)
  })

  it('snaps against another group by combining it first', () => {
    const reference = add(createGroup(), big(), 'body')
    const group = add(createGroup(), small(), 'moving')
    expect(boundsOf(snap(group, 'moving', reference, 'z', 'outside-').parts.moving)[0][2]).toBeCloseTo(
      5,
      9
    )
  })

  it('aligns a group onto a reference centroid', () => {
    const reference = primitives.cuboid({ size: [2, 2, 2], center: [10, 0, 0] })
    const group = add(createGroup(), small(), 'moving')
    const centre = centroidOf(align(group, 'moving', reference, 'x').parts.moving)
    expect(centre[0]).toBeCloseTo(10, 9)
    expect(centre[2]).toBeCloseTo(0, 9)
  })

  it('translates every part, including hidden ones', () => {
    const group = add(add(createGroup(), big(), 'a'), small(), 'hidden', { hidden: true })
    const moved = translate(group, [0, 0, 5])
    expect(boundsOf(moved.parts.a)[0][2]).toBeCloseTo(0, 9)
    expect(boundsOf(moved.parts.hidden)[0][2]).toBeCloseTo(3, 9)
  })
})

describe('holes', () => {
  const shell = () =>
    add(createGroup('shell'), primitives.cuboid({ size: [10, 10, 10] }), 'body')
  const bore = () => primitives.cuboid({ size: [4, 4, 20] })

  it('subtracts holes from a default combine', () => {
    const withHole = addHole(shell(), bore())
    expect(measurements.measureVolume(combine(withHole))).toBeCloseTo(1000 - 4 * 4 * 10, 6)
  })

  it('leaves holes in place when noholes is set', () => {
    const withHole = addHole(shell(), bore())
    expect(measurements.measureVolume(combine(withHole, undefined, { noholes: true }))).toBeCloseTo(
      1000,
      6
    )
  })

  it('does not mutate the group it adds a hole to', () => {
    const original = shell()
    addHole(original, bore())
    expect(original.holes).toEqual([])
  })

  it('carries holes through translate', () => {
    const moved = translate(addHole(shell(), bore()), [0, 0, 100])
    expect(boundsOf(moved.holes[0])[0][2]).toBeCloseTo(90, 9)
  })
})

describe('toGeom3', () => {
  it('passes plain geometry through and combines a group', () => {
    const geometry = big()
    expect(toGeom3(geometry)).toBe(geometry)
    expect(boundsOf(toGeom3(add(createGroup(), geometry, 'a')))).toEqual(boundsOf(geometry))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TODO/core-019 — enlarge / fit / bisect, diffed against measured V1 output.
//
// Every case below that carries a `v1` label is checked against
// `__fixtures__/modify.v1-reference.json`, which `scripts/generate-v1-modify-fixture.cjs`
// records by running the *real* `jscad-utils@3.2.0` under Node — the same
// measure-don't-guess discipline `hardware.nut`/`hardware.washer` (core-010/core-011)
// already use. That mattered here: reading V1's source suggested `bisect`'s smaller
// half is the `positive` one, and running it proves the opposite (see `bisect`'s doc
// comment in group.js).
// ─────────────────────────────────────────────────────────────────────────────

/** Digits of agreement required against V1, matching the hardware recipe specs. */
const MM_TOLERANCE = 6
/** Boolean results carry more float noise than a pure transform; see bisect below. */
const MM_BOOLEAN_TOLERANCE = 6

/** The fixture's `brick`: size [10, 20, 30] centred at [1, 2, 3]. Asymmetric on purpose. */
const brick = () => primitives.cuboid({ size: [10, 20, 30], center: [1, 2, 3] })
/** The fixture's `cube`: V1's own bisect doc-comment example, 10mm on the origin. */
const cube = () => primitives.cuboid({ size: [10, 10, 10] })

/** @param {number[][]} bounds */
const sizeOfBounds = (bounds) => [
  bounds[1][0] - bounds[0][0],
  bounds[1][1] - bounds[0][1],
  bounds[1][2] - bounds[0][2],
]

/** @param {number[][]} bounds */
const centreOfBounds = (bounds) => [
  (bounds[0][0] + bounds[1][0]) / 2,
  (bounds[0][1] + bounds[1][1]) / 2,
  (bounds[0][2] + bounds[1][2]) / 2,
]

/**
 * Assert a V3 solid has V1's measured size and centre. Position is compared as the
 * bounding-box centre rather than raw min/max so a failure reads as "wrong size" or
 * "wrong place" instead of four correlated bound failures.
 *
 * @param {Geom3} actual
 * @param {{ bounds: number[][] }} expected A fixture entry's `input`/`result`/part.
 * @param {string} label
 * @param {number} [digits]
 */
function expectMatchesV1(actual, expected, label, digits = MM_TOLERANCE) {
  const actualBounds = boundsOf(actual)
  const expectedSize = sizeOfBounds(expected.bounds)
  const expectedCentre = centreOfBounds(expected.bounds)
  const actualSize = sizeOfBounds(actualBounds)
  const actualCentre = centreOfBounds(actualBounds)
  for (const axis of [0, 1, 2]) {
    expect(actualSize[axis], `${label} size[${axis}]`).toBeCloseTo(expectedSize[axis], digits)
    expect(actualCentre[axis], `${label} centre[${axis}]`).toBeCloseTo(expectedCentre[axis], digits)
  }
}

/**
 * A fixture `enlarge`/`fit` case's arguments, whether V1 took them spread or as an
 * array.
 *
 * @param {readonly any[]} args
 * @returns {[number, number, number]}
 */
const vectorArg = (args) => {
  const values = Array.isArray(args[0]) ? args[0] : args.slice(0, 3)
  return [values[0], values[1], values[2]]
}

/**
 * Narrow a `Geom3 | Group` result to a solid, so the measurement helpers above can
 * take it. `enlarge`/`fit` hand back whichever kind they were given.
 *
 * @param {Geom3 | Group} value
 * @returns {Geom3}
 */
const solid = (value) => toGeom3(value)

/**
 * Narrow a `Geom3 | Group` result to a group, failing the test rather than the
 * typecheck if it isn't one.
 *
 * @param {Geom3 | Group} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got a bare solid')
  return value
}

describe('enlarge', () => {
  const cases = v1Reference.enlarge.filter((entry) => !entry.label.startsWith('V1 silently'))

  it.each(cases)('matches V1: $label', (entry) => {
    expectMatchesV1(brick(), entry.input, 'input')
    expectMatchesV1(solid(enlarge(brick(), vectorArg(entry.args))), entry.result, entry.label)
  })

  it('grows each axis by its own absolute millimetre delta and holds the centroid', () => {
    const grown = enlarge(brick(), [2, 0, -4])
    expect(sizeOf(grown)[0]).toBeCloseTo(12, 9)
    expect(sizeOf(grown)[1]).toBeCloseTo(20, 9)
    expect(sizeOf(grown)[2]).toBeCloseTo(26, 9)
    const centroid = centroidOf(grown)
    expect(centroid[0]).toBeCloseTo(1, 9)
    expect(centroid[1]).toBeCloseTo(2, 9)
    expect(centroid[2]).toBeCloseTo(3, 9)
  })

  it('shrinks the same way a negative delta on every axis', () => {
    const shrunk = enlarge(brick(), [-2, -2, -2])
    expect(sizeOf(shrunk)).toEqual([8, 18, 28].map((n) => expect.closeTo(n, 9)))
    expect(centroidOf(shrunk)).toEqual([1, 2, 3].map((n) => expect.closeTo(n, 9)))
  })

  it('throws, naming the axis, where V1 silently inverted the solid', () => {
    // The measured V1 behaviour this diverges from: a -12mm delta on a 10mm axis
    // produced a *mirrored* 2mm-wide solid rather than an error (fixture case
    // "V1 silently inverts when a delta exceeds the axis size").
    const inverted = /** @type {(typeof v1Reference.enlarge)[number]} */ (
      v1Reference.enlarge.find((entry) => entry.label.startsWith('V1 silently'))
    )
    expect(sizeOfBounds(inverted.result.bounds)[0]).toBeCloseTo(2, 9)

    expect(() => enlarge(brick(), [-12, 0, 0])).toThrow(/enlarge: x/)
    // Exactly -size collapses rather than inverts; equally loud, same axis name.
    expect(() => enlarge(brick(), [0, -20, 0])).toThrow(/enlarge: y/)
    expect(() => enlarge(brick(), [0, 0, -30])).toThrow(/enlarge: z/)
  })

  it('rejects a delta that is not three finite millimetre values', () => {
    expect(() => enlarge(brick(), /** @type {any} */ ([1, 2]))).toThrow(/three finite/)
    expect(() => enlarge(brick(), [1, Number.NaN, 3])).toThrow(/three finite/)
  })

  it('keeps a group’s named parts, scaling each about the whole group’s centroid', () => {
    const pair = add(add(createGroup('pair'), small(), 'a'), big(), 'b')
    const grown = asGroup(enlarge(pair, [10, 10, 10]))
    expect(grown.names).toEqual(['a', 'b'])
    // The group as a whole grows by the delta...
    expect(sizeOf(grown)[0]).toBeCloseTo(20, 9)
    // ...and each part scales by that same factor (2x), rather than each part being
    // enlarged by 10mm on its own.
    expect(sizeOf(grown.parts.a)[0]).toBeCloseTo(8, 9)
    expect(sizeOf(grown.parts.b)[0]).toBeCloseTo(20, 9)
  })
})

describe('fit', () => {
  it.each(v1Reference.fit)('matches V1: $label', (entry) => {
    const keepAspectRatio = entry.args[3] === true
    expectMatchesV1(
      solid(fit(brick(), vectorArg(entry.args), keepAspectRatio)),
      entry.result,
      entry.label
    )
  })

  it('scales each axis to its own absolute target and stays on the original centroid', () => {
    const fitted = fit(brick(), [5, 10, 15])
    expect(sizeOf(fitted)).toEqual([5, 10, 15].map((n) => expect.closeTo(n, 9)))
    expect(centroidOf(fitted)).toEqual([1, 2, 3].map((n) => expect.closeTo(n, 9)))
  })

  it('applies one uniform factor — the smallest ratio — when keeping the aspect ratio', () => {
    // [10,20,30] against a [5,5,5] target: ratios 0.5 / 0.25 / 1/6, so the uniform
    // factor is 1/6. The claim is that all three axes move by the *same* factor, not
    // that they land on the target, so assert the factor rather than the sizes.
    const fitted = fit(brick(), [5, 5, 5], true)
    const size = sizeOf(fitted)
    const factors = [size[0] / 10, size[1] / 20, size[2] / 30]
    expect(factors[1]).toBeCloseTo(factors[0], 9)
    expect(factors[2]).toBeCloseTo(factors[0], 9)
    expect(factors[0]).toBeCloseTo(1 / 6, 9)
    // Independent scaling on the same input hits the target on all three instead.
    expect(sizeOf(fit(brick(), [5, 5, 5]))).toEqual([5, 5, 5].map((n) => expect.closeTo(n, 9)))
  })

  it('treats a zero target as V1’s do-not-scale-this-axis sentinel', () => {
    const fitted = fit(brick(), [5, 0, 15])
    expect(sizeOf(fitted)[1]).toBeCloseTo(20, 9)
    expect(sizeOf(fitted)[0]).toBeCloseTo(5, 9)
    expect(sizeOf(fitted)[2]).toBeCloseTo(15, 9)
  })

  it('rejects a negative target and a non-finite one, naming the axis', () => {
    expect(() => fit(brick(), [5, -10, 15])).toThrow(/fit: y/)
    expect(() => fit(brick(), /** @type {any} */ ([5, 10]))).toThrow(/three finite/)
  })

  it('keeps a group’s named parts', () => {
    const pair = add(add(createGroup('pair'), small(), 'a'), big(), 'b')
    const fitted = asGroup(fit(pair, [5, 5, 5]))
    expect(fitted.names).toEqual(['a', 'b'])
    expect(sizeOf(fitted)).toEqual([5, 5, 5].map((n) => expect.closeTo(n, 9)))
  })
})

describe('bisect', () => {
  /**
   * A fixture bisect case's offset, restoring the `-0` JSON cannot carry.
   *
   * @param {readonly any[]} args
   * @returns {number | undefined}
   */
  const offsetOf = (args) => (args[1] === '-0' ? -0 : args[1])

  it.each(v1Reference.bisect)('matches V1: $label', (entry) => {
    const halves = bisect(cube(), String(entry.args[0]), offsetOf(entry.args))
    expect(halves.names).toEqual(entry.names)
    const expectedParts = /** @type {Record<string, { bounds: number[][] }>} */ (entry.parts)
    for (const part of entry.names) {
      expectMatchesV1(halves.parts[part], expectedParts[part], part, MM_BOOLEAN_TOLERANCE)
    }
  })

  it("reproduces V1's own doc example, positive on the +axis side", () => {
    // V1's doc comment: "a 10mm cube with an offset of 2 will create a 2mm side and
    // an 8mm side". Measured V1 puts the 2mm side in `negative` — the half on the
    // axis's minimum side — and the 8mm side in `positive`.
    const halves = bisect(cube(), 'z', 2)
    expect(sizeOf(halves.parts.negative)[2]).toBeCloseTo(2, 6)
    expect(sizeOf(halves.parts.positive)[2]).toBeCloseTo(8, 6)
    expect(boundsOf(halves.parts.negative)[1][2]).toBeCloseTo(-3, 6)
    expect(boundsOf(halves.parts.positive)[0][2]).toBeCloseTo(-3, 6)
  })

  it('measures a negative offset from the larger side instead', () => {
    const halves = bisect(cube(), 'z', -2)
    expect(sizeOf(halves.parts.negative)[2]).toBeCloseTo(8, 6)
    expect(sizeOf(halves.parts.positive)[2]).toBeCloseTo(2, 6)
  })

  it('cuts at the centre when no offset is given', () => {
    const halves = bisect(cube(), 'z')
    expect(sizeOf(halves.parts.negative)[2]).toBeCloseTo(5, 6)
    expect(sizeOf(halves.parts.positive)[2]).toBeCloseTo(5, 6)
  })

  it('loses and duplicates nothing: the two halves add up to the original', () => {
    const original = measurements.measureVolume(cube())
    for (const offset of [2, -2, undefined, 4.5, -0.25]) {
      const halves = bisect(cube(), 'z', offset)
      const total =
        measurements.measureVolume(halves.parts.negative) +
        measurements.measureVolume(halves.parts.positive)
      expect(total, `offset ${offset}`).toBeCloseTo(original, 6)
    }
  })

  it('leaves one half empty when the cut plane misses the solid entirely', () => {
    const past = bisect(cube(), 'z', 20)
    expect(measurements.measureVolume(past.parts.positive)).toBeCloseTo(0, 9)
    expect(measurements.measureVolume(past.parts.negative)).toBeCloseTo(1000, 6)
    expect(sizeOf(past.parts.negative)).toEqual([10, 10, 10].map((n) => expect.closeTo(n, 6)))
  })

  it('cuts on any named axis and rejects anything else', () => {
    expect(sizeOf(bisect(cube(), 'x', 3).parts.negative)[0]).toBeCloseTo(3, 6)
    expect(sizeOf(bisect(cube(), 'y', 3).parts.negative)[1]).toBeCloseTo(3, 6)
    expect(() => bisect(cube(), 'w', 1)).toThrow(/bisect: unknown axis/)
    expect(() => bisect(cube(), 'z', Number.NaN)).toThrow(/finite/)
  })

  it('collapses a group to one solid before cutting it', () => {
    const pair = add(add(createGroup('pair'), small(), 'a'), big(), 'b')
    const halves = bisect(pair, 'z', 2)
    expect(halves.names).toEqual(['negative', 'positive'])
    expect(sizeOf(halves.parts.negative)[2]).toBeCloseTo(2, 6)
  })
})
