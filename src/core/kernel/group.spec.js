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
  localBoundsOf,
  mapGeometry,
  mirror,
  mirrorRotationDeg,
  pick,
  sizeOf,
  snap,
  toGeom3,
  translate,
} from './group.js'
import v1Reference from './__fixtures__/modify.v1-reference.json'

const { measurements, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./group.js').Group} Group */

/** A 10mm cube centred on the origin: bounds [-5,-5,-5] .. [5,5,5]. */
const big = () => primitives.cuboid({ size: [10, 10, 10] })
/** A 4mm cube centred on the origin: bounds [-2,-2,-2] .. [2,2,2]. */
const small = () => primitives.cuboid({ size: [4, 4, 4] })

/** @param {Geom3} geometry */
const boundsOf = (geometry) => measurements.measureBoundingBox(geometry)

/** @param {Geom3} geometry */
const volumeOf = (geometry) => measurements.measureVolume(geometry)

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

describe('mapGeometry (TODO/core-024)', () => {
  const lift = (/** @type {any} */ geometry) => transforms.translate([0, 0, 5], geometry)

  it('returns a solid for a solid and a group for a group', () => {
    expect(isGroup(mapGeometry(big(), lift))).toBe(false)
    expect(boundsOf(/** @type {any} */ (mapGeometry(big(), lift)))[0][2]).toBeCloseTo(0, 9)

    const group = add(add(createGroup('g'), big(), 'a'), small(), 'hidden', { hidden: true })
    const mapped = /** @type {any} */ (mapGeometry(group, lift))
    expect(isGroup(mapped)).toBe(true)
    // Names, hidden parts and the group's own label all survive — this is what
    // "a bolt you moved is still a bolt" means in practice.
    expect(mapped.name).toBe('g')
    expect(mapped.names).toEqual(['a'])
    expect(Object.keys(mapped.parts)).toEqual(['a', 'hidden'])
    expect(boundsOf(mapped.parts.hidden)[0][2]).toBeCloseTo(3, 9)
  })

  it('maps holes as well as parts, so a bore travels with its shell', () => {
    const withHole = addHole(add(createGroup(), big(), 'a'), small())
    const mapped = /** @type {any} */ (mapGeometry(withHole, lift))
    expect(mapped.holes).toHaveLength(1)
    expect(boundsOf(mapped.holes[0])[0][2]).toBeCloseTo(3, 9)
  })

  it('does not mutate what it was given', () => {
    const group = add(createGroup(), big(), 'a')
    mapGeometry(group, lift)
    expect(boundsOf(group.parts.a)[0][2]).toBeCloseTo(-5, 9)
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
/**
 * Which fixture-measured half a bisect fixture entry's own `parts.negative` /
 * `parts.positive` should be compared against, under this port's TODO/core-022
 * naming (`negative` always the minimum-side half, on every axis).
 *
 * The fixture is real, measured V1 output, labeled with *V1's own* naming — and V1
 * names the y-axis halves the opposite way round from x/z (TODO/core-021). This
 * port no longer reproduces that quirk, so for a `y`-axis case this port's
 * `negative` corresponds to the fixture's measured `positive` (V1's min-side half,
 * which V1 itself called `positive` on y alone), and vice versa. `x`/`z` fixture
 * entries need no swap — V1's naming already agrees with this port's on those axes.
 *
 * @param {string} axis
 * @param {Record<string, { bounds: number[][] }>} fixtureParts
 * @returns {Record<string, { bounds: number[][] }>}
 */
const expectedPartsFor = (axis, fixtureParts) =>
  axis === 'y'
    ? { negative: fixtureParts.positive, positive: fixtureParts.negative }
    : fixtureParts

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
    const axis = String(entry.args[0])
    const halves = bisect(cube(), axis, offsetOf(entry.args))
    expect(halves.names).toEqual(entry.names)
    const expectedParts = expectedPartsFor(
      axis,
      /** @type {Record<string, { bounds: number[][] }>} */ (entry.parts)
    )
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

  it('puts negative on the minimum side on every axis, with no per-axis exception (TODO/core-022)', () => {
    // TODO/core-021 measured that V1 itself names the y-axis halves the opposite way
    // round from x/z (V1's cut-plane basis is left-handed for y alone). TODO/core-022
    // is a deliberate, user-decided divergence from that V1 quirk, not a reversion of
    // core-021's own (correct) finding about what V1 does: this port's `negative`
    // always means the minimum-side half and `positive` the maximum-side half, on
    // every axis, with no per-axis exception. Asserted directly on the returned
    // group's own bounds, not merely inferred from size or from the fixture.
    const axisIndex = { x: 0, y: 1, z: 2 }
    for (const axis of /** @type {const} */ (['x', 'y', 'z'])) {
      const halves = bisect(cube(), axis, 3)
      const i = axisIndex[axis]
      const negativeBounds = boundsOf(halves.parts.negative)
      const positiveBounds = boundsOf(halves.parts.positive)
      expect(negativeBounds[1][i], `${axis}: negative's far bound stays <= positive's near bound`)
        .toBeLessThanOrEqual(positiveBounds[0][i] + 1e-6)
      expect(sizeOf(halves.parts.negative)[i], `${axis}: negative is the 3mm min-side piece`).toBeCloseTo(3, 6)
      expect(sizeOf(halves.parts.positive)[i], `${axis}: positive is the 7mm max-side piece`).toBeCloseTo(7, 6)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TODO/core-021 — the angled `angle`/`rotateaxis`/`rotateoffset` form of bisect.
//
// Same measure-don't-guess discipline as the straight form above, and for the same
// reason: three of this form's conventions (which way a positive angle tilts, whether
// an omitted `rotateoffset` means centre or zero, and which half stays `negative` once
// the plane is no longer axis-aligned) are settled only by running V1.
// ─────────────────────────────────────────────────────────────────────────────

describe('bisect, angled', () => {
  /**
   * Restore a fixture arg JSON could not carry: `-0` (stringified) and an omitted
   * middle argument (`null`). V1 treats `null` and `undefined` identically here —
   * `util.isEmpty` accepts both, and `rotateaxis || default` is falsy either way.
   *
   * @param {any} value
   * @returns {any}
   */
  const argOf = (value) => {
    if (value === '-0') return -0
    return value === null ? undefined : value
  }

  /**
   * The same 6 digits the straight form uses — measured, not assumed.
   *
   * core-021's own spec predicted the two extra rotations (forward to cut, back to
   * restore) would need a looser number than the straight cut's, and budgeted for
   * saying so. They don't: the worst bounds residual across all ten angled cases is
   * **4.5e-10 mm**, which is at the fixture's own rounding floor — it records to 9
   * decimal places — so the measurement cannot even resolve the error. `@jscad/modeling`
   * rotating an axis-aligned brick through a clean angle and back is very nearly exact,
   * and the boolean is doing the same work it does for a straight cut either way.
   * Left at 6 rather than tightened further, so this matches its straight-form
   * neighbour and does not become a tripwire for an unrelated float change.
   */
  const MM_ANGLED_TOLERANCE = 6

  const solidFor = (/** @type {string} */ name) => (name === 'brick' ? brick() : cube())

  it.each(v1Reference.bisectAngled)('matches V1: $label', (entry) => {
    const [axis, offset, angle, rotateAxis, rotateOffset] = entry.args.map(argOf)
    const halves = bisect(
      solidFor(entry.solid),
      String(axis),
      offset,
      angle,
      rotateAxis,
      rotateOffset
    )
    expect(halves.names).toEqual(entry.names)
    const expectedParts = expectedPartsFor(
      String(axis),
      /** @type {Record<string, { bounds: number[][] }>} */ (entry.parts)
    )
    for (const part of entry.names) {
      expectMatchesV1(halves.parts[part], expectedParts[part], part, MM_ANGLED_TOLERANCE)
    }
  })

  it('applies the default rotate axis per cut axis — x→y, y→x, z→x', () => {
    // The claim is that omitting `rotateAxis` *applies* the default rather than
    // merely being accepted, so each omission is compared against the same call with
    // the default named explicitly — and against the other two axes, to prove the
    // table is consulted rather than one axis being hardcoded.
    for (const [axis, expected] of /** @type {const} */ ([
      ['x', 'y'],
      ['y', 'x'],
      ['z', 'x'],
    ])) {
      const implicit = bisect(brick(), axis, 5, 25)
      const explicit = bisect(brick(), axis, 5, 25, expected)
      for (const part of ['negative', 'positive']) {
        expect(boundsOf(implicit.parts[part]), `${axis} default → ${expected}, ${part}`).toEqual(
          boundsOf(explicit.parts[part]).map((corner) =>
            corner.map((n) => expect.closeTo(n, MM_ANGLED_TOLERANCE))
          )
        )
      }
      // And a *different* tilt axis really does produce a different cut, so the
      // agreement above is not two calls that ignore the argument entirely. Compared
      // on bounds rather than volume, because volume cannot tell them apart: with the
      // hinge on the third axis's own centre the plane rises as far on one side as it
      // falls on the other, so *every* tilt axis removes the same 3000 mm³ here.
      const other = axis === 'z' ? 'y' : 'z'
      const otherBounds = boundsOf(bisect(brick(), axis, 5, 25, other).parts.negative)
      const implicitBounds = boundsOf(implicit.parts.negative)
      const differs = otherBounds.some((corner, c) =>
        corner.some((n, i) => Math.abs(n - implicitBounds[c][i]) > 0.5)
      )
      expect(differs, `${axis}: tilting about ${other} must differ from default ${expected}`).toBe(
        true
      )
    }
  })

  it('hinges an omitted rotateOffsetMm on the third axis centre, not on zero', () => {
    // Only an off-origin solid can tell those apart — on the origin-centred cube the
    // two answers coincide. The brick is centred at [1,2,3], size [10,20,30].
    const omitted = bisect(brick(), 'z', 8, 25, 'x')
    const atCentre = bisect(brick(), 'z', 8, 25, 'x', 20 / 2)
    const atZero = bisect(brick(), 'z', 8, 25, 'x', 0)
    expect(volumeOf(omitted.parts.negative)).toBeCloseTo(
      volumeOf(atCentre.parts.negative),
      MM_ANGLED_TOLERANCE
    )
    expect(volumeOf(omitted.parts.negative)).not.toBeCloseTo(volumeOf(atZero.parts.negative), 3)
    // A hinge on the third axis's own centre keeps the cut balanced: the plane rises
    // as far above the cut position on one side as it drops below it on the other, so
    // the tilt removes exactly as much as it adds and the halves match a straight cut.
    expect(volumeOf(omitted.parts.negative)).toBeCloseTo(
      volumeOf(bisect(brick(), 'z', 8).parts.negative),
      MM_ANGLED_TOLERANCE
    )
  })

  it('measures a negative rotateOffsetMm from the third axis max face, like offsetMm', () => {
    // Same `getDelta` convention V1 reuses for both parameters — see `bisect`'s doc
    // comment. Note which axis that is: cutting on y and tilting about z leaves **x**
    // as the third axis, and the brick's x runs −4..6, so −3 means x = 3, which is
    // also 10 − 3 = 7 measured forward from the minimum face.
    const negative = bisect(brick(), 'y', 6, 20, 'z', -3)
    const fromMin = bisect(brick(), 'y', 6, 20, 'z', 10 - 3)
    expect(volumeOf(negative.parts.negative)).toBeCloseTo(
      volumeOf(fromMin.parts.negative),
      MM_ANGLED_TOLERANCE
    )
  })

  it('short-circuits a falsy angle to the straight cut, bit for bit', () => {
    // Not "rotates by zero degrees and back" — that would push float noise into every
    // ordinary straight-cut caller. The claim is exact equality, not closeness, which
    // is the only assertion that can tell a real short-circuit from a no-op rotation.
    const straight = bisect(brick(), 'x', 4)
    for (const angle of [undefined, null, 0, -0]) {
      const same = bisect(brick(), 'x', 4, /** @type {any} */ (angle))
      for (const part of ['negative', 'positive']) {
        expect(boundsOf(same.parts[part]), `angle ${String(angle)}, ${part}`).toEqual(
          boundsOf(straight.parts[part])
        )
        expect(volumeOf(same.parts[part]), `angle ${String(angle)}, ${part}`).toBe(
          volumeOf(straight.parts[part])
        )
      }
    }
  })

  it('conserves volume across the tilted cut', () => {
    for (const [axis, angle, tilt] of /** @type {const} */ ([
      ['x', 120, 'z'],
      ['y', 30, 'x'],
      ['z', 25, 'y'],
      ['z', -40, 'x'],
    ])) {
      const halves = bisect(brick(), axis, 5, angle, tilt)
      const total = volumeOf(halves.parts.negative) + volumeOf(halves.parts.positive)
      expect(total, `${axis} @ ${angle}° about ${tilt}`).toBeCloseTo(6000, 4)
    }
  })

  it('throws when the tilt axis is the cut axis, naming both', () => {
    // V1's own sorted-pair lookup would hand back `undefined` here — `"xx"` is not a
    // key of `{xy:'z', yz:'x', xz:'y'}` — and carry on with a `NaN` rotation centre
    // rather than erroring. This port refuses by name instead.
    expect(() => bisect(cube(), 'x', 2, 30, 'x')).toThrow(/bisect: rotateAxis/)
    expect(() => bisect(cube(), 'x', 2, 30, 'x')).toThrow(/x/)
    expect(() => bisect(cube(), 'z', 2, 30, 'z')).toThrow(/bisect: rotateAxis/)
    expect(() => bisect(cube(), 'z', 2, 30, 'w')).toThrow(/bisect: unknown rotateAxis/)
    expect(() => bisect(cube(), 'z', 2, Number.NaN)).toThrow(/finite/)
    expect(() => bisect(cube(), 'z', 2, 30, 'x', Number.NaN)).toThrow(/finite/)
  })

  it('tilts the cut visibly rather than accepting the angle and ignoring it', () => {
    // The cheapest possible guard against a silently-dropped parameter: a straight z
    // cut at the centre of the brick leaves a flat-topped 10x20x15 negative half,
    // while a 25° tilt about x hinged off the y min face leaves one that reaches
    // higher — same volume-conservation, different shape.
    const straight = bisect(brick(), 'z', 15)
    const tilted = bisect(brick(), 'z', 15, 25, 'x', 0)
    expect(boundsOf(straight.parts.negative)[1][2]).toBeCloseTo(3, 6)
    expect(boundsOf(tilted.parts.negative)[1][2]).toBeGreaterThan(
      boundsOf(straight.parts.negative)[1][2] + 1
    )
    // ...and the tilt is the real trigonometric one, not an arbitrary shove: the
    // plane climbs `tan(25°)` per millimetre along y, over the brick's 20 mm.
    expect(boundsOf(tilted.parts.negative)[1][2]).toBeCloseTo(
      3 + 20 * Math.tan((25 * Math.PI) / 180),
      MM_ANGLED_TOLERANCE
    )
  })

  it('collapses a group before cutting it, and still returns the two V1 names', () => {
    const pair = add(add(createGroup('pair'), small(), 'a'), big(), 'b')
    const halves = bisect(pair, 'z', 2, 15)
    expect(halves.names).toEqual(['negative', 'positive'])
    expect(volumeOf(halves.parts.negative) + volumeOf(halves.parts.positive)).toBeCloseTo(
      volumeOf(toGeom3(pair)),
      4
    )
  })
})

describe('part colour, carried alongside hidden (TODO/core-026)', () => {
  const GRAY = 0x808080
  const RED = 0xff0000

  it('starts with no colours', () => {
    expect(createGroup().colors).toEqual({})
  })

  it("add() records a part's colour, defaulting its alpha to 1", () => {
    const group = add(createGroup(), big(), 'washer', { color: GRAY })
    expect(group.colors).toEqual({ washer: { color: GRAY, alpha: 1 } })
  })

  it('add() carries an explicit alpha', () => {
    const group = add(createGroup(), big(), 'mb', { color: 0x008000, colorAlpha: 0.75 })
    expect(group.colors.mb).toEqual({ color: 0x008000, alpha: 0.75 })
  })

  it('add() colours a hidden part too — hidden and colour are independent', () => {
    const group = add(add(createGroup(), big(), 'washer', { color: GRAY }), small(), 'clearance', {
      hidden: true,
      color: RED,
    })
    expect(group.names).toEqual(['washer'])
    expect(group.colors).toEqual({
      washer: { color: GRAY, alpha: 1 },
      clearance: { color: RED, alpha: 1 },
    })
  })

  it('add() leaves an uncoloured part out of the map rather than inventing a colour', () => {
    const group = add(add(createGroup(), big(), 'washer', { color: GRAY }), small(), 'plain')
    expect(Object.keys(group.colors)).toEqual(['washer'])
  })

  it('re-adding a part under the same name without a colour drops its old colour', () => {
    const group = add(add(createGroup(), big(), 'body', { color: GRAY }), small(), 'body')
    expect(group.colors).toEqual({})
  })

  it('add() does not mutate the colours of the group passed in', () => {
    const empty = createGroup()
    add(empty, big(), 'washer', { color: GRAY })
    expect(empty.colors).toEqual({})
  })

  it("flattening a group copies each subpart's colour under the prefix", () => {
    const inner = add(add(createGroup(), big(), 'head', { color: RED }), small(), 'thread', {
      color: RED,
    })
    const outer = add(createGroup(), inner, 'tap', { subpartPrefix: 'tap-', color: RED })
    expect(outer.colors).toEqual({
      tap: { color: RED, alpha: 1 },
      'tap-head': { color: RED, alpha: 1 },
      'tap-thread': { color: RED, alpha: 1 },
    })
  })

  it('rejects a colour that is not a 24-bit integer, naming the part', () => {
    expect(() => add(createGroup(), big(), 'washer', { color: -1 })).toThrow(/washer/)
    expect(() => add(createGroup(), big(), 'washer', { color: 1.5 })).toThrow(/colour/)
  })

  it('rejects an alpha with no colour to apply it to', () => {
    expect(() => add(createGroup(), big(), 'washer', { colorAlpha: 0.5 })).toThrow(
      /colorAlpha.*without a color/
    )
  })

  /** A two-part coloured group plus a hole, for the carry-through checks below. */
  const coloured = () =>
    addHole(
      add(add(createGroup('w'), big(), 'washer', { color: GRAY }), small(), 'clearance', {
        hidden: true,
        color: RED,
        colorAlpha: 0.5,
      }),
      primitives.cuboid({ size: [1, 1, 1] })
    )
  const expected = { washer: { color: GRAY, alpha: 1 }, clearance: { color: RED, alpha: 0.5 } }

  it('addHole keeps the colours', () => {
    expect(coloured().colors).toEqual(expected)
  })

  it('translate / snap / align keep the colours', () => {
    expect(translate(coloured(), [1, 2, 3]).colors).toEqual(expected)
    expect(snap(coloured(), 'washer', big(), 'z', 'outside-').colors).toEqual(expected)
    expect(align(coloured(), 'washer', big(), 'xy').colors).toEqual(expected)
  })

  it('mapGeometry keeps the colours', () => {
    const moved = mapGeometry(coloured(), (geometry) => transforms.translate([0, 0, 5], geometry))
    expect(isGroup(moved) && moved.colors).toEqual(expected)
  })

  it('enlarge / fit keep the colours', () => {
    const grown = enlarge(coloured(), [1, 1, 1])
    const fitted = fit(coloured(), [20, 20, 20])
    expect(isGroup(grown) && grown.colors).toEqual(expected)
    expect(isGroup(fitted) && fitted.colors).toEqual(expected)
  })

  it('pick keeps only the picked parts’ colours', () => {
    expect(pick(coloured(), 'clearance').colors).toEqual({ clearance: expected.clearance })
  })

  it('bisect starts a fresh, uncoloured group: its halves are new solids', () => {
    expect(bisect(coloured(), 'z').colors).toEqual({})
  })

  it('mirror keeps the colours: a reflected washer is still grey', () => {
    const reflected = mirror(coloured(), 'x')
    expect(isGroup(reflected) && reflected.colors).toEqual(expected)
  })
})

describe('mirror (TODO/core-028)', () => {
  /** @type {readonly ('x' | 'y' | 'z')[]} */
  const AXES = ['x', 'y', 'z']
  const INDEX = { x: 0, y: 1, z: 2 }

  /**
   * An asymmetric solid: a 10 mm cube at `centre` with a 2 mm nub stuck to its `+axis`
   * face. Asymmetric on purpose — mirroring anything about its own bounding-box centre
   * leaves that bounding box exactly where it was *by construction*, so a symmetric
   * body (or a bounds-only assertion) could not tell a reflection from a no-op. The
   * centre of mass can: the nub leaves it off the box's centre plane, and a real
   * reflection moves it to the other side of that plane.
   *
   * @param {'x' | 'y' | 'z'} axis
   * @param {[number, number, number]} [centre]
   */
  const nubbed = (axis, centre = [20, 30, 40]) => {
    /** @type {[number, number, number]} */
    const nubCentre = [centre[0], centre[1], centre[2]]
    nubCentre[INDEX[axis]] += 6
    return modeling.booleans.union(
      primitives.cuboid({ size: [10, 10, 10], center: centre }),
      primitives.cuboid({ size: [2, 2, 2], center: nubCentre })
    )
  }

  /** @param {Geom3} geometry */
  const comOf = (geometry) => measurements.measureCenterOfMass(geometry)

  for (const axis of AXES) {
    it(`reflects across the ${axis} plane through the body's own centre by default`, () => {
      const i = INDEX[axis]
      const body = nubbed(axis)
      const reflected = /** @type {Geom3} */ (mirror(body, axis))
      const centre = centroidOf(body)

      // About its own centre, the bounding box cannot move — only what is inside it.
      const before = boundsOf(body)
      const after = boundsOf(reflected)
      for (let k = 0; k < 3; k += 1) {
        expect(after[0][k]).toBeCloseTo(before[0][k], 9)
        expect(after[1][k]).toBeCloseTo(before[1][k], 9)
      }
      // The nub side flips: the centre of mass is reflected across the plane
      // `axis = centre[i]`, and the two other coordinates are untouched.
      const comBefore = comOf(body)
      const comAfter = comOf(reflected)
      // Off the plane (the nub widens the box more than it shifts the mass), so a
      // reflection is observable at all.
      expect(Math.abs(comBefore[i] - centre[i])).toBeGreaterThan(0.5)
      expect(comAfter[i]).toBeCloseTo(2 * centre[i] - comBefore[i], 6)
      for (let k = 0; k < 3; k += 1) {
        if (k !== i) expect(comAfter[k]).toBeCloseTo(comBefore[k], 6)
      }
    })
  }

  it('produces a real solid, not an inside-out one: volume is preserved and positive', () => {
    // A reflection reverses orientation; if polygon winding were not flipped with it,
    // the result would measure a *negative* volume and render inside out.
    for (const axis of AXES) {
      const body = nubbed(axis)
      const reflected = /** @type {Geom3} */ (mirror(body, axis))
      expect(volumeOf(reflected)).toBeGreaterThan(0)
      expect(volumeOf(reflected)).toBeCloseTo(volumeOf(body), 6)
    }
  })

  it('reflects about an explicit off-centre point: a body 20 mm out lands 20 mm out the other way', () => {
    const body = primitives.cuboid({ size: [4, 4, 4], center: [20, 0, 0] })
    const reflected = /** @type {Geom3} */ (mirror(body, 'x', [0, 0, 0]))
    const [min, max] = boundsOf(reflected)
    expect(min[0]).toBeCloseTo(-22, 9)
    expect(max[0]).toBeCloseTo(-18, 9)
    expect(min[1]).toBeCloseTo(-2, 9)
    expect(max[2]).toBeCloseTo(2, 9)

    // And about a point that is neither the origin nor the body's centre: x = 5.
    const [min5, max5] = boundsOf(/** @type {Geom3} */ (mirror(body, 'x', [5, 99, -99])))
    expect(min5[0]).toBeCloseTo(-12, 9)
    expect(max5[0]).toBeCloseTo(-8, 9)
    // Only the mirrored axis's coordinate of the point matters.
    expect(min5[1]).toBeCloseTo(-2, 9)
    expect(min5[2]).toBeCloseTo(-2, 9)
  })

  it("matches @jscad/modeling's own mirrorX/Y/Z — and so V1's mirroredX/Y/Z — about the origin", () => {
    // V1's `CSG.mirroredY()` (`@jscad/csg`'s mutators.js) and V3's `mirrorY` both
    // reflect across the world plane *through the origin*; `pointMm = [0,0,0]` is
    // that exact call, so the polygons must agree vertex for vertex.
    const library = { x: transforms.mirrorX, y: transforms.mirrorY, z: transforms.mirrorZ }
    for (const axis of AXES) {
      const body = nubbed(axis, [7, -3, 11])
      const ours = modeling.geometries.geom3.toPolygons(
        /** @type {Geom3} */ (mirror(body, axis, [0, 0, 0]))
      )
      const theirs = modeling.geometries.geom3.toPolygons(library[axis](body))
      expect(ours.length).toBe(theirs.length)
      ours.forEach((polygon, p) => {
        polygon.vertices.forEach((vertex, v) => {
          for (let k = 0; k < 3; k += 1) expect(vertex[k]).toBeCloseTo(theirs[p].vertices[v][k], 9)
        })
      })
    }
  })

  it('is its own inverse: mirroring twice about the same plane gives the original back', () => {
    const body = nubbed('y')
    const twice = /** @type {Geom3} */ (mirror(mirror(body, 'y', [0, 13, 0]), 'y', [0, 13, 0]))
    const a = comOf(body)
    const b = comOf(twice)
    for (let k = 0; k < 3; k += 1) expect(b[k]).toBeCloseTo(a[k], 6)
  })

  it('is pure: the solid passed in is not changed, and a new value comes back', () => {
    // The kernel-level half of this task's whole point: mirror *adds* a body, so the
    // original must survive the call bit for bit.
    const body = nubbed('z')
    const snapshot = JSON.stringify(modeling.geometries.geom3.toPolygons(body))
    const reflected = mirror(body, 'z', [0, 0, 0])
    expect(reflected).not.toBe(body)
    expect(JSON.stringify(modeling.geometries.geom3.toPolygons(body))).toBe(snapshot)
  })

  it('reflects a group as one body about the group centre, keeping every named part and hole', () => {
    // Head at +x, thread at -x: about the group's centre (x = 0) the two swap sides.
    // Each part reflecting about its *own* centre would leave both where they were.
    const group = addHole(
      add(
        add(
          createGroup('bolt'),
          primitives.cuboid({ size: [2, 2, 2], center: [10, 0, 0] }),
          'head'
        ),
        primitives.cuboid({ size: [2, 2, 2], center: [-10, 0, 0] }),
        'thread'
      ),
      primitives.cuboid({ size: [1, 1, 1], center: [4, 0, 0] })
    )
    const partsBefore = { ...group.parts }
    const reflected = mirror(group, 'x')
    if (!isGroup(reflected)) throw new Error('a group in must be a group out')
    expect(reflected.names).toEqual(['head', 'thread'])
    expect(boundsOf(reflected.parts.head)[0][0]).toBeCloseTo(-11, 9)
    expect(boundsOf(reflected.parts.thread)[0][0]).toBeCloseTo(9, 9)
    expect(boundsOf(reflected.holes[0])[0][0]).toBeCloseTo(-4.5, 9)
    // The group handed in is untouched.
    expect(group.parts).toEqual(partsBefore)
    expect(boundsOf(group.parts.head)[0][0]).toBeCloseTo(9, 9)
  })

  it('keeps a hidden part hidden', () => {
    const group = add(add(createGroup('w'), big(), 'washer'), small(), 'clearance', { hidden: true })
    const reflected = mirror(group, 'z', [0, 0, 100])
    if (!isGroup(reflected)) throw new Error('a group in must be a group out')
    expect(reflected.names).toEqual(['washer'])
    expect(Object.keys(reflected.parts).sort()).toEqual(['clearance', 'washer'])
  })

  it('degenerate: an empty group comes back as an empty group rather than throwing', () => {
    const reflected = mirror(createGroup('nothing'), 'y')
    expect(isGroup(reflected)).toBe(true)
    if (!isGroup(reflected)) return
    expect(reflected.names).toEqual([])
    expect(reflected.parts).toEqual({})
    expect(reflected.holes).toEqual([])
  })

  it('degenerate: an empty solid comes back empty', () => {
    const reflected = /** @type {Geom3} */ (mirror(modeling.geometries.geom3.create(), 'x'))
    expect(modeling.geometries.geom3.toPolygons(reflected)).toHaveLength(0)
  })

  it('rejects an axis it does not know, naming it, rather than silently reflecting across z', () => {
    // `@jscad/modeling`'s own default normal is z — the silent failure to avoid.
    expect(() => mirror(big(), /** @type {any} */ ('w'))).toThrow(/mirror: axis.*"w"/)
    expect(() => mirror(big(), /** @type {any} */ (undefined))).toThrow(/mirror: axis/)
  })

  it('rejects a point that is not three finite millimetre values', () => {
    expect(() => mirror(big(), 'x', /** @type {any} */ ([0, Number.NaN, 0]))).toThrow(/mirror/)
    expect(() => mirror(big(), 'x', /** @type {any} */ ([0, 0]))).toThrow(/mirror/)
  })
})

describe('mirrorRotationDeg (TODO/core-028)', () => {
  it('negates the two angles about the axes that are not the mirror normal', () => {
    expect(mirrorRotationDeg([10, 20, 30], 'x')).toEqual([10, -20, -30])
    expect(mirrorRotationDeg([10, 20, 30], 'y')).toEqual([-10, 20, -30])
    expect(mirrorRotationDeg([10, 20, 30], 'z')).toEqual([-10, -20, 30])
  })

  it('turns an unrotated body into an unrotated body, with no negative zero', () => {
    for (const axis of /** @type {const} */ (['x', 'y', 'z'])) {
      const result = mirrorRotationDeg([0, 0, 0], axis)
      expect(result).toEqual([0, 0, 0])
      for (const angle of result) expect(Object.is(angle, -0)).toBe(false)
    }
  })

  it('is the rotation a mirrored rotated body is really in: its local box is the part’s real size', () => {
    // A 20×6×4 bar turned by a mixed rotation, then mirrored. `localBoundsOf` un-turns
    // by whatever rotation it is handed; only the *right* one recovers 20×6×4 exactly.
    const rotationDeg = /** @type {[number, number, number]} */ ([30, -25, 50])
    const DEG = Math.PI / 180
    const bar = transforms.rotate(
      [rotationDeg[0] * DEG, rotationDeg[1] * DEG, rotationDeg[2] * DEG],
      primitives.cuboid({ size: [20, 6, 4] })
    )
    for (const axis of /** @type {const} */ (['x', 'y', 'z'])) {
      const reflected = mirror(bar, axis, [3, -4, 5])
      const [min, max] = localBoundsOf(reflected, mirrorRotationDeg(rotationDeg, axis))
      expect(max[0] - min[0]).toBeCloseTo(20, 6)
      expect(max[1] - min[1]).toBeCloseTo(6, 6)
      expect(max[2] - min[2]).toBeCloseTo(4, 6)
    }
  })

  it('rejects an unknown axis and a malformed rotation', () => {
    expect(() => mirrorRotationDeg([0, 0, 0], /** @type {any} */ ('q'))).toThrow(/axis/)
    expect(() => mirrorRotationDeg(/** @type {any} */ ([0, 0]), 'x')).toThrow(/rotation/)
  })
})
