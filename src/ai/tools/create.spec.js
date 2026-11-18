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

  it('refuses a point count over the sketch model\'s cap, in the schema and again in the model', () => {
    const points = Array.from({ length: 4097 }, (_, index) => [Math.cos(index), Math.sin(index)])
    const huge = { ...SQUARE_SKETCH, slices: [{ id: 's1', zMm: 0, profiles: [{ id: 'p1', kind: 'polyline', role: 'solid', closed: true, pointsMm: points }] }] }
    const document = createDocument({ replica: 'abcdef' })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'primitive.sketch', positionMm: [0, 0, 0], params: huge }))
    expect(result.reason).toMatch(/at most 4096 (points|items)/)
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


describe('create — an optional name (TODO/FIND-ai-041 gap 3)', () => {
  const tools = createToolRegistry()

  it('names the body with the same style.rename record the Inspector’s rename writes', () => {
    const document = createDocument({ replica: 'abcdef' })
    const twin = createDocument({ replica: 'abcdef' })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], name: '  Lid ' }))
    expect(result.error).toBeUndefined()
    const bodyId = result.applied[0].bodyId
    expect(document.bodies().find((body) => body.id === bodyId)?.name).toBe('Lid')
    expect(result.scene.bodies[0].name).toBe('Lid')

    tools.run(makeContext({ document: twin }), 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0] })
    const { record } = twin.renameBody(bodyId, 'Lid', { origin: 'ai' })
    expect(document.entries.map((entry) => entry.record)).toEqual(twin.entries.map((entry) => entry.record))
    expect(record.op).toBe('style.rename')
    expect(document.entries.map((entry) => entry.origin)).toEqual(['ai', 'ai'])
  })

  it('names a composite after its drop, so the rename continues the placed body', () => {
    const document = createDocument({ replica: 'abcdef' })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'hardware.bolt', positionMm: [0, 0, 0], name: 'Hinge pin' }))
    expect(result.error).toBeUndefined()
    const records = document.entries.map((entry) => entry.record)
    expect(records.map((record) => record.op)).toEqual(['hardware.bolt', 'transform.translate', 'style.rename'])
    expect(records[2]).toMatchObject({ target: records[1].id, supersedes: records[1].id, params: { name: 'Hinge pin' } })
    expect(document.bodies().find((body) => body.id === result.applied[0].bodyId)?.name).toBe('Hinge pin')
  })

  it('without a name, writes exactly what it always did', () => {
    const document = createDocument({ replica: 'abcdef' })
    tools.run(makeContext({ document }), 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0] })
    expect(document.entries.map((entry) => entry.record.op)).toEqual(['primitive.cuboid'])
    expect(document.bodies()[0].name).toBe('Cube 1')
  })

  it('refuses a blank name, and changes nothing', () => {
    const document = createDocument({ replica: 'abcdef' })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], name: '   ' }))
    expect(result.reason).toMatch(/name must not be blank/)
    expect(document.entries).toHaveLength(0)
  })
})

describe('copy — a new body with the same op and params (TODO/FIND-ai-045)', () => {
  const tools = createToolRegistry()
  const LOCAL = { origin: 'local' }

  /**
   * A cylinder placed by hand at (15, −5), and the context to copy it in.
   *
   * @returns {{ document: import('../../core/document.js').WarpDocument, ctx: import('./index.js').ToolContext, pin: string }}
   */
  function placedPin() {
    const document = createDocument({ replica: 'abcdef' })
    const records = recordsForDrop('primitive.cylinder', { x: 15, y: -5 }, document, { diameter: 8, height: 20 })
    document.appendAll(records, LOCAL)
    return { document, ctx: makeContext({ document }), pin: /** @type {string} */ (records[0].id) }
  }

  /**
   * @param {import('../../core/document.js').WarpDocument} document
   * @param {string} id
   * @returns {import('../../core/document.js').Body}
   */
  const bodyOf = (document, id) => /** @type {any} */ (document.bodies().find((body) => body.id === id))

  /**
   * @param {[number, number, number][]} actual
   * @param {[number, number, number][]} expected
   */
  function expectSameBounds(actual, expected) {
    for (let corner = 0; corner < 2; corner += 1) {
      for (let axis = 0; axis < 3; axis += 1) expect(actual[corner][axis]).toBeCloseTo(expected[corner][axis], 6)
    }
  }

  it('is a write on both transports, and takes a rationale', () => {
    for (const transport of /** @type {const} */ (['ai', 'mcp'])) {
      expect(tools.toolsFor(transport).map((tool) => tool.name)).toContain('copy')
    }
    const tool = /** @type {any} */ (tools.tools.find((candidate) => candidate.name === 'copy'))
    expect(tool.inputSchema.required).toEqual(['id'])
    expect('rationale' in tool.inputSchema.properties).toBe(true)
  })

  it('copies a cylinder: same op and params, where the source stands, under its own name and the call’s origin', () => {
    const { document, ctx, pin } = placedPin()
    const result = /** @type {any} */ (tools.run(ctx, 'copy', { id: pin, name: 'Pin cutter' }))
    expect(result.error).toBeUndefined()
    const copy = result.applied[0].bodyId
    expect(copy).not.toBe(pin)
    expect(result.applied[0].tool).toBe('copy')
    const source = bodyOf(document, pin)
    const made = bodyOf(document, copy)
    expect(made).toMatchObject({ op: 'primitive.cylinder', name: 'Pin cutter' })
    expect(made.params.diameter).toBe(8)
    expect(made.params.height).toBe(20)
    expectSameBounds(boundsOf(made.geometry), boundsOf(source.geometry))
    expect(document.originOf(copy)).toBe('ai')
    // Only the hand placement is the user's; the copy and its rename are the call's.
    expect(document.entries.map((entry) => [entry.record.op, entry.origin])).toEqual([
      ['primitive.cylinder', 'local'],
      ['primitive.cylinder', 'ai'],
      ['style.rename', 'ai'],
    ])
  })

  it('is independent of its source: editing either leaves the other as it was', () => {
    const { document, ctx, pin } = placedPin()
    const copy = /** @type {any} */ (tools.run(ctx, 'copy', { id: pin })).applied[0].bodyId
    expect(bodyOf(document, copy).name).toBe('Cylinder 2')

    const sourceRecord = /** @type {any} */ (document.recordOf(pin))
    document.replaceRecord(pin, { ...sourceRecord, params: { ...sourceRecord.params, diameter: 12 } }, LOCAL)
    expect(bodyOf(document, pin).params.diameter).toBe(12)
    expect(bodyOf(document, copy).params.diameter).toBe(8)
    expect(boundsOf(bodyOf(document, copy).geometry)[1][0] - boundsOf(bodyOf(document, copy).geometry)[0][0]).toBeCloseTo(8, 1)

    const copyRecord = /** @type {any} */ (document.recordOf(copy))
    document.replaceRecord(copy, { ...copyRecord, params: { ...copyRecord.params, height: 5 } }, LOCAL)
    expect(bodyOf(document, copy).params.height).toBe(5)
    expect(bodyOf(document, pin).params.height).toBe(20)
  })

  it('places the copy at positionMm when given, the way create places a body', () => {
    const { document, ctx, pin } = placedPin()
    const copy = /** @type {any} */ (tools.run(ctx, 'copy', { id: pin, positionMm: [50, 0, 3] })).applied[0].bodyId
    const [min, max] = boundsOf(bodyOf(document, copy).geometry)
    expect((min[0] + max[0]) / 2).toBeCloseTo(50, 6)
    expect((min[1] + max[1]) / 2).toBeCloseTo(0, 6)
    expect(min[2]).toBeCloseTo(3, 6)
  })

  it('copies one part of a group as a body of its own, where the part stands, and leaves the group alone', () => {
    const { document, ctx, pin } = placedPin()
    const block = recordsForDrop('primitive.cuboid', { x: 15, y: -5 }, document, { size: [30, 30, 10] })
    document.appendAll(block, LOCAL)
    const grouped = /** @type {any} */ (
      tools.run(ctx, 'operate', { op: 'group.assemble', operands: [{ id: /** @type {string} */ (block[0].id) }, { id: pin }], params: { names: ['Base', 'Pin'] } })
    )
    const group = grouped.applied[0].bodyId
    tools.run(ctx, 'operate', { op: 'transform.translate', operands: [{ id: group }], params: { deltaMm: [0, 40, 0] } })
    const before = JSON.stringify(document.entries.map((entry) => entry.record))

    const result = /** @type {any} */ (tools.run(ctx, 'copy', { id: group, part: 'Pin' }))
    expect(result.error).toBeUndefined()
    const made = bodyOf(document, result.applied[0].bodyId)
    expect(made).toMatchObject({ op: 'primitive.cylinder' })
    expect(made.params).toMatchObject({ diameter: 8, height: 20 })
    const partGeometry = /** @type {any} */ (bodyOf(document, group).geometry).parts.Pin
    expectSameBounds(boundsOf(made.geometry), boundsOf(partGeometry))
    expect(JSON.stringify(document.entries.slice(0, -1).map((entry) => entry.record))).toBe(before)
  })

  it('lands as an apply_records step, so a cutter copied from a round pin and the cut it makes land together', () => {
    const { document, ctx, pin } = placedPin()
    const block = recordsForDrop('primitive.cuboid', { x: 15, y: -5 }, document, { size: [30, 30, 10] })
    document.appendAll(block, LOCAL)
    const group = /** @type {any} */ (
      tools.run(ctx, 'operate', { op: 'group.assemble', operands: [{ id: /** @type {string} */ (block[0].id) }, { id: pin }], params: { names: ['Base', 'Pin'] } })
    ).applied[0].bodyId
    const result = /** @type {any} */ (
      tools.run(ctx, 'apply_records', {
        steps: [
          { copy: { id: group, part: 'Pin' } },
          { operate: { op: 'modify.enlarge', operands: [{ id: '@1' }], params: { deltaMm: [0.4, 0.4, 0.4] } } },
          { operate: { op: 'boolean.subtract', operands: [{ id: group, pieces: 'Base' }, { id: '@2' }] } },
        ],
      })
    )
    expect(result.error).toBeUndefined()
    expect(result.applied.map((/** @type {any} */ step) => step.tool)).toEqual(['copy', 'operate', 'operate'])
    // The cut is a new body that keeps both parts; the cutter is used up.
    const after = /** @type {any} */ (bodyOf(document, result.applied[2].bodyId))
    expect(Object.keys(after.geometry.parts).sort()).toEqual(['Base', 'Pin'])
    expect(document.bodies()).toHaveLength(1)
  })

  it('refuses a body create cannot place, a step that is not on screen, and a blank name — writing nothing', () => {
    const { document, ctx, pin } = placedPin()
    const block = recordsForDrop('primitive.cuboid', { x: 15, y: -5 }, document, { size: [30, 30, 10] })
    document.appendAll(block, LOCAL)
    const group = /** @type {any} */ (
      tools.run(ctx, 'operate', { op: 'group.assemble', operands: [{ id: /** @type {string} */ (block[0].id) }, { id: pin }], params: { names: ['Base', 'Pin'] } })
    ).applied[0].bodyId
    const before = JSON.stringify(document.entries)
    // A fresh turn per call: three refusals in a row would stop one turn (limits.js's failure streak).
    /** @param {Record<string, any>} input */
    const copy = (input) => /** @type {any} */ (tools.run(makeContext({ document }), 'copy', input))
    expect(copy({ id: group }).error).toMatch(/group\.assemble/)
    expect(copy({ id: pin }).error).toMatch(/not a body on screen/)
    expect(copy({ id: group, part: 'Peg' }).error).toMatch(/"Peg"/)
    const blank = copy({ id: group, part: 'Pin', name: '  ' })
    expect(blank.reason ?? blank.error).toMatch(/name must not be blank/)
    expect(JSON.stringify(document.entries)).toBe(before)
  })
})
