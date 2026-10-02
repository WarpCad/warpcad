<script setup>
/**
 * The Slices panel (`TODO/sketch-001`): the sketch's stack of outlines at different
 * heights. One slice is the common case; two or more, each with one closed outline, is
 * what **Loft** skins through — the ribs of a wing.
 *
 * Each row is a slice: its name, its Z offset (mm, along the body's own Z), and a radio
 * to make it the active slice — the one new strokes go onto and the one the camera looks
 * at. Inactive slices draw ghosted in the viewport so the stack stays visible.
 */
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
  cursor: pointer;
}

.slices__row--active .slices__pick {
  border-color: var(--accent);
}

.slices__count {
  color: var(--text-3);
  font-size: 11px;
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
