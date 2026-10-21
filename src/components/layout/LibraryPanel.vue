<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Library panel: one draggable row per catalogue item the kernel registry
 * offers, grouped into sections — "Primitives" (`primitive.*`), "Hardware"
 * (`hardware.*`, `TODO/ui-030`), "Kit Parts" (`kit.*`) and "Raspberry Pi"
 * (`raspberrypi.*`, both `TODO/ui-031`).
 *
 * ## One mechanism, twenty-six rows
 *
 * CLAUDE.md forbids twenty-six near-identical hand-copies, and it equally forbids
 * a menu built by blindly iterating a registry. Both are satisfied the same way:
 * the sections and their rows come from `src/core/library.js`, which derives them
 * from the registry's own `ui` metadata and `operandCount`, and the drag payload
 * is the op string plus whatever variant the row offers. `ui-031` added fifteen
 * rows and two whole sections and this file gained no recipe name, no section
 * name and no per-part branch — the claim `ui-030` made, collected on.
 *
 * The sections differ in **nothing** a user can feel: same gesture, same ghost,
 * same drop, same selection afterwards. What differs is invisible and lives
 * entirely in `library.js` — a primitive carries its position in its own `center`
 * param, while a recipe has no position param at all and is moved into place by a
 * trailing `transform.translate`.
 *
 * These are **creation** rows — `operandCount: 0`, geometry from nothing — and
 * they live in their own sections, never mixed into a list with operations like
 * union or fillet that need operands selected first.
 *
 * ## A row with a variant (`TODO/ui-031`)
 *
 * Two rows — the Raspberry Pi board and the Camera Module — are one registry op
 * parameterised by `model`, per `core-014a`'s "one factory, not one draggable per
 * revision" decision. They carry a `<select>` **inside the row, beside the drag
 * handle**, so:
 *
 * - the drag gesture itself is byte-for-byte the one every other row uses —
 *   `LibraryRow` hands `startLibraryDrag` a fixed payload off the row it was pressed on;
 * - the choice is made *before* the drag, where it is visible, rather than in a
 *   modifier held during it or a dialog after it;
 * - the panel names no recipe: which rows have a choice, what param it sets and
 *   what values it offers all come off `row.choice`, so a third such recipe is a
 *   registry change and nothing here.
 *
 * The `<select>` is a sibling of the drag button rather than a child, because a
 * form control inside a `<button>` is invalid HTML and would never receive its own
 * pointer events. That sibling relationship is also what keeps a press on the
 * dropdown from starting a placement — the gesture is bound to the button alone.
 *
 * Since `TODO/ui-084` a row is its own component (`LibraryRow.vue`, with `LibrarySection.vue`
 * for a catalogue section), so the labelled column, the icon rail's tiles and the row pop-out
 * share one row and one gesture (`src/composables/useLibraryDrag.js`).
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { LIBRARY_SECTIONS } from '../../core/library.js'
import { stopLibraryDrag } from '../../composables/useLibraryDrag.js'
import { useTierCrossfade } from '../../composables/useTierCrossfade.js'
import { useLibraryStore } from '../../stores/library.js'
import { usePanelLayoutStore } from '../../stores/panelLayout.js'
import { usePlacementStore } from '../../stores/placement.js'
import { useRepeatStore } from '../../stores/repeat.js'
import HelpButton from '../controls/HelpButton.vue'
import LibraryRail from './LibraryRail.vue'
import LibraryRow from './LibraryRow.vue'
import LibrarySection from './LibrarySection.vue'
import { acceptAttribute } from '../../io/meshFormats/index.js'

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

const sections = LIBRARY_SECTIONS
/**
 * *My parts* (`TODO/ui-055`) is not in {@link LIBRARY_SECTIONS}: its rows are read live from
 * the registry's user-part layers (`library.userRows`), so a saved part appears without a
 * reload. It is rendered by the same row component (`LibraryRow`), the same drag payload and the
 * same gesture as every other section — the only differences are the ⋯ menu, the thumbnail and
 * the "in this project" dot.
 */
const library = useLibraryStore()
const isOpen = ref(false)
const importInput = ref(/** @type {HTMLInputElement | null} */ (null))
const modelInput = ref(/** @type {HTMLInputElement | null} */ (null))
/** The file types **Import model file…** offers (`.stl` today); no `capture`, so a phone offers Files. */
const modelAccept = acceptAttribute()
const fileDragOver = ref(false)
const panelEl = ref(/** @type {HTMLElement | null} */ (null))

/**
 * The Library's form (`TODO/ui-084`): the labelled column in the `labels` tier (and the phone
 * sheet), the icon rail in the `icons` tier. The `popout` tier (E 641–789) is `TODO/ui-081`'s
 * section launchers; until it lands it shows this rail too, in the store's 64px track.
 *
 * The swap crossfades (`useTierCrossfade`) so labels never squash mid-change. The content and the
 * grid track change in the same render — the tier is swapped synchronously, and `AppView` applies
 * the store's track with no transition — so the rail is in before the track narrows and the column
 * is back only once the track is wide again. A drag under way survives the swap: the gesture's
 * listeners live in `useLibraryDrag`, not in the row that started it.
 */
const panelLayout = usePanelLayoutStore()
const { tier: libraryTier, fading: libraryFading } = useTierCrossfade(() => panelLayout.layout.libraryTier)
const railForm = computed(() => libraryTier.value === 'icons' || libraryTier.value === 'popout')

/** How long a newly revealed My parts tile pulses (ms); the CSS animation matches. */
const PULSE_MS = 900

// A part just saved (or imported, or duplicated) is brought into view: My parts sits below the
// whole catalogue, so without this the new row appears off-screen in the column or the sheet. In
// the rail its tile also pulses once, since a 44px tile is easy to miss (TODO/ui-084).
watch(
  () => library.revealOp,
  async (op) => {
    if (op === null) return
    await nextTick()
    const rows = panelEl.value?.querySelectorAll('[data-testid^="library-row-"]') ?? []
    const row = Array.from(rows).find((node) => /** @type {HTMLElement} */ (node).dataset.op === op)
    if (!row) return
    row.scrollIntoView?.({ block: 'nearest' })
    if (!row.classList.contains('library__tile')) return
    const item = /** @type {HTMLElement | null} */ (row.parentElement)
    if (!item) return
    item.dataset.pulse = 'true'
    setTimeout(() => {
      delete item.dataset.pulse
    }, PULSE_MS)
  },
)

/** Read the chosen part file and add its parts to the local library. */
async function onImportFile(/** @type {Event} */ event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await library.importText(await file.text())
}

/** Read the chosen model file; the store parses it in a worker and adds the part. */
async function onModelFile(/** @type {Event} */ event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  await library.importModel(file)
}

/** @param {DragEvent} event */
function hasFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

/** Dropping a file on the panel is a convenience at laptop width; the button is the path. */
function onFileDragOver(/** @type {DragEvent} */ event) {
  if (!hasFiles(event)) return
  event.preventDefault()
  fileDragOver.value = true
}

function onFileDragLeave() {
  fileDragOver.value = false
}

async function onFileDrop(/** @type {DragEvent} */ event) {
  fileDragOver.value = false
  if (!hasFiles(event)) return
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (file) await library.importModel(file)
}

watch(
  () => props.collapseSignal,
  () => setOpen(false),
)

/** A Repeat session (`TODO/ui-069`): its hint line here, and its phone sheet shrinks when this opens. */
const repeat = useRepeatStore()

/** @param {boolean} value */
function setOpen(value) {
  if (isOpen.value === value) return
  isOpen.value = value
  if (value) repeat.minimize()
  emit('open-change', value)
}
const dragEl = ref(/** @type {HTMLElement | null} */ (null))

/** Unsubscribe handle for the placement store's pointer feed while a drag is under way. */
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

/**
 * The one drag icon follows every Library drag, whichever row, tile or pop-out row started it
 * (`LibraryRow` → `startLibraryDrag`). Subscribed for exactly the life of the placement, and
 * synchronously, so the first `pointermove` already moves it.
 */
watch(
  () => placement.isDragging,
  (dragging) => {
    unsubscribe?.()
    unsubscribe = null
    if (!dragging) return
    unsubscribe = placement.subscribe(positionDragIcon)
    positionDragIcon()
  },
  { flush: 'sync' },
)

onBeforeUnmount(() => {
  stopLibraryDrag()
  unsubscribe?.()
  unsubscribe = null
})
</script>

<template>
  <aside
    ref="panelEl"
    class="library"
    data-testid="library-panel"
    :data-open="isOpen ? 'true' : 'false'"
    :data-dragging="placement.isDragging ? 'true' : 'false'"
    :data-library-form="railForm ? 'rail' : 'column'"
    :data-library-fading="libraryFading ? 'true' : 'false'"
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

    <!-- The icons tier (TODO/ui-084): the same rows as tiles. -->
    <LibraryRail v-if="railForm" @import-part="importInput?.click()" @import-model="modelInput?.click()" />

    <div
      v-else
      id="library-sheet"
      class="library__sheet"
      :data-file-over="fileDragOver ? 'true' : 'false'"
      @dragover="onFileDragOver"
      @dragleave="onFileDragLeave"
      @drop="onFileDrop"
    >
      <div class="library__hint-row">
        <p class="library__hint" data-testid="library-hint">
          Drag an item into the 3D view to place it.
        </p>
        <HelpButton topic="library" class="library__help" />
      </div>
      <!-- While a Repeat session is armed (TODO/ui-069): what to drag, and onto which part. -->
      <p v-if="repeat.libraryHint" class="library__repeat-hint" data-testid="library-repeat-hint">
        {{ repeat.libraryHint }}
      </p>
      <LibrarySection v-for="section in sections" :key="section.id" :section="section" />

      <!-- My parts (TODO/ui-055): parts the person saved from a group. A collapsible section,
           so the fixed catalogue is not pushed off a phone sheet by a long personal list.
           Import part file… lives in the header, where the section is, so it is reachable
           even before the first part exists. -->
      <div class="library__user-head">
        <h2 class="library__heading library__heading--toggle" data-testid="library-heading-user">
          <button
            type="button"
            class="library__section-toggle"
            data-testid="library-section-toggle-user"
            :aria-expanded="library.expanded"
            aria-controls="library-user-body"
            @click="library.expanded = !library.expanded"
          >
            <span class="library__chevron" aria-hidden="true">{{ library.expanded ? '▾' : '▸' }}</span>
            My parts
            <span class="library__count" data-testid="library-user-count">{{ library.userRows.length }}</span>
          </button>
        </h2>
        <button
          type="button"
          class="library__import"
          data-testid="library-import"
          title="Add the parts in a part file to My parts"
          @click="importInput?.click()"
        >
          Import part file…
        </button>
        <button
          type="button"
          class="library__import"
          data-testid="library-import-model"
          title="Add an STL model file to My parts as a part you can place"
          @click="modelInput?.click()"
        >
          Import model file…
        </button>
      </div>
      <div v-show="library.expanded" id="library-user-body" data-testid="library-user-body">
        <p
          v-if="library.modelImporting"
          class="library__reading"
          role="status"
          data-testid="library-import-progress"
        >
          <span class="library__spinner" aria-hidden="true" />
          Reading {{ library.modelImporting }}…
        </p>
        <p v-if="library.importError" class="library__import-error" role="alert" data-testid="library-import-error">
          {{ library.importError }}
        </p>
        <p v-if="library.loadProblem" class="library__import-error" role="status" data-testid="library-load-problem">
          Your saved parts could not all be read: {{ library.loadProblem }}
        </p>
        <p v-if="library.userRows.length === 0" class="library__hint" data-testid="library-user-empty">
          Nothing saved yet. Select a group, then choose Save to library… — or choose Import model file… for an STL — and it appears here.
        </p>
        <ul class="library__rows" data-testid="library-rows-user">
          <LibraryRow v-for="row in library.userRows" :key="row.op" :row="row" user />
        </ul>
      </div>
    </div>

    <!-- The file inputs behind Import part file… and Import model file…, shared by the column and
         the rail's ⋯ menu. Visually hidden, in the panel's positioned box (ui-055), so WebKit and
         Firefox do not grow the page. -->
    <input
      ref="importInput"
      type="file"
      accept=".json,application/json"
      class="library__file"
      data-testid="library-import-input"
      tabindex="-1"
      aria-hidden="true"
      @change="onImportFile"
    />
    <input
      ref="modelInput"
      type="file"
      :accept="modelAccept"
      class="library__file"
      data-testid="library-import-model-input"
      tabindex="-1"
      aria-hidden="true"
      @change="onModelFile"
    />

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
  /* The containing block for the visually-hidden file inputs (and, in the icons tier, the anchor
     the rail's pop-out and callouts sit beside). The phone sheet overrides it with `absolute`. */
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface-1);
  border-right: 1px solid var(--border);
}

/* The tier crossfade (`TODO/ui-084`, `useTierCrossfade`): the form swaps in the same frame this
   starts at 0.4, then it fades back up. A one-shot animation, never a standing transition. */
.library[data-library-fading='true'] {
  animation: library-tier-crossfade 150ms ease-out;
}

@keyframes library-tier-crossfade {
  from {
    opacity: 0.4;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .library[data-library-fading='true'] {
    animation: none;
  }
}

.library__tab {
  /* Tablet and laptop keep the column visible, so the tab is phone-only. */
  display: none;
}

.library__sheet {
  /* The containing block for the visually-hidden file input below; without it that input's
     static position (the end of the list) escapes the scroller and grows the page. */
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 10px 12px 14px;
  overflow-y: auto;
}

.library__heading {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-3);
}

.library__hint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 10px;
}

/* The 44px target overhangs the hint's line instead of growing the row (`TODO/ui-061`). */
.library__help {
  margin: -14px -8px -14px 0;
}

.library__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
}

.library__repeat-hint {
  margin: 0 0 6px;
  padding: 6px 8px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-1);
}

.library__rows {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* --- My parts (TODO/ui-055) ----------------------------------------------------------- */
.library__user-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  margin-top: 14px;
}

.library__user-head .library__heading {
  margin: 0;
  flex: 1 1 100%;
  min-width: 0;
}

.library__section-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 44px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  text-align: left;
  cursor: pointer;
}

.library__chevron {
  width: 12px;
  text-align: center;
}

.library__count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 11px;
  letter-spacing: 0;
}

.library__import {
  /* Its own line in the 210 px column, so neither it nor the heading wraps. */
  flex: 1 1 100%;
  min-height: 44px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.library__import:hover {
  border-color: var(--border-strong);
}

.library__reading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--text-2);
}

.library__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: library-spin 0.8s linear infinite;
}

@keyframes library-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .library__spinner {
    animation: none;
  }
}

.library__sheet[data-file-over='true'] {
  outline: 2px dashed var(--accent);
  outline-offset: -4px;
}

.library__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.library__import-error {
  margin: 0 0 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--danger);
  overflow-wrap: anywhere;
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
    /* Lifted above the Inspector's docked tab while the sheet is open (AppView, ui-070). */
    bottom: var(--library-bottom, 0px);
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
