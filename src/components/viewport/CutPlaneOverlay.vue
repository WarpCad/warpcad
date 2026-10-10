<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Split sheet's cut plane, drawn over the viewport (`TODO/io-007`): a translucent
 * quadrilateral where the plane slices the body, and a round handle at its centre that drags
 * the plane along its axis — the touch-friendly half of the sheet's offset control (the
 * number field is the other half; both write the same `offsetMm`).
 *
 * Geometry comes from `src/render/cutPlane.js`, re-projected by `Viewport.vue` every frame
 * so the plane stays on the body while the camera moves. Only the handle takes pointer
 * events; the plane itself never swallows a click meant for the canvas.
 *
 * The handle is a 44 px target (`--tap`) at every width. `data-cut-mm`, `data-axis-x/y` and
 * `data-px-per-mm` are for specs: where the plane is, and which way a drag moves it.
 */
import { computed } from 'vue'

import { cutPlaneDragDeltaMm } from '../../render/cutPlane.js'
import { useSplitSheetStore } from '../../stores/splitSheet.js'

const props = defineProps({
  /** `src/render/cutPlane.js`'s annotation, mutated in place each frame. */
  annotation: {
    type: /** @type {import('vue').PropType<import('../../render/cutPlane.js').CutPlaneAnnotation>} */ (Object),
    required: true,
  },
})

const sheet = useSplitSheetStore()

const shown = computed(() => sheet.isOpen && props.annotation.visible && Number.isFinite(sheet.cutMm))
const pxPerMm = computed(() => Math.hypot(props.annotation.axisX, props.annotation.axisY))

/** The drag in progress: where it began and the offset it began at. Plain, not reactive. */
const drag = { pointerId: -1, lastX: 0, lastY: 0, startOffsetMm: 0, travelMm: 0 }

/** @param {PointerEvent} event */
function onDown(event) {
  if (typeof sheet.offsetMm !== 'number') return
  event.preventDefault()
  event.stopPropagation()
  drag.pointerId = event.pointerId
  drag.lastX = event.clientX
  drag.lastY = event.clientY
  drag.startOffsetMm = sheet.offsetMm
  drag.travelMm = 0
  const target = /** @type {Element} */ (event.currentTarget)
  try {
    target.setPointerCapture(event.pointerId)
  } catch {
    // A synthetic pointer (a spec) has no capture to take; moves still arrive on the handle.
  }
}

/** @param {PointerEvent} event */
function onMove(event) {
  if (event.pointerId !== drag.pointerId) return
  event.preventDefault()
  advance(event)
}

/**
 * Add this move's travel to the drag, in millimetres. Each step is converted with the axis as
 * projected *now*, so the handle keeps tracking the finger while perspective changes how many
 * pixels a millimetre is as the plane moves — a single start-to-now conversion would drift.
 *
 * @param {PointerEvent} event
 */
function advance(event) {
  drag.travelMm += cutPlaneDragDeltaMm(props.annotation, event.clientX - drag.lastX, event.clientY - drag.lastY)
  drag.lastX = event.clientX
  drag.lastY = event.clientY
  sheet.dragOffset(drag.startOffsetMm, drag.travelMm)
}

/** @param {PointerEvent} event */
function onUp(event) {
  if (event.pointerId !== drag.pointerId) return
  drag.pointerId = -1
  // A cancelled pointer (the browser took the touch over) carries no position: keep the offset
  // the drag had reached rather than computing a move from coordinates it does not have.
  if (event.type === 'pointercancel') return
  advance(event)
}
</script>

<template>
  <svg
    v-if="shown"
    class="cut-plane"
    data-testid="cut-plane"
    :data-cut-mm="sheet.cutMm.toFixed(2)"
    :data-axis-x="annotation.axisX.toFixed(4)"
    :data-axis-y="annotation.axisY.toFixed(4)"
    :data-px-per-mm="pxPerMm.toFixed(4)"
    aria-hidden="true"
  >
    <polygon class="cut-plane__fill" :points="annotation.points" />
    <circle
      class="cut-plane__handle"
      data-testid="cut-plane-handle"
      :cx="annotation.handleX"
      :cy="annotation.handleY"
      r="22"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    />
    <circle class="cut-plane__dot" :cx="annotation.handleX" :cy="annotation.handleY" r="7" />
  </svg>
</template>

<style scoped>
.cut-plane {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  /* The handle is dragged with a finger: the browser must not claim the touch for a scroll or zoom. */
  touch-action: none;
  z-index: 3;
}

.cut-plane__fill {
  fill: var(--accent);
  fill-opacity: 0.18;
  stroke: var(--accent);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
}

.cut-plane__handle {
  fill: var(--accent);
  fill-opacity: 0.22;
  stroke: var(--accent);
  stroke-width: 2;
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
}

.cut-plane__dot {
  fill: var(--accent);
  pointer-events: none;
}
</style>
