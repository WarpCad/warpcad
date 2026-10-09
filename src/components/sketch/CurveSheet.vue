<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Curve sheet (`TODO/sketch-008`): what the toolbar's **Curve ▾** opens — a bottom sheet
 * on a narrow viewport, a docked card on a wide one (`SketchPanelSheet.vue`).
 *
 * Three curves, each a *creation*, never an operation on what is already drawn — except
 * **Spline through points**, which smooths the selected outline and so is disabled, with its
 * reason printed, until exactly one plain closed outline is selected:
 *
 * - **Airfoil (NACA 4-digit)**: code, chord and point count. **Place** arms a placement drag —
 *   the outline follows the pointer with its leading edge under it and lands on release.
 * - **Ellipse**: width, height and point count; placed the same way, by its centre.
 * - **Spline through points**: the selected outline becomes a smooth closed curve through its
 *   own points.
 *
 * The numbers are only read here; `src/sketch/curves.js` checks them, and a refusal names the
 * field it is about (the input is marked too), so "chordMm must be greater than 0" never
 * reaches the kernel.
 */
import { computed, ref } from 'vue'

import { parseNumeric } from '../../composables/numericEntry.js'
import { DEFAULT_AIRFOIL_POINTS, DEFAULT_ELLIPSE_POINTS } from '../../sketch/curves.js'
import { isClosed } from '../../sketch/profile.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'

const editor = useSketchEditorStore()

const KINDS = Object.freeze([
  { id: 'naca4', label: 'Airfoil (NACA 4-digit)' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'spline', label: 'Spline through points' },
])

const kind = ref(/** @type {'naca4' | 'ellipse' | 'spline'} */ ('naca4'))
const code = ref('2412')
const chordText = ref('120')
const airfoilPointsText = ref(String(DEFAULT_AIRFOIL_POINTS))
const widthText = ref('60')
const heightText = ref('30')
const ellipsePointsText = ref(String(DEFAULT_ELLIPSE_POINTS))
const error = ref('')
const errorField = ref('')

/** Why Spline is unavailable, or `''`. */
const splineProblem = computed(() => {
  const profile = editor.selectedProfile
  if (!profile) return 'Select one closed outline first — the spline goes through its points'
  if (profile.kind !== 'polyline' || profile.source) return 'Select a plain outline (Convert to outline first)'
  if (!isClosed(profile)) return 'The outline must be closed'
  return ''
})

/** @param {string} text @returns {number} NaN when it is not a number, so curves.js names it. */
function number(text) {
  return parseNumeric(text) ?? Number.NaN
}

function fail(/** @type {{ field: string, message: string }} */ outcome) {
  errorField.value = outcome.field
  error.value = outcome.message
}

function place() {
  error.value = ''
  errorField.value = ''
  const outcome =
    kind.value === 'naca4'
      ? editor.armCurve({
          curve: 'naca4',
          params: { code: code.value.trim(), chordMm: number(chordText.value), points: number(airfoilPointsText.value) },
        })
      : editor.armCurve({
          curve: 'ellipse',
          params: { radiusXMm: number(widthText.value) / 2, radiusYMm: number(heightText.value) / 2, points: number(ellipsePointsText.value) },
        })
  if (!outcome.ok) {
    // The ellipse is described to people by width and height, to curves.js by radii.
    const field = outcome.field === 'radiusXMm' ? 'widthMm' : outcome.field === 'radiusYMm' ? 'heightMm' : outcome.field
    fail({ field, message: outcome.message.replace('radiusXMm', 'width').replace('radiusYMm', 'height') })
  }
}

/** @param {string} id */
function selectKind(id) {
  kind.value = id === 'ellipse' ? 'ellipse' : id === 'spline' ? 'spline' : 'naca4'
  error.value = ''
  errorField.value = ''
}

function spline() {
  error.value = editor.splineSelected()
  errorField.value = ''
}

/** @param {string} field */
const invalid = (field) => (errorField.value === field ? 'true' : 'false')
</script>

<template>
  <div class="curve" data-testid="sketch-curve-sheet" :data-kind="kind">
    <div class="curve__kinds" role="radiogroup" aria-label="Curve">
      <button
        v-for="entry in KINDS"
        :key="entry.id"
        type="button"
        role="radio"
        class="curve__kind"
        :class="{ 'curve__kind--on': kind === entry.id }"
        :aria-checked="kind === entry.id"
        :data-testid="`sketch-curve-kind-${entry.id}`"
        @click="selectKind(entry.id)"
      >
        {{ entry.label }}
      </button>
    </div>

    <form v-if="kind === 'naca4'" class="curve__fields" @submit.prevent="place">
      <label class="curve__field">
        <span>Code</span>
        <input v-model="code" type="text" inputmode="numeric" maxlength="4" data-testid="sketch-curve-code" :aria-invalid="invalid('code')" />
      </label>
      <label class="curve__field">
        <span>Chord <span class="curve__unit">(mm)</span></span>
        <input v-model="chordText" type="text" inputmode="decimal" data-testid="sketch-curve-chord" :aria-invalid="invalid('chordMm')" />
      </label>
      <label class="curve__field">
        <span>Points</span>
        <input v-model="airfoilPointsText" type="text" inputmode="numeric" data-testid="sketch-curve-points" :aria-invalid="invalid('points')" />
      </label>
      <button type="submit" class="curve__go" data-testid="sketch-curve-place">Place — then drag it into position</button>
    </form>

    <form v-else-if="kind === 'ellipse'" class="curve__fields" @submit.prevent="place">
      <label class="curve__field">
        <span>Width <span class="curve__unit">(mm)</span></span>
        <input v-model="widthText" type="text" inputmode="decimal" data-testid="sketch-curve-width" :aria-invalid="invalid('widthMm')" />
      </label>
      <label class="curve__field">
        <span>Height <span class="curve__unit">(mm)</span></span>
        <input v-model="heightText" type="text" inputmode="decimal" data-testid="sketch-curve-height" :aria-invalid="invalid('heightMm')" />
      </label>
      <label class="curve__field">
        <span>Points</span>
        <input v-model="ellipsePointsText" type="text" inputmode="numeric" data-testid="sketch-curve-ellipse-points" :aria-invalid="invalid('points')" />
      </label>
      <button type="submit" class="curve__go" data-testid="sketch-curve-place">Place — then drag it into position</button>
    </form>

    <div v-else class="curve__fields">
      <p class="curve__note">Turns the selected outline into a smooth closed curve through its points.</p>
      <button type="button" class="curve__go" data-testid="sketch-curve-spline" :disabled="Boolean(splineProblem)" :title="splineProblem || 'Smooth the selected outline'" @click="spline">
        Smooth selected outline
      </button>
      <p v-if="splineProblem" class="curve__note" data-testid="sketch-curve-spline-reason">{{ splineProblem }}</p>
    </div>

    <p v-if="error" class="curve__error" data-testid="sketch-curve-error" :data-field="errorField" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.curve {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.curve__kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.curve__kind {
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
}

.curve__kind--on {
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}

.curve__fields {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
  margin: 0;
}

.curve__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--text-2);
}

.curve__field input {
  width: 72px;
  min-height: var(--tap);
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: 14px;
}

.curve__field input[aria-invalid='true'] {
  border-color: var(--danger, var(--warn));
}

.curve__unit {
  color: var(--text-3);
}

.curve__go {
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.curve__go:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.curve__note {
  margin: 0;
  font-size: 11px;
  color: var(--text-3);
}

.curve__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger, var(--warn));
}
</style>
