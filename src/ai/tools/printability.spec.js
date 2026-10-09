// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { createDocument } from '../../core/document.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'

/**
 * `TODO/ai-007` — `check_printability`: watertight, fits the build volume (and in which
 * orientation), thinnest wall, features under the nozzle. Heuristic, and it says so; it never
 * says "printable".
 */

const { geometries, primitives } = modeling
const tools = createToolRegistry()

/** @param {import('../../core/document.js').WarpDocument} document @param {any} input */
function create(document, input) {
  const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', input))
  expect(result.error).toBeUndefined()
  return /** @type {string} */ (result.applied[0].bodyId)
}

/** @param {any} result @param {string} severity */
const issuesOf = (result, severity) => result.issues.filter((/** @type {any} */ issue) => issue.severity === severity)

describe('check_printability', () => {
  it('a 20 mm cube: watertight, fits as placed, no thin wall; heuristic, never "printable"', () => {
    const document = createDocument()
    const id = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'check_printability', { ids: [id] }))
    expect(result.error).toBeUndefined()
    expect(result.heuristic).toMatch(/heuristic/i)
    expect(JSON.stringify(result)).not.toMatch(/"printable"|is printable/i)
    expect(result.bodies[0]).toMatchObject({ id, watertight: true, openEdges: 0, fits: { asPlaced: true } })
    expect(result.bodies[0].thinnestWallMm).toBeCloseTo(20, 3)
    expect(issuesOf(result, 'error')).toEqual([])
    expect(issuesOf(result, 'warning')).toEqual([])
    // The defaults it judged against are said back.
    expect(result.settings).toEqual({ buildVolumeMm: [220, 220, 250], minWallMm: 1.2, nozzleMm: 0.4 })
  })

  it('flags a 0.3 mm sliver as under the nozzle, with coordinates on the sliver', () => {
    const document = createDocument()
    const block = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } })
    const fin = create(document, { op: 'primitive.cuboid', positionMm: [15, 0, 5], params: { size: [10, 0.3, 10] } })
    const joined = /** @type {any} */ (tools.run(makeContext({ document }), 'operate', { op: 'boolean.union', operands: [{ id: block }, { id: fin }] }))
    const id = joined.applied[0].bodyId
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'check_printability', { ids: [id] }))
    const errors = issuesOf(result, 'error')
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toMatch(/0\.3 mm/)
    expect(errors[0].message).toMatch(/nozzle/)
    expect(errors[0].bodyId).toBe(id)
    const [x, y] = errors[0].where
    expect(x).toBeGreaterThan(9.99)
    expect(Math.abs(y)).toBeLessThan(0.16)
    expect(result.bodies[0].thinnestWallMm).toBeCloseTo(0.3, 3)
  })

  it('a wall between the nozzle and the minimum is a warning that quotes the minimum', () => {
    const document = createDocument()
    const id = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [40, 1, 20] } })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'check_printability', { ids: [id], minWallMm: 1.6 }))
    const [warning] = issuesOf(result, 'warning')
    expect(warning.message).toMatch(/1 mm/)
    expect(warning.message).toMatch(/1\.6 mm minimum/)
    expect(issuesOf(result, 'error')).toEqual([])
  })

  it('a part too long for the bed as placed, but not on its side, says which way it fits', () => {
    const document = createDocument()
    const id = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 240] } })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'check_printability', { ids: [id], buildVolumeMm: [250, 250, 200] }))
    // Laid down, either way along the bed: 20 mm tall.
    expect(result.bodies[0].fits.asPlaced).toBe(false)
    expect(result.bodies[0].fits.sizeMm[2]).toBe(20)
    expect(Math.max(...result.bodies[0].fits.sizeMm)).toBe(240)
    const [warning] = issuesOf(result, 'warning')
    expect(warning.message).toMatch(/on its side|lay/i)
  })

  it('a part bigger than the build volume every way round is an error saying to split it', () => {
    const document = createDocument()
    const id = create(document, { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [300, 300, 300] } })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'check_printability', { ids: [id] }))
    expect(result.bodies[0].fits.asPlaced).toBe(false)
    expect(result.bodies[0].fits.sizeMm).toBeNull()
    expect(issuesOf(result, 'error').some((/** @type {any} */ issue) => /split/i.test(issue.message))).toBe(true)
  })

  it('flags a mesh that is not watertight, and says where the hole is', () => {
    const polygons = geometries.geom3.toPolygons(primitives.cuboid({ size: [10, 10, 10], center: [0, 0, 5] }))
    const open = geometries.geom3.create(polygons.filter((polygon) => !polygon.vertices.every((vertex) => vertex[2] > 9.999)))
    // A hand-built document stand-in: no op in the catalogue makes an open mesh.
    const body = { id: 'open-1', name: 'Open box', op: 'fake', geometry: open }
    const document = /** @type {any} */ ({ bodies: () => [body], recordOf: () => undefined, entries: [] })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'check_printability', { ids: ['open-1'] }))
    expect(result.bodies[0]).toMatchObject({ watertight: false })
    const [error] = issuesOf(result, 'error').filter((/** @type {any} */ issue) => /watertight/i.test(issue.message))
    expect(error.where[2]).toBeCloseTo(10, 3)
  })

  it('an empty list is refused', () => {
    expect(tools.run(makeContext({ document: createDocument() }), 'check_printability', { ids: [] }).error).toMatch(/at least one/i)
  })
})
