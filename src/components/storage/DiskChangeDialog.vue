<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * "bracket.ndjson changed on disk and can't be merged" — the question asked only where there is
 * nothing safe to do automatically (`TODO/ai-009`, `TODO/io-010`; `stores/persistence.js`). A
 * changed copy of *this* project is merged in without asking (`ui-062`'s toast or banner).
 *
 * - **Precondition**: a project file opened or saved through File System Access (desktop
 *   Chromium), and the file on disk is a **different project**, cannot be read, or the user asked
 *   for **File ▾ → Reload from disk**.
 * - **Trigger**: the app regaining focus, an in-place **Save**, the chip's
 *   `File changed on disk — Reload` after a Cancel, or the File menu item.
 * - **Feedback**: this dialog, whose first line says why; the chip; after **Reload**,
 *   `Opened <name> · N steps`.
 *
 * Three answers: **Reload** (replace this project with the file), **Overwrite the file** (write
 * this project over it), **Cancel**. Cancel is focused by default and Escape is Cancel, so a
 * stray Enter never replaces or overwrites anything. The same modal frame as every File-menu
 * dialog (`BaseDialog.vue`): top-anchored and full width at phone width, 44px targets, and it
 * waits while a drag or another dialog is open.
 *
 * The file's name is shown as text; nothing from the file's *contents* is shown here.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { useOverlayStack } from '../../composables/useOverlayStack.js'
import { usePersistenceStore } from '../../stores/persistence.js'
import BaseDialog from '../layout/BaseDialog.vue'
import BaseButton from '../controls/BaseButton.vue'

const persistence = usePersistenceStore()

const title = computed(() =>
  persistence.diskIssueIsManual
    ? `Reload ${persistence.diskChangeName} from disk?`
    : `${persistence.diskChangeName} changed on disk and can't be merged.`,
)

const working = ref(false)
/** @type {import('vue').Ref<HTMLButtonElement | null>} */
const cancelButton = ref(null)

/** @param {'reload' | 'overwrite' | 'cancel'} choice */
async function choose(choice) {
  if (working.value) return
  working.value = true
  try {
    await persistence.resolveDiskChange(choice)
  } finally {
    working.value = false
  }
}

watch(
  () => persistence.diskPromptOpen,
  async (open) => {
    if (!open) return
    await nextTick()
    cancelButton.value?.focus()
  },
)

useOverlayStack(() => persistence.diskPromptOpen, () => void choose('cancel'))
</script>

<template>
  <BaseDialog :open="persistence.diskPromptOpen" testid="disk-change" :title="title" @backdrop="choose('cancel')">
    <p class="disk__detail" data-testid="disk-change-reason">{{ persistence.diskIssueText }}</p>
    <div class="disk__actions">
      <BaseButton
        variant="primary"
        align="start"
        data-testid="disk-change-reload"
        :disabled="working"
        @click="choose('reload')"
      >
        Reload (replaces this project)
      </BaseButton>
      <BaseButton
        variant="danger"
        align="start"
        data-testid="disk-change-overwrite"
        :disabled="working"
        @click="choose('overwrite')"
      >
        Overwrite the file with this project
      </BaseButton>
      <BaseButton
        ref="cancelButton"
        align="start"
        data-testid="disk-change-cancel"
        :disabled="working"
        @click="choose('cancel')"
      >
        Cancel
      </BaseButton>
    </div>
    <p class="disk__note">
      Reload drops any edits made here since you opened or saved the file, and clears the undo history.
      Overwrite discards the file’s changes. A file that is a copy of this project is merged in
      automatically instead of asking.
    </p>
  </BaseDialog>
</template>

<style scoped>
.disk__detail,
.disk__note {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.45;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.disk__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

</style>
