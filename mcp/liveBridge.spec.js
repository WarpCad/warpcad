// SPDX-License-Identifier: AGPL-3.0-or-later
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger, createServer } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BRIDGE_EVENT } from '../src/ai/bridge/protocol.js'
import { createTabEndpoint } from '../src/ai/bridge/tabEndpoint.js'
import { unwrapDocumentData } from '../src/ai/documentData.js'
import { createDocument } from '../src/core/document.js'
import { serializeProject } from '../src/core/project.js'
import { warpcadLiveBridge } from './liveBridge.js'

/**
 * The live bridge end to end in one process (`TODO/ai-012`), **driven** rather than wired by
 * hand: a real Vite dev server running the real plugin, `@modelcontextprotocol/client` as Claude
 * Code's stand-in over Streamable HTTP, and a "tab" that is a real WebSocket on Vite's real HMR
 * socket running the real `tabEndpoint` against a real document. The only thing not here is a
 * browser — `e2e/ai-live-bridge.e2e.js` adds that.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** @type {import('vite').ViteDevServer} */
let server
let port = 0
/** @type {string[]} */
const logged = []

beforeEach(async () => {
  logged.length = 0
  const logger = createLogger('info')
  for (const level of /** @type {const} */ (['info', 'warn', 'error'])) {
    logger[level] = (message) => {
      logged.push(String(message))
    }
  }
  server = await createServer({
    configFile: false,
    root: ROOT,
    customLogger: logger,
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    plugins: [warpcadLiveBridge()],
  })
  await server.listen()
  port = /** @type {import('node:net').AddressInfo} */ (server.httpServer?.address()).port
}, 30_000)

afterEach(async () => {
  await server?.close()
})

/** Plain MCP client, independent of the agent implementation. */
async function claudeCode() {
  const client = new Client({ name: 'live-bridge-spec', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)))
  return client
}

/**
 * A WarpCad tab with no browser: Vite's HMR socket, and the real endpoint over a real document.
 *
 * @returns {Promise<{ doc: import('../src/core/document.js').WarpDocument, endpoint: ReturnType<typeof createTabEndpoint>, inbox: any[], send: (data: any) => void, close: () => void }>}
 */
async function tab() {
  const doc = createDocument()
  const endpoint = createTabEndpoint({ document: () => doc, isEditing: () => false })
  /** @type {any[]} */
  const inbox = []
  const socket = new WebSocket(`ws://127.0.0.1:${port}/?token=${server.config.webSocketToken}`, 'vite-hmr')
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener('open', resolveOpen, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  /** @param {any} data */
  const send = (data) => socket.send(JSON.stringify({ type: 'custom', event: BRIDGE_EVENT, data }))
  socket.addEventListener('message', async (event) => {
    const payload = JSON.parse(String(event.data))
    if (payload.type !== 'custom' || payload.event !== BRIDGE_EVENT) return
    inbox.push(payload.data)
    if (payload.data.type === 'call') send(await endpoint.handle(payload.data))
  })
  send({ type: 'hello' })
  return { doc, endpoint, inbox, send, close: () => socket.close() }
}

/** @param {any[]} inbox @param {string} type */
async function next(inbox, type) {
  for (let tries = 0; tries < 100; tries += 1) {
    const found = inbox.find((message) => message.type === type)
    if (found) {
      inbox.splice(inbox.indexOf(found), 1)
      return found
    }
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`no ${type} message`)
}

/** @param {any} response */
const textOf = (response) => response.content.map((/** @type {any} */ block) => block.text ?? '').join('\n')

describe('the Vite dev host (warpcadLiveBridge)', () => {
  it('is dev-only: it applies to `vite serve` and ships nothing in `vite build`', () => {
    expect(warpcadLiveBridge().apply).toBe('serve')
  })

  it('lists the shared tools plus the browser tool set, with `request` on every write', async () => {
    const client = await claudeCode()
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name)
    for (const name of ['create', 'operate', 'apply_records', 'describe_scene', 'get_timeline', 'capture_view', 'get_selection', 'select']) expect(names).toContain(name)
    expect(names).not.toContain('save_to_library')
    const create = /** @type {any} */ (tools.find((tool) => tool.name === 'create'))
    expect(create.inputSchema.properties).toHaveProperty('request')
    await client.close()
  })

  it('routes an ordinary MCP client after the user enables live access in WarpCad', async () => {
    const client = await claudeCode()
    const unpaired = /** @type {any} */ (await client.callTool({ name: 'create', arguments: { op: 'primitive.cuboid', positionMm: [0, 0, 0], request: 'add a 40 mm cube' } }))
    expect(unpaired.isError).toBe(true)
    expect(textOf(unpaired)).toMatch(/live MCP access is off/i)
    expect(textOf(unpaired)).not.toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}/)

    const browser = await tab()
    await next(browser.inbox, 'status')
    browser.inbox.length = 0
    browser.send({ type: 'access', lease: 'tab' })
    expect(await next(browser.inbox, 'status')).toMatchObject({ access: 'enabled', connection: 'connected' })

    const cube = /** @type {any} */ (await client.callTool({ name: 'create', arguments: { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [40, 40, 40] }, request: 'a 40 mm cube with a 20 mm sphere on top' } }))
    expect(cube.isError).toBeFalsy()
    const landed = /** @type {any} */ (unwrapDocumentData(textOf(cube)))
    expect(landed.applied[0].bodyId).toBeTruthy()
    const sphere = /** @type {any} */ (await client.callTool({ name: 'create', arguments: { op: 'primitive.sphere', positionMm: [0, 0, 50], request: 'a 40 mm cube with a 20 mm sphere on top' } }))
    expect(sphere.isError).toBeFalsy()

    expect(browser.doc.entries).toHaveLength(2)
    for (const entry of browser.doc.entries) expect(browser.doc.originOf(/** @type {string} */ (entry.record.id))).toBe('mcp')
    expect(browser.endpoint.turns).toHaveLength(1)

    // A refused call lands nothing, and the model reads why.
    const before = serializeProject(browser.doc)
    const refused = /** @type {any} */ (await client.callTool({ name: 'operate', arguments: { op: 'boolean.union', operands: [{ id: landed.applied[0].bodyId }], request: 'x' } }))
    expect(refused.isError).toBe(true)
    expect(serializeProject(browser.doc)).toBe(before)

    for (const response of [unpaired, cube, sphere, refused]) expect(textOf(response)).not.toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}/)
    expect(logged.join('\n')).not.toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}/)

    browser.close()
    await client.close()
  }, 30_000)

  it('refuses /mcp from a foreign Origin and from a non-loopback Host', async () => {
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'evil', version: '0' } } }),
    }
    const hostile = await fetch(`http://127.0.0.1:${port}/mcp`, { ...init, headers: { ...init.headers, origin: 'https://evil.example' } })
    expect(hostile.status).toBe(403)
    const otherLocal = await fetch(`http://127.0.0.1:${port}/mcp`, { ...init, headers: { ...init.headers, origin: 'http://localhost:9999' } })
    expect(otherLocal.status).toBe(403)
    const own = await fetch(`http://127.0.0.1:${port}/mcp`, { ...init, headers: { ...init.headers, origin: `http://localhost:${port}` } })
    expect(own.status).toBe(200)
  })
})
