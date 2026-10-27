<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
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
 *
 * `TODO/io-016` — the Shared view's **Make my own copy to edit** asks the same question (`share`),
 * with its own first clause and a **Save or download yours first** button, because the Shared
 * view has no File menu to do that from; the dialog stays open after it so Replace can follow.
 * A link for the project already open (`share-update`) is the one other branch: **Merge their
 * changes** (the primary answer) or **Open theirs instead**, never a replace with a stranger's copy.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { useFileMenuStore } from '../../stores/fileMenu.js'
import { useHostedStore } from '../../stores/hosted.js'
import { usePersistenceStore } from '../../stores/persistence.js'
import ModalShell from './ModalShell.vue'

const menu = useFileMenuStore()
const hosted = useHostedStore()
const persistence = usePersistenceStore()

/** `TODO/io-016`: the shared project's title, for the two share questions. Untrusted text. */
const sharedName = computed(() => menu.pendingShared?.name ?? 'this project')

const title = computed(() => (menu.confirm === 'share-update' ? 'Merge their changes?' : 'Replace the project?'))

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
  if (menu.confirm === 'share') {
    return `Your own copy of ${sharedName.value} replaces the project this browser has open. Save or download yours first if you want to keep it.`
  }
  if (menu.confirm === 'share-update') {
    return `${sharedName.value} is a newer copy of the project you have open. Merge their changes into yours, or open theirs instead (it replaces yours).`
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
    :title="title"
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
      <!-- TODO/io-016: the Shared view has no File menu, so its "Save or download yours first" is here. -->
      <button
        v-if="menu.confirm === 'share'"
        type="button"
        class="confirm__button"
        data-testid="file-open-confirm-save"
        @click="menu.saveLocal()"
      >
        {{ persistence.fileCapabilities.mode === 'native' ? 'Save yours first' : 'Download yours first' }}
      </button>
      <button
        type="button"
        class="confirm__button confirm__button--danger"
        data-testid="file-open-confirm-replace"
        @click="menu.confirmReplace()"
      >
        {{ menu.confirm === 'share-update' ? 'Open theirs instead' : 'Replace' }}
      </button>
      <button
        v-if="menu.confirm === 'share-update'"
        type="button"
        class="confirm__button confirm__button--primary"
        data-testid="file-open-confirm-merge"
        @click="menu.confirmMerge()"
      >
        Merge their changes
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
  flex-wrap: wrap;
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

.confirm__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}
</style>
