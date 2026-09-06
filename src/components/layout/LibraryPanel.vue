<script setup>
/**
 * The Library panel's "Primitives" section: one draggable row per `primitive.*`
 * op the kernel registry carries.
 *
 * ## One mechanism, seven rows
 *
 * CLAUDE.md forbids seven near-identical hand-copies, and it equally forbids a
 * menu built by blindly iterating a registry. Both are satisfied the same way:
 * the rows come from `src/core/library.js`, which derives them from the registry's
 * own `ui` metadata and `operandCount`, and the drag payload is nothing but the
 * op string. Registering an eighth primitive gives it a row, a ghost preview and
 * a working drop with no change to this file.
 *
 * These are **creation** rows — `operandCount: 0`, geometry from nothing — and
 * they live in their own section, never mixed into a list with operations like
 * union or fillet that need operands selected first.
 *
 * ## Input
 *
 * Pointer events only: one path for mouse, touch and pen (see
 * `src/stores/placement.js` for why, rather than the HTML5-DnD-plus-touch pair
 * the task sketched). Window-level listeners run for the life of the gesture, so
 * a drag that leaves the row — which every successful drag does, since the drop
 * target is the viewport — keeps tracking.
 *
 * ## Phone width
 *
 * At phone width the panel is a bottom sheet behind a "Library" tab
 * (`docs/decisions/interaction-model-qa.md` control 1, Q16): opening the sheet is
 * a precondition step that does not exist at tablet/laptop width, where the
 * column is always visible. The sheet deliberately does **not** close when a drag
 * starts — the drag has to be able to end over the viewport, but auto-closing
 * mid-gesture would yank the row out from under the finger that is holding it.
 */
import { onBeforeUnmount, ref, watch } from 'vue'

import { PRIMITIVE_LIBRARY } from '../../core/library.js'
import { usePlacementStore } from '../../stores/placement.js'

const props = defineProps({
  /**
   * Bumped by the root view when the user deliberately opens the Inspector
   * sheet. A counter rather than a boolean because it is an *event* — "the other
   * sheet just claimed the slot" — not a state this panel should mirror.
   */
  collapseSignal: { type: Number, default: 0 },
})

const emit = defineEmits(['open-change'])

const placement = usePlacementStore()

const rows = PRIMITIVE_LIBRARY
const isOpen = ref(false)

watch(
  () => props.collapseSignal,
  () => setOpen(false),
)

/** @param {boolean} value */
function setOpen(value) {
  if (isOpen.value === value) return
  isOpen.value = value
  emit('open-change', value)
}
const dragEl = ref(/** @type {HTMLElement | null} */ (null))

/** Unsubscribe handle for the placement store's pointer feed. */
let unsubscribe = /** @type {(() => void) | null} */ (null)

/**
 * Move the icon that follows the pointer while the drag is over ordinary UI.
 *
 * Written imperatively rather than through a reactive binding: this runs on every
 * `pointermove`, and CLAUDE.md's Performance section is explicit that the pointer
 * path must not push a reactive DOM update per event. It sets two style
 * properties on one already-mounted element and allocates nothing.
 */
function positionDragIcon() {
  const el = dragEl.value
  if (!el) return
  const { x, y, overTarget } = placement.pointer
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`
  // Over the viewport the translucent ghost mesh takes over as the preview, so
  // the icon steps aside rather than trailing a second cursor.
  el.style.opacity = overTarget ? '0' : '1'
}

/** @param {PointerEvent} event */
function onWindowPointerMove(event) {
  placement.move(event.clientX, event.clientY)
}

/** @param {PointerEvent} event */
function onWindowPointerUp(event) {
  placement.drop(event.clientX, event.clientY)
  stopTracking()
}

function onWindowPointerCancel() {
  placement.cancel()
  stopTracking()
}

function stopTracking() {
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', onWindowPointerUp)
  window.removeEventListener('pointercancel', onWindowPointerCancel)
  unsubscribe?.()
  unsubscribe = null
}

/**
 * @param {PointerEvent} event
 * @param {{ op: string, label: string }} row
 */
function onRowPointerDown(event, row) {
  // Left button / primary contact only: a right-click or a middle-click must not
  // start a placement the user can't see themselves having started.
  if (event.button !== 0) return
  event.preventDefault()
  stopTracking()
  unsubscribe = placement.subscribe(positionDragIcon)
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('pointercancel', onWindowPointerCancel)
  placement.begin(row.op, row.label, event.clientX, event.clientY)
}

onBeforeUnmount(stopTracking)
</script>

<template>
  <aside
    class="library"
    data-testid="library-panel"
    :data-open="isOpen ? 'true' : 'false'"
    :data-dragging="placement.isDragging ? 'true' : 'false'"
  >
    <button
      type="button"
      class="library__tab"
      data-testid="library-tab"
      :aria-expanded="isOpen"
      aria-controls="library-sheet"
      @click="setOpen(!isOpen)"
    >
      <span class="library__tab-grip" aria-hidden="true" />
      Library
    </button>

    <div id="library-sheet" class="library__sheet">
      <h2 class="library__heading">Primitives</h2>
      <p class="library__hint" data-testid="library-hint">
        Drag a shape into the 3D view to place it.
      </p>
      <ul class="library__rows" data-testid="library-rows">
        <li v-for="row in rows" :key="row.op">
          <button
            type="button"
            class="library__row"
            :class="{ 'library__row--active': placement.op === row.op }"
            :data-testid="`library-row-${row.op}`"
            :data-op="row.op"
            :data-label="row.label"
            @pointerdown="onRowPointerDown($event, row)"
          >
            <span class="library__swatch" :data-shape="row.op" aria-hidden="true" />
            {{ row.label }}
          </button>
        </li>
      </ul>
    </div>

    <!-- Follows the pointer while the drag is over ordinary UI; the viewport's
         ghost mesh replaces it once the drag crosses into the 3D view. -->
    <div
      v-show="placement.isDragging"
      ref="dragEl"
      class="library__drag-icon"
      data-testid="library-drag-icon"
      aria-hidden="true"
    >
      {{ placement.label }}
    </div>
  </aside>
</template>

<style scoped>
.library {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface-1);
  border-right: 1px solid var(--border);
}

.library__tab {
  /* Tablet and laptop keep the column visible, so the tab is phone-only. */
  display: none;
}

.library__sheet {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 10px 12px 14px;
  overflow-y: auto;
}

.library__heading {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.library__hint {
  margin: 0 0 10px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
}

.library__rows {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.library__row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  /* 44px keeps the row a real tap target at phone width (Responsive Layout). */
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: grab;
  /* Without this, a touch-drag on a row is claimed by the browser for page
     scrolling and never reaches the placement gesture at all — the same trap
     render-001 hit on the canvas. */
  touch-action: none;
  user-select: none;
}

.library__row:hover {
  border-color: var(--border-strong);
}

.library__row:active,
.library__row--active {
  cursor: grabbing;
  border-color: var(--accent);
}

.library__swatch {
  flex: none;
  width: 18px;
  height: 18px;
  border: 1px solid var(--text-3);
  background: linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

.library__swatch[data-shape='primitive.sphere'] {
  border-radius: 50%;
}

.library__swatch[data-shape='primitive.cylinder'],
.library__swatch[data-shape='primitive.tube'] {
  border-radius: 40% / 18%;
}

.library__swatch[data-shape='primitive.cone'],
.library__swatch[data-shape='primitive.triangle'] {
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
}

.library__swatch[data-shape='primitive.hexagon'] {
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}

.library__drag-icon {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 20;
  padding: 4px 9px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 12px;
  white-space: nowrap;
  /* The icon trails the pointer; it must never eat the events that move it. */
  pointer-events: none;
  transform: translate3d(-1000px, -1000px, 0);
}

/* --- phone: a bottom sheet behind a tab (interaction-model-qa control 1, Q16) */
@media (max-width: 640px) {
  .library {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 10;
    border-right: none;
    border-top: 1px solid var(--border);
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    background: var(--surface-glass);
    backdrop-filter: blur(8px);
    box-shadow: var(--shadow-overlay);
  }

  .library__tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--text-1);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .library__tab-grip {
    width: 32px;
    height: 4px;
    border-radius: 2px;
    background: var(--text-3);
  }

  .library__sheet {
    display: none;
    max-height: 46vh;
  }

  .library[data-open='true'] .library__sheet {
    display: flex;
  }
}
</style>
