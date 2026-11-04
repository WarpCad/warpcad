<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A formula's part of its Variables row (`TODO/FIND-core-078`): the value, read-only (it is
 * calculated), the formula as text below it (`variable-formula-<name>`) — tapping it edits it
 * in a formula box with **Insert…** and a preview — and, when it has one, why it cannot be used,
 * and the note for each row that read it before a later step changed what it measures.
 *
 * Save is one Undo step, or — when the new value would break a dependent — held for the repair
 * dialog `ui-052` already has, as a value variable's change is. Every refusal is core's own
 * reason. Formula text, names and errors are text interpolation only, never markup.
 */
import { computed, ref } from 'vue'

import { useVariableCommands } from '../../composables/useVariableCommands.js'
import { formulaPreviewLine } from '../../composables/variableEntry.js'
import { useRepairDialogStore } from '../../stores/repairDialog.js'
import FormulaEditor from './FormulaEditor.vue'

const props = defineProps({
  row: {
    type: /** @type {import('vue').PropType<import('../../composables/useVariableCommands.js').VariableRowData>} */ (Object),
    required: true,
  },
})

const commands = useVariableCommands()
const repairDialog = useRepairDialogStore()

const editing = ref(false)
const text = ref('')
const error = ref('')

const variable = computed(() => props.row.variable)
const preview = computed(() => formulaPreviewLine(editing.value ? commands.previewFormula(text.value, variable.value.name) : null, variable.value.unit))

function startEdit() {
  text.value = props.row.formula ?? ''
  error.value = ''
  editing.value = true
}

function save() {
  if (!preview.value.ok) return
  error.value = ''
  try {
    const result = commands.setFormula(variable.value.name, text.value)
    if ('needsRepair' in result) repairDialog.show({ edit: result.edit, breakages: result.breakages })
    editing.value = false
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  }
}
</script>

<template>
  <div class="vformula">
    <div class="vformula__value">
      <span class="vformula__number" :data-testid="`variable-value-${variable.name}`">{{ row.valueLabel }}</span>
      <span class="vformula__kind">calculated</span>
    </div>
    <template v-if="editing">
      <FormulaEditor v-model="text" :preview="preview" :label="`Formula for ${variable.name}`" @enter="save" />
      <div class="vformula__actions">
        <button type="button" class="vformula__btn vformula__btn--primary" :disabled="!preview.ok" :data-testid="`variable-formula-save-${variable.name}`" @click="save">Save</button>
        <button type="button" class="vformula__btn" :data-testid="`variable-formula-cancel-${variable.name}`" @click="editing = false">Cancel</button>
      </div>
    </template>
    <button v-else type="button" class="vformula__text" :aria-label="`Edit the formula for ${variable.name}`" :data-testid="`variable-formula-${variable.name}`" @click="startEdit">{{ row.formula }}</button>
    <p v-if="error" class="vformula__error" role="alert" :data-testid="`variable-formula-save-error-${variable.name}`">{{ error }}</p>
    <p v-if="variable.error" class="vformula__error" :data-testid="`variable-formula-error-${variable.name}`">Can't be used: {{ variable.error }}</p>
    <p v-for="entry in variable.varies ?? []" :key="`${entry.recordId}:${entry.path}`" class="vformula__note" :data-testid="`variable-varies-${variable.name}`">{{ entry.note }}</p>
  </div>
</template>

<style scoped>
.vformula {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.vformula__value {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.vformula__number {
  font-family: var(--font-mono);
  font-size: 16px;
  color: var(--text-1);
}

.vformula__kind {
  font-size: 11px;
  color: var(--text-3);
}

.vformula__text {
  min-height: 44px;
  padding: 6px 8px;
  border: 1px dashed var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 13px;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  cursor: text;
  touch-action: manipulation;
}

.vformula__actions {
  display: flex;
  gap: 6px;
}

.vformula__btn {
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.vformula__btn--primary {
  border-color: var(--accent);
}

.vformula__btn:disabled {
  border-color: var(--border);
  color: var(--text-3);
  cursor: not-allowed;
}

.vformula__text:focus-visible,
.vformula__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.vformula__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger, var(--text-1));
  overflow-wrap: anywhere;
}

.vformula__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--warn, var(--text-2));
  overflow-wrap: anywhere;
}
</style>
