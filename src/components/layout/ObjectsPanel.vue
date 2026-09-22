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
 * **Parts of a composite (`TODO/ui-042`).** A composite body (a Raspberry Pi, a bolt) has a
 * disclosure chevron at the right of its row; opening it lists the body's named parts
 * as indented child rows, hidden ones (a tap-clearance solid) included and labelled. This
 * is the hand route to `ui-016`'s "second click drills into a part" for a body no click
 * can reach — a Pi's `ethernet` jack while the Pi is inside a case — and so to `ui-040`'s
 * sub-part boolean operands. Child rows follow **the same two gestures as body rows**, on
 * purpose, so the whole list obeys one rule: tapping a child row makes *that body at that
 * part* the whole selection; tapping its **check** (or Shift/Ctrl/Cmd on the row) adds it
 * to the selection **at the end**. Order is operand order: to cut the `ethernet` jack out
 * of a case, tap the case's row first, then the jack's check. The checks read `1`/`2`, the
 * parent row names the part it is addressed at even while collapsed (`› ethernet`), and the
 * Operations toolbar's operand line says the same before anything is committed.
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
 * Whether any row has a chevron. When one does, the rows without one keep an empty
 * 44px slot in its place so every body's size lines up; when none does (the common case
 * — a scene of primitives) no width is spent on it.
 */
const anyExpandable = computed(() => objects.rows.some((row) => row.expandable))

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

/**
 * @param {MouseEvent} event
 * @param {string} id
 * @param {string} partName
 */
function onPartClick(event, id, partName) {
  objects.choosePart(id, partName, event.shiftKey || event.ctrlKey || event.metaKey)
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
      Selects bodies · tap a row, the check adds more · ▸ shows a composite's parts
    </p>

    <p v-if="objects.rows.length === 0" class="panel__empty" data-testid="objects-empty">
      No objects yet — drag a shape in from the Library
    </p>

    <ul v-else class="panel__list" data-testid="objects-rows">
      <li
        v-for="row in objects.rows"
        :key="row.id"
        class="item"
        :data-testid="`objects-item-${row.id}`"
        :data-selected="row.selected ? 'true' : 'false'"
        :data-role="row.role"
        :data-expanded="row.expanded ? 'true' : 'false'"
      >
        <div class="row" :class="{ 'row--selected': row.selected }">
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
            <span class="row__label">
              <span class="row__name" data-testid="objects-row-name">{{ row.name }}</span>
              <span
                v-if="row.drilledPart"
                class="row__drilled"
                :data-testid="`objects-drilled-${row.id}`"
                >› {{ row.drilledPart }}</span
              >
            </span>
            <span class="row__size">{{ row.size }}</span>
          </button>
          <!-- A button, never an input: HistoryControls' Ctrl+Z guard treats any <input> as
               text entry. Not disabled with the rows — reading a part's name selects nothing. -->
          <button
            v-if="row.expandable"
            type="button"
            class="row__chevron"
            :class="{ 'row__chevron--open': row.expanded }"
            :aria-expanded="row.expanded"
            :aria-controls="`objects-parts-${row.id}`"
            :aria-label="`${row.expanded ? 'Hide' : 'Show'} ${row.parts.length} parts of ${row.name}`"
            :title="`${row.expanded ? 'Hide' : 'Show'} the parts of ${row.name}`"
            :data-testid="`objects-expand-${row.id}`"
            @click="objects.toggleExpanded(row.id)"
          >
            <span aria-hidden="true">▸</span>
          </button>
          <span v-else-if="anyExpandable" class="row__chevron-spacer" aria-hidden="true"></span>
        </div>

        <ul
          v-if="row.expanded"
          :id="`objects-parts-${row.id}`"
          class="parts"
          :data-testid="`objects-parts-${row.id}`"
          :aria-label="`Parts of ${row.name}`"
        >
          <li
            v-for="part in row.parts"
            :key="part.name"
            class="part"
            :class="{ 'part--selected': part.selected, 'part--hidden': part.hidden }"
            :data-testid="`objects-part-item-${row.id}-${part.name}`"
            :data-selected="part.selected ? 'true' : 'false'"
            :data-hidden="part.hidden ? 'true' : 'false'"
          >
            <button
              type="button"
              class="row__check"
              :class="`row__check--${part.role}`"
              role="checkbox"
              :aria-checked="part.selected"
              :aria-label="`${part.selected ? 'Stop addressing' : 'Address'} ${part.name} of ${row.name}${part.selected ? '' : ', adding the body to the selection'}`"
              :data-testid="`objects-part-check-${row.id}-${part.name}`"
              :disabled="disabled"
              @click="objects.choosePart(row.id, part.name, true)"
            >
              <span aria-hidden="true">{{ part.selected ? part.order : '' }}</span>
            </button>
            <button
              type="button"
              class="part__body"
              :aria-pressed="part.selected"
              :aria-label="`${part.name}${part.hidden ? ' (hidden part)' : ''}, part of ${row.name}`"
              :data-testid="`objects-part-${row.id}-${part.name}`"
              :disabled="disabled"
              @click="onPartClick($event, row.id, part.name)"
            >
              <span class="part__name" :data-testid="`objects-part-name-${row.id}-${part.name}`">{{
                part.name
              }}</span>
              <span
                v-if="part.hidden"
                class="part__hidden"
                :data-testid="`objects-part-hidden-${row.id}-${part.name}`"
                >hidden</span
              >
            </button>
          </li>
        </ul>
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

.item {
  border-bottom: 1px solid var(--border);
}

.row {
  display: flex;
  align-items: stretch;
  min-height: var(--tap);
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
.part__body:hover,
.row__check:hover span {
  border-color: var(--accent);
}

.row__label {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.2;
}

/* The part this body is addressed at, kept on the parent row so it is visible even while
   the parts are collapsed — an address must never be invisible. */
.row__drilled {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
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

.row__chevron,
.row__chevron-spacer {
  flex: 0 0 var(--tap);
  width: var(--tap);
  min-height: var(--tap);
}

.row__chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.row__chevron span {
  display: inline-block;
  transition: transform 0.12s ease;
}

.row__chevron--open span {
  transform: rotate(90deg);
}

.row__chevron:hover {
  color: var(--text-1);
}

/* Child rows: indented under the parent, the same 44px height and the same check, so a
   part is picked exactly the way a body is. The left rule ties them to their parent. */
.parts {
  margin: 0;
  padding: 0 0 0 20px;
  list-style: none;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-2, var(--surface-1)) 60%, var(--surface-1));
}

.part {
  display: flex;
  align-items: stretch;
  min-height: var(--tap);
  border-left: 2px solid var(--border);
}

.part + .part {
  border-top: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.part--selected {
  background: color-mix(in srgb, var(--accent) 18%, var(--surface-1));
  border-left-color: var(--accent);
}

.part__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
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

.part__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.part--hidden .part__name {
  color: var(--text-2);
  font-style: italic;
}

.part__hidden {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-3);
}

.row__body:disabled,
.part__body:disabled,
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
