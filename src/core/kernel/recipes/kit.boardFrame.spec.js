// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { isGroup } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { DEFAULT_BOARD_THICKNESS_MM } from './kit.board.js'
import { boardFrame } from './kit.boardFrame.js'

const { measurements } = modeling

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

/** @param {Geom3} geometry */
const boundsOf = (geometry) => measurements.measureBoundingBox(geometry)

/**
 * @param {readonly (readonly number[])[]} bounds
 * @returns {[number, number, number]}
 */
function sizeOfBounds(bounds) {
  const [min, max] = bounds
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

/** A 2D boolean leaves ~1e-4 mm of noise on the outline; see the module doc. */
const BOOLEAN_MM_TOLERANCE = 3

const FRAME = Object.freeze({
  outerWidth: 40,
  outerHeight: 30,
  innerWidth: 30,
  innerHeight: 20,
  cornerRadius: 3,
})

describe('the boardFrame recipe subtracts in 2D, then extrudes', () => {
  it('emits both profiles, the 2D subtract, the extrude and the placement translate', () => {
    expect(boardFrame({ ...FRAME })).toEqual([
      {
        id: 'frame.outer',
        op: 'profile.roundedRectangle',
        params: { size: [40, 30], roundRadius: 3 },
      },
      {
        id: 'frame.inner',
        op: 'profile.roundedRectangle',
        params: { size: [30, 20], roundRadius: 3 },
      },
      {
        id: 'frame.profile',
        op: 'boolean.subtract',
        params: {},
        target: 'frame.outer',
        operands: ['frame.inner'],
      },
      {
        id: 'frame.prism',
        op: 'profile.extrudeLinear',
        params: { height: DEFAULT_BOARD_THICKNESS_MM },
        target: 'frame.profile',
      },
      {
        id: 'frame',
        op: 'transform.translate',
        params: { vector: [0, 0, -DEFAULT_BOARD_THICKNESS_MM / 2] },
        target: 'frame.prism',
        name: 'frame',
      },
    ])
  })

  it('subtracts before it extrudes — the ordering V1’s own non-manifold comment demands', () => {
    // This is the load-bearing assertion of the whole port: the extrude must
    // consume the *subtract's* output, not the other way round. Extruding both
    // rectangles to same-height solids and subtracting those is the exact
    // non-manifold risk jscad-utils@6's BoardFrame comment flags.
    const records = expand('kit.boardFrame', { ...FRAME })
    const subtractIndex = records.findIndex((record) => record.op === 'boolean.subtract')
    const extrudeIndex = records.findIndex((record) => record.op === 'profile.extrudeLinear')
    expect(subtractIndex).toBeGreaterThanOrEqual(0)
    expect(extrudeIndex).toBeGreaterThan(subtractIndex)
    expect(records[extrudeIndex].target).toBe(records[subtractIndex].id)
    // ...and both of the subtract's operands are 2D profiles, not extruded solids.
    const subtract = records[subtractIndex]
    const profileIds = records
      .filter((record) => record.op === 'profile.roundedRectangle')
      .map((record) => record.id)
    expect([subtract.target, ...(subtract.operands ?? [])].sort()).toEqual([...profileIds].sort())
  })

  it('holds both rectangles at the same centre, so the frame is concentric', () => {
    const records = boardFrame({ ...FRAME })
    expect(records[0].params?.center).toBeUndefined()
    expect(records[1].params?.center).toBeUndefined()
  })
})

describe('the evaluated frame is hollow and the size asked for', () => {
  it('measures the outer width, height and thickness', () => {
    const geometry = /** @type {Geom3} */ (
      asGroup(evaluateOp('kit.boardFrame', { ...FRAME, thickness: 1.6 })).parts.frame
    )
    const size = sizeOfBounds(boundsOf(geometry))
    expect(size[0]).toBeCloseTo(40, BOOLEAN_MM_TOLERANCE)
    expect(size[1]).toBeCloseTo(30, BOOLEAN_MM_TOLERANCE)
    expect(size[2]).toBeCloseTo(1.6, 6)
  })

  it('has the volume of the outer slab minus the inner one — it is a frame, not a slab', () => {
    const geometry = /** @type {Geom3} */ (
      asGroup(evaluateOp('kit.boardFrame', { ...FRAME, thickness: 2 })).parts.frame
    )
    // Both rectangles share a corner radius, so their (4 - π)r² corner losses
    // cancel and the wall volume is just the difference of the two areas.
    const expectedMm3 = (40 * 30 - 30 * 20) * 2
    expect(measurements.measureVolume(geometry) / expectedMm3).toBeCloseTo(1, 2)
  })

  it('sits centred on the origin in Z, like every other V3 primitive here', () => {
    const geometry = /** @type {Geom3} */ (
      asGroup(evaluateOp('kit.boardFrame', { ...FRAME, thickness: 2 })).parts.frame
    )
    const [min, max] = boundsOf(geometry)
    expect(min[2]).toBeCloseTo(-1, 6)
    expect(max[2]).toBeCloseTo(1, 6)
  })

  it('honours center by moving the whole frame', () => {
    const geometry = /** @type {Geom3} */ (
      asGroup(evaluateOp('kit.boardFrame', { ...FRAME, thickness: 2, center: [10, 20, 30] }))
        .parts.frame
    )
    const [min, max] = boundsOf(geometry)
    expect((min[0] + max[0]) / 2).toBeCloseTo(10, BOOLEAN_MM_TOLERANCE)
    expect((min[1] + max[1]) / 2).toBeCloseTo(20, BOOLEAN_MM_TOLERANCE)
    expect((min[2] + max[2]) / 2).toBeCloseTo(30, 6)
  })
})

describe('degenerate frames are rejected at the boundary', () => {
  it('rejects an inner rectangle at or above the outer one on either axis', () => {
    expect(() => boardFrame({ ...FRAME, innerWidth: 40 })).toThrow(
      /kit\.boardFrame: innerWidth .*smaller than outerWidth/
    )
    expect(() => boardFrame({ ...FRAME, innerHeight: 31 })).toThrow(
      /kit\.boardFrame: innerHeight .*smaller than outerHeight/
    )
  })

  it('rejects non-positive dimensions and thickness', () => {
    expect(() => boardFrame({ ...FRAME, outerWidth: 0 })).toThrow(/kit\.boardFrame: outerWidth/)
    expect(() => boardFrame({ ...FRAME, innerHeight: -5 })).toThrow(/kit\.boardFrame: innerHeight/)
    expect(() => boardFrame({ ...FRAME, thickness: 0 })).toThrow(/kit\.boardFrame: thickness/)
  })

  it('rejects a corner radius that will not fit the inner rectangle either', () => {
    // The inner rectangle is the smaller of the two, so it is the binding
    // constraint — a radius that fits the outer one can still be impossible here.
    expect(() => boardFrame({ ...FRAME, cornerRadius: 11 })).toThrow(
      /kit\.boardFrame: cornerRadius .*smaller than half/
    )
  })
})

describe("part colour: V1's BoardFrame never coloured itself (TODO/core-026)", () => {
  // V1, re-read for core-026 — `jscad-utils@6.0.0` `src/parts.js:445-472`: a
  // `CAG.roundedRectangle(...).subtract(CAG.roundedRectangle(...))` extruded and
  // returned through `assertValidCSG(..., 'BoardFrame')`, with no `.color(...)` call.
  it('emits no colour on any record — there is no V1 .color() here to port', () => {
    for (const record of expand('kit.boardFrame', { ...FRAME })) {
      expect(record).not.toHaveProperty('color')
      expect(record).not.toHaveProperty('colorAlpha')
    }
  })
})
