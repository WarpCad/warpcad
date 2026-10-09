<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Slices panel (`TODO/sketch-001`): the sketch's stack of outlines at different
 * heights. One slice is the common case; two or more, each with one closed outline, is
 * what **Loft** skins through — the ribs of a wing.
 *
 * Each row is a slice: its name, its Z offset (mm, along the body's own Z), and a radio
 * to make it the active slice — the one new strokes go onto and the one the camera looks
 * at. Inactive slices draw ghosted in the viewport so the stack stays visible.
 *
 * Under each row, the slice's **Offset** (X, Y mm) and **Twist** (°) (`TODO/sketch-008`): the
 * whole slice shifted and turned about its own origin in the built body — a wing tip swept back
 * and washed out without redrawing it. The editor keeps drawing the slice untransformed.
 *
 * Under the list, the active slice's **Reference image** group (`TODO/sketch-003`); each
 * row carries its photo's badge — *Not to scale* until Set scale is applied — or says the
 * photo was removed because a load could not verify it as a safe image.
 */
import ReferenceImagePanel from './ReferenceImagePanel.vue'
import { parseNumeric } from '../../composables/numericEntry.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'
import { formatMmValue } from '../../core/units.js'

const editor = useSketchEditorStore()
const emit = defineEmits(['activate'])

/** @param {number} index @param {Event} event */
function commitZ(index, event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const parsed = parseNumeric(input.value)
  if (parsed === null) {
    input.value = formatMmValue(editor.draft.slices[index].zMm)
    return
  }
  editor.setSliceOffset(index, parsed)
  if (index === editor.activeSlice) emit('activate', index)
}

/**
 * @param {number} index
 * @param {'x' | 'y' | 'twist'} which
 * @param {Event} event
 */
function commitTransform(index, which, event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const slice = editor.draft.slices[index]
  const parsed = parseNumeric(input.value)
  if (parsed === null) {
    input.value = transformValue(slice, which)
    return
  }
  if (which === 'twist') editor.setSliceTransformOf(index, { rotateDeg: parsed })
  else {
    const [x, y] = slice.offsetMm ?? [0, 0]
    editor.setSliceTransformOf(index, { offsetMm: which === 'x' ? [parsed, y] : [x, parsed] })
  }
}

/**
 * @param {import('../../sketch/profile.js').Slice} slice
 * @param {'x' | 'y' | 'twist'} which
 */
function transformValue(slice, which) {
  if (which === 'twist') return formatMmValue(slice.rotateDeg ?? 0)
  return formatMmValue((slice.offsetMm ?? [0, 0])[which === 'x' ? 0 : 1])
}

/** @param {number} index */
function activate(index) {
  editor.setActiveSlice(index)
  emit('activate', index)
}

/** @param {Event} event */
function blurTarget(event) {
  /** @type {HTMLInputElement} */ (event.target).blur()
}

function add() {
  editor.addSliceAbove()
  emit('activate', editor.activeSlice)
}

function remove() {
  editor.deleteActiveSlice()
  emit('activate', editor.activeSlice)
}
</script>

<template>
  <div class="slices" data-testid="sketch-slices-panel">
    <ol class="slices__list">
      <li
        v-for="(slice, index) in editor.draft.slices"
        :key="slice.id"
        class="slices__row"
        :class="{ 'slices__row--active': index === editor.activeSlice }"
        :data-testid="`sketch-slice-row-${index}`"
        :data-active="index === editor.activeSlice ? 'true' : 'false'"
      >
        <button
          type="button"
          class="slices__pick"
          :aria-pressed="index === editor.activeSlice"
          :data-testid="`sketch-slice-pick-${index}`"
          @click="activate(index)"
        >
          Slice {{ index + 1 }}
          <span class="slices__count">{{ slice.profiles.length }} outline{{ slice.profiles.length === 1 ? '' : 's' }}</span>
          <span
            v-if="editor.sliceImages[index]?.state === 'ok'"
            class="slices__badge"
            :class="{ 'slices__badge--warn': !editor.sliceImages[index].placement?.calibration }"
            :data-testid="`sketch-slice-image-badge-${index}`"
          >{{ editor.sliceImages[index].badge }}</span>
          <span
            v-else-if="editor.sliceImages[index]?.state === 'removed'"
            class="slices__badge slices__badge--warn"
            :data-testid="`sketch-slice-image-removed-${index}`"
            :title="editor.sliceImages[index].removedBecause === 'off' ? 'Reference image is switched off in History' : 'Reference image removed — it couldn\'t be verified as a safe image'"
          >{{ editor.sliceImages[index].removedBecause === 'off' ? 'Reference image is switched off in History' : "Reference image removed — it couldn't be verified as a safe image" }}</span>
        </button>
        <label class="slices__z">
          <span>Z</span>
          <input
            type="text"
            inputmode="decimal"
            :aria-label="`Slice ${index + 1} offset in millimetres`"
            :data-testid="`sketch-slice-z-${index}`"
            :value="formatMmValue(slice.zMm)"
            @change="commitZ(index, $event)"
            @keydown.enter.prevent="blurTarget"
          />
          <span class="slices__unit">mm</span>
        </label>
        <div class="slices__transform">
          <label class="slices__z">
            <span>Offset X</span>
            <input
              type="text"
              inputmode="decimal"
              :aria-label="`Slice ${index + 1} offset X in millimetres`"
              :data-testid="`sketch-slice-offset-x-${index}`"
              :value="transformValue(slice, 'x')"
              @change="commitTransform(index, 'x', $event)"
              @keydown.enter.prevent="blurTarget"
            />
          </label>
          <label class="slices__z">
            <span>Y</span>
            <input
              type="text"
              inputmode="decimal"
              :aria-label="`Slice ${index + 1} offset Y in millimetres`"
              :data-testid="`sketch-slice-offset-y-${index}`"
              :value="transformValue(slice, 'y')"
              @change="commitTransform(index, 'y', $event)"
              @keydown.enter.prevent="blurTarget"
            />
            <span class="slices__unit">mm</span>
          </label>
          <label class="slices__z">
            <span>Twist</span>
            <input
              type="text"
              inputmode="decimal"
              :aria-label="`Slice ${index + 1} twist in degrees`"
              :data-testid="`sketch-slice-twist-${index}`"
              :value="transformValue(slice, 'twist')"
              @change="commitTransform(index, 'twist', $event)"
              @keydown.enter.prevent="blurTarget"
            />
            <span class="slices__unit">°</span>
          </label>
        </div>
      </li>
    </ol>
    <div class="slices__actions">
      <button type="button" class="slices__btn" data-testid="sketch-slice-add" @click="add">＋ Slice</button>
      <button
        type="button"
        class="slices__btn"
        data-testid="sketch-slice-delete"
        :disabled="editor.draft.slices.length <= 1"
        :title="editor.draft.slices.length <= 1 ? 'A sketch needs at least one slice' : 'Delete the active slice and its outlines'"
        @click="remove"
      >
        Delete slice
      </button>
    </div>
    <ReferenceImagePanel />
  </div>
</template>

<style scoped>
.slices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slices__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slices__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 2px;
  border-radius: var(--radius-sm);
}

.slices__row--active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.slices__pick {
  flex: 1 1 auto;
  min-height: var(--tap-compact);
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  min-width: 0;
  cursor: pointer;
}

.slices__row--active .slices__pick {
  border-color: var(--accent);
}

.slices__count {
  color: var(--text-3);
  font-size: 11px;
  white-space: nowrap;
}

.slices__badge {
  min-width: 0;
  margin-left: auto;
  overflow: hidden;
  padding: 0 5px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--text-2);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slices__badge--warn {
  background: color-mix(in srgb, var(--warn) 22%, transparent);
}

.slices__z {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-2);
}

.slices__z input {
  width: 64px;
  min-height: var(--tap-compact);
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: 13px;
}

.slices__transform {
  flex: 1 0 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 8px;
}

.slices__transform input {
  width: 52px;
}

.slices__unit {
  color: var(--text-3);
  font-size: 11px;
}

.slices__actions {
  display: flex;
  gap: 6px;
}

.slices__btn {
  min-height: var(--tap-compact);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
}

.slices__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
