<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * "bracket.ndjson changed on disk since you opened or saved it" — the local-file counterpart of
 * the hosted conflict dialog (`TODO/ai-009`; `ConflictDialog.vue`; `stores/persistence.js`).
 *
 * - **Precondition**: a project file opened or saved through File System Access (desktop
 *   Chromium — the only engine that keeps a handle the app can read again), and the file's
 *   bytes on disk now differ from what the app last read or wrote. Typically the MCP server
 *   (`mcp/server.js`) appended steps to it.
 * - **Trigger**: the app regaining focus (window `focus`, or the tab becoming visible), an
 *   in-place **Save** (which checks first and asks instead of writing), or tapping the
 *   `File changed on disk — Reload` chip / the File menu's `Reload … from disk…` after a Cancel.
 * - **Feedback**: this dialog; the chip; after **Reload**, `Opened <name> · N steps` and the new
 *   History rows with their origin chip (`via mcp`) and intent.
 *
 * Three answers and **no merge, ever** (`docs/decisions/ai-partner.md` decision 6): **Reload**
 * (replace this project with the file — the expected answer after an MCP edit, so it is first),
 * **Overwrite the file** (write this project over it), **Cancel**. Cancel is focused by default
 * and Escape is Cancel, so a stray Enter never replaces or overwrites anything. The same modal
 * frame as every File-menu dialog (`ModalShell.vue`): top-anchored and full width at phone width,
 * 44px targets, and it waits while a drag or another dialog is open.
 *
 * The file's name is shown as text; nothing from the file's *contents* is shown here.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { usePersistenceStore } from '../../stores/persistence.js'
import ModalShell from './ModalShell.vue'

const persistence = usePersistenceStore()

const title = computed(() => `${persistence.diskChangeName} changed on disk since you opened or saved it.`)

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

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Escape' || !persistence.diskPromptOpen) return
  event.preventDefault()
  void choose('cancel')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <ModalShell :open="persistence.diskPromptOpen" testid="disk-change" :title="title" @backdrop="choose('cancel')">
    <p class="disk__detail">Another program — such as the WarpCad MCP server — changed this file.</p>
    <div class="disk__actions">
      <button
        type="button"
        class="disk__button disk__button--primary"
        data-testid="disk-change-reload"
        :disabled="working"
        @click="choose('reload')"
      >
        Reload (replaces this project)
      </button>
      <button
        type="button"
        class="disk__button disk__button--danger"
        data-testid="disk-change-overwrite"
        :disabled="working"
        @click="choose('overwrite')"
      >
        Overwrite the file with this project
      </button>
      <button
        ref="cancelButton"
        type="button"
        class="disk__button"
        data-testid="disk-change-cancel"
        :disabled="working"
        @click="choose('cancel')"
      >
        Cancel
      </button>
    </div>
    <p class="disk__note">
      Nothing is merged. Reload drops any edits made here since you opened or saved the file, and clears
      the undo history. Overwrite discards the other program’s changes.
    </p>
  </ModalShell>
</template>

<style scoped>
.disk__detail,
.disk__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.disk__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.disk__button {
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.disk__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.disk__button--primary {
  border-color: var(--accent);
}

.disk__button--danger {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
