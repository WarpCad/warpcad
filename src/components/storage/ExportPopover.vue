<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Export popover (`TODO/ui-034`) — opened by **File ▾ → Export…** and driven entirely by
 * `stores/exportDialog.js`, which owns every rule (availability, scope default, the document
 * changing underneath, cancelling mid-flight). This component is layout, the radios, and the
 * focus/return-focus handling; it contains no export logic. Contract:
 * `docs/decisions/interaction-model-qa.md` §12, confirmed by the user.
 *
 * ## What it shows
 *
 * - **Scope**, two radios: `Selection — Union 1` and `Whole scene — 3 bodies, in one file`.
 *   The default follows the selection, the Selection radio is disabled at 0 selected, and the
 *   line under both always states exactly what will be written and under what filename.
 * - **Format**, a segmented radio: STL (default) · OBJ · glTF (.glb), remembered per viewer.
 * - `Export` (commit) and `Cancel`. `Export` reads `Preparing…` while glTF's lazy exporter
 *   loads; a refusal appears **by name** in a `role="alert"` and the popover stays open.
 * - **A slow export says so** (`TODO/perf-001`). Precondition: an export is in flight and has
 *   been for longer than `PENDING_AFTER_MS`. Trigger: the Export press itself — this is
 *   feedback on an existing control, not a new one to find. Feedback: the button reads
 *   `Exporting…` and stays disabled, and a `role="status"` line under it names the file
 *   (`Writing warpcad-scene.stl…`). Both clear when the download starts, when the export is
 *   refused, or when the popover is closed. It is armed by a timer rather than set on press,
 *   so a 5 ms export never flashes it — measured at 0/5 appearances on a one-body scene even
 *   at 6× CPU throttling, against 5/5 on a 24-body one. The state is worth showing only
 *   because `src/core/exportClient.js` put the work in a worker: while the main thread was
 *   doing the serializing itself, nothing could have painted it.
 * - **Resolution** (`TODO/core-035`), a select under Format: *Same as design (Normal)* by
 *   default, then Draft / Normal / Fine / Print — how finely curves are faceted **in this
 *   file only**, remembered for the session. When it differs from the design a note says
 *   so (*Re-evaluating at Print resolution — the design itself is unchanged.*), and the
 *   worker re-folds the records at that setting; the status line after the download
 *   reports the triangle count, which is how the setting shows it did something.
 * - Notes only when they apply: the rolled-back label, the whole-body note for a drilled-in
 *   selection, and the reason when Export became unavailable while the popover was open.
 *
 * ## The backdrop
 *
 * A transparent, full-viewport click-catcher at z-index 30 with the popover at 31 (the tier
 * the Q&A fixes for popovers). It is what stops a *pointer* changing the selection while this
 * is open, so the scope line cannot go stale under the user; the keyboard cannot be stopped
 * that way, which is why the store derives every line live rather than snapshotting at open.
 *
 * ## Focus
 *
 * Opening focuses the checked scope radio (so Space/Arrows work at once and a screen reader
 * announces the scope); closing returns focus to the File button, where the user was.
 * Enter anywhere in the form is Export. Esc is handled by `FileMenu.vue`'s one keydown
 * listener (`stores/fileMenu.js` `dismissTopmost`), like every other overlay this menu owns.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { EXPORT_FORMATS } from '../../core/export.js'
import HelpButton from '../controls/HelpButton.vue'
import { useExportDialogStore } from '../../stores/exportDialog.js'

const props = defineProps({
  /** The File button — the popover anchors under it and gives focus back to it. */
  anchor: { type: /** @type {import('vue').PropType<HTMLElement | null>} */ (Object), default: null },
})

const dialog = useExportDialogStore()

/** @type {import('vue').Ref<HTMLElement | null>} */
const rootRef = ref(null)
const position = ref({ top: 60, left: 8, width: 320 })

const formatKeys = /** @type {Array<'stl' | 'obj' | 'glb'>} */ (Object.keys(EXPORT_FORMATS))

/** Anchor under the File button, clamped inside the viewport — measured on open, not per frame. */
function measure() {
  const box = props.anchor?.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const width = Math.min(320, viewportWidth - 16)
  const right = box?.right ?? viewportWidth - 8
  const left = Math.max(8, Math.min(right - width, viewportWidth - width - 8))
  position.value = { top: Math.round((box?.bottom ?? 52) + 6), left: Math.round(left), width }
}

const style = computed(() => ({
  top: `${position.value.top}px`,
  left: `${position.value.left}px`,
  width: `${position.value.width}px`,
  maxHeight: `calc(100dvh - ${position.value.top + 12}px)`,
}))

/** The one-line reason Export cannot go ahead right now, if any. */
const blockedText = computed(() => dialog.unavailableReason || dialog.scopeProblem)

/**
 * `Export` → `Preparing…` (glTF's lazy exporter chunk) → `Exporting…` (the export has
 * been running longer than `PENDING_AFTER_MS`, `TODO/perf-001`). The slow-export state
 * wins when both apply, because by then the chunk has long since loaded and what the
 * user is waiting for is the file.
 */
const commitLabel = computed(() => {
  if (dialog.pending) return 'Exporting…'
  return dialog.preparing ? 'Preparing…' : 'Export'
})

watch(
  () => dialog.isOpen,
  async (open, was) => {
    if (open) {
      measure()
      window.addEventListener('resize', measure)
      await nextTick()
      const target = /** @type {HTMLElement | null} */ (
        rootRef.value?.querySelector('input[name="export-scope"]:checked:not(:disabled)') ??
          rootRef.value?.querySelector('input:not(:disabled)') ??
          null
      )
      target?.focus()
    } else {
      window.removeEventListener('resize', measure)
      if (was) props.anchor?.focus()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => window.removeEventListener('resize', measure))

/**
 * A file size for the Print pieces list: bytes under 1 KB, else KB or MB to one decimal.
 *
 * @param {number} bytes
 * @returns {string}
 */
function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <Teleport to="body">
    <template v-if="dialog.isOpen">
      <div class="export__backdrop" data-testid="export-backdrop" @click="dialog.close()" />
      <form
        ref="rootRef"
        class="export"
        role="dialog"
        aria-label="Export"
        data-testid="export-popover"
        :style="style"
        @submit.prevent="dialog.commit()"
      >
        <p class="export__heading" aria-hidden="true">Scope</p>
        <div role="radiogroup" aria-label="Scope" class="export__group">
          <label class="export__row" data-testid="export-scope-selection-label">
            <input
              type="radio"
              name="export-scope"
              value="selection"
              data-testid="export-scope-selection"
              :checked="dialog.effectiveScope === 'selection' && dialog.scopeProblem === ''"
              :disabled="!dialog.selectionAvailable"
              @change="dialog.chooseScope('selection')"
            />
            <span>{{ dialog.selectionLabel }}</span>
          </label>
          <label class="export__row" data-testid="export-scope-scene-label">
            <input
              type="radio"
              name="export-scope"
              value="scene"
              data-testid="export-scope-scene"
              :checked="dialog.effectiveScope === 'scene'"
              @change="dialog.chooseScope('scene')"
            />
            <span>{{ dialog.sceneLabel }}</span>
          </label>
        </div>

        <p class="export__heading" aria-hidden="true">Format</p>
        <div role="radiogroup" aria-label="Format" class="export__segments">
          <label
            v-for="key in formatKeys"
            :key="key"
            class="export__segment"
            :data-testid="`export-format-${key}-label`"
          >
            <input
              type="radio"
              name="export-format"
              :value="key"
              :data-testid="`export-format-${key}`"
              :checked="dialog.format === key"
              @change="dialog.chooseFormat(key)"
            />
            <span>{{ EXPORT_FORMATS[key].label }}</span>
          </label>
        </div>

        <label class="export__heading export__heading--label" for="export-resolution">Resolution</label>
        <div class="export__select-wrap">
          <select
            id="export-resolution"
            class="export__select"
            data-testid="export-resolution"
            :value="dialog.exportResolution"
            @change="dialog.chooseResolution(/** @type {HTMLSelectElement} */ ($event.target).value)"
          >
            <option v-for="option in dialog.resolutionOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
        <p v-if="dialog.resolutionNote" class="export__note" data-testid="export-resolution-note">
          {{ dialog.resolutionNote }}
        </p>

        <p v-if="dialog.summary" class="export__summary" data-testid="export-summary">{{ dialog.summary }}</p>
        <p v-if="dialog.wholeBodyNote" class="export__note" data-testid="export-whole-body-note">
          {{ dialog.wholeBodyNote }}
        </p>
        <p v-if="dialog.rollbackNote" class="export__note export__note--warn" data-testid="export-rollback-note">
          {{ dialog.rollbackNote }}
        </p>
        <p v-if="blockedText" class="export__note export__note--warn" role="status" data-testid="export-blocked">
          {{ blockedText }}
        </p>
        <p v-if="dialog.error" class="export__error" role="alert" data-testid="export-error">{{ dialog.error }}</p>
        <p v-if="dialog.pending" class="export__note export__pending" role="status" data-testid="export-pending">
          Writing {{ dialog.pendingFile }}…
        </p>

        <!-- Print pieces (TODO/io-007): every top-level part of the scope as its own STL, laid
             flat, zipped. A second action over the same scope; the list below is its feedback. -->
        <p class="export__heading" aria-hidden="true">Print pieces</p>
        <p class="export__note">One STL per part, each laid flat on its largest face, in a zip.</p>
        <button
          type="button"
          class="export__button export__button--wide"
          data-testid="export-print-pieces"
          :disabled="!dialog.canExport"
          @click="dialog.printPieces()"
        >
          Print pieces (.zip)
        </button>
        <ul v-if="dialog.printPiecesFiles.length > 0" class="export__pieces" data-testid="export-print-pieces-list" :aria-label="dialog.printPiecesZip">
          <li
            v-for="file in dialog.printPiecesFiles"
            :key="file.filename"
            class="export__piece"
            data-testid="export-print-piece"
            :data-filename="file.filename"
            :data-size-bytes="file.sizeBytes"
          >
            <span class="export__piece-name">{{ file.filename }}</span>
            <span class="export__piece-size">{{ sizeLabel(file.sizeBytes) }}</span>
            <span v-if="file.mayNeedSupports" class="export__piece-note" title="A heuristic: a face points down more than 45° from vertical, off the bed.">may need supports</span>
          </li>
        </ul>

        <div class="export__actions">
          <button type="button" class="export__button" data-testid="export-cancel" @click="dialog.close()">
            Cancel
          </button>
          <button
            type="submit"
            class="export__button export__button--primary"
            data-testid="export-commit"
            :disabled="!dialog.canExport"
          >
            {{ commitLabel }}
          </button>
        </div>
        <HelpButton topic="export" class="export__help" />
      </form>
    </template>
  </Teleport>
</template>

<style scoped>
/* Transparent so the scene stays legible under the popover; above the Library (20) and
   Inspector (11) sheets so nothing under it is reachable while it is open. */
.export__backdrop {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 30;
}

.export {
  position: fixed;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 8px 10px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-overlay);
  color: var(--text-1);
  z-index: 31;
}

/* The ? in the popover's top-right corner (`TODO/ui-061`): out of flow, so nothing else moves. */
.export__help {
  position: absolute;
  top: 0;
  right: 0;
}

.export__heading {
  margin: 4px 2px 2px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.export__heading--label {
  display: block;
  margin-top: 10px;
}

/* A native select: the phone's own picker, and no custom listbox to get wrong. Its own
   rendering is switched off (`appearance: none`) because WebKit — every iPhone and iPad —
   ignores `min-height` on a native select and draws it well under the 44px tap target;
   the caret is drawn by the wrapper instead. */
.export__select-wrap {
  position: relative;
}

.export__select-wrap::after {
  content: '▾';
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: var(--text-2);
  pointer-events: none;
}

.export__select {
  -webkit-appearance: none;
  appearance: none;
  box-sizing: border-box;
  width: 100%;
  height: var(--tap);
  padding: 0 28px 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
}

.export__select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.export__group {
  display: flex;
  flex-direction: column;
}

.export__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  padding: 0 4px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 1.3;
  cursor: pointer;
  overflow-wrap: anywhere;
}

.export__row:has(input:disabled) {
  opacity: 0.5;
  cursor: default;
}

.export__row input {
  flex: none;
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--accent);
}

.export__row:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.export__segments {
  display: flex;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.export__segment {
  position: relative;
  flex: 1;
  min-height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  font-size: 13px;
  text-align: center;
  color: var(--text-2);
  cursor: pointer;
  touch-action: manipulation;
}

.export__segment + .export__segment {
  border-left: 1px solid var(--border-strong);
}

/* The real radio fills its segment and is invisible, so the whole segment is the 44px target
   and a click lands on the input itself. */
.export__segment input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.export__segment:has(input:checked) {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface-1));
  color: var(--text-1);
  font-weight: 600;
}

.export__segment:has(input:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.export__summary {
  margin: 10px 2px 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.export__note {
  margin: 6px 0 0;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.export__note--warn {
  background: color-mix(in srgb, var(--warn) 14%, var(--surface-1));
}

/* Same shape as a note, but marked as activity rather than as a warning. */
.export__pending {
  border-left: 3px solid var(--accent);
  color: var(--text-2);
}

.export__error {
  margin: 8px 0 0;
  padding: 6px 8px;
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.35;
  color: var(--danger);
  overflow-wrap: anywhere;
}

.export__button--wide {
  width: 100%;
}

.export__pieces {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.export__piece {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
}

.export__piece-name {
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

.export__piece-size {
  color: var(--text-2);
}

.export__piece-note {
  color: var(--warn);
}

.export__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.export__button {
  flex: 1;
  min-height: var(--tap);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.export__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.export__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.export__button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
