<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector's **Condition** row (`TODO/ui-052`): *"Only when Raspberry Pi 1's Model is
 * Pi 4"*, visible and editable rather than buried in the record.
 *
 * - **Edit** turns the one value into a set of checkboxes over the ref's options — "Pi 3 or
 *   Pi 4" — committed as one Undo step.
 * - **Remove** makes the body always active again. Removing it while the condition is false
 *   brings back the original problem (a snap onto a jack the board does not have) as a
 *   *broken* dependent with its warning banner — restored, never hidden
 *   (`useParamCommands().setCondition`).
 *
 * Shown for a selected body that carries a condition, and for an **inactive** body selected
 * from the object list — the only way to reach one, since it is not drawn.
 *
 * ## A condition can read a project variable (`TODO/ui-059`)
 *
 * Edit gains a **Based on** choice next to the body-parameter one: any choice or yes/no
 * variable, backed by `core-050`'s `{ var, in }`. A variable condition has no ref body — core
 * reports `refId: ''` — so this row branches on `condition.var`. A body with **no** condition
 * gets **Only when a variable…** when the project has such a variable; that is how the Pi
 * example's cut-out is made to exist only on a Pi 4.
 */
import { computed, ref, toRaw, watch } from 'vue'

import { useParamCommands } from '../../composables/useParamCommands.js'
import { paramOptions } from '../../core/kernel/registry.js'
import { variablesOf } from '../../core/variables.js'
import { useDocumentStore } from '../../stores/document.js'

const props = defineProps({
  /** The record that carries `when` — a body's creation record for a whole-body condition. */
  recordId: { type: String, required: true },
  /** `null`: the body has none — the row offers to add a variable condition. */
  condition: {
    type: /** @type {import('vue').PropType<import('../../core/document.js').RowCondition | null>} */ (Object),
    default: null,
  },
})

const documentStore = useDocumentStore()
const paramCommands = useParamCommands()

const editing = ref(false)
/** @type {import('vue').Ref<string[]>} Checked options, as `String(value)`. */
const checked = ref(/** @type {string[]} */ ([]))
const error = ref(/** @type {string | null} */ (null))

watch(
  () => props.recordId,
  () => {
    editing.value = false
    error.value = null
  },
)

/** Choice and yes/no variables a condition can read. */
const variables = computed(() => {
  void documentStore.version
  return variablesOf(toRaw(documentStore.raw)).filter((variable) => variable.kind !== 'number')
})

/** What the Edit form reads: `ref` (the body parameter) or `var:<name>`. */
const source = ref('ref')

const sourceVariable = computed(() =>
  source.value.startsWith('var:') ? variables.value.find((variable) => variable.name === source.value.slice(4)) : undefined,
)

/** Every value the chosen source can take — what the Edit checkboxes offer. */
const options = computed(() => {
  void documentStore.version
  const variable = sourceVariable.value
  if (variable !== undefined) {
    return variable.kind === 'boolean'
      ? [{ value: true, label: 'yes' }, { value: false, label: 'no' }]
      : [...(variable.options ?? [])]
  }
  if (!props.condition) return []
  const ref = toRaw(documentStore.raw).recordOf(props.condition.refId)
  if (!ref) return []
  const field = paramOptions(ref.op, ref.params ?? {})[props.condition.param]
  return field?.kind === 'enum' ? field.options : []
})

function startEdit() {
  const current = props.condition
  source.value = current?.var !== undefined ? `var:${current.var}` : current ? 'ref' : `var:${variables.value[0]?.name ?? ''}`
  checked.value = (current?.values ?? []).map(String)
  if (checked.value.length === 0 && sourceVariable.value) checked.value = [String(sourceVariable.value.value)]
  error.value = null
  editing.value = true
}

/** Switching what the condition reads starts from that variable's current value. */
function onSourceChange() {
  const variable = sourceVariable.value
  checked.value = variable ? [String(variable.value)] : (props.condition?.values ?? []).map(String)
}

/** @param {() => void} action */
function run(action) {
  error.value = null
  try {
    action()
    editing.value = false
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  }
}

function save() {
  const values = options.value.filter((option) => checked.value.includes(String(option.value))).map((option) => option.value)
  if (values.length === 0) {
    error.value = 'Choose at least one option, or Remove the condition.'
    return
  }
  const variable = sourceVariable.value
  if (variable !== undefined) {
    run(() => paramCommands.setCondition(props.recordId, { var: variable.name, in: values }))
    return
  }
  if (!props.condition) return
  const { refId, param } = props.condition
  run(() => paramCommands.setCondition(props.recordId, { ref: refId, param, in: values }))
}

function remove() {
  run(() => paramCommands.setCondition(props.recordId, null))
}
</script>

<template>
  <section v-if="condition || variables.length > 0" class="condition" data-testid="inspector-condition">
    <h3 class="condition__title">Condition</h3>
    <p v-if="condition" class="condition__text" data-testid="inspector-condition-text">{{ condition.sentence }}</p>
    <p v-else class="condition__text condition__text--none" data-testid="inspector-condition-none">Always built.</p>

    <label v-if="editing && variables.length > 0" class="condition__source">
      Based on
      <select v-model="source" class="condition__select" data-testid="inspector-condition-source" @change="onSourceChange">
        <option v-if="condition && condition.var === undefined" value="ref">The {{ condition.param }} of the part it reads</option>
        <option v-for="variable in variables" :key="variable.name" :value="`var:${variable.name}`">Variable {{ variable.name }}</option>
      </select>
    </label>

    <fieldset v-if="editing" class="condition__edit" data-testid="inspector-condition-options">
      <legend class="condition__legend">Keep this only when it is one of</legend>
      <label v-for="option in options" :key="String(option.value)" class="condition__option">
        <input
          v-model="checked"
          type="checkbox"
          :value="String(option.value)"
          :data-testid="`inspector-condition-option-${option.value}`"
        />
        {{ option.label }}
      </label>
    </fieldset>

    <div class="condition__actions">
      <template v-if="editing">
        <button type="button" class="condition__btn condition__btn--primary" data-testid="inspector-condition-save" @click="save()">
          Save
        </button>
        <button type="button" class="condition__btn" data-testid="inspector-condition-cancel" @click="editing = false">
          Cancel
        </button>
      </template>
      <template v-else>
        <button v-if="condition" type="button" class="condition__btn" data-testid="inspector-condition-edit" @click="startEdit()">Edit</button>
        <button v-else type="button" class="condition__btn" data-testid="inspector-condition-add" @click="startEdit()">Only when a variable…</button>
        <button v-if="condition" type="button" class="condition__btn" data-testid="inspector-condition-remove" @click="remove()">Remove</button>
      </template>
    </div>
    <p v-if="error" class="condition__error" role="alert" data-testid="inspector-condition-error">{{ error }}</p>
  </section>
</template>

<style scoped>
.condition {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.condition__title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
}

.condition__text {
  margin: 0 0 6px;
  font-size: 13px;
  color: var(--text-1);
}

.condition__source {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--text-2);
}

.condition__select {
  min-height: 44px;
  padding: 4px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 16px;
}

.condition__text--none {
  color: var(--text-3);
}

.condition__edit {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0 0 6px;
  padding: 4px 0;
  border: 0;
}

.condition__legend {
  padding: 0;
  font-size: 12px;
  color: var(--text-2);
}

.condition__option {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  font-size: 13px;
}

.condition__actions {
  display: flex;
  gap: 6px;
}

.condition__btn {
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.condition__btn--primary {
  border-color: var(--accent);
}

.condition__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.condition__error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
