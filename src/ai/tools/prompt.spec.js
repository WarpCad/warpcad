// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { PROMPT_LIMITS, promptsForBody } from '../../core/prompt.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'

/**
 * `TODO/ai-031`: an agent records the prompt it was given (`record_prompt`, or `prompt` on
 * `apply_records`), and every record it writes afterwards is linked to it and carries it as
 * design intent — so an agent connected over MCP or WebMCP leaves the same "why" in the project
 * the in-app Assistant does.
 */

const tools = createToolRegistry()
const DUCT = 'a 140 × 250 mm fan duct, 1.6 mm walls'
const CUBE = { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } }
const SPHERE = { op: 'primitive.sphere', positionMm: [10, 0, 0], params: { diameter: 20 } }

/** @param {Partial<import('./index.js').ToolContext>} [extra] */
function mcpContext(extra = {}) {
  const document = createDocument()
  return { ...makeContext({ document, origin: 'mcp' }), ...extra }
}

describe('record_prompt', () => {
  it('stores the prompt and echoes the stored text and its id', () => {
    const ctx = mcpContext()
    const result = /** @type {any} */ (tools.run(ctx, 'record_prompt', { prompt: `  ${DUCT}‮ ` }))
    expect(result.error).toBeUndefined()
    expect(result.prompt).toEqual({ id: expect.stringMatching(/^prompt-/), text: DUCT, truncated: false })
    expect(ctx.document.prompts()).toEqual([{ id: result.prompt.id, text: DUCT, produced: [] }])
    expect(ctx.prompt).toEqual({ id: result.prompt.id, text: DUCT })
  })

  it('a cut prompt is visible to the agent: truncated, and the text that was kept', () => {
    const ctx = mcpContext()
    const result = /** @type {any} */ (tools.run(ctx, 'record_prompt', { prompt: 'word '.repeat(1500) }))
    expect(result.prompt.truncated).toBe(true)
    expect(result.prompt.text.length).toBeLessThanOrEqual(PROMPT_LIMITS.maxTextLength)
    expect(result.prompt.text.endsWith('…')).toBe(true)
    expect(result.note).toMatch(/cut/)
  })

  it('refuses, naming the reason, and writes nothing: empty, over the cap, not text', () => {
    for (const [prompt, reason] of /** @type {[unknown, RegExp][]} */ ([
      ['   ', /empty/],
      ['a'.repeat(1024 * 1024), /over the cap/],
    ])) {
      const ctx = mcpContext()
      const result = /** @type {any} */ (tools.run(ctx, 'record_prompt', { prompt }))
      expect(result.error).toMatch(/not recorded/)
      expect(result.reason).toMatch(reason)
      expect(ctx.document.prompts()).toEqual([])
      expect(ctx.prompt).toBeUndefined()
    }
    const ctx = mcpContext()
    expect(/** @type {any} */ (tools.run(ctx, 'record_prompt', { prompt: 42 })).error).toBeDefined()
    expect(ctx.document.prompts()).toEqual([])
  })

  it('then every write links what it made, and the prompt is each new row’s intent', () => {
    const ctx = mcpContext()
    const recorded = /** @type {any} */ (tools.run(ctx, 'record_prompt', { prompt: DUCT }))
    // What a transport does between calls: carry the binding over, and use it as the request.
    const next = { ...mcpContext({ document: ctx.document }), prompt: ctx.prompt, request: ctx.prompt?.text }
    const made = /** @type {any} */ (tools.run(next, 'create', { ...CUBE, rationale: 'the outer shell' }))
    expect(made.error).toBeUndefined()
    const bodyId = made.applied[0].bodyId
    expect(ctx.document.promptOf(recorded.prompt.id)?.produced).toEqual(made.applied[0].recordIds)
    expect(ctx.document.entries[0].intent).toBe(`${DUCT}\n— the outer shell`)
    expect(promptsForBody(ctx.document, bodyId).map((p) => p.text)).toEqual([DUCT])
  })

  it('a boolean over produced bodies is linked too: the result points at the prompt', () => {
    const ctx = mcpContext()
    tools.run(ctx, 'record_prompt', { prompt: DUCT })
    const a = /** @type {any} */ (tools.run(ctx, 'create', CUBE)).applied[0].bodyId
    const b = /** @type {any} */ (tools.run(ctx, 'create', SPHERE)).applied[0].bodyId
    const union = /** @type {any} */ (tools.run(ctx, 'operate', { op: 'boolean.union', operands: [{ id: a }, { id: b }] }))
    expect(union.error).toBeUndefined()
    const result = union.applied[0].bodyId
    const produced = ctx.document.prompts()[0].produced
    expect(produced).toContain(result)
    expect(produced).toContain(a)
    expect(produced).toContain(b)
    expect(promptsForBody(ctx.document, result)).toHaveLength(1)
  })

  it('is listed for MCP and WebMCP, once, and not for the in-app chat (which records automatically)', () => {
    expect(tools.tools.filter((tool) => tool.name === 'record_prompt')).toHaveLength(1)
    expect(tools.toolsFor('mcp').map((tool) => tool.name)).toContain('record_prompt')
    expect(tools.toolsFor('webmcp').map((tool) => tool.name)).toContain('record_prompt')
    expect(tools.toolsFor('ai').map((tool) => tool.name)).not.toContain('record_prompt')
    const description = /** @type {any} */ (tools.tools.find((tool) => tool.name === 'record_prompt')).description
    expect(description).toMatch(/first/)
    expect(description).toMatch(/before/)
    expect(description).toMatch(/not a paraphrase/)
  })
})

describe('apply_records takes prompt', () => {
  it('records it and links every record of the call, as one change', () => {
    const ctx = mcpContext()
    const result = /** @type {any} */ (tools.run(ctx, 'apply_records', { prompt: DUCT, steps: [{ create: CUBE }, { create: SPHERE }] }))
    expect(result.error).toBeUndefined()
    const [prompt] = ctx.document.prompts()
    expect(prompt.text).toBe(DUCT)
    expect(prompt.produced).toEqual(ctx.document.entries.map((entry) => entry.record.id).sort())
    expect(result.prompt).toEqual({ id: prompt.id, text: DUCT, truncated: false })
    expect(new Set(ctx.document.entries.map((entry) => entry.intent))).toEqual(new Set([DUCT]))
  })

  it('a refused call writes no prompt either', () => {
    const ctx = mcpContext()
    const result = /** @type {any} */ (
      tools.run(ctx, 'apply_records', { prompt: DUCT, steps: [{ create: CUBE }, { operate: { op: 'boolean.union', operands: [{ id: '@1' }] } }] })
    )
    expect(result.error).toBeDefined()
    expect(ctx.document.entries).toHaveLength(0)
    expect(ctx.document.prompts()).toEqual([])
  })

  it('refuses a bad prompt before building anything', () => {
    const ctx = mcpContext()
    const result = /** @type {any} */ (tools.run(ctx, 'apply_records', { prompt: '  ', steps: [{ create: CUBE }] }))
    expect(result.error).toBeDefined()
    expect(result.reason).toMatch(/empty/)
    expect(ctx.document.entries).toHaveLength(0)
  })

  it('the same prompt again joins the bound record rather than adding a second', () => {
    const ctx = mcpContext()
    tools.run(ctx, 'record_prompt', { prompt: DUCT })
    tools.run(ctx, 'apply_records', { prompt: DUCT, steps: [{ create: CUBE }] })
    expect(ctx.document.prompts()).toHaveLength(1)
    expect(ctx.document.prompts()[0].produced).toHaveLength(1)
  })
})

describe('the in-app chat records the user’s message automatically', () => {
  it('a turn bound to its message writes a prompt only once something lands', () => {
    const document = createDocument()
    const ctx = { ...makeContext({ document, request: DUCT }), prompt: { id: null, text: DUCT } }
    tools.run(ctx, 'describe_scene', {})
    expect(document.prompts()).toEqual([])
    tools.run(ctx, 'create', CUBE)
    tools.run(ctx, 'create', SPHERE)
    expect(document.prompts()).toHaveLength(1)
    expect(document.prompts()[0]).toMatchObject({ text: DUCT, produced: document.entries.map((entry) => entry.record.id).sort() })
  })
})

describe('describe_body returns the body’s prompts', () => {
  it('as data, with the text as stored', () => {
    const ctx = mcpContext()
    tools.run(ctx, 'record_prompt', { prompt: '<img src=x onerror=alert(1)> a cube' })
    const id = /** @type {any} */ (tools.run(ctx, 'create', CUBE)).applied[0].bodyId
    const body = /** @type {any} */ (tools.run(ctx, 'describe_body', { id }))
    expect(body.prompts).toEqual([{ id: expect.any(String), text: '<img src=x onerror=alert(1)> a cube' }])
  })
})
