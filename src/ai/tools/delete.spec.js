// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LOCAL, piBoltRepeated } from '../../core/__fixtures__/piScenes.js'
import { createDocument } from '../../core/document.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry, toStrictWire } from './index.js'
import { STRICT_UNSUPPORTED, keywordsOf } from './schema.js'

/**
 * `TODO/FIND-ai-051`: `delete_bodies`, what Delete and Remove part do, for an agent.
 */

const tools = createToolRegistry()

/**
 * @param {import('../../core/document.js').WarpDocument} document
 * @param {any} input
 * @param {{ origin?: string, request?: string }} [options]
 * @returns {any}
 */
function run(document, input, options = {}) {
  return tools.run(makeContext({ document, ...options }), 'delete_bodies', input)
}

function twoCubes() {
  const document = createDocument()
  document.append({ id: 'a-1', op: 'primitive.cuboid', name: 'A 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }, LOCAL)
  document.append({ id: 'b-1', op: 'primitive.cuboid', name: 'B 1', params: { size: [6, 6, 6], center: [40, 0, 3] } }, LOCAL)
  return document
}

describe('delete_bodies', () => {
  it('is a write tool on every transport, with a strict-wire schema and a description that says not to hide attempts', () => {
    for (const transport of /** @type {const} */ (['ai', 'mcp', 'webmcp'])) {
      expect(tools.toolsFor(transport).map((tool) => tool.name)).toContain('delete_bodies')
    }
    const tool = /** @type {any} */ (tools.tools.find((candidate) => candidate.name === 'delete_bodies'))
    expect(tool.description).toMatch(/Do not merge them into a scratch body/)
    expect(tool.inputSchema.required).toEqual(['ids'])
    const wire = /** @type {any} */ (toStrictWire(tool.inputSchema))
    for (const keyword of STRICT_UNSUPPORTED) expect(keywordsOf(wire).has(keyword), keyword).toBe(false)
  })

  for (const origin of ['ai', 'mcp', 'webmcp']) {
    it(`deletes one body with origin ${origin}, carrying the rationale as intent`, () => {
      const document = twoCubes()
      const result = run(document, { ids: ['a-1'], rationale: 'discarded attempt' }, { origin })
      expect(result.error).toBeUndefined()
      expect(result.deleted).toEqual([{ id: 'a-1', name: 'A 1' }])
      expect(result.scene.bodies.map((/** @type {any} */ body) => body.id)).toEqual(['b-1'])
      const last = document.entries.at(-1)
      expect(last?.record.op).toBe('body.delete')
      expect(last?.origin).toBe(origin)
      expect(last?.intent).toMatch(/discarded attempt/)
    })
  }

  it('deletes two bodies in one call as one labelled change with two tombstones, off the local undo stack', () => {
    const document = twoCubes()
    const before = document.entries.length
    const undoBefore = document.pendingUndo()
    const result = run(document, { ids: ['a-1', 'b-1'] })
    expect(result.scene.count).toBe(0)
    expect(document.entries.length - before).toBe(2)
    expect(document.entries.slice(before).map((entry) => entry.record.op)).toEqual(['body.delete', 'body.delete'])
    expect(document.pendingUndo()).toBe(undoBefore)
  })

  it('Undo AI turn (removeRecords) brings a deleted body back with its params', () => {
    const document = twoCubes()
    const result = run(document, { ids: ['a-1'] }, { origin: 'ai' })
    expect(result.scene.count).toBe(1)
    const tombstones = document.entries.filter((entry) => entry.record.op === 'body.delete').map((entry) => /** @type {string} */ (entry.record.id))
    document.removeRecords(tombstones, { origin: 'ai' })
    const scene = tools.run(makeContext({ document }), 'describe_scene', {})
    expect(scene.bodies.find((/** @type {any} */ body) => body.id === 'a-1')?.sizeMm).toEqual([10, 10, 10])
  })

  it('refuses, changing nothing, for an unknown id, an already-deleted body, a duplicate and an empty list', () => {
    const document = twoCubes()
    expect(run(document, { ids: ['nope'] }).error).toMatch(/no body "nope"/)
    expect(run(document, { ids: [] }).error).toMatch(/at least one body/)
    expect(run(document, { ids: ['a-1', 'a-1'] }).error).toMatch(/named twice/)
    expect(document.entries.length).toBe(2)
    run(document, { ids: ['a-1'] })
    expect(run(document, { ids: ['a-1'] }).error).toMatch(/not a body on screen/)
  })

  it('refuses part with more than one id', () => {
    expect(run(twoCubes(), { ids: ['a-1', 'b-1'], part: 'x' }).error).toMatch(/exactly one id/)
  })

  describe('with a Repeat that follows the body', () => {
    it('refuses without repeats, listing the followers and writing nothing', () => {
      const document = piBoltRepeated()
      const before = document.entries.length
      const result = run(document, { ids: ['bolt-1'] })
      expect(result.error).toMatch(/repeats "delete"/)
      expect(result.followers).toEqual([{ id: 'rep-1', name: expect.any(String) }])
      expect(document.entries.length).toBe(before)
    })

    it("'delete' removes the Repeat with the body", () => {
      const document = piBoltRepeated()
      const result = run(document, { ids: ['bolt-1'], repeats: 'delete' })
      expect(result.error).toBeUndefined()
      expect(result.deleted.map((/** @type {any} */ entry) => entry.id)).toEqual(['bolt-1', 'rep-1'])
      expect(result.scene.bodies.some((/** @type {any} */ body) => body.id === 'rep-1')).toBe(false)
    })

    it("'leave-broken' deletes only the body and flags the Repeat row", () => {
      const document = piBoltRepeated()
      const result = run(document, { ids: ['bolt-1'], repeats: 'leave-broken' })
      expect(result.error).toBeUndefined()
      expect(result.deleted).toEqual([{ id: 'bolt-1', name: expect.any(String) }])
      expect(document.entries.find((entry) => entry.record.id === 'rep-1')?.leftBroken).toBe(true)
    })
  })
})
