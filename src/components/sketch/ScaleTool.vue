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
import NumberField from '../controls/NumberField.vue'
import HelpButton from '../controls/HelpButton.vue'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'
import BaseButton from '../controls/BaseButton.vue'

const editor = useSketchEditorStore()

const length = ref(/** @type {number | null} */ (null))
const unit = ref(/** @type {import('../../sketch/calibration.js').LengthUnit} */ ('mm'))
const error = ref('')
/** The outline count the confirm asks about, or 0 when not confirming. */
const confirming = ref(0)
const lengthInput = ref(/** @type {{ focus: () => void } | null} */ (null))
const yesButton = ref(/** @type {{ focus: () => void } | null} */ (null))

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
    length.value = calibration ? calibration.length : null
    unit.value = calibration?.unit ?? unit.value
  }
  if (next === 'length') {
    await nextTick()
    lengthInput.value?.focus()
  }
})

function apply() {
  const parsed = length.value
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
  const parsed = length.value ?? 0
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
        <BaseButton ref="yesButton" variant="primary" narrow data-testid="sketch-scale-rescale-yes" @click="finish(true)">Yes</BaseButton>
        <BaseButton narrow data-testid="sketch-scale-rescale-no" @click="finish(false)">No</BaseButton>
      </div>
    </template>
    <template v-else>
      <div class="scale-tool__lead">
        <p class="scale-tool__text" data-testid="sketch-scale-instruction">{{ instruction }}</p>
        <HelpButton topic="scale" class="scale-tool__help" />
      </div>
      <form v-if="step === 'length'" class="scale-tool__row" @submit.prevent="apply">
        <NumberField
          ref="lengthInput"
          v-model="length"
          class="scale-tool__length"
          nullable
          live
          submit
          aria-label="Length of the line"
          data-testid="sketch-scale-length"
        />
        <select v-model="unit" class="scale-tool__unit" aria-label="Unit" data-testid="sketch-scale-unit">
          <option v-for="entry in UNITS" :key="entry" :value="entry">{{ entry }}</option>
        </select>
        <BaseButton type="submit" variant="primary" narrow data-testid="sketch-scale-apply">Apply</BaseButton>
        <BaseButton narrow data-testid="sketch-scale-cancel" @click="cancel">Cancel</BaseButton>
      </form>
      <div v-else class="scale-tool__row">
        <BaseButton narrow data-testid="sketch-scale-cancel" @click="cancel">Cancel</BaseButton>
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
  gap: var(--space-3) var(--space-4h);
  padding: var(--space-4) var(--space-4h);
  border: 1px solid var(--accent);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-overlay);
  z-index: calc(var(--z-panel) + 4);
}

.scale-tool__lead {
  flex: 1 1 220px;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.scale-tool__help {
  margin: -8px -8px -8px 0;
}

.scale-tool__text {
  flex: 1 1 auto;
  margin: 0;
  font-size: var(--text-size-md);
  color: var(--text-1);
}

.scale-tool__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.scale-tool__length {
  width: 72px;
  min-height: var(--tap);
  padding: 0 var(--space-4);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: var(--text-size-title);
}

.scale-tool__unit {
  min-height: var(--tap);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: var(--text-size-lg);
}

.scale-tool__error {
  flex: 1 1 100%;
  margin: 0;
  font-size: var(--text-size-sm);
  color: var(--warn);
}
</style>
