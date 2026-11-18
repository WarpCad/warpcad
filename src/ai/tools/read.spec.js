// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { piAndCube } from '../../core/__fixtures__/piScenes.js'
import { createDocument } from '../../core/document.js'
import { recordsForDrop } from '../../core/library.js'
import { fakeRegistry } from './__fixtures__/fakeRegistry.js'
import { fakeSelection, makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'

const LOCAL = { origin: 'local' }

/**
 * Place a Library row the way a human drag does, as the local user.
 *
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {string} op
 * @param {{ x: number, y: number }} pointMm
 * @param {Record<string, any>} [overrides]
 * @returns {string} The body id.
 */
function place(document, op, pointMm, overrides = {}) {
  const records = recordsForDrop(op, pointMm, document, overrides)
  document.appendAll(records, LOCAL)
  return /** @type {string} */ (records[0].id)
}

describe('read tools against the real registry', () => {
  const tools = createToolRegistry()

  it('describes an empty scene as empty, not as an error', () => {
    const ctx = makeContext({ document: createDocument() })
    const result = tools.run(ctx, 'describe_scene', {})
    expect(result).toEqual({ count: 0, bodies: [], rolledBack: null, inactiveBodies: [] })
  })

  it('reports each body’s id, name, op and bounds in millimetres', () => {
    const document = createDocument()
    const cube = place(document, 'primitive.cuboid', { x: 10, y: -5 }, { size: [20, 10, 4] })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_scene', {}))
    expect(result.count).toBe(1)
    const [body] = result.bodies
    expect(body).toMatchObject({ id: cube, name: 'Cube 1', op: 'primitive.cuboid', color: null, parts: [] })
    const [[minX, minY, minZ], [maxX, maxY, maxZ]] = body.boundsMm
    expect(minX).toBeCloseTo(0, 6)
    expect(maxX).toBeCloseTo(20, 6)
    expect(minY).toBeCloseTo(-10, 6)
    expect(maxY).toBeCloseTo(0, 6)
    expect(minZ).toBeCloseTo(0, 6)
    expect(maxZ).toBeCloseTo(4, 6)
    expect(body.sizeMm[0]).toBeCloseTo(20, 6)
  })

  it('names a composite’s parts, hidden ones included, so the model can address a part — and never returns a mesh', () => {
    const document = createDocument()
    const bolt = place(document, 'hardware.bolt', { x: 0, y: 0 })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_body', { id: bolt }))
    const names = result.parts.map((/** @type {any} */ part) => part.name)
    expect(names).toContain('head')
    expect(result.parts.some((/** @type {any} */ part) => part.hidden)).toBe(true)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toMatch(/polygons|vertices|"sides"/)
    expect(serialized.length).toBeLessThan(4_000)
  })

  it('reports a user colour override as a hex colour', () => {
    const document = createDocument()
    const cube = place(document, 'primitive.cuboid', { x: 0, y: 0 })
    document.setColorOverride(cube, { color: 0xff8800 }, LOCAL)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_scene', {}))
    expect(result.bodies[0].color).toBe('#ff8800')
  })

  it('describes one body with its params, position and rotation', () => {
    const document = createDocument()
    const sphere = place(document, 'primitive.sphere', { x: 0, y: 0 }, { diameter: 30 })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_body', { id: sphere }))
    expect(result).toMatchObject({ id: sphere, name: 'Sphere 1', op: 'primitive.sphere', rotationDeg: [0, 0, 0] })
    expect(result.params.diameter).toBe(30)
    expect(result.positionMm[2]).toBeCloseTo(15, 1)
  })

  it('refuses an id the document did not issue, by name', () => {
    const ctx = makeContext({ document: createDocument() })
    expect(tools.run(ctx, 'describe_body', { id: 'cuboid-99' })).toMatchObject({ error: expect.stringMatching(/cuboid-99/) })
  })

  it('lists the timeline compactly — op, label, origin, and the suppressed/active/broken flags', () => {
    const document = createDocument()
    const cube = place(document, 'primitive.cuboid', { x: 0, y: 0 })
    place(document, 'primitive.sphere', { x: 60, y: 0 })
    document.setSuppressed(cube, true, LOCAL)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'get_timeline', {}))
    expect(result.rollbackAt).toBeNull()
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({ step: 1, id: cube, op: 'primitive.cuboid', origin: 'local', suppressed: true, active: true, broken: null })
    expect(result.rows[0].label).toMatch(/Cube 1/)
    expect(result.rows[0].record).toBeUndefined()
  })

  it('reports a rolled-back document: the marker, and the bodies past it as inactive rather than missing', () => {
    const document = createDocument()
    const cube = place(document, 'primitive.cuboid', { x: 0, y: 0 })
    const sphere = place(document, 'primitive.sphere', { x: 60, y: 0 })
    document.rollBackTo(cube, LOCAL)
    const ctx = makeContext({ document })
    const scene = /** @type {any} */ (tools.run(ctx, 'describe_scene', {}))
    expect(scene.count).toBe(1)
    expect(scene.rolledBack).toEqual({ activeSteps: 1, totalSteps: 2 })
    const timeline = /** @type {any} */ (tools.run(ctx, 'get_timeline', {}))
    expect(timeline.rollbackAt).toBe(1)
    expect(timeline.rows[1]).toMatchObject({ id: sphere, active: false })
  })
})

describe('selection tools — so the human sees what the AI is talking about', () => {
  const tools = createToolRegistry()

  it('reads and sets the selection through the transport’s selection, by body id', () => {
    const document = createDocument()
    const cube = place(document, 'primitive.cuboid', { x: 0, y: 0 })
    const selection = fakeSelection()
    const ctx = makeContext({ document, selection })
    expect(tools.run(ctx, 'get_selection', {})).toEqual({ ids: [], bodies: [] })
    expect(tools.run(ctx, 'select', { ids: [cube] })).toEqual({ ids: [cube], bodies: [{ id: cube, name: 'Cube 1' }] })
    expect(selection.history).toEqual([[cube]])
    expect(tools.run(ctx, 'select', { ids: [] })).toEqual({ ids: [], bodies: [] })
  })

  it('refuses to select an id that is not a body, and leaves the selection alone', () => {
    const document = createDocument()
    const cube = place(document, 'primitive.cuboid', { x: 0, y: 0 })
    const selection = fakeSelection([cube])
    const result = tools.run(makeContext({ document, selection }), 'select', { ids: [cube, 'nope-1'] })
    expect(result).toMatchObject({ error: expect.stringMatching(/nope-1/) })
    expect(selection.ids()).toEqual([cube])
  })

  it('is browser-only: the MCP transport has no human looking at a selection', () => {
    const names = tools.toolsFor('mcp').map((tool) => tool.name)
    expect(names).not.toContain('select')
    expect(names).not.toContain('get_selection')
    expect(tools.toolsFor('ai').map((tool) => tool.name)).toEqual(expect.arrayContaining(['select', 'get_selection']))
  })
})

describe('list_ops — the catalogue, split the way the tools are', () => {
  it('lists creation ops and operations separately, with their operand counts, schemas and defaults', () => {
    const tools = createToolRegistry()
    const result = /** @type {any} */ (tools.run(makeContext({ document: createDocument() }), 'list_ops', {}))
    const cuboid = result.create.find((/** @type {any} */ row) => row.op === 'primitive.cuboid')
    expect(cuboid).toMatchObject({ label: 'Cube', kind: 'native', operandCount: 0, defaults: { size: [40, 40, 40] } })
    expect(cuboid.params.type).toBe('object')
    const subtract = result.operate.find((/** @type {any} */ row) => row.op === 'boolean.subtract')
    expect(subtract).toMatchObject({ operandCount: '2+' })
    for (const row of result.create) expect(row.operandCount).toBe(0)
    for (const row of result.operate) expect(row.operandCount).not.toBe(0)
    const all = [...result.create, ...result.operate].map((/** @type {any} */ row) => row.op)
    // Intermediate 2D ops are never offered: they are recipe plumbing, not bodies.
    expect(all).not.toContain('profile.roundedRectangle')
    expect(all).not.toContain('profile.extrudeLinear')
  })

  it('reads a fake registry the same way', () => {
    const tools = createToolRegistry({ registry: fakeRegistry })
    const document = createDocument({ registry: fakeRegistry })
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'list_ops', {}))
    expect(result.create.map((/** @type {any} */ row) => row.op)).toEqual(['fake.block'])
    expect(result.operate.map((/** @type {any} */ row) => row.op)).toEqual(['boolean.subtract', 'transform.translate'])
  })

  it('describes a fake-registry scene with real bounds', () => {
    const tools = createToolRegistry({ registry: fakeRegistry })
    const document = createDocument({ registry: fakeRegistry })
    document.append({ id: 'b1', op: 'fake.block', name: 'Block 1', params: { sizeMm: 10, center: [0, 0, 5] } }, LOCAL)
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_scene', {}))
    expect(result.bodies[0].boundsMm[1][2]).toBeCloseTo(10, 6)
  })
})

describe('variable bindings in the read tools (TODO/ai-040)', () => {
  const tools = createToolRegistry()
  const PI_MODEL = {
    name: 'piModel',
    kind: 'enum',
    value: 4,
    label: 'Pi model',
    options: [
      { value: 4, label: 'Pi 4' },
      { value: 5, label: 'Pi 5' },
    ],
  }

  it('lists boundTo on a bound body in describe_scene, so a model sees set_variable applies', () => {
    const document = piAndCube()
    const ctx = makeContext({ document })
    tools.run(ctx, 'define_variable', PI_MODEL)
    tools.run(ctx, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })
    const scene = /** @type {any} */ (tools.run(ctx, 'describe_scene', {}))
    const pi = scene.bodies.find((/** @type {any} */ body) => body.id === 'pi-1')
    expect(pi.boundTo).toEqual([{ path: 'model', variable: 'piModel', value: 4 }])
    const body = /** @type {any} */ (tools.run(ctx, 'describe_body', { id: 'pi-1' }))
    expect(body.boundTo).toEqual([{ path: 'model', variable: 'piModel', value: 4 }])
  })

  it('omits boundTo from a body with no bindings, and from every body of a project with no variables', () => {
    const document = piAndCube()
    const scene = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_scene', {}))
    for (const body of scene.bodies) expect('boundTo' in body).toBe(false)
  })
})

describe('describe_step — a step’s op and params, a consumed one included (TODO/FIND-ai-045)', () => {
  const tools = createToolRegistry()

  /**
   * A 30 × 30 × 10 block and an 8 × 20 pin through it, placed by hand.
   *
   * @returns {{ document: import('../../core/document.js').WarpDocument, ctx: import('./index.js').ToolContext, block: string, pin: string }}
   */
  function blockAndPin() {
    const document = createDocument({ replica: 'abcdef' })
    const block = place(document, 'primitive.cuboid', { x: 0, y: 0 }, { size: [30, 30, 10] })
    const pin = place(document, 'primitive.cylinder', { x: 0, y: 0 }, { diameter: 8, height: 20 })
    return { document, ctx: makeContext({ document }), block, pin }
  }

  it('is a read on both transports', () => {
    for (const transport of /** @type {const} */ (['ai', 'mcp'])) {
      expect(tools.toolsFor(transport).map((tool) => tool.name)).toContain('describe_step')
    }
    const tool = /** @type {any} */ (tools.tools.find((candidate) => candidate.name === 'describe_step'))
    expect('rationale' in tool.inputSchema.properties).toBe(false)
  })

  it('reads back a step a boolean used up: its op, its params, and which step consumed it', () => {
    const { document, ctx, block, pin } = blockAndPin()
    const cut = /** @type {any} */ (tools.run(ctx, 'operate', { op: 'boolean.subtract', operands: [{ id: block }, { id: pin }] }))
    expect(cut.error).toBeUndefined()
    expect(document.bodies().map((body) => body.id)).not.toContain(pin)
    expect(tools.run(ctx, 'describe_body', { id: pin })).toMatchObject({ error: expect.stringMatching(/not a body on screen/) })

    const step = /** @type {any} */ (tools.run(ctx, 'describe_step', { id: pin }))
    expect(step.error).toBeUndefined()
    expect(step).toMatchObject({ step: 2, id: pin, bodyId: pin, op: 'primitive.cylinder', onScreen: false, consumedBy: cut.applied[0].recordIds[0] })
    expect(step.params).toMatchObject({ diameter: 8, height: 20 })
    expect(step.label).toMatch(/Cylinder 1/)
  })

  it('reads the step that made one part of a group, by the group’s id and the part’s name', () => {
    const { ctx, block, pin } = blockAndPin()
    const grouped = /** @type {any} */ (
      tools.run(ctx, 'operate', { op: 'group.assemble', operands: [{ id: block }, { id: pin }], params: { names: ['Base', 'Pin'] } })
    )
    expect(grouped.error).toBeUndefined()
    const group = grouped.applied[0].bodyId
    const step = /** @type {any} */ (tools.run(ctx, 'describe_step', { id: group, part: 'Pin' }))
    expect(step).toMatchObject({ id: pin, op: 'primitive.cylinder', part: 'Pin', partOf: group, onScreen: false, consumedBy: grouped.applied[0].recordIds[0] })
    expect(step.params).toMatchObject({ diameter: 8, height: 20 })
  })

  it('reads a body on screen as the step that holds its params, and a later step as itself', () => {
    const { ctx, pin } = blockAndPin()
    const moved = /** @type {any} */ (tools.run(ctx, 'operate', { op: 'transform.translate', operands: [{ id: pin }], params: { deltaMm: [5, 0, 0] } }))
    expect(moved.error).toBeUndefined()
    expect(tools.run(ctx, 'describe_step', { id: pin })).toMatchObject({ id: pin, op: 'primitive.cylinder', onScreen: true })
    const move = /** @type {any} */ (tools.run(ctx, 'describe_step', { id: moved.applied[0].recordIds[0] }))
    expect(move).toMatchObject({ op: 'transform.translate', bodyId: pin, target: pin })
  })

  it('refuses an id the document did not issue, and a part the group does not have, naming the parts there are', () => {
    const { ctx, block, pin } = blockAndPin()
    expect(tools.run(ctx, 'describe_step', { id: 'cylinder-99' })).toMatchObject({ error: expect.stringMatching(/no step "cylinder-99"/) })
    expect(tools.run(ctx, 'describe_step', { id: block, part: 'Pin' })).toMatchObject({ error: expect.stringMatching(/no parts/) })
    // A fresh turn: three refusals in a row would stop this one (limits.js's failure streak).
    const next = makeContext({ document: ctx.document })
    const grouped = /** @type {any} */ (
      tools.run(next, 'operate', { op: 'group.assemble', operands: [{ id: block }, { id: pin }], params: { names: ['Base', 'Pin'] } })
    )
    const missing = /** @type {any} */ (tools.run(next, 'describe_step', { id: grouped.applied[0].bodyId, part: 'Peg' }))
    expect(missing.error).toMatch(/"Peg"/)
    expect(missing.error).toMatch(/Base, Pin/)
  })

  it('says a part made inside a recipe has no step of its own', () => {
    const document = piAndCube()
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_step', { id: 'pi-1', part: 'hole1' }))
    expect(result.error).toMatch(/hole1/)
    expect(result.error).toMatch(/no step of its own/)
  })
})
