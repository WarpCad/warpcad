// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'

/**
 * `TODO/ai-007` — `check_clearance`: the gap between two bodies, or how much they overlap.
 * The Pi-enclosure case (a board must clear its case) and the wing joint that must slide.
 */

const tools = createToolRegistry()

/** @param {import('../../core/document.js').WarpDocument} document @param {any} input */
function create(document, input) {
  const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', input))
  expect(result.error).toBeUndefined()
  return /** @type {string} */ (result.applied[0].bodyId)
}

describe('check_clearance', () => {
  it('two cubes 3 mm apart: a 3 mm gap, no overlap, closest points on the facing faces', () => {
    const document = createDocument()
    const a = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, 10, 10] } })
    const b = create(document, { op: 'primitive.cuboid', positionMm: [13, 0, 0], params: { size: [10, 10, 10] } })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'check_clearance', { a, b }))
    expect(result.error).toBeUndefined()
    expect(result).toMatchObject({ interpenetrating: false, overlapVolumeMm3: 0 })
    expect(result.gapMm).toBeCloseTo(3, 6)
    expect(result.closestMm.onA[0]).toBeCloseTo(5, 6)
    expect(result.closestMm.onB[0]).toBeCloseTo(8, 6)
    expect(result.message).toMatch(/3 mm/)
  })

  it('two overlapping spheres: the analytic lens volume, and no gap', () => {
    // `print` resolution (72 segments at this size), so the faceted spheres are close to round.
    const document = createDocument({ resolution: 'print' })
    const a = create(document, { op: 'primitive.sphere', positionMm: [0, 0, 0], params: { diameter: 20 } })
    const b = create(document, { op: 'primitive.sphere', positionMm: [10, 0, 0], params: { diameter: 20 } })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'check_clearance', { a, b }))
    const r = 10
    const d = 10
    const lens = (Math.PI * (4 * r + d) * (2 * r - d) ** 2) / 12
    expect(result.interpenetrating).toBe(true)
    expect(result.gapMm).toBe(0)
    expect(Math.abs(result.overlapVolumeMm3 - lens) / lens).toBeLessThan(0.02)
    expect(result.message).toMatch(/overlap/i)
  })

  it('refuses the same body twice, and an unknown id, by name', () => {
    const document = createDocument()
    const a = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, 10, 10] } })
    expect(tools.run(makeContext({ document }), 'check_clearance', { a, b: a }).error).toMatch(/two different/i)
    expect(tools.run(makeContext({ document }), 'check_clearance', { a, b: 'nope-1' }).error).toMatch(/nope-1/)
  })
})

describe('check_clearance between parts of one group (TODO/FIND-ai-041 gap 4)', () => {
  /**
   * A Base cube (x −5…5) and a Pin cube (x 7…17) grouped into one body, 2 mm apart in x, and
   * a loose Lid cube (x 19…29), 2 mm past the Pin.
   *
   * @returns {{ document: import('../../core/document.js').WarpDocument, group: string, lid: string }}
   */
  function baseAndPin() {
    const document = createDocument()
    const base = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, 10, 10] } })
    const pin = create(document, { op: 'primitive.cuboid', positionMm: [12, 0, 0], params: { size: [10, 10, 10] } })
    const lid = create(document, { op: 'primitive.cuboid', positionMm: [24, 0, 0], params: { size: [10, 10, 10] } })
    const grouped = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'group.assemble', operands: [{ id: base }, { id: pin }] }))
    return { document, group: grouped.applied[0].bodyId, lid }
  }

  it('measures the gap between two named parts of the same body', () => {
    const { document, group } = baseAndPin()
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'check_clearance', { a: group, aPieces: 'Cube 1', b: group, bPieces: 'Cube 2' }))
    expect(result.error).toBeUndefined()
    expect(result.interpenetrating).toBe(false)
    expect(result.gapMm).toBeCloseTo(2, 6)
    expect(result.closestMm.onA[0]).toBeCloseTo(5, 6)
    expect(result.closestMm.onB[0]).toBeCloseTo(7, 6)
    expect(result.a).toMatchObject({ id: group, pieces: 'Cube 1' })
    expect(result.b).toMatchObject({ id: group, pieces: 'Cube 2' })
  })

  it('a part against another whole body, and the whole body unchanged without pieces', () => {
    const { document, group, lid } = baseAndPin()
    const ctx = makeContext({ document })
    const part = /** @type {any} */ (tools.run(ctx, 'check_clearance', { a: group, aPieces: 'Cube 1', b: lid }))
    expect(part.gapMm).toBeCloseTo(14, 6)
    const whole = /** @type {any} */ (tools.run(ctx, 'check_clearance', { a: group, b: lid }))
    expect(whole.gapMm).toBeCloseTo(2, 6)
    expect(whole.a.pieces).toBeUndefined()
  })

  it('refuses the same parts twice, an unknown part naming the real ones, and parts of a plain solid', () => {
    const { document, group, lid } = baseAndPin()
    // A fresh turn per call: a turn stops a tool after three failures in a row (limits.js).
    /** @param {any} input @returns {string} */
    const refusal = (input) => /** @type {any} */ (tools.run(makeContext({ document }), 'check_clearance', input)).error
    expect(refusal({ a: group, b: group, bPieces: 'Cube 2' })).toMatch(/two different/)
    expect(refusal({ a: group, aPieces: 'Cube 2', b: group, bPieces: 'Cube 2' })).toMatch(/two different/)
    expect(refusal({ a: group, aPieces: 'Pin', b: lid })).toMatch(/no part named "Pin".*Cube 1, Cube 2/)
    expect(refusal({ a: lid, aPieces: 'Cube 1', b: group })).toMatch(/has no parts/)
  })
})
