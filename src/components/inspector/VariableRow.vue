<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * One variable in the Variables section (`TODO/ui-059`): its name, an inline value editor
 * matching its kind (number input via `numericEntry.js`, checkbox, native dropdown), how many
 * parameters read it, and an overflow for **Rename** and **Delete**.
 *
 * A value that would break something is *held* and handed to the repair dialog by the
 * panel; this row shows it pending until the dialog decides. Every refusal is core's own
 * reason string.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { parseNumeric } from '../../composables/numericEntry.js'
import { useRepairDialogStore } from '../../stores/repairDialog.js'
import { useVariablesUiStore } from '../../stores/variablesUi.js'

const props = defineProps({
  row: {
    type: /** @type {import('vue').PropType<import('../../composables/useVariableCommands.js').VariableRowData>} */ (Object),
    required: true,
  },
})

const emit = defineEmits(['set', 'rename', 'remove'])

const ui = useVariablesUiStore()
const repairDialog = useRepairDialogStore()
const root = ref(/** @type {HTMLElement | null} */ (null))
const menu = ref(false)
const renaming = ref(false)
const newName = ref('')
const typed = ref(/** @type {string | null} */ (null))

const variable = computed(() => props.row.variable)

/** The value the dialog is holding for this variable, if it is. */
const held = computed(() => {
  const edit = repairDialog.edit
  return repairDialog.open && edit?.variable === variable.value.name ? edit.record?.params?.value : undefined
})

const shown = computed(() => {
  if (typed.value !== null) return typed.value
  return String(held.value ?? variable.value.value)
})

const unit = computed(() => (variable.value.kind === 'number' ? (variable.value.unit ?? '') : ''))

// "Edit variable" on a chip scrolls here and lights the row until the next interaction.
watch(
  () => ui.focusName,
  async (name) => {
    if (name !== variable.value.name) return
    await nextTick()
    root.value?.scrollIntoView?.({ block: 'nearest' })
    ui.focusName = ''
  },
  { immediate: true },
)

/** @param {Event} event */
function onNumberCommit(event) {
  const parsed = parseNumeric(/** @type {HTMLInputElement} */ (event.target).value)
  typed.value = null
  if (parsed !== null) emit('set', variable.value.name, parsed)
}

/** @param {Event} event */
function onChoice(event) {
  const raw = /** @type {HTMLSelectElement} */ (event.target).value
  const option = (variable.value.options ?? []).find((candidate) => String(candidate.value) === raw)
  if (option) emit('set', variable.value.name, option.value)
}

/** @param {Event} event */
function onNumberFocus(event) {
  typed.value = /** @type {HTMLInputElement} */ (event.target).value
}

/** @param {Event} event */
function onNumberEnter(event) {
  /** @type {HTMLInputElement} */ (event.target).blur()
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
    :data-kind="variable.kind"
    :data-value="String(variable.value)"
    :data-pending="held !== undefined ? 'true' : 'false'"
  >
    <div class="vrow__head">
      <span class="vrow__name" data-testid="variable-name">{{ variable.label ? `${variable.label} · ` : '' }}{{ variable.name }}</span>
      <span class="vrow__used" :data-testid="`variable-used-${variable.name}`">used by {{ row.parameters }}</span>
      <button type="button" class="vrow__more" :aria-expanded="menu" :aria-label="`${variable.name} actions`" :data-testid="`variable-menu-${variable.name}`" @click="menu = !menu">⋯</button>
    </div>
    <div class="vrow__edit">
      <label v-if="variable.kind === 'boolean'" class="vrow__check">
        <input type="checkbox" :checked="held !== undefined ? Boolean(held) : Boolean(variable.value)" :data-testid="`variable-value-${variable.name}`" @change="onFlag" />
        {{ variable.value ? 'yes' : 'no' }}
      </label>
      <select v-else-if="variable.kind === 'enum'" class="vrow__input vrow__input--select" :value="shown" :aria-label="`${variable.name} value`" :data-testid="`variable-value-${variable.name}`" @change="onChoice">
        <option v-for="option in variable.options" :key="String(option.value)" :value="String(option.value)">{{ option.label }}</option>
      </select>
      <template v-else>
        <input class="vrow__input" type="text" inputmode="decimal" :value="shown" :aria-label="`${variable.name} value`" :data-testid="`variable-value-${variable.name}`" @focus="onNumberFocus" @blur="onNumberCommit" @keydown.enter.prevent="onNumberEnter" />
        <span v-if="unit" class="vrow__unit">{{ unit }}</span>
      </template>
    </div>
    <div v-if="renaming" class="vrow__rename">
      <input v-model="newName" class="vrow__input" type="text" autocapitalize="off" spellcheck="false" :aria-label="`New name for ${variable.name}`" :data-testid="`variable-rename-input-${variable.name}`" @keydown.enter.prevent="commitRename" />
      <button type="button" class="vrow__btn" :data-testid="`variable-rename-save-${variable.name}`" @click="commitRename">Rename</button>
      <button type="button" class="vrow__btn" @click="renaming = false">Cancel</button>
    </div>
    <div v-if="menu" class="vrow__menu" role="menu">
      <button type="button" class="vrow__btn" role="menuitem" :data-testid="`variable-rename-${variable.name}`" @click="startRename">Rename</button>
      <button type="button" class="vrow__btn" role="menuitem" :data-testid="`variable-delete-${variable.name}`" @click="menu = false; emit('remove', variable.name)">Delete</button>
    </div>
  </li>
</template>

<style scoped>
.vrow {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  list-style: none;
}

.vrow__head,
.vrow__edit,
.vrow__rename {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.vrow__name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.vrow__used {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}

.vrow__more,
.vrow__btn {
  min-width: 44px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.vrow__input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 4px 8px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 16px;
}

.vrow__input--select {
  font-family: inherit;
}

.vrow__check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  font-size: 13px;
}

.vrow__check input {
  width: 20px;
  height: 20px;
  accent-color: var(--accent);
}

.vrow__unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.vrow__menu {
  display: flex;
  gap: 6px;
}

.vrow[data-pending='true'] .vrow__input {
  border-style: dashed;
  border-color: var(--warn, var(--accent));
}

.vrow__more:focus-visible,
.vrow__btn:focus-visible,
.vrow__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
