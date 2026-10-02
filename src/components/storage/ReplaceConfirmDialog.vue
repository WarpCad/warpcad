<script setup>
/**
 * "Open replaces the current project" — the confirm that stands between a click on `Open…`
 * (or `Load from owner/repo`) and anything being destroyed (`TODO/ui-033`,
 * `docs/decisions/interaction-model-qa.md` §10).
 *
 * It appears **before** the picker opens, so a picker cancelled after a confirmed replace can
 * never lose anything. The Replace button is where the picker is actually opened — from inside
 * its own click, because the `<input type=file>` fallback must be clicked in a user gesture.
 *
 * The wording for `Open…` is the user-confirmed text verbatim; `Load from owner/repo` is
 * "the identical replace-confirm" with its own first clause (there is no file being opened).
 * Cancel is focused by default: the destructive choice is never the one Enter selects.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { useFileMenuStore } from '../../stores/fileMenu.js'
import { useHostedStore } from '../../stores/hosted.js'
import ModalShell from './ModalShell.vue'

const menu = useFileMenuStore()
const hosted = useHostedStore()

/** @type {import('vue').Ref<HTMLButtonElement | null>} */
const cancelButton = ref(null)

const sentence = computed(() => {
  if (menu.confirm === 'load') {
    return `Loading ${hosted.repoLabel} replaces the current project. Save or download it first if you want to keep it.`
  }
  // New resets the browser's autosave copy too — so, like Open, it only promises what a Save does.
  if (menu.confirm === 'new') {
    return 'New replaces the current project with an empty one. Save or download it first if you want to keep it — the copy this browser keeps is replaced too.'
  }
  return 'Open replaces the current project. Save or download it first if you want to keep it.'
})

watch(
  () => menu.confirm,
  async (kind) => {
    if (kind === null) return
    await nextTick()
    cancelButton.value?.focus()
  },
)
</script>

<template>
  <ModalShell
    :open="menu.confirm !== null"
    testid="file-open-confirm"
    title="Replace the project?"
    @backdrop="menu.cancelConfirm()"
  >
    <p class="confirm__text">{{ sentence }}</p>
    <div class="confirm__actions">
      <button
        ref="cancelButton"
        type="button"
        class="confirm__button"
        data-testid="file-open-confirm-cancel"
        @click="menu.cancelConfirm()"
      >
        Cancel
      </button>
      <button
        type="button"
        class="confirm__button confirm__button--danger"
        data-testid="file-open-confirm-replace"
        @click="menu.confirmReplace()"
      >
        Replace
      </button>
    </div>
  </ModalShell>
</template>

<style scoped>
.confirm__text {
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--text-2);
}

.confirm__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.confirm__button {
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

.confirm__button--danger {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
