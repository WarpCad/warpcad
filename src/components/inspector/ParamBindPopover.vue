<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * What the bind button opens (`TODO/ui-059`): the **compatible** variables for one field,
 * and, first, **New variable from this value…** — which creates a variable seeded with the
 * field's current value (and, for a choice, its options) and binds it as one Undo step.
 *
 * A number field also offers **New formula from this value…** (`param-bind-new-formula`,
 * `TODO/FIND-core-078`): a name and a formula box seeded with the field's current number, its
 * preview, and **Create and bind** — the formula and its binding as one Undo step. Formulas are
 * listed beside other number variables, with their value. A formula this row cannot read (a
 * body not built until later) is core's refusal, shown here instead of binding.
 *
 * Tap-driven, no hover state anywhere. At phone width it is a non-modal `BaseSheet` (a bottom
 * sheet that Escape closes, `TODO/ui-116`); wider, it opens inline under the field. Every refusal is core's own
 * reason string, shown as-is — nothing about what may be bound is decided here.
 */
import { computed, ref } from 'vue'

import { formulaPreviewLine, seedDefinition, seedFormulaText, suggestVariableName } from '../../composables/variableEntry.js'
import { useMediaQuery } from '../../composables/useMediaQuery.js'
import { useVariableCommands } from '../../composables/useVariableCommands.js'
import { useDocumentStore } from '../../stores/document.js'
import { useVariablesUiStore } from '../../stores/variablesUi.js'
import BaseButton from '../controls/BaseButton.vue'
import BaseSheet from '../layout/BaseSheet.vue'
import FormulaEditor from './FormulaEditor.vue'

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

/** At phone width the frame is a non-modal `BaseSheet` (`TODO/ui-116`); wider it is the inline box. */
const isPhone = useMediaQuery('(max-width: 640px)')
const frame = computed(() => (isPhone.value ? BaseSheet : 'div'))
const frameProps = computed(() =>
  isPhone.value
    ? { open: true, testid: 'param-bind-popover', title: `Bind ${props.label} to a variable`, tier: 'popover', onEscape: () => (ui.popoverKey = '') }
    : { 'data-testid': 'param-bind-popover', role: 'group', 'aria-label': `Bind ${props.label} to a variable`, class: 'bind--inline' },
)

const naming = ref(false)
const name = ref('')
const error = ref('')
/** **New formula from this value…** is open (`TODO/FIND-core-078`). */
const formulaMode = ref(false)
const formulaText = ref('')
/** A formula's unit label: the field's, when it is one a formula can carry. */
const formulaUnit = computed(() => {
  const unit = props.unit !== '' ? props.unit : (props.bindSlot.unit ?? '')
  return unit === 'mm' || unit === 'deg' ? unit : ''
})
const formulaPreview = computed(() => formulaPreviewLine(formulaMode.value ? commands.previewFormula(formulaText.value) : null, formulaUnit.value))

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

function startNewFormula() {
  const taken = commands.list().map((row) => row.variable.name)
  name.value = suggestVariableName(props.label, taken)
  formulaText.value = seedFormulaText(props.value)
  formulaMode.value = true
  error.value = ''
}

function createFormula() {
  if (!formulaPreview.value.ok) return
  /** @type {Record<string, any>} */
  const definition = { name: name.value.trim(), formula: formulaText.value }
  if (formulaUnit.value !== '') definition.unit = formulaUnit.value
  attempt(() => commands.bindToNewFormula(props.recordId, props.path, /** @type {any} */ (definition)))
}

function create() {
  const definition = seedDefinition(props.bindSlot, props.value, { name: name.value.trim(), unit: props.unit })
  attempt(() => commands.bindToNew(props.recordId, props.path, /** @type {any} */ (definition)))
}
</script>

<template>
  <component :is="frame" v-bind="frameProps" class="bind">
    <p class="bind__title">Bind {{ label }} to a variable</p>
    <div v-if="naming" class="bind__new">
      <label class="bind__label" for="bind-new-name">Name</label>
      <input id="bind-new-name" v-model="name" class="bind__input" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" data-testid="param-bind-new-name" @keydown.enter.prevent="create" />
      <div class="bind__actions">
        <BaseButton variant="primary" align="start" class="bind__btn" data-testid="param-bind-new-create" @click="create">Create and bind</BaseButton>
        <BaseButton align="start" class="bind__btn" data-testid="param-bind-new-cancel" @click="naming = false">Back</BaseButton>
      </div>
    </div>
    <div v-else-if="formulaMode" class="bind__new" data-testid="param-bind-formula-form">
      <label class="bind__label" for="bind-new-formula-name">Name</label>
      <input id="bind-new-formula-name" v-model="name" class="bind__input" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" data-testid="param-bind-new-formula-name" />
      <span class="bind__label">Formula</span>
      <FormulaEditor v-model="formulaText" :preview="formulaPreview" :label="`Formula for ${label}`" @enter="createFormula" />
      <div class="bind__actions">
        <BaseButton variant="primary" align="start" class="bind__btn" :disabled="!formulaPreview.ok" data-testid="param-bind-new-formula-create" @click="createFormula">Create and bind</BaseButton>
        <BaseButton align="start" class="bind__btn" data-testid="param-bind-new-formula-cancel" @click="formulaMode = false">Back</BaseButton>
      </div>
    </div>
    <ul v-else class="bind__list">
      <li><BaseButton variant="primary" align="start" class="bind__btn" data-testid="param-bind-new" @click="startNew">New variable from this value…</BaseButton></li>
      <li v-if="bindSlot.kind === 'number'"><BaseButton variant="primary" align="start" class="bind__btn" data-testid="param-bind-new-formula" @click="startNewFormula">New formula from this value…</BaseButton></li>
      <li v-for="row in compatible" :key="row.variable.name">
        <BaseButton align="start" class="bind__btn" :data-testid="`param-bind-option-${row.variable.name}`" @click="attempt(() => commands.bind(recordId, path, row.variable.name))">
          {{ row.variable.name }} <span class="bind__value">{{ row.valueLabel }}</span>
          <span v-if="row.formula !== undefined" class="bind__formula">= {{ row.formula }}</span>
        </BaseButton>
      </li>
      <li v-if="compatible.length === 0" class="bind__empty" data-testid="param-bind-empty">No variable of this kind yet.</li>
    </ul>
    <p v-if="error" class="bind__error" role="alert" data-testid="param-bind-error">{{ error }}</p>
    <BaseButton align="start" class="bind__btn" data-testid="param-bind-close" @click="ui.popoverKey = ''">Close</BaseButton>
  </component>
</template>

<style scoped>
.bind {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* The inline box under the field; the phone sheet's frame is `BaseSheet`'s. */
.bind--inline {
  padding: 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.bind__title {
  margin: 0;
  font-size: var(--text-size-sm);
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

/* Layout only: the option rows and the action pairs fill the popover's width. The look is `BaseButton`'s. */
.bind__btn {
  width: 100%;
}

.bind__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.bind__formula {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--text-size-xs);
  color: var(--text-3);
  overflow-wrap: anywhere;
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
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.bind__input {
  min-height: 44px;
  padding: 4px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: var(--text-size-xl);
}

.bind__actions {
  display: flex;
  gap: 6px;
}

.bind__empty {
  font-size: var(--text-size-sm);
  color: var(--text-3);
}

.bind__error {
  margin: 0;
  font-size: var(--text-size-sm);
  color: var(--danger);
}
</style>
