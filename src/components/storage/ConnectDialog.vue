<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Connect repository** — the one place a credential is typed (`TODO/ui-033`,
 * `docs/decisions/interaction-model-qa.md` §11, Q10 and Q16).
 *
 * ## Credential rules — enforced here, not merely intended
 *
 * - The token field is **uncontrolled**: its value is read from the element at submit and
 *   cleared straight away, and it is *never* a `ref`/`v-model`. A reactive token would sit in
 *   component state where Vue devtools, an error boundary or a test snapshot could read it.
 *   (`tokenFilled` below is a boolean about whether the field is empty — not the value.)
 * - `type="password"`, `autocomplete="off"`, `autocapitalize="none"`, `autocorrect="off"`,
 *   spellcheck off — this is the one field where a phone user pastes a long secret, and it must
 *   not be autocorrected, capitalised or offered to the OS keychain as a login.
 * - It is handed to `hosted.connect()` and nowhere else; that store validates against GitHub
 *   **before storing anything** and returns only its own typed, non-echoing message on failure.
 *   No message here is built from what was typed, so none can quote the token.
 * - After success the field is **removed from the DOM** (not emptied) and the dialog says
 *   `Token saved in this browser` — it never shows a token back, and `Replace token` brings
 *   back an empty field.
 * - Never in a URL, a `data-*` attribute, or a `console.*`.
 *
 * ## Phone
 *
 * Inputs are **16px** (iOS Safari zooms the whole page on focus of anything smaller, which
 * would push the dialog off screen). The frame is top-anchored and scrolls rather than clips.
 *
 * Opened from `Connect repository…` (empty) and from `Replace token…` (the connection's
 * repository and path are prefilled; only the token is asked for again). Replacing goes
 * through `connect()`, which starts a fresh connection — so Auto-push comes back **off**.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { DEFAULT_HOSTED_PATH } from '../../storage/hostedBackend.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { useHostedStore } from '../../stores/hosted.js'
import ModalShell from './ModalShell.vue'

const menu = useFileMenuStore()
const hosted = useHostedStore()

/** @type {import('vue').Ref<'form' | 'saved'>} */
const mode = ref('form')
const repository = ref('')
const path = ref(DEFAULT_HOSTED_PATH)
const busy = ref(false)
const error = ref('')
/** Whether the token field has anything in it — a flag about the field, never its value. */
const tokenFilled = ref(false)
/** What Connect found, for the "saved" panel. */
const exists = ref(true)

/** @type {import('vue').Ref<HTMLInputElement | null>} */
const tokenInput = ref(null)

const canSubmit = computed(() => tokenFilled.value && repository.value.trim() !== '' && !busy.value)

function wipeToken() {
  if (tokenInput.value) tokenInput.value.value = ''
  tokenFilled.value = false
}

function reset() {
  mode.value = 'form'
  error.value = ''
  busy.value = false
  tokenFilled.value = false
  repository.value = hosted.repository ? `${hosted.repository.owner}/${hosted.repository.repo}` : ''
  path.value = hosted.repository?.path ?? DEFAULT_HOSTED_PATH
}

watch(
  () => menu.connectOpen,
  async (open) => {
    if (open) {
      reset()
      await nextTick()
      tokenInput.value?.focus()
    } else {
      wipeToken()
    }
  },
)

function onTokenInput() {
  tokenFilled.value = (tokenInput.value?.value ?? '') !== ''
}

async function submit() {
  if (!canSubmit.value) return
  const [owner = '', name = '', ...extra] = repository.value.trim().split('/')
  busy.value = true
  error.value = ''
  try {
    const result = await hosted.connect({
      token: tokenInput.value?.value ?? '',
      // An "owner/repo/extra" or a bare word is passed through as-is; the store's own
      // validation names the field, before any request is made.
      owner: extra.length > 0 ? repository.value.trim() : owner,
      repo: extra.length > 0 ? '' : name,
      path: path.value.trim() || DEFAULT_HOSTED_PATH,
    })
    if (result.ok) {
      exists.value = result.exists
      wipeToken()
      mode.value = 'saved'
    } else {
      error.value = result.message
    }
  } finally {
    busy.value = false
  }
}

async function replaceToken() {
  mode.value = 'form'
  error.value = ''
  tokenFilled.value = false
  await nextTick()
  tokenInput.value?.focus()
}

function cancel() {
  wipeToken()
  menu.closeConnect()
}
</script>

<template>
  <ModalShell
    :open="menu.connectOpen"
    testid="hosted-connect-dialog"
    :title="hosted.connected && mode === 'form' ? 'Replace token' : 'Connect repository'"
    @backdrop="cancel()"
  >
    <template v-if="mode === 'form'">
      <p class="connect__help">
        Create a fine-grained personal access token limited to <strong>this one repository</strong>,
        with <strong>Contents: read and write</strong>. It is stored in this browser's IndexedDB and
        sent only to <code>api.github.com</code>.
      </p>
      <form class="connect__form" novalidate @submit.prevent="submit()">
        <label class="connect__field">
          Token
          <input
            ref="tokenInput"
            class="connect__input"
            type="password"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            data-testid="hosted-token"
            @input="onTokenInput"
          />
        </label>
        <label class="connect__field">
          Repository
          <input
            v-model="repository"
            class="connect__input"
            type="text"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            placeholder="owner/repo"
            data-testid="hosted-repo"
          />
        </label>
        <label class="connect__field">
          Path
          <input
            v-model="path"
            class="connect__input"
            type="text"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            data-testid="hosted-path"
          />
        </label>
        <p v-if="error" class="connect__error" role="alert" data-testid="hosted-connect-error">
          {{ error }}
        </p>
        <div class="connect__actions">
          <button
            type="button"
            class="connect__button"
            data-testid="hosted-connect-cancel"
            @click="cancel()"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="connect__button connect__button--primary"
            data-testid="hosted-connect-submit"
            :disabled="!canSubmit"
          >
            {{ busy ? 'Connecting…' : 'Connect' }}
          </button>
        </div>
      </form>
    </template>

    <template v-else>
      <p class="connect__saved" role="status" data-testid="hosted-connect-saved">
        <strong>Token saved in this browser.</strong>
        Connected to {{ hosted.repoLabel }}.
        <template v-if="!exists">
          No project file yet — the first Save to {{ hosted.repoLabel }} will create it.
        </template>
      </p>
      <p class="connect__help">
        The token is never shown again. Auto-push is off; turn it on from the File menu if you
        want it.
      </p>
      <div class="connect__actions">
        <button
          type="button"
          class="connect__button"
          data-testid="hosted-connect-replace"
          @click="replaceToken()"
        >
          Replace token
        </button>
        <button
          type="button"
          class="connect__button connect__button--primary"
          data-testid="hosted-connect-done"
          @click="menu.closeConnect()"
        >
          Done
        </button>
      </div>
    </template>
  </ModalShell>
</template>

<style scoped>
.connect__help,
.connect__saved {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}

.connect__saved {
  font-size: 14px;
  color: var(--text-1);
}

.connect__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.connect__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.connect__input {
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

.connect__error {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--danger);
  overflow-wrap: anywhere;
}

.connect__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.connect__button {
  min-width: 96px;
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

.connect__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.connect__button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
