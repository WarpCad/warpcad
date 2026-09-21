<script setup>
/**
 * The Objects list — a hand route to select any body in the document
 * (`TODO/ui-041`).
 *
 * **Why it exists.** A body completely inside another cannot be clicked: every other
 * selection route is a raycast, and the ray hits the enclosing solid first. This panel
 * answers "what is in this document?" and lets a row *name* the body instead, with no
 * raycast at all. `ui-016`'s "second click drills into a part" is untouched, which is
 * the reason this is a list and not "cycle the pick under the pointer".
 *
 * **Two ways to select, so booleans are reachable from here alone.** Tap/click a row to
 * make that body the whole selection. Tap its **check** (or Shift/Ctrl/Cmd-click the
 * row) to add it to, or drop it from, the selection — the touch equivalent of the
 * viewport's Shift-click, and what gets a phone to "2 selected" with no keyboard. The
 * check shows the body's place in the selection (1 = Subtract's base), in the same two
 * colours the Operations toolbar's chips and the solids themselves use.
 *
 * **Not the History panel.** Both are lists in the same bottom dock, so the difference
 * is spelled out: this one is headed *Objects*, has a cube glyph and a `select
 * bodies` line, and its rows are bodies (a name and a size, a check on the left, a
 * full-row fill when selected). History's rows are numbered steps with a left accent
 * bar, and its selection is a *step*, never a body (`data-002` §13). Opening one closes
 * the other (`AppView.vue`), so they are never on screen together to be confused.
 *
 * Two layouts, phone first, sharing History's slot and its offsets so the Library and
 * Inspector tabs and the viewport's nav chrome stay clear (`AppView.vue`'s
 * `--bottom-panel-*` variables): a bottom dock inside the viewport column at ≥641px, a
 * bottom sheet at phone width. No new overlay technology.
 */
import { computed, nextTick, watch } from 'vue'

import { useDocumentStore } from '../../stores/document.js'
import { useObjectsPanelStore } from '../../stores/objectsPanel.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useTimelineStore } from '../../stores/timeline.js'

const objects = useObjectsPanelStore()
const selection = useSelectionStore()
const timeline = useTimelineStore()
const documentStore = useDocumentStore()

const disabled = computed(() => objects.disabledReason !== '')

/**
 * Steps that are in the log but not in the scene — suppressed, or past the rollback
 * marker. Their bodies are absent from the list *because* they are absent from the
 * scene; saying so keeps a missing row from reading as a bug.
 */
const absentSteps = computed(() => {
  void documentStore.version
  return timeline.rows.filter((row) => row.suppressed || !row.active).length
})

/**
 * @param {MouseEvent} event
 * @param {string} id
 */
function onRowClick(event, id) {
  objects.choose(id, event.shiftKey || event.ctrlKey || event.metaKey)
}

// A body selected in the viewport (or by marquee) should be findable in the list without
// scrolling for it — the two routes are one selection, so the list follows it.
watch(
  () => selection.ids[selection.ids.length - 1],
  async (id) => {
    if (!id || !objects.open) return
    await nextTick()
    const el = document.querySelector(`[data-testid="objects-row-${CSS.escape(id)}"]`)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  },
)
</script>

<template>
  <section
    v-if="objects.open"
    class="panel"
    data-testid="objects-panel"
    aria-label="Objects"
    :data-disabled="disabled ? 'true' : 'false'"
  >
    <header class="panel__bar">
      <h2 class="panel__title">Objects</h2>
      <span class="panel__count" data-testid="objects-count">
        {{ objects.rows.length }} object{{ objects.rows.length === 1 ? '' : 's' }}<template
          v-if="selection.count > 0"
          > · {{ selection.count }} selected</template
        >
      </span>
      <button
        type="button"
        class="panel__close"
        data-testid="objects-close"
        aria-label="Close Objects"
        title="Close Objects"
        @click="objects.setOpen(false)"
      >
        ✕
      </button>
    </header>

    <p
      v-if="disabled"
      class="panel__note panel__note--reason"
      data-testid="objects-disabled-reason"
      role="status"
    >
      {{ objects.disabledReason }}
    </p>
    <p v-else class="panel__note" data-testid="objects-hint">
      Selects bodies · tap a row, tap the check to add more
    </p>

    <p v-if="objects.rows.length === 0" class="panel__empty" data-testid="objects-empty">
      No objects yet — drag a shape in from the Library
    </p>

    <ul v-else class="panel__list" data-testid="objects-rows">
      <li
        v-for="row in objects.rows"
        :key="row.id"
        class="row"
        :class="{ 'row--selected': row.selected }"
        :data-testid="`objects-item-${row.id}`"
        :data-selected="row.selected ? 'true' : 'false'"
        :data-role="row.role"
      >
        <button
          type="button"
          class="row__check"
          :class="`row__check--${row.role}`"
          role="checkbox"
          :aria-checked="row.selected"
          :aria-label="`${row.selected ? 'Remove' : 'Add'} ${row.name} ${row.selected ? 'from' : 'to'} the selection`"
          :data-testid="`objects-check-${row.id}`"
          :disabled="disabled"
          @click="objects.choose(row.id, true)"
        >
          <span aria-hidden="true">{{ row.selected ? row.order : '' }}</span>
        </button>
        <button
          type="button"
          class="row__body"
          :aria-pressed="row.selected"
          :data-testid="`objects-row-${row.id}`"
          :disabled="disabled"
          @click="onRowClick($event, row.id)"
        >
          <span class="row__name" data-testid="objects-row-name">{{ row.name }}</span>
          <span class="row__size">{{ row.size }}</span>
        </button>
      </li>
    </ul>

    <p v-if="absentSteps > 0" class="panel__note" data-testid="objects-absent-note">
      {{ absentSteps }} suppressed or rolled-back step{{ absentSteps === 1 ? '' : 's' }} — their
      bodies are not in the scene, so they are not listed.
    </p>
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

.panel__note {
  margin: 0;
  padding: 4px 12px;
  font-size: 11px;
  color: var(--text-3);
  flex: 0 0 auto;
}

.panel__note--reason {
  color: var(--warn);
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
  -webkit-overflow-scrolling: touch;
  flex: 1 1 auto;
  min-height: 0;
}

.row {
  display: flex;
  align-items: stretch;
  min-height: var(--tap);
  border-bottom: 1px solid var(--border);
}

/* A selected body is a full-row fill — History's selected *step* is a left accent bar
   instead, so the two lists do not share a selection look. */
.row--selected {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface-1));
}

.row__check {
  flex: 0 0 var(--tap);
  width: var(--tap);
  min-height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
}

.row__check span {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--border-strong);
  border-radius: 5px;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-contrast);
}

.row__check--base span {
  border-color: var(--accent);
  background: var(--accent);
}

.row__check--secondary span {
  border-color: var(--accent-secondary);
  background: var(--accent-secondary);
}

.row__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 12px 0 2px;
  border: none;
  background: transparent;
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.row__body:hover,
.row__check:hover span {
  border-color: var(--accent);
}

.row__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.row__size {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.row__body:disabled,
.row__check:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (min-width: 641px) {
  .panel {
    /* The same dock History uses (§13) — the viewport above shrinks, the side columns
       are untouched. The two are never open together. */
    flex: 0 0 220px;
  }
}

@media (max-width: 640px) {
  .panel {
    position: absolute;
    z-index: 11;
    left: 0;
    right: 0;
    bottom: var(--bottom-panel-bottom, 0px);
    height: var(--bottom-panel-height, 46vh);
    border-top: 1px solid var(--border-strong);
    box-shadow: var(--shadow-overlay);
  }
}
</style>
