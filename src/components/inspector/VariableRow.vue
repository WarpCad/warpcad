<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * One variable in the Variables section (`TODO/ui-059`): its name, an inline value editor
 * matching its kind (`NumberField`, checkbox, native dropdown), how many
 * parameters read it, and an overflow for **Rename** and **Delete**.
 *
 * A value that would break something is *held* and handed to the repair dialog by the
 * panel; this row shows it pending until the dialog decides. Every refusal is core's own
 * reason string.
 *
 * A number row also shows **Min** and **Max** under its value (`TODO/ui-140`), blank meaning
 * unbounded. A Value outside that range, a Min above the Max, or a limit the current value
 * already breaks is refused *under its own field* in plain words, before anything commits, and the
 * field goes back to what it was. Core's own check stays behind it as the backstop.
 *
 * A **formula** row (`TODO/FIND-core-078`) shows its value read-only and its formula as text
 * below, which edits on tap — `VariableFormulaView.vue`. Its **⋯** is the same Rename and Delete.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import NumberField from '../controls/NumberField.vue'
import { variableRangeEditProblem, variableRangeProblem } from '../../core/variables.js'
import { useRepairDialogStore } from '../../stores/repairDialog.js'
import { useVariablesUiStore } from '../../stores/variablesUi.js'
import VariableFormulaView from './VariableFormulaView.vue'
import BaseButton from '../controls/BaseButton.vue'
import ListRow from '../display/ListRow.vue'

const props = defineProps({
  row: {
    type: /** @type {import('vue').PropType<import('../../composables/useVariableCommands.js').VariableRowData>} */ (Object),
    required: true,
  },
})

const emit = defineEmits(['set', 'range', 'rename', 'remove'])

const ui = useVariablesUiStore()
const repairDialog = useRepairDialogStore()
const root = ref(/** @type {HTMLElement | null} */ (null))
const menu = ref(false)
const renaming = ref(false)
const newName = ref('')

const variable = computed(() => props.row.variable)

/** The value the dialog is holding for this variable, if it is. */
const held = computed(() => {
  const edit = repairDialog.edit
  return repairDialog.open && edit?.variable === variable.value.name ? edit.record?.params?.value : undefined
})

const shown = computed(() => String(held.value ?? variable.value.value))

const unit = computed(() => (variable.value.kind === 'number' ? (variable.value.unit ?? '') : ''))

/** "used by 2", and "· read by 1 formula" when formulas read it too. */
const usedText = computed(() => {
  const formulas = props.row.formulas ?? 0
  return `used by ${props.row.parameters}${formulas > 0 ? ` · read by ${formulas} formula${formulas === 1 ? '' : 's'}` : ''}`
})

/** How long "Edit variable" keeps the row lit (`TODO/ui-145`). */
const HIGHLIGHT_MS = 1500
/** True while the row is lit: an accent border and an "Editing <name>" header. */
const lit = ref(false)
let litTimer = 0

// "Edit variable" on a chip scrolls here and lights the row for 1.5 s.
watch(
  () => ui.focusName,
  async (name) => {
    if (name !== variable.value.name) return
    lit.value = true
    window.clearTimeout(litTimer)
    litTimer = window.setTimeout(() => {
      lit.value = false
    }, HIGHLIGHT_MS)
    await nextTick()
    root.value?.scrollIntoView?.({ block: 'nearest' })
    ui.focusName = ''
  },
  { immediate: true },
)

onBeforeUnmount(() => window.clearTimeout(litTimer))

/** The plain refusal shown under the field it belongs to: `value`, `min` or `max` (`TODO/ui-140`). */
const refusal = ref(/** @type {{ field: 'value' | 'min' | 'max', text: string } | null} */ (null))

// A change that arrives from outside (Undo, an agent) makes a stale refusal untrue.
watch(
  () => [variable.value.value, variable.value.min, variable.value.max],
  () => {
    refusal.value = null
  },
)

/** @param {number} value a finite number, committed once by the field */
function onNumberCommit(value) {
  const text = variableRangeProblem(variable.value, value)
  if (text !== null) {
    refusal.value = { field: 'value', text }
    return
  }
  refusal.value = null
  emit('set', variable.value.name, value)
}

/**
 * @param {'min' | 'max'} key
 * @param {number | null} limit A finite number, or `null` for a blank field (unbounded).
 */
function onRangeCommit(key, limit) {
  if ((limit ?? undefined) === variable.value[key]) return
  const text = variableRangeEditProblem(variable.value, { min: variable.value.min, max: variable.value.max, [key]: limit })
  if (text !== null) {
    refusal.value = { field: key, text }
    return
  }
  refusal.value = null
  emit('range', variable.value.name, { [key]: limit })
}

/** @param {Event} event */
function onChoice(event) {
  const raw = /** @type {HTMLSelectElement} */ (event.target).value
  const option = (variable.value.options ?? []).find((candidate) => String(candidate.value) === raw)
  if (option) emit('set', variable.value.name, option.value)
}

/** @param {Event} event */
function onFlag(event) {
  emit('set', variable.value.name, /** @type {HTMLInputElement} */ (event.target).checked)
}

function startRename() {
  menu.value = false
  newName.value = variable.value.name
  renaming.value = true
}

function commitRename() {
  const next = newName.value.trim()
  renaming.value = false
  if (next !== '' && next !== variable.value.name) emit('rename', variable.value.name, next)
}
</script>

<template>
  <li
    ref="root"
    class="vrow"
    :data-testid="`variable-row-${variable.name}`"
    :data-kind="row.formula !== undefined ? 'formula' : variable.kind"
    :data-value="String(variable.value)"
    :data-pending="held !== undefined ? 'true' : 'false'"
    :data-focused="lit ? 'true' : 'false'"
  >
    <p v-if="lit" class="vrow__editing" role="status" :data-testid="`variable-editing-${variable.name}`">Editing {{ variable.name }}</p>
    <ListRow class="vrow__head">
      <span class="vrow__name" data-testid="variable-name">{{ variable.label ? `${variable.label} · ` : '' }}{{ variable.name }}</span>
      <template #trailing>
        <span class="vrow__used" :data-testid="`variable-used-${variable.name}`">{{ usedText }}</span>
        <button type="button" class="vrow__more" :aria-expanded="menu" :aria-label="`${variable.name} actions`" :data-testid="`variable-menu-${variable.name}`" @click="menu = !menu">⋯</button>
      </template>
    </ListRow>
    <VariableFormulaView v-if="row.formula !== undefined" :row="row" />
    <div v-else class="vrow__edit">
      <label v-if="variable.kind === 'boolean'" class="vrow__check">
        <input type="checkbox" :checked="held !== undefined ? Boolean(held) : Boolean(variable.value)" :data-testid="`variable-value-${variable.name}`" @change="onFlag" />
        {{ variable.value ? 'yes' : 'no' }}
      </label>
      <select v-else-if="variable.kind === 'enum'" class="vrow__input vrow__input--select" :value="shown" :aria-label="`${variable.name} value`" :data-testid="`variable-value-${variable.name}`" @change="onChoice">
        <option v-for="option in variable.options" :key="String(option.value)" :value="String(option.value)">{{ option.label }}</option>
      </select>
      <template v-else>
        <NumberField class="vrow__input" :unit="unit === 'mm' || unit === 'deg' ? unit : ''" :model-value="Number(held ?? variable.value)" :aria-label="`${variable.name} value`" :data-testid="`variable-value-${variable.name}`" @update:model-value="onNumberCommit" />
        <span v-if="unit" class="vrow__unit">{{ unit }}</span>
      </template>
    </div>
    <p v-if="refusal?.field === 'value'" class="vrow__error" role="alert" :data-testid="`variable-value-error-${variable.name}`">{{ refusal.text }}</p>
    <div v-if="row.formula === undefined && variable.kind === 'number'" class="vrow__range">
      <label class="vrow__limit">Min
        <NumberField class="vrow__input" nullable placeholder="none" :unit="unit === 'mm' || unit === 'deg' ? unit : ''" :invalid="refusal?.field === 'min'" :model-value="variable.min ?? null" :aria-label="`${variable.name} minimum`" :data-testid="`variable-min-${variable.name}`" @update:model-value="(/** @type {number | null} */ limit) => onRangeCommit('min', limit)" />
      </label>
      <label class="vrow__limit">Max
        <NumberField class="vrow__input" nullable placeholder="none" :unit="unit === 'mm' || unit === 'deg' ? unit : ''" :invalid="refusal?.field === 'max'" :model-value="variable.max ?? null" :aria-label="`${variable.name} maximum`" :data-testid="`variable-max-${variable.name}`" @update:model-value="(/** @type {number | null} */ limit) => onRangeCommit('max', limit)" />
      </label>
    </div>
    <p v-if="refusal && refusal.field !== 'value'" class="vrow__error" role="alert" :data-testid="`variable-${refusal.field}-error-${variable.name}`">{{ refusal.text }}</p>
    <div v-if="renaming" class="vrow__rename">
      <input v-model="newName" class="vrow__input" type="text" autocapitalize="off" spellcheck="false" :aria-label="`New name for ${variable.name}`" :data-testid="`variable-rename-input-${variable.name}`" @keydown.enter.prevent="commitRename" />
      <BaseButton narrow :data-testid="`variable-rename-save-${variable.name}`" @click="commitRename">Rename</BaseButton>
      <BaseButton narrow @click="renaming = false">Cancel</BaseButton>
    </div>
    <div v-if="menu" class="vrow__menu" role="menu">
      <BaseButton narrow role="menuitem" :data-testid="`variable-rename-${variable.name}`" @click="startRename">Rename</BaseButton>
      <BaseButton narrow role="menuitem" :data-testid="`variable-delete-${variable.name}`" @click="menu = false; emit('remove', variable.name)">Delete</BaseButton>
    </div>
  </li>
</template>

<style scoped>
.vrow {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border);
  list-style: none;
}

.vrow[data-focused='true'] {
  /* "Edit variable" landed here: the border is inset so the row does not shift (TODO/ui-145). */
  border: 1.5px solid var(--accent);
  border-radius: var(--radius-sm);
  padding-right: var(--space-3);
  padding-left: var(--space-3);
}

.vrow__editing {
  margin: 0;
  font-size: var(--text-size-xs);
  font-weight: var(--weight-medium);
  color: var(--accent);
}

.vrow__head,
.vrow__edit,
.vrow__rename {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.vrow__head :deep(.list-row__main) {
  /* The name and the ⋯ button share the room left by the usage text, as they did before ListRow. */
  flex: 1;
}

.vrow__name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-size-md);
  font-weight: var(--weight-medium);
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.vrow__used {
  font-size: var(--text-size-xs);
  color: var(--text-3);
  white-space: nowrap;
}

.vrow__more,

.vrow__input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: var(--text-size-xl);
}

.vrow__input--select {
  font-family: inherit;
}

.vrow__check {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 44px;
  font-size: var(--text-size-md);
}

.vrow__check input {
  width: 20px;
  height: 20px;
  accent-color: var(--accent);
}

.vrow__range {
  display: flex;
  gap: var(--space-3);
  min-width: 0;
}

.vrow__limit {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
  font-size: var(--text-size-xs);
  color: var(--text-3);
}

.vrow__error {
  margin: 0;
  font-size: var(--text-size-sm);
  color: var(--danger);
}

.vrow__unit {
  font-family: var(--font-mono);
  font-size: var(--text-size-xs);
  color: var(--text-3);
}

.vrow__menu {
  display: flex;
  gap: var(--space-3);
}

.vrow[data-pending='true'] .vrow__input {
  border-style: dashed;
  border-color: var(--warn);
}

.vrow__more:focus-visible,
.vrow__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
