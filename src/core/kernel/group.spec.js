import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import {
  add,
  addHole,
  align,
  axisApply,
  calcCenterWith,
  calcSnap,
  centroidOf,
  combine,
  createGroup,
  isGroup,
  pick,
  sizeOf,
  snap,
  toGeom3,
  translate,
} from './group.js'

const { measurements, primitives } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

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
