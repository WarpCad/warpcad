<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **Save to library…** sheet (`TODO/ui-055`) and the "Saved <name>" toast that confirms it.
 *
 * Opened from the Inspector header's *Save to library…* (`library-save`) or the Operations
 * toolbar's matching button, both gated on exactly one body being selected (`library.saveGate`).
 *
 * - **Fields**: Name (suggested from the body's own name) and Category (*My parts*). A saved part
 *   is fixed (`TODO/ui-105`): to get another size, place it, change it and save it under a new
 *   name. The name is checked against My parts only, and against the parts the group is built from.
 * - **Validation** is the store's (`library.nameProblem`): empty, over-long and duplicate names
 *   each say so, and Save stays disabled until the name is acceptable. A capture that the part
 *   format cannot carry (a conditional or broken step) stays here in a `role="alert"`, by name.
 * - **Small screens**: a bottom sheet, every control a 44 px target, 16 px inputs so iOS does
 *   not zoom on focus. Escape closes it.
 * - **Toast**: raised on the one toast queue (`stores/toasts.js`, drawn by `ToastHost.vue`), a polite status, so a screen reader announces the save too.
 *
 * Layout and events only; every rule lives in `stores/library.js` and `core/userPartTools.js`.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { useLibraryStore } from '../../stores/library.js'
import { useOverlaysStore } from '../../stores/overlays.js'
import BaseButton from '../controls/BaseButton.vue'
import BaseSheet from './BaseSheet.vue'

const library = useLibraryStore()
const overlays = useOverlaysStore()
const nameInput = ref(/** @type {HTMLInputElement | null} */ (null))

watch(
  () => library.saveOpen,
  async (open) => {
    overlays.setOpen('save-library-sheet', open)
    if (!open) return
    await nextTick()
    nameInput.value?.select()
  },
  { immediate: true }
)
onBeforeUnmount(() => overlays.setOpen('save-library-sheet', false))
</script>

<template>
  <BaseSheet
    :open="library.saveOpen"
    as="form"
    card
    tier="modal"
    testid="save-library-sheet"
    title="Save to library"
    help-topic="save-to-library"
    novalidate
    @submit.prevent="library.save()"
    @escape="library.closeSave()"
  >
      <p class="save-sheet__note">
        Saves this group as a fixed part you can drag into any project. To save another size, place it, change it, and save it under a new name.
      </p>

      <label class="save-sheet__field">
        Name
        <input
          ref="nameInput"
          v-model="library.saveName"
          class="save-sheet__input"
          type="text"
          autocomplete="off"
          autocapitalize="sentences"
          data-testid="save-library-name"
          :aria-invalid="library.nameProblem !== ''"
          aria-describedby="save-library-name-problem"
        />
      </label>
      <p
        id="save-library-name-problem"
        class="save-sheet__problem"
        data-testid="save-library-name-problem"
        :hidden="library.nameProblem === ''"
      >
        {{ library.nameProblem }}
      </p>

      <label class="save-sheet__field">
        Category
        <select v-model="library.saveCategory" class="save-sheet__input" data-testid="save-library-category">
          <option value="user">My parts</option>
        </select>
      </label>

      <p v-if="library.saveError" class="save-sheet__problem" role="alert" data-testid="save-library-error">
        {{ library.saveError }}
      </p>

      <div class="save-sheet__actions">
        <BaseButton size="large" fill data-testid="save-library-cancel" @click="library.closeSave()">
          Cancel
        </BaseButton>
        <BaseButton
          type="submit"
          variant="primary"
          size="large"
          fill
          :disabled="!library.canSave"
          data-testid="save-library-submit"
        >
          {{ library.saving ? 'Saving…' : 'Save' }}
        </BaseButton>
      </div>
  </BaseSheet>
</template>

<style scoped>
.save-sheet__note {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--text-2);
}

.save-sheet__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.save-sheet__input {
  box-sizing: border-box;
  min-height: var(--tap);
  padding: 0 var(--space-4h);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16 px: iOS Safari zooms the page on focus of anything smaller. */
  font-size: var(--text-size-xl);
}

.save-sheet__input[aria-invalid='true'] {
  border-color: var(--danger);
}

.save-sheet__problem {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--danger);
  overflow-wrap: anywhere;
}

.save-sheet__actions {
  display: flex;
  gap: var(--space-4);
}
</style>
