<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The section pop-out (`TODO/ui-081`): what a tap on a section launcher opens in the Library's
 * pop-out tier (E 641–789). It sits beside the 64px rail, over the viewport (it never pushes it),
 * as tall as the body less a margin, and scrolls. It holds the section's heading and rows, rendered
 * by the **same** `LibrarySection` / `LibraryRow` as the labelled column, so labels, variant
 * selects, ↺ Reset and the My parts ⋯ menu all behave identically, and a drag from a row here is
 * the column's own gesture.
 *
 * - **Not modal**: no backdrop. The rail closes it on a press outside, on Escape, on a second tap
 *   of its launcher, or when another pop-out claims the shared `openPopout` slot.
 * - **It may cover the Operations toolbar** while open. That is acceptable only because opening it
 *   closes any Operations group pop-out (one shared slot), and the user is choosing a creation, not
 *   an operation; a press on the toolbar is "outside" and closes it.
 * - **During a drag** it fades to 25 % with `pointer-events: none`, so the drop can land on scene
 *   under its footprint; after the drop it comes back and **stays open** (confirmed 2026-10-21).
 * - It opens with a 120ms slide and fade (none under reduced motion) and closes at once, so a tier
 *   change that removes its launcher leaves nothing animating behind.
 */
import { computed } from 'vue'

import { useLibraryStore } from '../../stores/library.js'
import { usePlacementStore } from '../../stores/placement.js'
import LibraryRow from './LibraryRow.vue'
import LibrarySection from './LibrarySection.vue'

const props = defineProps({
  /** A section of `LIBRARY_SECTIONS`, or `null` for My parts (`user`). */
  section: {
    type: /** @type {import('vue').PropType<import('../../core/library.js').LibrarySection | null>} */ (Object),
    default: null,
  },
  /** The pop-out width in CSS px: `min(280, P − 32)`, from the layout store's pane width. */
  widthPx: { type: Number, required: true },
})

const placement = usePlacementStore()
const library = useLibraryStore()

const sectionId = computed(() => props.section?.id ?? 'user')
const title = computed(() => props.section?.title ?? 'My parts')
</script>

<template>
  <div
    id="library-section-popout"
    class="library-section-popout"
    data-testid="library-section-popout"
    role="dialog"
    :aria-label="title"
    :data-section="sectionId"
    :data-dragging="placement.isDragging ? 'true' : 'false'"
    :style="{ width: `${widthPx}px` }"
  >
    <LibrarySection v-if="section" :section="section" />
    <template v-else>
      <h2 class="library-section-popout__heading" data-testid="library-heading-user">My parts</h2>
      <p v-if="library.userRows.length === 0" class="library-section-popout__hint" data-testid="library-user-empty">
        Nothing saved yet. Select a group, then choose Save to library… — or choose Import model… under ⋯ for an STL — and it appears here.
      </p>
      <ul class="library-section-popout__rows" data-testid="library-rows-user">
        <LibraryRow v-for="row in library.userRows" :key="row.op" :row="row" user />
      </ul>
    </template>
  </div>
</template>

<style scoped>
.library-section-popout {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: calc(100% + 6px);
  /* Over the viewport's own chrome (the toolbar, the pad), under the drag icon (20) and every
     modal tier — the row pop-out's tier. */
  z-index: 15;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-overlay);
  animation: library-section-popout-in 120ms ease-out;
}

@keyframes library-section-popout-in {
  from {
    opacity: 0;
    transform: translateX(-8px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

/* Out of the drop's way while a placement drag is under way. A plain switch, not a transition:
   the drop target has to be clear from the first `pointermove`. */
.library-section-popout[data-dragging='true'] {
  opacity: 0.25;
  pointer-events: none;
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .library-section-popout {
    animation: none;
  }
}

.library-section-popout__heading {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.library-section-popout__hint {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
}

.library-section-popout__rows {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
