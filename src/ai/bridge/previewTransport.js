// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The tab side of the live bridge under `npm run preview` (`docs/decisions/ai-partner.md`,
 * Decision 11, amended 2026-11-06): the same `on` / `send` surface `import.meta.hot` gives the dev
 * server, carried over Server-Sent Events (host → tab) and `POST` (tab → host) on the preview
 * server's own origin. No WebSocket, no dependency, no new CSP source.
 *
 * - `on(event, fn)` — `warpcad:bridge` delivers each host message; `vite:ws:disconnect` fires
 *   once when the stream drops. The stream is **not** reopened: a dropped tab is told so and the
 *   user reopens it, exactly as the dev host behaves.
 * - `send(event, data)` — posts one tab message. Only `warpcad:bridge` is sent; other events are
 *   ignored, so the caller cannot use this as an arbitrary channel.
 *
 * Framework-free and injectable (`EventSource`, `fetch`, the tab id), so the spec runs in Node.
 * `src/composables/useLiveBridge.js` creates one only in a build made with `VITE_LIVE_BRIDGE=1`.
 *
 * @module ai/bridge/previewTransport
 */

import { BRIDGE_EVENT, PREVIEW_BRIDGE_PATH } from './protocol.js'

/** The event `useLiveBridge` listens for when the stream drops (the dev host's own name). */
export const PREVIEW_DISCONNECT = 'vite:ws:disconnect'

/**
 * A tab id: 32 random hex characters from `crypto.getRandomValues`, which exists on every origin
 * (`crypto.randomUUID` needs a secure context, and the preview is sometimes opened over plain
 * http on another device).
 *
 * @param {{ getRandomValues: (array: Uint8Array) => Uint8Array }} crypto
 * @returns {string}
 */
export function newPreviewTabId(crypto) {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * @param {object} options
 * @param {string} options.tabId From {@link newPreviewTabId}.
 * @param {string} [options.origin] The page's origin; empty to use same-origin relative URLs.
 * @param {new (url: string) => any} options.EventSourceImpl
 * @param {(url: string, init: { method: string, headers: Record<string, string>, body: string, keepalive: boolean }) => Promise<unknown>} options.fetchImpl
 * @returns {{ on: (event: string, handler: (data: unknown) => void) => void, send: (event: string, data?: unknown) => void, close: () => void }}
 */
export function createPreviewTransport({ tabId, origin = '', EventSourceImpl, fetchImpl }) {
  const query = `?tab=${encodeURIComponent(tabId)}`
  const base = `${origin}${PREVIEW_BRIDGE_PATH}`
  /** @type {Map<string, Set<(data: unknown) => void>>} */
  const handlers = new Map()
  /** @param {string} event @param {unknown} data */
  const emit = (event, data) => {
    for (const handler of handlers.get(event) ?? []) handler(data)
  }

  /** Posts made before the stream is open wait here: the host only knows a tab once its stream is. */
  /** @type {unknown[]} */
  const queued = []
  let ready = false
  let open = true
  /** @param {unknown} data */
  const post = (data) => {
    // A failed post means the host has gone; the stream's own error reports that to the user.
    fetchImpl(`${base}/message${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
      keepalive: false,
    }).catch(() => {})
  }

  const stream = new EventSourceImpl(`${base}/events${query}`)
  stream.onopen = () => {
    ready = true
    for (const data of queued.splice(0)) post(data)
  }
  /** @param {{ data: string }} event */
  stream.onmessage = (event) => {
    if (!open) return
    let data
    try {
      data = JSON.parse(event.data)
    } catch {
      return
    }
    emit(BRIDGE_EVENT, data)
  }
  stream.onerror = () => {
    if (!open) return
    // One drop, no reconnect: the host registers a new tab per stream, and a silent reconnect
    // would pair it without the user's say. Closing here also stops the browser's own retry.
    open = false
    stream.close()
    emit(PREVIEW_DISCONNECT, undefined)
  }

  return {
    on(event, handler) {
      const set = handlers.get(event) ?? new Set()
      set.add(handler)
      handlers.set(event, set)
    },
    send(event, data) {
      if (event !== BRIDGE_EVENT || !open) return
      if (ready) post(data)
      else queued.push(data)
    },
    close() {
      open = false
      stream.close()
    },
  }
}
