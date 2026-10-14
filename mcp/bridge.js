// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge's host core (`TODO/ai-012`, `docs/decisions/ai-partner.md` Decision 11):
 * **a relay with no document.** Claude Code's `tools/call` arrives on an MCP session; this
 * forwards it to the one WarpCad tab paired with that session, which runs it through the real
 * registry on the live document (`src/ai/bridge/tabEndpoint.js`), and hands back the JSON. It
 * never parses a project and never writes a file.
 *
 * Framework-free and transport-free: no HTTP, no WebSocket, no Vite. A *link* is one MCP session
 * (`openLink(sessionId)`); a *tab* is any object with a `send(message)`. The Vite plugin
 * (`mcp/liveBridge.js`) is the thin host that connects these to Streamable HTTP and Vite's HMR
 * socket. The standalone `mcp/server.js --live` host Decision 11 also describes is reserved, not
 * built; it would reuse this core unchanged.
 *
 * ## Pairing (Decision 11 point 5)
 *
 * - The first call on a link with no tab gets back **the instruction sentence**, the one place
 *   the code ever appears: "…choose Assistant → Connect to Claude Code, and enter the code
 *   K7Q4-FX2M…". Claude Code shows it to the user. A call is never left hanging.
 * - The code is 8 characters (`CODE_ALPHABET`, no look-alikes), **single use**, valid
 *   {@link CODE_TTL_MS}, and dies with the host (`close()`). The same code is repeated while it
 *   is valid, so asking twice does not invalidate what the user is already typing.
 * - A tab that sends {@link MAX_PAIR_ATTEMPTS} wrong codes is not listened to again until it
 *   reloads (a fresh HMR client).
 * - **The code is never logged**, never written to a file, and never in any other tool result:
 *   `log` lines name a link by a short prefix of its session id and nothing else. Not a
 *   credential-store entry (Decision 8): a one-session handshake.
 *
 * ## One call at a time
 *
 * Each link's calls are queued and sent to its tab one at a time, in order. A call the tab does
 * not answer within {@link CALL_TIMEOUT_MS} is refused in words (it may still have landed; the
 * model is told to check `get_timeline`), and a late answer is dropped. A tab whose socket drops
 * fails its in-flight call the same way and leaves the link waiting for a new code.
 *
 * ## The request gate
 *
 * {@link createRequestGate} is the Origin/Host allow-list the HTTP host puts in front of `/mcp`:
 * a request with no `Origin` (Claude Code, a CLI) or the app's own dev origin passes; any other
 * web page — including another local dev server — is refused, and so is a non-loopback `Host`
 * (DNS rebinding). The HMR socket has Vite's own gate (its Host allow-list and token); the
 * pairing code is the gate behind both.
 *
 * @module mcp/bridge
 */

import { randomInt } from 'node:crypto'

import {
  CALL_TIMEOUT_MS,
  CODE_ALPHABET,
  CODE_LENGTH,
  CODE_TTL_MS,
  MAX_PAIR_ATTEMPTS,
  formatCode,
  normaliseCode,
  parseTabMessage,
} from '../src/ai/bridge/protocol.js'

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
 * @property {string | null} code The live pairing code, normalised; `null` when none is out.
 * @property {number} codeExpires
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

/** @returns {string} */
function cryptoRandomCode() {
  let code = ''
  for (let index = 0; index < CODE_LENGTH; index += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

/** @param {string} id A session id — only its first characters ever reach a log line. */
const short = (id) => id.slice(0, 8)

/**
 * The sentence a call gets when no tab is paired — the only place the code is ever written.
 *
 * @param {string} code
 * @param {string} tool
 */
function instructionSentence(code, tool) {
  return (
    `WarpCad is not connected to this Claude Code session yet. Ask the user to open WarpCad in a desktop browser on this computer ` +
    `(it must be running under \`npm run dev\`), choose Assistant → Connect to Claude Code, and enter the code ${formatCode(code)}. ` +
    `The code works once and expires in 5 minutes. Then call ${tool} again.`
  )
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
  const randomCode = options.randomCode ?? cryptoRandomCode
  const callTimeoutMs = options.callTimeoutMs ?? CALL_TIMEOUT_MS
  const log = options.log ?? (() => {})
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(/** @type {any} */ (timer)))
  /** @type {Map<string, Link>} */
  const links = new Map()
  /** Wrong codes per tab. A WeakMap: a tab that goes away takes its count with it. */
  /** @type {WeakMap<BridgeTab, number>} */
  const attempts = new WeakMap()
  let nextCallId = 1
  let closed = false

  /** @param {BridgeTab} tab @returns {Link | undefined} */
  const linkOfTab = (tab) => [...links.values()].find((link) => link.tab === tab)

  /** @param {Link} link */
  function currentCode(link) {
    if (link.code === null || now() >= link.codeExpires) {
      link.code = randomCode()
      link.codeExpires = now() + CODE_TTL_MS
      log(`session ${short(link.id)}: waiting for a WarpCad tab to pair (a code was issued)`)
    }
    return link.code
  }

  /** @param {Link} link @param {BridgeOutcome} outcome */
  function settle(link, outcome) {
    const flight = link.inFlight
    if (flight === null) return
    link.inFlight = null
    clearTimer(flight.timer)
    flight.resolve(outcome)
  }

  /** @param {Link} link @param {string} reason */
  function unpair(link, reason) {
    const tab = link.tab
    if (tab === null) return
    link.tab = null
    settle(link, { kind: 'refused', text: DROPPED })
    try {
      tab.send({ type: 'unpaired', reason })
    } catch {
      // The tab is already gone.
    }
  }

  /**
   * @param {Link} link
   * @param {BridgeCall} call
   * @returns {Promise<BridgeOutcome>}
   */
  function forward(link, call) {
    if (closed) return Promise.resolve({ kind: 'refused', text: 'The WarpCad dev server is shutting down.' })
    const tab = link.tab
    if (tab === null) return Promise.resolve({ kind: 'refused', text: instructionSentence(currentCode(link), call.name) })
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

  /** @param {BridgeTab} tab @param {string} typed */
  function pair(tab, typed) {
    const tries = attempts.get(tab) ?? 0
    if (tries >= MAX_PAIR_ATTEMPTS) {
      tab.send({ type: 'pair-refused', reason: 'Too many wrong codes. Reload WarpCad, then ask Claude Code for a new code.' })
      return
    }
    const code = normaliseCode(typed)
    const link =
      closed || code === null ? undefined : [...links.values()].find((candidate) => candidate.code === code && now() < candidate.codeExpires)
    if (link === undefined) {
      attempts.set(tab, tries + 1)
      log('a pairing attempt was refused')
      tab.send({
        type: 'pair-refused',
        reason: 'That code is not right, has been used, or has expired. Ask Claude Code for a new one: it gives you a code when it next tries to change the project.',
      })
      return
    }
    // Single use: it is gone the moment it works.
    link.code = null
    const previous = linkOfTab(tab)
    if (previous !== undefined && previous !== link) {
      previous.tab = null
      settle(previous, { kind: 'refused', text: DROPPED })
    }
    if (link.tab !== null && link.tab !== tab) unpair(link, 'Another WarpCad tab connected to this Claude Code session.')
    link.tab = tab
    attempts.delete(tab)
    log(`session ${short(link.id)}: a WarpCad tab paired`)
    tab.send({ type: 'paired' })
  }

  return {
    openLink(linkId) {
      if (links.has(linkId)) return
      links.set(linkId, { id: linkId, code: null, codeExpires: 0, tab: null, queue: Promise.resolve(), inFlight: null })
      log(`session ${short(linkId)}: opened`)
    },

    closeLink(linkId) {
      const link = links.get(linkId)
      if (link === undefined) return
      unpair(link, 'Claude Code ended this session.')
      links.delete(linkId)
      log(`session ${short(linkId)}: closed`)
    },

    call(linkId, call) {
      const link = links.get(linkId)
      if (link === undefined) {
        return Promise.resolve({ kind: 'refused', text: 'This MCP session is not known to the WarpCad bridge. Reconnect the warpcad server (/mcp in Claude Code).' })
      }
      const next = link.queue.then(() => forward(link, call))
      link.queue = next.catch(() => undefined)
      return next
    },

    tabMessage(tab, data) {
      const message = parseTabMessage(data)
      if (message === null) return
      if (message.type === 'pair') {
        pair(tab, message.code)
        return
      }
      if (message.type === 'result') {
        const link = linkOfTab(tab)
        if (link === undefined || link.inFlight?.id !== message.id) return
        settle(link, { kind: 'result', result: message.result })
      }
    },

    tabDisconnected(tab) {
      const link = linkOfTab(tab)
      if (link === undefined) return
      link.tab = null
      log(`session ${short(link.id)}: its WarpCad tab disconnected`)
      settle(link, { kind: 'refused', text: DROPPED })
    },

    linkState(linkId) {
      const link = links.get(linkId)
      if (link === undefined) return 'closed'
      return link.tab === null ? 'waiting' : 'paired'
    },

    close() {
      closed = true
      for (const link of links.values()) {
        link.code = null
        unpair(link, 'The WarpCad dev server stopped.')
      }
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
