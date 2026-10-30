// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The open tab's **one** tool endpoint (`src/ai/bridge/tabEndpoint.js`), wired to the live
 * document and the chat store, shared by every transport that runs in this tab: the dev-host live
 * bridge (`TODO/ai-012`, `useLiveBridge.js`) and WebMCP (`TODO/ai-021`, `useWebMcp.js`). Holding one
 * instance is the point — Decision 13 point 2 — so a browser agent's call and an MCP client call
 * share one serial queue, one mid-gesture wait and one stale check, and can never interleave.
 *
 * Extracted from `useLiveBridge.js` without changing what the bridge does: the endpoint is built
 * on first use with no socket at all, a New or an Open forgets its groups, and each call refreshes
 * the document store after it lands and holds the header's working chip up a moment.
 *
 * "Mid-gesture" (Decision 11 point 4) is: a Library drag-placement in flight, a gizmo drag in
 * flight, or a text/number field focused anywhere but the Assistant's own panel and the Connect
 * sheet.
 *
 * @module composables/useTabEndpoint
 */

import { viewportCapture } from '../render/offscreenCapture.js'
import { useAiChatStore } from '../stores/aiChat.js'
import { useDocumentStore } from '../stores/document.js'
import { usePlacementStore } from '../stores/placement.js'
import { useSelectionStore } from '../stores/selection.js'
import { useTransformPreviewStore } from '../stores/transformPreview.js'

/** How long the "AI working" chip stays up after a call, so a quick one is seen. */
const WORKING_LINGER_MS = 1500

/** Who the undo notice names, by the origin of the group it took back. */
const WHO = Object.freeze({ mcp: 'MCP agent', webmcp: 'browser agent' })

/** @type {import('../ai/bridge/tabEndpoint.js').TabEndpoint | null} */
let endpoint = null
/** @type {ReturnType<typeof setTimeout> | null} */
let linger = null
/** The document's load counter when the endpoint's groups were recorded: a new project forgets them. */
let loadRevision = -1

/** A text or number field has focus somewhere a user edits the project. */
function fieldFocused() {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  if (!active.matches('input, textarea, select, [contenteditable="true"]')) return false
  return active.closest('[data-testid="assistant-panel"], [data-testid="ai-connect-sheet"]') === null
}

/**
 * The shared endpoint, built on first use; a new project (a New or an Open) resets its groups.
 *
 * @returns {Promise<import('../ai/bridge/tabEndpoint.js').TabEndpoint>}
 */
export async function tabEndpoint() {
  const documentStore = useDocumentStore()
  if (endpoint !== null && loadRevision === documentStore.loadRevision) return endpoint
  if (endpoint === null) {
    const { createTabEndpoint } = await import('../ai/bridge/tabEndpoint.js')
    const placement = usePlacementStore()
    const transform = useTransformPreviewStore()
    const selection = useSelectionStore()
    endpoint = createTabEndpoint({
      document: () => documentStore.raw,
      selection: { ids: () => [...selection.ids], select: (ids) => selection.selectMany(ids) },
      capture: () => viewportCapture() ?? undefined,
      isEditing: () => placement.isDragging || transform.bodyId !== '' || fieldFocused(),
    })
  } else {
    // A New or an Open: the groups belong to the project that was there.
    endpoint.reset()
    useAiChatStore().bridgeTurns = 0
  }
  loadRevision = documentStore.loadRevision
  return endpoint
}

/**
 * @param {boolean} on
 * @param {'mcp' | 'webmcp'} origin
 */
function setWorking(on, origin) {
  const chat = useAiChatStore()
  if (linger !== null) clearTimeout(linger)
  linger = null
  if (on) {
    chat.bridgeWorking = true
    chat.workingOrigin = origin
    return
  }
  linger = setTimeout(() => {
    chat.bridgeWorking = false
    linger = null
  }, WORKING_LINGER_MS)
}

/**
 * Run one call on the shared endpoint, then bring the app up to date: the store's mirrors (bodies,
 * History, the viewport) refresh after a write, and **Undo AI turn** learns who landed last.
 *
 * @param {import('../ai/bridge/protocol.js').CallMessage} call
 * @param {object} [options]
 * @param {import('../ai/bridge/tabEndpoint.js').CallVia} [options.via] Omitted for the live bridge.
 * @param {(reply: Awaited<ReturnType<import('../ai/bridge/tabEndpoint.js').TabEndpoint['handle']>>) => void} [options.onReply]
 *   Called as soon as the reply exists, before the refresh (the bridge sends it on at once).
 * @returns {Promise<Awaited<ReturnType<import('../ai/bridge/tabEndpoint.js').TabEndpoint['handle']>>>}
 */
export async function runOnTab(call, options = {}) {
  const chat = useAiChatStore()
  const documentStore = useDocumentStore()
  const origin = options.via?.origin ?? 'mcp'
  setWorking(true, origin)
  try {
    const target = await tabEndpoint()
    const before = target.turns.at(-1)
    const version = documentStore.raw.version
    const reply = await target.handle(call, options.via)
    options.onReply?.(reply)
    const after = target.turns.at(-1)
    if (after !== undefined && (after !== before || target.turns.length !== chat.bridgeTurns)) {
      // The raw document changed; the store's mirrors (bodies, History, the viewport) refresh here.
      documentStore.refresh()
      loadRevision = documentStore.loadRevision
      chat.lastLanded = target.lastOrigin ?? origin
    } else if (documentStore.raw.version !== version) {
      // `TODO/ai-032`: a write that touched no row — `record_response`, `record_prompt` — still
      // changed the project: the Inspector shows the reply, and autosave keeps it.
      documentStore.refresh()
    }
    chat.bridgeTurns = target.turns.length
    return reply
  } finally {
    setWorking(false, origin)
  }
}

/**
 * **Undo AI turn** when the last AI change was a group landed through the tab endpoint (an MCP
 * client over the bridge, or a browser agent over WebMCP): the merge inverse under that group's
 * origin, never the local undo stack.
 *
 * @returns {void}
 */
export function undoTabTurn() {
  const chat = useAiChatStore()
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  if (endpoint === null || endpoint.turns.length === 0) return
  const who = WHO[endpoint.lastOrigin ?? 'mcp']
  try {
    endpoint.undoLast()
  } catch (error) {
    const reason = error instanceof Error ? error.message.replace(/^document\.\w+: /, '') : String(error)
    chat.push({ kind: 'notice', level: 'failed', message: `Can't undo the AI turn: ${reason}` })
    return
  }
  chat.bridgeTurns = endpoint.turns.length
  chat.lastLanded = endpoint.lastOrigin ?? chat.lastLanded
  selection.selectMany([])
  documentStore.refresh()
  chat.push({ kind: 'notice', level: 'info', message: `Took back the last change ${who} made. Your own edits are untouched.` })
}
