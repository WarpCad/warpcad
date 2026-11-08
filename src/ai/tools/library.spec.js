// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { piBoltRepeated } from '../../core/__fixtures__/piScenes.js'
import { makeContext } from './__fixtures__/context.js'
import { definePartFromSelection } from '../../core/library.js'
import { resetUserParts, setLibraryParts, setProjectParts } from '../../core/userPart.js'
import { createToolRegistry } from './index.js'

/**
 * `TODO/ai-008` — `save_to_library` **proposes** and never saves. A model does not write to the
 * user's persistent library unprompted: the tool checks that the body can be captured as a part
 * (`core-037`'s `definePartFromSelection`, run against the turn's fork) and that the name is
 * usable, and returns the proposal. The Save happens only when the user taps Confirm in the chat
 * (`ai-save-confirm`, `e2e/ai-drawing.e2e.js`). The tool has no storage handle to write with —
 * `limits.spec.js` checks statically that no tool module reaches IndexedDB.
 */

const tools = createToolRegistry()

function setup() {
  const document = createDocument()
  const proposals = /** @type {any[]} */ ([])
  const ctx = { ...makeContext({ document }), proposals }
  /** @param {string} name @param {any} input */
  const run = (name, input) => /** @type {any} */ (tools.run(ctx, name, input))
  const plate = run('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [85, 56, 1.6] } }).applied[0].bodyId
  const usb = run('create', { op: 'primitive.cuboid', positionMm: [30, 0, 1.6], params: { size: [17, 13, 16] } }).applied[0].bodyId
  const group = run('operate', { op: 'group.assemble', operands: [{ id: plate }, { id: usb }], params: { names: ['Board', 'USB-A'] } })
  expect(group.error).toBeUndefined()
  const groupId = group.applied[0].bodyId
  return { document, ctx, run, proposals, groupId, plate }
}

describe('save_to_library refuses a repeat (TODO/ui-076)', () => {
  it('returns core\'s refusal and builds no proposal', () => {
    const document = piBoltRepeated()
    const proposals = /** @type {any[]} */ ([])
    const ctx = { ...makeContext({ document }), proposals }
    const repeat = document.bodies().find((body) => body.recordId === 'rep-1')
    if (!repeat) throw new Error('no repeat body')
    const result = /** @type {any} */ (tools.run(ctx, 'save_to_library', { id: repeat.id, name: 'Rep' }))
    expect(result.error).toMatch(/repeat can't be saved/i)
    expect(proposals).toHaveLength(0)
  })
})

describe('group.assemble takes explicit part names (so sub-parts stay addressable)', () => {
  it('names the parts as asked', () => {
    const { document, groupId } = setup()
    const record = document.records.find((entry) => entry.id === groupId)
    expect(/** @type {any} */ (record?.params).names).toEqual(['Board', 'USB-A'])
  })

  it('refuses a names list of the wrong length, by name', () => {
    const document = createDocument()
    const ctx = makeContext({ document })
    const a = /** @type {any} */ (tools.run(ctx, 'create', { op: 'primitive.cuboid', positionMm: [0, 0, 0] })).applied[0].bodyId
    const b = /** @type {any} */ (tools.run(ctx, 'create', { op: 'primitive.cuboid', positionMm: [40, 0, 0] })).applied[0].bodyId
    const result = /** @type {any} */ (tools.run(ctx, 'operate', { op: 'group.assemble', operands: [{ id: a }, { id: b }], params: { names: ['Only one'] } }))
    expect(result.error).toMatch(/name/)
  })
})

describe('save_to_library', () => {
  afterEach(() => resetUserParts())

  it('proposes the name and writes nothing', () => {
    const { run, document, groupId, proposals } = setup()
    const before = document.entries.length
    const version = document.version
    const result = run('save_to_library', { id: groupId, name: 'Pi 7 board' })
    expect(result.error).toBeUndefined()
    expect(result.saved).toBe(false)
    expect(result.proposed).toEqual({ bodyId: groupId, name: 'Pi 7 board' })
    expect(result.note).toMatch(/Confirm/)
    expect(document.entries).toHaveLength(before)
    expect(document.version).toBe(version)
    expect(proposals).toEqual([{ bodyId: groupId, name: 'Pi 7 board' }])
  })

  it('has no expose input any more (TODO/ui-105): a saved part is fixed', () => {
    const definition = tools.definitions('ai').find((tool) => tool.name === 'save_to_library')
    expect(Object.keys(/** @type {any} */ (definition).inputSchema.properties).sort()).toEqual(['id', 'name', 'rationale'])
  })

  it('the latest proposal in a turn replaces an earlier one', () => {
    const { run, groupId, proposals } = setup()
    run('save_to_library', { id: groupId, name: 'First' })
    run('save_to_library', { id: groupId, name: 'Second' })
    expect(proposals.map((p) => p.name)).toEqual(['Second'])
  })

  it('refuses an unusable name and an unknown body', () => {
    const { run, groupId } = setup()
    expect(run('save_to_library', { id: groupId, name: '   ' }).error).toMatch(/name/i)
    expect(run('save_to_library', { id: 'nope-1', name: 'X' }).error).toMatch(/nope-1/)
  })

  it('accepts a name only the open project carries, and refuses one My parts holds', () => {
    const { run, document, groupId } = setup()
    const definition = definePartFromSelection(document, groupId, { name: 'Board kit' })
    setProjectParts([definition])
    expect(run('save_to_library', { id: groupId, name: 'Board kit' }).error).toBeUndefined()
    setLibraryParts([definition])
    expect(run('save_to_library', { id: groupId, name: 'board kit' }).error).toMatch(/already exists/)
  })

  it('refuses a name the body is built from, with no kernel work', () => {
    const { run, document, groupId } = setup()
    const inner = definePartFromSelection(document, groupId, { name: 'Inner kit' })
    setProjectParts([inner])
    document.append({ id: 'inner-1', op: inner.op, name: 'Inner kit 1', params: {} }, { origin: 'local' })
    const result = run('save_to_library', { id: 'inner-1', name: 'Inner kit' })
    expect(result.error).toBe('Inner kit is built from a part with that name — pick another name.')
  })

  it('is browser-only: over MCP there is no one to tap Confirm', () => {
    expect(tools.definitions('mcp').map((tool) => tool.name)).not.toContain('save_to_library')
    expect(tools.definitions('ai').map((tool) => tool.name)).toContain('save_to_library')
  })
})
