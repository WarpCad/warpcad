<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector's **Parameters** section, split out of `Inspector.vue` by `TODO/ui-052`
 * (the panel was ~1,700 lines, past CLAUDE.md's "extract any panel over ~30 template
 * lines" rule, and this task was adding the most to it).
 *
 * - A primitive's numbers: `ui-029`'s append-path fields, unchanged.
 * - A **composite**'s params (`ui-052`): a catalogue choice — a Pi's Model, a bolt's spec
 *   and fit — is a native `<select>` fed by the registry's `paramOptions`, committed on
 *   `change`; its numbers (a bolt's length, a Pi's clearance) are ordinary fields. Native
 *   on purpose: iOS/iPadOS render it as the system wheel picker, the best touch control
 *   there is, for free.
 * - A change that would break a dependent is **held**: the select shows the new value in
 *   a pending state and the repair dialog (`DependentRepairDialog.vue`, driven through
 *   `stores/repairDialog.js`) decides. Cancel snaps the select back.
 * - While drilled into one part of a composite, the parent's params show read-only with
 *   a one-tap way back up to the whole body — a part has no model of its own to change.
 */
import { computed, ref, watch } from 'vue'

import { parseNumeric } from '../../composables/numericEntry.js'
import { useParamCommands } from '../../composables/useParamCommands.js'
import { hasEditableParams, paramOptions } from '../../core/kernel/registry.js'
import { formatMmValue } from '../../core/units.js'
import { useDocumentStore } from '../../stores/document.js'
import { useRepairDialogStore } from '../../stores/repairDialog.js'
import { useSelectionStore } from '../../stores/selection.js'

const props = defineProps({
  body: {
    type: /** @type {import('vue').PropType<import('../../core/inspector.js').BodyDescription>} */ (Object),
    required: true,
  },
})

const documentStore = useDocumentStore()
const selection = useSelectionStore()
const repairDialog = useRepairDialogStore()
const paramCommands = useParamCommands()

/** Plain-language names for the ops whose result has no params of its own. */
const BLOCKING_OP_LABELS = Object.freeze({
  'boolean.union': 'Union',
  'boolean.subtract': 'Subtract',
  'boolean.intersect': 'Intersect',
  'group.assemble': 'Group',
})

const isSubPart = computed(() => Boolean(props.body.subPart))

/** @returns {import('../../core/paramEdit.js').ParamEditability} */
const editability = computed(() => {
  void documentStore.version
  if (isSubPart.value) return { editable: false, blockedBy: null }
  return paramCommands.canEdit(props.body.id)
})

const editable = computed(() => editability.value.editable)

/** A recipe nobody has described yet — the note says why, not "an operation". */
const isRecipePart = computed(() => Boolean(props.body.isRecipe) && !editable.value)

const blockingOpLabel = computed(() => {
  const op = editability.value.blockedBy
  if (!op) return ''
  return /** @type {Record<string, string>} */ (BLOCKING_OP_LABELS)[op] ?? op
})

/** The last rejected value's message — `ui-027`'s kernel-error surface, reused. */
const paramError = ref(/** @type {string | null} */ (null))
watch(() => props.body.id, () => { paramError.value = null })

/**
 * The composite this drilled-into part belongs to, when that composite has params a user
 * could change from its whole-body selection — for the "Select the whole …" note.
 */
const parent = computed(() => {
  void documentStore.version
  const bodyId = selection.subPart?.bodyId
  if (!isSubPart.value || !bodyId) return null
  const record = documentStore.raw.recordOf(bodyId)
  if (!record || !hasEditableParams(record.op)) return null
  const params = record.params ?? {}
  const schema = paramOptions(record.op, params)
  const fields = Object.entries(schema).map(([key, field]) => {
    const value = params[key] ?? (field.kind === 'number' ? field.default : undefined)
    const shown =
      field.kind === 'enum'
        ? field.options.find((option) => Object.is(option.value, value))?.label ?? String(value ?? '')
        : `${formatMmValue(Number(value))} ${field.unit}`.trim()
    return { key, label: field.label, shown }
  })
  const firstEnum = Object.values(schema).find((field) => field.kind === 'enum')
  return { bodyId, name: record.name ?? bodyId, fields, noun: (firstEnum?.label ?? 'parameters').toLowerCase() }
})

// --- typed fields (focus snapshot, the Transform section's own pattern) -------------

const editingField = ref('')
const editingSnapshot = ref('')

/**
 * @param {string} key
 * @param {string} display
 */
function fieldValue(key, display) {
  return editingField.value === key ? editingSnapshot.value : display
}

/**
 * @param {Event} event
 * @param {string} key
 */
function onFieldFocus(event, key) {
  editingSnapshot.value = /** @type {HTMLInputElement} */ (event.target).value
  editingField.value = key
}

/** @param {KeyboardEvent} event */
function onFieldEnter(event) {
  /** @type {HTMLInputElement} */ (event.target).blur()
}

/**
 * @param {any} value
 * @param {string} unit
 */
function displayValue(value, unit) {
  if (typeof value !== 'number') return String(value ?? '')
  return unit === 'mm' ? formatMmValue(value) : String(value)
}

/**
 * `text.label`'s string (TODO/render-002) — the only free-text param, so the only
 * `text` field a user may edit; other text fields (a boolean shown as "true") stay
 * read-only.
 *
 * @param {import('../../core/inspector.js').ParamField} field
 */
function isLabelText(field) {
  return field.kind === 'text' && field.key === 'text'
}

/** @param {import('../../core/inspector.js').ParamField} field */
function fieldEditable(field) {
  return (
    editable.value &&
    (field.kind === 'number' || field.kind === 'vector' || field.kind === 'enum' || isLabelText(field))
  )
}

/**
 * Run one edit; a held composite edit opens the repair dialog, a rejection is shown.
 *
 * @param {() => import('../../composables/useParamCommands.js').ParamResult | void} edit
 * @param {import('../../stores/repairDialog.js').PendingField | null} pending
 * @returns {boolean} Whether it was refused.
 */
function runEdit(edit, pending) {
  paramError.value = null
  try {
    const result = edit()
    if (result && 'needsRepair' in result) {
      repairDialog.show({ edit: result.edit, breakages: result.breakages, pending })
    }
    return false
  } catch (error) {
    paramError.value = error instanceof Error ? error.message : String(error)
    return true
  }
}

/**
 * @param {Event} event
 * @param {string} key
 */
function commitParamField(event, key) {
  const raw = /** @type {HTMLInputElement} */ (event.target).value
  if (key === 'text') {
    editingField.value = ''
    if (!editable.value) return
    // Unlike a number, an empty string is refused loudly rather than ignored, and the
    // field is put back by hand since nothing the binding can see changed.
    if (runEdit(() => paramCommands.setParam(props.body.id, key, raw), null)) {
      /** @type {HTMLInputElement} */ (event.target).value = fieldValue(`param-${key}`, raw)
    }
    return
  }
  const parsed = parseNumeric(raw)
  editingField.value = ''
  if (parsed === null || !editable.value) return
  runEdit(() => paramCommands.setParam(props.body.id, key, parsed), null)
}

/**
 * @param {Event} event
 * @param {string} key
 * @param {number} index
 */
function commitParamComponent(event, key, index) {
  const parsed = parseNumeric(/** @type {HTMLInputElement} */ (event.target).value)
  editingField.value = ''
  if (parsed === null || !editable.value) return
  runEdit(() => paramCommands.setParamComponent(props.body.id, key, index, parsed), null)
}

// --- enum selects ---------------------------------------------------------------

/**
 * The option the select shows, as its DOM value: the held value while the repair dialog
 * is open for this field, else the document's own. `String(value)` as the DOM value — a
 * `<select>` only speaks strings — and {@link onEnumChange} maps it back to the option's
 * own typed value, so a Pi's model stays the number `4`, never `"4"`.
 *
 * @param {import('../../core/inspector.js').ParamField} field
 * @returns {string}
 */
function selectedValue(field) {
  const held = pendingFor(field)
  return String(held ? held.value : field.value)
}

/** @param {import('../../core/inspector.js').ParamField} field */
function pendingFor(field) {
  const held = repairDialog.pending
  return repairDialog.open && held && held.bodyId === props.body.id && held.key === field.key ? held : null
}

/**
 * @param {Event} event
 * @param {import('../../core/inspector.js').ParamField} field
 */
function onEnumChange(event, field) {
  const select = /** @type {HTMLSelectElement} */ (event.target)
  const option = (field.options ?? []).find((candidate) => String(candidate.value) === select.value)
  if (!option || !editable.value) return
  const refused = runEdit(() => paramCommands.setParam(props.body.id, field.key, option.value), {
    bodyId: props.body.id,
    key: field.key,
    value: option.value,
  })
  // A refusal changed nothing the binding can see, so put the DOM back by hand.
  if (refused) select.value = selectedValue(field)
}
</script>

<template>
  <section
    class="params"
    data-testid="inspector-params"
    :data-editable="editable ? 'true' : 'false'"
    :data-blocked-by="editability.blockedBy ?? ''"
  >
    <h3 class="params__title">Parameters</h3>
    <dl class="params__fields">
      <template v-for="field in body.params" :key="field.key">
        <template v-if="field.kind === 'vector'">
          <dt class="params__label">
            {{ field.label }}<span v-if="field.unit" class="params__unit"> ({{ field.unit }})</span>
          </dt>
          <dd class="params__value params__value--vector">
            <label v-for="(component, index) in field.components" :key="component.label" class="params__component">
              <span class="params__component-label">{{ component.label }}</span>
              <input
                class="params__input"
                :class="{ 'params__input--editable': fieldEditable(field) }"
                type="text"
                inputmode="decimal"
                :readonly="!fieldEditable(field)"
                :data-testid="`inspector-param-${field.key}-${component.label.toLowerCase()}`"
                :aria-label="`${field.label} ${component.label}${field.unit === 'mm' ? ' in millimetres' : ''}`"
                :value="fieldValue(`param-${field.key}-${index}`, displayValue(component.value, field.unit))"
                @focus="onFieldFocus($event, `param-${field.key}-${index}`)"
                @blur="commitParamComponent($event, field.key, index)"
                @keydown.enter.prevent="onFieldEnter"
              />
            </label>
          </dd>
        </template>

        <template v-else-if="field.kind === 'enum'">
          <dt class="params__label">
            <label :for="`param-select-${field.key}`">{{ field.label }}</label>
          </dt>
          <dd class="params__value">
            <select
              :id="`param-select-${field.key}`"
              class="params__select"
              :class="{ 'params__select--pending': pendingFor(field) }"
              :disabled="!fieldEditable(field)"
              :data-testid="`inspector-param-${field.key}`"
              :data-pending="pendingFor(field) ? 'true' : 'false'"
              :value="selectedValue(field)"
              @change="onEnumChange($event, field)"
            >
              <option v-for="option in field.options" :key="String(option.value)" :value="String(option.value)">
                {{ option.label }}
              </option>
            </select>
          </dd>
        </template>

        <template v-else>
          <dt class="params__label">{{ field.label }}</dt>
          <dd class="params__value">
            <input
              class="params__input"
              :class="{ 'params__input--editable': fieldEditable(field) }"
              type="text"
              :inputmode="field.kind === 'text' ? 'text' : 'decimal'"
              :readonly="!fieldEditable(field)"
              :data-testid="`inspector-param-${field.key}`"
              :aria-label="`${field.label}${field.unit === 'mm' ? ' in millimetres' : ''}`"
              :value="fieldValue(`param-${field.key}`, displayValue(field.value, field.unit))"
              @focus="onFieldFocus($event, `param-${field.key}`)"
              @blur="commitParamField($event, field.key)"
              @keydown.enter.prevent="onFieldEnter"
            />
            <span v-if="field.unit" class="params__unit">{{ field.unit }}</span>
          </dd>
        </template>
      </template>
    </dl>

    <p v-if="paramError" class="params__error" data-testid="inspector-param-error">{{ paramError }}</p>

    <!-- Drilled into one part of a composite: its parent's choices, read-only, and the way
         back up to where they can be changed (TODO/ui-052). -->
    <div v-if="parent" class="params__parent" data-testid="inspector-params-parent">
      <dl class="params__fields">
        <template v-for="field in parent.fields" :key="field.key">
          <dt class="params__label">{{ field.label }}</dt>
          <dd class="params__value">
            <input class="params__input" type="text" readonly :value="field.shown" :data-testid="`inspector-parent-param-${field.key}`" />
          </dd>
        </template>
      </dl>
      <p class="params__note" data-testid="inspector-params-parent-note">
        Select the whole {{ parent.name }} to change its {{ parent.noun }}.
        <button type="button" class="params__link" data-testid="inspector-params-select-parent" @click="selection.stepUp()">
          Select {{ parent.name }}
        </button>
      </p>
    </div>

    <p v-else-if="!editable && !isSubPart" class="params__note" data-testid="inspector-params-note">
      <template v-if="isRecipePart">
        These are catalogue values for a ready-made part whose options aren't described yet, so
        they can't be changed here. Move, rotate and delete all work as usual.
      </template>
      <template v-else>
        This shape is a {{ blockingOpLabel || 'combination' }} of other shapes, so it has no
        parameters of its own. Select one of the shapes it was built from to change its size.
      </template>
    </p>
    <p v-else-if="editable && body.isRecipe" class="params__note" data-testid="inspector-params-recipe-note">
      Pick another option to rebuild this part in place — it keeps its position, rotation and
      colours. If something depends on a part the new option doesn't have, you'll be asked what to do.
    </p>
  </section>
</template>

<style scoped>
.params {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.params__title {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-3);
}

.params__fields {
  display: grid;
  gap: 6px 8px;
  margin: 0;
}

.params__label {
  font-size: 12px;
  color: var(--text-2);
}

.params__value {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 2px;
}

.params__value--vector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.params__component {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.params__component-label {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-3);
}

.params__input {
  width: 100%;
  min-width: 0;
  min-height: 34px;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 12px;
}

.params__input:read-only {
  color: var(--text-2);
  cursor: default;
}

.params__input--editable {
  border-color: var(--border-strong, var(--border));
  color: var(--text-1);
}

.params__input--editable:focus-visible,
.params__select:focus-visible,
.params__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* A native select: the iOS wheel picker on touch, 44px so it is a real tap target, and
   16px text so iOS Safari does not zoom the page on focus. */
.params__select {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 4px 8px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 16px;
}

.params__select:disabled {
  color: var(--text-2);
  opacity: 0.8;
}

/* Held while the repair dialog decides — visibly not yet the body's value. */
.params__select--pending {
  border-style: dashed;
  border-color: var(--warn, var(--accent));
}

.params__unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.params__note {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-3);
}

.params__link {
  min-height: 44px;
  padding: 0 4px;
  border: none;
  background: none;
  color: var(--accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.params__error {
  margin: 8px 0 0;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 11px;
  line-height: 1.4;
}
</style>
