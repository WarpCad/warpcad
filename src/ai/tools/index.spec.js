// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { boundsOf, volumeOf } from '../../core/kernel/group.js'
import { recordsForDrop } from '../../core/library.js'
import { fakeRegistry } from './__fixtures__/fakeRegistry.js'
import { fakeSelection, makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'
import { LIMITS, createTurn } from './limits.js'

describe('a whole "cube, sphere, subtract" session through the registry, in plain Node', () => {
  for (const origin of /** @type {const} */ (['ai', 'mcp'])) {
    it(`builds the part and leaves a document the UI would have written (origin ${origin})`, () => {
      const tools = createToolRegistry()
      const document = createDocument({ replica: 'abcdef' })
      const ctx = makeContext({ document, origin, ...(origin === 'ai' ? { selection: fakeSelection() } : {}) })

      // 1. Look first: an empty scene.
      expect(tools.run(ctx, 'describe_scene', {})).toMatchObject({ count: 0 })

      // 2. What can be made, and what can be done to it.
      const ops = /** @type {any} */ (tools.run(ctx, 'list_ops', {}))
      expect(ops.create.map((/** @type {any} */ row) => row.op)).toContain('primitive.cuboid')
      expect(ops.operate.map((/** @type {any} */ row) => row.op)).toContain('boolean.subtract')

      // 3. A 20 mm cube resting on the grid at the origin.
      const cube = /** @type {any} */ (tools.run(ctx, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } }))
      expect(cube.error).toBeUndefined()
      const cubeId = cube.applied[0].bodyId

      // 4. A 20 mm sphere centred on the cube's +X face.
      const sphere = /** @type {any} */ (tools.run(ctx, 'create', { op: 'primitive.sphere', positionMm: [10, 0, 0], params: { diameter: 20 } }))
      const sphereId = sphere.applied[0].bodyId
      expect(sphere.scene.count).toBe(2)

      // 5. Point at them for the human (browser only), then subtract.
      if (origin === 'ai') expect(tools.run(ctx, 'select', { ids: [cubeId, sphereId] })).toMatchObject({ ids: [cubeId, sphereId] })
      const cut = /** @type {any} */ (tools.run(ctx, 'operate', { op: 'boolean.subtract', operands: [{ id: cubeId }, { id: sphereId }] }))
      expect(cut.error).toBeUndefined()
      expect(cut.scene.count).toBe(1)

      // The result: one body, the cube's box, with a hemisphere's worth of volume gone.
      const [body] = document.bodies()
      expect(body.op).toBe('boolean.subtract')
      const [min, max] = boundsOf(body.geometry)
      expect(min[0]).toBeCloseTo(-10, 6)
      expect(max[0]).toBeCloseTo(10, 6)
      expect(min[2]).toBeCloseTo(0, 6)
      expect(max[2]).toBeCloseTo(20, 6)
      const hemisphere = ((4 / 3) * Math.PI * 10 ** 3) / 2
      // A faceted sphere removes a little less than the analytic hemisphere: hold the
      // difference to 5% of what was removed.
      expect(volumeOf(body.geometry)).toBeLessThan(8000)
      expect(Math.abs(volumeOf(body.geometry) - (8000 - hemisphere)) / hemisphere).toBeLessThan(0.05)

      // The log is exactly what a human's two drags and a Subtract click would have
      // appended — only the origin differs.
      const human = createDocument({ replica: 'abcdef' })
      human.appendAll(recordsForDrop('primitive.cuboid', { x: 0, y: 0 }, human, { size: [20, 20, 20] }), { origin: 'local' })
      human.appendAll(recordsForDrop('primitive.sphere', { x: 10, y: 0 }, human, { diameter: 20 }), { origin: 'local' })
      human.append(
        { id: human.nextId('bool'), op: 'boolean.subtract', name: human.nextName('Subtract'), target: cubeId, operands: [sphereId], consumes: [cubeId, sphereId] },
        { origin: 'local' }
      )
      expect(document.records).toEqual(human.records)
      expect(document.entries.map((entry) => entry.origin)).toEqual([origin, origin, origin])

      // Never the user's to undo: the AI turn is not on the local stack.
      expect(document.canUndo()).toBe(false)
      const timeline = /** @type {any} */ (tools.run(ctx, 'get_timeline', {}))
      expect(timeline.rows.map((/** @type {any} */ row) => row.origin)).toEqual([origin, origin, origin])
      expect(ctx.turn.stats.records).toBe(3)
    })
  }
})

describe('createToolRegistry', () => {
  it('lists tools sorted by name with deterministic JSON, so the cached prompt prefix never shifts', () => {
    const first = createToolRegistry()
    const second = createToolRegistry()
    for (const transport of /** @type {const} */ (['ai', 'mcp'])) {
      const names = first.toolsFor(transport).map((tool) => tool.name)
      expect(names).toEqual([...names].sort())
      expect(JSON.stringify(first.definitions(transport))).toBe(JSON.stringify(second.definitions(transport)))
    }
  })

  it('offers the spec’s tools, and the browser gets the selection, capture, image and save-proposal tools on top of MCP’s', () => {
    const tools = createToolRegistry()
    const mcp = tools.toolsFor('mcp').map((tool) => tool.name)
    // ai-014: the seven project-variable tools are on both transports.
    expect(mcp).toEqual([
      'apply_records',
      'bind_param',
      'check_clearance',
      'check_printability',
      'create',
      'define_variable',
      'delete_variable',
      'describe_body',
      'describe_scene',
      'get_timeline',
      'list_ops',
      'list_variables',
      'measure',
      'operate',
      'rename_variable',
      'set_variable',
      'unbind_param',
    ])
    // ai-008: the image tools and save_to_library are browser-only too (attachments live in the
    // chat; a library save needs a person to tap Confirm).
    expect(tools.toolsFor('ai').map((tool) => tool.name)).toEqual(
      [...mcp, 'capture_view', 'get_reference_image', 'get_selection', 'locate_in_image', 'save_to_library', 'select', 'set_reference_scale'].sort()
    )
  })

  it('never lists capture_view over MCP (no GPU there), and refuses it by name if called anyway', () => {
    const tools = createToolRegistry()
    expect(tools.definitions('mcp').map((definition) => definition.name)).not.toContain('capture_view')
    const result = tools.run(makeContext({ document: createDocument({ replica: 'abcdef' }), origin: 'mcp' }), 'capture_view', { view: 'iso' })
    expect(result.error).toMatch(/capture_view/)
    expect(result.error).toMatch(/viewport/)
  })

  it('never offers a catch-all tool that takes any op — creation and operation stay separate', () => {
    const tools = createToolRegistry()
    const create = tools.toolsFor('ai').find((tool) => tool.name === 'create')
    const operate = tools.toolsFor('ai').find((tool) => tool.name === 'operate')
    /** @param {any} schema */
    const opsOf = (schema) => new Set(schema.properties.op.enum)
    const created = opsOf(create?.inputSchema)
    const operated = opsOf(operate?.inputSchema)
    expect(created.size).toBeGreaterThan(10)
    expect(operated.size).toBeGreaterThan(5)
    expect([...created].filter((op) => operated.has(op))).toEqual([])
  })

  it('gives each definition a name, a description and an object input schema (the Messages API requires one)', () => {
    for (const definition of createToolRegistry().definitions('ai')) {
      expect(Object.keys(definition).sort()).toEqual(['description', 'inputSchema', 'name'])
      expect(definition.description.length).toBeGreaterThan(40)
      expect(definition.inputSchema.type).toBe('object')
    }
  })

  it('names the op when params do not fit it, rather than a vague "matches nothing"', () => {
    const tools = createToolRegistry()
    const result = /** @type {any} */ (
      tools.run(makeContext({ document: createDocument({ replica: 'abcdef' }) }), 'create', { op: 'primitive.sphere', positionMm: [0, 0, 0], params: { size: [1, 1, 1] } })
    )
    expect(result.error).toBe('invalid input')
    expect(result.reason).toMatch(/input\.params has unknown field "size"/)
    expect(result.reason).toMatch(/primitive\.sphere/)
  })

  it('answers an unknown tool by name, without throwing', () => {
    const tools = createToolRegistry()
    expect(tools.run(makeContext({ document: createDocument({ replica: 'abcdef' }) }), 'add_feature', {})).toMatchObject({ error: expect.stringMatching(/add_feature/) })
  })

  it('refuses a browser-only tool on the MCP transport', () => {
    const tools = createToolRegistry()
    expect(tools.run(makeContext({ document: createDocument({ replica: 'abcdef' }), origin: 'mcp' }), 'select', { ids: [] })).toMatchObject({ error: expect.stringMatching(/select/) })
  })

  it('checks the input shape before a tool runs, and names what is wrong', () => {
    const tools = createToolRegistry()
    const result = /** @type {any} */ (tools.run(makeContext({ document: createDocument({ replica: 'abcdef' }) }), 'describe_body', { id: 7 }))
    expect(result).toMatchObject({ error: 'invalid input' })
    expect(result.reason).toMatch(/input\.id must be a string/)
  })

  it('stops the turn after three consecutive failures of one tool and says so', () => {
    const tools = createToolRegistry()
    const ctx = makeContext({ document: createDocument({ replica: 'abcdef' }) })
    const call = () => /** @type {any} */ (tools.run(ctx, 'describe_body', { id: 'missing-1' }))
    expect(call().stop).toBeUndefined()
    expect(call().stop).toBeUndefined()
    const third = call()
    expect(third).toMatchObject({ stop: true, limit: 'consecutiveFailures' })
    expect(third.error).toMatch(/missing-1/)
    expect(/** @type {any} */ (tools.run(ctx, 'describe_scene', {}))).toMatchObject({ stop: true })
  })

  it('stops the turn at the step cap', () => {
    const tools = createToolRegistry()
    const ctx = makeContext({ document: createDocument({ replica: 'abcdef' }), turn: createTurn({ limits: { ...LIMITS, stepsPerTurn: 1 } }) })
    expect(/** @type {any} */ (tools.run(ctx, 'describe_scene', {})).stop).toBeUndefined()
    expect(tools.run(ctx, 'describe_scene', {})).toMatchObject({ stop: true, limit: 'stepsPerTurn' })
  })

  it('runs every tool against a fake registry too', () => {
    const tools = createToolRegistry({ registry: fakeRegistry })
    const document = createDocument({ registry: fakeRegistry, replica: 'abcdef' })
    const ctx = makeContext({ document, selection: fakeSelection() })
    const made = /** @type {any} */ (tools.run(ctx, 'create', { op: 'fake.block', positionMm: [0, 0, 0] }))
    const id = made.applied[0].bodyId
    expect(tools.run(ctx, 'describe_body', { id })).toMatchObject({ id, op: 'fake.block' })
    expect(tools.run(ctx, 'select', { ids: [id] })).toMatchObject({ ids: [id] })
    expect(tools.run(ctx, 'get_selection', {})).toMatchObject({ ids: [id] })
    expect(/** @type {any} */ (tools.run(ctx, 'operate', { op: 'transform.translate', operands: [{ id }], params: { deltaMm: [0, 0, 5] } })).error).toBeUndefined()
    expect(/** @type {any} */ (tools.run(ctx, 'get_timeline', {})).rows).toHaveLength(2)
    expect(/** @type {any} */ (tools.run(ctx, 'apply_records', { steps: [{ create: { op: 'fake.block', positionMm: [30, 0, 0] } }] })).error).toBeUndefined()
    expect(document.bodies()).toHaveLength(2)
  })
})
