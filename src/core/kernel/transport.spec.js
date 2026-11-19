// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { evaluate } from './index.js'
import { add, addHole, createGroup, toGeom3, volumeOf, boundsOf } from './group.js'
import { packBodies, packGeometry, packGeometryInSlices, packSolids, transferablesOf, unpackBodies, unpackGeometry, unpackSolids } from './transport.js'

const { primitives, geometries, transforms, measurements } = modeling

/**
 * Packing kernel geometry for the export worker (`TODO/perf-001`).
 *
 * The thing worth testing here is not that `structuredClone` works — it is that what
 * comes out the far side is the **same geometry**, in the same place. Two ways to get
 * that wrong are specifically covered: dropping a group's structure (so `combine()`
 * can no longer subtract its holes) and losing a lazy transform (so a body the user
 * moved exports back at the origin — the trap `src/core/kernel/watertight.js` calls
 * out, now with a second chance to happen).
 *
 * `structuredClone` is applied for real in every round trip below, because that is what
 * `postMessage` does and it is what would reject a non-cloneable field.
 */

/** @param {any} value */
const roundTrip = (value) => structuredClone(value)

/** @param {any} solid @returns {number} */
function vertexCount(solid) {
  return geometries.geom3.toPolygons(solid).reduce((sum, polygon) => sum + polygon.vertices.length, 0)
}

/**
 * Every vertex, in order, as a comparable string — the strictest reading of "the same
 * geometry came back".
 *
 * @param {any} solid
 * @returns {string}
 */
function vertexDump(solid) {
  return geometries.geom3
    .toPolygons(solid)
    .map((polygon) => polygon.vertices.map((vertex) => vertex.join(',')).join(' '))
    .join('|')
}

describe('packGeometry / unpackGeometry (perf-001)', () => {
  it('round-trips a plain solid vertex for vertex, through a real structuredClone', () => {
    const solid = primitives.cuboid({ size: [10, 20, 30], center: [1.5, -2.5, 7] })
    const back = unpackGeometry(roundTrip(packGeometry(solid)))

    expect(vertexDump(back)).toBe(vertexDump(solid))
    expect(volumeOf(back)).toBeCloseTo(volumeOf(solid), 6)
  })

  it('applies a LAZY transform before sending, so a moved body does not come back at the origin', () => {
    // `@jscad/modeling` keeps `translate`/`rotate` as an unapplied matrix on the solid.
    // Sending `solid.polygons` instead of `toPolygons(solid)` would silently undo the move.
    const moved = transforms.translate([100.5, -40.25, 12], primitives.cuboid({ size: [10, 10, 10] }))
    expect(moved.transforms).not.toEqual(undefined)

    const back = unpackGeometry(roundTrip(packGeometry(moved)))
    const [movedMin, movedMax] = boundsOf(moved)
    const [backMin, backMax] = boundsOf(back)
    for (let axis = 0; axis < 3; axis += 1) {
      expect(backMin[axis]).toBeCloseTo(movedMin[axis], 9)
      expect(backMax[axis]).toBeCloseTo(movedMax[axis], 9)
    }
    expect(backMin[0]).toBeCloseTo(95.5, 9) // and not -5: the move really survived
  })

  it('round-trips a Group so combine() still unions the visible parts and subtracts the holes', () => {
    let group = createGroup('bolt')
    group = add(group, primitives.cuboid({ size: [20, 20, 6], center: [0, 0, 3] }), 'head')
    group = add(group, primitives.cylinder({ radius: 4, height: 30, center: [0, 0, 15] }), 'shank')
    group = add(group, primitives.cuboid({ size: [4, 4, 40] }), 'tap', { hidden: true })
    group = addHole(group, primitives.cylinder({ radius: 2, height: 40 }))

    const packed = roundTrip(packGeometry(group))
    const back = /** @type {any} */ (unpackGeometry(packed))

    expect(back.names).toEqual(group.names)
    expect(Object.keys(back.parts).sort()).toEqual(Object.keys(group.parts).sort())
    expect(back.holes.length).toBe(group.holes.length)
    // The hidden part is still addressable but still out of the combined solid.
    expect(back.names).not.toContain('tap')
    expect(volumeOf(toGeom3(back))).toBeCloseTo(volumeOf(toGeom3(group)), 4)
    expect(vertexDump(toGeom3(back))).toBe(vertexDump(toGeom3(group)))
  })

  it('round-trips the bodies an export covers, keeping ids and names', () => {
    const { byId } = evaluate([
      { id: 'b', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 30 } },
      { id: 'c', op: 'primitive.cuboid', params: { size: [10, 10, 10] } },
    ])
    const bodies = [
      { id: 'b', name: 'Bolt 1', geometry: /** @type {any} */ (byId.get('b')) },
      { id: 'c', name: 'Cube 1', geometry: /** @type {any} */ (byId.get('c')) },
    ]
    const back = unpackBodies(roundTrip(packBodies(bodies)))

    expect(back.map((body) => [body.id, body.name])).toEqual([
      ['b', 'Bolt 1'],
      ['c', 'Cube 1'],
    ])
    for (let index = 0; index < bodies.length; index += 1) {
      expect(volumeOf(toGeom3(back[index].geometry))).toBeCloseTo(volumeOf(toGeom3(bodies[index].geometry)), 4)
    }
  })

  it('round-trips prepared solids for the glTF path without changing the snap epsilon', () => {
    // `measureEpsilon` is derived from the bounding box, and the repair keys corners by
    // it — so a round trip that perturbed coordinates would change what welds to what.
    const solid = primitives.sphere({ radius: 20, segments: 32 })
    const back = unpackSolids(roundTrip(packSolids([{ name: 'Sphere 1', solid: solid }])))

    expect(back[0].name).toBe('Sphere 1')
    expect(measurements.measureEpsilon(back[0].solid)).toBe(measurements.measureEpsilon(solid))
    expect(vertexCount(back[0].solid)).toBe(vertexCount(solid))
    expect(vertexDump(back[0].solid)).toBe(vertexDump(solid))
  })
})

/**
 * `TODO/core-085`: a dense 3MF (two copies of a 220 k-triangle model) blocked the main thread for
 * about 200 ms at a whole-model Subtract's click and 80 ms when its answer landed, almost all of it
 * `postMessage` cloning one small JS array per corner and polygon (the CPU profile: the `request`
 * executor at the click, `onMessage`'s first read of `event.data` at landing). Solids now cross as
 * flat typed arrays, and a caller that is done with them hands their buffers over instead.
 */
describe('typed-array transport and transfer lists (TODO/core-085)', () => {
  /** Every plane, in order, as a comparable string. */
  const planeDump = (/** @type {any} */ solid) =>
    geometries.geom3
      .toPolygons(solid)
      .map((polygon) => geometries.poly3.plane(polygon).join(','))
      .join('|')

  it('packs a solid as flat Float64Array corners, Uint32Array counts and Float64Array planes', () => {
    const solid = primitives.sphere({ radius: 7, segments: 24 })
    const packed = /** @type {any} */ (packGeometry(solid, { planes: true }))
    const polygons = geometries.geom3.toPolygons(solid)
    expect(packed.polygons.counts).toBeInstanceOf(Uint32Array)
    expect(packed.polygons.positions).toBeInstanceOf(Float64Array)
    expect(packed.planes).toBeInstanceOf(Float64Array)
    expect(packed.polygons.counts.length).toBe(polygons.length)
    expect(packed.polygons.positions.length).toBe(vertexCount(solid) * 3)
    expect(packed.planes.length).toBe(polygons.length * 4)
  })

  it('lists every buffer once, and a transferred copy unpacks bit-identical, planes included', () => {
    const solid = transforms.translate([3.25, -1.5, 9], primitives.sphere({ radius: 7, segments: 24 }))
    const packed = packGeometry(solid, { planes: true })
    const transfer = transferablesOf(packed)
    expect(transfer.length).toBe(3)
    expect(new Set(transfer).size).toBe(transfer.length)
    const moved = structuredClone(packed, { transfer })
    // Handed over, not copied: the sender's buffers are gone.
    expect(/** @type {any} */ (packed).polygons.positions.byteLength).toBe(0)
    const back = unpackGeometry(moved)
    expect(vertexDump(back)).toBe(vertexDump(solid))
    expect(planeDump(back)).toBe(planeDump(solid))
  })

  it("covers a Group's every part, hole and plane array, so combine() is unchanged after a transfer", () => {
    let group = createGroup('bolt')
    group = add(group, primitives.cuboid({ size: [20, 20, 6], center: [0, 0, 3] }), 'head')
    group = add(group, primitives.cylinder({ radius: 4, height: 30, center: [0, 0, 15] }), 'shank')
    group = add(group, primitives.cuboid({ size: [4, 4, 40] }), 'tap', { hidden: true })
    group = addHole(group, primitives.cylinder({ radius: 2, height: 40 }))
    const packed = packGeometry(group, { planes: true })
    const transfer = transferablesOf(packed)
    // Three parts and one hole, each with corners, counts and planes.
    expect(transfer.length).toBe(4 * 3)
    expect(new Set(transfer).size).toBe(transfer.length)
    const back = /** @type {any} */ (unpackGeometry(structuredClone(packed, { transfer })))
    expect(back.names).toEqual(group.names)
    expect(vertexDump(toGeom3(back))).toBe(vertexDump(toGeom3(group)))
    expect(planeDump(back.parts.shank)).toBe(planeDump(group.parts.shank))
  })

  it('lists the buffers of packed bodies and packed solids too', () => {
    const solid = primitives.cuboid({ size: [2, 2, 2] })
    expect(transferablesOf(packBodies([{ id: 'c', name: 'Cube', geometry: solid }])).length).toBe(2)
    expect(transferablesOf(packSolids([{ name: 'Cube', solid }])).length).toBe(2)
  })

  it('packs in slices, yielding whenever the budget runs out, to exactly what packGeometry packs', async () => {
    // At a dense pair's click the pack itself was 17 ms of one task; sliced, no task holds it all.
    let group = createGroup('pair')
    group = add(group, primitives.sphere({ radius: 7, segments: 32 }), 'ball')
    group = add(group, primitives.cylinder({ radius: 4, height: 30, center: [0, 0, 15] }), 'shank')
    group = addHole(group, primitives.cylinder({ radius: 2, height: 40 }))
    let yields = 0
    let clock = 0
    const sliced = await packGeometryInSlices(group, {
      planes: true,
      budgetMs: 1,
      chunkPolygons: 50,
      // Each chunk "takes" a millisecond, so every chunk exhausts the budget.
      now: () => (clock += 1),
      yieldToEventLoop: async () => {
        yields += 1
      },
    })
    const whole = /** @type {any} */ (packGeometry(group, { planes: true }))
    expect(yields).toBeGreaterThan(10)
    expect(sliced).toEqual(whole)
    expect(vertexDump(toGeom3(/** @type {any} */ (unpackGeometry(sliced))))).toBe(vertexDump(toGeom3(group)))
  })

  it('packs a small solid in slices without yielding at all when the budget is not spent', async () => {
    let yields = 0
    const solid = primitives.cuboid({ size: [2, 2, 2] })
    const sliced = await packGeometryInSlices(solid, { yieldToEventLoop: async () => void (yields += 1) })
    expect(yields).toBe(0)
    expect(sliced).toEqual(packGeometry(solid))
  })

  it('still unpacks the nested-array form, and an empty or malformed solid', () => {
    const legacy = /** @type {any} */ ({ kind: 'solid', polygons: [[[0, 0, 0], [1, 0, 0], [0, 1, 0]]] })
    expect(geometries.geom3.toPolygons(/** @type {any} */ (unpackGeometry(legacy))).length).toBe(1)
    const empty = /** @type {any} */ (packGeometry(geometries.geom3.create()))
    expect(empty.polygons.counts.length).toBe(0)
    expect(geometries.geom3.toPolygons(/** @type {any} */ (unpackGeometry(empty))).length).toBe(0)
  })
})

describe('part colours survive the worker boundary (TODO/core-026)', () => {
  it("round-trips a Group's part colours through a real structuredClone", () => {
    let group = createGroup('washer')
    group = add(group, primitives.cuboid({ size: [4, 4, 1] }), 'washer', { color: 0x808080 })
    group = add(group, primitives.cuboid({ size: [5, 5, 1] }), 'clearance', {
      hidden: true,
      color: 0xff0000,
      colorAlpha: 0.5,
    })
    const back = /** @type {any} */ (unpackGeometry(roundTrip(packGeometry(group))))
    expect(back.colors).toEqual(group.colors)
    expect(back.colors).toEqual({
      washer: { color: 0x808080, alpha: 1 },
      clearance: { color: 0xff0000, alpha: 0.5 },
    })
  })

  it('unpacks an older packed group with no colours as an uncoloured group', () => {
    const back = /** @type {any} */ (
      unpackGeometry({ kind: 'group', name: 'old', names: [], parts: {}, holes: [] })
    )
    expect(back.colors).toEqual({})
  })
})
