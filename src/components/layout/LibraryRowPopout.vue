<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The row pop-out (`TODO/ui-084`): what a tap on an icon-rail tile opens, beside the rail and over
 * the viewport. It holds the row's settings — its name, the remembered-parameter line, the variant
 * `<select>`s, ↺ Reset and, for My parts, the ⋯ menu and the mesh line — around the **same**
 * `LibraryRow` the labelled column renders, so the row in here is draggable too and behaves
 * identically.
 *
 * - **Not modal**: no backdrop. The rail closes it on a press outside, on Escape, on a second tap
 *   of its tile, or when another pop-out claims the shared `openPopout` slot.
 * - **During a drag** it fades to 25 % with `pointer-events: none`, so the drop can land on scene
 *   under its footprint; after the drop it comes back and **stays open** (`ui-079`, 2026-10-21),
 *   so placing three bolts doesn't mean reopening it three times.
 */
import { usePlacementStore } from '../../stores/placement.js'
import LibraryRow from './LibraryRow.vue'

defineProps({
  /** The row whose settings this shows. */
  row: {
    type: /** @type {import('vue').PropType<import('../../core/library.js').LibraryRow & Partial<import('../../stores/library.js').UserPartRow>>} */ (
      Object
    ),
    required: true,
  },
  /** A My parts row. */
  user: { type: Boolean, default: false },
  /** Offset from the rail's top, in CSS px, so the pop-out sits level with its tile. */
  topPx: { type: Number, default: 0 },
})

const placement = usePlacementStore()
</script>

<template>
  <div
    class="library-popout"
    data-testid="library-row-popout"
    role="dialog"
    :aria-label="row.label"
    :data-op="row.op"
    :data-dragging="placement.isDragging ? 'true' : 'false'"
    :style="{ top: `${topPx}px` }"
  >
    <p class="library-popout__title" data-testid="library-row-popout-title">{{ row.label }}</p>
    <ul class="library-popout__rows">
      <LibraryRow :row="row" :user="user" variant="popout" />
    </ul>
  </div>
</template>

<style scoped>
.library-popout {
  position: absolute;
  left: calc(100% + 6px);
  /* Over the viewport's own chrome (the toolbar, the pad), under the drag icon (20) and every
     modal tier. */
  z-index: 15;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 260px;
  /* Never wider than the space right of the rail, whatever the window (≥ 641px here). */
  max-width: calc(100vw - var(--library-width, 72px) - 24px);
  max-height: calc(100% - 16px);
  overflow-y: auto;
  padding: 10px 12px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-overlay);
}

/* Out of the drop's way while a placement drag is under way. A plain switch, not a transition:
   the drop target has to be clear from the first `pointermove`. */
.library-popout[data-dragging='true'] {
  opacity: 0.25;
  pointer-events: none;
}

.library-popout__title {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.library-popout__rows {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
