<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector's **Variables** section (`TODO/ui-059`): create, edit, rename and delete the
 * project's named values. It belongs to the project, not to a body, so it works with an empty
 * selection and is mounted in every Inspector state.
 *
 * Changing a value commits in one Undo step and states its blast radius ("piModel 4 → 5 — 3
 * parameters on 2 parts changed"); a value that would break a dependent is held and handed to
 * the repair dialog `ui-052` already has. Deleting a variable something reads opens the usage
 * dialog — there is no plain destructive delete. Every refusal shows core's reason verbatim.
 */
import { computed, ref } from 'vue'

import { VariableInUseError, useVariableCommands } from '../../composables/useVariableCommands.js'
import { useDocumentStore } from '../../stores/document.js'
import { useRepairDialogStore } from '../../stores/repairDialog.js'
import { useVariablesUiStore } from '../../stores/variablesUi.js'
import VariableAddForm from './VariableAddForm.vue'
import VariableRow from './VariableRow.vue'
import VariableUsageDialog from './VariableUsageDialog.vue'

const documentStore = useDocumentStore()
const repairDialog = useRepairDialogStore()
const ui = useVariablesUiStore()
const commands = useVariableCommands()

const adding = ref(false)
const error = ref('')
/** @type {import('vue').Ref<{ name: string, consumers: import('../../core/variables.js').VariableConsumer[], error: string } | null>} */
const usage = ref(null)

const rows = computed(() => {
  void documentStore.version
  return commands.list()
})

/** @param {() => void} action @returns {boolean} Whether it went through. */
function attempt(action) {
  error.value = ''
  try {
    action()
    return true
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
    return false
  }
}

/** @param {Record<string, any>} definition */
function onAdd(definition) {
  if (attempt(() => commands.define(/** @type {any} */ (definition)))) adding.value = false
}

/** @param {string} name @param {number | boolean | string} value */
function onSet(name, value) {
  attempt(() => {
    const result = commands.set(name, value)
    if ('needsRepair' in result) repairDialog.show({ edit: result.edit, breakages: result.breakages })
  })
}

/** @param {string} name */
function onRemove(name) {
  error.value = ''
  try {
    commands.remove(name)
  } catch (failure) {
    if (failure instanceof VariableInUseError) usage.value = { name, consumers: failure.consumers, error: '' }
    else error.value = failure instanceof Error ? failure.message : String(failure)
  }
}

function onKeep() {
  const open = usage.value
  if (!open) return
  try {
    commands.remove(open.name, { keepValues: true })
    usage.value = null
  } catch (failure) {
    open.error = failure instanceof Error ? failure.message : String(failure)
  }
}
</script>

<template>
  <section class="variables" data-testid="inspector-variables" :data-open="ui.open ? 'true' : 'false'">
    <div class="variables__bar">
      <button type="button" class="variables__toggle" :aria-expanded="ui.open" data-testid="variables-header" @click="ui.open = !ui.open">
        Variables <span class="variables__count">({{ rows.length }})</span>
      </button>
      <button type="button" class="variables__add" aria-label="Add variable" data-testid="variable-add" @click="adding = !adding; ui.open = true">+</button>
    </div>
    <template v-if="ui.open">
      <VariableAddForm v-if="adding" @submit="onAdd" @cancel="adding = false" />
      <p v-if="ui.announcement && ui.announcementVersion === documentStore.version" class="variables__note" role="status" data-testid="variable-announcement">{{ ui.announcement }}</p>
      <p v-if="error" class="variables__error" role="alert" data-testid="variable-error">{{ error }}</p>
      <ul class="variables__list">
        <VariableRow v-for="row in rows" :key="row.variable.name" :row="row" @set="onSet" @rename="(from, to) => attempt(() => commands.rename(from, to))" @remove="onRemove" />
      </ul>
      <p v-if="rows.length === 0 && !adding" class="variables__empty" data-testid="variables-empty">
        No variables yet. Tap + to add one, or bind a field from the Parameters list.
      </p>
    </template>
    <VariableUsageDialog v-if="usage" :name="usage.name" :consumers="usage.consumers" :error="usage.error" @keep="onKeep" @cancel="usage = null" />
  </section>
</template>

<style scoped>
.variables {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin-top: 6px;
}

.variables__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid var(--border);
}

.variables__toggle {
  flex: 1;
  min-height: 44px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-3);
  font: inherit;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-align: left;
  text-transform: uppercase;
  cursor: pointer;
  touch-action: manipulation;
}

.variables__count {
  font-weight: 500;
  letter-spacing: 0;
}

.variables__add {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 20px;
  cursor: pointer;
  touch-action: manipulation;
}

.variables__toggle:focus-visible,
.variables__add:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.variables__list {
  margin: 0;
  padding: 0;
}

.variables__note,
.variables__empty {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-2);
}

.variables__error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--danger, var(--text-1));
}
</style>
