// SPDX-License-Identifier: AGPL-3.0-or-later
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { Agent, createServer, request as httpRequest } from 'node:http'
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
/** @type {{ handle: Function, close: () => Promise<void> }} */
let handler
/** @type {import('node:net').Socket[]} */
const held = []

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
  http = createServer((req, res) => void handler.handle(req, res))
  await new Promise((resolve) => http.listen(0, '127.0.0.1', () => resolve(undefined)))
  port = /** @type {import('node:net').AddressInfo} */ (http.address()).port
  handler = createLiveHttpHandler({ bridge, allow: () => devAllowList(port), now: () => clock, idleMs: 60_000, endedMs: 10_000, sweepEveryMs: 20 })
})

afterEach(async () => {
  await handler.close()
  for (const socket of held) socket.destroy()
  held.length = 0
  http.closeAllConnections()
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

const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }

/**
 * Initialize a session over a raw HTTP request. `keepAlive: false` sends `Connection: close`, as a
 * one-shot `claude -p` effectively does when it exits: the socket is gone once the reply is read.
 *
 * @param {boolean} keepAlive
 * @returns {Promise<{ id: string, socket: import('node:net').Socket }>}
 */
function rawInitialize(keepAlive) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } } })
    const req = httpRequest({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: HEADERS, agent: keepAlive ? new Agent({ keepAlive: true }) : false }, (res) => {
      res.resume()
      res.on('end', () => {
        const id = String(res.headers['mcp-session-id'])
        if (keepAlive) resolve({ id, socket: /** @type {any} */ (req.socket) })
        else res.socket.once('close', () => resolve({ id, socket: /** @type {any} */ (req.socket) }))
      })
    })
    if (!keepAlive) req.setHeader('connection', 'close')
    else req.setHeader('connection', 'keep-alive')
    req.on('error', reject)
    req.end(body)
  })
}

/** @param {() => boolean} test */
async function until(test) {
  for (let i = 0; i < 100 && !test(); i += 1) await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('live /mcp ended sessions stop counting (TODO/ai-038)', () => {
  it('drops a session whose socket closed with no DELETE once the short ended window passes, before the idle window', async () => {
    const gone = await rawInitialize(false)
    clock += 5_000 // inside the ended window: still counted, the client may be about to reconnect
    const early = await connect()
    expect(closed).toEqual([])
    await early.close()

    clock += 6_000 // 11 s silent, socket closed, far short of the 60 s idle window
    const next = await connect()
    expect(closed).toContain(gone.id)
    expect(closed).not.toContain(opened[opened.length - 1])
    await next.close()
  })

  it('drops an ended session on the sweep timer, with no further request', async () => {
    const gone = await rawInitialize(false)
    clock += 11_000
    await until(() => closed.includes(gone.id))
    expect(closed).toEqual([gone.id])
  })

  it('still counts a live second client: its socket is open, so a silent window does not end it', async () => {
    const live = await rawInitialize(true)
    held.push(live.socket)
    clock += 30_000 // past the ended window, inside the idle window
    const other = await connect()
    expect(closed).not.toContain(live.id)
    expect(opened).toContain(live.id)
    await other.close()
  })

  it('still counts a client that holds an open SSE stream even when the request sockets are gone', async () => {
    const first = await rawInitialize(false)
    const stream = await new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: '/mcp', method: 'GET', agent: false, headers: { accept: 'text/event-stream', 'mcp-session-id': first.id, 'mcp-protocol-version': '2025-06-18' } }, (res) => {
        held.push(/** @type {any} */ (res.socket))
        resolve(res)
      })
      req.on('error', reject)
      req.end()
    })
    expect(/** @type {any} */ (stream).statusCode).toBe(200)
    clock += 30_000
    const other = await connect()
    expect(closed).not.toContain(first.id)
    await other.close()
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
