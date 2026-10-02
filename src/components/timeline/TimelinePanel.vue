<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The History panel — `src/components/timeline/`'s first real content
 * (`TODO/ui-032`, §13).
 *
 * **Two layouts, and the phone one was designed first** (CLAUDE.md's
 * Responsive Layout rule, which the second attempt's stop note is the cost of
 * ignoring):
 *
 * - **≥641px** — a bottom dock inside the viewport column, so the Library and
 *   Inspector columns stay visible and "selecting a body shows its Inspector"
 *   is never displaced. §13 rejected a third column outright: at the 820px
 *   tablet reference the two side columns already leave only ~390px of
 *   viewport.
 * - **Phone (390px)** — a bottom sheet in the Inspector's slot, arbitrated by
 *   `AppView.vue` exactly as Library-vs-Inspector already is. There is one
 *   sheet slot and three panels that want it.
 *
 * The marker line, not a chip, is what separates active rows from inactive
 * ones: §18 draws it "as a horizontal line between row *k* and row *k+1*",
 * because where the *boundary* is, is the thing a rolled-back user needs to
 * see — a per-row chip makes them reconstruct it row by row.
 */
import { computed } from 'vue'

import TimelineRow from './TimelineRow.vue'
import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useTimelineStore } from '../../stores/timeline.js'

const timeline = useTimelineStore()
const documentStore = useDocumentStore()
const selection = useSelectionStore()

/**
 * Rows that touch a currently-selected body — §13's one passive link between
 * the two selections: "selecting a body in the viewport gives every row that
 * touches that body a subtle tint **without selecting or scrolling anything**."
 *
 * Resolved through the lineage root rather than by matching ids, so every step
 * in a body's history tints together: its placement, every move, and the
 * chamfer on top of it are all "that body" to the user.
 */
const relatedIds = computed(() => {
  void documentStore.version
  /** @type {Set<string>} */
  const related = new Set()
  if (selection.ids.length === 0) return related
  const roots = new Set(selection.ids)
  for (const row of timeline.rows) {
    const root = documentStore.raw.rootOf(row.id)
    if (root !== undefined && roots.has(root)) related.add(row.id)
  }
  return related
})
</script>

<template>
  <section v-if="timeline.open" class="panel" data-testid="timeline-panel" aria-label="History">
    <header class="panel__bar">
      <h2 class="panel__title">History</h2>
      <span class="panel__count" data-testid="timeline-count">
        {{ timeline.stepCount }} step{{ timeline.stepCount === 1 ? '' : 's' }}
      </span>
      <button
        type="button"
        class="panel__close"
        data-testid="timeline-close"
        aria-label="Close History"
        title="Close History"
        @click="timeline.setOpen(false)"
      >
        ✕
      </button>
    </header>

    <p v-if="timeline.stepCount === 0" class="panel__empty" data-testid="timeline-empty">
      No steps yet — drag a shape in from the Library
    </p>

    <ol v-else class="panel__list" data-testid="timeline-rows">
      <template v-for="row in timeline.rows" :key="row.id || row.step">
        <TimelineRow
          :row="row"
          :selected="row.id === timeline.selectedId"
          :related="relatedIds.has(row.id)"
          @select="timeline.selectRow($event)"
        />
        <li
          v-if="timeline.rollbackAt === row.step"
          class="panel__marker"
          data-testid="timeline-marker"
          aria-hidden="true"
        >
          <span class="panel__marker-label">new steps insert here</span>
        </li>
      </template>
    </ol>
  </section>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface-1);
  border-top: 1px solid var(--border);
}

.panel__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}

.panel__title {
  margin: 0;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-2);
}

.panel__count {
  font-size: 11px;
  color: var(--text-3);
}

.panel__close {
  margin-left: auto;
  width: var(--tap);
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.panel__close:hover {
  border-color: var(--border-strong);
  color: var(--text-1);
}

.panel__empty {
  margin: 0;
  padding: 16px 12px;
  color: var(--text-3);
  font-size: 12px;
}

.panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  /* Momentum scrolling matters here: at phone width this is a sheet the user
     flicks through, and the rows are 44px each. */
  -webkit-overflow-scrolling: touch;
  flex: 1 1 auto;
  min-height: 0;
}

.panel__marker {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 10px;
  color: var(--accent);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.panel__marker::after {
  content: '';
  flex: 1;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}

.panel__marker-label {
  flex: 0 0 auto;
}

@media (min-width: 641px) {
  .panel {
    /* §13: "a bottom dock inside the viewport column, ~220px tall." The
       viewport above it shrinks; the side columns are untouched. */
    flex: 0 0 220px;
  }
}

@media (max-width: 640px) {
  .panel {
    /* The Inspector's tier (z-index 11) — the two are mutually exclusive by
       AppView's arbitration, so they never need to stack against each other. */
    position: absolute;
    z-index: 11;
    left: 0;
    right: 0;
    /* Set by `AppView.vue`, which is the only thing that can see the Library
       tab and the Inspector tab at the same time as this sheet. */
    bottom: var(--bottom-panel-bottom, 0px);
    height: var(--bottom-panel-height, 46vh);
    border-top: 1px solid var(--border-strong);
    box-shadow: var(--shadow-overlay);
  }
}
</style>
