<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **+** form of the Variables section (`TODO/ui-059`): a name, a kind, an initial value
 * and, for a choice, its options as a comma-separated list. It only parses what was typed;
 * core's `defineVariable` judges the name, kind, range and options, and its reason is what
 * the panel shows.
 */
import { ref } from 'vue'

import { parseNumeric } from '../../composables/numericEntry.js'
import { parseOptionList } from '../../composables/variableEntry.js'

const emit = defineEmits(['submit', 'cancel'])

const name = ref('')
const kind = ref(/** @type {'number' | 'boolean' | 'enum'} */ ('number'))
const value = ref('0')
const unit = ref('mm')
const flag = ref(false)
const options = ref('')

function submit() {
  /** @type {Record<string, any>} */
  const definition = { name: name.value.trim(), kind: kind.value }
  if (kind.value === 'number') {
    definition.value = parseNumeric(value.value) ?? Number.NaN
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
      </select>
    </label>
    <label v-if="kind === 'number'" class="vadd__field">Value
      <input v-model="value" class="vadd__input" type="text" inputmode="decimal" data-testid="variable-add-value" />
    </label>
    <label v-if="kind === 'number'" class="vadd__field">Unit
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
      <button type="submit" class="vadd__btn vadd__btn--primary" data-testid="variable-add-create">Add variable</button>
      <button type="button" class="vadd__btn" data-testid="variable-add-cancel" @click="emit('cancel')">Cancel</button>
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
  font-size: 12px;
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
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 16px;
}

.vadd__actions {
  display: flex;
  gap: 6px;
}

.vadd__btn {
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

.vadd__btn--primary {
  border-color: var(--accent);
}

.vadd__input:focus-visible,
.vadd__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
