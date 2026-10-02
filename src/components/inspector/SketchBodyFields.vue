<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A selected sketch body's own section (`TODO/sketch-001`), in place of the generic
 * Parameters list — a sketch's params are outlines and an extrusion, not a row of numbers.
 *
 * Shows how the sketch is extruded and lets each of that method's numbers be edited in
 * place, through the same replace path every other primitive's params use
 * (`useParamCommands`, `TODO/data-007`): one revision, one Undo step, and every later
 * record — a move, a fillet — re-folds against the new solid. **Edit sketch** reopens the
 * editor on the body's own plane, wherever it has since been moved or turned.
 */
import { computed, ref } from 'vue'

import { parseNumeric } from '../../composables/numericEntry.js'
import { useParamCommands } from '../../composables/useParamCommands.js'
import { useSketchEditorCommands } from '../../composables/useSketchEditorCommands.js'
import { currentParamsOf } from '../../core/paramEdit.js'
import { useDocumentStore } from '../../stores/document.js'

const props = defineProps({
  body: {
    type: /** @type {import('vue').PropType<import('../../core/inspector.js').BodyDescription>} */ (Object),
    required: true,
  },
})

const documentStore = useDocumentStore()
const paramCommands = useParamCommands()
const sketchCommands = useSketchEditorCommands()
const error = ref('')

/** @type {Readonly<Record<string, string>>} */
const METHOD_LABELS = Object.freeze({ linear: 'Linear', revolve: 'Revolve', helical: 'Helical', outline: 'Outline', loft: 'Loft' })

/** @type {Record<string, { key: string, label: string, unit: string, integer?: boolean }[]>} */
const FIELDS = Object.freeze({
  linear: [
    { key: 'heightMm', label: 'Height', unit: 'mm' },
    { key: 'twistDeg', label: 'Twist', unit: '°' },
  ],
  revolve: [
    { key: 'angleDeg', label: 'Angle', unit: '°' },
    { key: 'startAngleDeg', label: 'Start angle', unit: '°' },
  ],
  helical: [
    { key: 'pitchMm', label: 'Pitch', unit: 'mm' },
    { key: 'turns', label: 'Turns', unit: '' },
  ],
  outline: [
    { key: 'wallMm', label: 'Wall', unit: 'mm' },
    { key: 'heightMm', label: 'Height', unit: 'mm' },
  ],
  loft: [{ key: 'resolution', label: 'Points per slice', unit: '', integer: true }],
})

/** The body's current sketch params — re-read whenever the document moves. */
const params = computed(() => {
  void documentStore.version
  try {
    return /** @type {any} */ (currentParamsOf(documentStore.raw, props.body.id))
  } catch {
    return null
  }
})

const method = computed(() => params.value?.extrusion?.method ?? 'linear')
const editability = computed(() => {
  void documentStore.version
  return sketchCommands.canEdit(props.body.id)
})

/** @param {string} key */
function valueOf(key) {
  return String(params.value?.extrusion?.[key] ?? '')
}

/** @param {{ key: string, integer?: boolean }} field @param {Event} event */
function commit(field, event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const parsed = parseNumeric(input.value)
  if (parsed === null || (field.integer && !Number.isInteger(parsed)) || !params.value) {
    input.value = valueOf(field.key)
    return
  }
  try {
    paramCommands.setParams(props.body.id, { extrusion: { ...params.value.extrusion, [field.key]: parsed } })
    error.value = ''
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
    input.value = valueOf(field.key)
  }
}

/** @param {Event} event */
function blurTarget(event) {
  /** @type {HTMLInputElement} */ (event.target).blur()
}
</script>

<template>
  <section class="sketch-body" data-testid="inspector-sketch-body" :data-method="method">
    <h3 class="sketch-body__title">Sketch</h3>
    <dl class="sketch-body__fields">
      <dt>Extrusion</dt>
      <dd data-testid="inspector-sketch-method">{{ METHOD_LABELS[method] }}</dd>
      <dt>Slices</dt>
      <dd data-testid="inspector-sketch-slices">{{ params?.slices?.length ?? 0 }}</dd>
      <template v-for="field in FIELDS[method]" :key="field.key">
        <dt>
          <label :for="`inspector-sketch-${field.key}`">{{ field.label }}</label>
          <span v-if="field.unit" class="sketch-body__unit"> ({{ field.unit }})</span>
        </dt>
        <dd>
          <input
            :id="`inspector-sketch-${field.key}`"
            class="sketch-body__input"
            type="text"
            :inputmode="field.integer ? 'numeric' : 'decimal'"
            :readonly="!editability.editable"
            :data-testid="`inspector-sketch-${field.key}`"
            :value="valueOf(field.key)"
            @change="commit(field, $event)"
            @keydown.enter.prevent="blurTarget"
          />
        </dd>
      </template>
    </dl>
    <p v-if="error" class="sketch-body__error" data-testid="inspector-sketch-error">{{ error }}</p>
    <button
      type="button"
      class="sketch-body__edit"
      data-testid="inspector-edit-sketch"
      :disabled="!editability.editable"
      :title="editability.editable ? 'Reopen the outlines and change them' : editability.reason"
      @click="sketchCommands.openEdit(body.id)"
    >
      Edit sketch
    </button>
    <p v-if="!editability.editable" class="sketch-body__note" data-testid="inspector-edit-sketch-reason">{{ editability.reason }}</p>
  </section>
</template>

<style scoped>
.sketch-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.sketch-body__title {
  margin: 0;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.sketch-body__fields {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 4px 8px;
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.sketch-body__fields dd {
  margin: 0;
  color: var(--text-1);
}

.sketch-body__unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.sketch-body__input {
  width: 100%;
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 16px;
}

.sketch-body__edit {
  min-height: var(--tap);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.sketch-body__edit:disabled {
  border-color: var(--border-strong);
  color: var(--text-3);
  cursor: not-allowed;
}

.sketch-body__note,
.sketch-body__error {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
}

.sketch-body__error {
  color: var(--warn);
}
</style>
