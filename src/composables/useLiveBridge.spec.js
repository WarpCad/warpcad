// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { INVALID_HOST_MESSAGES, VALID_HOST_MESSAGES } from '../ai/bridge/__fixtures__/hostMessages.js'
import { parseHostMessage } from '../ai/bridge/protocol.js'

/**
 * `TODO/ai-026`: inside the native app the live bridge's host messages arrive as Tauri events, not
 * on Vite's HMR socket. They go through `parseHostMessage` exactly as the HMR ones do (the same
 * fixtures as `protocol.spec.js`), a call runs through `runOnTab` unchanged, and its answer goes
 * back with `mcp_reply`. The tab endpoint is mocked at the boundary.
 */

const runOnTab = vi.fn(async (/** @type {any} */ _call, /** @type {any} */ options) => {
  options.onReply({ type: 'result', id: _call.id, result: { ok: true } })
})
vi.mock('./useTabEndpoint.js', () => ({ runOnTab: (/** @type {any} */ call, /** @type {any} */ options) => runOnTab(call, options), undoTabTurn: vi.fn() }))

/** A fake Tauri bridge in `globalThis`, as the webview injects it. */
function installBridge() {
  /** @type {Array<{ cmd: string, args: any }>} */
  const calls = []
  /** @type {Map<number, (event: any) => void>} */
  const callbacks = new Map()
  /** @type {Map<string, number[]>} */
  const listeners = new Map()
  let next = 1
  const endpoint = { port: 5184, url: 'http://127.0.0.1:5184/mcp', lanUrl: 'http://192.168.1.20:5184/mcp', token: 'f00d', lanError: null }
  const scope = /** @type {any} */ (globalThis)
  scope.__TAURI_INTERNALS__ = {
    transformCallback: (/** @type {(e: any) => void} */ fn) => {
      const id = next++
      callbacks.set(id, fn)
      return id
    },
    invoke: async (/** @type {string} */ cmd, /** @type {any} */ args) => {
      calls.push({ cmd, args })
      if (cmd === 'plugin:event|listen') listeners.set(args.event, [...(listeners.get(args.event) ?? []), args.handler])
      if (cmd === 'mcp_set_access' || cmd === 'mcp_rotate_token') return endpoint
      return null
    },
  }
  const emit = (/** @type {string} */ event, /** @type {unknown} */ payload) => {
    for (const id of listeners.get(event) ?? []) callbacks.get(id)?.({ event, id: 0, payload })
  }
  return { calls, emit, endpoint }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/** @type {ReturnType<typeof installBridge>} */
let bridge

beforeEach(() => {
  vi.resetModules()
  runOnTab.mockClear()
  setActivePinia(createPinia())
  bridge = installBridge()
})

afterEach(() => {
  delete (/** @type {any} */ (globalThis).__TAURI_INTERNALS__)
  vi.useRealTimers()
})

async function start() {
  const live = await import('./useLiveBridge.js')
  const { useAiChatStore } = await import('../stores/aiChat.js')
  live.startLiveBridge()
  await flush()
  return { live, chat: useAiChatStore() }
}

describe('useLiveBridge in the native app', () => {
  it('is available, not dev-host-only, and starts with access off on the host', async () => {
    const { chat } = await start()
    expect(chat.bridge).not.toBe('unavailable')
    expect(chat.nativeMcp.native).toBe(true)
    expect(bridge.calls.find((c) => c.cmd === 'mcp_set_access')?.args).toMatchObject({ lease: 'off', lan: false })
  })

  it('routes every valid host-message fixture through parseHostMessage, as the HMR route does', async () => {
    const { chat } = await start()
    for (const { data, parsed } of VALID_HOST_MESSAGES) {
      runOnTab.mockClear()
      bridge.emit('warpcad-mcp-host', data)
      await flush()
      if (parsed.type === 'call') {
        expect(runOnTab).toHaveBeenCalledTimes(1)
        expect(runOnTab.mock.calls[0][0]).toEqual(parseHostMessage(data))
      } else {
        expect(runOnTab).not.toHaveBeenCalled()
        const expected = parsed.connection === 'connected' ? 'connected' : parsed.connection === 'ambiguous' ? 'ambiguous' : parsed.access
        expect(chat.bridge).toBe(expected)
        expect(chat.bridgeExpiresAt).toBe(parsed.expiresAt)
        expect(chat.bridgeMessage).toBe(parsed.reason)
      }
    }
  })

  it('drops every invalid fixture without running anything or changing the state', async () => {
    const { chat } = await start()
    const before = chat.bridge
    for (const data of INVALID_HOST_MESSAGES) bridge.emit('warpcad-mcp-host', data)
    await flush()
    expect(runOnTab).not.toHaveBeenCalled()
    expect(chat.bridge).toBe(before)
  })

  it('answers a call with mcp_reply carrying the call’s id', async () => {
    await start()
    bridge.emit('warpcad-mcp-host', VALID_HOST_MESSAGES[0].data)
    await flush()
    const reply = bridge.calls.find((c) => c.cmd === 'mcp_reply')
    expect(reply?.args.id).toBe(1)
    expect(reply?.args.result.content[0].type).toBe('text')
  })

  it('setAccess sends the lease and the Wi-Fi switch, and the sheet gets the address and token', async () => {
    const { live, chat } = await start()
    expect(live.useLiveBridge().setAccess('1h', { lan: true })).toBe(true)
    // The surface is built from the registry, imported on demand: wait for the command.
    await vi.waitFor(() => expect(bridge.calls.filter((c) => c.cmd === 'mcp_set_access').at(-1)?.args.lease).toBe('1h'), { timeout: 10_000 })
    const access = bridge.calls.filter((c) => c.cmd === 'mcp_set_access').at(-1)
    expect(access?.args.lease).toBe('1h')
    expect(access?.args.lan).toBe(true)
    expect(access?.args.surface.tools.length).toBeGreaterThan(0)
    expect(access?.args.surface.writers).toContain('create')
    expect(chat.nativeMcp).toMatchObject({ lan: true, url: 'http://127.0.0.1:5184/mcp', lanUrl: 'http://192.168.1.20:5184/mcp', token: 'f00d' })
  })

  it('the sheet hears when a loopback client needs the token too, on enable and on New token (TODO/ai-042)', async () => {
    Object.assign(bridge.endpoint, { lanUrl: null, loopbackNeedsToken: true })
    const { live, chat } = await start()
    expect(live.useLiveBridge().setAccess('1h', { lan: false })).toBe(true)
    await vi.waitFor(() => expect(chat.nativeMcp.loopbackNeedsToken).toBe(true), { timeout: 10_000 })
    expect(chat.nativeMcp).toMatchObject({ lan: false, url: 'http://127.0.0.1:5184/mcp', lanUrl: '', token: 'f00d' })
    chat.nativeMcp = { ...chat.nativeMcp, loopbackNeedsToken: false }
    expect(await live.useLiveBridge().rotateToken()).toBe(true)
    expect(chat.nativeMcp.loopbackNeedsToken).toBe(true)
  })

  it('a host that rejects mcp_set_access leaves the sheet not enabled and says why in its words (TODO/ai-043)', async () => {
    const { live, chat } = await start()
    const internals = /** @type {any} */ (globalThis).__TAURI_INTERNALS__
    const answer = internals.invoke
    internals.invoke = async (/** @type {string} */ cmd, /** @type {any} */ args) => {
      if (cmd === 'mcp_set_access' && args.lease !== 'off') {
        bridge.calls.push({ cmd, args })
        throw 'WarpCad could not open a port for MCP access.'
      }
      return answer(cmd, args)
    }
    expect(live.useLiveBridge().setAccess('1h', { lan: true })).toBe(true)
    await vi.waitFor(() => expect(bridge.calls.filter((c) => c.cmd === 'mcp_set_access').at(-1)?.args.lease).toBe('1h'), { timeout: 10_000 })
    await vi.waitFor(() => expect(chat.bridgeMessage).toBe('WarpCad could not open a port for MCP access.'))
    expect(chat.bridge).not.toBe('enabled')
    expect(chat.nativeMcp).toMatchObject({ lan: false, lanUrl: '', token: '' })
  })

  it('after a return from the background, says MCP was paused for a few seconds, then the host state', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const { chat } = await (async () => {
      const live = await import('./useLiveBridge.js')
      const { useAiChatStore } = await import('../stores/aiChat.js')
      live.startLiveBridge()
      await vi.advanceTimersByTimeAsync(0)
      return { chat: useAiChatStore() }
    })()
    bridge.emit('warpcad-mcp-paused', {})
    bridge.emit('warpcad-mcp-host', { type: 'status', access: 'enabled', expiresAt: null, connection: 'connected', reason: '' })
    expect(chat.bridge).toBe('paused')
    expect(chat.bridgeMessage).toBe('MCP paused while WarpCad was in the background')
    await vi.advanceTimersByTimeAsync(5_000)
    expect(chat.bridge).toBe('connected')
  })
})
