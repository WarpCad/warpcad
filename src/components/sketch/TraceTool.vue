<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Auto-trace**'s banner (`TODO/sketch-004`): shown across the top of the viewport while the
 * tap tool is armed, in the slot the Sketch toolbar gives up for the duration — the same
 * place as Set scale's (`ScaleTool.vue`).
 *
 * - "Auto-trace: tap inside the part". A tap (mouse or finger, no modifier) traces the
 *   region under it in the image worker; a spinner shows while it runs, and a newer tap
 *   supersedes it.
 * - What the tap made — "Traced 1 outline and 2 holes — 37 points" — or why it made nothing.
 *   On a photo that has not been scaled yet it says so, before the first tap and after.
 * - **Adjust** shows the **Tolerance** (mm, default 0.5) and **Threshold** (Auto = Otsu, or a
 *   manual gray level) sliders. Moving either re-traces the last tap in place. Open by
 *   default where there is room; folded on a narrow viewport so the photo stays tappable
 *   (the ≥ 69% reachable-canvas rule).
 * - **Cancel** stands the tool down; once something was traced it reads **Finish**, which
 *   also arms Select with the traced outline picked, ready for vertex clean-up. Esc does the
 *   same.
 */
import { computed, ref } from 'vue'

import { formatMmValue } from '../../core/units.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'

const editor = useSketchEditorStore()

/** The sliders are open by default only where the banner has room for them. */
const WIDE = '(min-width: 900px)'
const adjustOpen = ref(typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE).matches : true)

const calibrated = computed(() => Boolean(editor.activeImage.placement?.calibration))
const autoThreshold = computed(() => editor.traceThreshold === null)
const thresholdShown = computed(() => editor.traceThreshold ?? editor.traceThresholdUsed ?? 128)

/** What the status line says: the last tap's outcome, else the scale warning, else nothing. */
const status = computed(() => {
  if (editor.traceMessage) return { text: editor.traceMessage, kind: editor.traceMessageKind }
  if (!calibrated.value) return { text: 'Not to scale yet — outlines will use 1 px = 0.1 mm until you Set scale', kind: 'warn' }
  return { text: '', kind: '' }
})

/** @param {Event} event */
function onTolerance(event) {
  editor.setTraceTolerance(Number(/** @type {HTMLInputElement} */ (event.target).value))
}

/** @param {Event} event */
function onThreshold(event) {
  editor.setTraceThreshold(Number(/** @type {HTMLInputElement} */ (event.target).value))
}

function toggleAuto() {
  editor.setTraceThreshold(autoThreshold.value ? (editor.traceThresholdUsed ?? 128) : null)
}
</script>

<template>
  <div
    v-if="editor.imageTool === 'trace'"
    class="trace-tool"
    role="dialog"
    aria-label="Auto-trace"
    data-testid="sketch-trace-tool"
    :data-state="editor.traceRunning ? 'running' : 'idle'"
    :data-traced="editor.tracedThisArming"
  >
    <div class="trace-tool__row trace-tool__row--head">
      <p class="trace-tool__text" data-testid="sketch-trace-instruction">Auto-trace: tap inside the part</p>
      <span
        v-if="editor.traceRunning"
        class="trace-tool__spinner"
        role="progressbar"
        aria-label="Tracing…"
        data-testid="sketch-trace-spinner"
      />
      <button
        type="button"
        class="trace-tool__btn"
        data-testid="sketch-trace-adjust"
        :aria-expanded="adjustOpen"
        title="Tolerance and threshold"
        @click="adjustOpen = !adjustOpen"
      >
        Adjust
      </button>
      <button
        type="button"
        class="trace-tool__btn"
        :class="{ 'trace-tool__btn--primary': editor.tracedThisArming > 0 }"
        data-testid="sketch-trace-finish"
        @click="editor.finishTrace()"
      >
        {{ editor.tracedThisArming > 0 ? 'Finish' : 'Cancel' }}
      </button>
    </div>

    <div v-if="adjustOpen" class="trace-tool__row" data-testid="sketch-trace-settings">
      <label class="trace-tool__field">
        <span>Tolerance</span>
        <input
          type="range"
          min="0.1"
          max="3"
          step="0.1"
          data-testid="sketch-trace-tolerance"
          aria-label="Tolerance in millimetres: how closely the outline follows the pixels"
          :value="editor.traceToleranceMm"
          @input="onTolerance"
        />
        <span class="trace-tool__value" data-testid="sketch-trace-tolerance-value">{{ formatMmValue(editor.traceToleranceMm) }} mm</span>
      </label>
      <div class="trace-tool__field">
        <span>Threshold</span>
        <button
          type="button"
          class="trace-tool__btn trace-tool__btn--small"
          data-testid="sketch-trace-threshold-auto"
          :aria-pressed="autoThreshold"
          title="Automatic threshold (Otsu) — or pick one with the slider"
          @click="toggleAuto"
        >
          Auto
        </button>
        <input
          type="range"
          min="1"
          max="254"
          step="1"
          data-testid="sketch-trace-threshold"
          aria-label="Threshold: the gray level between part and background"
          :value="thresholdShown"
          @input="onThreshold"
        />
        <span class="trace-tool__value" data-testid="sketch-trace-threshold-value">{{ autoThreshold ? `Auto${editor.traceThresholdUsed === null ? '' : ` (${editor.traceThresholdUsed})`}` : thresholdShown }}</span>
      </div>
    </div>

    <p
      v-if="status.text"
      class="trace-tool__status"
      :class="`trace-tool__status--${status.kind}`"
      role="status"
      data-testid="sketch-trace-message"
      :data-kind="status.kind"
    >
      {{ status.text }}
    </p>
  </div>
</template>

<style scoped>
.trace-tool {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px 6px 10px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-overlay);
  z-index: 14;
}

.trace-tool__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.trace-tool__row--head {
  flex-wrap: nowrap;
  gap: 6px;
}

.trace-tool__text {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  color: var(--text-1);
}

.trace-tool__field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}

.trace-tool__field input[type='range'] {
  width: 110px;
  min-height: var(--tap-target, 44px);
}

.trace-tool__value {
  min-width: 52px;
  color: var(--text-1);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.trace-tool__btn {
  flex: none;
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

.trace-tool__btn--small {
  padding: 0 8px;
  font-size: 12px;
}

.trace-tool__btn[aria-pressed='true'],
.trace-tool__btn[aria-expanded='true'] {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}

.trace-tool__btn--primary {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 22%, var(--surface-1));
}

.trace-tool__status {
  margin: 0;
  font-size: 12px;
  color: var(--text-1);
}

.trace-tool__status--warn {
  color: var(--warn);
}

.trace-tool__status--error {
  color: var(--warn);
  font-weight: 600;
}

.trace-tool__spinner {
  flex: none;
  width: 18px;
  height: 18px;
  border: 2px solid color-mix(in srgb, var(--accent) 30%, transparent);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: trace-spin 0.8s linear infinite;
}

@keyframes trace-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .trace-tool__spinner {
    animation-duration: 2.4s;
  }
}
</style>
