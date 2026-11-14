<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * "The repository copy changed since you last loaded or saved it" — the hosted conflict
 * dialog (`TODO/ui-033`, `docs/decisions/interaction-model-qa.md` §11, `stores/hosted.js`).
 *
 * Three answers: **Overwrite remote**, **Load remote (replaces this project)**, **Cancel**.
 * Since `TODO/io-011` a repository copy of **this** project is merged before it gets here
 * (`stores/hosted.js`), so this is reached only for a different project, a file this build
 * cannot read, a first Save into a file this session never loaded that is not a copy of this
 * project, or a repository that kept changing through three merge attempts. Whatever raised
 * it — an explicit `Save to`, a background auto-push — it never overwrites on its own.
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
import { computed, nextTick, ref, watch } from 'vue'

import { useOverlayStack } from '../../composables/useOverlayStack.js'
import { useHostedStore } from '../../stores/hosted.js'
import BaseDialog from '../layout/BaseDialog.vue'
import BaseButton from '../controls/BaseButton.vue'

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

useOverlayStack(() => hosted.conflictOpen, () => void choose('cancel'))
</script>

<template>
  <BaseDialog
    :open="hosted.conflictOpen"
    testid="hosted-conflict"
    :title="TITLE"
    @backdrop="choose('cancel')"
  >
    <p v-if="detail" class="conflict__detail" data-testid="hosted-conflict-detail">{{ detail }}</p>
    <div class="conflict__actions">
      <BaseButton
        variant="danger"
        align="start"
        data-testid="hosted-conflict-overwrite"
        :disabled="working"
        @click="choose('overwrite')"
      >
        Overwrite remote
      </BaseButton>
      <BaseButton
        align="start"
        data-testid="hosted-conflict-load"
        :disabled="working"
        @click="choose('load')"
      >
        Load remote (replaces this project)
      </BaseButton>
      <BaseButton
        ref="cancelButton"
        align="start"
        data-testid="hosted-conflict-cancel"
        :disabled="working"
        @click="choose('cancel')"
      >
        Cancel
      </BaseButton>
    </div>
    <p class="conflict__note">
      Nothing was merged automatically. Load remote also replaces any edits you
      have not pushed, and clears the undo history.
    </p>
  </BaseDialog>
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

</style>
