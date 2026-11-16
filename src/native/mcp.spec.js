// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { unwrapDocumentData } from '../ai/documentData.js'
import {
  MCP_COMMANDS,
  NATIVE_MCP_ENDPOINT_EVENT,
  NATIVE_MCP_EVENT,
  NATIVE_MCP_PAUSED_EVENT,
  claudeCodeCommand,
  createNativeLink,
  listenNative,
  setNativeAccess,
} from './mcp.js'

/**
 * A fake Tauri bridge: `invoke` logs and answers from `answers`; `transformCallback` keeps the
 * handler so a test can deliver an event the way Tauri does (`{ event, id, payload }`).
 */
function fakeBridge(answers = {}) {
  /** @type {Array<{ cmd: string, args: any }>} */
  const calls = []
  /** @type {Map<number, (event: any) => void>} */
  const callbacks = new Map()
  /** @type {Array<{ event: string, handler: number }>} */
  const listeners = []
  let next = 1
  const internals = {
    transformCallback: (/** @type {(e: any) => void} */ fn) => {
      const id = next++
      callbacks.set(id, fn)
      return id
    },
    invoke: vi.fn(async (/** @type {string} */ cmd, /** @type {any} */ args) => {
      calls.push({ cmd, args })
      if (cmd === 'plugin:event|listen') {
        listeners.push({ event: args.event, handler: args.handler })
        return args.handler
      }
      return /** @type {any} */ (answers)[cmd] ?? null
    }),
  }
  const emit = (/** @type {string} */ event, /** @type {unknown} */ payload) => {
    for (const listener of listeners.filter((l) => l.event === event)) callbacks.get(listener.handler)?.({ event, id: 0, payload })
  }
  return { global: { __TAURI_INTERNALS__: internals }, calls, emit }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the native MCP host commands (ai-026)', () => {
  it('names the three commands the page may call and the three events it listens to', () => {
    expect(MCP_COMMANDS).toEqual({ setAccess: 'mcp_set_access', reply: 'mcp_reply', rotateToken: 'mcp_rotate_token' })
    expect(NATIVE_MCP_EVENT).toBe('warpcad-mcp-host')
    expect(NATIVE_MCP_PAUSED_EVENT).toBe('warpcad-mcp-paused')
    expect(NATIVE_MCP_ENDPOINT_EVENT).toBe('warpcad-mcp-endpoint')
  })

  it('subscribes through Tauri’s event plugin, as @tauri-apps/api does, without importing it', async () => {
    const bridge = fakeBridge()
    const seen = /** @type {unknown[]} */ ([])
    await listenNative(NATIVE_MCP_EVENT, (payload) => seen.push(payload), bridge.global)
    expect(bridge.calls[0]).toEqual({ cmd: 'plugin:event|listen', args: { event: NATIVE_MCP_EVENT, target: { kind: 'Any' }, handler: 1 } })
    bridge.emit(NATIVE_MCP_EVENT, { type: 'status' })
    expect(seen).toEqual([{ type: 'status' }])
  })

  it('reads the endpoint back, with every field a string or empty', async () => {
    const bridge = fakeBridge({ mcp_set_access: { port: 5184, url: 'http://127.0.0.1:5184/mcp', lanUrl: 'http://192.168.1.20:5184/mcp', token: 'ab', lanError: null } })
    const endpoint = await setNativeAccess({ lease: '1h', lan: true, surface: { instructions: 'i', tools: [], writers: [] } }, bridge.global)
    expect(bridge.calls[0]).toEqual({ cmd: 'mcp_set_access', args: { lease: '1h', lan: true, surface: { instructions: 'i', tools: [], writers: [] } } })
    expect(endpoint).toEqual({ port: 5184, url: 'http://127.0.0.1:5184/mcp', lanUrl: 'http://192.168.1.20:5184/mcp', token: 'ab', lanError: '' })
  })

  it('builds the ready-to-paste Claude Code command for the Wi-Fi address and token', () => {
    expect(claudeCodeCommand({ lanUrl: 'http://192.168.1.20:5184/mcp', token: 'abc123' })).toBe(
      'claude mcp add --transport http warpcad http://192.168.1.20:5184/mcp --header "Authorization: Bearer abc123"'
    )
    expect(claudeCodeCommand({ lanUrl: '', token: '' })).toBe('')
  })
})

describe('createNativeLink: the live bridge’s second transport', () => {
  it('turns hello into access off (a reload starts with access off), after the listener is in place', async () => {
    const bridge = fakeBridge({ mcp_set_access: { port: null, url: null, lanUrl: null, token: null, lanError: null } })
    const link = createNativeLink({ global: bridge.global, surface: async () => ({ instructions: '', tools: [], writers: [] }) })
    link.on('warpcad:bridge', () => {})
    link.send('warpcad:bridge', { type: 'hello' })
    await flush()
    expect(bridge.calls.map((c) => c.cmd)).toEqual(['plugin:event|listen', 'plugin:event|listen', 'plugin:event|listen', 'mcp_set_access'])
    expect(bridge.calls[3].args).toMatchObject({ lease: 'off', lan: false })
  })

  it('sends a lease with the Wi-Fi choice and the page’s surface, and reports the endpoint', async () => {
    const bridge = fakeBridge({ mcp_set_access: { port: 5184, url: 'http://127.0.0.1:5184/mcp', lanUrl: null, token: null, lanError: null } })
    const surface = /** @type {any} */ ({ instructions: 'from the page', tools: [{ name: 'create' }], writers: ['create'] })
    const endpoints = /** @type {any[]} */ ([])
    const link = createNativeLink({ global: bridge.global, surface: async () => surface, onEndpoint: (e) => endpoints.push(e) })
    link.on('warpcad:bridge', () => {})
    link.send('warpcad:bridge', { type: 'access', lease: '15m', lan: true })
    await flush()
    expect(bridge.calls.at(-1)).toEqual({ cmd: 'mcp_set_access', args: { lease: '15m', lan: true, surface } })
    expect(endpoints).toEqual([{ port: 5184, url: 'http://127.0.0.1:5184/mcp', lanUrl: '', token: '', lanError: '' }])
  })

  it('answers a call with mcp_reply, the result already wrapped as an MCP tool result', async () => {
    const bridge = fakeBridge()
    const link = createNativeLink({ global: bridge.global, surface: async () => ({ instructions: '', tools: [], writers: [] }) })
    link.on('warpcad:bridge', () => {})
    link.send('warpcad:bridge', { type: 'result', id: 4, result: { applied: [{ bodyId: 'b1' }] } })
    await flush()
    const reply = bridge.calls.find((c) => c.cmd === 'mcp_reply')
    expect(reply?.args.id).toBe(4)
    expect(unwrapDocumentData(reply?.args.result.content[0].text)).toEqual({ applied: [{ bodyId: 'b1' }] })
    expect(reply?.args.result.isError).toBeUndefined()
  })

  it('drops a tab message of the wrong shape', async () => {
    const bridge = fakeBridge()
    const link = createNativeLink({ global: bridge.global, surface: async () => ({ instructions: '', tools: [], writers: [] }) })
    link.on('warpcad:bridge', () => {})
    link.send('warpcad:bridge', { type: 'result', id: '4', result: {} })
    link.send('warpcad:bridge', { type: 'access', lease: 'forever' })
    await flush()
    expect(bridge.calls.map((c) => c.cmd)).toEqual(['plugin:event|listen', 'plugin:event|listen', 'plugin:event|listen'])
  })

  it('passes the paused event on', async () => {
    const bridge = fakeBridge()
    const onPaused = vi.fn()
    const link = createNativeLink({ global: bridge.global, surface: async () => ({ instructions: '', tools: [], writers: [] }), onPaused })
    link.on('warpcad:bridge', () => {})
    await flush()
    bridge.emit(NATIVE_MCP_PAUSED_EVENT, {})
    expect(onPaused).toHaveBeenCalledTimes(1)
  })

  it('passes an endpoint the host found on its own (ai-036: the Wi-Fi address changed or went away) to onEndpoint', async () => {
    const bridge = fakeBridge()
    const endpoints = /** @type {any[]} */ ([])
    const link = createNativeLink({ global: bridge.global, surface: async () => ({ instructions: '', tools: [], writers: [] }), onEndpoint: (e) => endpoints.push(e) })
    link.on('warpcad:bridge', () => {})
    await flush()
    bridge.emit(NATIVE_MCP_ENDPOINT_EVENT, { port: 5184, url: 'http://127.0.0.1:5184/mcp', lanUrl: 'http://10.0.0.7:5184/mcp', token: 'ab', lanError: null })
    bridge.emit(NATIVE_MCP_ENDPOINT_EVENT, { port: 5184, url: 'http://127.0.0.1:5184/mcp', lanUrl: null, token: null, lanError: 'gone' })
    expect(endpoints).toEqual([
      { port: 5184, url: 'http://127.0.0.1:5184/mcp', lanUrl: 'http://10.0.0.7:5184/mcp', token: 'ab', lanError: '' },
      { port: 5184, url: 'http://127.0.0.1:5184/mcp', lanUrl: '', token: '', lanError: 'gone' },
    ])
  })
})
