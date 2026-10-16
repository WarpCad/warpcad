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
 *   `onRowPointerDown` still reads a fixed payload off the row it was pressed on;
 * - the choice is made *before* the drag, where it is visible, rather than in a
 *   modifier held during it or a dialog after it;
 * - the panel names no recipe: which rows have a choice, what param it sets and
 *   what values it offers all come off `row.choice`, so a third such recipe is a
 *   registry change and nothing here.
 *
 * The `<select>` is a sibling of the drag button rather than a child, because a
 * form control inside a `<button>` is invalid HTML and would never receive its own
 * pointer events. That sibling relationship is also what keeps a press on the
 * dropdown from starting a placement — `onRowPointerDown` is bound to the button
 * alone.
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
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'

import { LIBRARY_SECTIONS } from '../../core/library.js'
import { useLibraryStore } from '../../stores/library.js'
import { usePlacementStore } from '../../stores/placement.js'
import { useTimelineStore } from '../../stores/timeline.js'
import HelpButton from '../controls/HelpButton.vue'
import UserPartMenu from './UserPartMenu.vue'
import { acceptAttribute } from '../../io/meshFormats/index.js'
import { UNIT_SCALES } from '../../io/meshPart.js'

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
/**
 * §14, point 3: while a past step is being previewed, "Library rows
 * (drag-to-place)" are disabled along with everything else that would mutate
 * the document. Dropping a shape onto a viewport showing step 2 of 5 would
 * append it to the *latest* document, somewhere the user cannot see — the
 * silently-wrong outcome `SECOND-ATTEMPT.md` is a catalogue of.
 */
const timeline = useTimelineStore()

const sections = LIBRARY_SECTIONS
/**
 * *My parts* (`TODO/ui-055`) is not in {@link LIBRARY_SECTIONS}: its rows are read live from
 * the registry's user-part layers (`library.userRows`), so a saved part appears without a
 * reload. It is rendered by the same row template, the same drag payload and the same
 * `onRowPointerDown` as every other section — the only differences are the ⋯ menu, the
 * thumbnail and the "in this project" dot.
 */
const library = useLibraryStore()
const isOpen = ref(false)
const importInput = ref(/** @type {HTMLInputElement | null} */ (null))
const modelInput = ref(/** @type {HTMLInputElement | null} */ (null))
/** The file types **Import model file…** offers (`.stl` today); no `capture`, so a phone offers Files. */
const modelAccept = acceptAttribute()
const UNIT_OPTIONS = Object.freeze([
  { value: 'mm', label: 'mm' },
  { value: 'cm', label: 'cm' },
  { value: 'inch', label: 'inch' },
])
const fileDragOver = ref(false)
const sheetEl = ref(/** @type {HTMLElement | null} */ (null))

// A part just saved (or imported, or duplicated) is brought into view: My parts sits below the
// whole catalogue, so without this the new row appears off-screen in the column or the sheet.
watch(
  () => library.revealOp,
  async (op) => {
    if (op === null) return
    await nextTick()
    const row = sheetEl.value?.querySelector(`[data-testid="library-row-${CSS.escape(op)}"]`)
    row?.scrollIntoView?.({ block: 'nearest' })
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

/**
 * @param {string} op
 * @param {Event} event
 */
function onUnitsChange(op, event) {
  const select = /** @type {HTMLSelectElement} */ (event.target)
  void library.setMeshUnits(op, /** @type {keyof typeof UNIT_SCALES} */ (select.value))
}

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
 * The variant currently selected on each row that offers one, keyed by op
 * (`TODO/ui-031`) — `{ 'raspberrypi.bplus': 4, 'raspberrypi.cameraModule': 'v3' }`.
 *
 * Seeded from each row's own registry default rather than from a literal here, so
 * the `<select>` opens showing exactly what a drag would place if it were never
 * touched. Panel state, not document state: it is which variant the *next* drag
 * from that row commits, and it deliberately persists across drags, because
 * someone placing a Pi 5 and then a second Pi 5 should not have to pick twice.
 *
 * @type {Record<string, any>}
 */
const chosen = reactive(
  Object.fromEntries(
    LIBRARY_SECTIONS.flatMap((section) => section.rows)
      .filter((row) => row.choice)
      .map((row) => [row.op, row.defaults[/** @type {any} */ (row.choice).param]]),
  ),
)

/**
 * The second and later variants a row offers beside its `choice` (`TODO/core-057`: a
 * phone's Case), keyed `op` then `param`. Same lifetime and seeding as {@link chosen}.
 *
 * @type {Record<string, Record<string, any>>}
 */
const chosenExtra = reactive(
  Object.fromEntries(
    LIBRARY_SECTIONS.flatMap((section) => section.rows)
      .filter((row) => row.extraChoices?.length)
      .map((row) => [
        row.op,
        Object.fromEntries(row.extraChoices.map((extra) => [extra.param, row.defaults[extra.param]])),
      ]),
  ),
)

/**
 * The params a drag from this row commits on top of its defaults — the chosen
 * variant, or nothing at all for a row with no choice.
 *
 * Returns a fresh object only for the rows that need one; every other row hands
 * back the shared frozen empty, so the common drag allocates nothing.
 *
 * @param {import('../../core/library.js').LibraryRow} row
 * @returns {Record<string, any>}
 */
function overridesFor(row) {
  if (!row.choice) return NO_OVERRIDES
  const extras = chosenExtra[row.op]
  return { [row.choice.param]: chosen[row.op], ...(extras ?? {}) }
}

/** Shared payload for the rows with nothing to choose. See {@link overridesFor}. */
const NO_OVERRIDES = Object.freeze({})

/**
 * @param {PointerEvent} event
 * @param {import('../../core/library.js').LibraryRow} row
 */
function onRowPointerDown(event, row) {
  // Left button / primary contact only: a right-click or a middle-click must not
  // start a placement the user can't see themselves having started.
  if (event.button !== 0) return
  // Belt and braces with the `disabled` attribute below: a pointerdown can
  // still arrive from a synthetic event or a stale gesture, and a placement
  // started during a preview would commit against the wrong document.
  if (timeline.previewing) return
  event.preventDefault()
  stopTracking()
  unsubscribe = placement.subscribe(positionDragIcon)
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('pointercancel', onWindowPointerCancel)
  // The variant is read **here**, once, at the start of the gesture — so the
  // ghost and the committed record are built from the same choice even if the
  // dropdown were somehow changed mid-drag.
  placement.begin(row.op, row.label, event.clientX, event.clientY, overridesFor(row))
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

    <div
      id="library-sheet"
      ref="sheetEl"
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
      <template v-for="section in sections" :key="section.id">
        <h2 class="library__heading" :data-testid="`library-heading-${section.id}`">
          {{ section.title }}
        </h2>
        <!-- The primitives list keeps the bare `library-rows` id it has had since
             ui-010: a dozen existing specs open the panel by waiting on it, and
             renaming it would be churn with no reader-facing gain. Every other
             section is `library-rows-<id>`. -->
        <ul
          class="library__rows"
          :data-testid="section.id === 'primitive' ? 'library-rows' : `library-rows-${section.id}`"
        >
          <li v-for="row in section.rows" :key="row.op" class="library__item">
            <button
              type="button"
              class="library__row"
              :class="{ 'library__row--active': placement.op === row.op }"
              :data-testid="`library-row-${row.op}`"
              :data-op="row.op"
              :data-label="row.label"
              :data-editor="row.editor ?? ''"
              :disabled="timeline.previewing"
              :title="timeline.previewing ? 'Leave the preview to place a shape' : undefined"
              @pointerdown="onRowPointerDown($event, row)"
            >
              <span class="library__swatch" :data-shape="row.op" aria-hidden="true" />
              {{ row.label }}
            </button>
            <!-- A variant picked before the drag (ui-031). Outside the button on
                 purpose: a form control inside a <button> is invalid HTML and
                 would never get its own pointer events — and keeping it a sibling
                 is exactly what stops a press on it starting a placement. -->
            <label v-if="row.choice" class="library__choice">
              <span class="library__choice-label">{{ row.choice.label }}</span>
              <select
                v-model="chosen[row.op]"
                class="library__choice-select"
                :data-testid="`library-choice-${row.op}`"
                :aria-label="`${row.choice.label} for ${row.label}`"
              >
                <option v-for="option in row.choice.options" :key="String(option.value)" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <!-- A second pre-drag variant (core-057's Case beside its Model): the same
                 control, one label per extra choice. -->
            <label
              v-for="extra in row.extraChoices"
              :key="extra.param"
              class="library__choice"
            >
              <span class="library__choice-label">{{ extra.label }}</span>
              <select
                v-model="chosenExtra[row.op][extra.param]"
                class="library__choice-select"
                :data-testid="`library-choice-${row.op}-${extra.param}`"
                :aria-label="`${extra.label} for ${row.label}`"
              >
                <option v-for="option in extra.options" :key="String(option.value)" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
          </li>
        </ul>
      </template>

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
        <button
          type="button"
          class="library__import"
          data-testid="library-import-model"
          title="Add an STL model file to My parts as a part you can place"
          @click="modelInput?.click()"
        >
          Import model file…
        </button>
        <!-- The same visually-hidden-input recipe as the part-file input above (ui-055): in
             the sheet's positioned box, so WebKit and Firefox do not grow the page. -->
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
          <li v-for="row in library.userRows" :key="row.op" class="library__item library__item--user" :data-in-library="row.inLibrary ? 'true' : 'false'">
            <button
              type="button"
              class="library__row"
              :class="{ 'library__row--active': placement.op === row.op }"
              :data-testid="`library-row-${row.op}`"
              :data-op="row.op"
              :data-label="row.label"
              data-editor=""
              :disabled="timeline.previewing"
              :title="
                timeline.previewing
                  ? 'Leave the preview to place a shape'
                  : row.userPart?.newerVersionAvailable
                    ? `${row.label} — a newer version is saved in My parts; this project keeps the version it has`
                    : undefined
              "
              @pointerdown="onRowPointerDown($event, row)"
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
                v-if="row.usage > 0"
                class="library__in-project"
                :data-testid="`library-in-project-${row.op}`"
                :title="`In this project (${row.usage} placed)`"
                role="img"
                :aria-label="`In this project, ${row.usage} placed`"
              />
            </button>
            <UserPartMenu :row="row" />
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
                  @change="onUnitsChange(row.op, $event)"
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
        </ul>
      </div>
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

/* A section heading that is not the first one needs room above it, or the two
   lists read as one long list with a word in the middle. */
.library__rows + .library__heading {
  margin-top: 14px;
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

.library__rows {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

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

.library__choice-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
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

.library__item--user {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 4px;
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

<!-- Unscoped on purpose: it reads the *parent's* state (`AppView`'s `data-inspector-sheet`), which
     a scoped rule cannot select. At phone width the Inspector's collapsed tab (a body is selected)
     stacks over the bottom of the open Library sheet, so the last rows — My parts, now — would
     scroll to rest *under* it, unreachable. Leave room for it. Found hand-driving the phone: a
     placed Standoff's own row sat under the tab. -->
<style>
@media (max-width: 640px) {
  .app__body[data-inspector-sheet='tab'] .library__sheet {
    padding-bottom: calc(14px + var(--library-tab-height, 52px) + var(--inspector-tab-height, 44px));
  }
}
</style>
