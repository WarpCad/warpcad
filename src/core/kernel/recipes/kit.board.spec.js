import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { isGroup } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { DEFAULT_BOARD_THICKNESS_MM, board } from './kit.board.js'

const { measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

/**
 * Narrow an evaluated value to a Group, failing the test if it is bare geometry.
 *
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
 * `[dx, dy, dz]` of a `[min, max]` bounds pair, in millimetres.
 *
 * @param {readonly (readonly number[])[]} bounds
 * @returns {[number, number, number]}
 */
function sizeOfBounds(bounds) {
  const [min, max] = bounds
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

describe('the board recipe expands into op records, it does not build a mesh', () => {
  it('emits profile → extrude → centring translate, in that order', () => {
    const records = board({ width: 40, height: 30, cornerRadius: 3 })
    expect(records).toEqual([
      {
        id: 'board.profile',
        op: 'profile.roundedRectangle',
        params: { size: [40, 30], roundRadius: 3, segments: 32 },
      },
      {
        id: 'board.prism',
        op: 'profile.extrudeLinear',
        params: { height: DEFAULT_BOARD_THICKNESS_MM },
        target: 'board.profile',
      },
      {
        id: 'board',
        op: 'transform.translate',
        params: { vector: [0, 0, -DEFAULT_BOARD_THICKNESS_MM / 2] },
        target: 'board.prism',
        name: 'board',
      },
    ])
  })

  it('defaults thickness to V1 Board’s own 1.62 mm PCB default', () => {
    expect(DEFAULT_BOARD_THICKNESS_MM).toBe(1.62)
    const records = board({ width: 40, height: 30, cornerRadius: 3 })
    expect(records[1].params?.height).toBe(1.62)
  })

  it('is reachable through expand() as a registered composite op', () => {
    const records = expand('kit.board', { width: 40, height: 30, cornerRadius: 3, thickness: 2 })
    expect(records.map((record) => record.op)).toEqual([
      'profile.roundedRectangle',
      'profile.extrudeLinear',
      'transform.translate',
    ])
  })

  it('bakes an explicit center into the single placement translate', () => {
    const records = board({ width: 40, height: 30, cornerRadius: 3, thickness: 2, center: [5, -6, 7] })
    expect(records[2].params?.vector).toEqual([5, -6, 7 - 1])
  })
})

describe('the evaluated board is the requested slab', () => {
  it('measures the requested width, height and thickness', () => {
    const geometry = /** @type {Geom3} */ (
      asGroup(evaluateOp('kit.board', { width: 40, height: 30, cornerRadius: 3, thickness: 1.6 }))
        .parts.board
    )
    const size = sizeOfBounds(boundsOf(geometry))
    expect(size[0]).toBeCloseTo(40, 6)
    expect(size[1]).toBeCloseTo(30, 6)
    expect(size[2]).toBeCloseTo(1.6, 6)
  })

  it('sits centred on the origin, unlike V1’s base-on-z=0 Board', () => {
    const geometry = /** @type {Geom3} */ (
      asGroup(evaluateOp('kit.board', { width: 40, height: 30, cornerRadius: 3, thickness: 1.6 }))
        .parts.board
    )
    const [min, max] = boundsOf(geometry)
    expect(min[0]).toBeCloseTo(-20, 6)
    expect(max[0]).toBeCloseTo(20, 6)
    expect(min[1]).toBeCloseTo(-15, 6)
    expect(max[1]).toBeCloseTo(15, 6)
    expect(min[2]).toBeCloseTo(-0.8, 6)
    expect(max[2]).toBeCloseTo(0.8, 6)
  })

  it('rounds its corners — a rounded slab has less volume than the plain box', () => {
    const rounded = /** @type {Geom3} */ (
      asGroup(evaluateOp('kit.board', { width: 40, height: 30, cornerRadius: 5, thickness: 2 }))
        .parts.board
    )
    // A rounded rectangle loses (4 - π)r² of area to its corners.
    const expectedMm3 = (40 * 30 - (4 - Math.PI) * 25) * 2
    // Tessellated arcs cut slightly inside the true circle, so this is a
    // relative check, not an exact one.
    expect(measurements.measureVolume(rounded) / expectedMm3).toBeCloseTo(1, 2)
    expect(measurements.measureVolume(rounded)).toBeLessThan(40 * 30 * 2)
  })

  it('honours center by moving the whole slab, not resizing it', () => {
    const geometry = /** @type {Geom3} */ (
      asGroup(
        evaluateOp('kit.board', {
          width: 40,
          height: 30,
          cornerRadius: 3,
          thickness: 2,
          center: [100, -50, 10],
        })
      ).parts.board
    )
    const [min, max] = boundsOf(geometry)
    expect([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]).toEqual([
      100, -50, 10,
    ])
    expect(sizeOfBounds([min, max])[2]).toBeCloseTo(2, 6)
  })
})

describe('degenerate boards are rejected at the boundary, not silently built', () => {
  it('rejects a non-positive width, height or thickness', () => {
    expect(() => board({ width: 0, height: 30, cornerRadius: 3 })).toThrow(/kit\.board: width/)
    expect(() => board({ width: 40, height: -1, cornerRadius: 3 })).toThrow(/kit\.board: height/)
    expect(() => board({ width: 40, height: 30, cornerRadius: 3, thickness: 0 })).toThrow(
      /kit\.board: thickness/
    )
  })

  it('rejects a missing or negative corner radius', () => {
    expect(() => board({ width: 40, height: 30 })).toThrow(/kit\.board: cornerRadius/)
    expect(() => board({ width: 40, height: 30, cornerRadius: -2 })).toThrow(
      /kit\.board: cornerRadius/
    )
  })

  it('rejects a corner radius at or above the smaller half-dimension, by name', () => {
    // `@jscad/modeling`'s own roundedRectangle throws "roundRadius must be smaller
    // than the radius of all dimensions" here, which names neither the op nor the
    // parameter a user typed. This is the check that turns it into a real message.
    expect(() => board({ width: 40, height: 30, cornerRadius: 15 })).toThrow(
      /kit\.board: cornerRadius .*smaller than half/
    )
    expect(() => board({ width: 40, height: 30, cornerRadius: 20 })).toThrow(
      /kit\.board: cornerRadius/
    )
  })

  it('accepts a corner radius just under the half-dimension', () => {
    expect(() => evaluateOp('kit.board', { width: 40, height: 30, cornerRadius: 14.9 })).not.toThrow()
  })
})

describe("part colour: V1's Board never coloured itself (TODO/core-026)", () => {
  // V1, re-read for core-026 — `jscad-utils@3.2.0` `jscad-utils-parts.jscad:147-157`
  // and `jscad-utils@6.0.0` `src/parts.js:418-430` are the same body, and neither calls
  // `.color(...)`:
  //   var board = CAG.roundedRectangle({ center: [r[0], r[1], 0], radius: r,
  //     roundradius: corner_radius }).extrude({ offset: [0, 0, thickness || 1.62] });
  //   return board;
  // The coloured boards in the real corpus colour them at the call site
  // (e.g. `jscad-raspberrypi`'s `Parts.Board(...).color('green', 0.75)`).
  it('emits no colour on any record — there is no V1 .color() here to port', () => {
    for (const record of expand('kit.board', { width: 40, height: 30, cornerRadius: 3, thickness: 2 })) {
      expect(record).not.toHaveProperty('color')
      expect(record).not.toHaveProperty('colorAlpha')
    }
  })
})
