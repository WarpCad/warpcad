<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * What is drawn *over* the reference photo (`TODO/sketch-003`), in viewport pixels: the Set
 * scale line — dashed while it is being drawn, then in dimension style labelled with the
 * length as typed ("5 in") — and the badge under the photo's bottom-left corner, **Not to scale** until Set scale
 * has been applied, then "1 px = 0.199 mm".
 *
 * Pointer-transparent throughout: it must never swallow a press meant for the canvas
 * (ui-020 finding #1). The photo itself is not here — it is drawn in WebGL
 * (`src/render/referenceImage.js`).
 */
defineProps({
  overlay: { type: Object, required: true },
})
</script>

<template>
  <svg class="ref-overlay" aria-hidden="true" data-testid="sketch-image-overlay">
    <g v-if="overlay.line.visible" :class="overlay.line.pending ? 'ref-overlay__line--pending' : 'ref-overlay__line--dimension'" data-testid="sketch-scale-line">
      <line :x1="overlay.line.x1" :y1="overlay.line.y1" :x2="overlay.line.x2" :y2="overlay.line.y2" class="ref-overlay__halo" />
      <line :x1="overlay.line.x1" :y1="overlay.line.y1" :x2="overlay.line.x2" :y2="overlay.line.y2" class="ref-overlay__stroke" />
      <circle :cx="overlay.line.x1" :cy="overlay.line.y1" r="4" class="ref-overlay__end" />
      <circle :cx="overlay.line.x2" :cy="overlay.line.y2" r="4" class="ref-overlay__end" />
      <text
        v-if="overlay.line.label"
        :x="overlay.line.labelX"
        :y="overlay.line.labelY"
        class="ref-overlay__label"
        text-anchor="middle"
        data-testid="sketch-scale-line-label"
      >{{ overlay.line.label }}</text>
    </g>
  </svg>
  <span
    v-if="overlay.badge.visible && overlay.badge.text"
    class="ref-overlay__badge"
    :class="{ 'ref-overlay__badge--warn': !overlay.badge.calibrated }"
    :style="{ left: `${overlay.badge.x}px`, top: `${overlay.badge.y}px` }"
    data-testid="sketch-image-corner-badge"
  >{{ overlay.badge.text }}</span>
</template>

<style scoped>
.ref-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
  z-index: 4;
}

.ref-overlay__halo {
  stroke: var(--surface-0);
  stroke-width: 5;
  stroke-linecap: round;
  opacity: 0.8;
}

.ref-overlay__stroke {
  stroke: var(--accent);
  stroke-width: 2;
}

.ref-overlay__line--pending .ref-overlay__stroke {
  stroke-dasharray: 6 4;
}

.ref-overlay__end {
  fill: var(--accent);
  stroke: var(--surface-0);
  stroke-width: 1.5;
}

.ref-overlay__label {
  fill: var(--text-1);
  font-size: 12px;
  font-weight: 600;
  paint-order: stroke;
  stroke: var(--surface-0);
  stroke-width: 3px;
}

.ref-overlay__badge {
  position: absolute;
  transform: translate(0, 4px);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 30%, var(--surface-1));
  color: var(--text-1);
  font-size: 11px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 4;
}

.ref-overlay__badge--warn {
  background: color-mix(in srgb, var(--warn) 35%, var(--surface-1));
}
</style>
