// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { promptsForBody } from '../../core/prompt.js'
import { requestFor } from '../webmcp/toolShape.js'
import { createTabEndpoint } from './tabEndpoint.js'

/**
 * `TODO/ai-031` in the open tab: WebMCP and the live bridge both run through the tab endpoint,
 * which builds a fresh tool context per call. So the endpoint is where the recorded prompt is
 * remembered between calls — per transport — and where it becomes `ctx.request`, which today a
 * WebMCP call only fills with a summary of its own arguments.
 */

function setup() {
  const doc = createDocument()
  let t = 1_000_000
  const endpoint = createTabEndpoint({ document: () => doc, now: () => t, sleep: async (ms) => void (t += ms) })
  return { doc, endpoint }
}

const DUCT = 'a 140 × 250 mm fan duct, 1.6 mm walls'
const BOX = { op: 'primitive.cuboid', positionMm: [0, 0, 0] }
const SPHERE = { op: 'primitive.sphere', positionMm: [0, 0, 40] }
const WEBMCP = /** @type {const} */ ({ origin: 'webmcp', groupBy: 'idle' })

/**
 * A call the way `src/ai/webmcp/register.js` sends it: `request` is the args summary.
 *
 * @param {number} id @param {string} name @param {any} input
 */
const webmcpCall = (id, name, input) => {
  const request = requestFor(name, input)
  return { type: /** @type {const} */ ('call'), id, name, input, ...(request === undefined ? {} : { request }) }
}

describe('the tab endpoint remembers the recorded prompt', () => {
  it('WebMCP: record_prompt, then a create — the body is linked and its intent is the prompt', async () => {
    const { doc, endpoint } = setup()
    const recorded = (await endpoint.handle(webmcpCall(1, 'record_prompt', { prompt: DUCT }), WEBMCP)).result
    expect(recorded.prompt).toEqual({ id: expect.any(String), text: DUCT, truncated: false })
    const made = (await endpoint.handle(webmcpCall(2, 'create', BOX), WEBMCP)).result
    expect(made.error).toBeUndefined()
    const bodyId = made.applied[0].bodyId
    expect(doc.entries[0].origin).toBe('webmcp')
    // Not the `create {"op":…}` summary a WebMCP write carried before.
    expect(doc.entries[0].intent).toBe(DUCT)
    expect(promptsForBody(doc, bodyId).map((p) => p.id)).toEqual([recorded.prompt.id])
  })

  it('a rationale still composes with the prompt', async () => {
    const { doc, endpoint } = setup()
    await endpoint.handle(webmcpCall(1, 'record_prompt', { prompt: DUCT }), WEBMCP)
    await endpoint.handle(webmcpCall(2, 'create', { ...BOX, rationale: 'the shell' }), WEBMCP)
    expect(doc.entries[0].intent).toBe(`${DUCT}\n— the shell`)
  })

  it('the prompt is per transport: an MCP call never picks up a WebMCP prompt', async () => {
    const { doc, endpoint } = setup()
    await endpoint.handle(webmcpCall(1, 'record_prompt', { prompt: DUCT }), WEBMCP)
    await endpoint.handle({ type: 'call', id: 2, name: 'create', input: BOX })
    expect(doc.entries[0].origin).toBe('mcp')
    expect(doc.entries[0].intent).toBeUndefined()
    expect(doc.prompts()[0].produced).toEqual([])
  })

  it('a new prompt starts a new Undo AI turn group, even inside the idle gap', async () => {
    const { endpoint } = setup()
    await endpoint.handle(webmcpCall(1, 'record_prompt', { prompt: 'first' }), WEBMCP)
    await endpoint.handle(webmcpCall(2, 'create', BOX), WEBMCP)
    await endpoint.handle(webmcpCall(3, 'record_prompt', { prompt: 'second' }), WEBMCP)
    await endpoint.handle(webmcpCall(4, 'create', SPHERE), WEBMCP)
    expect(endpoint.turns).toHaveLength(2)
  })

  it('recording a prompt alone is not an Undo AI turn', async () => {
    const { endpoint } = setup()
    await endpoint.handle(webmcpCall(1, 'record_prompt', { prompt: DUCT }), WEBMCP)
    expect(endpoint.turns).toHaveLength(0)
  })

  it('Undo AI turn takes the bodies back and leaves the prompt (what was asked is history)', async () => {
    const { doc, endpoint } = setup()
    await endpoint.handle(webmcpCall(1, 'record_prompt', { prompt: DUCT }), WEBMCP)
    await endpoint.handle(webmcpCall(2, 'create', BOX), WEBMCP)
    endpoint.undoLast()
    expect(doc.entries).toHaveLength(0)
    expect(doc.prompts()).toHaveLength(1)
  })

  it('reset (a new project) forgets the prompt', async () => {
    const { doc, endpoint } = setup()
    await endpoint.handle(webmcpCall(1, 'record_prompt', { prompt: DUCT }), WEBMCP)
    endpoint.reset()
    await endpoint.handle(webmcpCall(2, 'create', BOX), WEBMCP)
    expect(doc.entries[0].intent).toMatch(/^create /)
  })
})
