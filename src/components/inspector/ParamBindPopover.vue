<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * What the bind button opens (`TODO/ui-059`): the **compatible** variables for one field,
 * and, first, **New variable from this value…** — which creates a variable seeded with the
 * field's current value (and, for a choice, its options) and binds it as one Undo step.
 *
 * Tap-driven, no hover state anywhere. At phone width it is a bottom sheet of its own
 * (`position: fixed`); wider, it opens inline under the field. Every refusal is core's own
 * reason string, shown as-is — nothing about what may be bound is decided here.
 */
import { computed, ref } from 'vue'

import { seedDefinition, suggestVariableName } from '../../composables/variableEntry.js'
import { useVariableCommands } from '../../composables/useVariableCommands.js'
import { useDocumentStore } from '../../stores/document.js'
import { useVariablesUiStore } from '../../stores/variablesUi.js'

const props = defineProps({
  recordId: { type: String, required: true },
  /** `model`, `size.0`. */
  path: { type: String, required: true },
  bindSlot: {
    type: /** @type {import('vue').PropType<import('../../core/variables.js').BindableSlot>} */ (Object),
    required: true,
  },
  label: { type: String, required: true },
  /** The slot's current resolved value — what a new variable is seeded with. */
  value: { type: [Number, String, Boolean], default: 0 },
  unit: { type: String, default: '' },
})

const commands = useVariableCommands()
const ui = useVariablesUiStore()
const documentStore = useDocumentStore()

const naming = ref(false)
const name = ref('')
const error = ref('')

/** Variables of the kind this field takes — core refuses anything else by name anyway. */
const compatible = computed(() => {
  void documentStore.version
  return commands.list().filter((row) => row.variable.kind === props.bindSlot.kind)
})

function startNew() {
  const taken = commands.list().map((row) => row.variable.name)
  name.value = suggestVariableName(props.label, taken)
  naming.value = true
  error.value = ''
}

/** @param {() => void} action */
function attempt(action) {
  error.value = ''
  try {
    action()
    ui.popoverKey = ''
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  }
}

function create() {
  const definition = seedDefinition(props.bindSlot, props.value, { name: name.value.trim(), unit: props.unit })
  attempt(() => commands.bindToNew(props.recordId, props.path, /** @type {any} */ (definition)))
}
</script>

<template>
  <div class="bind" data-testid="param-bind-popover" role="group" :aria-label="`Bind ${label} to a variable`">
    <p class="bind__title">Bind {{ label }} to a variable</p>
    <div v-if="naming" class="bind__new">
      <label class="bind__label" for="bind-new-name">Name</label>
      <input id="bind-new-name" v-model="name" class="bind__input" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" data-testid="param-bind-new-name" @keydown.enter.prevent="create" />
      <div class="bind__actions">
        <button type="button" class="bind__btn bind__btn--primary" data-testid="param-bind-new-create" @click="create">Create and bind</button>
        <button type="button" class="bind__btn" data-testid="param-bind-new-cancel" @click="naming = false">Back</button>
      </div>
    </div>
    <ul v-else class="bind__list">
      <li><button type="button" class="bind__btn bind__btn--primary" data-testid="param-bind-new" @click="startNew">New variable from this value…</button></li>
      <li v-for="row in compatible" :key="row.variable.name">
        <button type="button" class="bind__btn" :data-testid="`param-bind-option-${row.variable.name}`" @click="attempt(() => commands.bind(recordId, path, row.variable.name))">
          {{ row.variable.name }} <span class="bind__value">{{ row.valueLabel }}</span>
        </button>
      </li>
      <li v-if="compatible.length === 0" class="bind__empty" data-testid="param-bind-empty">No variable of this kind yet.</li>
    </ul>
    <p v-if="error" class="bind__error" role="alert" data-testid="param-bind-error">{{ error }}</p>
    <button type="button" class="bind__btn bind__close" data-testid="param-bind-close" @click="ui.popoverKey = ''">Close</button>
  </div>
</template>

<style scoped>
.bind {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.bind__title {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.bind__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bind__btn {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.bind__btn--primary {
  border-color: var(--accent);
}

.bind__btn:focus-visible,
.bind__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.bind__value {
  margin-left: 6px;
  font-family: var(--font-mono);
  color: var(--text-3);
}

.bind__new {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bind__label {
  font-size: 12px;
  color: var(--text-2);
}

.bind__input {
  min-height: 44px;
  padding: 4px 8px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 16px;
}

.bind__actions {
  display: flex;
  gap: 6px;
}

.bind__empty {
  font-size: 12px;
  color: var(--text-3);
}

.bind__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger, var(--text-1));
}

@media (max-width: 640px) {
  .bind {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 40;
    max-height: 60vh;
    overflow-y: auto;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    border-radius: var(--radius-md, 10px) var(--radius-md, 10px) 0 0;
    box-shadow: var(--shadow-overlay);
  }
}
</style>
