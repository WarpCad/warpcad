// SPDX-License-Identifier: AGPL-3.0-or-later
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { guideFor } from '../src/ai/prompt.js'
import { devAllowList } from './bridge.js'
import { LIVE_SERVER_INSTRUCTIONS, createLiveHttpHandler } from './liveHttp.js'

/**
 * Session lifetime on the dev host's `/mcp` (`TODO/ai-023`): a client that vanishes without the
 * protocol's DELETE must not stay counted, because the bridge refuses every call while more than
 * one client is connected.
 */

/** @type {import('node:http').Server} */
let http
let port = 0
let clock = 0
/** @type {string[]} */
let opened
/** @type {string[]} */
let closed

beforeEach(async () => {
  clock = 1_000
  opened = []
  closed = []
  /** @type {any} */
  const bridge = {
    openLink: (/** @type {string} */ id) => opened.push(id),
    closeLink: (/** @type {string} */ id) => closed.push(id),
    call: async () => ({ kind: 'refused', text: 'n/a' }),
  }
  /** @type {{ handle: Function }} */
  let handler
  http = createServer((req, res) => void handler.handle(req, res))
  await new Promise((resolve) => http.listen(0, '127.0.0.1', () => resolve(undefined)))
  port = /** @type {import('node:net').AddressInfo} */ (http.address()).port
  handler = createLiveHttpHandler({ bridge, allow: () => devAllowList(port), now: () => clock, idleMs: 60_000 })
})

afterEach(async () => {
  await new Promise((resolve) => http.close(() => resolve(undefined)))
})

async function connect() {
  const client = new Client({ name: 'live-http-spec', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)))
  return client
}

describe('live /mcp session lifetime', () => {
  it('closes a session that has been silent for longer than the idle window, on the next request', async () => {
    const gone = await connect()
    expect(opened).toHaveLength(1)
    await gone.close() // no DELETE: the host cannot tell this client from a quiet one

    clock += 59_000
    const stillThere = await connect()
    expect(closed).toEqual([])
    await stillThere.close()

    clock += 61_000
    const next = await connect()
    expect(closed).toHaveLength(2)
    expect(closed).toEqual(expect.arrayContaining(opened.slice(0, 2)))
    expect(closed).not.toContain(opened[2])
    await next.close()
  })

  it('keeps a session alive while it keeps making requests', async () => {
    const client = await connect()
    for (let i = 0; i < 3; i += 1) {
      clock += 40_000
      await client.listTools()
    }
    expect(closed).toEqual([])
    await client.close()
  })

  it('closes a session at once when the client sends the protocol DELETE', async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
    const client = new Client({ name: 'live-http-spec', version: '0.0.0' })
    await client.connect(transport)
    await transport.terminateSession()
    expect(closed).toEqual(opened)
    await client.close()
  })
})

describe('live /mcp initialize', () => {
  it('carries the composed instructions (TODO/ai-027)', async () => {
    const client = await connect()
    expect(client.getInstructions()).toBe(LIVE_SERVER_INSTRUCTIONS)
    await client.close()
  })
})

describe('live /mcp guide resource (TODO/ai-028)', () => {
  it('lists and reads warpcad://guide with no lease, touching neither the bridge nor the tab', async () => {
    const client = await connect()
    const { resources } = await client.listResources()
    expect(resources.map((resource) => resource.uri)).toEqual(['warpcad://guide'])
    expect(resources[0]).toMatchObject({ name: 'guide', mimeType: 'text/markdown', annotations: { audience: ['assistant'], priority: 1 } })

    // The allow-list is the lease: this spec's bridge refuses every call, and the read still works.
    const guide = /** @type {any} */ (await client.readResource({ uri: 'warpcad://guide' }))
    expect(guide.contents[0].text).toBe(guideFor({ live: true }))
    expect(guide.contents[0].text).toMatch(/get_selection/)
    expect(guide.contents[0].text).not.toMatch(/^<document_data/)
    await client.close()
  })

  it('refuses a resource that is not the guide', async () => {
    const client = await connect()
    await expect(client.readResource({ uri: 'warpcad://scene' })).rejects.toThrow()
    await client.close()
  })
})

describe('live /mcp prompts (TODO/ai-029)', () => {
  it('lists and gets the recipes with no lease, the live guide embedded and get_selection named', async () => {
    const client = await connect()
    const { prompts } = await client.listPrompts()
    expect(prompts.map((prompt) => prompt.name)).toEqual(['start', 'build', 'check-print'])
    const got = /** @type {any} */ (await client.getPrompt({ name: 'build', arguments: { request: 'make this taller' } }))
    expect(got.messages[0].content.resource.text).toBe(guideFor({ live: true }))
    expect(got.messages[1].content.text).toMatch(/get_selection/)
    await client.close()
  })
})
