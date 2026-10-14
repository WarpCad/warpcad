// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The live bridge in the app (`TODO/ai-012`, `docs/decisions/ai-partner.md` Decision 11): glue
 * between Vite's HMR socket, the framework-free tab endpoint (`src/ai/bridge/tabEndpoint.js`),
 * the live document and the chat store. No geometry and no HTML here.
 *
 * - {@link startLiveBridge} — once, from `AppView` on mount. Under `npm run dev`
 *   (`import.meta.hot` exists) it listens for the host's messages on `warpcad:bridge`; in a built
 *   or hosted copy `import.meta.hot` is `undefined`, the state is `unavailable`, and a build drops
 *   the rest of this path as dead code.
 * - `connect(code)` — the **Connect to Claude Code** sheet's button: sends the typed code.
 * - Calls from Claude Code run through the endpoint against the **raw** live document, then the
 *   document store is refreshed so the viewport and History answer — exactly what `useAgent`
 *   does after a turn. The header's working chip shows while one runs (held a moment after, since
 *   a call is synchronous and would otherwise never paint).
 * - `undoTurn()` — **Undo AI turn** when the last AI change was a Claude Code group (`useAgent`
 *   delegates here): the merge inverse under origin `mcp`, never the local undo stack.
 *
 * "Mid-gesture" (Decision 11 point 4) is: a Library drag-placement in flight, a gizmo drag in
 * flight, or a text/number field focused anywhere but the Assistant's own panel and this sheet.
 *
 * Phone and tablet: a browser there cannot reach Claude Code on another machine, so
 * {@link deviceReason} disables the Connect control with the reason shown beside it.
 *
 * @module composables/useLiveBridge
 */

import { computed, ref } from 'vue'

import { BRIDGE_EVENT, normaliseCode, parseHostMessage } from '../ai/bridge/protocol.js'
import { viewportCapture } from '../render/offscreenCapture.js'
import { useAiChatStore } from '../stores/aiChat.js'
import { useDocumentStore } from '../stores/document.js'
import { usePlacementStore } from '../stores/placement.js'
import { useSelectionStore } from '../stores/selection.js'
import { useTransformPreviewStore } from '../stores/transformPreview.js'

/** How long the "Claude Code working" chip stays up after a call, so a quick one is seen. */
const WORKING_LINGER_MS = 1500

/** The reason shown beside the disabled Connect control on a phone or tablet. */
export const DEVICE_REASON = 'Claude Code must run on this device'

/** @type {import('../ai/bridge/tabEndpoint.js').TabEndpoint | null} */
let endpoint = null
let started = false
/** @type {ReturnType<typeof setTimeout> | null} */
let linger = null
/** The document's load counter when the endpoint's groups were recorded: a new project forgets them. */
let loadRevision = -1

/** Whether this is a touch-first or narrow screen — a phone or a tablet. */
const narrowOrTouch = ref(false)

function measureDevice() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const wide = window.matchMedia('(min-width: 1100px)').matches
  const touchOnly = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  narrowOrTouch.value = !wide || touchOnly
}

/** `''` on a desktop browser; on a phone or tablet, why Connect is disabled. */
export const deviceReason = computed(() => (narrowOrTouch.value ? DEVICE_REASON : ''))

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

/** A text or number field has focus somewhere a user edits the project. */
function fieldFocused() {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  if (!active.matches('input, textarea, select, [contenteditable="true"]')) return false
  return active.closest('[data-testid="assistant-panel"], [data-testid="ai-connect-sheet"]') === null
}

/**
 * @returns {Promise<import('../ai/bridge/tabEndpoint.js').TabEndpoint>}
 */
async function endpointFor() {
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

/** @param {boolean} on */
function setWorking(on) {
  const chat = useAiChatStore()
  if (linger !== null) clearTimeout(linger)
  linger = null
  if (on) {
    chat.bridgeWorking = true
    return
  }
  linger = setTimeout(() => {
    chat.bridgeWorking = false
    linger = null
  }, WORKING_LINGER_MS)
}

/**
 * @param {import('../ai/bridge/protocol.js').CallMessage} call
 * @param {{ send: (event: string, data?: any) => void }} hot
 */
async function runCall(call, hot) {
  const chat = useAiChatStore()
  const documentStore = useDocumentStore()
  setWorking(true)
  try {
    const target = await endpointFor()
    const before = target.turns.at(-1)
    const reply = await target.handle(call)
    hot.send(BRIDGE_EVENT, reply)
    const after = target.turns.at(-1)
    if (after !== undefined && (after !== before || target.turns.length !== chat.bridgeTurns)) {
      // The raw document changed; the store's mirrors (bodies, History, the viewport) refresh here.
      documentStore.refresh()
      loadRevision = documentStore.loadRevision
      chat.lastLanded = 'mcp'
    }
    chat.bridgeTurns = target.turns.length
  } finally {
    setWorking(false)
  }
}

/**
 * Start listening for Claude Code. Idempotent; safe to call from a mount hook.
 *
 * @returns {void}
 */
export function startLiveBridge() {
  if (started) return
  started = true
  measureDevice()
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    window.matchMedia('(min-width: 1100px)').addEventListener?.('change', measureDevice)
  }
  const chat = useAiChatStore()
  const hot = import.meta.hot
  if (!hot) {
    chat.bridge = 'unavailable'
    return
  }
  chat.bridge = 'idle'
  hot.on(BRIDGE_EVENT, (data) => {
    const message = parseHostMessage(data)
    if (message === null) return
    if (message.type === 'paired') {
      chat.bridge = 'connected'
      chat.bridgeMessage = ''
    } else if (message.type === 'pair-refused') {
      chat.bridge = chat.bridge === 'waiting' ? 'idle' : chat.bridge
      chat.bridgeMessage = message.reason
    } else if (message.type === 'unpaired') {
      chat.bridge = 'disconnected'
      chat.bridgeMessage = message.reason
    } else if (message.type === 'call') {
      void runCall(message, hot)
    }
  })
  hot.on('vite:ws:disconnect', () => {
    if (chat.bridge === 'connected' || chat.bridge === 'waiting') {
      chat.bridge = 'disconnected'
      chat.bridgeMessage = 'The connection to the dev server dropped. Ask Claude Code for a new code to reconnect.'
    }
  })
  hot.send(BRIDGE_EVENT, { type: 'hello' })
}

/**
 * @returns {{ connect: (typed: string) => boolean, undoTurn: () => void }}
 */
export function useLiveBridge() {
  const chat = useAiChatStore()
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()

  /**
   * Send a pairing code. `false` when it is not code-shaped (nothing is sent).
   *
   * @param {string} typed
   */
  function connect(typed) {
    const hot = import.meta.hot
    if (!hot || deviceReason.value !== '') return false
    const code = normaliseCode(typed)
    if (code === null) {
      chat.bridgeMessage = 'A code is 8 letters and digits, like K7Q4-FX2M.'
      return false
    }
    chat.bridge = 'waiting'
    chat.bridgeMessage = ''
    hot.send(BRIDGE_EVENT, { type: 'pair', code })
    return true
  }

  function undoTurn() {
    if (endpoint === null || endpoint.turns.length === 0) return
    try {
      endpoint.undoLast()
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/^document\.\w+: /, '') : String(error)
      chat.push({ kind: 'notice', level: 'failed', message: `Can't undo the AI turn: ${reason}` })
      return
    }
    chat.bridgeTurns = endpoint.turns.length
    selection.selectMany([])
    documentStore.refresh()
    chat.push({ kind: 'notice', level: 'info', message: 'Took back the last change Claude Code made. Your own edits are untouched.' })
  }

  return { connect, undoTurn }
}
