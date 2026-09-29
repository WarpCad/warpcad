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
 */
import { computed, ref, toRaw, watch } from 'vue'

import { useParamCommands } from '../../composables/useParamCommands.js'
import { paramOptions } from '../../core/kernel/registry.js'
import { useDocumentStore } from '../../stores/document.js'

const props = defineProps({
  /** The record that carries `when` — a body's creation record for a whole-body condition. */
  recordId: { type: String, required: true },
  condition: {
    type: /** @type {import('vue').PropType<import('../../core/document.js').RowCondition>} */ (Object),
    required: true,
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

/** Every value the ref's param can take — what the Edit checkboxes offer. */
const options = computed(() => {
  void documentStore.version
  const ref = toRaw(documentStore.raw).recordOf(props.condition.refId)
  if (!ref) return []
  const field = paramOptions(ref.op, ref.params ?? {})[props.condition.param]
  return field?.kind === 'enum' ? field.options : []
})

function startEdit() {
  checked.value = props.condition.values.map(String)
  error.value = null
  editing.value = true
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
  run(() =>
    paramCommands.setCondition(props.recordId, { ref: props.condition.refId, param: props.condition.param, in: values }),
  )
}

function remove() {
  run(() => paramCommands.setCondition(props.recordId, null))
}
</script>

<template>
  <section class="condition" data-testid="inspector-condition">
    <h3 class="condition__title">Condition</h3>
    <p class="condition__text" data-testid="inspector-condition-text">{{ condition.sentence }}</p>

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
        <button type="button" class="condition__btn" data-testid="inspector-condition-edit" @click="startEdit()">Edit</button>
        <button type="button" class="condition__btn" data-testid="inspector-condition-remove" @click="remove()">Remove</button>
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
