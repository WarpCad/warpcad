<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **Save to library…** sheet (`TODO/ui-055`) and the "Saved <name>" toast that confirms it.
 *
 * Opened from the Inspector header's *Save to library…* (`library-save`) or the Operations
 * toolbar's matching button, both gated on exactly one body being selected (`library.saveGate`).
 *
 * - **Fields**: Name (suggested from the body's own name), Category (*My parts*), and the list of
 *   numbers of the group that can be exposed as parameters — a checkbox per number, off by
 *   default. A ticked number becomes a field in the Inspector on every placed copy, so one
 *   saved Standoff can be placed at 8 mm and again at 20 mm.
 * - **Validation** is the store's (`library.nameProblem`): empty, over-long and duplicate names
 *   each say so, and Save stays disabled until the name is acceptable. A capture that the part
 *   format cannot carry (a conditional or broken step) stays here in a `role="alert"`, by name.
 * - **Small screens**: a bottom sheet, every control a 44 px target, 16 px inputs so iOS does
 *   not zoom on focus. Escape closes it.
 * - **Toast**: a polite live region, so a screen reader announces the save too.
 *
 * Layout and events only; every rule lives in `stores/library.js` and `core/userPartTools.js`.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { useLibraryStore } from '../../stores/library.js'
import { useOverlaysStore } from '../../stores/overlays.js'

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

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Escape' || !library.saveOpen) return
  event.preventDefault()
  library.closeSave()
}
onMounted(() => window.addEventListener('keydown', onKeydown, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true))
</script>

<template>
  <Teleport to="body">
    <form
      v-if="library.saveOpen"
      class="save-sheet"
      role="dialog"
      aria-label="Save to library"
      data-testid="save-library-sheet"
      novalidate
      @submit.prevent="library.save()"
    >
      <p class="save-sheet__title">Save to library</p>
      <p class="save-sheet__note">
        Saves this group as a part you can drag into any project, with its sub-parts and names intact.
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

      <fieldset class="save-sheet__params">
        <legend class="save-sheet__legend">Adjustable sizes (optional)</legend>
        <p v-if="library.saveCandidates.length === 0" class="save-sheet__note" data-testid="save-library-no-params">
          This group has no sizes to expose. It will save as a fixed part.
        </p>
        <template v-else>
          <p class="save-sheet__note">
            Tick the sizes you want to change after placing it. Each becomes a field in the Inspector.
          </p>
          <label v-for="candidate in library.saveCandidates" :key="candidate.key" class="save-sheet__check">
            <input
              v-model="library.saveChosen"
              type="checkbox"
              :value="candidate.key"
              :data-testid="`save-library-param-${candidate.key}`"
            />
            <span class="save-sheet__check-label">{{ candidate.label }}</span>
            <span class="save-sheet__check-value">{{ Number(candidate.value.toFixed(3)) }} {{ candidate.unit }}</span>
          </label>
        </template>
      </fieldset>

      <p v-if="library.saveError" class="save-sheet__problem" role="alert" data-testid="save-library-error">
        {{ library.saveError }}
      </p>

      <div class="save-sheet__actions">
        <button type="button" class="save-sheet__button" data-testid="save-library-cancel" @click="library.closeSave()">
          Cancel
        </button>
        <button
          type="submit"
          class="save-sheet__button save-sheet__button--primary"
          :disabled="!library.canSave"
          data-testid="save-library-submit"
        >
          {{ library.saving ? 'Saving…' : 'Save' }}
        </button>
      </div>
    </form>

    <div
      class="library-toast"
      role="status"
      aria-live="polite"
      data-testid="library-toast"
      :data-visible="library.toast.text ? 'true' : 'false'"
    >
      <template v-if="library.toast.text">{{ library.toast.text }}</template>
    </div>
  </Teleport>
</template>

<style scoped>
.save-sheet {
  position: fixed;
  z-index: 42;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text-1);
  font-family: var(--font);
  box-shadow: var(--shadow-overlay);
  /* Phone first: a bottom sheet. */
  right: 0;
  bottom: 0;
  left: 0;
  max-height: 86dvh;
  overflow-y: auto;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}

.save-sheet__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.save-sheet__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-2);
}

.save-sheet__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.save-sheet__input {
  box-sizing: border-box;
  min-height: var(--tap, 44px);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16 px: iOS Safari zooms the page on focus of anything smaller. */
  font-size: 16px;
}

.save-sheet__input[aria-invalid='true'] {
  border-color: var(--danger);
}

.save-sheet__problem {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--danger);
  overflow-wrap: anywhere;
}

.save-sheet__params {
  margin: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  min-width: 0;
  max-height: 32dvh;
  overflow-y: auto;
}

.save-sheet__legend {
  padding: 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.save-sheet__check {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 13px;
  cursor: pointer;
}

.save-sheet__check input {
  flex: none;
  width: 20px;
  height: 20px;
}

.save-sheet__check-label {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.save-sheet__check-value {
  flex: none;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-2);
}

.save-sheet__actions {
  display: flex;
  gap: 8px;
}

.save-sheet__button {
  flex: 1;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}

.save-sheet__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.save-sheet__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast, #fff);
}

.library-toast {
  position: fixed;
  top: 60px;
  left: 50%;
  z-index: 60;
  max-width: calc(100vw - 32px);
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface-1);
  color: var(--text-1);
  font-family: var(--font);
  font-size: 13px;
  box-shadow: var(--shadow-overlay);
  transform: translateX(-50%);
  /* A toast never takes a tap from what is under it. */
  pointer-events: none;
}

.library-toast[data-visible='false'] {
  display: none;
}

@media (min-width: 641px) {
  .save-sheet {
    top: 64px;
    right: 16px;
    bottom: auto;
    left: auto;
    width: min(340px, calc(100vw - 32px));
    max-height: calc(100dvh - 96px);
    border-radius: var(--radius-lg);
    padding-bottom: 12px;
  }
}
</style>
