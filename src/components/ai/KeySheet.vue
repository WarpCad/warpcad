<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **The Assistant key sheet** (`TODO/ai-004`) — the one place the Anthropic API key is typed,
 * tested and forgotten. Rules from `docs/decisions/ai-partner.md` decision 8, enforced here
 * rather than merely intended, and copied from `ConnectDialog.vue` because the situation is
 * the same one (a long secret pasted on a phone):
 *
 * - The key field is **uncontrolled**: its value is read from the element at submit and the
 *   field is cleared straight away. It is never a `ref`/`v-model`, so it never sits in
 *   component state where devtools, an error boundary or a snapshot could read it.
 * - `type="password"`, `autocomplete="off"`, no autocapitalise/autocorrect/spellcheck: the OS
 *   keychain must not offer it as a login and the keyboard must not "fix" it.
 * - It goes to `assistant.saveKey()` and nowhere else; every message shown is the client's own
 *   fixed wording by failure class, none built from what was typed or from a server body.
 * - After it is stored the field is **removed from the DOM** and the sheet never shows it back;
 *   **Replace key** brings back an empty field.
 *
 * ## What it offers
 *
 * - **Save and test** (the primary action — "paste it, tap Test"): stores the key, then runs a
 *   request that spends nothing, and reports success or the *specific* failure (bad key, rate
 *   limit, offline, a CORS or content-blocker refusal…). A failed test keeps the key stored —
 *   the user may simply be offline — and says why.
 * - **Test** again, **Replace key**, **Forget key** (deletes the stored record), **Done**.
 * - The model (`ai.model`): Opus 5.5 or Sonnet 5.5.
 * - The one-line "stored only in this browser" note, and the visible session-only note when
 *   storage was blocked.
 *
 * ## Phone
 *
 * Inputs are 16px (iOS zooms the page on focus of anything smaller), targets are 44px, and the
 * frame is `ModalShell`'s: full width minus 16px and **top-anchored**, so the on-screen keyboard
 * cannot cover the field (`interaction-model-qa.md` §10 Q16 — the same reason `Connect` is not a
 * bottom sheet). It scrolls rather than clips, and never scrolls sideways.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { MODELS } from '../../ai/models.js'
import { useEscapeToClose } from '../../composables/useEscapeToClose.js'
import { useAssistantStore } from '../../stores/assistant.js'
import { useSettingsStore } from '../../stores/settings.js'
import ConnectionDot from '../display/ConnectionDot.vue'
import ModalShell from '../storage/ModalShell.vue'

const assistant = useAssistantStore()
const settings = useSettingsStore()

const open = computed(() => assistant.view === 'key')

/** @type {import('vue').Ref<'form' | 'saved'>} */
const mode = ref('form')
const busy = ref(false)
/** Whether the key field has anything in it — a flag about the field, never its value. */
const keyFilled = ref(false)

/** @type {import('vue').Ref<HTMLInputElement | null>} */
const keyInput = ref(null)

const canSave = computed(() => keyFilled.value && !busy.value)

function wipeKey() {
  if (keyInput.value) keyInput.value.value = ''
  keyFilled.value = false
}

watch(open, async (isOpen) => {
  if (isOpen) {
    mode.value = assistant.hasKey ? 'saved' : 'form'
    busy.value = false
    keyFilled.value = false
    if (mode.value === 'form') {
      await nextTick()
      keyInput.value?.focus()
    }
  } else {
    wipeKey()
  }
})

// Forget (or anything else that empties the store) drops the sheet back to the empty form.
watch(
  () => assistant.hasKey,
  async (has) => {
    if (has || !open.value) return
    mode.value = 'form'
    keyFilled.value = false
    await nextTick()
    keyInput.value?.focus()
  },
)

useEscapeToClose(() => open.value, () => cancel())

function onKeyInput() {
  keyFilled.value = (keyInput.value?.value ?? '') !== ''
}

async function save() {
  if (!canSave.value) return
  const pasted = keyInput.value?.value ?? ''
  busy.value = true
  wipeKey()
  try {
    await assistant.saveKey(pasted)
    mode.value = 'saved'
  } finally {
    busy.value = false
  }
}

async function test() {
  busy.value = true
  try {
    await assistant.test()
  } finally {
    busy.value = false
  }
}

async function replaceKey() {
  mode.value = 'form'
  keyFilled.value = false
  await nextTick()
  keyInput.value?.focus()
}

async function forget() {
  busy.value = true
  try {
    await assistant.forget()
  } finally {
    busy.value = false
  }
}

/** @param {Event} event */
async function onModel(event) {
  settings.setAiModel(/** @type {HTMLSelectElement} */ (event.target).value)
  // The check costs nothing, so a model change re-tests rather than leaving a stale "Connected".
  if (assistant.hasKey) await test()
}

function cancel() {
  wipeKey()
  if (mode.value === 'form' && assistant.hasKey) {
    mode.value = 'saved'
    return
  }
  assistant.close()
}

function done() {
  assistant.doneWithKeySheet()
}
</script>

<template>
  <ModalShell :open="open" testid="ai-key-sheet" title="Assistant key" @backdrop="cancel()">
    <template v-if="mode === 'form'">
      <p class="key__help">
        Create a key in the
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
          >Anthropic console</a
        >, in a workspace with a monthly spend limit, then paste it here.
      </p>
      <p class="key__note" data-testid="ai-key-note">
        Stored only in this browser. It is sent only to <code>api.anthropic.com</code>.
      </p>
      <p class="key__note" data-testid="ai-key-billing">
        An API key is billed as API usage, separately from a Claude Pro or Max subscription.
      </p>
      <form class="key__form" novalidate @submit.prevent="save()">
        <label class="key__field">
          API key
          <input
            ref="keyInput"
            class="key__input"
            type="password"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            data-testid="ai-key-input"
            @input="onKeyInput"
          />
        </label>
        <label class="key__field">
          Model
          <select class="key__input" :value="settings.aiModel" data-testid="ai-model-select" @change="onModel">
            <option v-for="model in MODELS" :key="model.id" :value="model.id">{{ model.label }}</option>
          </select>
        </label>
        <div class="key__actions key__actions--wrap">
          <button type="button" class="key__button" data-testid="ai-key-cancel" @click="cancel()">
            Cancel
          </button>
          <!-- TODO/ai-013: a subscription isn't an API key; this is the route that does use it. -->
          <button
            v-if="!assistant.hasKey"
            type="button"
            class="key__button"
            data-testid="ai-key-subscription"
            @click="assistant.openSubscriptionRoute()"
          >
            Use my Claude subscription…
          </button>
          <button
            type="submit"
            class="key__button key__button--primary"
            data-testid="ai-key-save"
            :disabled="!canSave"
          >
            {{ busy ? 'Testing…' : 'Save and test' }}
          </button>
        </div>
      </form>
    </template>

    <template v-else>
      <p class="key__status" role="status" data-testid="ai-key-status" :data-status="assistant.status">
        <ConnectionDot :state="assistant.dotState" testid="ai-key-dot" />
        <span data-testid="ai-key-status-text">{{ assistant.statusText }}</span>
      </p>
      <p class="key__note" data-testid="ai-key-note">
        Stored only in this browser. The key is never shown again.
      </p>
      <p v-if="assistant.storageNote" class="key__warn" role="status" data-testid="ai-key-storage-note">
        {{ assistant.storageNote }}
      </p>
      <label class="key__field">
        Model
        <select class="key__input" :value="settings.aiModel" data-testid="ai-model-select" @change="onModel">
          <option v-for="model in MODELS" :key="model.id" :value="model.id">{{ model.label }}</option>
        </select>
      </label>
      <div class="key__actions key__actions--wrap">
        <button
          type="button"
          class="key__button key__button--danger"
          data-testid="ai-key-forget"
          :disabled="busy"
          @click="forget()"
        >
          Forget key
        </button>
        <button type="button" class="key__button" data-testid="ai-key-replace" @click="replaceKey()">
          Replace key
        </button>
        <button type="button" class="key__button" data-testid="ai-key-test" :disabled="busy" @click="test()">
          {{ busy ? 'Testing…' : 'Test' }}
        </button>
        <button type="button" class="key__button key__button--primary" data-testid="ai-key-done" @click="done()">
          Done
        </button>
      </div>
    </template>
  </ModalShell>
</template>

<style scoped>
.key__help,
.key__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.key__help a {
  color: var(--accent);
}

.key__status {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  line-height: 1.4;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.key__status[data-status='failed'] {
  color: var(--danger);
}

.key__warn {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--warn);
  overflow-wrap: anywhere;
}

.key__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.key__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.key__input {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px, deliberately: iOS Safari zooms the whole page on focus of any input below it. */
  font-size: 16px;
}

/* WebKit's native select ignores `min-height` (it measured ~30px), so the 44px target is made
   explicit and the native chrome dropped for a plain chevron drawn from two gradients — no
   image file, which the Content-Security-Policy would treat like any other. */
select.key__input {
  height: var(--tap);
  appearance: none;
  -webkit-appearance: none;
  padding-right: 34px;
  background-image:
    linear-gradient(45deg, transparent 50%, var(--text-2) 50%),
    linear-gradient(135deg, var(--text-2) 50%, transparent 50%);
  background-position:
    calc(100% - 18px) 50%,
    calc(100% - 12px) 50%;
  background-size: 6px 6px;
  background-repeat: no-repeat;
}

.key__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.key__actions--wrap {
  flex-wrap: wrap;
}

.key__button {
  min-width: 80px;
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.key__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.key__button--danger {
  border-color: var(--danger);
  color: var(--danger);
}

.key__button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
