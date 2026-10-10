// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Assistant, as the UI sees it (`TODO/ai-004`): whether a key is stored, whether it works,
 * and which sheet is open. UI state and orchestration only — the chat itself is `ai-006`, the
 * agent `ai-005`; this store is what the header's **Assistant** button, the key sheet and the
 * minimal connected panel read.
 *
 * ## What it calls
 *
 * - `start()` — restore a stored key at boot. Idempotent.
 * - `open()` — the header button: the chat panel if a key is stored, the key sheet if not.
 * - `saveKey(pasted)` — store, then test (**Save and test**). A failed test keeps the key
 *   (the user may be offline) and says why.
 * - `test()` — re-check the stored key. A request that spends nothing (`count_tokens`).
 * - `forget()` — delete it, everywhere, and return to the empty key sheet.
 * - `client()` — the provider client for `ai-005`: it reads the key from this module's closure
 *   per call, so the agent never holds it.
 * - `scripted` (`TODO/ai-010`) — a developer-only mode: when a dev build is started with a
 *   transcript on `globalThis.__WARPCAD_SCRIPTED__`, `client()` is the scripted provider, the panel
 *   wears a "Scripted" badge, and the real key store is never read, written or forgotten.
 * - Getters: `hasKey`, `persisted`, `storageNote` (the visible "this session only" note),
 *   `dotState` (`none` | `saved` | `ok` | `failed`, shape-coded like `HostedDot`), `statusText`.
 *
 * **The key is never on this store.** It lives in `storage/aiKey.js`'s closure (which keeps
 * the session copy) and is handed to the client per call: not in `$state`, not in a getter,
 * nothing a dev-tools panel, an autosave or an error report can serialise.
 * `assistant.spec.js` serialises every surface and greps for it.
 *
 * @module stores/assistant
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { createAnthropicClient } from '../ai/client.js'
import { modelLabel } from '../ai/models.js'
import { createScriptedClient } from '../ai/providers/scripted.js'
import { createAiKeyStore } from '../storage/aiKey.js'
import { useSettingsStore } from './settings.js'

/** Shown beside the key sheet whenever the key could not be written to browser storage. */
export const SESSION_ONLY_NOTE =
  'This browser blocked storage (a private window?), so the key is kept for this session only and will be gone after a reload.'

/**
 * @typedef {object} AssistantDependencies
 * @property {import('../storage/aiKey.js').AiKeyStore} keyStore
 * @property {typeof globalThis.fetch} [fetch]
 * @property {() => boolean} [isOnline]
 */

/** @type {AssistantDependencies | null} */
let dependencies = null

/**
 * Replace the boundary — for tests, which must never reach a real network or a real
 * IndexedDB. Pass `null` to go back to the real ones.
 *
 * @param {AssistantDependencies | null} next
 */
export function setAssistantDependencies(next) {
  dependencies = next
}

/** @returns {AssistantDependencies} */
function resolveDependencies() {
  dependencies ??= { keyStore: createAiKeyStore() }
  return dependencies
}

export const useAssistantStore = defineStore('assistant', () => {
  const settings = useSettingsStore()
  const deps = resolveDependencies()

  /**
   * The key, **module-scope, non-reactive, never returned** — see the module note. Kept in
   * step with the key store so `client()` can read it synchronously.
   *
   * @type {string | null}
   */
  let key = null

  const hasKey = ref(false)
  const persisted = ref(true)
  /** @type {import('vue').Ref<'none' | 'saved' | 'testing' | 'ok' | 'failed'>} */
  const status = ref('none')
  /** The last Test failure's own fixed wording, or ''. */
  const message = ref('')
  /** @type {import('vue').Ref<'closed' | 'key' | 'chat'>} */
  const view = ref('closed')
  const loaded = ref(false)
  /** @type {Promise<void> | null} */
  let startPromise = null

  const model = computed(() => settings.aiModel)
  /** A recorded transcript stands in for the model (dev builds only, `TODO/ai-010`). */
  const scripted = ref(false)
  const scriptedName = ref('')
  /** @type {import('../ai/client.js').AiClient | null} */
  let scriptedClient = null

  const modelName = computed(() => (scripted.value ? 'Scripted' : modelLabel(settings.aiModel)))
  const storageNote = computed(() => (hasKey.value && !persisted.value ? SESSION_ONLY_NOTE : ''))

  const dotState = computed(() => {
    if (!hasKey.value) return 'none'
    if (status.value === 'ok') return 'ok'
    if (status.value === 'failed') return 'failed'
    return 'saved'
  })

  const statusText = computed(() => {
    if (scripted.value) return `Scripted transcript “${scriptedName.value}” — no model, no key`
    if (!hasKey.value) return 'No key — paste one to connect'
    if (status.value === 'testing') return 'Testing the key…'
    if (status.value === 'ok') return `Connected — ${modelName.value}`
    if (status.value === 'failed') return message.value
    return `Key saved in this browser — not tested yet`
  })

  /** @returns {Promise<void>} */
  function start() {
    startPromise ??= (async () => {
      // The transcript is read only in a dev build: a production page cannot be switched onto it.
      const transcript = import.meta.env.DEV ? /** @type {any} */ (globalThis).__WARPCAD_SCRIPTED__ : undefined
      if (transcript !== undefined && transcript !== null) {
        scriptedClient = createScriptedClient(transcript)
        scripted.value = true
        scriptedName.value = String(transcript.name ?? 'unnamed')
        hasKey.value = true
        persisted.value = true
        status.value = 'ok'
        loaded.value = true
        return
      }
      const stored = await deps.keyStore.load()
      key = stored.key
      hasKey.value = key !== null
      persisted.value = stored.persisted
      status.value = hasKey.value ? 'saved' : 'none'
      loaded.value = true
    })()
    return startPromise
  }

  /** @returns {import('../ai/client.js').AiClient} */
  function client() {
    if (scriptedClient !== null) return scriptedClient
    return createAnthropicClient({
      getKey: () => key,
      getModel: () => settings.aiModel,
      fetch: deps.fetch,
      isOnline: deps.isOnline,
    })
  }

  /** @returns {Promise<{ ok: true } | { ok: false, kind: string, message: string }>} */
  async function test() {
    if (scripted.value) return { ok: true }
    if (key === null) {
      return { ok: false, kind: 'no-key', message: 'No API key is stored. Paste one in the Assistant key sheet.' }
    }
    status.value = 'testing'
    message.value = ''
    const result = await client().test()
    if (result.ok) {
      status.value = 'ok'
      return { ok: true }
    }
    status.value = 'failed'
    message.value = result.message
    return { ok: false, kind: result.kind, message: result.message }
  }

  /**
   * Store a pasted key, then test it. The store's own `trim` handles phone-paste whitespace.
   *
   * @param {string} pasted
   */
  async function saveKey(pasted) {
    // Scripted mode never reaches the real key store, so a developer's own key is not touched.
    if (scripted.value) return { ok: true }
    const saved = await deps.keyStore.save(pasted)
    key = (await deps.keyStore.load()).key
    hasKey.value = key !== null
    persisted.value = saved.persisted
    return test()
  }

  async function forget() {
    if (scripted.value) return
    await deps.keyStore.forget()
    key = null
    hasKey.value = false
    persisted.value = true
    status.value = 'none'
    message.value = ''
    view.value = 'key'
  }

  /** The header button: chat if connected, the key sheet if there is nothing to connect with. */
  function open() {
    view.value = hasKey.value ? 'chat' : 'key'
  }

  function openKeySheet() {
    view.value = 'key'
  }

  function close() {
    view.value = 'closed'
  }

  /** Leaving the key sheet: on to the chat if there is a key, otherwise just away. */
  function doneWithKeySheet() {
    view.value = hasKey.value ? 'chat' : 'closed'
  }

  return {
    hasKey,
    persisted,
    status,
    message,
    view,
    loaded,
    model,
    modelName,
    storageNote,
    dotState,
    statusText,
    scripted,
    scriptedName,
    start,
    client,
    test,
    saveKey,
    forget,
    open,
    openKeySheet,
    close,
    doneWithKeySheet,
  }
})
