<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Library's icons tier (`TODO/ui-084`): a 72px rail of 44px tiles, "the same as the
 * Operations toolbar" — the same rows, in the same section order, as icons with their names on
 * hover, long-press and `aria-label`.
 *
 * - **Tiles** are `LibraryRow` in its `tile` form, so a drag from a tile is the labelled row's own
 *   gesture (same ghost, same drop) and keeps the `library-row-<op>` test id. A tap without moving
 *   opens the row's **pop-out** (`LibraryRowPopout`) with its settings.
 * - **Sections** are separated by a thin divider whose `title` and `aria-label` name the section.
 *   The section lists keep the `library-rows` / `library-rows-<id>` ids, and each divider keeps the
 *   `library-heading-<id>` id with the title as visually hidden text.
 * - **One pop-out at a time**, across both panels, in the layout store's `openPopout`
 *   (`library-row:<op>`). Escape closes it and returns focus to the tile; a press anywhere outside
 *   the rail closes it without swallowing the press, so a tap on the viewport still selects.
 * - **The top** holds the ? help button and a ⋯ menu with **Import part file…** and
 *   **Import model…** (the panel owns the file inputs; this emits `import-part` / `import-model`).
 * - **My parts** stays collapsible: its toggle is a tile with the count as a badge.
 * - **The Repeat hint** (`ui-069`) cannot fit a 72px rail, so it is a callout pinned to the rail's
 *   top-right edge, with the same text and test id. It ignores the pointer, so it never blocks the
 *   Operations toolbar it may sit over.
 *
 * ## The launcher form (`TODO/ui-081`)
 *
 * In the pop-out tier (`libraryTier === 'popout'`, E 641–789, the store's 64px track) `LibraryPanel`
 * mounts this rail with `form="launchers"`: one **section launcher** per section (Primitives,
 * Hardware, Kit Parts, Raspberry Pi, Gears, Text, then My parts with its count), each a 44px glyph
 * with a 10px short name. A tap opens that section's **pop-out** (`LibrarySectionPopout`), in the
 * same shared `openPopout` slot (`library-section:<id>`), so opening it closes any other pop-out of
 * either panel and vice versa. Tapping it again closes it, Escape closes it and returns focus to the
 * launcher, and a press outside closes it without swallowing the press. The top keeps ? and ⋯.
 *
 * A change of form (a tier change) closes whichever pop-out belonged to the form that is going, at
 * once and without animation; the panel holds the form steady while a drag is under way.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { LIBRARY_SECTIONS } from '../../core/library.js'
import { useEscapeToClose } from '../../composables/useEscapeToClose.js'
import { useLibraryStore } from '../../stores/library.js'
import { usePanelLayoutStore } from '../../stores/panelLayout.js'
import { useRepeatStore } from '../../stores/repeat.js'
import HelpButton from '../controls/HelpButton.vue'
import LibraryRow from './LibraryRow.vue'
import LibraryRowPopout from './LibraryRowPopout.vue'
import LibrarySectionPopout from './LibrarySectionPopout.vue'

const props = defineProps({
  /** `tiles` (the icons tier, `ui-084`) or `launchers` (the pop-out tier, `ui-081`). */
  form: { type: /** @type {import('vue').PropType<'tiles' | 'launchers'>} */ (String), default: 'tiles' },
})

const emit = defineEmits(['import-part', 'import-model'])

/** The `openPopout` prefix for a Library row pop-out. */
const POPOUT_PREFIX = 'library-row:'
/** The `openPopout` prefix for a Library section pop-out (`TODO/ui-081`). */
const SECTION_PREFIX = 'library-section:'
/** The section pop-out's widest, and its margin from the pane's far edge: `min(280, P − 32)`. */
const SECTION_POPOUT_MAX_PX = 280
const SECTION_POPOUT_MARGIN_PX = 32

const sections = LIBRARY_SECTIONS
const library = useLibraryStore()
const repeat = useRepeatStore()
const panelLayout = usePanelLayoutStore()

const railEl = ref(/** @type {HTMLElement | null} */ (null))
const moreButton = ref(/** @type {HTMLButtonElement | null} */ (null))
const moreOpen = ref(false)
const popoutTopPx = ref(0)

/** The op whose pop-out is open, or `null` (another panel's pop-out, or none). */
const openOp = computed(() => {
  const id = panelLayout.openPopout
  return id !== null && id.startsWith(POPOUT_PREFIX) ? id.slice(POPOUT_PREFIX.length) : null
})

/** The open pop-out's row, and whether it is a My parts row. */
const open = computed(() => {
  const op = openOp.value
  if (op === null) return null
  for (const section of sections) {
    const row = section.rows.find((candidate) => candidate.op === op)
    if (row) return { row, user: false }
  }
  const userRow = library.userRows.find((candidate) => candidate.op === op)
  return userRow ? { row: userRow, user: true } : null
})

/**
 * A My parts ⋯ menu, or its Rename / Delete dialog, is up. They teleport to `<body>` and are modal
 * (their own backdrop and Escape), so while one is open the pop-out it came from must not treat
 * those presses or that Escape as "outside" and close underneath it.
 */
const userPartUiOpen = computed(() => library.menuOp !== null || library.renameOp !== null || library.deleteOp !== null)

// A pop-out whose row has gone (a deleted My parts part) gives the shared slot back.
watch(open, (now) => {
  if (now === null && openOp.value !== null) panelLayout.openPopout = null
})

/** The sections drawn as tiles: all of them in the tiles form, none in the launcher form. */
const tileSections = computed(() => (props.form === 'tiles' ? sections : []))

/** The launchers, in the column's section order, then My parts (`user`). */
const launchers = [...sections.map((section) => ({ id: section.id, title: section.title })), { id: 'user', title: 'My parts' }]

/** The section whose pop-out is open (`'user'` for My parts), or `null`. */
const openSectionId = computed(() => {
  const id = panelLayout.openPopout
  return id !== null && id.startsWith(SECTION_PREFIX) ? id.slice(SECTION_PREFIX.length) : null
})

/** The open section, or `null` for My parts; `undefined` when none is open. */
const openSection = computed(() => {
  const id = openSectionId.value
  if (id === null) return undefined
  return sections.find((section) => section.id === id) ?? null
})

const sectionPopoutWidthPx = computed(() =>
  Math.min(SECTION_POPOUT_MAX_PX, panelLayout.layout.paneWidthPx - SECTION_POPOUT_MARGIN_PX),
)

/** @param {string} id @returns {HTMLElement | null} */
function launcherFor(id) {
  return railEl.value?.querySelector(`[data-testid="library-launcher-${id}"]`) ?? null
}

/** A tap on a launcher: open its section, switch to it from another pop-out, or close it. */
function onLaunch(/** @type {string} */ id) {
  moreOpen.value = false
  panelLayout.openPopout = openSectionId.value === id ? null : `${SECTION_PREFIX}${id}`
}

/** @param {string} op @returns {HTMLElement | null} */
function tileFor(op) {
  const tiles = railEl.value?.querySelectorAll('.library__tile') ?? []
  for (const tile of tiles) if (/** @type {HTMLElement} */ (tile).dataset.op === op) return /** @type {HTMLElement} */ (tile)
  return null
}

/**
 * Place the pop-out level with its tile, then keep it inside the rail's height.
 *
 * @param {string} op
 */
async function placePopout(op) {
  const rail = railEl.value
  const tile = tileFor(op)
  if (!rail || !tile) return
  popoutTopPx.value = Math.max(8, tile.getBoundingClientRect().top - rail.getBoundingClientRect().top - 8)
  await nextTick()
  const popout = /** @type {HTMLElement | null} */ (rail.querySelector('.library-popout'))
  const height = popout?.offsetHeight ?? 0
  if (height > 0) popoutTopPx.value = Math.max(8, Math.min(popoutTopPx.value, rail.clientHeight - height - 8))
}

/** A tap on a tile: open its pop-out, switch to it from another, or close it if it is open. */
function onTap(/** @type {string} */ op) {
  moreOpen.value = false
  if (openOp.value === op) {
    panelLayout.openPopout = null
    return
  }
  panelLayout.openPopout = `${POPOUT_PREFIX}${op}`
  void placePopout(op)
}

/** Close this rail's pop-out, a row's or a section's; another panel's is left alone. */
function closePopout() {
  if (openOp.value !== null || openSectionId.value !== null) panelLayout.openPopout = null
}

// A tier change swaps the form: the pop-out of the form that is going goes with it, at once.
watch(
  () => props.form,
  () => closePopout(),
)

function toggleMore() {
  closePopout()
  moreOpen.value = !moreOpen.value
}

/** @param {'import-part' | 'import-model'} which */
function choose(which) {
  moreOpen.value = false
  if (which === 'import-part') emit('import-part')
  else emit('import-model')
}

// Escape closes whichever is open and hands focus back to what opened it.
useEscapeToClose(
  () => (openOp.value !== null || openSectionId.value !== null || moreOpen.value) && !userPartUiOpen.value,
  () => {
    const op = openOp.value
    if (op !== null) {
      panelLayout.openPopout = null
      void nextTick(() => tileFor(op)?.focus())
      return
    }
    const sectionId = openSectionId.value
    if (sectionId !== null) {
      panelLayout.openPopout = null
      void nextTick(() => launcherFor(sectionId)?.focus())
      return
    }
    moreOpen.value = false
    void nextTick(() => moreButton.value?.focus())
  },
)

/**
 * A press anywhere outside the rail (its tiles, the pop-out, the menu) closes what is open. It is
 * only observed, never prevented, so a tap on the viewport still selects normally.
 *
 * @param {Event} event
 */
function onDocumentPointerDown(event) {
  if (userPartUiOpen.value) return
  const target = /** @type {Node | null} */ (event.target)
  if (target && railEl.value?.contains(target)) return
  closePopout()
  moreOpen.value = false
}

watch(
  () => openOp.value !== null || openSectionId.value !== null || moreOpen.value,
  (anything) => {
    if (anything) document.addEventListener('pointerdown', onDocumentPointerDown, true)
    else document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  // The rail is going (a tier change, or phone width): its pop-out goes with it, at once.
  closePopout()
})
</script>

<template>
  <div ref="railEl" class="library-rail" data-testid="library-rail">
    <div class="library-rail__scroll">
      <div class="library-rail__top">
        <HelpButton topic="library" class="library-rail__help" />
        <button
          ref="moreButton"
          type="button"
          class="library-rail__more"
          data-testid="library-rail-more"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          aria-controls="library-rail-menu"
          aria-label="More Library actions"
          title="More: import a part file or a model"
          @click="toggleMore"
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </div>

      <!-- The pop-out tier (TODO/ui-081): one launcher per section, each opening its pop-out. -->
      <ul v-if="form === 'launchers'" class="library-rail__launchers">
        <li v-for="item in launchers" :key="item.id">
          <button
            type="button"
            class="library-rail__launcher"
            :data-testid="`library-launcher-${item.id}`"
            :data-section="item.id"
            :aria-expanded="openSectionId === item.id"
            aria-controls="library-section-popout"
            :aria-label="item.id === 'user' ? `My parts, ${library.userRows.length} saved` : item.title"
            :title="item.title"
            @click="onLaunch(item.id)"
          >
            <span class="library-rail__launcher-glyph" aria-hidden="true">
              <span v-if="item.id === 'user'" class="library-rail__part-glyph" />
              <template v-else>{{ item.title.charAt(0) }}</template>
              <span v-if="item.id === 'user'" class="library-rail__badge" data-testid="library-user-count">{{
                library.userRows.length
              }}</span>
            </span>
            <span class="library-rail__launcher-name" aria-hidden="true">{{ item.title }}</span>
          </button>
        </li>
      </ul>

      <template v-for="section in tileSections" :key="section.id">
        <h2
          class="library-rail__divider"
          :data-testid="`library-heading-${section.id}`"
          :title="section.title"
          :aria-label="section.title"
        >
          <span class="library-rail__hidden">{{ section.title }}</span>
        </h2>
        <ul
          class="library-rail__tiles"
          :data-testid="section.id === 'primitive' ? 'library-rows' : `library-rows-${section.id}`"
        >
          <LibraryRow
            v-for="row in section.rows"
            :key="row.op"
            :row="row"
            variant="tile"
            :expanded="openOp === row.op"
            @tap="onTap(row.op)"
          />
        </ul>
      </template>

      <!-- My parts (TODO/ui-055): still collapsible; the toggle is a tile with the count. -->
      <template v-if="form === 'tiles'">
        <h2 class="library-rail__divider" data-testid="library-heading-user" title="My parts" aria-label="My parts">
          <span class="library-rail__hidden">My parts</span>
        </h2>
        <div class="library-rail__toggle-item">
          <button
            type="button"
            class="library-rail__toggle"
            data-testid="library-section-toggle-user"
            :aria-expanded="library.expanded"
            aria-controls="library-rail-user"
            :aria-label="`My parts, ${library.userRows.length} saved`"
            :title="`My parts (${library.userRows.length})`"
            @click="library.expanded = !library.expanded"
          >
            <span class="library-rail__part-glyph" aria-hidden="true" />
            <span class="library-rail__badge" data-testid="library-user-count">{{ library.userRows.length }}</span>
          </button>
        </div>
        <ul v-show="library.expanded" id="library-rail-user" class="library-rail__tiles" data-testid="library-rows-user">
          <LibraryRow
            v-for="row in library.userRows"
            :key="row.op"
            :row="row"
            user
            variant="tile"
            :expanded="openOp === row.op"
            @tap="onTap(row.op)"
          />
        </ul>
      </template>
    </div>

    <div v-if="moreOpen" id="library-rail-menu" class="library-rail__menu" role="menu" data-testid="library-rail-menu">
      <button
        type="button"
        role="menuitem"
        class="library-rail__menu-item"
        data-testid="library-import"
        title="Add the parts in a part file to My parts"
        @click="choose('import-part')"
      >
        Import part file…
      </button>
      <button
        type="button"
        role="menuitem"
        class="library-rail__menu-item"
        data-testid="library-import-model"
        title="Add an STL model file to My parts as a part you can place"
        @click="choose('import-model')"
      >
        Import model…
      </button>
    </div>

    <!-- Callouts pinned to the rail's top-right edge: what a 72px rail cannot hold as a paragraph. -->
    <div class="library-rail__callouts">
      <p v-if="repeat.libraryHint" class="library-rail__callout" data-testid="library-repeat-hint">
        {{ repeat.libraryHint }}
      </p>
      <p v-if="library.modelImporting" class="library-rail__callout" role="status" data-testid="library-import-progress">
        Reading {{ library.modelImporting }}…
      </p>
      <p v-if="library.importError" class="library-rail__callout library-rail__callout--error" role="alert" data-testid="library-import-error">
        {{ library.importError }}
      </p>
    </div>

    <LibraryRowPopout v-if="open" :row="open.row" :user="open.user" :top-px="popoutTopPx" />
    <LibrarySectionPopout
      v-if="form === 'launchers' && openSection !== undefined"
      :section="openSection"
      :width-px="sectionPopoutWidthPx"
    />
  </div>
</template>

<style scoped>
.library-rail {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* Only the tiles scroll: the pop-out, the menu and the callouts are siblings of this box, so its
   `overflow` never clips them. The full catalogue is ~1240px of tiles, taller than the tablet's
   1127px body, so the rail does scroll. */
.library-rail__scroll {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 0;
  padding: 8px 0 12px;
  overflow-x: hidden;
  overflow-y: auto;
}

.library-rail__top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.library-rail__more,
.library-rail__toggle {
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
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.library-rail__more:hover,
.library-rail__toggle:hover,
.library-rail__more[aria-expanded='true'] {
  border-color: var(--border-strong);
}

.library-rail__more:focus-visible,
.library-rail__toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* A thin rule between sections; the name is its `title` / `aria-label`. */
.library-rail__divider {
  width: 32px;
  height: 1px;
  margin: 4px 0;
  border: none;
  background: var(--border-strong);
}

.library-rail__hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.library-rail__tiles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.library-rail__toggle-item {
  display: flex;
  justify-content: center;
}

/* --- The section launchers (TODO/ui-081): a 44px glyph over a 10px short name, in 64px. */
.library-rail__launchers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.library-rail__launcher {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 60px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-2);
  font: inherit;
  cursor: pointer;
}

.library-rail__launcher-glyph {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--tap);
  height: var(--tap);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 18px;
  font-weight: 650;
  line-height: 1;
}

.library-rail__launcher-name {
  max-width: 100%;
  font-size: 10px;
  line-height: 1.15;
  text-align: center;
  overflow-wrap: anywhere;
}

.library-rail__launcher:hover .library-rail__launcher-glyph {
  border-color: var(--border-strong);
}

.library-rail__launcher:focus-visible {
  outline: none;
}

.library-rail__launcher:focus-visible .library-rail__launcher-glyph {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

/* Pressed / open: the launcher's section pop-out is showing. */
.library-rail__launcher[aria-expanded='true'] {
  color: var(--text-1);
}

.library-rail__launcher[aria-expanded='true'] .library-rail__launcher-glyph {
  border-color: var(--accent);
  background: var(--surface-1);
  box-shadow: inset 0 0 0 1px var(--accent);
}

/* The generic part swatch (`library__swatch--part`'s look), drawn at tile size. */
.library-rail__part-glyph {
  width: 22px;
  height: 22px;
  border: 1px dashed var(--text-3);
  border-radius: 3px;
  background: linear-gradient(140deg, var(--border-strong), var(--surface-1));
}

.library-rail__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.library-rail__menu {
  position: absolute;
  top: 56px;
  left: calc(100% + 6px);
  z-index: 15;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-overlay);
}

.library-rail__menu-item {
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.library-rail__menu-item:hover,
.library-rail__menu-item:focus-visible {
  border-color: var(--border-strong);
  outline: none;
}

.library-rail__callouts {
  position: absolute;
  top: 8px;
  left: calc(100% + 6px);
  z-index: 14;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 220px;
  max-width: calc(100vw - var(--library-width, 72px) - 24px);
  /* Informational: never in the way of the Operations toolbar underneath. */
  pointer-events: none;
}

.library-rail__callout {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--surface-glass);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-overlay);
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.library-rail__callout--error {
  border-color: var(--danger);
  color: var(--danger);
}
</style>
