import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { boundsOf, calcCenterWith, calcSnap, isGroup, pick } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { anchor, DEFAULT_ANCHOR_MM } from './kit.anchor.js'

const { primitives, transforms, measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

/**
 * @param {Geom3 | Group | undefined} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  return value
}

/**
 * @param {readonly (readonly number[])[]} bounds
 * @returns {[number, number, number]}
 */
function sizeOfBounds(bounds) {
  const [min, max] = bounds
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

const WIDTH = 12
const HEIGHT = 9

/** @param {Record<string, any>} [params] */
const anchorGroup = (params = { width: WIDTH, height: HEIGHT }) =>
  asGroup(evaluateOp('kit.anchor', params))

describe('the anchor recipe expands into op records, it does not build a mesh', () => {
  it('emits the centred hole, then the post’s primitive, rotate and baked translate', () => {
    const records = anchor({ width: WIDTH, height: HEIGHT })
    expect(records.map((record) => [record.id, record.op])).toEqual([
      ['hole', 'primitive.cylinder'],
      ['post.solid', 'primitive.cylinder'],
      ['post.turned', 'transform.rotate'],
      ['post', 'transform.translate'],
    ])
    expect(records[0]).toMatchObject({
      params: { diameter: WIDTH, height: HEIGHT, segments: 32 },
      name: 'hole',
    })
    // V1: `Cylinder(height / 2, width * 0.66)` — diameter from the *height*,
    // length from the width. Deliberately not a typo.
    expect(records[1].params).toEqual({
      diameter: HEIGHT / 2,
      height: WIDTH * 0.66,
      segments: 32,
    })
    expect(records[2]).toMatchObject({ params: { angles: [90, 0, 0] }, target: 'post.solid' })
    expect(records[3]).toMatchObject({ target: 'post.turned', name: 'post' })
  })

  it('bakes the align/snap result in as a plain translate vector, never a group.snap record', () => {
    // `Initial design.md` §4: a recipe calls the group math to compute a number and
    // emits the *result*. Recomputing it here from the real bounding boxes is what
    // proves the baked number is the snap, not a hand-typed constant.
    const records = anchor({ width: WIDTH, height: HEIGHT })
    expect(records.every((record) => !record.op.startsWith('group.'))).toBe(true)

    const hole = primitives.cylinder({ radius: WIDTH / 2, height: HEIGHT, segments: 32 })
    const turned = transforms.rotate(
      [Math.PI / 2, 0, 0],
      primitives.cylinder({ radius: HEIGHT / 4, height: WIDTH * 0.66, segments: 32 })
    )
    const align = calcCenterWith(turned, 'xz', hole)
    const snap = calcSnap(transforms.translate(align, turned), hole, 'y', 'inside-')
    const expected = [
      align[0] + snap[0],
      align[1] + snap[1],
      align[2] + snap[2] - HEIGHT / 6,
    ]

    const vector = /** @type {number[]} */ (records[3].params?.vector)
    expect(vector[0]).toBeCloseTo(expected[0], 9)
    expect(vector[1]).toBeCloseTo(expected[1], 9)
    expect(vector[2]).toBeCloseTo(expected[2], 9)
  })

  it('defaults to V1 Anchor’s own 10 × 10', () => {
    expect(DEFAULT_ANCHOR_MM).toBe(10)
    const records = anchor({})
    expect(records[0].params).toMatchObject({ diameter: 10, height: 10 })
  })

  it('is reachable through expand() as a registered composite op', () => {
    expect(expand('kit.anchor', { width: WIDTH, height: HEIGHT })).toHaveLength(4)
  })
})

describe('rotateX(90): verified against this project’s rotation convention, not assumed', () => {
  it('turns the post’s axis from Z onto Y', () => {
    const upright = primitives.cylinder({ radius: HEIGHT / 4, height: WIDTH * 0.66, segments: 32 })
    const turned = transforms.rotate([Math.PI / 2, 0, 0], upright)
    const size = sizeOfBounds(measurements.measureBoundingBox(turned))
    expect(size[1]).toBeCloseTo(WIDTH * 0.66, 6) // length now runs along Y
    expect(size[0]).toBeCloseTo(HEIGHT / 2, 6)
    expect(size[2]).toBeCloseTo(HEIGHT / 2, 6)
  })

  it('is sign-immaterial for this part, which is why +90 is safe to bake in', () => {
    // The caution the TODO asks for, answered by measurement rather than by
    // reading the sign convention: a cylinder is symmetric about its own axis, so
    // rotateX(+90) and rotateX(-90) produce the same bounding box, and the post's
    // final position is fixed by the align/snap that follow — not by the sign.
    const upright = primitives.cylinder({ radius: HEIGHT / 4, height: WIDTH * 0.66, segments: 32 })
    const plus = measurements.measureBoundingBox(transforms.rotate([Math.PI / 2, 0, 0], upright))
    const minus = measurements.measureBoundingBox(transforms.rotate([-Math.PI / 2, 0, 0], upright))
    for (const axis of [0, 1, 2]) {
      expect(plus[0][axis]).toBeCloseTo(minus[0][axis], 9)
      expect(plus[1][axis]).toBeCloseTo(minus[1][axis], 9)
    }
  })
})

describe('the evaluated anchor is a two-part group with the post snapped into the hole', () => {
  it('names both parts, so Group.pick can address them individually later', () => {
    const group = anchorGroup()
    expect([...group.names].sort()).toEqual(['hole', 'post'])
    expect(Object.keys(pick(group, 'post').parts)).toEqual(['post'])
    expect(Object.keys(pick(group, 'hole').parts)).toEqual(['hole'])
  })

  it('builds the hole centred on the origin at the requested diameter and height', () => {
    const [min, max] = boundsOf(anchorGroup().parts.hole)
    expect(sizeOfBounds([min, max])[0]).toBeCloseTo(WIDTH, 6)
    expect(sizeOfBounds([min, max])[2]).toBeCloseTo(HEIGHT, 6)
    expect((min[2] + max[2]) / 2).toBeCloseTo(0, 6)
  })

  it('builds the post at the diameter and length V1 derives from the other dimension', () => {
    const size = sizeOfBounds(boundsOf(anchorGroup().parts.post))
    expect(size[0]).toBeCloseTo(HEIGHT / 2, 6)
    expect(size[1]).toBeCloseTo(WIDTH * 0.66, 6)
    expect(size[2]).toBeCloseTo(HEIGHT / 2, 6)
  })

  it('snaps the post’s −Y face flush to the hole’s inner wall', () => {
    // The geometric relationship V1's `.snap(hole, 'y', 'inside-')` encodes, and
    // the only check available with no V1 fixture to diff a number against.
    const group = anchorGroup()
    const [postMin] = boundsOf(group.parts.post)
    const [holeMin] = boundsOf(group.parts.hole)
    expect(postMin[1]).toBeCloseTo(holeMin[1], 9)
  })

  it('centres the post on the hole in X, and drops it height/6 below centre in Z', () => {
    const group = anchorGroup()
    const [postMin, postMax] = boundsOf(group.parts.post)
    const [holeMin, holeMax] = boundsOf(group.parts.hole)
    expect((postMin[0] + postMax[0]) / 2).toBeCloseTo((holeMin[0] + holeMax[0]) / 2, 9)
    expect((postMin[2] + postMax[2]) / 2).toBeCloseTo(-HEIGHT / 6, 9)
  })

  it('carries the whole assembly when center is given', () => {
    const group = anchorGroup({ width: WIDTH, height: HEIGHT, center: [10, -20, 5] })
    const [holeMin, holeMax] = boundsOf(group.parts.hole)
    expect([
      (holeMin[0] + holeMax[0]) / 2,
      (holeMin[1] + holeMax[1]) / 2,
      (holeMin[2] + holeMax[2]) / 2,
    ]).toEqual([10, -20, 5])
    const [postMin] = boundsOf(group.parts.post)
    expect(postMin[1]).toBeCloseTo(holeMin[1], 9)
  })
})

describe('degenerate anchors are rejected at the boundary', () => {
  it('rejects a zero or negative width or height', () => {
    expect(() => anchor({ width: 0 })).toThrow(/kit\.anchor: width/)
    expect(() => anchor({ width: -3 })).toThrow(/kit\.anchor: width/)
    expect(() => anchor({ height: 0 })).toThrow(/kit\.anchor: height/)
    expect(() => anchor({ height: Number.NaN })).toThrow(/kit\.anchor: height/)
  })
})
