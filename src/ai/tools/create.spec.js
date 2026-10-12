// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { boundsOf } from '../../core/kernel/group.js'
import { registry } from '../../core/kernel/registry.js'
import { LIBRARY_SECTIONS, recordsForDrop } from '../../core/library.js'
import { fakeRegistry } from './__fixtures__/fakeRegistry.js'
import { makeContext } from './__fixtures__/context.js'
import { buildCreateRecords, creatableOps } from './create.js'
import { createToolRegistry } from './index.js'

/** A plain, closed, counter-clockwise square sketch at Z = 0, extruded 5 mm. */
const SQUARE_SKETCH = Object.freeze({
  slices: [
    {
      id: 's1',
      zMm: 0,
      profiles: [{ id: 'p1', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 0], [10, 10], [0, 10]] }],
    },
  ],
  extrusion: { method: 'linear', heightMm: 5, twistDeg: 0, twistSteps: 1 },
})

/**
 * @param {import('../../core/document.js').WarpDocument} document
 * @returns {string}
 */
function snapshot(document) {
  return JSON.stringify(document.entries)
}

describe('creatableOps — creation is its own list (CLAUDE.md’s creation-vs-operation rule)', () => {
  it('offers exactly the zero-operand ops a human can drag from the Library', () => {
    const libraryOps = LIBRARY_SECTIONS.flatMap((section) => section.rows.map((row) => row.op)).sort()
    expect(creatableOps(registry)).toEqual(libraryOps)
  })

  it('never offers an operation, a 2D intermediate, or a recipe with no Library row', () => {
    const ops = creatableOps(registry)
    for (const op of ops) expect(registry[op].operandCount, op).toBe(0)
    expect(ops).not.toContain('profile.roundedRectangle')
    expect(ops).not.toContain('hardware.screw')
  })

  it('reads a fake registry by the same rule', () => {
    expect(creatableOps(fakeRegistry)).toEqual(['fake.block'])
  })
})

describe('buildCreateRecords — the same records a drag-to-place commits', () => {
  it('matches recordsForDrop for every Library row except Sketch, ids and names included', () => {
    for (const op of creatableOps(registry)) {
      if (op === 'primitive.sketch') continue
      const ours = buildCreateRecords(createDocument({ replica: 'abcdef' }), { op, positionMm: [12, -7, 0] }, registry)
      const theirs = recordsForDrop(op, { x: 12, y: -7 }, createDocument({ replica: 'abcdef' }))
      expect(ours.records, op).toEqual(theirs)
      expect(ours.bodyId, op).toBe(theirs[0].id)
    }
  })

  it('builds a Sketch the way the sketch editor’s Done does: the position is the sketch plane’s origin', () => {
    const { records, bodyId } = buildCreateRecords(
      createDocument({ replica: 'abcdef' }),
      { op: 'primitive.sketch', positionMm: [5, 6, 7], params: SQUARE_SKETCH },
      registry
    )
    expect(records).toEqual([
      { id: 'sketch-abcdef-1', op: 'primitive.sketch', name: 'Sketch 1', params: { center: [5, 6, 7], ...SQUARE_SKETCH } },
    ])
    expect(bodyId).toBe('sketch-abcdef-1')
  })

  it('lifts a placed body by positionMm[2], so its underside rests at that height', () => {
    const document = createDocument({ replica: 'abcdef' })
    const { records } = buildCreateRecords(document, { op: 'primitive.cuboid', positionMm: [0, 0, 15], params: { size: [10, 10, 40] } }, registry)
    document.appendAll(records, { origin: 'ai' })
    const [min, max] = boundsOf(document.bodies()[0].geometry)
    expect(min[2]).toBeCloseTo(15, 9)
    expect(max[2]).toBeCloseTo(55, 9)
  })

  it('lifts a composite through its drop translate, not through a param the recipe would ignore', () => {
    const { records } = buildCreateRecords(createDocument({ replica: 'abcdef' }), { op: 'hardware.nut', positionMm: [0, 0, 3] }, registry)
    expect(records).toHaveLength(2)
    expect(records[0].params?.center).toBeUndefined()
    const plain = recordsForDrop('hardware.nut', { x: 0, y: 0 }, createDocument({ replica: 'abcdef' }))
    expect(records[1].params?.vector[2]).toBeCloseTo(plain[1].params?.vector[2] + 3, 9)
  })

  it('places a fake-registry op from its own measured box', () => {
    const { records } = buildCreateRecords(createDocument({ registry: fakeRegistry, replica: 'abcdef' }), { op: 'fake.block', positionMm: [5, 5, 0] }, fakeRegistry)
    expect(records).toEqual([{ id: 'block-abcdef-1', op: 'fake.block', name: 'Block 1', params: { sizeMm: 10, center: [5, 5, 5] } }])
  })
})

describe('the create tool', () => {
  const tools = createToolRegistry()

  it('places a body with origin ai and returns the new scene, not just "ok"', () => {
    const document = createDocument({ replica: 'abcdef' })
    const result = /** @type {any} */ (
      tools.run(makeContext({ document }), 'create', { op: 'primitive.sphere', positionMm: [0, 0, 0], params: { diameter: 20 } })
    )
    expect(result.applied).toEqual([{ batchStep: 1, tool: 'create', bodyId: 'sphere-abcdef-1', recordIds: ['sphere-abcdef-1'] }])
    expect(result.scene.count).toBe(1)
    expect(result.scene.bodies[0].boundsMm[0][2]).toBeCloseTo(0, 6)
    expect(document.originOf('sphere-abcdef-1')).toBe('ai')
    expect(document.canUndo()).toBe(false)
  })

  it('appends under the mcp origin when the MCP transport calls it', () => {
    const document = createDocument({ replica: 'abcdef' })
    tools.run(makeContext({ document, origin: 'mcp' }), 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0] })
    expect(document.entries.map((entry) => entry.origin)).toEqual(['mcp'])
  })

  it('refuses an operation by name — create takes zero-operand ops only', () => {
    const document = createDocument({ replica: 'abcdef' })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'boolean.union', positionMm: [0, 0, 0] }))
    expect(result.error).toMatch(/invalid input/)
    expect(result.reason).toMatch(/input\.op must be one of/)
    expect(document.entries).toHaveLength(0)
  })

  it('requires a position: a created body is placed, never dropped at the origin by default', () => {
    const result = /** @type {any} */ (tools.run(makeContext({ document: createDocument({ replica: 'abcdef' }) }), 'create', { op: 'primitive.cuboid' }))
    expect(result.reason).toMatch(/input\.positionMm is required/)
  })

  it('returns the registry’s own refusal for a bad parameter, and changes nothing', () => {
    const document = createDocument({ replica: 'abcdef' })
    const before = snapshot(document)
    const result = /** @type {any} */ (
      tools.run(makeContext({ document }), 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [10, -1, 10] } })
    )
    expect(result).toMatchObject({ batchStep: 1, step: 1 })
    expect(result.reason).toMatch(/size\[1\]/)
    expect(snapshot(document)).toBe(before)
  })

  it('refuses a sketch whose outline crosses itself, in the sketch editor’s own words', () => {
    const document = createDocument({ replica: 'abcdef' })
    const bowTie = {
      ...SQUARE_SKETCH,
      slices: [{ id: 's1', zMm: 0, profiles: [{ id: 'p1', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 10], [10, 0], [0, 10]] }] }],
    }
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'primitive.sketch', positionMm: [0, 0, 0], params: bowTie }))
    expect(result.reason).toMatch(/crosses itself/)
    expect(document.entries).toHaveLength(0)
  })

  it('leaves the hostile-input point cap to the sketch model, which refuses it by name', () => {
    const points = Array.from({ length: 4097 }, (_, index) => [Math.cos(index), Math.sin(index)])
    const huge = { ...SQUARE_SKETCH, slices: [{ id: 's1', zMm: 0, profiles: [{ id: 'p1', kind: 'polyline', role: 'solid', closed: true, pointsMm: points }] }] }
    const document = createDocument({ replica: 'abcdef' })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'primitive.sketch', positionMm: [0, 0, 0], params: huge }))
    expect(result.reason).toMatch(/at most 4096 points/)
    expect(document.entries).toHaveLength(0)
  })

  it('inserts at the rollback marker while the document is rolled back, like every other write', () => {
    const document = createDocument({ replica: 'abcdef' })
    document.appendAll(recordsForDrop('primitive.cuboid', { x: 0, y: 0 }, document), { origin: 'local' })
    document.appendAll(recordsForDrop('primitive.sphere', { x: 60, y: 0 }, document), { origin: 'local' })
    document.rollBackTo('cuboid-abcdef-1', { origin: 'local' })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'primitive.cone', positionMm: [-60, 0, 0] }))
    expect(result.error).toBeUndefined()
    expect(document.entries.map((entry) => entry.record.id)).toEqual(['cuboid-abcdef-1', 'cone-abcdef-3', 'sphere-abcdef-2'])
    expect(document.rollbackAt()).toBe(2)
    expect(result.scene.bodies.map((/** @type {any} */ body) => body.id)).toEqual(['cuboid-abcdef-1', 'cone-abcdef-3'])
  })
})

describe('create — a sketch from a curve spec (TODO/sketch-008)', () => {
  it('samples a curve profile into a closed polyline that keeps its source, and builds a lofted wing', () => {
    const document = createDocument({ replica: 'abcdef' })
    const tools = createToolRegistry()
    const wing = {
      slices: [
        { id: 's1', zMm: 0, profiles: [{ id: 'root', kind: 'curve', role: 'solid', curve: 'naca4', params: { code: '2412', chordMm: 120, points: 80 }, atMm: [0, 0] }] },
        {
          id: 's2',
          zMm: 200,
          offsetMm: [30, 0],
          rotateDeg: -2,
          profiles: [{ id: 'tip', kind: 'curve', role: 'solid', curve: 'naca4', params: { code: '2412', chordMm: 70, points: 60 }, atMm: [0, 0] }],
        },
      ],
      extrusion: { method: 'loft', resolution: 0 },
    }
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'primitive.sketch', positionMm: [0, 0, 0], params: wing }))
    expect(result.error).toBeUndefined()
    expect(result.reason).toBeUndefined()
    const record = /** @type {any} */ (document.entries[0].record)
    const root = record.params.slices[0].profiles[0]
    expect(root.kind).toBe('polyline')
    expect(root.closed).toBe(true)
    expect(root.pointsMm).toHaveLength(80)
    expect(root.source).toEqual({ curve: 'naca4', params: { code: '2412', chordMm: 120, points: 80 }, atMm: [0, 0] })
    expect(record.params.slices[1].offsetMm).toEqual([30, 0])
    expect(record.params.slices[1].rotateDeg).toBe(-2)
  })

  it('refuses a bad curve by naming the field, and writes nothing', () => {
    const document = createDocument({ replica: 'abcdef' })
    const tools = createToolRegistry()
    const bad = {
      slices: [{ id: 's1', zMm: 0, profiles: [{ id: 'p', kind: 'curve', role: 'solid', curve: 'naca4', params: { code: '2412', chordMm: 0 } }] }],
      extrusion: { method: 'linear', heightMm: 5 },
    }
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'primitive.sketch', positionMm: [0, 0, 0], params: bad }))
    expect(result.reason ?? result.error).toMatch(/chordMm/)
    expect(document.entries).toHaveLength(0)
  })
})

