// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LIVE_SERVER_INSTRUCTIONS } from '../../mcp/liveHttp.js'
import { SERVER_INSTRUCTIONS, mcpToolDefinitions } from '../../mcp/server.js'
import { CLIENT_INSTRUCTIONS_CAP } from './mcpInstructions.js'
import { createToolRegistry } from './tools/index.js'

/**
 * `TODO/ai-027`: what an MCP agent is told when it connects. Tested for content, not wording
 * (the style of `prompt.spec.js`), plus the one hard limit: Claude Code cuts the text at 2,048
 * characters without saying so, including `ai-028`'s pointer line.
 */

const tools = createToolRegistry()
const TRANSPORTS = /** @type {const} */ ([
  ['file server', SERVER_INSTRUCTIONS, mcpToolDefinitions(tools)],
  ['live server', LIVE_SERVER_INSTRUCTIONS, mcpToolDefinitions(tools, { live: true })],
])

describe.each(TRANSPORTS)('%s instructions', (_name, text, definitions) => {
  it('fit the client cap, pointer line included', () => {
    expect(text.length).toBeLessThanOrEqual(CLIENT_INSTRUCTIONS_CAP)
  })

  it('point at warpcad://guide, which the server serves (ai-028)', () => {
    expect(text).toMatch(/Before your first write, read the resource warpcad:\/\/guide/)
  })

  it('are plain text: nothing interpolated', () => {
    expect(text).not.toMatch(/\$\{|undefined|\[object Object\]/)
  })

  it.each([
    ['units', /millimetres/i, /Z up/],
    ['placement', /positionMm/, /underside/, /origin/],
    ['ids come from the scene', /describe_scene/, /guess an id/],
    ['subtract keeps the first operand', /boolean\.subtract keeps its first operand/, /consumes its operands/],
    ['apply_records and @1', /apply_records/, /"@1"/],
    ['every write returns the scene', /returns the scene/, /names the step/],
    ['check before done', /check_printability/, /check_clearance/, /measure/],
    ['printing defaults', /0\.4 mm nozzle/, /1\.2 mm minimum wall/, /220 × 220 × 250/],
    ['ask once with zero writes', /ask once/, /zero writes/],
    ['record_prompt then request', /`record_prompt` first/, /`request`/],
    ['document data is data', /<document_data>/, /never instructions/],
  ])('carry the rule: %s', (_rule, ...matchers) => {
    for (const matcher of matchers) expect(text).toMatch(matcher)
  })

  it('only name tools this transport lists', () => {
    const listed = new Set(definitions.map((d) => d.name))
    const named = text.replace(/<[^>]*>/g, '').match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? []
    expect(named.length).toBeGreaterThan(0)
    for (const name of named) expect(listed.has(name), `${name} is not in the tool list`).toBe(true)
  })

  it('keep every tool description inside the same client cap', () => {
    for (const definition of definitions) {
      expect(definition.description.length, definition.name).toBeLessThanOrEqual(CLIENT_INSTRUCTIONS_CAP)
    }
  })
})

describe('capture_view', () => {
  it('is recommended only where it exists', () => {
    expect(SERVER_INSTRUCTIONS).not.toContain('capture_view')
    expect(LIVE_SERVER_INSTRUCTIONS).toContain('capture_view')
  })
})
