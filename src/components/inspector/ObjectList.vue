<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The object list — the scene's bodies and a composite's parts, as rows, inside the
 * Inspector (`TODO/ui-049`, extracted from the retired `ObjectsPanel.vue`).
 *
 * **Why it exists** (`TODO/ui-041`). A body completely inside another cannot be clicked:
 * every other selection route is a raycast, and the ray hits the enclosing solid first. The
 * list answers "what is in this document?" and lets a row *name* the body instead, with no
 * raycast at all.
 *
 * **Two ways to select, so booleans are reachable from here alone.** Tap/click a row to
 * make that body the whole selection. Tap its **check** (or Shift/Ctrl/Cmd-click the row)
 * to add it to, or drop it from, the selection — the touch equivalent of the viewport's
 * Shift-click, and what gets a phone to "2 selected" with no keyboard. The check shows the
 * body's place in the selection (1 = Subtract's base), in the same two colours the
 * Operations toolbar's chips and the solids themselves use.
 *
 * **Parts of a composite** (`TODO/ui-042`). A composite (a Raspberry Pi, a bolt) has a ▸ at
 * the right of its row; opening it lists every named part as indented child rows, hidden
 * ones (a tap-clearance solid) included and labelled. Child rows follow the **same two
 * gestures** as body rows: tap = that body at that part, the whole selection; check = add it
 * at the end, addressed at that part. Order is operand order: to cut a Pi's `ethernet` jack
 * out of a case, the case's row first, then the jack's check. The parent row names the part
 * it is addressed at even while collapsed (`› ethernet`).
 *
 * **Two modes, one row rendering.** `scene` (the default) is the whole list — the
 * Inspector's content at 0 selected and its collapsible **Objects** section otherwise.
 * `parts` renders one body's part rows alone, flat — the Inspector's **Parts** section,
 * which replaces `ui-047`'s hidden-only list — with the same gestures and the same hover,
 * under `inspector-part-*` test ids so it can sit on screen beside the scene list.
 *
 * **Hover** (`TODO/ui-049`). A mouse moving over a row, or keyboard focus on it, lights the
 * matching body — or only that part — in the viewport, through `stores/hoverHighlight.js`,
 * whose only writer this component is. Touch has no hover and gets none invented: a tap
 * that happens to focus a button is not keyboard focus. The hover is cleared on leave, on
 * collapsing a part's parent, and on unmount (a selection change swaps the Inspector's
 * content); the store clears it itself when a body leaves the scene.
 *
 * **Hide and show** (`TODO/ui-089`). Every body row and part row has an eye (`EyeToggle`) that
 * hides or shows that thing in the 3D view — a view setting saved with the project, never an
 * undo step. A body row's eye has a third state, *some parts hidden*, whose tap shows every
 * part. A user-hidden row is dimmed and its eye slashed, with no text chip: the `hidden` chip
 * stays the recipe's helper part. The count line adds `· N hidden · Show all` while anything
 * is hidden. A hidden row still selects, so a cutter can be hidden and still ticked as an
 * operand (rule 5).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import EyeToggle from './EyeToggle.vue'

import { useDocumentStore } from '../../stores/document.js'
import { useHoverHighlightStore } from '../../stores/hoverHighlight.js'
import { useObjectListStore } from '../../stores/objectList.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useTimelineStore } from '../../stores/timeline.js'

const props = defineProps({
  /** `scene` — every body; `parts` — one body's part rows (the Inspector's Parts section). */
  mode: { type: String, default: 'scene' },
  /** The body whose parts `parts` mode lists. Ignored in `scene` mode. */
  bodyId: { type: String, default: '' },
})

/**
 * `select-intent` fires **before** a row gesture selects anything, so the Inspector can
 * tell a selection made from inside its own sheet from one made in the viewport — the
 * former must not close the phone sheet the user is working in.
 */
const emit = defineEmits(['select-intent'])

const objects = useObjectListStore()
const selection = useSelectionStore()
const timeline = useTimelineStore()
const documentStore = useDocumentStore()
const hover = useHoverHighlightStore()

const rootEl = ref(/** @type {HTMLElement | null} */ (null))

const disabled = computed(() => objects.disabledReason !== '')

/**
 * Whether any row has a chevron. When one does, the rows without one keep an empty 44px
 * slot in its place so every body's size lines up; when none does (the common case — a
 * scene of primitives) no width is spent on it.
 */
const anyExpandable = computed(() => objects.rows.some((row) => row.expandable))

/** The one body `parts` mode lists, as its row in the store — or `null`. */
const partsRow = computed(() => objects.rows.find((row) => row.id === props.bodyId) ?? null)

/**
 * Steps that are in the log but not in the scene — suppressed, or past the rollback
 * marker. Their bodies are absent from the list *because* they are absent from the scene;
 * saying so keeps a missing row from reading as a bug.
 */
const absentSteps = computed(() => {
  void documentStore.version
  return timeline.rows.filter((row) => row.suppressed || !row.active).length
})

/**
 * Test ids for one part row. `scene` mode keeps `ui-042`'s ids verbatim (three acceptance
 * scenarios and their specs name them); `parts` mode is one body, so its ids carry just
 * the part name.
 *
 * @param {string} kind `''` (the row button), `check`, `item`, `name`, `hidden` or `eye`.
 * @param {string} bodyId
 * @param {string} partName
 * @returns {string}
 */
function partTestId(kind, bodyId, partName) {
  if (props.mode === 'parts') return kind ? `inspector-part-${kind}-${partName}` : `inspector-part-${partName}`
  return kind ? `objects-part-${kind}-${bodyId}-${partName}` : `objects-part-${bodyId}-${partName}`
}

/**
 * @param {MouseEvent} event
 * @param {string} id
 */
function onRowClick(event, id) {
  emit('select-intent')
  objects.choose(id, event.shiftKey || event.ctrlKey || event.metaKey)
}

/** @param {string} id */
function onRowCheck(id) {
  emit('select-intent')
  objects.choose(id, true)
}

/**
 * @param {MouseEvent} event
 * @param {string} id
 * @param {string} partName
 */
function onPartClick(event, id, partName) {
  emit('select-intent')
  objects.choosePart(id, partName, event.shiftKey || event.ctrlKey || event.metaKey)
}

/**
 * @param {string} id
 * @param {string} partName
 */
function onPartCheck(id, partName) {
  emit('select-intent')
  objects.choosePart(id, partName, true)
}

/**
 * Select a body a condition has switched off (`TODO/ui-052`) — a plain selection, so the
 * Inspector opens on it and its Condition row can be edited.
 *
 * @param {string} id
 */
function onInactiveClick(id) {
  emit('select-intent')
  selection.select(id)
}

/**
 * A part row's eye (`TODO/ui-089`). Its own button, so it never selects the row it sits on.
 *
 * @param {string} id
 * @param {string} partName
 */
function onPartEye(id, partName) {
  objects.togglePartVisibility(id, partName)
}

/** Bodies a condition is keeping out of the fold, from the live document. */
const inactiveBodies = computed(() => (timeline.previewing ? [] : documentStore.inactiveBodies))

/** @param {string} id */
function onToggleExpanded(id) {
  // Collapsing takes the part rows out from under a resting pointer without a leave event.
  if (hover.target?.bodyId === id && hover.target.partName !== null) hover.clearHover()
  objects.toggleExpanded(id)
}

// --- hover (TODO/ui-049) ----------------------------------------------------

/** The last target this list wrote, by identity — what unmount may clear, and nothing else. */
let written = /** @type {object | null} */ (null)

/** When a pointer last pressed inside the list, so a focus it causes is not taken as keyboard focus. */
let pressedAt = -Infinity

/** A focus this soon after a press is the press's own focus, not a keyboard user arriving. */
const PRESS_FOCUS_MS = 800

/**
 * @param {string} bodyId
 * @param {string | null} partName
 */
function hoverOn(bodyId, partName) {
  hover.setHover(bodyId, partName)
  written = hover.target
}

/**
 * Where the last touch or pen press happened, while no real mouse has moved since — or
 * `null`. WebKit keeps a phantom mouse at exactly that point after a tap (see
 * {@link onPointerMove}); a mouse event there is that phantom, and a mouse moving
 * anywhere else means a real mouse has taken over.
 *
 * @type {{ x: number, y: number } | null}
 */
let phantomAt = null

/** @param {PointerEvent} event */
function onWindowPointerDown(event) {
  if (event.pointerType !== 'mouse') phantomAt = { x: event.clientX, y: event.clientY }
}

onMounted(() => window.addEventListener('pointerdown', onWindowPointerDown, { capture: true, passive: true }))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onWindowPointerDown, { capture: true }))

/**
 * A **moving** mouse over a row hovers it — deliberately not `pointerenter`.
 *
 * Found hand-driving at 390px in WebKit (and reproduced in Chromium): after a touch tap,
 * the browser keeps a phantom "mouse" at the tap point for its compatibility mouse
 * events, and when the Inspector reflows under it (a tap that changes the selection
 * changes the panel) it fires **mouse-typed** `pointerover`/`pointerenter` at whatever
 * row slid under that point. Keyed on `pointerenter`, a tap lit up the row *below* the one
 * tapped, which is exactly the invented touch hover this task rules out. WebKit then also
 * sends a `pointermove` of type `mouse` — but at the very point the finger lifted from, so
 * a mouse event at {@link phantomAt} is ignored until a mouse genuinely moves elsewhere.
 * The already-hovered check makes a move within the row cost nothing.
 *
 * @param {PointerEvent} event
 * @param {string} bodyId
 * @param {string | null} partName
 */
function onPointerMove(event, bodyId, partName) {
  if (event.pointerType !== 'mouse') return
  if (phantomAt) {
    if (Math.abs(event.clientX - phantomAt.x) < 2 && Math.abs(event.clientY - phantomAt.y) < 2) return
    phantomAt = null
  }
  if (isHovered(bodyId, partName)) return
  hoverOn(bodyId, partName)
}

/**
 * @param {PointerEvent} event
 * @param {string} bodyId
 * @param {string | null} partName
 */
function onPointerLeave(event, bodyId, partName) {
  if (event.pointerType !== 'mouse') return
  hover.clearHover({ bodyId, partName })
}

function onPointerDown() {
  pressedAt = performance.now()
}

/**
 * @param {string} bodyId
 * @param {string | null} partName
 */
function onFocusIn(bodyId, partName) {
  if (performance.now() - pressedAt < PRESS_FOCUS_MS) return
  hoverOn(bodyId, partName)
}

/**
 * @param {FocusEvent} event
 * @param {string} bodyId
 * @param {string | null} partName
 */
function onFocusOut(event, bodyId, partName) {
  // Tabbing from a row's check to its name button stays on the same row: no flicker.
  const next = /** @type {Node | null} */ (event.relatedTarget)
  const line = /** @type {HTMLElement} */ (event.currentTarget)
  if (next && line?.contains?.(next)) return
  hover.clearHover({ bodyId, partName })
}

/**
 * @param {string} bodyId
 * @param {string | null} partName
 * @returns {boolean}
 */
function isHovered(bodyId, partName) {
  const current = hover.target
  return current !== null && current.bodyId === bodyId && current.partName === partName
}

onBeforeUnmount(() => {
  if (written !== null && hover.target === written) hover.clearHover()
  written = null
})

// A body selected in the viewport (or by marquee) should be findable in the list without
// scrolling for it — the two routes are one selection, so the list follows it.
watch(
  () => selection.ids[selection.ids.length - 1],
  async (id) => {
    if (!id || props.mode !== 'scene') return
    await nextTick()
    const el = rootEl.value?.querySelector(`[data-testid="objects-row-${CSS.escape(id)}"]`)
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
  },
)
</script>

<template>
  <section
    v-if="mode === 'scene'"
    ref="rootEl"
    class="list"
    data-testid="object-list"
    aria-label="Objects"
    :data-disabled="disabled ? 'true' : 'false'"
  >
    <p class="list__count" data-testid="objects-count">
      {{ objects.rows.length }} object{{ objects.rows.length === 1 ? '' : 's' }}<template
        v-if="selection.count > 0"
        > · {{ selection.count }} selected</template
      ><template v-if="objects.hiddenCount > 0">
        · {{ objects.hiddenCount }} hidden ·
        <button
          type="button"
          class="list__show-all"
          data-testid="objects-show-all"
          :disabled="disabled"
          @click="objects.showAll()"
        >Show all</button></template
      >
    </p>

    <p v-if="disabled" class="list__note list__note--reason" data-testid="objects-disabled-reason" role="status">
      {{ objects.disabledReason }}
    </p>
    <p v-else-if="objects.rows.length > 0" class="list__note" data-testid="objects-hint">
      Tap a row to select it · the check adds more · ▸ shows a composite's parts
    </p>

    <p v-if="objects.rows.length === 0" class="list__empty" data-testid="objects-empty">
      No objects yet — drag a shape in from the Library
    </p>

    <ul v-else class="list__rows" data-testid="objects-rows">
      <li
        v-for="row in objects.rows"
        :key="row.id"
        class="item"
        :data-testid="`objects-item-${row.id}`"
        :data-selected="row.selected ? 'true' : 'false'"
        :data-role="row.role"
        :data-expanded="row.expanded ? 'true' : 'false'"
        :data-view-hidden="row.viewHidden ? 'true' : 'false'"
      >
        <div
          class="row"
          :class="{ 'row--selected': row.selected, 'row--view-hidden': row.viewHidden }"
          :data-testid="`objects-line-${row.id}`"
          :data-hovered="isHovered(row.id, null) ? 'true' : 'false'"
          @pointermove="onPointerMove($event, row.id, null)"
          @pointerleave="onPointerLeave($event, row.id, null)"
          @pointerdown="onPointerDown"
          @focusin="onFocusIn(row.id, null)"
          @focusout="onFocusOut($event, row.id, null)"
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
            @click="onRowCheck(row.id)"
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
              <span v-if="row.drilledPart" class="row__drilled" :data-testid="`objects-drilled-${row.id}`"
                >› {{ row.drilledPart }}</span
              >
            </span>
            <span class="row__size">{{ row.size }}</span>
          </button>
          <EyeToggle
            :state="row.eye"
            :name="row.name"
            :disabled="disabled"
            :data-testid="`objects-eye-${row.id}`"
            @toggle="objects.toggleBodyVisibility(row.id)"
          />
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
            @click="onToggleExpanded(row.id)"
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
            :class="{ 'part--selected': part.selected, 'part--hidden': part.hidden, 'part--view-hidden': !part.drawn }"
            :data-testid="partTestId('item', row.id, part.name)"
            :data-selected="part.selected ? 'true' : 'false'"
            :data-hidden="part.hidden ? 'true' : 'false'"
            :data-view-hidden="part.drawn ? 'false' : 'true'"
            :data-hovered="isHovered(row.id, part.name) ? 'true' : 'false'"
            @pointermove="onPointerMove($event, row.id, part.name)"
            @pointerleave="onPointerLeave($event, row.id, part.name)"
            @pointerdown="onPointerDown"
            @focusin="onFocusIn(row.id, part.name)"
            @focusout="onFocusOut($event, row.id, part.name)"
          >
            <button
              type="button"
              class="row__check"
              :class="`row__check--${part.role}`"
              role="checkbox"
              :aria-checked="part.selected"
              :aria-label="`${part.selected ? 'Stop addressing' : 'Address'} ${part.name} of ${row.name}${part.selected ? '' : ', adding the body to the selection'}`"
              :data-testid="partTestId('check', row.id, part.name)"
              :disabled="disabled"
              @click="onPartCheck(row.id, part.name)"
            >
              <span aria-hidden="true">{{ part.selected ? part.order : '' }}</span>
            </button>
            <button
              type="button"
              class="part__body"
              :aria-pressed="part.selected"
              :aria-label="`${part.name}${part.hidden ? ' (hidden part)' : ''}, part of ${row.name}`"
              :data-testid="partTestId('', row.id, part.name)"
              :disabled="disabled"
              @click="onPartClick($event, row.id, part.name)"
            >
              <span class="part__name" :data-testid="partTestId('name', row.id, part.name)">{{ part.name }}</span>
              <span v-if="part.hidden" class="part__hidden" :data-testid="partTestId('hidden', row.id, part.name)"
                >hidden</span
              >
            </button>
            <EyeToggle
              :state="part.viewHidden ? 'hidden' : 'shown'"
              :name="part.name"
              :disabled="disabled"
              :data-testid="partTestId('eye', row.id, part.name)"
              @toggle="onPartEye(row.id, part.name)"
            />
          </li>
        </ul>
      </li>
    </ul>

    <!-- Bodies a condition is keeping out of the fold (TODO/ui-052): not drawn, so they
         cannot be picked in the viewport — listed here, greyed with their condition, so one
         can still be selected and its condition edited in the Inspector. -->
    <ul v-if="inactiveBodies.length > 0" class="list__rows list__rows--inactive" data-testid="objects-inactive">
      <li v-for="inactive in inactiveBodies" :key="inactive.id" class="item item--inactive">
        <button
          type="button"
          class="row row__body row--inactive"
          :class="{ 'row--selected': selection.ids.length === 1 && selection.ids[0] === inactive.id }"
          :data-testid="`objects-inactive-${inactive.id}`"
          :data-state="inactive.state"
          :aria-label="`${inactive.name}, not built: ${inactive.condition.sentence}`"
          :disabled="disabled"
          @click="onInactiveClick(inactive.id)"
        >
          <span class="row__label">
            <span class="row__name">{{ inactive.name }}</span>
            <span class="row__condition" :title="inactive.condition.sentence">{{
              inactive.state === 'invalid' ? 'condition can\'t be evaluated' : inactive.condition.chip
            }}</span>
          </span>
        </button>
      </li>
    </ul>

    <p v-if="absentSteps > 0" class="list__note" data-testid="objects-absent-note">
      {{ absentSteps }} suppressed or rolled-back step{{ absentSteps === 1 ? '' : 's' }} — their bodies are not in
      the scene, so they are not listed.
    </p>
  </section>

  <!-- `parts` mode: the Inspector's Parts section. Absent, not disabled, for a bare solid. -->
  <ul
    v-else-if="partsRow && partsRow.parts.length > 0"
    class="parts parts--flat"
    data-testid="inspector-parts-list"
    :aria-label="`Parts of ${partsRow.name}`"
  >
    <li
      v-for="part in partsRow.parts"
      :key="part.name"
      class="part"
      :class="{ 'part--selected': part.selected, 'part--hidden': part.hidden, 'part--view-hidden': !part.drawn }"
      :data-testid="partTestId('item', partsRow.id, part.name)"
      :data-selected="part.selected ? 'true' : 'false'"
      :data-hidden="part.hidden ? 'true' : 'false'"
      :data-view-hidden="part.drawn ? 'false' : 'true'"
      :data-hovered="isHovered(partsRow.id, part.name) ? 'true' : 'false'"
      @pointermove="onPointerMove($event, partsRow.id, part.name)"
      @pointerleave="onPointerLeave($event, partsRow.id, part.name)"
      @pointerdown="onPointerDown"
      @focusin="onFocusIn(partsRow.id, part.name)"
      @focusout="onFocusOut($event, partsRow.id, part.name)"
    >
      <button
        type="button"
        class="row__check"
        :class="`row__check--${part.role}`"
        role="checkbox"
        :aria-checked="part.selected"
        :aria-label="`${part.selected ? 'Stop addressing' : 'Address'} ${part.name} of ${partsRow.name}`"
        :data-testid="partTestId('check', partsRow.id, part.name)"
        :disabled="disabled"
        @click="onPartCheck(partsRow.id, part.name)"
      >
        <span aria-hidden="true">{{ part.selected ? part.order : '' }}</span>
      </button>
      <button
        type="button"
        class="part__body"
        :aria-pressed="part.selected"
        :aria-label="`${part.name}${part.hidden ? ' (hidden part)' : ''}, part of ${partsRow.name}`"
        :data-testid="partTestId('', partsRow.id, part.name)"
        :disabled="disabled"
        @click="onPartClick($event, partsRow.id, part.name)"
      >
        <span class="part__name" :data-testid="partTestId('name', partsRow.id, part.name)">{{ part.name }}</span>
        <span v-if="part.hidden" class="part__hidden" :data-testid="partTestId('hidden', partsRow.id, part.name)"
          >hidden</span
        >
      </button>
      <EyeToggle
        :state="part.viewHidden ? 'hidden' : 'shown'"
        :name="part.name"
        :disabled="disabled"
        :data-testid="partTestId('eye', partsRow.id, part.name)"
        @toggle="onPartEye(partsRow.id, part.name)"
      />
    </li>
  </ul>
</template>

<style scoped>
.list {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.list__count {
  margin: 0;
  padding: 2px 0 4px;
  font-size: 11px;
  color: var(--text-3);
}

.list__note {
  margin: 0;
  padding: 0 0 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
}

/* Show all (TODO/ui-089): a text button on the count line, a full tap target tall so a thumb
   finds it in the phone sheet. */
.list__show-all {
  min-height: var(--tap);
  padding: 0 4px;
  border: none;
  background: transparent;
  color: var(--accent);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

.list__show-all:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.list__show-all:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.list__note--reason {
  color: var(--warn);
}

.list__empty {
  margin: 0;
  padding: 8px 0;
  color: var(--text-3);
  font-size: 12px;
}

/* No scroller of its own: the Inspector's sheet/column scrolls, so a fully expanded Pi
   scrolls inside the sheet and never the page. */
.list__rows {
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: 1px solid var(--border);
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

/* The hover marker (TODO/ui-049): an inset edge in the hover colour, the same colour the
   matching geometry lights up in, so row and body read as one thing. An inset shadow, not a
   border, so a hovered row does not shift its neighbours by a pixel. */
.row[data-hovered='true'],
.part[data-hovered='true'] {
  box-shadow: inset 3px 0 0 var(--hover-highlight);
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

/* Name over size, not side by side: in the Inspector's column (220px at tablet, 280px at
   laptop) a composite's size — `228.16 × 250.25 × 18.55 mm` — left the name no width at
   all, so a Group row read as a check, a size and nothing else (found hand-driving). The
   name gets the whole row; the size is the second line. */
.row__body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 1px;
  padding: 4px 8px 4px 2px;
  border: none;
  background: transparent;
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.row__body:focus-visible,
.part__body:focus-visible,
.row__check:focus-visible,
.row__chevron:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

/* Decorative hover only where a real pointer hovers: a touch screen keeps `:hover` stuck
   on the last tapped spot, which read as a stray accent on a neighbouring check. */
@media (hover: hover) {
  .row__check:hover span {
    border-color: var(--accent);
  }

  .row__chevron:hover {
    color: var(--text-1);
  }
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

/* Hidden in the view (TODO/ui-089): the name and size dim, the check and the eye do not — the
   eye-slash is the mark, and a hidden row still selects. No text chip: `hidden` is the
   recipe's word (`.part__hidden`). */
.row--view-hidden .row__body,
.part--view-hidden .part__body {
  opacity: 0.5;
}

/* A body a condition has switched off (TODO/ui-052): greyed, with its condition. */
.list__rows--inactive {
  margin-top: 6px;
  border-top-style: dashed;
}

.row--inactive {
  width: 100%;
  padding: 4px 10px 4px var(--tap);
  opacity: 0.7;
}

.row__condition {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--text-3);
}

.row__size {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* Child rows: indented under the parent, the same 44px height and the same check, so a
   part is picked exactly the way a body is. The left rule ties them to their parent. */
.parts {
  margin: 0;
  padding: 0 0 0 16px;
  list-style: none;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-2, var(--surface-1)) 60%, var(--surface-1));
}

/* The Parts section: one body's parts, so nothing to indent under. */
.parts--flat {
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
}

.part {
  display: flex;
  align-items: stretch;
  min-height: var(--tap);
  border-left: 2px solid var(--border);
}

.parts--flat .part {
  border-left: none;
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
  padding: 0 10px 0 2px;
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
</style>
