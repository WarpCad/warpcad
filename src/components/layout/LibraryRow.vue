<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * One Library row (`TODO/ui-084`, extracted from `LibraryPanel.vue`): the draggable button, its
 * ↺ Reset, its remembered-parameter line, its variant `<select>`s and, for a My parts row, the ⋯
 * menu, the thumbnail, the "in this project" dot and the mesh line. The labelled column, the row
 * pop-out and the icon rail all render **this** component, so a row behaves identically wherever
 * it is, and the drag gesture is started from one place (`startLibraryDrag`).
 *
 * Three forms (`variant`):
 *
 * - `row` — the labelled column's row, exactly as it was before the extraction.
 * - `popout` — the same row inside the icon rail's row pop-out. Only its drag button's test id
 *   differs (`library-popout-row-<op>`), so it never duplicates the tile's `library-row-<op>`.
 * - `tile` — the icon rail's 44px tile: the row's swatch (or a My parts thumbnail), its name in
 *   `title`/`aria-label`, and a long-press callout on touch. A press that moves past the tap slop
 *   places the row exactly as the labelled row does; a press released inside it is a tap, which
 *   emits `tap` (the rail opens the row pop-out).
 *
 * ## A row with a variant (`TODO/ui-031`)
 *
 * The `<select>` is a sibling of the drag button rather than a child, because a form control inside
 * a `<button>` is invalid HTML and would never receive its own pointer events. That sibling
 * relationship is also what keeps a press on the dropdown from starting a placement — the gesture
 * is bound to the button alone.
 */
import { computed, onBeforeUnmount, ref } from 'vue'

import { detailOf } from '../../core/bom.js'
import { summaryParamsFor } from '../../core/libraryDefaults.js'
import { startLibraryDrag } from '../../composables/useLibraryDrag.js'
import { useLibraryDefaultsStore } from '../../stores/libraryDefaults.js'
import { useLibraryStore } from '../../stores/library.js'
import { usePlacementStore } from '../../stores/placement.js'
import { useTimelineStore } from '../../stores/timeline.js'
import UserPartMenu from './UserPartMenu.vue'

const props = defineProps({
  /** The catalogue row, or a My parts row (`library.userRows`, which adds `userPart` and more). */
  row: {
    type: /** @type {import('vue').PropType<import('../../core/library.js').LibraryRow & Partial<import('../../stores/library.js').UserPartRow>>} */ (
      Object
    ),
    required: true,
  },
  /** A My parts row: the ⋯ menu, thumbnail, in-project dot and mesh line. */
  user: { type: Boolean, default: false },
  /** `row` (the labelled column), `popout` (inside the row pop-out) or `tile` (the icon rail). */
  variant: { type: /** @type {import('vue').PropType<'row' | 'popout' | 'tile'>} */ (String), default: 'row' },
  /** A tile only: whether its row pop-out is open (`aria-expanded`). */
  expanded: { type: Boolean, default: false },
})

const emit = defineEmits(['tap'])

/** The same row, typed for the My parts pieces (only read when `user` is set). */
const userRow = computed(() => /** @type {import('../../stores/library.js').UserPartRow} */ (props.row))

const placement = usePlacementStore()
/**
 * §14, point 3: while a past step is being previewed, Library rows are disabled along with
 * everything else that would mutate the document.
 */
const timeline = useTimelineStore()
/** The Library's memory of each part's last-used params (`TODO/ui-068`). */
const remembered = useLibraryDefaultsStore()
const library = useLibraryStore()

/** How long a touch must be held still before the tile's name appears (ms). */
const LONG_PRESS_MS = 500
/** How long the name stays up after the finger lifts (ms). */
const CALLOUT_LINGER_MS = 1500

const UNIT_OPTIONS = Object.freeze([
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
  { value: 'inch', label: 'inch' },
])

const dragTestId = computed(() =>
  props.variant === 'popout' ? `library-popout-row-${props.row.op}` : `library-row-${props.row.op}`,
)

/** Rows whose Size follows their Type (`core-060`) stack their dropdowns. */
const stacked = computed(() => props.row.extraChoices.some((extra) => Boolean(extra.optionsFor)))

const previewTitle = 'Leave the preview to place a shape'

/** The drag button's `title` (a My parts row also warns when a newer version is saved). */
const rowTitle = computed(() => {
  if (timeline.previewing) return previewTitle
  if (props.user && props.row.userPart?.newerVersionAvailable) {
    return `${props.row.label} — a newer version is saved in My parts; this project keeps the version it has`
  }
  return undefined
})

/**
 * The options an extra choice offers right now. A choice whose list depends on another one (a
 * fastener's Size follows its Type, `TODO/core-060`) computes it from the row's current params.
 *
 * @param {import('../../core/kernel/registry.js').OpUiChoice} extra
 * @returns {readonly import('../../core/kernel/registry.js').OpUiOption[]}
 */
function extraOptions(extra) {
  if (!extra.optionsFor) return extra.options
  return extra.optionsFor(remembered.effectiveFor(props.row))
}

/**
 * A dropdown changed: hand the picked value to the store, which reconciles whatever depends on it
 * through the registry. Found by its text, because a `<select>` reports strings and a Pi's model
 * is a number.
 *
 * @param {string} param
 * @param {readonly import('../../core/kernel/registry.js').OpUiOption[]} options
 * @param {Event} event
 */
function onChoiceChange(param, options, event) {
  const text = /** @type {HTMLSelectElement} */ (event.target).value
  const picked = options.find((option) => String(option.value) === text)
  if (picked) remembered.setChoice(props.row, param, picked.value)
}

/** @param {Event} event */
function onUnitsChange(event) {
  const select = /** @type {HTMLSelectElement} */ (event.target)
  void library.setMeshUnits(props.row.op, /** @type {'mm' | 'cm' | 'inch'} */ (select.value))
}

/**
 * The line saying what a drag will now place, in the Bill of materials' words (`detailOf`). Empty
 * when the row is at its defaults.
 */
const summary = computed(() => {
  if (!remembered.isCustom(props.row)) return ''
  return detailOf(props.row.op, summaryParamsFor(props.row, remembered.effectiveFor(props.row)))
})

/** @param {PointerEvent} event */
function onRowPointerDown(event) {
  startLibraryDrag(event, props.row)
}

// --- the tile ---------------------------------------------------------------------------------

const calloutShown = ref(false)
/** Where the callout sits: fixed to the viewport, so the rail's scroller cannot clip it. */
const calloutStyle = ref({ top: '0px', left: '0px' })
const tileEl = ref(/** @type {HTMLButtonElement | null} */ (null))
/** @type {ReturnType<typeof setTimeout> | undefined} */
let pressTimer
/** @type {ReturnType<typeof setTimeout> | undefined} */
let lingerTimer
/** Whether this press showed the name: its release then reads the name, it does not open. */
let pressShowedName = false

function clearPressTimer() {
  if (pressTimer !== undefined) clearTimeout(pressTimer)
  pressTimer = undefined
}

function hideCalloutSoon() {
  if (lingerTimer !== undefined) clearTimeout(lingerTimer)
  lingerTimer = setTimeout(() => {
    lingerTimer = undefined
    calloutShown.value = false
  }, CALLOUT_LINGER_MS)
}

/** @param {PointerEvent} event */
function onTilePointerDown(event) {
  pressShowedName = false
  const started = startLibraryDrag(event, props.row, {
    deferUntilMoved: true,
    onTap: () => {
      if (!pressShowedName) emit('tap')
    },
    onBegin: () => {
      clearPressTimer()
      calloutShown.value = false
    },
    onEnd: () => {
      clearPressTimer()
      if (calloutShown.value) hideCalloutSoon()
    },
  })
  if (!started || event.pointerType === 'mouse') return
  clearPressTimer()
  pressTimer = setTimeout(() => {
    pressTimer = undefined
    pressShowedName = true
    const rect = tileEl.value?.getBoundingClientRect()
    if (rect) calloutStyle.value = { top: `${rect.top + rect.height / 2}px`, left: `${rect.right + 6}px` }
    calloutShown.value = true
  }, LONG_PRESS_MS)
}

/**
 * Keyboard activation (Enter / Space): a click with no pointer press behind it (`detail` 0). A
 * pointer tap is already handled on release, so its trailing click is ignored here.
 *
 * @param {MouseEvent} event
 */
function onTileClick(event) {
  if (event.detail === 0) emit('tap')
}

onBeforeUnmount(() => {
  clearPressTimer()
  if (lingerTimer !== undefined) clearTimeout(lingerTimer)
})
</script>

<template>
  <!-- The icon rail's tile (TODO/ui-084). -->
  <li v-if="variant === 'tile'" class="library__tile-item">
    <button
      ref="tileEl"
      type="button"
      class="library__tile"
      :class="{ 'library__tile--active': placement.op === row.op }"
      :data-testid="`library-row-${row.op}`"
      :data-op="row.op"
      :data-label="row.label"
      :data-editor="row.editor ?? ''"
      :disabled="timeline.previewing"
      :title="timeline.previewing ? previewTitle : row.label"
      :aria-label="row.label"
      :aria-expanded="expanded"
      aria-haspopup="dialog"
      @pointerdown="onTilePointerDown"
      @click="onTileClick"
    >
      <img
        v-if="user && row.thumbnail"
        class="library__thumb"
        :src="row.thumbnail"
        alt=""
        draggable="false"
      />
      <span
        v-else
        class="library__swatch library__swatch--tile"
        :class="{ 'library__swatch--part': user }"
        :data-shape="user ? undefined : row.op"
        aria-hidden="true"
      />
      <span v-if="user && (row.usage ?? 0) > 0" class="library__in-project library__in-project--tile" aria-hidden="true" />
    </button>
    <span
      v-if="calloutShown"
      class="library__tile-callout"
      role="tooltip"
      data-testid="library-tile-callout"
      :style="calloutStyle"
    >
      {{ row.label }}
    </span>
  </li>

  <!-- A catalogue row, labelled (the column and the row pop-out). -->
  <li v-else-if="!user" class="library__item" :class="{ 'library__item--stacked': stacked }">
    <div class="library__line">
      <button
        type="button"
        class="library__row"
        :class="{ 'library__row--active': placement.op === row.op }"
        :data-testid="dragTestId"
        :data-op="row.op"
        :data-label="row.label"
        :data-editor="row.editor ?? ''"
        :disabled="timeline.previewing"
        :title="timeline.previewing ? previewTitle : undefined"
        @pointerdown="onRowPointerDown"
      >
        <span class="library__swatch" :data-shape="row.op" aria-hidden="true" />
        {{ row.label }}
      </button>
      <!-- ↺ Reset (ui-068): only while the row is not at its registry defaults. A sibling of
           the drag button, never inside it, so pressing it cannot start a placement. -->
      <button
        v-if="remembered.isCustom(row)"
        type="button"
        class="library__reset"
        :data-testid="`library-reset-${row.op}`"
        :aria-label="`Reset ${row.label} to its default`"
        :title="`Reset ${row.label} to its default`"
        @click="remembered.reset(row.op)"
      >
        <span aria-hidden="true">↺</span>
      </button>
    </div>
    <p v-if="summary" class="library__remembered" :data-testid="`library-remembered-${row.op}`">
      {{ summary }}
    </p>
    <!-- A variant picked before the drag (ui-031). Outside the button on purpose. -->
    <label v-if="row.choice" class="library__choice">
      <span class="library__choice-label">{{ row.choice.label }}</span>
      <select
        :value="remembered.effectiveFor(row)[row.choice.param]"
        class="library__choice-select"
        @change="onChoiceChange(row.choice.param, row.choice.options, $event)"
        :data-testid="`library-choice-${row.op}`"
        :aria-label="`${row.choice.label} for ${row.label}`"
      >
        <option v-for="option in row.choice.options" :key="String(option.value)" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
    <!-- A second pre-drag variant (core-057's Case beside its Model): the same control, one
         label per extra choice. -->
    <label v-for="extra in row.extraChoices" :key="extra.param" class="library__choice">
      <span class="library__choice-label">{{ extra.label }}</span>
      <select
        :value="remembered.effectiveFor(row)[extra.param]"
        class="library__choice-select"
        @change="onChoiceChange(extra.param, extraOptions(extra), $event)"
        :data-testid="`library-choice-${row.op}-${extra.param}`"
        :aria-label="`${extra.label} for ${row.label}`"
      >
        <option v-for="option in extraOptions(extra)" :key="String(option.value)" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>
  </li>

  <!-- A My parts row (TODO/ui-055), labelled. -->
  <li
    v-else
    class="library__item library__item--user"
    :class="{ 'library__item--has-reset': remembered.isCustom(row) }"
    :data-in-library="row.inLibrary ? 'true' : 'false'"
  >
    <button
      type="button"
      class="library__row"
      :class="{ 'library__row--active': placement.op === row.op }"
      :data-testid="dragTestId"
      :data-op="row.op"
      :data-label="row.label"
      data-editor=""
      :disabled="timeline.previewing"
      :title="rowTitle"
      @pointerdown="onRowPointerDown"
    >
      <img
        v-if="row.thumbnail"
        class="library__thumb"
        :src="row.thumbnail"
        alt=""
        draggable="false"
        :data-testid="`library-thumb-${row.op}`"
      />
      <span v-else class="library__swatch library__swatch--part" aria-hidden="true" />
      <span class="library__row-label">{{ row.label }}</span>
      <span
        v-if="(row.usage ?? 0) > 0"
        class="library__in-project"
        :data-testid="`library-in-project-${row.op}`"
        :title="`In this project (${row.usage} placed)`"
        role="img"
        :aria-label="`In this project, ${row.usage} placed`"
      />
    </button>
    <button
      v-if="remembered.isCustom(row)"
      type="button"
      class="library__reset"
      :data-testid="`library-reset-${row.op}`"
      :aria-label="`Reset ${row.label} to its default`"
      :title="`Reset ${row.label} to its default`"
      @click="remembered.reset(row.op)"
    >
      <span aria-hidden="true">↺</span>
    </button>
    <UserPartMenu :row="userRow" />
    <p v-if="summary" class="library__remembered library__remembered--user" :data-testid="`library-remembered-${row.op}`">
      {{ summary }}
    </p>
    <div v-if="row.mesh" class="library__mesh" :data-testid="`library-mesh-${row.op}`">
      <span
        class="library__tag"
        data-testid="library-mesh-tag"
        :title="`Imported model, ${row.mesh.triangleCount.toLocaleString('en-US')} triangles`"
        >Mesh</span
      >
      <span class="library__mesh-size" data-testid="library-mesh-size">{{ row.mesh.sizeText }}</span>
      <label class="library__choice library__choice--mesh">
        <span class="library__choice-label">Units</span>
        <select
          class="library__choice-select"
          :value="row.mesh.units ?? 'mm'"
          :data-testid="`library-mesh-units-${row.op}`"
          :aria-label="`Units of ${row.label}`"
          @change="onUnitsChange($event)"
        >
          <option v-for="option in UNIT_OPTIONS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>
      <span
        v-if="!row.mesh.unitsConfirmed"
        class="library__badge"
        data-testid="library-mesh-assumed"
        title="STL files carry no units. Check the size above; change Units if it looks wrong."
        >Units assumed: mm</span
      >
    </div>
  </li>
</template>

<style scoped>
.library__item {
  display: grid;
  /* `minmax(0, 1fr)`, not the implicit auto track: a variant select with a long option
     ("Galaxy S25 Ultra") must shrink to the panel rather than push the row wider than it. */
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

/* The variant control (ui-031). Indented under its row and visibly quieter than
   it, so the row still reads as the thing you drag and this as a setting on it —
   not as a second, competing control of equal weight. */
.library__choice {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 28px;
}

.library__choice-label {
  font-size: 11px;
  color: var(--text-3);
}

.library__choice-select {
  flex: 1;
  min-width: 0;
  /* 32px, not the row's 44px: this is a setting reached deliberately after
     reading the row, not a primary tap target, and a second 44px control per row
     would cost 12 rows' worth of height in a 46vh phone sheet. Still comfortably
     above the ~24px a native select needs to be tappable. */
  min-height: 32px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text-1);
  font: inherit;
  font-size: 12px;
}

/* WebKit's native select ignores `min-height` and draws 20px; an explicit height is honoured. */
.library__item--stacked .library__choice-select {
  height: 32px;
}

.library__choice-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* The drag row plus its ↺ Reset (ui-068), side by side; the button is 44 x 44 at the right edge. */
.library__line {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.library__line .library__row {
  flex: 1;
  min-width: 0;
  width: auto;
}

.library__reset {
  flex: none;
  width: 44px;
  min-height: 44px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.library__reset:hover {
  border-color: var(--border-strong);
}

.library__reset:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* What the next drag will place, in the Bill of materials' words (ui-068). Wraps under the label. */
.library__remembered {
  margin: 0;
  padding-left: 28px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.library__remembered--user {
  grid-column: 1 / -1;
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

/* --- the icon rail's tile (TODO/ui-084) ------------------------------------------------- */
.library__tile-item {
  position: relative;
  display: flex;
  justify-content: center;
}

.library__tile {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--tap);
  height: var(--tap);
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  cursor: grab;
  /* The same trap as `.library__row`: a touch-drag must reach the placement gesture. */
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.library__tile:hover,
.library__tile:focus-visible {
  border-color: var(--border-strong);
  outline: none;
}

.library__tile:focus-visible {
  box-shadow: 0 0 0 2px var(--accent);
}

.library__tile[aria-expanded='true'],
.library__tile:active,
.library__tile--active {
  border-color: var(--accent);
}

.library__tile:active,
.library__tile--active {
  cursor: grabbing;
}

.library__tile:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* A newly saved My parts tile pulses once (`LibraryPanel`'s reveal, TODO/ui-084). */
.library__tile-item[data-pulse='true'] .library__tile {
  animation: library-tile-pulse 0.9s ease-out;
}

@keyframes library-tile-pulse {
  0% {
    box-shadow: 0 0 0 0 var(--accent);
  }

  100% {
    box-shadow: 0 0 0 10px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .library__tile-item[data-pulse='true'] .library__tile {
    animation: none;
    border-color: var(--accent);
  }
}

/* The name on a long-press (touch has no hover), beside the rail over the viewport. Fixed, at the
   tile's right edge (set from its rect when shown), so the rail's scroller never clips it. */
.library__tile-callout {
  position: fixed;
  z-index: 16;
  transform: translateY(-50%);
  padding: 4px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  box-shadow: var(--shadow-overlay);
  color: var(--text-1);
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}

.library__swatch {
  flex: none;
  width: 18px;
  height: 18px;
  border: 1px solid var(--text-3);
  background: linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* On a tile the swatch is the whole icon, so it is drawn a little larger. */
.library__swatch--tile {
  width: 24px;
  height: 24px;
}

.library__swatch[data-shape='primitive.sphere'] {
  border-radius: 50%;
}

.library__swatch[data-shape='primitive.cylinder'],
.library__swatch[data-shape='primitive.tube'] {
  border-radius: 40% / 18%;
}

/* A tube is a cylinder with a bore; at 24px the bore is what tells the two tiles apart. */
.library__swatch[data-shape='primitive.tube'] {
  background:
    radial-gradient(ellipse 30% 14% at 50% 18%, var(--surface-1) 0 100%, transparent 100%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

.library__swatch[data-shape='primitive.cone'],
.library__swatch[data-shape='primitive.triangle'] {
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
}

/* A cone has a curved base, a triangle a flat one, so the two tiles differ (TODO/ui-084). */
.library__swatch[data-shape='primitive.cone'] {
  clip-path: polygon(50% 0%, 100% 82%, 90% 92%, 72% 98%, 50% 100%, 28% 98%, 10% 92%, 0% 82%);
}

.library__swatch[data-shape='primitive.hexagon'] {
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
}

/* TODO/ui-084: a cube in three-quarter view — a lit top face over the square. */
.library__swatch[data-shape='primitive.cuboid'] {
  background:
    linear-gradient(to bottom, var(--text-3) 0 30%, transparent 30%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* TODO/ui-084: a sketch — a pencil stroke drawn diagonally across a sheet. */
.library__swatch[data-shape='primitive.sketch'] {
  border-style: dashed;
  background:
    linear-gradient(
      135deg,
      transparent 0 42%,
      var(--accent) 42% 58%,
      transparent 58%
    ),
    var(--surface-1);
}

/* Hardware (TODO/ui-030). Silhouettes cut from the same swatch the primitives
   use rather than icon art: at 18px a bolt's profile and a washer's ring read
   from across the panel, and a per-part SVG would be four assets to keep in step
   with four recipes for no more legibility. */
.library__swatch[data-shape='hardware.bolt'] {
  /* Head across the top, shank down the middle — a bolt in elevation. */
  clip-path: polygon(14% 0%, 86% 0%, 86% 34%, 66% 34%, 66% 100%, 34% 100%, 34% 34%, 14% 34%);
}

.library__swatch[data-shape='hardware.nut'] {
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  /* The bore, so a nut is not mistaken for the hexagon primitive above it. */
  background:
    radial-gradient(circle at 50% 50%, var(--surface-1) 0 26%, transparent 26%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

.library__swatch[data-shape='hardware.washer'],
.library__swatch[data-shape='hardware.bearing'] {
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, var(--surface-1) 0 34%, transparent 34%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* A bearing's bore is the smaller of the two, which is what tells the two rings
   apart at this size. */
.library__swatch[data-shape='hardware.bearing'] {
  background:
    radial-gradient(circle at 50% 50%, var(--surface-1) 0 22%, transparent 22%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* Text (TODO/render-002): a capital T in elevation, same clip-path technique. */
.library__swatch[data-shape='text.label'] {
  clip-path: polygon(0% 0%, 100% 0%, 100% 24%, 62% 24%, 62% 100%, 38% 100%, 38% 24%, 0% 24%);
}

/* Kit parts and Raspberry Pi (TODO/ui-031). Grouped by *silhouette* rather than
   one bespoke swatch per recipe: at 18px a board, a frame, a ring and a screen
   are the only shapes that actually read, and fifteen near-identical rounded
   rectangles would be fifteen assets to keep in step with no gain in legibility.
   What distinguishes the rows at this size is their label; what the swatch says
   is which *kind* of thing it is. */
.library__swatch[data-shape^='kit.'],
.library__swatch[data-shape^='raspberrypi.'] {
  /* The default: a bare board. */
  border-radius: 2px;
}

/* TODO/ui-084: a generic board (no brand logo) — four mounting holes in the corners. */
.library__swatch[data-shape='kit.board'] {
  background:
    radial-gradient(circle at 20% 20%, var(--surface-1) 0 9%, transparent 9%),
    radial-gradient(circle at 80% 20%, var(--surface-1) 0 9%, transparent 9%),
    radial-gradient(circle at 20% 80%, var(--surface-1) 0 9%, transparent 9%),
    radial-gradient(circle at 80% 80%, var(--surface-1) 0 9%, transparent 9%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* TODO/ui-084: a phone — a tall rounded slab with a screen inset. */
.library__swatch[data-shape='kit.phone'] {
  width: 12px;
  margin: 0 3px;
  border-radius: 3px;
  background:
    linear-gradient(var(--text-3), var(--text-3)) padding-box content-box,
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
  padding: 2px 1px 3px;
}

.library__swatch--tile[data-shape='kit.phone'] {
  width: 15px;
  margin: 0 4.5px;
}

/* A frame — a board with its middle cut out. */
.library__swatch[data-shape='kit.boardFrame'] {
  background:
    linear-gradient(var(--surface-1), var(--surface-1)) padding-box content-box,
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
  padding: 4px;
}

/* An anchor and a standoff are both a bored cylinder, seen end-on. */
.library__swatch[data-shape='kit.anchor'],
.library__swatch[data-shape='raspberrypi.hatStandoff'] {
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, var(--surface-1) 0 30%, transparent 30%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* A populated board: the GPIO header as a stripe along one edge. */
.library__swatch[data-shape='raspberrypi.bplus'],
.library__swatch[data-shape='raspberrypi.hat'],
.library__swatch[data-shape='raspberrypi.spacer'] {
  background:
    linear-gradient(to bottom, var(--text-3) 0 3px, transparent 3px),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* A camera: the lens barrel, centred. */
.library__swatch[data-shape='raspberrypi.cameraModule'] {
  background:
    radial-gradient(circle at 50% 50%, var(--text-3) 0 30%, transparent 30%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* A screen: an inset display area inside a bezel. */
.library__swatch[data-shape='raspberrypi.screen'] {
  background:
    linear-gradient(var(--text-3), var(--text-3)) padding-box content-box,
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
  padding: 3px;
}

/* A fan: a round hub in a square shroud. */
.library__swatch[data-shape='raspberrypi.activeCoolingFan'] {
  background:
    radial-gradient(circle at 50% 50%, transparent 0 20%, var(--text-3) 20% 46%, transparent 46%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* Gears (TODO/core-041, listed once ui-057 gives them `ui`; TODO/ui-084 gives them a swatch now):
   a toothed ring — a bored disc with a dashed rim. */
.library__swatch[data-shape^='gear.'] {
  border-radius: 50%;
  border-style: dashed;
  border-width: 2px;
  background:
    radial-gradient(circle at 50% 50%, var(--surface-1) 0 22%, transparent 22%),
    linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

/* --- My parts (TODO/ui-055) ----------------------------------------------------------- */
.library__item--user {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 4px;
}

.library__item--has-reset {
  grid-template-columns: minmax(0, 1fr) auto auto;
}

.library__row-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library__thumb {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 3px;
  background: var(--surface-1);
  object-fit: contain;
  /* The row, not the picture, is what receives the pointer that starts a placement. */
  pointer-events: none;
  -webkit-user-drag: none;
}

.library__swatch--part {
  border-radius: 3px;
  border-style: dashed;
}

.library__in-project {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.library__in-project--tile {
  position: absolute;
  top: 3px;
  right: 3px;
}

.library__tag {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  font-size: 10px;
  line-height: 16px;
  color: var(--text-2);
}

.library__mesh {
  /* Under the row and its ⋯ button, across both columns of the user item's grid. */
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  padding-left: 28px;
  font-size: 11px;
  color: var(--text-3);
}

.library__choice--mesh {
  flex: 1 1 120px;
  padding-left: 0;
}

.library__badge {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 10px;
  line-height: 16px;
}

/* --- phone: rows in the bottom sheet (interaction-model-qa control 1, Q16) */
@media (max-width: 640px) {
  /* Rows whose Size follows their Type (core-060) stack their dropdowns, each a full
     44px tap target like the row above them. */
  .library__item--stacked .library__choice-select {
    min-height: 44px;
    height: 44px;
  }
}
</style>
