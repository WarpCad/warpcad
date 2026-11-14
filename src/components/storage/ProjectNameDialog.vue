<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The name sheet (`TODO/io-014`): what to call a project file in the native app's Documents
 * folder, asked by **Save** when the project has no file yet and by **Save As…**.
 *
 * - **Precondition**: running in the native app (`persistence.fileCapabilities.mode === 'native-app'`)
 *   and `fileMenu.nameRequest` set.
 * - **Trigger**: File ▾ → Save (no file yet) or Save As…, or Ctrl/Cmd+S.
 * - **Feedback**: the sheet closes and the chip reads `Saved to <name>.ndjson · 14:05`. A name
 *   already taken by another project stays in the sheet with the reason (`file-name-error`).
 *
 * A bottom sheet at phone width, lifted by the keyboard (`BaseDialog`'s `sheet`). Names only; the
 * write is `fileMenu.saveNamed`.
 */
import { nextTick, ref, watch } from 'vue'

import { useFileMenuStore } from '../../stores/fileMenu.js'
import BaseDialog from '../layout/BaseDialog.vue'

const menu = useFileMenuStore()

const name = ref('')
const field = ref(/** @type {HTMLInputElement | null} */ (null))

watch(
  () => menu.nameRequest,
  async (request) => {
    if (request === null) return
    name.value = request.name
    await nextTick()
    field.value?.select()
  },
  { immediate: true },
)

function submit() {
  void menu.saveNamed(name.value)
}
</script>

<template>
  <BaseDialog
    :open="menu.nameRequest !== null"
    sheet
    testid="file-name-dialog"
    :title="menu.nameRequest?.saveAs ? 'Save As' : 'Save'"
    help-topic="native-files"
    @backdrop="menu.cancelNamed()"
  >
    <form class="file-name__form" novalidate @submit.prevent="submit()">
      <label class="file-name__field">
        Name
        <input
          ref="field"
          v-model="name"
          class="file-name__input"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="120"
          data-testid="file-name-input"
        />
      </label>
      <p class="file-name__note">Saved in WarpCad's folder, which the Files app shows as On My iPhone › WarpCad.</p>
      <p v-if="menu.nameError" class="file-name__error" role="alert" data-testid="file-name-error">{{ menu.nameError }}</p>
      <div class="file-name__actions">
        <button type="button" class="file-name__button" data-testid="file-name-cancel" @click="menu.cancelNamed()">Cancel</button>
        <button type="submit" class="file-name__button file-name__button--primary" data-testid="file-name-save" :disabled="menu.nameBusy || name.trim() === ''">
          Save
        </button>
      </div>
    </form>
  </BaseDialog>
</template>

<style scoped>
.file-name__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.file-name__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.file-name__input {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px, deliberately: iOS zooms the whole page on focus of any input below it. */
  font-size: 16px;
}

.file-name__note,
.file-name__error {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.file-name__error {
  color: var(--danger);
}

.file-name__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.file-name__button {
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

.file-name__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.file-name__button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
