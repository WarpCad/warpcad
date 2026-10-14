// SPDX-License-Identifier: AGPL-3.0-or-later
import { request as httpRequest, createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { CODE_ALPHABET, formatCode } from '../src/ai/bridge/protocol.js'
import { createBridge, createRequestGate, devAllowList } from './bridge.js'

/**
 * The live bridge's host core (`TODO/ai-012`, Decision 11): pairing, origin gate, the call queue,
 * timeouts, and the tab dropping mid-call. Framework-free and transport-free — the Vite plugin
 * (`mcp/liveBridge.js`) is the thin host that wires it to HTTP and Vite's HMR socket. Here a "tab"
 * is a plain object with a `send`, which is all the core ever sees of one.
 */

function harness(options = {}) {
  let t = 5_000_000
  /** @type {string[]} */
  const logs = []
  /** @type {Array<{ ms: number, fn: () => void, cleared: boolean }>} */
  const timers = []
  let codes = 0
  const bridge = createBridge({
    now: () => t,
    log: (line) => logs.push(line),
    // Distinct, alphabet-valid codes, so a test can tell one from the next.
    randomCode: () => ['K7Q4FX2M', 'HJ3NPR8W', 'ZX9CVB2N', 'MN4PQR7S'][codes++ % 4],
    setTimer: (fn, ms) => {
      const timer = { ms, fn, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimer: (timer) => {
      if (timer) /** @type {any} */ (timer).cleared = true
    },
    ...options,
  })
  return {
    bridge,
    logs,
    advance: (/** @type {number} */ ms) => {
      t += ms
    },
    fireTimers: () => {
      for (const timer of timers.splice(0)) if (!timer.cleared) timer.fn()
    },
  }
}

/** A tab: records what the host sent it. */
function fakeTab() {
  /** @type {any[]} */
  const inbox = []
  return { inbox, send: (/** @type {any} */ message) => inbox.push(message) }
}

/** @param {{ kind: string, text?: string }} outcome */
function codeIn(outcome) {
  const match = /\b([A-Z2-9]{4})-([A-Z2-9]{4})\b/.exec(outcome.text ?? '')
  return match ? `${match[1]}${match[2]}` : null
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('createBridge: no tab yet', () => {
  it('answers a call with the instruction sentence carrying an 8-character code, not a hang', async () => {
    const { bridge } = harness()
    bridge.openLink('s1')
    const outcome = await bridge.call('s1', { name: 'create', input: {} })
    expect(outcome.kind).toBe('refused')
    const code = codeIn(outcome)
    expect(code).toHaveLength(8)
    for (const char of /** @type {string} */ (code)) expect(CODE_ALPHABET).toContain(char)
    expect(/** @type {any} */ (outcome).text).toMatch(/Assistant → Connect to Claude Code/)
    expect(/** @type {any} */ (outcome).text).toMatch(/npm run dev/)
    expect(/** @type {any} */ (outcome).text).toMatch(/5 minutes/)
    // Asked again while it is still valid: the same code, not a new one each call.
    expect(codeIn(await bridge.call('s1', { name: 'describe_scene', input: {} }))).toBe(code)
  })

  it('refuses a call on a link that was never opened, in words', async () => {
    const { bridge } = harness()
    const outcome = await bridge.call('nope', { name: 'create', input: {} })
    expect(outcome).toMatchObject({ kind: 'refused' })
    expect(codeIn(outcome)).toBeNull()
  })
})

describe('createBridge: pairing', () => {
  it('pairs a tab that sends the right code (any case, with or without the hyphen), then forwards calls to it', async () => {
    const { bridge } = harness()
    bridge.openLink('s1')
    const code = /** @type {string} */ (codeIn(await bridge.call('s1', { name: 'create', input: {} })))
    const tab = fakeTab()
    bridge.tabMessage(tab, { type: 'pair', code: formatCode(code).toLowerCase() })
    expect(tab.inbox).toEqual([{ type: 'paired' }])
    expect(bridge.linkState('s1')).toBe('paired')

    const pending = bridge.call('s1', { name: 'create', input: { op: 'primitive.cuboid' }, request: 'a cube' })
    await flush()
    const forwarded = tab.inbox.at(-1)
    expect(forwarded).toMatchObject({ type: 'call', name: 'create', input: { op: 'primitive.cuboid' }, request: 'a cube' })
    bridge.tabMessage(tab, { type: 'result', id: forwarded.id, result: { applied: [{ bodyId: 'cuboid-x-1' }] } })
    expect(await pending).toEqual({ kind: 'result', result: { applied: [{ bodyId: 'cuboid-x-1' }] } })
  })

  it('refuses a wrong code and keeps the right one usable', async () => {
    const { bridge } = harness()
    bridge.openLink('s1')
    const code = /** @type {string} */ (codeIn(await bridge.call('s1', { name: 'create', input: {} })))
    const tab = fakeTab()
    bridge.tabMessage(tab, { type: 'pair', code: 'ABCD-EFGH' })
    expect(tab.inbox.at(-1)).toMatchObject({ type: 'pair-refused', reason: expect.stringMatching(/code/i) })
    bridge.tabMessage(tab, { type: 'pair', code })
    expect(tab.inbox.at(-1)).toEqual({ type: 'paired' })
  })

  it('refuses a reused code: single use', async () => {
    const { bridge } = harness()
    bridge.openLink('s1')
    const code = /** @type {string} */ (codeIn(await bridge.call('s1', { name: 'create', input: {} })))
    const first = fakeTab()
    const second = fakeTab()
    bridge.tabMessage(first, { type: 'pair', code })
    bridge.tabMessage(second, { type: 'pair', code })
    expect(first.inbox).toEqual([{ type: 'paired' }])
    expect(second.inbox.at(-1)).toMatchObject({ type: 'pair-refused' })
  })

  it('refuses an expired code (5 minutes) and issues a new one on the next call', async () => {
    const { bridge, advance } = harness()
    bridge.openLink('s1')
    const code = /** @type {string} */ (codeIn(await bridge.call('s1', { name: 'create', input: {} })))
    advance(5 * 60_000 + 1)
    const tab = fakeTab()
    bridge.tabMessage(tab, { type: 'pair', code })
    expect(tab.inbox.at(-1)).toMatchObject({ type: 'pair-refused' })
    const next = codeIn(await bridge.call('s1', { name: 'create', input: {} }))
    expect(next).not.toBeNull()
    expect(next).not.toBe(code)
  })

  it('stops listening to a tab after five wrong codes, even for the right one', async () => {
    const { bridge } = harness()
    bridge.openLink('s1')
    const code = /** @type {string} */ (codeIn(await bridge.call('s1', { name: 'create', input: {} })))
    const tab = fakeTab()
    for (let attempt = 0; attempt < 5; attempt += 1) bridge.tabMessage(tab, { type: 'pair', code: 'ABCD-EFGH' })
    bridge.tabMessage(tab, { type: 'pair', code })
    expect(tab.inbox.at(-1)).toMatchObject({ type: 'pair-refused', reason: expect.stringMatching(/too many/i) })
    expect(bridge.linkState('s1')).toBe('waiting')
  })

  it('kills every code when the host closes', async () => {
    const { bridge } = harness()
    bridge.openLink('s1')
    const code = /** @type {string} */ (codeIn(await bridge.call('s1', { name: 'create', input: {} })))
    bridge.close()
    const tab = fakeTab()
    bridge.tabMessage(tab, { type: 'pair', code })
    expect(tab.inbox.at(-1)).toMatchObject({ type: 'pair-refused' })
  })

  it('ignores a result from a tab that is not paired', async () => {
    const { bridge } = harness()
    bridge.openLink('s1')
    const stranger = fakeTab()
    expect(() => bridge.tabMessage(stranger, { type: 'result', id: 1, result: {} })).not.toThrow()
    expect(() => bridge.tabMessage(stranger, 'garbage')).not.toThrow()
  })
})

/** Pair a fresh tab to link `s1` and return it. */
async function paired() {
  const h = harness()
  h.bridge.openLink('s1')
  const code = /** @type {string} */ (codeIn(await h.bridge.call('s1', { name: 'create', input: {} })))
  const tab = fakeTab()
  h.bridge.tabMessage(tab, { type: 'pair', code })
  tab.inbox.length = 0
  return { ...h, tab, code }
}

describe('createBridge: one call at a time', () => {
  it('sends the tab the next call only after it has answered the last, in order', async () => {
    const { bridge, tab } = await paired()
    const first = bridge.call('s1', { name: 'create', input: { n: 1 } })
    const second = bridge.call('s1', { name: 'create', input: { n: 2 } })
    await flush()
    expect(tab.inbox).toHaveLength(1)
    expect(tab.inbox[0].input).toEqual({ n: 1 })
    bridge.tabMessage(tab, { type: 'result', id: tab.inbox[0].id, result: { ok: 1 } })
    expect(await first).toEqual({ kind: 'result', result: { ok: 1 } })
    await flush()
    expect(tab.inbox).toHaveLength(2)
    expect(tab.inbox[1].input).toEqual({ n: 2 })
    bridge.tabMessage(tab, { type: 'result', id: tab.inbox[1].id, result: { ok: 2 } })
    expect(await second).toEqual({ kind: 'result', result: { ok: 2 } })
  })

  it('fails the in-flight call with a readable error when the tab’s socket drops, and asks for a new pairing after', async () => {
    const { bridge, tab, code } = await paired()
    const pending = bridge.call('s1', { name: 'create', input: {} })
    await flush()
    bridge.tabDisconnected(tab)
    const outcome = await pending
    expect(outcome.kind).toBe('refused')
    expect(/** @type {any} */ (outcome).text).toMatch(/closed|reloaded|disconnected/i)
    expect(/** @type {any} */ (outcome).text).toMatch(/get_timeline/)
    expect(bridge.linkState('s1')).toBe('waiting')
    const again = await bridge.call('s1', { name: 'create', input: {} })
    expect(codeIn(again)).not.toBeNull()
    expect(codeIn(again)).not.toBe(code)
  })

  it('times out a call the tab never answers, says so, and ignores a late answer', async () => {
    const { bridge, tab, fireTimers } = await paired()
    const pending = bridge.call('s1', { name: 'create', input: {} })
    await flush()
    fireTimers()
    const outcome = await pending
    expect(outcome.kind).toBe('refused')
    expect(/** @type {any} */ (outcome).text).toMatch(/did not answer/i)
    expect(() => bridge.tabMessage(tab, { type: 'result', id: tab.inbox[0].id, result: {} })).not.toThrow()
  })

  it('moves a tab to the newest session that pairs it, telling the old one', async () => {
    const { bridge, tab } = await paired()
    bridge.openLink('s2')
    const code2 = /** @type {string} */ (codeIn(await bridge.call('s2', { name: 'create', input: {} })))
    bridge.tabMessage(tab, { type: 'pair', code: code2 })
    expect(bridge.linkState('s2')).toBe('paired')
    expect(bridge.linkState('s1')).toBe('waiting')
  })
})

describe('createBridge: the code is never written down', () => {
  it('appears in no log line, and in no result after pairing', async () => {
    const { bridge, tab, code, logs } = await paired()
    const pending = bridge.call('s1', { name: 'describe_scene', input: {} })
    await flush()
    bridge.tabMessage(tab, { type: 'result', id: tab.inbox[0].id, result: { count: 0 } })
    const outcome = await pending
    bridge.tabDisconnected(tab)
    bridge.close()
    expect(logs.length).toBeGreaterThan(0)
    for (const line of logs) {
      expect(line).not.toContain(code)
      expect(line).not.toContain(formatCode(code))
    }
    expect(JSON.stringify(outcome)).not.toContain(code)
    expect(JSON.stringify(outcome)).not.toContain(formatCode(code))
  })
})

describe('createRequestGate (origin allow-list, over a real loopback socket)', () => {
  /** @type {import('node:http').Server | null} */
  let server = null
  afterEach(async () => {
    await new Promise((resolve) => (server ? server.close(resolve) : resolve(undefined)))
    server = null
  })

  /**
   * @param {Record<string, string>} headers
   * @returns {Promise<number>}
   */
  async function statusFor(headers) {
    const port = /** @type {import('node:net').AddressInfo} */ (server?.address()).port
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { host: `127.0.0.1:${port}`, ...headers } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end('{}')
    })
  }

  async function listen() {
    server = createServer()
    await new Promise((resolve) => /** @type {import('node:http').Server} */ (server).listen(0, '127.0.0.1', () => resolve(undefined)))
    const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
    const gate = createRequestGate(devAllowList(port))
    server.on('request', (req, res) => {
      const refused = gate({ origin: req.headers.origin, host: req.headers.host })
      res.statusCode = refused ? 403 : 200
      res.end(refused ?? 'ok')
    })
    return port
  }

  it('lets Claude Code in (no Origin header) and the app’s own dev origins', async () => {
    const port = await listen()
    expect(await statusFor({})).toBe(200)
    expect(await statusFor({ origin: `http://localhost:${port}` })).toBe(200)
    expect(await statusFor({ origin: `http://127.0.0.1:${port}` })).toBe(200)
  })

  it('refuses a foreign Origin — any web page, including another local dev server', async () => {
    const port = await listen()
    expect(await statusFor({ origin: 'https://evil.example' })).toBe(403)
    expect(await statusFor({ origin: 'http://localhost:9999' })).toBe(403)
    expect(await statusFor({ origin: 'null' })).toBe(403)
    expect(port).toBeGreaterThan(0)
  })

  it('refuses a Host that is not loopback (DNS rebinding)', async () => {
    const port = await listen()
    expect(await statusFor({ host: `evil.example:${port}` })).toBe(403)
  })
})
