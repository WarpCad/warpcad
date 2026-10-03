<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector while the sketch editor is open (`TODO/sketch-001`): the selected
 * outline's own fields — what it is, Solid or Hole, and its dimensions — with a Delete.
 *
 * Every edit replaces the outline in the editor's **draft**, never the document; Done
 * commits the whole session at once. A rectangle has a width and height, a circle a centre
 * and radius.
 *
 * Point editing (`TODO/sketch-002`) lives here too, not in the toolbar — the phone toolbar
 * is already at the ui-020 #3 reachable-canvas floor. A shape with no free points offers
 * **Convert to outline**; an outline offers its picked point's X/Y, **Delete vertex** (with
 * its refusal reason printed, since a phone has no tooltips) and **Simplify**. Dragging the
 * points themselves happens on the canvas (`Viewport.vue`, `VertexHandles.vue`).
 */
import { computed, ref, watch } from 'vue'

import { parseNumeric } from '../../composables/numericEntry.js'
import { formatMmValue } from '../../core/units.js'
import { isClosed } from '../../sketch/profile.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'

const editor = useSketchEditorStore()
const profile = computed(() => editor.selectedProfile)

const KIND_LABELS = Object.freeze({ circle: 'Circle', rect: 'Rectangle', polygon: 'Polygon', polyline: 'Outline' })

/**
 * The editable numbers for the selected outline: key path, label, unit.
 *
 * @type {import('vue').ComputedRef<{ key: string, index?: number, label: string, unit: string, integer?: boolean }[]>}
 */
const fields = computed(() => {
  const current = profile.value
  if (!current || current.kind === 'polyline') return []
  const centre = [
    { key: 'centerMm', index: 0, label: 'Centre X', unit: 'mm' },
    { key: 'centerMm', index: 1, label: 'Centre Y', unit: 'mm' },
  ]
  if (current.kind === 'circle') return [...centre, { key: 'radiusMm', label: 'Radius', unit: 'mm' }]
  if (current.kind === 'rect') return [...centre, { key: 'widthMm', label: 'Width', unit: 'mm' }, { key: 'heightMm', label: 'Height', unit: 'mm' }]
  return [...centre, { key: 'radiusMm', label: 'Radius', unit: 'mm' }, { key: 'sides', label: 'Sides', unit: '', integer: true }, { key: 'rotationDeg', label: 'Rotation', unit: '°' }]
})

/** @param {{ key: string, index?: number }} field */
function valueOf(field) {
  const current = /** @type {any} */ (profile.value)
  if (!current) return ''
  const value = field.index === undefined ? current[field.key] : current[field.key][field.index]
  return typeof value === 'number' ? formatMmValue(value) : ''
}

/** @param {{ key: string, index?: number, integer?: boolean }} field @param {Event} event */
function commit(field, event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const current = /** @type {any} */ (profile.value)
  const parsed = parseNumeric(input.value)
  const invalid = parsed === null || (field.integer && !(Number.isInteger(parsed) && parsed >= 3)) || (field.key !== 'centerMm' && field.key !== 'rotationDeg' && parsed < 0)
  if (!current || invalid) {
    input.value = valueOf(field)
    return
  }
  const next = { ...current }
  if (field.index === undefined) next[field.key] = parsed
  else {
    next[field.key] = [...current[field.key]]
    next[field.key][field.index] = parsed
  }
  editor.replaceInActiveSlice(next)
}

/** @param {string} role */
function setRole(role) {
  editor.setSelectedRole(role === 'hole' ? 'hole' : 'solid')
}

const vertexMm = computed(() => editor.selectedVertexMm)

/** @param {0 | 1} axis @param {Event} event */
function commitVertex(axis, event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const current = vertexMm.value
  const parsed = parseNumeric(input.value)
  if (!current || parsed === null) {
    input.value = current ? formatMmValue(current[axis]) : ''
    return
  }
  const next = [current[0], current[1]]
  next[axis] = parsed
  editor.moveVertex(editor.selectedVertex, next)
}

/** Simplify's tolerance, as typed, in mm. */
const toleranceText = ref('0.5')
const simplifyError = ref('')
watch(
  () => editor.selectedProfileId,
  () => {
    simplifyError.value = ''
  },
)

function applySimplify() {
  const parsed = parseNumeric(toleranceText.value)
  simplifyError.value = parsed === null ? 'Type a tolerance in millimetres, 0 or more' : editor.simplifySelected(parsed)
}

/** @param {Event} event */
function blurTarget(event) {
  /** @type {HTMLInputElement} */ (event.target).blur()
}
</script>

<template>
  <section class="profile" data-testid="inspector-sketch-profile" :data-profile-id="profile?.id ?? ''">
    <p class="profile__heading">Editing a sketch</p>
    <template v-if="profile">
      <p class="profile__kind" data-testid="inspector-sketch-profile-kind">
        {{ KIND_LABELS[profile.kind] }} · {{ profile.role === 'hole' ? 'Hole' : 'Solid' }}
      </p>
      <div class="profile__roles" role="radiogroup" aria-label="Outline role">
        <button
          v-for="role in ['solid', 'hole']"
          :key="role"
          type="button"
          role="radio"
          class="profile__role"
          :class="{ 'profile__role--on': profile.role === role }"
          :aria-checked="profile.role === role"
          :data-testid="`inspector-sketch-role-${role}`"
          @click="setRole(role)"
        >
          {{ role === 'hole' ? 'Hole' : 'Solid' }}
        </button>
      </div>
      <dl v-if="fields.length > 0" class="profile__fields">
        <template v-for="field in fields" :key="`${field.key}-${field.index ?? ''}`">
          <dt>
            {{ field.label }}<span v-if="field.unit" class="profile__unit"> ({{ field.unit }})</span>
          </dt>
          <dd>
            <input
              class="profile__input"
              type="text"
              :inputmode="field.integer ? 'numeric' : 'decimal'"
              :data-testid="`inspector-sketch-field-${field.key}${field.index === undefined ? '' : `-${field.index}`}`"
              :value="valueOf(field)"
              @change="commit(field, $event)"
              @keydown.enter.prevent="blurTarget"
            />
          </dd>
        </template>
      </dl>
      <p v-else class="profile__note" data-testid="inspector-sketch-outline-note">
        {{ profile.kind === 'polyline' ? `${profile.pointsMm.length} points · ${isClosed(profile) ? 'closed' : 'open — not part of the solid'}` : '' }}
      </p>

      <!-- Points (TODO/sketch-002). -->
      <template v-if="profile.kind !== 'polyline'">
        <button type="button" class="profile__action" data-testid="inspector-sketch-convert" @click="editor.convertSelectedToOutline()">
          Convert to outline
        </button>
        <p class="profile__note">Turns this shape into an outline whose points you can drag, add and delete.</p>
      </template>
      <template v-else>
        <p class="profile__note" data-testid="inspector-sketch-points-hint">
          Drag a dot to move a point. Drag a small hollow dot on an edge to add one. Tap a dot to pick it.
        </p>
        <dl v-if="vertexMm" class="profile__fields" data-testid="inspector-sketch-vertex">
          <dt>Point {{ editor.selectedVertex + 1 }} X <span class="profile__unit">(mm)</span></dt>
          <dd>
            <input
              class="profile__input"
              type="text"
              inputmode="decimal"
              data-testid="inspector-sketch-vertex-x"
              :value="formatMmValue(vertexMm[0])"
              @change="commitVertex(0, $event)"
              @keydown.enter.prevent="blurTarget"
            />
          </dd>
          <dt>Point {{ editor.selectedVertex + 1 }} Y <span class="profile__unit">(mm)</span></dt>
          <dd>
            <input
              class="profile__input"
              type="text"
              inputmode="decimal"
              data-testid="inspector-sketch-vertex-y"
              :value="formatMmValue(vertexMm[1])"
              @change="commitVertex(1, $event)"
              @keydown.enter.prevent="blurTarget"
            />
          </dd>
        </dl>
        <template v-if="vertexMm">
          <button
            type="button"
            class="profile__action"
            data-testid="inspector-sketch-delete-vertex"
            :disabled="Boolean(editor.deleteProblem)"
            :title="editor.deleteProblem || 'Delete the picked point'"
            @click="editor.deleteSelectedVertex()"
          >
            Delete vertex
          </button>
          <p v-if="editor.deleteProblem" class="profile__note" data-testid="inspector-sketch-delete-vertex-reason">{{ editor.deleteProblem }}</p>
        </template>
        <div class="profile__simplify">
          <label class="profile__simplify-label" for="sketch-simplify-tolerance">Simplify, tolerance <span class="profile__unit">(mm)</span></label>
          <input
            id="sketch-simplify-tolerance"
            v-model="toleranceText"
            class="profile__input profile__input--narrow"
            type="text"
            inputmode="decimal"
            data-testid="inspector-sketch-simplify-tolerance"
            @keydown.enter.prevent="applySimplify"
          />
          <button type="button" class="profile__action" data-testid="inspector-sketch-simplify" @click="applySimplify">Apply</button>
        </div>
        <p v-if="simplifyError" class="profile__note profile__note--warn" data-testid="inspector-sketch-simplify-error" role="status">
          {{ simplifyError }}
        </p>
      </template>
      <button type="button" class="profile__delete" data-testid="inspector-sketch-delete" @click="editor.deleteSelected()">
        Delete outline
      </button>
    </template>
    <p v-else class="profile__note" data-testid="inspector-sketch-empty">
      Tap an outline in the view to select it. Drag on the grid with a tool to draw one.
    </p>
  </section>
</template>

<style scoped>
.profile {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile__heading {
  margin: 0;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

.profile__kind {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}

.profile__roles {
  display: flex;
  gap: 4px;
}

.profile__role,
.profile__action,
.profile__delete {
  min-height: var(--tap-compact);
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
}

.profile__role--on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.profile__fields {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 4px 8px;
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.profile__fields dd {
  margin: 0;
}

.profile__input {
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

.profile__unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.profile__note {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-3);
}

.profile__delete,
.profile__action {
  align-self: flex-start;
}

.profile__action {
  min-height: var(--tap);
}

.profile__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.profile__simplify {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}

.profile__input--narrow {
  width: 5em;
}

.profile__note--warn {
  color: var(--warn);
}
</style>
