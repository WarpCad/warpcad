// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'
import { LIMITS } from './limits.js'

const tools = createToolRegistry()
/** @param {unknown} [input] @returns {any} */
const listOps = (input = {}) => tools.run(makeContext({ document: createDocument({ replica: 'abcdef' }), origin: 'mcp' }), 'list_ops', input)
const size = (/** @type {unknown} */ value) => JSON.stringify(value).length

describe('list_ops (TODO/ai-030)', () => {
  it('with no input (or detail: full) returns the whole catalogue, unchanged', () => {
    const full = listOps()
    expect(Object.keys(full)).toEqual(['create', 'operate'])
    expect(full.create[0]).toHaveProperty('defaults')
    expect(full.create[0]).toHaveProperty('params.properties')
    expect(listOps({ detail: 'full' })).toEqual(full)
  })

  it('detail: summary lists every op with param names only, at most 1/6 of the full size', () => {
    const full = listOps()
    const summary = listOps({ detail: 'summary' })
    expect(summary.create.map((/** @type {any} */ r) => r.op)).toEqual(full.create.map((/** @type {any} */ r) => r.op))
    expect(summary.operate.map((/** @type {any} */ r) => r.op)).toEqual(full.operate.map((/** @type {any} */ r) => r.op))
    expect(size(summary)).toBeLessThanOrEqual(size(full) / 6)
    for (const row of summary.create) {
      expect(row).not.toHaveProperty('defaults')
      expect(Array.isArray(row.params)).toBe(true)
    }
    expect(summary.operate[0]).toHaveProperty('partAddressable')
    expect(summary.operate[0]).not.toHaveProperty('description')
  })

  it('summary param names match the full schema keys, both ways', () => {
    const full = listOps()
    const summary = listOps({ detail: 'summary' })
    for (const kind of /** @type {const} */ (['create', 'operate'])) {
      full[kind].forEach((/** @type {any} */ row, /** @type {number} */ i) => {
        expect(summary[kind][i].params).toEqual(Object.keys(row.params.properties))
      })
    }
  })

  it('ops returns just those entries in full, in the order asked', () => {
    const result = listOps({ ops: ['boolean.subtract', 'primitive.cylinder'] })
    expect(result.create.map((/** @type {any} */ r) => r.op)).toEqual(['primitive.cylinder'])
    expect(result.operate.map((/** @type {any} */ r) => r.op)).toEqual(['boolean.subtract'])
    expect(result.create[0].defaults).toBeDefined()
    const full = listOps()
    expect(result.create[0]).toEqual(full.create.find((/** @type {any} */ r) => r.op === 'primitive.cylinder'))
    const reversed = listOps({ ops: ['primitive.sphere', 'primitive.cylinder'] })
    expect(reversed.create.map((/** @type {any} */ r) => r.op)).toEqual(['primitive.sphere', 'primitive.cylinder'])
  })

  it('an unknown id is an error naming it, with the closest known ids', () => {
    const result = listOps({ ops: ['primitive.cylinder', 'primitive.cylindr'] })
    expect(result.error).toMatch(/"primitive\.cylindr"/)
    expect(result.closest).toContain('primitive.cylinder')
    expect(result.closest.length).toBeLessThanOrEqual(5)
  })

  it('refuses an empty list, too many ids and a non-string id', () => {
    expect(listOps({ ops: [] }).error).toBe('invalid input')
    const many = Array.from({ length: LIMITS.listOpsIds + 1 }, () => 'primitive.cylinder')
    expect(listOps({ ops: many }).error).toBe('invalid input')
    expect(listOps({ ops: [3] }).error).toBe('invalid input')
    expect(listOps({ kind: 'bogus' }).error).toBe('invalid input')
    expect(listOps({ detail: 'tiny' }).error).toBe('invalid input')
  })

  it('kind keeps one half and combines with detail', () => {
    const create = listOps({ kind: 'create' })
    expect(Object.keys(create)).toEqual(['create'])
    expect(create.create[0]).toHaveProperty('defaults')
    const operate = listOps({ kind: 'operate', detail: 'summary' })
    expect(Object.keys(operate)).toEqual(['operate'])
    expect(Array.isArray(operate.operate[0].params)).toBe(true)
  })

  it('has a deterministic definition under the description cap', () => {
    const a = JSON.stringify(createToolRegistry().definitions('mcp'))
    expect(JSON.stringify(createToolRegistry().definitions('mcp'))).toBe(a)
    const definition = tools.definitions('mcp').find((d) => d.name === 'list_ops')
    expect(definition?.description.length).toBeLessThanOrEqual(2048)
    expect(definition?.description).toMatch(/summary/)
  })
})
