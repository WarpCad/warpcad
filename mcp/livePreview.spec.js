// SPDX-License-Identifier: AGPL-3.0-or-later
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { preview } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTabEndpoint } from '../src/ai/bridge/tabEndpoint.js'
import { PREVIEW_BRIDGE_PATH } from '../src/ai/bridge/protocol.js'
import { unwrapDocumentData } from '../src/ai/documentData.js'
import { createDocument } from '../src/core/document.js'
import { serializeProject } from '../src/core/project.js'
import { LIVE_PREVIEW_MARKER, livePreviewBridgePlugins, warpcadLiveBridgeMarker, warpcadLivePreviewBridge } from './livePreview.js'

/**
 * The preview host end to end in one process (`docs/decisions/ai-partner.md`, Decision 11,
 * amended 2026-11-06): a real `vite preview` server running the real plugin, the MCP client as
 * Claude Code's stand-in, and a "tab" that reads the real Server-Sent Events stream and posts back
 * over the real `POST` route, running the real `tabEndpoint` against a real document. The only
 * thing not here is a browser; `src/ai/bridge/previewTransport.spec.js` covers the tab's side.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** @type {import('vite').PreviewServer} */
let server
/** @type {string} */
let base = ''
/** @type {Array<() => void>} */
let tabsOpen = []
/** @type {string[]} */
const scratch = []

/**
 * A build output folder. `flagged` puts the marker a `VITE_LIVE_BRIDGE=1` build leaves there.
 *
 * @param {boolean} flagged
 * @returns {string}
 */
function outputFolder(flagged) {
  const dir = mkdtempSync(join(tmpdir(), 'warpcad-live-preview-'))
  scratch.push(dir)
  if (flagged) writeFileSync(join(dir, LIVE_PREVIEW_MARKER), 'flagged\n')
  return dir
}

beforeEach(async () => {
  server = await preview({
    configFile: false,
    root: ROOT,
    logLevel: 'silent',
    build: { outDir: outputFolder(true) },
    plugins: [warpcadLivePreviewBridge()],
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  })
  const port = /** @type {import('node:net').AddressInfo} */ (server.httpServer?.address()).port
  base = `http://127.0.0.1:${port}`
}, 30_000)

afterEach(async () => {
  for (const close of tabsOpen) close()
  tabsOpen = []
  await new Promise((resolveClose) => server.httpServer.close(resolveClose))
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Plain MCP client, independent of the agent implementation. */
async function claudeCode() {
  const client = new Client({ name: 'live-preview-spec', version: '0.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)))
  return client
}

/**
 * A WarpCad tab with no browser: an SSE reader for the host's messages, and `POST` for its own.
 *
 * @returns {Promise<{ id: string, doc: import('../src/core/document.js').WarpDocument, endpoint: ReturnType<typeof createTabEndpoint>, inbox: any[], send: (data: any) => Promise<Response>, close: () => void }>}
 */
async function tab() {
  const id = `spec-${Math.random().toString(16).slice(2, 12)}`.padEnd(16, '0')
  const doc = createDocument()
  const endpoint = createTabEndpoint({ document: () => doc, isEditing: () => false })
  /** @type {any[]} */
  const inbox = []
  const stream = new AbortController()
  tabsOpen.push(() => stream.abort())
  const response = await fetch(`${base}${PREVIEW_BRIDGE_PATH}/events?tab=${id}`, { signal: stream.signal })
  const reader = /** @type {ReadableStream<Uint8Array>} */ (response.body).getReader()
  const decoder = new TextDecoder()
  /** @param {any} data */
  const send = (data) => fetch(`${base}${PREVIEW_BRIDGE_PATH}/message?tab=${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
  void (async () => {
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }))
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let end = buffer.indexOf('\n\n')
      while (end >= 0) {
        const frame = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        const line = frame.split('\n').find((text) => text.startsWith('data: '))
        if (line !== undefined) {
          const message = JSON.parse(line.slice(6))
          inbox.push(message)
          if (message.type === 'call') await send(await endpoint.handle(message))
        }
        end = buffer.indexOf('\n\n')
      }
    }
  })()
  await send({ type: 'hello' })
  return { id, doc, endpoint, inbox, send, close: () => stream.abort() }
}

/** @param {any[]} inbox @param {string} type */
async function next(inbox, type) {
  for (let tries = 0; tries < 200; tries += 1) {
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

describe('the preview host (warpcadLivePreviewBridge)', () => {
  it('applies to preview only: it hooks the preview server, not the dev server', () => {
    const plugin = warpcadLivePreviewBridge()
    expect(plugin.apply).toBe('serve')
    expect(plugin.configurePreviewServer).toBeTypeOf('function')
    expect(plugin).not.toHaveProperty('configureServer')
  })

  it('routes an ordinary MCP client once a tab enables live access, and a tab can drive the call', async () => {
    const client = await claudeCode()
    const unpaired = /** @type {any} */ (await client.callTool({ name: 'create', arguments: { op: 'primitive.cuboid', positionMm: [0, 0, 0], request: 'add a 40 mm cube' } }))
    expect(unpaired.isError).toBe(true)
    expect(textOf(unpaired)).toMatch(/live MCP access is off/i)

    const browser = await tab()
    await next(browser.inbox, 'status')
    browser.inbox.length = 0
    await browser.send({ type: 'access', lease: 'tab' })
    expect(await next(browser.inbox, 'status')).toMatchObject({ access: 'enabled', connection: 'connected' })

    const cube = /** @type {any} */ (await client.callTool({ name: 'create', arguments: { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [40, 40, 40] }, request: 'a 40 mm cube' } }))
    expect(cube.isError).toBeFalsy()
    const landed = /** @type {any} */ (unwrapDocumentData(textOf(cube)))
    expect(landed.applied[0].bodyId).toBeTruthy()
    expect(browser.doc.entries).toHaveLength(1)
    expect(browser.doc.originOf(/** @type {string} */ (browser.doc.entries[0].record.id))).toBe('mcp')

    const before = serializeProject(browser.doc)
    const refused = /** @type {any} */ (await client.callTool({ name: 'operate', arguments: { op: 'boolean.union', operands: [{ id: landed.applied[0].bodyId }], request: 'x' } }))
    expect(refused.isError).toBe(true)
    expect(serializeProject(browser.doc)).toBe(before)

    browser.close()
    await client.close()
  }, 30_000)

  it('refuses the tab routes from a foreign Origin or a non-loopback Host', async () => {
    const browser = await tab()
    const foreign = await fetch(`${base}${PREVIEW_BRIDGE_PATH}/message?tab=spec-foreign1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
      body: JSON.stringify({ type: 'hello' }),
    })
    expect(foreign.status).toBe(403)
    const stream = await fetch(`${base}${PREVIEW_BRIDGE_PATH}/events?tab=spec-foreign2`, { headers: { origin: 'https://evil.example' } })
    expect(stream.status).toBe(403)
    browser.close()
  })

  it('answers a plain-text post, an unknown tab, a bad tab id and an oversized body with a refusal', async () => {
    const browser = await tab()
    const plain = await fetch(`${base}${PREVIEW_BRIDGE_PATH}/message?tab=spec-plain001`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })
    expect(plain.status).toBe(415)
    const unknown = await fetch(`${base}${PREVIEW_BRIDGE_PATH}/message?tab=spec-unknown1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(unknown.status).toBe(410)
    const badId = await fetch(`${base}${PREVIEW_BRIDGE_PATH}/events?tab=x`)
    expect(badId.status).toBe(400)
    const huge = await fetch(`${base}${PREVIEW_BRIDGE_PATH}/message?tab=${browser.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(70 * 1024) })
    expect(huge.status).toBe(413)
    browser.close()
  })
})

describe('the preview opt-in (livePreviewBridgePlugins)', () => {
  it('writes the marker only in a flagged build', () => {
    const dir = outputFolder(false)
    const marker = /** @type {any} */ (warpcadLiveBridgeMarker())
    marker.configResolved(/** @type {any} */ ({ build: { outDir: dir } }))
    marker.closeBundle?.call(/** @type {any} */ ({}))
    expect(marker.apply).toBe('build')
    expect(existsSync(join(dir, LIVE_PREVIEW_MARKER))).toBe(true)
  })

  it('registers the build marker only with the flag, and the preview host unless the setting is off', () => {
    expect(livePreviewBridgePlugins({}).map((plugin) => plugin.name)).toEqual(['warpcad-live-bridge-preview'])
    expect(livePreviewBridgePlugins({ VITE_LIVE_BRIDGE: '1' }).map((plugin) => plugin.name)).toEqual(['warpcad-live-bridge-marker', 'warpcad-live-bridge-preview'])
    expect(livePreviewBridgePlugins({ VITE_LIVE_BRIDGE: '1', WARPCAD_LIVE_BRIDGE: '0' }).map((plugin) => plugin.name)).toEqual(['warpcad-live-bridge-marker'])
    for (const raw of ['0', 'false', 'OFF', ' no ']) expect(livePreviewBridgePlugins({ WARPCAD_LIVE_BRIDGE: raw }).map((plugin) => plugin.name)).toEqual([])
  })

  it('mounts nothing when the build has no marker, so a default build serves no bridge', async () => {
    const plain = await preview({
      configFile: false,
      root: ROOT,
      logLevel: 'silent',
      build: { outDir: outputFolder(false) },
      plugins: [warpcadLivePreviewBridge()],
      preview: { host: '127.0.0.1', port: 0, strictPort: false },
    })
    const port = /** @type {import('node:net').AddressInfo} */ (plain.httpServer?.address()).port
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(404)
    await new Promise((resolveClose) => plain.httpServer.close(resolveClose))
  })
})
