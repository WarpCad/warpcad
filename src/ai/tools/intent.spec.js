// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { INTENT_MAX_LENGTH } from '../../core/intent.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry, toStrictWire } from './index.js'

/**
 * `TODO/ai-003` — every record an AI write lands carries its design intent: the user's
 * message that started the turn (`ctx.request`) plus the model's own one-line `rationale`
 * for the call, capped. And the read tools give it back, so a fresh model reading the
 * project can see why each step exists.
 */

const tools = createToolRegistry()
const REQUEST = 'Make a bracket for a 20 mm tube'
const CUBE = { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } }
const SPHERE = { op: 'primitive.sphere', positionMm: [10, 0, 0], params: { diameter: 20 } }

describe('write tools set intent', () => {
  it('create: request plus rationale, on every record it appends', () => {
    const document = createDocument()
    const result = /** @type {any} */ (
      tools.run(makeContext({ document, request: REQUEST }), 'create', { ...CUBE, rationale: 'Base block' })
    )
    expect(result.error).toBeUndefined()
    expect(document.entries.map((entry) => entry.intent)).toEqual([`${REQUEST}\n— Base block`])
  })

  it('operate: the same — each call carries its own rationale', () => {
    const document = createDocument()
    tools.run(makeContext({ document, request: REQUEST }), 'create', CUBE)
    const id = document.bodies()[0].id
    tools.run(makeContext({ document, request: REQUEST }), 'operate', {
      op: 'transform.translate',
      operands: [{ id }],
      params: { deltaMm: [5, 0, 0] },
      rationale: 'Clear the tube',
    })
    expect(document.entries.map((entry) => entry.intent)).toEqual([REQUEST, `${REQUEST}\n— Clear the tube`])
  })

  it('apply_records: one rationale per call, on every record of the call', () => {
    const document = createDocument()
    const result = /** @type {any} */ (
      tools.run(makeContext({ document, request: REQUEST }), 'apply_records', {
        steps: [{ create: CUBE }, { create: SPHERE }],
        rationale: 'Two blanks to subtract',
      })
    )
    expect(result.error).toBeUndefined()
    expect(new Set(document.entries.map((entry) => entry.intent))).toEqual(new Set([`${REQUEST}\n— Two blanks to subtract`]))
  })

  it('no request and no rationale: no intent at all (absent, not empty)', () => {
    const document = createDocument()
    tools.run(makeContext({ document }), 'create', CUBE)
    expect('intent' in document.entries[0]).toBe(false)
  })

  it('is capped, however long the request and rationale are', () => {
    const document = createDocument()
    tools.run(makeContext({ document, request: 'q'.repeat(9000) }), 'create', { ...CUBE, rationale: 'r'.repeat(9000) })
    expect(/** @type {string} */ (document.entries[0].intent).length).toBeLessThanOrEqual(INTENT_MAX_LENGTH)
  })

  it('refuses a non-string rationale by name, before anything is built', () => {
    const document = createDocument()
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'create', { ...CUBE, rationale: 7 }))
    expect(result.error).toBe('invalid input')
    expect(result.reason).toMatch(/rationale/)
    expect(document.entries).toHaveLength(0)
  })

  it('rationale is an optional, described string in every write tool’s strict schema', () => {
    for (const name of ['create', 'operate', 'apply_records']) {
      const tool = /** @type {any} */ (tools.tools.find((candidate) => candidate.name === name))
      const wire = /** @type {any} */ (toStrictWire(tool.inputSchema))
      expect(wire.properties.rationale).toMatchObject({ type: 'string' })
      expect(wire.properties.rationale.description).toMatch(/one line/i)
      expect(wire.required).not.toContain('rationale')
    }
  })
})

describe('read tools return intent', () => {
  function built() {
    const document = createDocument()
    document.append(
      { id: 'plain', op: 'primitive.cuboid', name: 'Plain', params: { size: [5, 5, 5], center: [40, 0, 2.5] } },
      { origin: 'local' },
    )
    tools.run(makeContext({ document, request: REQUEST }), 'create', { ...CUBE, rationale: 'Base block' })
    return document
  }

  it('get_timeline: each row with an intent says it; a row without one has no field', () => {
    const result = /** @type {any} */ (tools.run(makeContext({ document: built() }), 'get_timeline', {}))
    expect(result.rows.map((/** @type {any} */ row) => row.intent)).toEqual([undefined, `${REQUEST}\n— Base block`])
    expect('intent' in result.rows[0]).toBe(false)
  })

  it('describe_scene and describe_body: a body’s latest intent', () => {
    const document = built()
    const scene = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_scene', {}))
    const made = scene.bodies.find((/** @type {any} */ body) => body.id !== 'plain')
    expect(made.intent).toBe(`${REQUEST}\n— Base block`)
    expect('intent' in scene.bodies.find((/** @type {any} */ body) => body.id === 'plain')).toBe(false)
    const one = /** @type {any} */ (tools.run(makeContext({ document }), 'describe_body', { id: made.id }))
    expect(one.intent).toBe(`${REQUEST}\n— Base block`)
  })

  it('a write’s own scene summary does not repeat every intent back (it costs tokens every call)', () => {
    const document = built()
    const result = /** @type {any} */ (tools.run(makeContext({ document, request: REQUEST }), 'create', SPHERE))
    expect(result.scene.bodies.every((/** @type {any} */ body) => !('intent' in body))).toBe(true)
  })
})
