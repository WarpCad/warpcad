// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge in the app (`TODO/ai-012`, `docs/decisions/ai-partner.md` Decision 11): glue
 * between a live host, the framework-free tab endpoint (`src/ai/bridge/tabEndpoint.js`), the live
 * document and the chat store. No geometry and no HTML here.
 *
 * - {@link startLiveBridge} — once, from `AppView` on mount. It picks the page's link to a host:
 *   - inside the native app (`TODO/ai-026`), the app's own MCP server (`src/native/mcp.js`): its host
 *     messages arrive as Tauri events and the page answers with `mcp_reply`;
 *   - under `npm run dev` (`import.meta.hot` exists), Vite's HMR socket on `warpcad:bridge`;
 *   - in a `VITE_LIVE_BRIDGE=1` build served by `npm run preview`, the preview transport
 *     (`src/ai/bridge/previewTransport.js`).
 *   In any other copy the state is `unavailable`. Every route reads host messages through the same
 *   `parseHostMessage`: `src/ai/bridge/protocol.js` is the contract for every host.
 * - `setAccess(lease, { lan })` — the live-MCP sheet's explicit access control; `lan` is the native
 *   app's **Allow devices on this Wi-Fi** switch (ignored by the dev host).
 * - `rotateToken()` — **New token** in the native app: every connected session ends.
 * - Calls from an MCP agent run through the tab's **shared** endpoint (`useTabEndpoint.js`, which
 *   WebMCP uses too — `TODO/ai-021`) against the **raw** live document, then the document store is
 *   refreshed so the viewport and History answer — exactly what `useAgent` does after a turn. The
 *   header's working chip shows while one runs (held a moment after, since a call is synchronous
 *   and would otherwise never paint).
 * - `undoTurn()` — **Undo AI turn** when the last AI change was an MCP group: the merge
 *   inverse under origin `mcp`, never the local undo stack (`useTabEndpoint.undoTabTurn`).
 *
 * @module composables/useLiveBridge
 */

import { BRIDGE_EVENT, parseHostMessage } from '../ai/bridge/protocol.js'
import { nativeSurface } from '../ai/bridge/mcpSurface.js'
import { createPreviewTransport, newPreviewTabId } from '../ai/bridge/previewTransport.js'
import { createNativeLink, rotateNativeToken } from '../native/mcp.js'
import { isNativeShell, probeShell } from '../native/shell.js'
import { useAiChatStore } from '../stores/aiChat.js'
import { runOnTab, undoTabTurn } from './useTabEndpoint.js'

let started = false

/** How long the chip says MCP was paused after the app returns from the background. */
export const PAUSED_NOTICE_MS = 4_000

/** The chip's words after a return from the background with a client connected (`TODO/ai-026`). */
export const PAUSED_NOTICE = 'MCP paused while WarpCad was in the background'

/**
 * The link the bridge listens and posts on: the native host, the dev host's HMR context, or the
 * preview transport.
 *
 * @typedef {{ on: (event: string, handler: (data: any) => void) => void, send: (event: string, data?: any) => void }} LiveLink
 */

/** @type {LiveLink | null | undefined} `undefined` until first asked. */
let live

/** True when {@link live} is the native app's host. */
let nativeHost = false

/** @type {ReturnType<typeof setTimeout> | undefined} */
let pausedTimer

/** @type {import('../ai/bridge/protocol.js').StatusMessage | null} The host's last status, held while the paused notice shows. */
let heldStatus = null

/** The page's MCP surface for the native host, built from the one registry when access is enabled. */
async function pageSurface() {
  const { createToolRegistry } = await import('../ai/tools/index.js')
  return nativeSurface(createToolRegistry())
}

/**
 * The tab's link to a live host, once per page (see the module comment).
 *
 * @returns {LiveLink | null}
 */
function liveHot() {
  if (live !== undefined) return live
  if (isNativeShell(probeShell())) {
    const chat = useAiChatStore()
    nativeHost = true
    chat.nativeMcp = { ...chat.nativeMcp, native: true }
    live = createNativeLink({
      surface: pageSurface,
      onEndpoint: (endpoint) => {
        chat.nativeMcp = { native: true, lan: endpoint.lanUrl !== '', url: endpoint.url, lanUrl: endpoint.lanUrl, token: endpoint.token, lanError: endpoint.lanError }
      },
      onPaused: () => showPaused(chat),
      onError: (message) => {
        chat.bridgeMessage = message
      },
    })
  } else if (import.meta.hot) live = /** @type {LiveLink} */ (/** @type {unknown} */ (import.meta.hot))
  else if (import.meta.env.VITE_LIVE_BRIDGE === '1' && typeof EventSource !== 'undefined') {
    live = createPreviewTransport({
      tabId: newPreviewTabId(/** @type {any} */ (globalThis.crypto)),
      EventSourceImpl: /** @type {any} */ (EventSource),
      fetchImpl: (url, init) => fetch(url, init),
    })
  } else live = null
  return live
}

/**
 * Which engine is drawing this page, for the sheet's one engine-specific line.
 *
 * @returns {'chromium' | 'firefox' | 'webkit'}
 */
export function browserEngine() {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/Firefox\//.test(agent)) return 'firefox'
  if (/Chrome\/|Chromium\/|Edg\//.test(agent)) return 'chromium'
  return 'webkit'
}

/**
 * The page is inside the native app, whose own MCP server is the host (`TODO/ai-026`).
 *
 * @returns {boolean}
 */
export function nativeLiveHost() {
  liveHot()
  return nativeHost
}

/**
 * @param {import('../ai/bridge/protocol.js').CallMessage} call
 * @param {{ send: (event: string, data?: any) => void }} hot
 */
async function runCall(call, hot) {
  await runOnTab(call, { onReply: (reply) => hot.send(BRIDGE_EVENT, reply) })
}

/**
 * @param {ReturnType<typeof useAiChatStore>} chat
 * @param {import('../ai/bridge/protocol.js').StatusMessage} message
 */
function applyStatus(chat, message) {
  chat.bridgeExpiresAt = message.expiresAt
  chat.bridge = message.connection === 'connected'
    ? 'connected'
    : message.connection === 'ambiguous'
      ? 'ambiguous'
    : message.access === 'enabled'
      ? 'enabled'
      : message.access === 'expired'
        ? 'expired'
        : 'off'
  chat.bridgeMessage = message.reason
}

/**
 * The app came back from the background with a client connected: say so for a few seconds, then
 * show the host's latest status.
 *
 * @param {ReturnType<typeof useAiChatStore>} chat
 */
function showPaused(chat) {
  clearTimeout(pausedTimer)
  chat.bridge = 'paused'
  chat.bridgeMessage = PAUSED_NOTICE
  pausedTimer = setTimeout(() => {
    pausedTimer = undefined
    if (heldStatus !== null) applyStatus(chat, heldStatus)
    heldStatus = null
  }, PAUSED_NOTICE_MS)
}

/**
 * Start listening for the live MCP host. Idempotent; safe to call from a mount hook.
 *
 * @returns {void}
 */
export function startLiveBridge() {
  if (started) return
  started = true
  const chat = useAiChatStore()
  const hot = liveHot()
  if (!hot) {
    chat.bridge = 'unavailable'
    return
  }
  chat.bridge = 'idle'
  hot.on(BRIDGE_EVENT, (data) => {
    const message = parseHostMessage(data)
    if (message === null) return
    if (message.type === 'status') {
      if (pausedTimer !== undefined) heldStatus = message
      else applyStatus(chat, message)
    } else if (message.type === 'call') {
      void runCall(message, hot)
    }
  })
  hot.on('vite:ws:disconnect', () => {
    if (chat.bridge === 'connected' || chat.bridge === 'enabled' || chat.bridge === 'ambiguous') {
      chat.bridge = 'disconnected'
      chat.bridgeMessage = 'The connection to the WarpCad dev server dropped. Reopen this tab to restore the live MCP connection.'
    }
  })
  hot.send(BRIDGE_EVENT, { type: 'hello' })
}

/**
 * @returns {{ setAccess: (lease: '15m' | '1h' | 'tab' | 'unlimited' | 'off', options?: { lan?: boolean }) => boolean, rotateToken: () => Promise<boolean>, undoTurn: () => void }}
 */
export function useLiveBridge() {
  const chat = useAiChatStore()

  /**
   * Set the explicit local-access lease in the host.
   *
   * @param {'15m' | '1h' | 'tab' | 'unlimited' | 'off'} lease
   * @param {{ lan?: boolean }} [options] the native app's Wi-Fi switch; kept as it was when omitted
   */
  function setAccess(lease, options = {}) {
    const hot = liveHot()
    if (!hot) return false
    if (lease !== 'off') chat.bridge = 'enabled'
    else chat.bridge = 'idle'
    // Until the host's status arrives (with the authoritative time), show the lease the user chose.
    chat.bridgeExpiresAt = lease === '15m' ? Date.now() + 15 * 60_000 : lease === '1h' ? Date.now() + 60 * 60_000 : null
    chat.bridgeMessage = ''
    const lan = lease !== 'off' && (options.lan ?? chat.nativeMcp.lan)
    hot.send(BRIDGE_EVENT, nativeHost ? { type: 'access', lease, lan } : { type: 'access', lease })
    return true
  }

  /** **New token** (native app only). */
  async function rotateToken() {
    if (!nativeLiveHost()) return false
    const endpoint = await rotateNativeToken()
    chat.nativeMcp = { ...chat.nativeMcp, url: endpoint.url, lanUrl: endpoint.lanUrl, token: endpoint.token, lanError: endpoint.lanError }
    return true
  }

  return { setAccess, rotateToken, undoTurn: undoTabTurn }
}
