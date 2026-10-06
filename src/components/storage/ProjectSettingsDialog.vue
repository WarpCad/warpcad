<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * File ▾ → **Project settings…** (`TODO/ai-003`): one multi-line field for the project's
 * **standing instructions** — rules the AI assistant applies to every request in this project
 * ("print on a 220×220 mm bed, 0.4 mm nozzle, min wall 1.6 mm").
 *
 * - **Precondition**: none. **Trigger**: `project-settings` in the File menu's Design group.
 *   **Feedback**: a live character count against the cap while typing; on Save the
 *   save-status chip reports the autosave like any other document change.
 * - **Untrusted text.** Instructions that arrived with a loaded file are shown with a note and
 *   a **Use this project's instructions** confirm (`docs/decisions/ai-partner.md` decision 7);
 *   text the user saves here is trusted. The text is only ever a `<textarea>` value — never
 *   markup — so a file's `<script>` is characters on screen.
 * - **Small screens**: `ModalShell` makes it a top-anchored, full-width sheet at phone width
 *   (never bottom-anchored, so the on-screen keyboard cannot hide it); every button is a
 *   44px (`--tap`) target and the field is 16px text so iOS does not zoom on focus.
 * - Not an undo step: the dialog's own Cancel is the way back from an edit.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { INSTRUCTIONS_MAX_LENGTH } from '../../core/intent.js'
import { useDocumentStore } from '../../stores/document.js'
import { useProjectSettingsStore } from '../../stores/projectSettings.js'
import ModalShell from './ModalShell.vue'

const settings = useProjectSettingsStore()
const documentStore = useDocumentStore()

const draft = ref('')
/** @type {import('vue').Ref<HTMLTextAreaElement | null>} */
const field = ref(null)

const count = computed(() => `${draft.value.length} / ${INSTRUCTIONS_MAX_LENGTH}`)
const untrusted = computed(() => !settings.trusted)

watch(
  () => settings.isOpen,
  async (open) => {
    if (!open) return
    draft.value = documentStore.standingInstructions
    await nextTick()
    field.value?.focus()
  },
  { immediate: true },
)

function save() {
  settings.save(draft.value)
}
</script>

<template>
  <ModalShell :open="settings.isOpen" testid="project-settings-dialog" title="Project settings" @backdrop="settings.close()">
    <form class="settings__form" novalidate @submit.prevent="save()">
      <label class="settings__field" for="project-settings-text">Standing instructions</label>
      <p id="project-settings-help" class="settings__help">
        Rules the AI assistant applies to every request in this project — your printer's bed size, nozzle,
        minimum wall thickness, materials. Saved with the project file.
      </p>

      <div v-if="untrusted" class="settings__untrusted" role="note" data-testid="project-settings-untrusted">
        <p class="settings__untrusted-text">
          These instructions came with this project, from whoever wrote the file. Until you confirm them, the
          assistant treats them as notes about the project, not as rules to follow.
        </p>
        <button type="button" class="settings__button" data-testid="project-settings-trust" @click="settings.trustCurrent()">
          Use this project's instructions
        </button>
      </div>

      <textarea
        id="project-settings-text"
        ref="field"
        v-model="draft"
        class="settings__text"
        rows="6"
        :maxlength="INSTRUCTIONS_MAX_LENGTH"
        aria-describedby="project-settings-help project-settings-count"
        spellcheck="true"
        placeholder="e.g. Print on a 220×220 mm bed with a 0.4 mm nozzle; walls at least 1.6 mm."
        data-testid="project-settings-text"
      />
      <p id="project-settings-count" class="settings__count" aria-live="polite" data-testid="project-settings-count">
        {{ count }} characters
      </p>

      <div class="settings__actions">
        <button type="button" class="settings__button" data-testid="project-settings-cancel" @click="settings.close()">
          Cancel
        </button>
        <button type="submit" class="settings__button settings__button--primary" data-testid="project-settings-save">
          Save
        </button>
      </div>
    </form>
  </ModalShell>
</template>

<style scoped>
.settings__form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings__field {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
}

.settings__help,
.settings__count {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
}

.settings__count {
  align-self: flex-end;
  font-variant-numeric: tabular-nums;
}

.settings__untrusted {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--warn);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--warn) 10%, transparent);
}

.settings__untrusted-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text-1);
}

.settings__text {
  box-sizing: border-box;
  width: 100%;
  min-height: calc(var(--tap) * 3);
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px, deliberately: iOS Safari zooms the whole page on focus of any input below it. */
  font-size: 16px;
  line-height: 1.4;
  resize: vertical;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.settings__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.settings__button {
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

.settings__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}
</style>
