// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge in the app (`TODO/ai-012`, `docs/decisions/ai-partner.md` Decision 11): glue
 * between Vite's HMR socket, the framework-free tab endpoint (`src/ai/bridge/tabEndpoint.js`),
 * the live document and the chat store. No geometry and no HTML here.
 *
 * - {@link startLiveBridge} — once, from `AppView` on mount. Under `npm run dev`
 *   (`import.meta.hot` exists) it listens for the host's messages on `warpcad:bridge`. In a
 *   `VITE_LIVE_BRIDGE=1` build served by `npm run preview` it uses the preview transport
 *   (`src/ai/bridge/previewTransport.js`) instead. In any other copy the state is `unavailable`,
 *   and the build drops the rest of this path as dead code.
 * - `setAccess(lease)` — the live-MCP sheet's explicit local-access control.
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
import { createPreviewTransport, newPreviewTabId } from '../ai/bridge/previewTransport.js'
import { useAiChatStore } from '../stores/aiChat.js'
import { runOnTab, undoTabTurn } from './useTabEndpoint.js'

let started = false

/**
 * The link the bridge listens and posts on: the dev host's HMR context or the preview transport.
 *
 * @typedef {{ on: (event: string, handler: (data: any) => void) => void, send: (event: string, data?: any) => void }} LiveLink
 */

/** @type {LiveLink | null | undefined} `undefined` until first asked. */
let live

/**
 * The tab's link to the live host, once per page: Vite's HMR socket under `npm run dev`
 * (`import.meta.hot`), or the preview server's stream in a build made with `VITE_LIVE_BRIDGE=1`
 * (`previewTransport.js`). Anything else — the default build, the hosted app — has no link, and the
 * build drops the preview branch as dead code.
 *
 * @returns {LiveLink | null}
 */
function liveHot() {
  if (live !== undefined) return live
  if (import.meta.hot) live = /** @type {LiveLink} */ (/** @type {unknown} */ (import.meta.hot))
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
 * @param {import('../ai/bridge/protocol.js').CallMessage} call
 * @param {{ send: (event: string, data?: any) => void }} hot
 */
async function runCall(call, hot) {
  await runOnTab(call, { onReply: (reply) => hot.send(BRIDGE_EVENT, reply) })
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
 * @returns {{ setAccess: (lease: '15m' | '1h' | 'tab' | 'unlimited' | 'off') => boolean, undoTurn: () => void }}
 */
export function useLiveBridge() {
  const chat = useAiChatStore()

  /**
   * Set the explicit local-access lease in the host.
   *
  * @param {'15m' | '1h' | 'tab' | 'unlimited' | 'off'} lease
   */
  function setAccess(lease) {
    const hot = liveHot()
    if (!hot) return false
    if (lease !== 'off') chat.bridge = 'enabled'
    else chat.bridge = 'idle'
    // Until the host's status arrives (with the authoritative time), show the lease the user chose.
    chat.bridgeExpiresAt = lease === '15m' ? Date.now() + 15 * 60_000 : lease === '1h' ? Date.now() + 60 * 60_000 : null
    chat.bridgeMessage = ''
    hot.send(BRIDGE_EVENT, { type: 'access', lease })
    return true
  }

  return { setAccess, undoTurn: undoTabTurn }
}
