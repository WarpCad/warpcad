<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **+** form of the Variables section (`TODO/ui-059`): a name, a kind, an initial value
 * and, for a choice, its options as a comma-separated list. It only parses what was typed;
 * core's `defineVariable` judges the name, kind, range and options, and its reason is what
 * the panel shows.
 *
 * **Formula** (`TODO/FIND-core-078`) swaps the value for a formula box with **Insert…** and a
 * preview line; **Create** stays disabled while the preview shows an error (or the box is
 * empty). It submits `{ kind: 'formula', name, formula, unit }`, which the panel hands to
 * `defineFormula`. The preview writes nothing.
 */
import { computed, ref } from 'vue'

import { useVariableCommands } from '../../composables/useVariableCommands.js'
import { formulaPreviewLine, parseOptionList } from '../../composables/variableEntry.js'
import NumberField from '../controls/NumberField.vue'
import FormulaEditor from './FormulaEditor.vue'
import BaseButton from '../controls/BaseButton.vue'

const emit = defineEmits(['submit', 'cancel'])

const commands = useVariableCommands()

const name = ref('')
const kind = ref(/** @type {'number' | 'boolean' | 'enum' | 'formula'} */ ('number'))
const value = ref(0)
const unit = ref('mm')
const flag = ref(false)
const options = ref('')
const formula = ref('')

const preview = computed(() => formulaPreviewLine(commands.previewFormula(formula.value), unit.value))
const blocked = computed(() => kind.value === 'formula' && !preview.value.ok)

function submit() {
  if (blocked.value) return
  if (kind.value === 'formula') {
    /** @type {Record<string, any>} */
    const definition = { kind: 'formula', name: name.value.trim(), formula: formula.value }
    if (unit.value !== '') definition.unit = unit.value
    emit('submit', definition)
    return
  }
  /** @type {Record<string, any>} */
  const definition = { name: name.value.trim(), kind: kind.value }
  if (kind.value === 'number') {
    definition.value = value.value
    if (unit.value !== '') definition.unit = unit.value
  } else if (kind.value === 'boolean') {
    definition.value = flag.value
  } else {
    const list = parseOptionList(options.value)
    definition.options = list
    definition.value = list[0]?.value
  }
  emit('submit', definition)
}
</script>

<template>
  <form class="vadd" data-testid="variable-add-form" @submit.prevent="submit">
    <label class="vadd__field">Name
      <input v-model="name" class="vadd__input" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" data-testid="variable-add-name" />
    </label>
    <label class="vadd__field">Kind
      <select v-model="kind" class="vadd__input" data-testid="variable-add-kind">
        <option value="number">Number</option>
        <option value="boolean">Yes / no</option>
        <option value="enum">Choice</option>
        <option value="formula">Formula</option>
      </select>
    </label>
    <div v-if="kind === 'formula'" class="vadd__field">Formula
      <FormulaEditor v-model="formula" :preview="preview" label="Formula" @enter="submit" />
    </div>
    <label v-if="kind === 'number'" class="vadd__field">Value
      <NumberField v-model="value" class="vadd__input" :unit="unit === 'mm' || unit === 'deg' ? unit : ''" live data-testid="variable-add-value" />
    </label>
    <label v-if="kind === 'number' || kind === 'formula'" class="vadd__field">Unit
      <select v-model="unit" class="vadd__input" data-testid="variable-add-unit">
        <option value="mm">mm</option>
        <option value="deg">deg</option>
        <option value="">none</option>
      </select>
    </label>
    <label v-if="kind === 'boolean'" class="vadd__check"><input v-model="flag" type="checkbox" data-testid="variable-add-flag" /> Starts as yes</label>
    <label v-if="kind === 'enum'" class="vadd__field">Choices, comma separated
      <input v-model="options" class="vadd__input" type="text" autocapitalize="off" placeholder="4, 5" data-testid="variable-add-options" />
    </label>
    <div class="vadd__actions">
      <BaseButton type="submit" variant="primary" narrow :disabled="blocked" data-testid="variable-add-create">{{ kind === 'formula' ? 'Create' : 'Add variable' }}</BaseButton>
      <BaseButton narrow data-testid="variable-add-cancel" @click="emit('cancel')">Cancel</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.vadd {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.vadd__field,
.vadd__check {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.vadd__check {
  flex-direction: row;
  align-items: center;
  min-height: 44px;
}

.vadd__input {
  min-height: 44px;
  padding: 4px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: var(--text-size-xl);
}

.vadd__actions {
  display: flex;
  gap: 6px;
}

.vadd__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
