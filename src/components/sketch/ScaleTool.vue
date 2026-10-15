<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Set scale**'s banner (`TODO/sketch-003`): shown across the top of the viewport while the
 * two-point tool is armed, in the slot the Sketch toolbar gives up for the duration.
 *
 * 1. "Press on one ruler mark and drag to another — or tap both marks." Mouse and touch
 *    behave the same and no modifier key is used; two fingers still pan and zoom.
 * 2. A length field with a **mm / cm / in** picker, and **Apply**.
 * 3. If the slice already has outlines, a confirm: "Rescale the N outlines on this slice to
 *    match the image?" — **Yes** is the default, because the user may have traced first and
 *    calibrated second. Either answer is part of the draft, so Cancel still undoes it.
 *
 * **Cancel** (or Esc) stands the tool down and changes nothing. The line itself is drawn on
 * the photo by `ReferenceImageOverlay.vue`.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { LENGTH_UNITS } from '../../sketch/calibration.js'
import { parseNumeric } from '../../composables/numericEntry.js'
import HelpButton from '../controls/HelpButton.vue'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'

const editor = useSketchEditorStore()

const length = ref('')
const unit = ref(/** @type {import('../../sketch/calibration.js').LengthUnit} */ ('mm'))
const error = ref('')
/** The outline count the confirm asks about, or 0 when not confirming. */
const confirming = ref(0)
const lengthInput = ref(/** @type {HTMLInputElement | null} */ (null))
const yesButton = ref(/** @type {HTMLButtonElement | null} */ (null))

const step = computed(() => editor.scaleStep)
const UNITS = Object.keys(LENGTH_UNITS)

const instruction = computed(() => {
  if (step.value === 'first') return 'Set scale: press on one ruler mark and drag to another — or tap both marks'
  if (step.value === 'second') return 'Now tap the second ruler mark'
  return 'How long is that line?'
})

// Each time the tool is armed, start clean; when the line is drawn, put the cursor in Length.
watch(step, async (next, previous) => {
  if (next === 'first' && previous === '') {
    error.value = ''
    confirming.value = 0
    const calibration = editor.activeImage.placement?.calibration
    length.value = calibration ? String(calibration.length) : ''
    unit.value = calibration?.unit ?? unit.value
  }
  if (next === 'length') {
    await nextTick()
    lengthInput.value?.focus()
  }
})

function apply() {
  const parsed = parseNumeric(length.value)
  if (parsed === null || !(parsed > 0)) {
    error.value = 'Type the line’s real length — a number greater than 0'
    return
  }
  const outlines = editor.slice?.profiles.length ?? 0
  if (outlines > 0) {
    confirming.value = outlines
    nextTick(() => yesButton.value?.focus())
    return
  }
  finish(false)
}

/** @param {boolean} rescaleOutlines */
function finish(rescaleOutlines) {
  const parsed = parseNumeric(length.value) ?? 0
  const problem = editor.applyScale(parsed, unit.value, rescaleOutlines)
  confirming.value = 0
  error.value = problem
}

function cancel() {
  confirming.value = 0
  error.value = ''
  editor.cancelScale()
}
</script>

<template>
  <div
    v-if="editor.imageTool === 'scale'"
    class="scale-tool"
    role="dialog"
    aria-label="Set scale"
    data-testid="sketch-scale-tool"
    :data-step="confirming ? 'confirm' : step"
  >
    <template v-if="confirming">
      <p class="scale-tool__text" data-testid="sketch-scale-confirm-text">
        Rescale the {{ confirming }} outline{{ confirming === 1 ? '' : 's' }} on this slice to match the image?
      </p>
      <div class="scale-tool__row">
        <button ref="yesButton" type="button" class="scale-tool__btn scale-tool__btn--primary" data-testid="sketch-scale-rescale-yes" @click="finish(true)">Yes</button>
        <button type="button" class="scale-tool__btn" data-testid="sketch-scale-rescale-no" @click="finish(false)">No</button>
      </div>
    </template>
    <template v-else>
      <div class="scale-tool__lead">
        <p class="scale-tool__text" data-testid="sketch-scale-instruction">{{ instruction }}</p>
        <HelpButton topic="scale" class="scale-tool__help" />
      </div>
      <form v-if="step === 'length'" class="scale-tool__row" @submit.prevent="apply">
        <input
          ref="lengthInput"
          v-model="length"
          class="scale-tool__length"
          type="text"
          inputmode="decimal"
          aria-label="Length of the line"
          data-testid="sketch-scale-length"
        />
        <select v-model="unit" class="scale-tool__unit" aria-label="Unit" data-testid="sketch-scale-unit">
          <option v-for="entry in UNITS" :key="entry" :value="entry">{{ entry }}</option>
        </select>
        <button type="submit" class="scale-tool__btn scale-tool__btn--primary" data-testid="sketch-scale-apply">Apply</button>
        <button type="button" class="scale-tool__btn" data-testid="sketch-scale-cancel" @click="cancel">Cancel</button>
      </form>
      <div v-else class="scale-tool__row">
        <button type="button" class="scale-tool__btn" data-testid="sketch-scale-cancel" @click="cancel">Cancel</button>
      </div>
    </template>
    <p v-if="error" class="scale-tool__error" role="alert" data-testid="sketch-scale-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.scale-tool {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  max-width: 560px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 8px 10px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-overlay);
  z-index: 14;
}

.scale-tool__lead {
  flex: 1 1 220px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.scale-tool__help {
  margin: -8px -8px -8px 0;
}

.scale-tool__text {
  flex: 1 1 auto;
  margin: 0;
  font-size: 13px;
  color: var(--text-1);
}

.scale-tool__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.scale-tool__length {
  width: 72px;
  min-height: var(--tap-target, 44px);
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: 15px;
}

.scale-tool__unit {
  min-height: var(--tap-target, 44px);
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: 14px;
}

.scale-tool__btn {
  min-width: 44px;
  min-height: var(--tap-target, 44px);
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 13px;
  cursor: pointer;
}

.scale-tool__btn--primary {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 22%, var(--surface-1));
}

.scale-tool__error {
  flex: 1 1 100%;
  margin: 0;
  font-size: 12px;
  color: var(--warn);
}
</style>
