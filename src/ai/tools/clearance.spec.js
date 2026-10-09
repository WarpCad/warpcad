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
