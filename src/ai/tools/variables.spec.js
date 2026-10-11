// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LOCAL, centreOf, piAndCube, snapCubeTo } from '../../core/__fixtures__/piScenes.js'
import { createDocument } from '../../core/document.js'
import { serializeProject } from '../../core/project.js'
import { VARIABLE_OP, bindabilityError } from '../../core/variables.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry, toStrictWire } from './index.js'
import { LIMITS, createTurn } from './limits.js'
import { STRICT_UNSUPPORTED, keywordsOf } from './schema.js'

/**
 * `TODO/ai-014` — the project-variable tools: thin wrappers over `src/core/variables.js` and
 * `dependents.variableImpactOf`, run through the registry the way both transports run them.
 * No kernel worker and no network: the document folds synchronously in Node.
 */

const tools = createToolRegistry()

const VARIABLE_TOOLS = Object.freeze([
  'bind_param',
  'define_variable',
  'delete_variable',
  'list_variables',
  'rename_variable',
  'set_variable',
  'unbind_param',
])
const WRITE_TOOLS = VARIABLE_TOOLS.filter((name) => name !== 'list_variables')

const PI_MODEL = Object.freeze({
  name: 'piModel',
  kind: 'enum',
  value: 4,
  label: 'Pi model',
  options: [
    { value: 4, label: 'Pi 4' },
    { value: 5, label: 'Pi 5' },
  ],
})

/** @param {import('../../core/document.js').WarpDocument} document */
const text = (document) => serializeProject(document)

/**
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {string} name
 * @param {any} input
 * @param {{ origin?: string, turn?: import('./limits.js').Turn, request?: string }} [options]
 * @returns {any}
 */
function run(document, name, input, options = {}) {
  return tools.run(makeContext({ document, ...options }), name, input)
}

/**
 * A 40 mm cube with a small cube snapped to it — data-007's shape. The spec binds the base's
 * height to a variable; `height` builds the same tower with a literal, to compare against.
 *
 * @param {number} [height]
 */
function boundTower(height = 40) {
  const document = createDocument()
  document.append({ id: 'base-1', op: 'primitive.cuboid', name: 'Base 1', params: { size: [40, 40, height], center: [0, 0, 20] } }, LOCAL)
  document.append({ id: 'top-1', op: 'primitive.cuboid', name: 'Top 1', params: { size: [6, 6, 6], center: [100, 0, 3] } }, LOCAL)
  document.append(
    { id: 'snap-1', op: 'group.snap', target: 'top-1', operands: ['base-1'], supersedes: 'top-1', params: { axes: 'z', orientation: 'outside+', deltaMm: 0 } },
    LOCAL,
  )
  return document
}

describe('the seven tools are registered for both transports', () => {
  it('lists every variable tool over ai and mcp', () => {
    for (const transport of /** @type {const} */ (['ai', 'mcp'])) {
      const names = tools.toolsFor(transport).map((tool) => tool.name)
      for (const name of VARIABLE_TOOLS) expect(names, `${transport}: ${name}`).toContain(name)
    }
  })

  it('each schema survives toStrictWire: closed objects, required lists, no unsupported keyword', () => {
    for (const name of VARIABLE_TOOLS) {
      const tool = /** @type {any} */ (tools.tools.find((candidate) => candidate.name === name))
      const wire = /** @type {any} */ (toStrictWire(tool.inputSchema))
      for (const keyword of STRICT_UNSUPPORTED) expect(keywordsOf(wire).has(keyword), `${name}: ${keyword}`).toBe(false)
      /** @param {any} node */
      const walk = (node) => {
        if (node.type === 'object') {
          expect(node.additionalProperties, name).toBe(false)
          expect(Array.isArray(node.required), name).toBe(true)
        }
        for (const child of Object.values(node.properties ?? {})) walk(child)
        if (node.items) walk(node.items)
        for (const branch of node.anyOf ?? []) walk(branch)
      }
      walk(wire)
      expect(tool.description.length, name).toBeGreaterThan(40)
    }
  })

  it('every write tool takes an optional rationale; the read tool does not', () => {
    for (const name of VARIABLE_TOOLS) {
      const tool = /** @type {any} */ (tools.tools.find((candidate) => candidate.name === name))
      const writes = WRITE_TOOLS.includes(name)
      expect('rationale' in tool.inputSchema.properties, name).toBe(writes)
      if (writes) expect(tool.inputSchema.required, name).not.toContain('rationale')
    }
  })

  it('var.define is not a kernel op: list_ops never offers it, and create refuses it', () => {
    const document = createDocument()
    const ops = run(document, 'list_ops', {})
    expect(JSON.stringify(ops)).not.toContain(VARIABLE_OP)
    const created = run(document, 'create', { op: VARIABLE_OP, positionMm: [0, 0, 0], params: { name: 'x', kind: 'number', value: 1 } })
    expect(created.error).toBeDefined()
    const batch = run(document, 'apply_records', { steps: [{ create: { op: VARIABLE_OP, positionMm: [0, 0, 0] } }] })
    expect(batch.error).toBeDefined()
    expect(document.entries).toHaveLength(0)
  })

  it('refuses a local origin outright — an AI write never reaches the user’s undo stack', () => {
    expect(() => run(createDocument(), 'define_variable', { name: 'wall', kind: 'number', value: 2 }, { origin: 'local' })).toThrow(/local/)
  })
})

describe('list_variables', () => {
  it('an empty project has none', () => {
    expect(run(createDocument(), 'list_variables', {})).toEqual({ count: 0, variables: [] })
  })

  it('lists each variable with its value in words and what reads it, by record and slot', () => {
    const document = piAndCube()
    run(document, 'define_variable', PI_MODEL)
    run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })
    const result = run(document, 'list_variables', {})
    expect(result.count).toBe(1)
    expect(result.variables[0]).toMatchObject({
      name: 'piModel',
      kind: 'enum',
      value: 4,
      valueLabel: 'Pi 4',
      label: 'Pi model',
      options: PI_MODEL.options,
      usedBy: [{ recordId: 'pi-1', name: 'Raspberry Pi 1', kind: 'binding', path: 'model' }],
    })
  })

  it('with an id, also lists the slots that record offers to bind (bindableParams), and what each is bound to', () => {
    const document = piAndCube()
    run(document, 'define_variable', PI_MODEL)
    run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })
    const result = run(document, 'list_variables', { id: 'pi-1' })
    expect(result.bindable.id).toBe('pi-1')
    const model = result.bindable.slots.find((/** @type {any} */ slot) => slot.path === 'model')
    expect(model).toMatchObject({ kind: 'enum', boundTo: 'piModel' })
    expect(model.options.map((/** @type {any} */ option) => option.value)).toEqual([2, 3, 4, 5])
    const clearance = result.bindable.slots.find((/** @type {any} */ slot) => slot.path === 'clearance')
    expect(clearance).toMatchObject({ kind: 'number', unit: 'mm' })
    expect('boundTo' in clearance).toBe(false)
  })

  it('a rotate step offers no slot and says why, in core’s own words', () => {
    const document = piAndCube()
    document.append({ id: 'turn-1', op: 'transform.rotate', target: 'pi-1-move', supersedes: 'pi-1-move', params: { angles: [0, 0, 90], center: [0, 0, 0], rotation: [0, 0, 90] } }, LOCAL)
    const result = run(document, 'list_variables', { id: 'turn-1' })
    expect(result.bindable.slots).toEqual([])
    expect(result.bindable.reason).toBe(bindabilityError(/** @type {any} */ (document.recordOf('turn-1'))))
  })

  it('an unknown id is refused by name', () => {
    expect(run(createDocument(), 'list_variables', { id: 'nope-1' }).error).toMatch(/nope-1/)
  })
})

describe('define_variable', () => {
  for (const origin of /** @type {const} */ (['ai', 'mcp'])) {
    it(`appends one var.define record with origin ${origin}, never on the local undo stack`, () => {
      const document = createDocument()
      const turn = createTurn()
      const result = run(document, 'define_variable', { name: 'wall', kind: 'number', value: 2, unit: 'mm', min: 1 }, { origin, turn })
      expect(result.error).toBeUndefined()
      expect(result.variable).toMatchObject({ name: 'wall', kind: 'number', value: 2, unit: 'mm', min: 1 })
      expect(document.entries).toHaveLength(1)
      expect(document.entries[0].record.op).toBe(VARIABLE_OP)
      expect(document.entries[0].origin).toBe(origin)
      expect(result.recordId).toBe(document.entries[0].record.id)
      expect(document.canUndo()).toBe(false)
      expect(turn.stats.records).toBe(1)
    })
  }

  it('stores the request and rationale as the record’s design intent', () => {
    const document = createDocument()
    run(document, 'define_variable', { name: 'wall', kind: 'number', value: 2, rationale: 'One wall for the whole case' }, { request: 'Make the walls adjustable' })
    expect(document.entries[0].intent).toBe('Make the walls adjustable\n— One wall for the whole case')
  })

  it('refuses a name already taken, by name, and writes nothing', () => {
    const document = createDocument()
    run(document, 'define_variable', { name: 'wall', kind: 'number', value: 2 })
    const before = text(document)
    const result = run(document, 'define_variable', { name: 'wall', kind: 'number', value: 3 })
    expect(result.error).toMatch(/"wall" is already defined/)
    expect(text(document)).toBe(before)
  })

  it('refuses a value outside its own options, in core’s words', () => {
    const document = createDocument()
    const result = run(document, 'define_variable', { ...PI_MODEL, value: 7 })
    expect(result.error).toMatch(/7/)
    expect(document.entries).toHaveLength(0)
  })

  it('refuses a kind that is not number, boolean or enum before anything runs', () => {
    const result = run(createDocument(), 'define_variable', { name: 'x', kind: 'string', value: 'a' })
    expect(result.error).toBe('invalid input')
    expect(result.reason).toMatch(/kind/)
  })

  it('counts against the records-per-turn cap and stops the turn there', () => {
    const document = createDocument()
    const turn = createTurn({ limits: { ...LIMITS, recordsPerTurn: 1 } })
    expect(run(document, 'define_variable', { name: 'a', kind: 'number', value: 1 }, { turn }).error).toBeUndefined()
    const second = run(document, 'define_variable', { name: 'b', kind: 'number', value: 1 }, { turn })
    expect(second).toMatchObject({ stop: true, limit: 'recordsPerTurn' })
    expect(document.entries).toHaveLength(1)
  })
})

describe('set_variable', () => {
  it('changes the value of every bound param in one revision, and returns the blast radius', () => {
    const document = boundTower()
    run(document, 'define_variable', { name: 'h', kind: 'number', value: 40, unit: 'mm' })
    run(document, 'bind_param', { id: 'base-1', path: 'size.2', name: 'h' })
    const undoTop = document.pendingUndo()
    const result = run(document, 'set_variable', { name: 'h', value: 60 })
    expect(result.error).toBeUndefined()
    expect(result).toMatchObject({ name: 'h', from: 40, to: 60, changedParams: 1, parts: 1, breakages: [] })
    expect(result.summary).toBe('h 40 mm → 60 mm — 1 parameter on 1 part changed')
    expect(result.scene.count).toBe(2)
    // data-007 through a variable: the snapped cube follows the taller base, exactly where a
    // literal 60 mm base would have put it.
    const after = centreOf(document, 'top-1')
    const expected = centreOf(boundTower(60), 'top-1')
    for (let axis = 0; axis < 3; axis += 1) expect(after[axis]).toBeCloseTo(expected[axis], 6)
    expect(centreOf(boundTower(40), 'top-1')[2]).not.toBeCloseTo(expected[2], 3)
    expect(document.pendingUndo()).toBe(undoTop)
  })

  it('refuses an unknown variable by name', () => {
    expect(run(createDocument(), 'set_variable', { name: 'nope', value: 1 }).error).toMatch(/no variable named "nope"/)
  })

  it('refuses a value of the wrong kind, in core’s words, and writes nothing', () => {
    const document = createDocument()
    run(document, 'define_variable', { name: 'wall', kind: 'number', value: 2 })
    const before = text(document)
    const result = run(document, 'set_variable', { name: 'wall', value: true })
    expect(result.error).toBeDefined()
    expect(text(document)).toBe(before)
  })

  it('a value that breaks a dependent is refused with the impact check’s breakages, and nothing changes', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    run(document, 'define_variable', PI_MODEL)
    run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })
    const before = text(document)
    const result = run(document, 'set_variable', { name: 'piModel', value: 5 })
    expect(result.error).toMatch(/piModel/)
    expect(result.error).toMatch(/nothing was changed/i)
    expect(result.breakages).toHaveLength(1)
    expect(result.breakages[0]).toMatchObject({ recordId: 'snap-1', relationship: expect.stringMatching(/Snap/) })
    expect(result.breakages[0].reason).toMatch(/Pi 5/)
    expect(text(document)).toBe(before)
  })

  it('an unchanged value is a no-op that says so', () => {
    const document = createDocument()
    run(document, 'define_variable', { name: 'wall', kind: 'number', value: 2 })
    const before = text(document)
    expect(run(document, 'set_variable', { name: 'wall', value: 2 })).toMatchObject({ unchanged: true })
    expect(text(document)).toBe(before)
  })
})

describe('bind_param and unbind_param', () => {
  it('binds the Pi’s model to piModel: the record holds the binding, the Pi still builds', () => {
    const document = piAndCube()
    const undoTop = document.pendingUndo()
    run(document, 'define_variable', PI_MODEL)
    const result = run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })
    expect(result.error).toBeUndefined()
    expect(result.bound).toEqual({ id: 'pi-1', path: 'model', name: 'piModel' })
    expect(document.recordOf('pi-1')?.params?.model).toEqual({ $var: 'piModel' })
    expect(result.scene.bodies.map((/** @type {any} */ body) => body.id)).toContain('pi-1')
    expect(document.pendingUndo()).toBe(undoTop)
  })

  it('refuses a variable of the wrong kind for the slot, in core’s words', () => {
    const document = piAndCube()
    run(document, 'define_variable', { name: 'wall', kind: 'number', value: 2 })
    const result = run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'wall' })
    expect(result.error).toMatch(/takes a choice/)
    expect(document.recordOf('pi-1')?.params?.model).toBe(4)
  })

  it('refuses a rotate step, passing bindableParams’ reason through verbatim', () => {
    const document = piAndCube()
    document.append({ id: 'turn-1', op: 'transform.rotate', target: 'pi-1-move', supersedes: 'pi-1-move', params: { angles: [0, 0, 90], center: [0, 0, 0], rotation: [0, 0, 90] } }, LOCAL)
    run(document, 'define_variable', { name: 'angle', kind: 'number', value: 90, unit: 'deg' })
    const before = text(document)
    const result = run(document, 'bind_param', { id: 'turn-1', path: 'angles.2', name: 'angle' })
    const reason = /** @type {string} */ (bindabilityError(/** @type {any} */ (document.recordOf('turn-1'))))
    expect(reason).toMatch(/rotations are not bindable/)
    expect(result.error).toContain(reason)
    expect(text(document)).toBe(before)
  })

  it('refuses an unknown variable and an unknown slot by name, listing the slots that are bindable', () => {
    const document = piAndCube()
    expect(run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'nope' }).error).toMatch(/"nope"/)
    run(document, 'define_variable', PI_MODEL)
    const slot = run(document, 'bind_param', { id: 'pi-1', path: 'colour', name: 'piModel' })
    expect(slot.error).toMatch(/colour/)
    expect(slot.error).toMatch(/model, clearance/)
  })

  it('unbind keeps the current value as a literal; unbinding a literal is refused', () => {
    const document = piAndCube()
    run(document, 'define_variable', { ...PI_MODEL, value: 5 })
    run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })
    const result = run(document, 'unbind_param', { id: 'pi-1', path: 'model' })
    expect(result.error).toBeUndefined()
    expect(result.unbound).toEqual({ id: 'pi-1', path: 'model', value: 5 })
    expect(document.recordOf('pi-1')?.params?.model).toBe(5)
    expect(run(document, 'unbind_param', { id: 'pi-1', path: 'model' }).error).toMatch(/not bound/)
  })
})

describe('rename_variable and delete_variable', () => {
  it('rename rewrites every binding and reports how many', () => {
    const document = piAndCube()
    run(document, 'define_variable', PI_MODEL)
    run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })
    const result = run(document, 'rename_variable', { from: 'piModel', to: 'boardModel' })
    expect(result).toMatchObject({ renamed: { from: 'piModel', to: 'boardModel' }, rewritten: 1 })
    expect(document.recordOf('pi-1')?.params?.model).toEqual({ $var: 'boardModel' })
    expect(run(document, 'list_variables', {}).variables.map((/** @type {any} */ v) => v.name)).toEqual(['boardModel'])
  })

  it('rename refuses a name already taken', () => {
    const document = createDocument()
    run(document, 'define_variable', { name: 'a', kind: 'number', value: 1 })
    run(document, 'define_variable', { name: 'b', kind: 'number', value: 1 })
    expect(run(document, 'rename_variable', { from: 'a', to: 'b' }).error).toMatch(/"b" is already defined/)
  })

  it('delete of a variable in use is refused without keepValues, naming who reads it', () => {
    const document = piAndCube()
    run(document, 'define_variable', PI_MODEL)
    run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })
    const before = text(document)
    const result = run(document, 'delete_variable', { name: 'piModel' })
    expect(result.error).toMatch(/Raspberry Pi 1/)
    expect(result.usedBy).toEqual([{ recordId: 'pi-1', name: 'Raspberry Pi 1', kind: 'binding', path: 'model' }])
    expect(text(document)).toBe(before)
  })

  it('delete with keepValues rewrites the bindings to their current values and removes the definition', () => {
    const document = piAndCube()
    run(document, 'define_variable', { ...PI_MODEL, value: 5 })
    run(document, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' })
    const result = run(document, 'delete_variable', { name: 'piModel', keepValues: true })
    expect(result.error).toBeUndefined()
    expect(result).toMatchObject({ deleted: 'piModel', keptValues: 1 })
    expect(document.recordOf('pi-1')?.params?.model).toBe(5)
    expect(document.entries.some((entry) => entry.record.op === VARIABLE_OP)).toBe(false)
  })

  it('an unknown variable is refused by name', () => {
    expect(run(createDocument(), 'delete_variable', { name: 'nope' }).error).toMatch(/"nope"/)
    expect(run(createDocument(), 'rename_variable', { from: 'nope', to: 'x' }).error).toMatch(/"nope"/)
  })
})

describe('caps and atomicity', () => {
  it('a variable write past the step cap is refused, and the turn is over', () => {
    const document = createDocument()
    const turn = createTurn({ limits: { ...LIMITS, stepsPerTurn: 1 } })
    run(document, 'define_variable', { name: 'a', kind: 'number', value: 1 }, { turn })
    const before = text(document)
    expect(run(document, 'set_variable', { name: 'a', value: 2 }, { turn })).toMatchObject({ stop: true, limit: 'stepsPerTurn' })
    expect(text(document)).toBe(before)
  })

  it('the motivating case on one document: define, bind, 4 → 5 → 4 — every write is ai-origin, none is local', () => {
    const document = piAndCube()
    const undoTop = document.pendingUndo()
    const ctx = makeContext({ document })
    expect(tools.run(ctx, 'define_variable', PI_MODEL).error).toBeUndefined()
    expect(tools.run(ctx, 'bind_param', { id: 'pi-1', path: 'model', name: 'piModel' }).error).toBeUndefined()
    const five = tools.run(ctx, 'set_variable', { name: 'piModel', value: 5 })
    expect(five).toMatchObject({ from: 4, to: 5, changedParams: 1, breakages: [] })
    expect(five.summary).toBe('piModel Pi 4 → Pi 5 — 1 parameter on 1 part changed')
    expect(tools.run(ctx, 'set_variable', { name: 'piModel', value: 4 })).toMatchObject({ from: 5, to: 4 })
    // Nothing reached the user's own undo stack: its top is still their last local step.
    expect(document.pendingUndo()).toBe(undoTop)
    expect(document.entries.filter((entry) => entry.origin === 'ai').map((entry) => entry.record.op)).toEqual([VARIABLE_OP])
    expect(ctx.turn.stats.records).toBe(1)
  })
})
