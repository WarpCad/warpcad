<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A formula box (`TODO/FIND-core-078`): the text (`variable-formula-input`, full width, at least
 * 44 px, wrapping a long formula rather than scrolling sideways), **Insert…**
 * (`variable-formula-insert`) beside it, and the preview line (`variable-formula-preview`) under
 * it — `= 40 mm` or core's named error, with its character position for a syntax error.
 *
 * Shared by the Variables **+** form, a formula row's edit and the bind list's **New formula from
 * this value…**. It only edits text: what the preview says is worked out by the parent through
 * `useVariableCommands().previewFormula`, which writes nothing. The preview is text
 * interpolation, never markup.
 */
import { nextTick, ref } from 'vue'

import { insertAtCaret } from '../../composables/variableEntry.js'
import FormulaInsertList from './FormulaInsertList.vue'

const text = defineModel({ type: String, default: '' })

defineProps({
  /** `{ ok, text }` from `formulaPreviewLine`. */
  preview: { type: Object, required: true },
  /** The box's accessible name. */
  label: { type: String, default: 'Formula' },
})

const emit = defineEmits(['enter'])

const box = ref(/** @type {HTMLTextAreaElement | null} */ (null))
const inserting = ref(false)
/** Where the caret last was; `null` until the box has had one (insert then goes at the end). */
const caret = ref(/** @type {{ start: number, end: number } | null} */ (null))

function remember() {
  const element = box.value
  if (element !== null) caret.value = { start: element.selectionStart, end: element.selectionEnd }
}

function toggleInsert() {
  remember()
  inserting.value = !inserting.value
}

/** @param {string} reference */
async function onInsert(reference) {
  const at = caret.value ?? { start: text.value.length, end: text.value.length }
  const result = insertAtCaret(text.value, at.start, at.end, reference)
  text.value = result.text
  inserting.value = false
  caret.value = { start: result.caret, end: result.caret }
  await nextTick()
  box.value?.focus()
  box.value?.setSelectionRange(result.caret, result.caret)
}
</script>

<template>
  <div class="feditor">
    <textarea
      ref="box"
      v-model="text"
      class="feditor__box"
      rows="2"
      autocapitalize="off"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      :aria-label="label"
      data-testid="variable-formula-input"
      @keyup="remember"
      @click="remember"
      @select="remember"
      @blur="remember"
      @input="remember"
      @keydown.enter.prevent="emit('enter')"
    />
    <div class="feditor__row">
      <p class="feditor__preview" :data-ok="preview.ok ? 'true' : 'false'" role="status" data-testid="variable-formula-preview">{{ preview.text }}</p>
      <button type="button" class="feditor__insert" :aria-expanded="inserting" data-testid="variable-formula-insert" @click="toggleInsert">Insert…</button>
    </div>
    <FormulaInsertList v-if="inserting" @insert="onInsert" @close="inserting = false" />
  </div>
</template>

<style scoped>
.feditor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.feditor__box {
  box-sizing: border-box;
  width: 100%;
  min-height: 44px;
  padding: 8px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1.35;
  resize: vertical;
  overflow-wrap: anywhere;
}

.feditor__row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.feditor__preview {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.feditor__preview[data-ok='false'] {
  font-family: inherit;
  font-size: 12px;
  color: var(--danger, var(--text-1));
}

.feditor__insert {
  flex: none;
  min-width: 44px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.feditor__box:focus-visible,
.feditor__insert:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
