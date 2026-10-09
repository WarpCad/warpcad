// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { exportBodies } from '../../core/export.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'

/**
 * `TODO/ai-007` — `measure`: bounds, volume, surface area and centre of mass, through the real
 * registry and a real document, so the numbers are the kernel's own.
 */

const tools = createToolRegistry()

/** @param {import('../../core/document.js').WarpDocument} document @param {any} input */
function create(document, input) {
  const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', input))
  expect(result.error).toBeUndefined()
  return /** @type {string} */ (result.applied[0].bodyId)
}

/** Signed volume of a binary STL, mm³: the file a slicer would read. */
function stlVolume(/** @type {Uint8Array} */ bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  let volume = 0
  for (let index = 0; index < count; index += 1) {
    const o = 84 + index * 50 + 12
    const v = (/** @type {number} */ k) => view.getFloat32(o + k * 4, true)
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [v(0), v(1), v(2), v(3), v(4), v(5), v(6), v(7), v(8)]
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return volume
}

describe('measure', () => {
  it('a 10 mm cube is 1000 mm³ and 600 mm², with its bounds and centre of mass', () => {
    const document = createDocument()
    const id = create(document, { op: 'primitive.cuboid', positionMm: [20, 0, 0], params: { size: [10, 10, 10] } })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'measure', { ids: [id] }))
    expect(result.error).toBeUndefined()
    const [body] = result.bodies
    expect(body).toMatchObject({ id, sizeMm: [10, 10, 10] })
    expect(body.volumeMm3).toBeCloseTo(1000, 3)
    expect(body.surfaceAreaMm2).toBeCloseTo(600, 3)
    expect(body.boundsMm).toEqual([[15, -5, 0], [25, 5, 10]])
    expect(body.centerOfMassMm[0]).toBeCloseTo(20, 6)
    expect(body.centerOfMassMm[2]).toBeCloseTo(5, 6)
    // One body: no total to repeat it.
    expect(result.total).toBeUndefined()
  })

  it('several bodies get a total, overlaps counted once', () => {
    const document = createDocument()
    const a = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, 10, 10] } })
    const b = create(document, { op: 'primitive.cuboid', positionMm: [5, 0, 0], params: { size: [10, 10, 10] } })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'measure', { ids: [a, b] }))
    expect(result.bodies).toHaveLength(2)
    expect(result.total.volumeMm3).toBeCloseTo(1500, 3)
    expect(result.total.boundsMm).toEqual([[-5, -5, 0], [10, 5, 10]])
  })

  it('a group is one body: its parts unioned, the way the kernel measures it', () => {
    const document = createDocument()
    const a = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, 10, 10] } })
    const b = create(document, { op: 'primitive.cuboid', positionMm: [30, 0, 0], params: { size: [10, 10, 10] } })
    const grouped = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'group.assemble', operands: [{ id: a }, { id: b }] }))
    expect(grouped.error).toBeUndefined()
    const groupId = grouped.applied[0].bodyId
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'measure', { ids: [groupId] }))
    expect(result.bodies[0].volumeMm3).toBeCloseTo(2000, 3)
    expect(result.bodies[0].sizeMm).toEqual([40, 10, 10])
  })

  it('an empty list is refused with a sentence that says what to pass', () => {
    const result = tools.run(makeContext({ document: createDocument() }), 'measure', { ids: [] })
    expect(result.error).toMatch(/at least one/i)
    expect(result.error).toMatch(/describe_scene/)
  })

  it('an id that is not on screen is refused by name', () => {
    const result = tools.run(makeContext({ document: createDocument() }), 'measure', { ids: ['cuboid-99'] })
    expect(result.error).toMatch(/cuboid-99/)
  })

  it('acceptance 11: the measured volume is the exported STL’s volume', () => {
    const document = createDocument()
    const cube = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } })
    const bore = create(document, { op: 'primitive.cylinder', positionMm: [0, 0, -1], params: { diameter: 8, height: 22 } })
    const cut = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'boolean.subtract', operands: [{ id: cube }, { id: bore }] }))
    const id = cut.applied[0].bodyId
    const measured = /** @type {any} */ (tools.run(makeContext({ document }), 'measure', { ids: [id] })).bodies[0].volumeMm3
    const exported = stlVolume(exportBodies(document.bodies(), 'stl').bytes)
    // Float32 vertices in the file: equal to well inside a cubic millimetre.
    expect(Math.abs(measured - exported)).toBeLessThan(0.05)
  })
})
