<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **Reference image** group in the Slices panel (`TODO/sketch-003`): a photo to trace
 * over, on the active slice. Not in the toolbar — that slot is already full at 390 px
 * (ui-043) — so it lives here, in the Slices sheet on a phone.
 *
 * - **Add image…** opens a file picker for PNG, JPEG or WebP. There is no `capture`
 *   attribute, so a phone offers its camera *and* its photo library. The photo is
 *   re-encoded in a worker before it is used (`src/sketch/imageJob.js`) — only its pixels
 *   are kept, never its metadata or location — then shown on the slice, centred, at a
 *   provisional 1 px = 0.1 mm with a **Not to scale** badge. It becomes **Replace image…**
 *   once the slice has one.
 * - **Opacity**, **X / Y offset** and **Rotation** line the photo up with the sketch axes.
 * - **Set scale** arms the two-point tool (`ScaleTool.vue`): a line along the photo's ruler,
 *   then its real length.
 * - **Auto-trace** arms the tap tool (`TraceTool.vue`, `TODO/sketch-004`): tap inside the part
 *   in the photo and its outline — and any holes — are added to the slice.
 * - **Remove image** takes the photo off the slice (the outlines stay).
 *
 * Every change edits the editor's draft, so Cancel throws it away and Done commits it —
 * photo included — as one undo step.
 */
import { computed, ref } from 'vue'

import NumberField from '../controls/NumberField.vue'
import HelpButton from '../controls/HelpButton.vue'
import { importImageFile, rememberAssetBitmap } from '../../sketch/imageClient.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'
import BaseButton from '../controls/BaseButton.vue'

const editor = useSketchEditorStore()
const input = ref(/** @type {HTMLInputElement | null} */ (null))

const view = computed(() => editor.activeImage)
const placement = computed(() => view.value.placement)
const shown = computed(() => view.value.state === 'ok')

function choose() {
  input.value?.click()
}

/** @param {Event} event */
async function onFile(event) {
  const target = /** @type {HTMLInputElement} */ (event.target)
  const file = target.files?.[0]
  // Cleared at once, so choosing the same file again still fires `change`.
  target.value = ''
  if (!file) return
  editor.imageError = ''
  editor.imageImporting = true
  const outcome = await importImageFile(file)
  if (outcome.superseded) return
  editor.imageImporting = false
  if (!editor.active) {
    if (outcome.result.ok) outcome.result.bitmap.close?.()
    return
  }
  if (!outcome.result.ok) {
    editor.imageError = outcome.result.reason
    return
  }
  rememberAssetBitmap(outcome.result.record.id, outcome.result.bitmap)
  editor.addImageAsset(outcome.result.record)
}

/** @param {Event} event */
function onOpacity(event) {
  const value = Number(/** @type {HTMLInputElement} */ (event.target).value)
  if (Number.isFinite(value)) editor.updateImage({ opacity: Math.min(1, Math.max(0, value / 100)) })
}

/**
 * @param {'x' | 'y'} axis
 * @param {number} value
 */
function commitOffset(axis, value) {
  const current = placement.value
  if (!current) return
  editor.updateImage({ offsetMm: axis === 'x' ? [value, current.offsetMm[1]] : [current.offsetMm[0], value] })
}

/** @param {number} value */
function commitRotation(value) {
  if (!placement.value) return
  editor.updateImage({ rotationDeg: value })
}
</script>

<template>
  <section class="ref-image" data-testid="sketch-image-panel" :data-state="view.state" aria-label="Reference image">
    <header class="ref-image__head">
      <h4 class="ref-image__title">Reference image</h4>
      <span
        v-if="shown"
        class="ref-image__badge"
        :class="{ 'ref-image__badge--warn': !placement?.calibration }"
        data-testid="sketch-image-badge"
      >{{ view.badge }}</span>
      <HelpButton topic="reference-image" class="ref-image__help" />
    </header>

    <p v-if="view.state === 'removed'" class="ref-image__removed" data-testid="sketch-image-removed" role="status">
      {{
        view.removedBecause === 'off'
          ? 'Reference image is switched off in History — turn its step back on to see it'
          : "Reference image removed — it couldn't be verified as a safe image"
      }}
    </p>

    <div class="ref-image__row">
      <input
        ref="input"
        class="ref-image__file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        data-testid="sketch-image-input"
        tabindex="-1"
        aria-hidden="true"
        @change="onFile"
      />
      <BaseButton
        size="compact"
        data-testid="sketch-image-add"
        :disabled="editor.imageImporting"
        :title="shown ? 'Choose a different photo for this slice' : 'Choose a photo (PNG, JPEG or WebP) to trace over'"
        @click="choose"
      >
        {{ editor.imageImporting ? 'Preparing image…' : shown ? 'Replace image…' : 'Add image…' }}
      </BaseButton>
      <BaseButton
        v-if="view.state !== 'none'"
        size="compact"
        data-testid="sketch-image-remove"
        title="Take the photo off this slice — the outlines stay"
        @click="editor.removeImage()"
      >
        Remove image
      </BaseButton>
    </div>

    <p v-if="editor.imageError" class="ref-image__error" data-testid="sketch-image-error" role="alert">{{ editor.imageError }}</p>

    <template v-if="shown && placement">
      <label class="ref-image__field ref-image__field--wide">
        <span>Opacity</span>
        <input
          type="range"
          min="5"
          max="100"
          step="5"
          data-testid="sketch-image-opacity"
          aria-label="Image opacity in percent"
          :value="Math.round(placement.opacity * 100)"
          @input="onOpacity"
        />
        <span class="ref-image__unit">{{ Math.round(placement.opacity * 100) }}%</span>
      </label>
      <div class="ref-image__grid">
        <label class="ref-image__field">
          <span>X</span>
          <NumberField
            unit="mm"
            aria-label="Image X offset in millimetres"
            data-testid="sketch-image-x"
            :model-value="placement.offsetMm[0]"
            @update:model-value="commitOffset('x', $event)"
          />
          <span class="ref-image__unit">mm</span>
        </label>
        <label class="ref-image__field">
          <span>Y</span>
          <NumberField
            unit="mm"
            aria-label="Image Y offset in millimetres"
            data-testid="sketch-image-y"
            :model-value="placement.offsetMm[1]"
            @update:model-value="commitOffset('y', $event)"
          />
          <span class="ref-image__unit">mm</span>
        </label>
        <label class="ref-image__field">
          <span>Rot</span>
          <NumberField
            unit="deg"
            aria-label="Image rotation in degrees"
            data-testid="sketch-image-rotation"
            :model-value="placement.rotationDeg"
            @update:model-value="commitRotation($event)"
          />
          <span class="ref-image__unit">°</span>
        </label>
      </div>
      <div class="ref-image__row">
        <BaseButton
          size="compact"
          data-testid="sketch-image-scale"
          :pressed="editor.imageTool === 'scale'"
          title="Draw a line along the ruler in the photo, then type its real length"
          @click="editor.imageTool === 'scale' ? editor.cancelScale() : editor.armScale()"
        >
          Set scale
        </BaseButton>
        <BaseButton
          size="compact"
          data-testid="sketch-image-trace"
          :pressed="editor.imageTool === 'trace'"
          :aria-busy="editor.traceRunning"
          title="Tap inside a part in the photo to get its outline, holes included"
          @click="editor.imageTool === 'trace' ? editor.finishTrace() : editor.armTrace()"
        >
          Auto-trace
        </BaseButton>
      </div>
    </template>
  </section>
</template>

<style scoped>
.ref-image {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--border-strong);
}

.ref-image__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ref-image__help {
  margin: -13px -8px -13px auto;
}

.ref-image__title {
  margin: 0;
  font-size: var(--text-size-xs);
  font-weight: var(--weight-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-2);
}

.ref-image__badge {
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--text-1);
  font-size: var(--text-size-xs);
  white-space: nowrap;
}

.ref-image__badge--warn {
  background: color-mix(in srgb, var(--warn) 22%, transparent);
}

.ref-image__removed,
.ref-image__error {
  margin: 0;
  font-size: var(--text-size-sm);
  color: var(--warn);
}

.ref-image__row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* Visually hidden, still reachable by the button above and by tests. */
.ref-image__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.ref-image__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ref-image__field {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.ref-image__field--wide input[type='range'] {
  flex: 1 1 auto;
  min-width: 120px;
}

.ref-image__field input[type='text'] {
  width: 56px;
  min-height: var(--tap-compact);
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: var(--text-size-md);
}

.ref-image__unit {
  color: var(--text-3);
  font-size: var(--text-size-xs);
}
</style>
