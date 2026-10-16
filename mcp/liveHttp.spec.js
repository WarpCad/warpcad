// SPDX-License-Identifier: AGPL-3.0-or-later
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createServer } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { devAllowList } from './bridge.js'
import { createLiveHttpHandler } from './liveHttp.js'

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
