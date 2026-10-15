<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * One connector marker on the Split sheet's cut plane (`TODO/ui-067`): a glyph per kind —
 * disc for a post, diamond for a wedge, ring for a screw boss, a short bar for a tongue the
 * search seeded — at a screen position the overlay computes, with a 28 px hit area behind the
 * smaller glyph (the touch-target rule `io-007` set for the offset handle).
 *
 * It only reports pointer events; the overlay turns them into face positions and the store
 * decides whether a position fits. A cancelled pointer (the browser taking the touch over)
 * is reported as `cancel`, never as a move, so the marker cannot jump anywhere from
 * coordinates the browser did not send.
 *
 * Remove: **×** on the selected marker, right-click, or a long press (600 ms without moving).
 */
import { onBeforeUnmount } from 'vue'

import { CONNECTOR_LABELS } from '../../stores/splitSheet.js'

const props = defineProps({
  id: { type: String, required: true },
  kind: { type: String, required: true },
  uMm: { type: Number, required: true },
  vMm: { type: Number, required: true },
  /** Screen position, CSS px in the overlay's frame. */
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  selected: { type: Boolean, default: false },
  /** `'ok'` fits, `'bad'` the kernel refused it, `'pending'` a check is running. */
  state: { type: String, default: 'ok' },
  dragging: { type: Boolean, default: false },
})

const emit = defineEmits(['select', 'drag-start', 'drag', 'drag-end', 'cancel', 'remove'])

/** How long a press must stay still to remove the marker, ms. */
const LONG_PRESS_MS = 600
/** How far a press may wander and still be a long press, px. */
const LONG_PRESS_SLOP_PX = 6

let pointerId = -1
let startX = 0
let startY = 0
let moved = false
/** @type {ReturnType<typeof setTimeout> | null} */
let timer = null

function clearTimer() {
  if (timer !== null) clearTimeout(timer)
  timer = null
}
onBeforeUnmount(clearTimer)

/** @param {PointerEvent} event */
function onDown(event) {
  if (event.button > 0) return
  event.preventDefault()
  event.stopPropagation()
  pointerId = event.pointerId
  startX = event.clientX
  startY = event.clientY
  moved = false
  emit('select', props.id)
  emit('drag-start', { id: props.id, clientX: event.clientX, clientY: event.clientY })
  const target = /** @type {Element} */ (event.currentTarget)
  try {
    target.setPointerCapture(event.pointerId)
  } catch {
    // A synthetic pointer has nothing to capture; moves still arrive on the marker.
  }
  clearTimer()
  timer = setTimeout(() => {
    timer = null
    if (pointerId < 0 || moved) return
    pointerId = -1
    emit('cancel', props.id)
    emit('remove', props.id)
  }, LONG_PRESS_MS)
}

/** @param {PointerEvent} event */
function onMove(event) {
  if (event.pointerId !== pointerId) return
  event.preventDefault()
  if (!moved && Math.hypot(event.clientX - startX, event.clientY - startY) > LONG_PRESS_SLOP_PX) {
    moved = true
    clearTimer()
  }
  if (moved) emit('drag', { id: props.id, clientX: event.clientX, clientY: event.clientY })
}

/** @param {PointerEvent} event */
function onUp(event) {
  if (event.pointerId !== pointerId) return
  pointerId = -1
  clearTimer()
  if (event.type === 'pointercancel') {
    emit('cancel', props.id)
    return
  }
  if (moved) emit('drag-end', { id: props.id, clientX: event.clientX, clientY: event.clientY })
  else emit('cancel', props.id)
}

/** @param {MouseEvent} event */
function onContext(event) {
  event.preventDefault()
  emit('remove', props.id)
}
</script>

<template>
  <g
    class="marker"
    :class="[`marker--${state}`, { 'marker--selected': selected, 'marker--dragging': dragging }]"
    :transform="`translate(${x.toFixed(1)} ${y.toFixed(1)})`"
    data-testid="connector-marker"
    :data-marker-id="id"
    :data-kind="kind"
    :data-state="state"
    :data-selected="selected"
    :data-dragging="dragging"
    :data-u-mm="uMm.toFixed(2)"
    :data-v-mm="vMm.toFixed(2)"
  >
    <title>{{ CONNECTOR_LABELS[/** @type {'pins'} */ (kind)] ?? kind }}</title>
    <circle
      class="marker__hit"
      r="14"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @contextmenu="onContext"
    />
    <circle v-if="kind === 'pins'" class="marker__glyph marker__glyph--solid" r="6" />
    <path v-else-if="kind === 'wedge'" class="marker__glyph marker__glyph--solid" d="M0 -8 L8 0 L0 8 L-8 0 Z" />
    <circle v-else-if="kind === 'screwBoss'" class="marker__glyph marker__glyph--ring" r="7" />
    <rect v-else class="marker__glyph marker__glyph--solid" x="-9" y="-4" width="18" height="8" rx="2" />
    <circle v-if="selected" class="marker__selection" r="12" />
    <g
      v-if="selected && !dragging"
      class="marker__remove"
      data-testid="connector-marker-remove"
      transform="translate(16 -16)"
      @pointerdown.stop.prevent="emit('remove', id)"
    >
      <circle r="12" />
      <path d="M-4 -4 L4 4 M4 -4 L-4 4" />
      <title>Remove this connector</title>
    </g>
  </g>
</template>

<style scoped>
.marker {
  --marker-color: var(--accent);
}

.marker--bad {
  --marker-color: var(--danger);
}

.marker--pending {
  --marker-color: var(--text-2);
}

.marker__hit {
  fill: transparent;
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
}

.marker--dragging .marker__hit {
  cursor: grabbing;
}

.marker__glyph {
  pointer-events: none;
  stroke: var(--surface-0);
  stroke-width: 1.5;
}

.marker__glyph--solid {
  fill: var(--marker-color);
}

.marker__glyph--ring {
  fill: var(--surface-0);
  fill-opacity: 0.5;
  stroke: var(--marker-color);
  stroke-width: 3;
}

.marker__selection {
  fill: none;
  stroke: var(--marker-color);
  stroke-width: 1.5;
  stroke-dasharray: 3 3;
  pointer-events: none;
}

.marker__remove {
  cursor: pointer;
  pointer-events: auto;
  touch-action: none;
}

.marker__remove circle {
  fill: var(--surface-2);
  stroke: var(--border-strong);
}

.marker__remove path {
  fill: none;
  stroke: var(--text-1);
  stroke-width: 2;
  stroke-linecap: round;
}
</style>
