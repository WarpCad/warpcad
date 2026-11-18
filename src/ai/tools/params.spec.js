// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LOCAL } from '../../core/__fixtures__/piScenes.js'
import { createDocument } from '../../core/document.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry, toStrictWire } from './index.js'
import { STRICT_UNSUPPORTED, keywordsOf } from './schema.js'

/**
 * `TODO/FIND-ai-046`: `set_params`, a direct size edit of a placed body, through the same
 * `paramEditRecord` + `reviseRecords` the Inspector's Parameters section uses.
 */

const tools = createToolRegistry()

/**
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {string} name
 * @param {any} input
 * @param {{ origin?: string }} [options]
 * @returns {any}
 */
function run(document, name, input, options = {}) {
  return tools.run(makeContext({ document, ...options }), name, input)
}

/** A 20 mm cube with a small one snapped on top, so a resize has a dependent to carry. */
function tower() {
  const document = createDocument()
  document.append({ id: 'base-1', op: 'primitive.cuboid', name: 'Base 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }, LOCAL)
  document.append({ id: 'top-1', op: 'primitive.cuboid', name: 'Top 1', params: { size: [6, 6, 6], center: [100, 0, 3] } }, LOCAL)
  document.append(
    { id: 'snap-1', op: 'group.snap', target: 'top-1', operands: ['base-1'], supersedes: 'top-1', params: { axes: 'z', orientation: 'outside+', deltaMm: 0 } },
    LOCAL,
  )
  return document
}

/**
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {string} id
 * @returns {number[]}
 */
const sizeOf = (document, id) => /** @type {number[]} */ (run(document, 'describe_scene', {}).bodies.find((/** @type {any} */ body) => body.id === id).sizeMm)

describe('set_params', () => {
  it('is a write tool over ai and mcp, with a strict-wire schema and a rationale', () => {
    for (const transport of /** @type {const} */ (['ai', 'mcp'])) {
      expect(tools.toolsFor(transport).map((tool) => tool.name)).toContain('set_params')
    }
    const tool = /** @type {any} */ (tools.tools.find((candidate) => candidate.name === 'set_params'))
    const wire = /** @type {any} */ (toStrictWire(tool.inputSchema))
    for (const keyword of STRICT_UNSUPPORTED) expect(keywordsOf(wire).has(keyword), keyword).toBe(false)
    expect('rationale' in tool.inputSchema.properties).toBe(true)
    expect(tool.inputSchema.required).not.toContain('rationale')
  })

  it("changes a box's width, the geometry rebuilds, and the snapped body follows", () => {
    const document = tower()
    const topBefore = run(document, 'describe_body', { id: 'top-1' }).positionMm
    const result = run(document, 'set_params', { id: 'base-1', params: [{ name: 'size', value: [30, 20, 40] }] })
    expect(result.error).toBeUndefined()
    expect(result.edited).toMatchObject({ id: 'base-1', params: { size: [30, 20, 40] } })
    expect(sizeOf(document, 'base-1')).toEqual([30, 20, 40])
    expect(run(document, 'describe_body', { id: 'top-1' }).positionMm).not.toEqual(topBefore)
    expect(result.scene.count).toBe(2)
  })

  it('writes as the AI, so the user’s own undo stack is untouched', () => {
    const document = tower()
    const undoTop = document.pendingUndo()
    run(document, 'set_params', { id: 'base-1', params: [{ name: 'size', value: [30, 20, 20] }], rationale: 'wider base' }, { origin: 'mcp' })
    expect(document.pendingUndo()).toBe(undoTop)
    expect(sizeOf(document, 'base-1')).toEqual([30, 20, 20])
  })

  it('refuses a local origin outright', () => {
    expect(() => run(tower(), 'set_params', { id: 'base-1', params: [{ name: 'size', value: [30, 20, 20] }] }, { origin: 'local' })).toThrow(/local/)
  })

  it('refuses an unknown parameter name, listing the real ones, and changes nothing', () => {
    const document = tower()
    const before = JSON.stringify(document.entries)
    const result = run(document, 'set_params', { id: 'base-1', params: [{ name: 'width', value: 30 }] })
    expect(result.error).toMatch(/no parameter "width"/)
    expect(result.error).toMatch(/size/)
    expect(JSON.stringify(document.entries)).toBe(before)
  })

  it('refuses a value the op rejects, and changes nothing', () => {
    const document = tower()
    const before = JSON.stringify(document.entries)
    expect(run(document, 'set_params', { id: 'base-1', params: [{ name: 'size', value: [0, 20, 20] }] }).error).toBeDefined()
    expect(run(document, 'set_params', { id: 'base-1', params: [{ name: 'size', value: 'big' }] }).error).toBeDefined()
    expect(JSON.stringify(document.entries)).toBe(before)
  })

  it('refuses a parameter bound to a variable, pointing at the variable', () => {
    const document = tower()
    run(document, 'define_variable', { name: 'h', kind: 'number', value: 20, unit: 'mm' })
    run(document, 'bind_param', { id: 'base-1', path: 'size.2', name: 'h' })
    const before = JSON.stringify(document.entries)
    const result = run(document, 'set_params', { id: 'base-1', params: [{ name: 'size', value: [30, 20, 30] }] })
    expect(result.error).toMatch(/bound to "h"/)
    expect(result.error).toMatch(/set_variable/)
    expect(JSON.stringify(document.entries)).toBe(before)
  })

  it('refuses an id that is not a body on screen, and a body built from operands', () => {
    const document = tower()
    expect(run(document, 'set_params', { id: 'nope-9', params: [{ name: 'size', value: [1, 1, 1] }] }).error).toBeDefined()
    const merged = run(document, 'operate', { op: 'boolean.union', operands: [{ id: 'base-1' }, { id: 'top-1' }] })
    const result = run(document, 'set_params', { id: merged.applied[0].bodyId, params: [{ name: 'size', value: [1, 1, 1] }] })
    expect(result.error).toMatch(/cannot be rebuilt/)
  })

  it('edits one part of a group by name', () => {
    const document = tower()
    const grouped = run(document, 'operate', { op: 'group.merge', operands: [{ id: 'base-1' }, { id: 'top-1' }] })
    const groupId = grouped.applied[0].bodyId
    const parts = run(document, 'describe_body', { id: groupId }).parts
    const name = parts[0].name ?? parts[0]
    const result = run(document, 'set_params', { id: groupId, part: name, params: [{ name: 'size', value: [25, 20, 20] }] })
    expect(result.error).toBeUndefined()
    expect(result.edited.part).toBe(name)
  })
})
