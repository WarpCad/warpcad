// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { mcpToolDefinitions } from '../../mcp/server.js'
import { FINISHING_HEADING, finishingParagraph, finishingSection } from './finishing.js'
import { STARTER_BROWSER_AGENT, promptMessages } from './mcpPrompts.js'
import { MODELLING_GUIDE, SYSTEM_PROMPT, guideFor } from './prompt.js'
import { createToolRegistry } from './tools/index.js'

/**
 * `TODO/io-040` — one "when you are done" paragraph, written once and used by all three agent paths:
 * the in-app Assistant's system prompt, the MCP guide (`warpcad://guide`) and the browser-agent
 * setup text (`BrowserAgentSetup.vue`). It leaves the project ready to publish as a gist and never
 * lets an agent publish or ask for a token.
 */

describe('the finishing paragraph', () => {
  for (const recordResponse of [true, false]) {
    it(`names the steps in order, and never publishing or a token (recordResponse: ${recordResponse})`, () => {
      const text = finishingParagraph({ recordResponse })
      const order = ['set_project_name', 'set_description', 'stage_gist_files', 'get_publish_readiness'].map((name) => text.indexOf(name))
      expect(order.every((index) => index >= 0)).toBe(true)
      expect([...order].sort((a, b) => a - b)).toEqual(order)
      expect(text).toMatch(/fix (every|what)/)
      expect(text).toMatch(/[Nn]ever ask .*GitHub token/)
      expect(text).toMatch(/never try to publish/)
      expect(text).not.toMatch(/\$\{|undefined/)
    })
  }

  it('only the external agents are told to call record_response; the chat’s reply is saved for it', () => {
    expect(finishingParagraph({ recordResponse: true })).toMatch(/record_response/)
    expect(finishingParagraph({ recordResponse: false })).not.toMatch(/record_response/)
  })

  it('names only tools every transport lists', () => {
    const registry = createToolRegistry()
    for (const transport of /** @type {const} */ (['ai', 'mcp', 'webmcp'])) {
      const listed = new Set(registry.definitions(transport).map((definition) => definition.name))
      const text = finishingParagraph({ recordResponse: transport !== 'ai' })
      for (const name of text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []) expect(listed.has(name), `${transport}: ${name}`).toBe(true)
    }
  })
})

describe('all three agent paths carry it', () => {
  it('the in-app Assistant’s system prompt, without record_response', () => {
    expect(SYSTEM_PROMPT).toContain(finishingSection({ recordResponse: false }))
    expect(SYSTEM_PROMPT).toContain(FINISHING_HEADING)
  })

  it('warpcad://guide, file and live, with record_response', () => {
    for (const guide of [MODELLING_GUIDE, guideFor({ live: true })]) {
      expect(guide).toContain(finishingSection({ recordResponse: true }))
    }
  })

  it('the MCP build recipe points at it before its last record_response line', () => {
    const result = promptMessages('build', { request: 'a cable clip' }, { live: false })
    if ('error' in result) throw new Error(result.error)
    const text = /** @type {any} */ (result.messages[1].content).text
    expect(text).toMatch(/get_publish_readiness/)
    expect(text.trim().split('\n').at(-1)).toMatch(/record_response/)
    const listed = new Set(mcpToolDefinitions(createToolRegistry()).map((definition) => definition.name))
    expect(listed.has('get_publish_readiness')).toBe(true)
  })

  it('the browser-agent setup text, before its request slot', () => {
    expect(STARTER_BROWSER_AGENT).toContain(finishingParagraph({ recordResponse: true }))
    expect(STARTER_BROWSER_AGENT).toMatch(/what I want built \(my request follows this line\):$/i)
  })
})
