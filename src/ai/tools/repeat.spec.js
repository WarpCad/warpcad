// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { piBoltOnHole1, piBoltRepeated } from '../../core/__fixtures__/piScenes.js'
import { serializeProject } from '../../core/project.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'
import { LIMITS } from './limits.js'

/**
 * `TODO/core-061` decision 11: one `repeat` tool in the shared registry, so the MCP server and
 * the BYOK chat both get it with no transport code of their own.
 */

const tools = createToolRegistry()

const INPUT = Object.freeze({ source: 'bolt-1', seedBody: 'pi-1', seedPart: 'hole1', targets: ['hole2', 'hole3', 'hole4'] })

/**
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {any} input
 * @param {{ origin?: string, request?: string }} [options]
 * @returns {any}
 */
function run(document, input, options = {}) {
  return tools.run(makeContext({ document, ...options }), 'repeat', input)
}

describe('the repeat tool', () => {
  it('is listed on both transports, and its description sends the model to describe_body first', () => {
    for (const transport of /** @type {const} */ (['ai', 'mcp', 'webmcp'])) {
      expect(tools.toolsFor(transport).map((tool) => tool.name)).toContain('repeat')
    }
    const tool = /** @type {any} */ (tools.tools.find((candidate) => candidate.name === 'repeat'))
    expect(tool.description).toMatch(/describe_body/)
    expect(tool.inputSchema.required).toEqual(['source', 'seedBody', 'seedPart', 'targets'])
    expect(tool.inputSchema.properties.targets.maxItems).toBe(LIMITS.repeatTargets)
  })

  for (const origin of ['ai', 'mcp']) {
    it(`appends one pattern.repeat with origin ${origin}, never on the local undo stack`, () => {
      const document = piBoltOnHole1()
      const undoBefore = document.pendingUndo()
      const result = run(document, { ...INPUT, rationale: 'same screw on every hole' }, { origin, request: 'Put the same screw on the other three holes.' })
      expect(result.error).toBeUndefined()
      expect(result.applied).toEqual([{ batchStep: 1, tool: 'repeat', bodyId: expect.any(String), recordIds: [result.applied[0].bodyId] }])
      const last = document.entries.at(-1)
      expect(last?.record).toEqual({ id: result.applied[0].bodyId, op: 'pattern.repeat', params: { source: 'bolt-1', seed: { id: 'pi-1', pieces: 'hole1' }, targets: ['hole2', 'hole3', 'hole4'] } })
      expect(last?.origin).toBe(origin)
      expect(last?.intent).toMatch(/same screw/)
      // Undo AI turn, not the user's own Undo, takes it back.
      expect(document.pendingUndo()).toBe(undoBefore)
      expect(result.scene.bodies.find((/** @type {any} */ body) => body.op === 'pattern.repeat')).toMatchObject({ name: 'Bolt 1 ×3' })
    })
  }

  it('a refusal returns the reason as an error and writes nothing', () => {
    const document = piBoltOnHole1()
    const before = serializeProject(document)
    const result = run(document, { ...INPUT, seedPart: 'hole2', targets: ['hole3'] })
    expect(result.error).toBe("Nothing in Bolt 1's steps refers to hole2, so every repeat would land on Bolt 1")
    expect(serializeProject(document)).toBe(before)
    expect(run(document, { ...INPUT, targets: ['hole9'] }).error).toBe('Raspberry Pi 1 has no part named hole9')
    expect(run(document, { ...INPUT, source: 'made-up' }).error).toMatch(/describe_scene/)
    expect(serializeProject(document)).toBe(before)
  })

  it('enforces the targets limit in code', () => {
    const document = piBoltOnHole1()
    const before = serializeProject(document)
    const targets = Array.from({ length: LIMITS.repeatTargets + 1 }, (_, index) => `hole${index + 2}`)
    const result = run(document, { ...INPUT, targets })
    expect(result.error).toBe('invalid input')
    expect(result.reason).toMatch(/at most 64/)
    expect(serializeProject(document)).toBe(before)
  })

  it('describe_body and describe_scene read a repeat back: source, seed and targets', () => {
    const document = piBoltRepeated()
    const body = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_body', { id: 'rep-1' }))
    expect(body.repeat).toEqual({
      source: { id: 'bolt-1', name: 'Bolt 1' },
      seed: { body: 'pi-1', part: 'hole1' },
      targets: ['hole2', 'hole3', 'hole4'],
      members: ['hole2', 'hole3', 'hole4'],
      broken: [],
      inactive: [],
    })
    const scene = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_scene', {}))
    expect(scene.bodies.find((/** @type {any} */ candidate) => candidate.id === 'rep-1').repeat).toEqual(body.repeat)
  })
})
