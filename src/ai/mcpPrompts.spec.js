// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LIVE_SERVER_INSTRUCTIONS } from '../../mcp/liveHttp.js'
import { mcpToolDefinitions } from '../../mcp/server.js'
import {
  BODY_MAX_CHARS,
  MCP_SERVER_NAME,
  REQUEST_MAX_CHARS,
  STARTER_CLAUDE_CODE,
  STARTER_OTHER_AGENT,
  listPrompts,
  promptMessages,
} from './mcpPrompts.js'
import { guideFor } from './prompt.js'
import { createToolRegistry } from './tools/index.js'

/** `TODO/ai-029`: the recipes, their argument limits, and the two fixed starter texts. */

const tools = createToolRegistry()
const FILE = mcpToolDefinitions(tools)
const LIVE = mcpToolDefinitions(tools, { live: true })
const WRITERS = ['create', 'operate', 'apply_records', 'define_variable', 'set_variable', 'record_prompt', 'record_response']

/** @param {string} name @param {Record<string, unknown>} [args] @param {boolean} [live] */
function recipe(name, args = {}, live = false) {
  const result = promptMessages(name, args, { live })
  if ('error' in result) throw new Error(result.error)
  return result
}

describe('prompt list', () => {
  it('has start, build and check-print with their arguments', () => {
    const prompts = listPrompts()
    expect(prompts.map((p) => p.name)).toEqual(['start', 'build', 'check-print'])
    expect(prompts[0].arguments).toEqual([])
    expect(prompts[1].arguments).toMatchObject([{ name: 'request', required: true }])
    expect(prompts[2].arguments).toMatchObject([{ name: 'body', required: false }])
  })
})

describe('arguments are limited in code', () => {
  it.each([
    ['missing', undefined, /required/],
    ['empty', '', /required/],
    ['not a string', 42, /plain string/],
    ['too long', 'x'.repeat(REQUEST_MAX_CHARS + 1), /limit is 2000/],
  ])('refuses a build request that is %s, in words', (_case, request, reason) => {
    const result = promptMessages('build', { request }, { live: false })
    expect(result).toMatchObject({ error: expect.stringMatching(reason) })
  })

  it('accepts a request at the limit and refuses a body over its limit', () => {
    expect('error' in promptMessages('build', { request: 'x'.repeat(REQUEST_MAX_CHARS) }, { live: false })).toBe(false)
    expect(promptMessages('check-print', { body: 'x'.repeat(BODY_MAX_CHARS + 1) }, { live: false })).toMatchObject({ error: expect.stringMatching(/limit is 200/) })
  })

  it('refuses an unknown prompt', () => {
    expect(promptMessages('nope', {}, { live: false })).toMatchObject({ error: expect.stringMatching(/no prompt "nope"/) })
  })
})

describe.each([
  ['file', false, FILE],
  ['live', true, LIVE],
])('%s recipes', (_name, live, definitions) => {
  const listed = new Set(definitions.map((d) => d.name))
  const messages = (/** @type {string} */ name) => recipe(name, { request: 'a plate', body: 'Plate' }, live).messages

  it.each(['start', 'build', 'check-print'])('%s embeds exactly the guide, then the recipe text', (name) => {
    const [first, second] = messages(name)
    expect(first).toEqual({
      role: 'user',
      content: { type: 'resource', resource: { uri: 'warpcad://guide', mimeType: 'text/markdown', text: guideFor({ live }) } },
    })
    expect(second.content).toMatchObject({ type: 'text' })
  })

  it.each(['start', 'check-print'])('%s names no write tool', (name) => {
    const text = /** @type {any} */ (messages(name)[1].content).text
    for (const writer of WRITERS) expect(text, writer).not.toMatch(new RegExp(`\\b${writer}\\b`))
  })

  it.each(['start', 'build', 'check-print'])('%s names only tools this transport lists', (name) => {
    const text = /** @type {any} */ (messages(name)[1].content).text.replace(/"[^"]*"/g, '')
    for (const tool of text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) expect(listed.has(tool), tool).toBe(true)
  })

  it('build ends by asking for record_response with every problem met (ai-032)', () => {
    const text = /** @type {any} */ (messages('build')[1].content).text
    expect(text.trim().split('\n').at(-1)).toMatch(/record_response.*final message.*every problem you met/)
  })

  it(`${live ? 'names' : 'does not name'} get_selection in build`, () => {
    const text = /** @type {any} */ (messages('build')[1].content).text
    expect(/get_selection/.test(text)).toBe(live)
  })

  it('puts only the arguments into the text', () => {
    const text = /** @type {any} */ (messages('build')[1].content).text
    expect(text).toContain('"a plate"')
    expect(text).not.toMatch(/undefined|\[object Object\]|\$\{/)
  })
})

describe('starters', () => {
  it('are the fixed texts, built from the server name and a listed prompt', () => {
    expect(MCP_SERVER_NAME).toBe('warpcad')
    expect(STARTER_CLAUDE_CODE).toBe('/mcp__warpcad__start')
    const name = STARTER_CLAUDE_CODE.replace(`/mcp__${MCP_SERVER_NAME}__`, '')
    expect(listPrompts().map((p) => p.name)).toContain(name)
  })

  it('send the other agent to the guide and name only listed tools', () => {
    expect(STARTER_OTHER_AGENT).toContain('warpcad://guide')
    const listed = new Set(FILE.map((d) => d.name))
    for (const tool of STARTER_OTHER_AGENT.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) expect(listed.has(tool), tool).toBe(true)
  })

  it('are not templates', () => {
    for (const text of [STARTER_CLAUDE_CODE, STARTER_OTHER_AGENT]) expect(text).not.toMatch(/\$\{|undefined/)
    expect(LIVE_SERVER_INSTRUCTIONS.length).toBeGreaterThan(0)
  })
})
