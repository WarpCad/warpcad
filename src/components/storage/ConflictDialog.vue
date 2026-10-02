<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * "The repository copy changed since you last loaded or saved it" — the hosted conflict
 * dialog (`TODO/ui-033`, `docs/decisions/interaction-model-qa.md` §11, `stores/hosted.js`).
 *
 * Three answers and **no merge, ever** (`docs/decisions/document-sync.md` deferred that on
 * purpose): **Overwrite remote**, **Load remote (replaces this project)**, **Cancel**. Whatever
 * raised it — an explicit `Save to`, a background auto-push, or the first Save into a
 * repository that already holds a project file — this is the one dialog, and it never
 * overwrites on its own.
 *
 * It opens only when `hosted.conflictOpen` says so, which the store defers while a drag is in
 * progress or another popover/dialog is open (the File menu wires that up), so it never lands
 * under a finger mid-gizmo-drag. **Cancel is focused by default** and Escape is Cancel:
 * the destructive answers are never what a stray Enter selects. Cancel leaves auto-push
 * *paused, not off*, and the File dot at `!` — dismissing a dialog is not resolving a
 * divergence.
 *
 * The one line of detail under the sentence is the store's own message (typed and non-echoing:
 * it never quotes a server body, so it cannot carry the credential).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useHostedStore } from '../../stores/hosted.js'
import ModalShell from './ModalShell.vue'

const hosted = useHostedStore()

const TITLE = 'The repository copy changed since you last loaded or saved it.'

/**
 * The store's own line, when it says something the title does not. Most conflicts are worded
 * exactly like the title (a stale `sha`), and repeating a sentence directly under itself reads
 * as a rendering bug; the first Save into a repository that already has a file says something
 * different ("… already has a project file that this session has not loaded"), and that is
 * worth showing.
 */
const detail = computed(() => {
  const message = hosted.conflict?.message ?? ''
  const bare = (/** @type {string} */ text) => text.trim().replace(/\.$/, '').toLowerCase()
  return bare(message) === bare(TITLE) ? '' : message
})

const working = ref(false)
/** @type {import('vue').Ref<HTMLButtonElement | null>} */
const cancelButton = ref(null)

/** @param {'overwrite' | 'load' | 'cancel'} choice */
async function choose(choice) {
  if (working.value) return
  working.value = true
  try {
    await hosted.resolveConflict(choice)
  } finally {
    working.value = false
  }
}

watch(
  () => hosted.conflictOpen,
  async (open) => {
    if (!open) return
    await nextTick()
    cancelButton.value?.focus()
  },
)

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Escape' || !hosted.conflictOpen) return
  event.preventDefault()
  void choose('cancel')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <ModalShell
    :open="hosted.conflictOpen"
    testid="hosted-conflict"
    :title="TITLE"
    @backdrop="choose('cancel')"
  >
    <p v-if="detail" class="conflict__detail" data-testid="hosted-conflict-detail">{{ detail }}</p>
    <div class="conflict__actions">
      <button
        type="button"
        class="conflict__button conflict__button--danger"
        data-testid="hosted-conflict-overwrite"
        :disabled="working"
        @click="choose('overwrite')"
      >
        Overwrite remote
      </button>
      <button
        type="button"
        class="conflict__button"
        data-testid="hosted-conflict-load"
        :disabled="working"
        @click="choose('load')"
      >
        Load remote (replaces this project)
      </button>
      <button
        ref="cancelButton"
        type="button"
        class="conflict__button"
        data-testid="hosted-conflict-cancel"
        :disabled="working"
        @click="choose('cancel')"
      >
        Cancel
      </button>
    </div>
    <p class="conflict__note">
      Nothing is merged. Load remote also replaces any edits you have not pushed, and clears the
      undo history.
    </p>
  </ModalShell>
</template>

<style scoped>
.conflict__detail,
.conflict__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.conflict__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conflict__button {
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

.conflict__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.conflict__button--danger {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
