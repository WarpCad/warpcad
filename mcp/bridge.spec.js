// SPDX-License-Identifier: AGPL-3.0-or-later
import { request as httpRequest, createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { createBridge, createRequestGate, devAllowList } from './bridge.js'

/**
 * The live bridge's host core (`TODO/ai-012`, Decision 11): timed access, origin gate, the call queue,
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
  const bridge = createBridge({
    now: () => t,
    log: (line) => logs.push(line),
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

const flush = () => new Promise((resolve) => setImmediate(resolve))

/** @param {{ bridge: import('./bridge.js').Bridge }} h @param {ReturnType<typeof fakeTab>} tab @param {string} lease */
function enable(h, tab, lease = 'tab') {
  h.bridge.tabMessage(tab, { type: 'hello' })
  h.bridge.tabMessage(tab, { type: 'access', lease })
}

describe('createBridge: explicit access leases', () => {
  it('refuses calls while access is off and does not create or return a pairing code', async () => {
    const { bridge } = harness()
    bridge.openLink('s1')
    const tab = fakeTab()
    enable({ bridge }, tab)
    bridge.tabMessage(tab, { type: 'access', lease: 'off' })
    const outcome = await bridge.call('s1', { name: 'create', input: {} })
    expect(outcome).toMatchObject({ kind: 'refused', text: expect.stringMatching(/access is off/i) })
    expect(outcome.kind === 'refused' ? outcome.text : '').not.toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}/)
    expect(tab.inbox.at(-1)).toMatchObject({ type: 'status', access: 'off' })
  })

  it.each(['15m', '1h', 'tab', 'unlimited'])('routes calls during the %s lease', async (lease) => {
    const h = harness()
    h.bridge.openLink('s1')
    const tab = fakeTab()
    enable(h, tab, lease)
    expect(h.bridge.linkState('s1')).toBe('paired')
    expect(tab.inbox.at(-1)).toMatchObject({ type: 'status', access: 'enabled', connection: 'connected' })
    const pending = h.bridge.call('s1', { name: 'create', input: { op: 'primitive.cuboid' }, request: 'a cube' })
    await flush()
    const forwarded = tab.inbox.at(-1)
    expect(forwarded).toMatchObject({ type: 'call', name: 'create', input: { op: 'primitive.cuboid' }, request: 'a cube' })
    h.bridge.tabMessage(tab, { type: 'result', id: forwarded.id, result: { applied: [{ bodyId: 'cuboid-x-1' }] } })
    expect(await pending).toEqual({ kind: 'result', result: { applied: [{ bodyId: 'cuboid-x-1' }] } })
  })

  it('revokes timed access at expiry and reports the expired state', async () => {
    const h = harness()
    h.bridge.openLink('s1')
    const tab = fakeTab()
    enable(h, tab, '15m')
    h.advance(15 * 60_000)
    h.fireTimers()
    expect(tab.inbox.at(-1)).toMatchObject({ type: 'status', access: 'expired', connection: 'idle' })
    expect(await h.bridge.call('s1', { name: 'create', input: {} })).toMatchObject({ kind: 'refused', text: expect.stringMatching(/expired/i) })
  })

  it('refuses when more than one MCP session or enabled tab makes routing ambiguous', async () => {
    const h = harness()
    h.bridge.openLink('s1')
    const tab = fakeTab()
    enable(h, tab)
    h.bridge.openLink('s2')
    expect(await h.bridge.call('s1', { name: 'create', input: {} })).toMatchObject({ kind: 'refused', text: expect.stringMatching(/more than one MCP client/i) })
    h.bridge.closeLink('s2')
    const secondTab = fakeTab()
    enable(h, secondTab)
    expect(await h.bridge.call('s1', { name: 'create', input: {} })).toMatchObject({ kind: 'refused', text: expect.stringMatching(/more than one MCP client or enabled WarpCad tab/i) })
  })

  it('ignores a result from a tab that has not introduced itself', () => {
    const { bridge } = harness()
    const stranger = fakeTab()
    expect(() => bridge.tabMessage(stranger, { type: 'result', id: 1, result: {} })).not.toThrow()
    expect(() => bridge.tabMessage(stranger, 'garbage')).not.toThrow()
  })
})

/** Enable a fresh tab for link `s1` and return it. */
async function paired() {
  const h = harness()
  h.bridge.openLink('s1')
  const tab = fakeTab()
  enable(h, tab)
  tab.inbox.length = 0
  return { ...h, tab }
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

  it('fails an in-flight call when the tab drops and requires a new explicit lease after reload', async () => {
    const { bridge, tab } = await paired()
    const pending = bridge.call('s1', { name: 'create', input: {} })
    await flush()
    bridge.tabDisconnected(tab)
    const outcome = await pending
    expect(outcome.kind).toBe('refused')
    expect(/** @type {any} */ (outcome).text).toMatch(/closed|reloaded|disconnected/i)
    expect(/** @type {any} */ (outcome).text).toMatch(/get_timeline/)
    expect(bridge.linkState('s1')).toBe('waiting')
    expect(await bridge.call('s1', { name: 'create', input: {} })).toMatchObject({ kind: 'refused', text: expect.stringMatching(/access is off/i) })
    const reloaded = fakeTab()
    enable({ bridge }, reloaded)
    expect(bridge.linkState('s1')).toBe('paired')
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

  it('refuses multiple MCP sessions and restores the route when the extra session closes', async () => {
    const { bridge, tab } = await paired()
    bridge.openLink('s2')
    expect(bridge.linkState('s2')).toBe('waiting')
    expect(bridge.linkState('s1')).toBe('waiting')
    expect(await bridge.call('s1', { name: 'create', input: {} })).toMatchObject({ kind: 'refused', text: expect.stringMatching(/more than one MCP client/i) })
    bridge.closeLink('s2')
    expect(bridge.linkState('s1')).toBe('paired')
  })
})

describe('createBridge: no code handshake', () => {
  it('ignores legacy code-pair messages and never returns a pairing code', async () => {
    const { bridge, tab, logs } = await paired()
    const pending = bridge.call('s1', { name: 'describe_scene', input: {} })
    await flush()
    expect(tab.inbox[0]).toMatchObject({ type: 'call', name: 'describe_scene' })
    bridge.tabMessage(tab, { type: 'pair', code: 'K7Q4-FX2M' })
    expect(tab.inbox.at(-1)).toMatchObject({ type: 'call' })
    bridge.tabMessage(tab, { type: 'result', id: tab.inbox[0].id, result: { count: 0 } })
    const outcome = await pending
    bridge.tabDisconnected(tab)
    bridge.close()
    expect(logs.length).toBeGreaterThan(0)
    expect(JSON.stringify(outcome)).not.toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}/)
    expect(logs.join('\n')).not.toMatch(/[A-Z2-9]{4}-[A-Z2-9]{4}/)
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
