// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge's host core (`TODO/ai-012`, `docs/decisions/ai-partner.md` Decision 11):
 * **a relay with no document.** An MCP client's `tools/call` arrives on a session; this
 * forwards it to the one WarpCad tab authorized by the active lease, which runs it through the real
 * registry on the live document (`src/ai/bridge/tabEndpoint.js`), and hands back the JSON. It
 * never parses a project and never writes a file.
 *
 * Framework-free and transport-free: no HTTP, no WebSocket, no Vite. A *link* is one MCP session
 * (`openLink(sessionId)`); a *tab* is any object with a `send(message)`. The Vite plugin
 * (`mcp/liveBridge.js`) is the thin host that connects these to Streamable HTTP and Vite's HMR
 * socket. The standalone `mcp/server.js --live` host Decision 11 also describes is reserved, not
 * built; it would reuse this core unchanged.
 *
 * ## Access lease
 *
 * The user enables a lease in the WarpCad tab. Calls route only when exactly one MCP session and
 * one enabled tab exist; otherwise they are refused. Timed leases expire on the host, and closing
 * the tab revokes every lease.
 *
 * ## One call at a time
 *
 * Each link's calls are queued and sent to its tab one at a time, in order. A call the tab does
 * not answer within {@link CALL_TIMEOUT_MS} is refused in words (it may still have landed; the
 * model is told to check `get_timeline`), and a late answer is dropped. A tab whose socket drops
 * fails its in-flight call the same way and leaves the link waiting for access to be enabled again.
 *
 * ## The request gate
 *
 * {@link createRequestGate} is the Origin/Host allow-list the HTTP host puts in front of `/mcp`:
 * a request with no `Origin` (Claude Code, a CLI) or the app's own dev origin passes; any other
 * web page — including another local dev server — is refused, and so is a non-loopback `Host`
 * (DNS rebinding). The HMR socket has Vite's own gate (its Host allow-list and token); the
 * explicit access lease is the gate behind both.
 *
 * @module mcp/bridge
 */

import {
  ACCESS_LEASES,
  CALL_TIMEOUT_MS,
  parseTabMessage,
} from '../src/ai/bridge/protocol.js'

const LEASE_MS = { '15m': 15 * 60_000, '1h': 60 * 60_000 }

/**
 * @typedef {object} BridgeTab
 * @property {(message: import('../src/ai/bridge/protocol.js').HostMessage) => void} send
 */

/**
 * @typedef {{ kind: 'result', result: Record<string, any> } | { kind: 'refused', text: string }} BridgeOutcome
 *   `refused` text is for the model, plain words, never `document_data`.
 */

/**
 * @typedef {object} BridgeCall
 * @property {string} name
 * @property {unknown} input
 * @property {string} [request]
 */

/**
 * @typedef {object} Link
 * @property {string} id
 * @property {BridgeTab | null} tab
 * @property {Promise<unknown>} queue
 * @property {{ id: number, resolve: (outcome: BridgeOutcome) => void, timer: unknown } | null} inFlight
 */

/**
 * @typedef {object} Bridge
 * @property {(linkId: string) => void} openLink A new MCP session.
 * @property {(linkId: string) => void} closeLink The session ended: its tab is told, its code dies.
 * @property {(linkId: string, call: BridgeCall) => Promise<BridgeOutcome>} call
 * @property {(tab: BridgeTab, data: unknown) => void} tabMessage Anything the tab sent.
 * @property {(tab: BridgeTab) => void} tabDisconnected The tab's socket closed.
 * @property {(linkId: string) => 'waiting' | 'paired' | 'closed'} linkState
 * @property {() => void} close The host is going away: every code dies, every call fails.
 */

/** @param {string} id A session id — only its first characters ever reach a log line. */
const short = (id) => id.slice(0, 8)

/**
 * The sentence a call gets when no tab is paired — the only place the code is ever written.
 *
 * @param {'off' | 'enabled' | 'expired'} access
 * @param {'idle' | 'ambiguous'} connection
 * @param {string} tool
 */
function routeRefusal(access, connection, tool) {
  if (connection === 'ambiguous') return `WarpCad refused ${tool}: more than one MCP client or enabled WarpCad tab is connected. Disconnect the extra client or turn off access in the other tab, then retry.`
  if (access === 'expired') return `WarpCad refused ${tool}: live MCP access expired. Enable it again in WarpCad, then retry.`
  if (access === 'enabled') return `WarpCad refused ${tool}: there is no unambiguous enabled WarpCad tab. Keep one project tab open with live MCP access enabled, then retry.`
  return `WarpCad refused ${tool}: live MCP access is off. In WarpCad, open Assistant → Live MCP access and explicitly enable it, then retry.`
}

const DROPPED =
  'The WarpCad tab closed, reloaded or disconnected while this call ran, so it is not known whether it landed. ' +
  'Once the user reconnects, call get_timeline to check before retrying.'

/**
 * Build the bridge core.
 *
 * @param {object} [options]
 * @param {() => number} [options.now]
 * @param {() => string} [options.randomCode] A spec's seam; `node:crypto` by default.
 * @param {number} [options.callTimeoutMs] {@link CALL_TIMEOUT_MS} by default.
 * @param {(line: string) => void} [options.log] Diagnostics. Never given a code.
 * @param {(fn: () => void, ms: number) => unknown} [options.setTimer]
 * @param {(timer: unknown) => void} [options.clearTimer]
 * @returns {Bridge}
 */
export function createBridge(options = {}) {
  const now = options.now ?? Date.now
  const callTimeoutMs = options.callTimeoutMs ?? CALL_TIMEOUT_MS
  const log = options.log ?? (() => {})
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(/** @type {any} */ (timer)))
  /** @type {Map<string, Link>} */
  const links = new Map()
  /** @type {Map<BridgeTab, { lease: '15m' | '1h' | 'tab' | 'unlimited' | null, expiresAt: number | null, expired: boolean, timer: unknown }>} */
  const tabs = new Map()
  let nextCallId = 1
  let closed = false

  const enabledTabs = () => [...tabs.entries()].filter(([, state]) => state.lease !== null && (state.expiresAt === null || now() < state.expiresAt))

  function route() {
    const active = enabledTabs()
    return !closed && links.size === 1 && active.length === 1 ? { link: [...links.values()][0], tab: active[0][0] } : null
  }

  /** @param {Link} link @param {BridgeOutcome} outcome */
  function settle(link, outcome) {
    const flight = link.inFlight
    if (flight === null) return
    link.inFlight = null
    clearTimer(flight.timer)
    flight.resolve(outcome)
  }

  function refreshStatus() {
    const active = enabledTabs()
    const ambiguous = active.length > 1 || (active.length === 1 && links.size > 1)
    const routed = route()
    for (const link of links.values()) {
      const nextTab = routed?.link === link ? routed.tab : null
      if (link.tab !== null && link.tab !== nextTab) settle(link, { kind: 'refused', text: DROPPED })
      link.tab = nextTab
    }
    for (const [tab, state] of tabs) {
      const access = state.expired ? 'expired' : state.lease === null ? 'off' : 'enabled'
      const reason = ambiguous
        ? 'More than one MCP client or enabled tab is connected; calls are refused until there is only one.'
        : access === 'expired'
          ? 'Live MCP access expired.'
          : access === 'off'
            ? 'Live MCP access is off.'
            : ''
      try {
        tab.send({ type: 'status', access, expiresAt: state.expiresAt, connection: ambiguous ? 'ambiguous' : routed?.tab === tab ? 'connected' : 'idle', reason })
      } catch {
        // A disconnected HMR client is removed by the socket close event.
      }
    }
  }

  /** @param {Link} link @param {string} reason */
  function unpair(link, reason) {
    if (link.tab === null) return
    link.tab = null
    settle(link, { kind: 'refused', text: DROPPED })
    log(`session ${short(link.id)}: route closed (${reason})`)
  }

  /**
   * @param {Link} link
   * @param {BridgeCall} call
   * @returns {Promise<BridgeOutcome>}
   */
  function forward(link, call) {
    if (closed) return Promise.resolve({ kind: 'refused', text: 'The WarpCad dev server is shutting down.' })
    const routed = route()
    const active = enabledTabs()
    const access = active.length > 0 ? 'enabled' : [...tabs.values()].some((state) => state.expired) ? 'expired' : 'off'
    const ambiguous = active.length > 1 || (active.length > 0 && links.size > 1)
    if (routed === null || routed.link !== link) {
      return Promise.resolve({ kind: 'refused', text: routeRefusal(access, ambiguous ? 'ambiguous' : 'idle', call.name) })
    }
    const tab = routed.tab
    const id = nextCallId++
    return new Promise((resolve) => {
      const timer = setTimer(() => {
        if (link.inFlight?.id !== id) return
        log(`session ${short(link.id)}: ${call.name} timed out`)
        settle(link, {
          kind: 'refused',
          text: `WarpCad did not answer within ${Math.round(callTimeoutMs / 1000)} s, so it is not known whether ${call.name} landed. Call get_timeline to check before retrying.`,
        })
      }, callTimeoutMs)
      link.inFlight = { id, resolve, timer }
      try {
        tab.send({ type: 'call', id, name: call.name, input: call.input, ...(call.request === undefined ? {} : { request: call.request }) })
      } catch {
        settle(link, { kind: 'refused', text: DROPPED })
      }
    })
  }

  /** @param {BridgeTab} tab @param {'15m' | '1h' | 'tab' | 'unlimited' | 'off'} lease */
  function setAccess(tab, lease) {
    const state = tabs.get(tab)
    if (state === undefined || closed || !ACCESS_LEASES.includes(lease)) return
    clearTimer(state.timer)
    state.timer = null
    state.expired = false
    state.lease = lease === 'off' ? null : lease
    state.expiresAt = lease === '15m' ? now() + LEASE_MS['15m'] : lease === '1h' ? now() + LEASE_MS['1h'] : null
    if (state.expiresAt !== null) {
      const expectedExpiry = state.expiresAt
      state.timer = setTimer(() => {
        if (state.expiresAt !== expectedExpiry || now() < expectedExpiry) return
        state.lease = null
        state.expired = true
        state.timer = null
        const activeLink = [...links.values()].find((link) => link.tab === tab)
        if (activeLink !== undefined) unpair(activeLink, 'Live MCP access expired.')
        refreshStatus()
      }, Math.max(0, state.expiresAt - now()))
    }
    log(`tab access ${state.lease === null ? 'disabled' : `enabled (${lease})`}`)
    refreshStatus()
  }

  return {
    openLink(linkId) {
      if (links.has(linkId)) return
      links.set(linkId, { id: linkId, tab: null, queue: Promise.resolve(), inFlight: null })
      log(`session ${short(linkId)}: opened`)
      refreshStatus()
    },

    closeLink(linkId) {
      const link = links.get(linkId)
      if (link === undefined) return
      unpair(link, 'Claude Code ended this session.')
      links.delete(linkId)
      log(`session ${short(linkId)}: closed`)
      refreshStatus()
    },

    call(linkId, call) {
      const link = links.get(linkId)
      if (link === undefined) {
        return Promise.resolve({ kind: 'refused', text: 'This MCP session is not known to the WarpCad bridge. Reconnect the WarpCad MCP server.' })
      }
      const next = link.queue.then(() => forward(link, call))
      link.queue = next.catch(() => undefined)
      return next
    },

    tabMessage(tab, data) {
      const message = parseTabMessage(data)
      if (message === null) return
      if (message.type === 'hello') {
        if (!tabs.has(tab)) tabs.set(tab, { lease: null, expiresAt: null, expired: false, timer: null })
        refreshStatus()
        return
      }
      if (message.type === 'access') {
        setAccess(tab, message.lease)
        return
      }
      if (message.type === 'result') {
        const link = [...links.values()].find((candidate) => candidate.tab === tab)
        if (link === undefined || link.inFlight?.id !== message.id) return
        settle(link, { kind: 'result', result: message.result })
      }
    },

    tabDisconnected(tab) {
      const state = tabs.get(tab)
      if (state !== undefined) clearTimer(state.timer)
      tabs.delete(tab)
      for (const link of links.values()) {
        if (link.tab !== tab) continue
        link.tab = null
        log(`session ${short(link.id)}: its WarpCad tab disconnected`)
        settle(link, { kind: 'refused', text: DROPPED })
      }
      refreshStatus()
    },

    linkState(linkId) {
      const link = links.get(linkId)
      if (link === undefined) return 'closed'
      return link.tab === null ? 'waiting' : 'paired'
    },

    close() {
      closed = true
      for (const link of links.values()) {
        unpair(link, 'The WarpCad dev server stopped.')
      }
      for (const state of tabs.values()) clearTimer(state.timer)
      tabs.clear()
      log('bridge closed')
    },
  }
}

/**
 * @typedef {object} AllowList
 * @property {readonly string[]} origins Exact `Origin` values a browser may send.
 * @property {readonly string[]} hosts Exact `Host` values (name and port).
 */

/**
 * The dev host's allow-list: the Vite dev server's own origins on `port`.
 *
 * @param {number} port
 * @returns {AllowList}
 */
export function devAllowList(port) {
  const names = ['localhost', '127.0.0.1', '[::1]']
  return {
    origins: names.map((name) => `http://${name}:${port}`),
    hosts: names.map((name) => `${name}:${port}`),
  }
}

/**
 * The `/mcp` request gate (Decision 11 point 5a).
 *
 * @param {AllowList} allow
 * @returns {(headers: { origin?: string | string[], host?: string | string[] }) => string | null} The
 *   refusal reason, or `null` to let the request through.
 */
export function createRequestGate(allow) {
  return ({ origin, host }) => {
    const hostValue = Array.isArray(host) ? host[0] : host
    if (hostValue === undefined || !allow.hosts.includes(hostValue.toLowerCase())) {
      return 'Refused: the WarpCad bridge only answers on this computer’s loopback address.'
    }
    // No Origin: not a web page (Claude Code, curl). A page always sends one on a POST.
    if (origin === undefined) return null
    const originValue = Array.isArray(origin) ? origin[0] : origin
    return allow.origins.includes(originValue) ? null : 'Refused: this web page is not WarpCad.'
  }
}
