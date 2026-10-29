<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **File ▾ → Save as gist…** — the small dialog behind the first save to a gist (`TODO/io-021`),
 * and the **Saved to gist** toast after any save to one. Layout only: what happens is
 * `stores/fileMenu.js`'s `saveAsGist()`, which calls `useGistPublish` (`publish()` the first time,
 * `update()` once the project has a gist); the wording of every failure is `gistMessages.js`'s.
 *
 * - **No token** (`connect`): one step, **Connect GitHub for gists** (`save-gist-connect`), which
 *   opens `GistConnectDialog.vue` over this one; once connected the form shows here.
 * - **The first save** (`create`): **Name** (`save-gist-name`, pre-filled by `TODO/io-020`'s rule —
 *   the project's name, `Untitled` without one) and **Secret / Public** (`save-gist-secret`,
 *   `save-gist-public`; Secret unless chosen, and GitHub cannot change it later), then **Save**.
 * - **Save to gist refused** (`update`, e.g. `different-project` or `merge-conflict` — a gist
 *   changed elsewhere is merged in first, `TODO/io-019`): the reason and **Save to gist** again —
 *   nothing else to ask, since the gist keeps its title and visibility.
 * - **The toast** (`save-gist-toast`) names the gist and carries **Copy link**
 *   (`save-gist-toast-copy`), a new tap, so the clipboard write has its own activation.
 *
 * A bottom sheet at 390px (`ModalShell`'s `sheet`, the Share sheet's gist token dialog's frame),
 * a dialog from 641px. 16px inputs, 44px targets.
 */
import { computed, ref, watch } from 'vue'

import { useFileMenuStore } from '../../stores/fileMenu.js'
import ModalShell from './ModalShell.vue'

const SECRET_NOTE = 'A secret gist is not private: anyone with the link can read it. Saving sends the whole project to GitHub.'
const PUBLIC_NOTE = "Anyone can find a public gist on GitHub. Saving sends the whole project to GitHub. This can't be changed later."

const menu = useFileMenuStore()

const name = ref('')
/** @type {import('vue').Ref<'secret' | 'public'>} */
const visibility = ref('secret')
/** `copied` after Copy link landed; `failed` shows the link to copy by hand. */
const copyState = ref(/** @type {'' | 'copied' | 'failed'} */ (''))

const title = computed(() => (menu.gistSaveStep === 'update' ? 'Save to gist' : 'Save as gist'))
const note = computed(() => (visibility.value === 'public' ? PUBLIC_NOTE : SECRET_NOTE))

watch(
  () => menu.gistSaveOpen,
  (open) => {
    if (!open) return
    name.value = menu.gistSaveDefaultName
    visibility.value = 'secret'
  },
  { immediate: true },
)
watch(
  () => menu.gistSaveToast,
  () => {
    copyState.value = ''
  },
)

function submit() {
  if (menu.gistSaveBusy) return
  void menu.saveAsGist({ name: name.value, public: visibility.value === 'public' })
}

async function copyLink() {
  const link = menu.gistSaveToast?.link
  if (!link) return
  try {
    await navigator.clipboard.writeText(link)
    copyState.value = 'copied'
  } catch {
    copyState.value = 'failed'
  }
}
</script>

<template>
  <ModalShell :open="menu.gistSaveOpen" sheet testid="save-gist-dialog" :title="title" help-topic="gist" @backdrop="menu.closeSaveAsGist()">
    <template v-if="menu.gistSaveStep === 'connect'">
      <p class="save-gist__note">Connect GitHub for gists first. The token is kept in this browser only.</p>
      <div class="save-gist__actions">
        <button type="button" class="save-gist__button" data-testid="save-gist-cancel" @click="menu.closeSaveAsGist()">Cancel</button>
        <button type="button" class="save-gist__button save-gist__button--primary" data-testid="save-gist-connect" @click="menu.openGistConnect()">
          Connect GitHub for gists
        </button>
      </div>
    </template>

    <form v-else class="save-gist__form" novalidate @submit.prevent="submit()">
      <template v-if="menu.gistSaveStep === 'create'">
        <label class="save-gist__field">
          Name
          <input v-model="name" class="save-gist__input" type="text" autocomplete="off" maxlength="200" data-testid="save-gist-name" />
        </label>
        <fieldset class="save-gist__choice">
          <legend class="save-gist__legend">Who can see it</legend>
          <label class="save-gist__radio"><input v-model="visibility" type="radio" value="secret" data-testid="save-gist-secret" /> Secret</label>
          <label class="save-gist__radio"><input v-model="visibility" type="radio" value="public" data-testid="save-gist-public" /> Public</label>
        </fieldset>
        <p class="save-gist__note" data-testid="save-gist-disclosure">{{ note }}</p>
      </template>
      <p v-if="menu.gistSaveBusy" class="save-gist__note" role="status" data-testid="save-gist-busy">Saving to GitHub…</p>
      <p v-if="menu.gistSaveError" class="save-gist__error" role="alert" data-testid="save-gist-error">{{ menu.gistSaveError }}</p>
      <div class="save-gist__actions">
        <button type="button" class="save-gist__button" data-testid="save-gist-cancel" @click="menu.closeSaveAsGist()">Cancel</button>
        <button type="submit" class="save-gist__button save-gist__button--primary" data-testid="save-gist-submit" :disabled="menu.gistSaveBusy">
          {{ menu.gistSaveStep === 'update' ? 'Save to gist' : 'Save' }}
        </button>
      </div>
    </form>
  </ModalShell>

  <Teleport to="body">
    <div v-if="menu.gistSaveToast" class="save-gist-toast" role="status" aria-live="polite" data-testid="save-gist-toast">
      <span>{{ copyState === 'copied' ? 'Gist link copied' : menu.gistSaveToast.text }}</span>
      <input v-if="copyState === 'failed'" class="save-gist-toast__link" type="text" readonly aria-label="The gist link" :value="menu.gistSaveToast.link" data-testid="save-gist-toast-link" />
      <button v-else-if="copyState === ''" type="button" class="save-gist-toast__copy" data-testid="save-gist-toast-copy" @click="copyLink()">Copy link</button>
    </div>
  </Teleport>
</template>

<style scoped>
.save-gist__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.save-gist__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.save-gist__input,
.save-gist-toast__link {
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

.save-gist__choice {
  display: flex;
  gap: 16px;
  margin: 0;
  padding: 0;
  border: 0;
}

.save-gist__legend {
  padding: 0;
  margin-bottom: 2px;
  font-size: 12px;
  color: var(--text-2);
}

.save-gist__radio {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--tap);
  font-size: 14px;
  color: var(--text-1);
  cursor: pointer;
}

.save-gist__radio input {
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--accent);
}

.save-gist__note,
.save-gist__error {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.save-gist__error {
  color: var(--danger);
}

.save-gist__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.save-gist__button,
.save-gist-toast__copy {
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

.save-gist__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.save-gist__button:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Above the dialogs (41) and sheets, under the header; it carries a button, so it takes taps. */
.save-gist-toast {
  position: fixed;
  top: 60px;
  left: 50%;
  z-index: 60;
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  width: max-content;
  max-width: calc(100vw - 32px);
  padding: 6px 6px 6px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  color: var(--text-1);
  font-family: var(--font);
  font-size: 13px;
  box-shadow: var(--shadow-overlay);
  transform: translateX(-50%);
  overflow-wrap: anywhere;
}

.save-gist-toast__copy {
  min-width: 0;
}
</style>
