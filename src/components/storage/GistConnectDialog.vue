<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Connect GitHub for short links** — the gist token dialog (`TODO/io-017`, Stage 2;
 * `docs/decisions/gist-storage.md`). Opened from **File ▾ → Connect GitHub for gists…**
 * (`gist-connect-open`) and from the Share sheet's gist group; both set
 * `fileMenu.gistConnectOpen`.
 *
 * ## What it asks for
 *
 * The recommended token is **fine-grained, no repository access, only Gists: Read and write**
 * (it cannot reach a repository; GitHub answers 403). A **classic** token with only the `gist`
 * box ticked is the plainly worded fallback. Neither can be limited to one gist, and the dialog
 * says so. It is a separate credential from the repository token (`ConnectDialog.vue`): a person
 * may hold both, and each is removed on its own.
 *
 * ## Credential rules — `ConnectDialog.vue`'s, enforced the same way
 *
 * - The field is **uncontrolled** (never a `ref` or `v-model`); its value is read at submit,
 *   handed to `gist.connect()` and nowhere else, and the field is wiped straight away.
 *   `tokenFilled` is a flag about the field, not its value.
 * - `type="password"`, `autocomplete="off"`, no autocapitalise, autocorrect or spellcheck.
 * - Never rendered back, never in a URL, a `data-*` attribute or a `console.*`. Every message on
 *   screen is fixed wording from `gistMessages.js` (through the store), never built from input or
 *   from GitHub's text.
 * - **Disconnect really deletes** the stored record (`gist.disconnect()`); the repository token
 *   is untouched.
 *
 * ## Phone
 *
 * A bottom sheet at 390px (`ModalShell`'s `sheet`, lifted above the keyboard), the token field
 * first and the explanation under it; a dialog from 641px. 16px inputs, 44px targets.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { BROADER_THAN_NEEDED_MESSAGE } from '../../core/gistMessages.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { useGistStore } from '../../stores/gist.js'
import ModalShell from './ModalShell.vue'

/** GitHub's page for a new fine-grained token. */
const TOKEN_PAGE = 'https://github.com/settings/personal-access-tokens/new'

const menu = useFileMenuStore()
const gist = useGistStore()

/** `form` — asking for a token; `connected` — showing the connection. @type {import('vue').Ref<'form' | 'connected'>} */
const mode = ref('form')
const busy = ref(false)
const error = ref('')
/** A one-line note after an action (`Disconnected…`), fixed wording. */
const note = ref('')
/** Whether the token field has anything in it — a flag about the field, never its value. */
const tokenFilled = ref(false)

/** @type {import('vue').Ref<HTMLInputElement | null>} */
const tokenInput = ref(null)

const canSubmit = computed(() => tokenFilled.value && !busy.value)
const title = computed(() => (mode.value === 'connected' ? 'GitHub for short links' : 'Connect GitHub for short links'))
const kindText = computed(() => {
  if (gist.tokenKind === 'fine-grained') return 'Fine-grained token'
  if (gist.tokenKind === 'classic') return 'Classic token'
  return 'Token'
})
/** `expires 27 Nov 2026`, or a plain statement when GitHub gave no date. */
const expiryText = computed(() => {
  if (gist.expiresAt === null) return 'no expiry date reported'
  const date = new Date(gist.expiresAt)
  if (Number.isNaN(date.getTime())) return 'no expiry date reported'
  return `expires ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
})

function wipeToken() {
  if (tokenInput.value) tokenInput.value.value = ''
  tokenFilled.value = false
}

async function focusToken() {
  await nextTick()
  tokenInput.value?.focus()
}

watch(
  () => menu.gistConnectOpen,
  async (open) => {
    if (!open) {
      wipeToken()
      return
    }
    error.value = ''
    note.value = ''
    busy.value = false
    tokenFilled.value = false
    // Which account is connected here: the stored record, no network.
    await gist.start().catch(() => {})
    mode.value = gist.connected ? 'connected' : 'form'
    if (mode.value === 'form') await focusToken()
  },
)

function onTokenInput() {
  tokenFilled.value = (tokenInput.value?.value ?? '') !== ''
}

async function submit() {
  if (!canSubmit.value) return
  busy.value = true
  error.value = ''
  note.value = ''
  try {
    const result = await gist.connect(tokenInput.value?.value ?? '')
    wipeToken()
    if (result.ok) mode.value = 'connected'
    else error.value = result.message
  } finally {
    busy.value = false
  }
}

async function disconnect() {
  busy.value = true
  try {
    await gist.disconnect()
  } finally {
    busy.value = false
  }
  mode.value = 'form'
  note.value = 'Disconnected. The token is deleted from this browser. To cancel it on GitHub too, delete it on its token page.'
  await focusToken()
}

async function replaceToken() {
  mode.value = 'form'
  error.value = ''
  note.value = ''
  await focusToken()
}

function close() {
  wipeToken()
  menu.closeGistConnect()
}
</script>

<template>
  <ModalShell :open="menu.gistConnectOpen" sheet testid="gist-connect-dialog" :title="title" help-topic="gist" @backdrop="close()">
    <template v-if="mode === 'form'">
      <form class="gist-connect__form" novalidate @submit.prevent="submit()">
        <label class="gist-connect__field">
          GitHub token
          <input
            ref="tokenInput"
            class="gist-connect__input"
            type="password"
            autocomplete="off"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            data-testid="gist-connect-token"
            @input="onTokenInput"
          />
        </label>
        <p v-if="error" class="gist-connect__error" role="alert" data-testid="gist-connect-error">{{ error }}</p>
        <p v-if="note" class="gist-connect__note" role="status" data-testid="gist-connect-note">{{ note }}</p>
        <div class="gist-connect__actions">
          <button type="button" class="gist-connect__button" data-testid="gist-connect-cancel" @click="close()">Cancel</button>
          <button
            type="submit"
            class="gist-connect__button gist-connect__button--primary"
            data-testid="gist-connect-submit"
            :disabled="!canSubmit"
          >
            {{ busy ? 'Checking…' : 'Connect' }}
          </button>
        </div>
      </form>

      <div class="gist-connect__help" data-testid="gist-connect-help">
        <a
          class="gist-connect__link"
          :href="TOKEN_PAGE"
          target="_blank"
          rel="noopener noreferrer"
          data-testid="gist-connect-github-link"
        >Open GitHub's token page</a>
        <p>
          Create a fine-grained token with no repository access and only
          <strong>Gists: Read and write</strong>. Copy it and paste it above.
        </p>
        <p>Or use a classic token with only the <strong>gist</strong> box ticked.</p>
        <p>
          GitHub can't limit a token to one gist: this one can create, change and delete any of your
          gists. It can't reach your repositories. It is kept in this browser only, sent only to
          <code>api.github.com</code>, and is separate from a repository token.
        </p>
      </div>
    </template>

    <template v-else>
      <div class="gist-connect__status" role="status" data-testid="gist-connect-status">
        <p class="gist-connect__connected">
          Connected as <strong data-testid="gist-connect-login">{{ gist.login }}</strong>
        </p>
        <p class="gist-connect__meta" data-testid="gist-connect-kind">{{ kindText }} · {{ expiryText }}</p>
        <p class="gist-connect__meta">Token saved in this browser. It is never shown again.</p>
      </div>
      <p v-if="gist.broaderThanNeeded" class="gist-connect__warning" role="alert" data-testid="gist-connect-warning">
        {{ BROADER_THAN_NEEDED_MESSAGE }}
      </p>
      <div class="gist-connect__actions gist-connect__actions--wrap">
        <button
          type="button"
          class="gist-connect__button gist-connect__button--danger"
          data-testid="gist-disconnect"
          :disabled="busy"
          @click="disconnect()"
        >
          Disconnect
        </button>
        <button type="button" class="gist-connect__button" data-testid="gist-connect-replace" :disabled="busy" @click="replaceToken()">
          Replace token
        </button>
        <button type="button" class="gist-connect__button gist-connect__button--primary" data-testid="gist-connect-done" @click="close()">
          Done
        </button>
      </div>
    </template>
  </ModalShell>
</template>

<style scoped>
.gist-connect__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gist-connect__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.gist-connect__input {
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

.gist-connect__help {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.gist-connect__help p,
.gist-connect__meta {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.gist-connect__help strong {
  color: var(--text-1);
}

/* Its own row, a full 44px target: on a phone this is the step people tap. */
.gist-connect__link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  min-height: var(--tap);
  color: var(--accent);
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.gist-connect__status {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gist-connect__connected {
  margin: 0;
  font-size: 15px;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.gist-connect__error,
.gist-connect__warning,
.gist-connect__note {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.gist-connect__error {
  color: var(--danger);
}

.gist-connect__warning {
  color: var(--warn);
}

.gist-connect__note {
  color: var(--text-2);
}

.gist-connect__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.gist-connect__actions--wrap {
  flex-wrap: wrap;
}

.gist-connect__button {
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

.gist-connect__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.gist-connect__button--danger {
  margin-right: auto;
  border-color: transparent;
  background: transparent;
  color: var(--danger);
}

.gist-connect__button:disabled {
  opacity: 0.45;
  cursor: default;
}

@media (max-width: 640px) {
  /* Phone: the two main buttons share the row; full width is the thumb's. */
  .gist-connect__actions .gist-connect__button:not(.gist-connect__button--danger) {
    flex: 1;
  }
}
</style>
