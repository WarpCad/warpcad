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
 * @module composables/useWebMcp
 */

import { createWebMcpLink } from '../ai/webmcp/register.js'
import { modelContextOf } from '../ai/webmcp/toolShape.js'
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

/** @returns {boolean} */
function tabVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
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
  const modelContext = modelContextOf(options.env ?? globalThis)
  if (modelContext === null) {
    chat.webMcp = 'unavailable'
    return
  }
  preference = options.preference ?? createWebMcpPreference()
  link = createWebMcpLink({
    modelContext,
    endpoint,
    onChange: (state) => {
      chat.webMcpTools = state.registered.length
      if (state.failed.length > 0) {
        chat.webMcpMessage = `Another tab or page already offers ${state.failed.map((failure) => failure.name).join(', ')}; this tab could not register ${state.failed.length === 1 ? 'it' : 'them'}.`
      } else if (chat.webMcpMessage.startsWith('Another tab')) {
        chat.webMcpMessage = ''
      }
    },
  })
  // On until the stored preference says otherwise; the chip shows the default straight away.
  chat.webMcp = 'on'
  const on = await preference.load()
  chat.webMcp = on ? 'on' : 'off'

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => void link?.update({ visible: tabVisible() }))
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => void link?.update({ visible: false }))
    window.addEventListener('pageshow', () => void link?.update({ visible: tabVisible() }))
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
