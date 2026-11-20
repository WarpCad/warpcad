<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The armed placement session's surface and chip (`TODO/ui-107`), mounted in the viewport.
 *
 * - **Precondition**: a session is armed (`placement.armed`) — File → Import model… has read a
 *   file and its ghost is waiting to be placed.
 * - **Trigger**: hover over the view moves the ghost; a click commits there. On touch the ghost
 *   starts at the centre of the view, a one-finger drag moves it, and lifting the finger commits.
 *   **Cancel** on the chip, or Esc, ends the session with nothing added.
 * - **Feedback**: the translucent ghost (the viewport's own Library-drag preview, with its snap
 *   guides), the chip *Place bracket.stl · Cancel*, and on commit the selected body.
 *
 * The surface is a transparent layer directly over the canvas and under every other overlay, so
 * the navigation chrome, the view cube and the toolbars stay usable during a session. It takes the
 * canvas's pointer input for the session's length (an orbit drag would be a placement drag here),
 * and hands the wheel back to the viewport so zoom still works with a mouse.
 *
 * The pointer path writes nothing reactive and allocates nothing: each event is two numbers into
 * `placement.hover`, which moves the ghost through the drop target's existing preview.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

import BaseButton from '../controls/BaseButton.vue'
import { useModelImportStore } from '../../stores/modelImport.js'
import { usePlacementStore } from '../../stores/placement.js'

const emit = defineEmits(['wheel'])

const placement = usePlacementStore()
const modelImport = useModelImportStore()
const layerEl = ref(/** @type {HTMLElement | null} */ (null))

/** A press on the surface is under way (touch drag, or a mouse button held). Not reactive. */
let pressed = false
let pointerId = -1

const chipEl = ref(/** @type {HTMLElement | null} */ (null))

/** Where the ghost started, for `data-start-x`/`-y`: what a finger reaches for first. */
const start = ref(/** @type {{ x: number, y: number } | null} */ (null))

/**
 * Start the ghost at the centre of the **visible** grid, so a touch user sees it before touching
 * anything. Not the centre of the viewport's box: at phone width a selection opens the Inspector
 * sheet over the lower half of the view, and the box's centre is under it, out of reach. The band
 * that shows runs from the top of the view down to the chip, which sits above any sheet; a point
 * in it that an overlay still covers (a toolbar) is stepped past, toward the chip, then upward.
 * Measured once per session, never in the pointer path.
 */
function startAtCentre() {
  const layer = layerEl.value
  const parent = layer?.parentElement
  if (!layer || !parent) return
  const box = parent.getBoundingClientRect()
  const top = box.top
  const bottom = Math.min(box.bottom, chipEl.value?.getBoundingClientRect().top ?? box.bottom)
  const x = box.left + box.width / 2
  const middle = (top + Math.max(top, bottom)) / 2
  // A point counts only when the layer shows a finger's width of clearance around it, so the ghost
  // never starts flush against a toolbar's edge (a pixel of rounding would put it underneath).
  const CLEAR_PX = 16
  const shows = (/** @type {number} */ y) =>
    [-CLEAR_PX, 0, CLEAR_PX].every((dy) => [-CLEAR_PX, 0, CLEAR_PX].every((dx) => document.elementFromPoint(x + dx, y + dy) === layer))
  let y = middle
  if (!shows(y)) {
    const STEP_PX = 16
    let found = null
    for (let probe = middle + STEP_PX; probe < bottom && found === null; probe += STEP_PX) if (shows(probe)) found = probe
    for (let probe = middle - STEP_PX; probe > top && found === null; probe -= STEP_PX) if (shows(probe)) found = probe
    y = found ?? middle
  }
  y = Math.round(y)
  start.value = { x, y }
  placement.hover(x, y)
}

/** @param {PointerEvent} event */
function onPointerDown(event) {
  if (event.button !== 0 || pressed) return
  pressed = true
  pointerId = event.pointerId
  layerEl.value?.setPointerCapture?.(event.pointerId)
  event.preventDefault()
  placement.hover(event.clientX, event.clientY)
}

/** @param {PointerEvent} event */
function onPointerMove(event) {
  if (pressed && event.pointerId !== pointerId) return
  placement.hover(event.clientX, event.clientY)
}

/** @param {PointerEvent} event */
function onPointerUp(event) {
  if (!pressed || event.pointerId !== pointerId) return
  pressed = false
  pointerId = -1
  placement.commitArmed(event.clientX, event.clientY)
}

function onPointerCancel() {
  pressed = false
  pointerId = -1
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Escape' || !placement.armed) return
  event.preventDefault()
  event.stopPropagation()
  modelImport.cancelPlacement()
}

watch(
  () => placement.armed,
  async (armed) => {
    pressed = false
    pointerId = -1
    if (!armed) {
      window.removeEventListener('keydown', onKeydown, true)
      return
    }
    window.addEventListener('keydown', onKeydown, true)
    await nextTick()
    startAtCentre()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <template v-if="placement.armed">
    <div
      ref="layerEl"
      class="session-layer"
      data-testid="placement-session-layer"
      :data-start-x="start ? Math.round(start.x) : undefined"
      :data-start-y="start ? Math.round(start.y) : undefined"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @wheel="emit('wheel', $event)"
      @contextmenu.prevent
    />
    <div ref="chipEl" class="session-chip" role="status" data-testid="placement-chip">
      <span class="session-chip__text" data-testid="placement-chip-label">Place {{ placement.label }}</span>
      <span class="session-chip__dot" aria-hidden="true">·</span>
      <BaseButton narrow class="session-chip__cancel" data-testid="placement-chip-cancel" @click="modelImport.cancelPlacement()">
        Cancel
      </BaseButton>
    </div>
  </template>
</template>

<style scoped>
.session-layer {
  position: absolute;
  inset: 0;
  /* Over the canvas, under every later overlay (they come after it in the viewport). */
  z-index: var(--z-canvas-overlay);
  touch-action: none;
  cursor: crosshair;
}

/* Bottom centre, above whatever the phone's sheets and tabs cover (`--layout-viewport-bottom-inset`), in a
   row of its own: the viewport lifts the navigation chrome and the scale readout by
   `--layout-placement-chip-room` while a session is armed. */
.session-chip {
  position: absolute;
  left: 50%;
  bottom: calc(12px + var(--layout-viewport-bottom-inset));
  z-index: calc(var(--z-canvas-overlay) + 6);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  max-width: calc(100% - 32px);
  padding: var(--space-2) var(--space-2) var(--space-2) var(--space-5h);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
  color: var(--text-1);
  font-size: var(--text-size-md);
  transform: translateX(-50%);
}

.session-chip__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-chip__dot {
  color: var(--text-3);
}

/* The chip's pill shape is the one thing this button keeps from its own rule. */
.session-chip .session-chip__cancel {
  border-radius: var(--radius-pill);
}
</style>
