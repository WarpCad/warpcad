<script setup>
/**
 * The Extrude panel (`TODO/sketch-001`): how the sketch's outlines become a solid.
 *
 * One button per `@jscad/modeling` 2.13 extrusion the sketch supports, each disabled
 * with its printed reason when the slices don't suit it (Loft needs two or more; every
 * other method uses exactly one). Below, the chosen method's own fields, in UI units —
 * millimetres and degrees; the registry converts degrees to radians at its boundary.
 */
import { computed } from 'vue'

import { parseNumeric } from '../../composables/numericEntry.js'
import { EXTRUSION_METHODS } from '../../sketch/profile.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'

const editor = useSketchEditorStore()

/** @type {Record<string, { label: string, picture: string }>} */
const METHODS = Object.freeze({
  linear: { label: 'Linear', picture: 'Straight up, like a cookie cutter' },
  revolve: { label: 'Revolve', picture: 'Spun around the Y axis, like a lathe' },
  helical: { label: 'Helical', picture: 'Spun and lifted, like a spring' },
  outline: { label: 'Outline', picture: 'Each outline becomes a wall — a hollow shell' },
  loft: { label: 'Loft', picture: 'Skinned through every slice, like a wing over its ribs' },
})

/**
 * Each method's fields: param key, label, unit. Integers are marked so the field refuses
 * a fraction rather than handing the kernel `12.5` segments.
 *
 * @type {Record<string, { key: string, label: string, unit: string, integer?: boolean }[]>}
 */
const FIELDS = Object.freeze({
  linear: [
    { key: 'heightMm', label: 'Height', unit: 'mm' },
    { key: 'twistDeg', label: 'Twist', unit: '°' },
    { key: 'twistSteps', label: 'Twist steps', unit: '', integer: true },
  ],
  revolve: [
    { key: 'angleDeg', label: 'Angle', unit: '°' },
    { key: 'startAngleDeg', label: 'Start angle', unit: '°' },
    { key: 'segments', label: 'Segments', unit: '', integer: true },
  ],
  helical: [
    { key: 'pitchMm', label: 'Pitch', unit: 'mm' },
    { key: 'turns', label: 'Turns', unit: '' },
    { key: 'endOffsetMm', label: 'End offset', unit: 'mm' },
    { key: 'segmentsPerTurn', label: 'Segments / turn', unit: '', integer: true },
  ],
  outline: [
    { key: 'wallMm', label: 'Wall', unit: 'mm' },
    { key: 'heightMm', label: 'Height', unit: 'mm' },
  ],
  loft: [{ key: 'resolution', label: 'Points per slice (0 = auto)', unit: '', integer: true }],
})

const method = computed(() => editor.draft.extrusion.method)
const methodReason = computed(() => editor.methodProblems[method.value] ?? '')

/** @param {string} key @param {boolean | undefined} integer @param {Event} event */
function commit(key, integer, event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const parsed = parseNumeric(input.value)
  const current = /** @type {any} */ (editor.draft.extrusion)[key]
  if (parsed === null || (integer && !Number.isInteger(parsed))) {
    input.value = String(current)
    return
  }
  editor.setExtrusionParam(key, parsed)
}

/** @param {string} key */
function valueOf(key) {
  return String(/** @type {Record<string, unknown>} */ (editor.draft.extrusion)[key] ?? '')
}

/** @param {Event} event */
function blurTarget(event) {
  /** @type {HTMLInputElement} */ (event.target).blur()
}
</script>

<template>
  <div class="extrude" data-testid="sketch-extrude-panel" :data-method="method">
    <div class="extrude__methods" role="radiogroup" aria-label="Extrusion method">
      <button
        v-for="name in EXTRUSION_METHODS"
        :key="name"
        type="button"
        role="radio"
        class="extrude__method"
        :class="{ 'extrude__method--on': method === name }"
        :aria-checked="method === name"
        :disabled="Boolean(editor.methodProblems[name]) && method !== name"
        :title="editor.methodProblems[name] || METHODS[name].picture"
        :data-testid="`sketch-method-${name}`"
        :data-reason="editor.methodProblems[name]"
        @click="editor.setMethod(name)"
      >
        {{ METHODS[name].label }}
      </button>
    </div>
    <p class="extrude__picture" data-testid="sketch-method-picture">{{ METHODS[method].picture }}</p>
    <p v-if="methodReason" class="extrude__reason" data-testid="sketch-method-reason">{{ methodReason }}</p>
    <p v-if="method === 'outline'" class="extrude__note">Solid and Hole are ignored here — every closed outline becomes a wall.</p>
    <p v-if="method === 'revolve' || method === 'helical'" class="extrude__note">
      The axis is the sketch’s Y axis (the dashed line); keep outlines to its right.
    </p>
    <dl class="extrude__fields">
      <template v-for="field in FIELDS[method]" :key="`${method}-${field.key}`">
        <dt>
          <label :for="`sketch-param-${field.key}`">{{ field.label }}</label>
          <span v-if="field.unit" class="extrude__unit">({{ field.unit }})</span>
        </dt>
        <dd>
          <input
            :id="`sketch-param-${field.key}`"
            type="text"
            :inputmode="field.integer ? 'numeric' : 'decimal'"
            :data-testid="`sketch-param-${field.key}`"
            :value="valueOf(field.key)"
            @change="commit(field.key, field.integer, $event)"
            @keydown.enter.prevent="blurTarget"
          />
        </dd>
      </template>
    </dl>
  </div>
</template>

<style scoped>
.extrude {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.extrude__methods {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.extrude__method {
  min-height: var(--tap-compact);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
}

.extrude__method--on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.extrude__method:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.extrude__picture,
.extrude__note,
.extrude__reason {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
}

.extrude__reason {
  color: var(--warn);
}

.extrude__fields {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 4px 8px;
  margin: 0;
}

.extrude__fields dt {
  font-size: 12px;
  color: var(--text-2);
}

.extrude__fields dd {
  margin: 0;
}

.extrude__fields input {
  width: 100%;
  max-width: 120px;
  min-height: var(--tap-compact);
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: 13px;
}

.extrude__unit {
  margin-left: 4px;
  color: var(--text-3);
  font-size: 11px;
}
</style>
