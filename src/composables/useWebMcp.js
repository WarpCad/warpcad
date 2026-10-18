// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * WebMCP in the app (`TODO/ai-021`, `docs/decisions/ai-partner.md` Decision 13): glue between the
 * browser's `document.modelContext`, the framework-free link (`src/ai/webmcp/register.js`), the
 * tab's shared endpoint (`useTabEndpoint.js`), the stored **Browser agents** preference and the chat
 * store. No geometry and no HTML here.
 *
 * - {@link startWebMcp} — once, from `AppView` on mount. With no WebMCP in this browser it sets the
 *   chip to `unavailable` and does nothing else (nothing registers, nothing throws). With it, the
 *   tools are registered **by default**: the stored off is the only thing that stops them.
 * - Registered **only while the tab is visible** (`visibilitychange`), and unregistered on
 *   `pagehide`; `pageshow` (a back/forward restore) registers again. So the tab the user is looking
 *   at is the one an agent reaches — a hypothesis Decision 13 sends to a two-tab hand check.
 * - `setEnabled(on)` — the switch. Off unregisters every tool at once and is remembered per
 *   browser profile (IndexedDB); a storage refusal keeps the choice for this session and says so.
 *
 * Each call runs through `runOnTab` with origin `webmcp`, so it shares the working chip, History's
 * origin chip and **Undo AI turn** with Claude Code's calls, and their queue.
 *
 * `TODO/ai-024`: what the link reports (registered, refused, the tab's visibility) goes to the chat
 * store, which turns it into the chip's words and the diagnostic line. The diagnostic is also
 * published where an agent can read it without opening the Assistant — `<meta name="warpcad-webmcp">`
 * and one `console.info` per change — including `api=none` where the browser has no WebMCP.
 *
 * @module composables/useWebMcp
 */

import { watch } from 'vue'

import { createWebMcpLink } from '../ai/webmcp/register.js'
import { aliasNavigatorModelContext, modelContextApiOf, modelContextOf } from '../ai/webmcp/toolShape.js'
import { createWebMcpPreference } from '../storage/webMcpPreference.js'
import { useAiChatStore } from '../stores/aiChat.js'
import { runOnTab } from './useTabEndpoint.js'

/** Shown under the switch when the browser would not store the choice. */
export const SESSION_ONLY_SWITCH = 'This browser blocked storage, so this choice lasts until you close the tab.'

/** @type {import('../ai/webmcp/register.js').WebMcpLink | null} */
let link = null
let started = false
/** @type {import('../storage/webMcpPreference.js').WebMcpPreference | null} */
let preference = null

/** The endpoint as the link sees it: every call through `runOnTab`. */
const endpoint = {
  /**
   * @param {import('../ai/bridge/protocol.js').CallMessage} call
   * @param {import('../ai/bridge/tabEndpoint.js').CallVia} [via]
   */
  handle: (call, via) => runOnTab(call, { via }),
}

/** The `<meta>` the diagnostic line is published in. */
export const DIAGNOSTIC_META = 'warpcad-webmcp'

/**
 * Put the diagnostic in `<meta name="warpcad-webmcp">` (created on first use) and log it once.
 * Quiet where there is no DOM.
 *
 * @param {any} doc
 * @param {string} line
 */
function publishDiagnostic(doc, line) {
  try {
    if (doc && typeof doc.querySelector === 'function' && doc.head) {
      let meta = doc.querySelector(`meta[name="${DIAGNOSTIC_META}"]`)
      if (!meta) {
        meta = doc.createElement('meta')
        meta.setAttribute('name', DIAGNOSTIC_META)
        doc.head.appendChild(meta)
      }
      meta.setAttribute('content', line)
    }
  } catch {
    // A locked-down embed: the chip still carries the same line.
  }
  console.info(`WarpCad WebMCP: ${line}`)
}

/**
 * Start WebMCP if this browser has it. Idempotent; safe to call from a mount hook.
 *
 * @param {object} [options]
 * @param {any} [options.env] `globalThis` by default.
 * @param {import('../storage/webMcpPreference.js').WebMcpPreference} [options.preference]
 * @returns {Promise<void>}
 */
export async function startWebMcp(options = {}) {
  if (started) return
  started = true
  const chat = useAiChatStore()
  const env = options.env ?? globalThis
  const doc = env.document
  /** @returns {boolean} */
  const tabVisible = () => doc?.visibilityState !== 'hidden'

  const modelContext = modelContextOf(env)
  chat.webMcpApi = modelContextApiOf(env)
  chat.webMcpVisible = tabVisible()
  // Once now, then once per change: the line an agent reads to see why it has no tools.
  watch(() => chat.webMcpDiagnostic, (line) => publishDiagnostic(doc, line), { immediate: true })
  if (modelContext === null) {
    chat.webMcp = 'unavailable'
    return
  }
  aliasNavigatorModelContext(options.env ?? globalThis)
  preference = options.preference ?? createWebMcpPreference()
  link = createWebMcpLink({
    modelContext,
    endpoint,
    onChange: (state) => {
      chat.webMcpVisible = state.visible
      chat.webMcpTools = state.registered.length
      chat.webMcpFailed = state.failed
    },
  })
  // On until the stored preference says otherwise; the chip shows the default straight away.
  chat.webMcp = 'on'
  const on = await preference.load()
  chat.webMcp = on ? 'on' : 'off'

  doc?.addEventListener?.('visibilitychange', () => void link?.update({ visible: tabVisible() }))
  if (typeof env.addEventListener === 'function') {
    env.addEventListener('pagehide', () => void link?.update({ visible: false }))
    env.addEventListener('pageshow', () => void link?.update({ visible: tabVisible() }))
  }
  await link.update({ enabled: on, visible: tabVisible() })
}

/**
 * @returns {{ setEnabled: (on: boolean) => Promise<void>, toggle: () => Promise<void> }}
 */
export function useWebMcp() {
  const chat = useAiChatStore()

  /** @param {boolean} on */
  async function setEnabled(on) {
    if (chat.webMcp === 'unavailable' || link === null) return
    chat.webMcp = on ? 'on' : 'off'
    const update = link.update({ enabled: on })
    const saved = await (preference ?? createWebMcpPreference()).save(on)
    chat.webMcpMessage = saved.persisted ? '' : SESSION_ONLY_SWITCH
    await update
  }

  return {
    setEnabled,
    toggle: () => setEnabled(chat.webMcp !== 'on'),
  }
}
