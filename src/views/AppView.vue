<script setup>
/**
 * The app's single root view.
 *
 * CLAUDE.md's Architecture section: no client-side router, no history-API
 * routes — the app is one screen, so this view mounts directly from
 * `src/main.js` rather than being resolved by a route. It is a thin composition
 * layer only (CLAUDE.md: "views must be thin"); everything with behaviour lives
 * in `src/components/viewport/`.
 *
 * This is also the view the reachability rule is checked against: a control that
 * is not reachable from here is not shipped, whatever its own tests say
 * (PREVIOUS-ATTEMPT.md's core failure).
 */
import { computed, onMounted, ref, watch } from 'vue'

import Inspector from '../components/inspector/Inspector.vue'
import SaveStatus from '../components/display/SaveStatus.vue'
import FileMenu from '../components/storage/FileMenu.vue'
import { bootStorage } from '../composables/useStorageBoot.js'
import HistoryControls from '../components/layout/HistoryControls.vue'
import LibraryPanel from '../components/layout/LibraryPanel.vue'
import ObjectsPanel from '../components/layout/ObjectsPanel.vue'
import ObjectsToggle from '../components/layout/ObjectsToggle.vue'
import TimelinePanel from '../components/timeline/TimelinePanel.vue'
import TimelineStrips from '../components/timeline/TimelineStrips.vue'
import TimelineToggle from '../components/timeline/TimelineToggle.vue'
import Viewport from '../components/viewport/Viewport.vue'
import { useHostedStore } from '../stores/hosted.js'
import { useObjectsPanelStore } from '../stores/objectsPanel.js'
import { usePersistenceStore } from '../stores/persistence.js'
import { useTimelineStore } from '../stores/timeline.js'

// Restore the last autosaved session and start autosaving (`TODO/io-001`). Started on
// mount, not at store creation: the app renders first, the restore lands a moment later
// and frames the camera, and a slow or blocked store can never delay first paint.
//
// Then the hosted connection (`TODO/ui-033`): `io-002` deliberately left `hosted.start()`
// unwired until there was a File-button dot to say a restored auto-push connection is live.
// `bootStorage` runs it *after* the local restore has landed — see that module for why the
// order is load-bearing.
const persistence = usePersistenceStore()
const hosted = useHostedStore()
onMounted(() => {
  void bootStorage({ persistence, hosted })
})

/**
 * Whether the Inspector's phone-width bottom sheet is currently open.
 *
 * The Inspector owns *when* it opens — selection is its trigger, and control 3's
 * Q16 says it auto-opens with no extra tap. What this view owns is the
 * consequence for everything underneath: while the sheet is up, the viewport's
 * own overlays (nav chrome, scale readout) inset above it rather than
 * disappearing behind it. `ui-010`'s hand-drive found exactly that defect with
 * the Library sheet — a passing spec could not see it — so the inset is wired
 * for this sheet from the start rather than after someone notices.
 */
/** @type {import('vue').Ref<'none' | 'tab' | 'open'>} */
const inspectorSheet = ref('none')

/**
 * Whether the Library's phone-width bottom sheet is up.
 *
 * At phone width there is exactly one bottom-sheet slot and both panels want it.
 * `ui-011`'s acceptance drive found them stacking into unreadable mush, so this
 * view — the composition layer, and the only thing that can see both — arbitrates
 * it. Panel layout is UI state, which CLAUDE.md puts squarely here.
 *
 * The arbitration is deliberately asymmetric, because the two panels are not
 * symmetric in intent: opening the Library is something the user *asked* for, so
 * the Inspector declines to auto-open over it (`librarySheetOpen` below), while
 * deliberately opening the Inspector — tapping its tab — collapses the Library
 * (`libraryCollapse`). A drop never closes the Library, because placing several
 * shapes in a row is exactly what `TODO/ACCEPTANCE.md` scenario 1 does.
 */
const libraryOpen = ref(false)
/** Bumped to tell the Library the Inspector has claimed the sheet slot. */
const libraryCollapse = ref(0)

/**
 * The History panel joins the same one-sheet-slot argument (`TODO/ui-032`, §13).
 *
 * There is now a third panel that wants the phone's single bottom-sheet slot,
 * and §13 settles the arbitration in the same asymmetric shape the other two
 * already use — opening History is something the user *asked* for, so:
 *
 * - opening History collapses the Library sheet (below);
 * - while History is open the Inspector **declines to auto-open on selection**,
 *   exactly as it already declines over an open Library;
 * - tapping the Inspector's tab closes History (it emits `claim-sheet`).
 *
 * Nothing new was invented for this: the Inspector's existing "something else
 * owns the slot" input is reused, which is why it is now named for the slot
 * rather than for the Library specifically.
 */
const timeline = useTimelineStore()

/**
 * The Objects list is the fourth panel and does **not** get a fourth slot
 * (`TODO/ui-041`).
 *
 * It shares History's: the one bottom dock at ≥641px and the one bottom sheet at phone
 * width, with History's offsets, so the Library and Inspector tabs and the nav chrome
 * clear it exactly as they clear History. Both are things the user *asked* for, so
 * they are mutually exclusive rather than stacked — opening either closes the other
 * (which also ends a History preview, the same as closing History always does), and
 * everything else in the arbitration below treats "either is open" as "the slot is
 * claimed". `flush: 'sync'` so a toggle never renders a frame with both open.
 */
const objects = useObjectsPanelStore()
const sheetSlotClaimed = computed(() => libraryOpen.value || timeline.open || objects.open)

watch(
  () => timeline.open,
  (open) => {
    if (open) {
      libraryCollapse.value += 1
      objects.setOpen(false)
    }
  },
  { flush: 'sync' }
)

watch(
  () => objects.open,
  (open) => {
    if (open) {
      libraryCollapse.value += 1
      timeline.setOpen(false)
    }
  },
  { flush: 'sync' }
)

/**
 * Opening the phone Library sheet is the same deliberate claim, in the other direction.
 *
 * Found by hand-driving at 390px while building the Objects list: with History (or
 * Objects) open, tapping the Library tab put its sheet *behind* the panel — the tab and
 * half a list of shapes showing through the top of it. The hole was already there for
 * History (`ui-032` arbitrated three of the four directions); a fourth panel made it
 * worth closing, and it is the same three lines for both. Only ever fires at phone
 * width: at ≥641px the Library is a column and `libraryOpen` never turns on.
 */
watch(
  libraryOpen,
  (open) => {
    if (!open) return
    timeline.setOpen(false)
    objects.setOpen(false)
  },
  { flush: 'sync' }
)

/** Tapping the Inspector's tab is a deliberate claim on the slot — History and Objects yield. */
function onInspectorClaim() {
  libraryCollapse.value += 1
  timeline.setOpen(false)
  objects.setOpen(false)
}
</script>

<template>
  <div class="app" data-testid="app-root">
    <header class="app__bar" data-testid="app-header">
      <h1 class="app__title">WarpCad</h1>
      <p class="app__hint" data-testid="app-hint">
        Drag a shape in from the Library · click a shape to inspect it · drag to orbit
      </p>
      <!-- The "document bar" cluster (`docs/decisions/interaction-model-qa.md`,
           cross-cutting): document-level controls that are not gated on
           selection, right-aligned in the one strip that is always visible.
           `data-003` fills the first two slots and the save-status chip (`io-001`)
           the last; the History toggle (`ui-032`) and File ▾ (`ui-033`, which
           `ui-034`'s Export… joins) sit in between without moving either. -->
      <div class="app__document-bar" data-testid="document-bar">
        <HistoryControls />
        <ObjectsToggle />
        <TimelineToggle />
        <FileMenu />
        <SaveStatus />
      </div>
    </header>
    <!-- Between the header and the main area, deliberately outside the viewport
         (§14): the viewport's own four corners are already spoken for, and
         `ui-015`'s retirement note is what a control growing into the
         orientation gizmo's corner actually costs. -->
    <TimelineStrips />
    <main
      class="app__body"
      :data-inspector-sheet="inspectorSheet"
      :data-timeline-sheet="timeline.open ? 'open' : 'none'"
      :data-objects-sheet="objects.open ? 'open' : 'none'"
    >
      <LibraryPanel
        :collapse-signal="libraryCollapse"
        @open-change="libraryOpen = $event"
      />
      <!-- The viewport column, which the History dock shares at ≥641px and
           which the History sheet overlays at phone width. -->
      <div class="app__stage">
        <Viewport />
        <TimelinePanel />
        <ObjectsPanel />
      </div>
      <Inspector
        :sheet-slot-claimed="sheetSlotClaimed"
        @sheet-change="inspectorSheet = $event"
        @claim-sheet="onInspectorClaim()"
      />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--surface-0);
}

.app__bar {
  display: flex;
  /* Centred, not baseline-aligned, since `data-003`: the bar now holds 44px tap
     targets as well as text, and a baseline would hang them off the title's
     text baseline instead of centring them in the strip. */
  align-items: center;
  gap: 12px;
  /* Tighter than the old 8px because the 44px controls now set the bar's height
     (~52px at phone width, up from ~30px). The cross-cutting decision calls that
     growth a deliberate cost; there is no reason to add to it with padding. */
  padding: 4px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.app__document-bar {
  /* Right-aligned, and the thing that pushes it there — so the cluster stays put
     as `ui-032`/`ui-033` add controls beside it. */
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.app__title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.02em;
  color: var(--text-1);
}

.app__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
  /* Never force horizontal scrolling of primary UI at phone width
     (CLAUDE.md Responsive Layout). */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app__stage {
  /* The viewport column. A flex column at ≥641px so the History dock takes a
     fixed slice off the bottom and the viewport keeps the rest; `position:
     relative` so the phone-width History sheet can overlay the viewport
     without escaping the column. */
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

/* The viewport takes whatever the History dock leaves. `min-height: 0` is the
   load-bearing half: without it a flex child refuses to shrink below its
   content and the dock would push the canvas off the bottom of the column
   instead of sharing it. */
.app__stage > :deep(.viewport) {
  flex: 1 1 auto;
  min-height: 0;
}

.app__body {
  position: relative;
  display: grid;
  /* How much of the viewport's bottom edge the Library sheet's collapsed tab
     covers. The viewport's own overlays (nav chrome, scale readout) subtract
     this so the sheet never sits on top of a control — found by looking at a
     phone-width screenshot during ui-010's acceptance drive, which is exactly
     the class of bug a passing spec cannot see. Zero at widths where the
     Library is a column instead of a sheet. */
  --viewport-bottom-inset: 0px;
  /* Height of the Library sheet's collapsed tab. The Inspector sheet stacks
     directly on top of it rather than over it, so it reads the same number. */
  --library-tab-height: 52px;
  /* How tall the Inspector sheet is allowed to get at phone width, and how tall
     its collapsed tab is — both kept in step with the panel's own values. */
  --inspector-sheet-height: 38vh;
  --inspector-tab-height: 44px;
  /* How tall the History sheet is at phone width, and how far up from the
     bottom edge it has to start so the Library and Inspector tabs are not
     sitting on top of its last rows. Zero offset at widths where History is a
     dock rather than a sheet. `TimelinePanel.vue` reads both.

     **34vh, not the 46vh §13 sketched, and the number is arithmetic rather
     than taste.** At 390×844 the viewport is 791px, the Operations toolbar
     wraps to 167px and the nav chrome is 200px — 367px of controls that both
     have to stay on screen. The sheet's total claim on the bottom edge is
     `bottom + height + 12`, and the chrome is pushed up by exactly that, so
     keeping the chrome clear of the toolbar needs `bottom + height + 12 ≤
     844 − 200 − 228`, i.e. a height of at most ~308px against a 96px offset.
     46vh (388px) overlapped them by a measured 44px — the nav chrome landing
     *inside* the toolbar, which is `CLAUDE.md`'s "a panel that only works by
     covering a control" failure outright. Found by hand-driving scenario 12 at
     phone width, not by a spec. */
  --bottom-panel-height: 34vh;
  --bottom-panel-bottom: 0px;
  /* Phone first (CLAUDE.md Responsive Layout): one column, the viewport, with
     the Library panel and the Inspector overlaying it as bottom sheets. The
     persistent columns below are the wide-screen case, not the default. */
  grid-template-columns: 1fr;
  flex: 1;
  min-height: 0;
}

@media (max-width: 640px) {
  .app__body {
    /* The collapsed tab's 44px tap target plus its border and breathing room. */
    --viewport-bottom-inset: var(--library-tab-height);
  }

  /* The viewport's own controls sit above whatever the Inspector is currently
     covering — never behind it. Three states, not two: a *collapsed* sheet still
     puts its 44px tab over the 3D view, and treating that as "nothing" is what
     left the scale readout half-hidden in ui-011's acceptance drive. */
  .app__body[data-inspector-sheet='tab'] {
    --viewport-bottom-inset: calc(var(--library-tab-height) + var(--inspector-tab-height));
  }

  .app__body[data-inspector-sheet='open'] {
    --viewport-bottom-inset: calc(
      var(--library-tab-height) + var(--inspector-tab-height) + var(--inspector-sheet-height) + 12px
    );
  }

  /* The History sheet claims the slot outright (§13: the Inspector declines to
     auto-open while it is up), so it wins the inset rather than stacking on
     top of the others. Last rule wins at equal specificity — which is why this
     sits below the Inspector's two, deliberately. The same reasoning
     `ui-010`'s hand-drive forced for the Library tab: a sheet that covers the
     nav chrome and the scale readout is a defect a passing spec cannot see. */
  /* The History sheet clears the Library tab always, and the Inspector's tab
     whenever that is showing too. Found by hand-driving scenario 12 at 390×844
     in WebKit: with a body selected, the Inspector's 44px tab sat on top of the
     sheet's last row and silently swallowed taps on it — the same
     tab-covers-a-control defect `ui-010`'s own acceptance drive found with the
     Library tab and the nav chrome, and equally invisible to a passing spec
     that happened to tap a row higher up the list. */
  .app__body {
    --bottom-panel-bottom: var(--library-tab-height);
  }

  .app__body[data-inspector-sheet='tab'],
  .app__body[data-inspector-sheet='open'] {
    --bottom-panel-bottom: calc(var(--library-tab-height) + var(--inspector-tab-height));
  }

  .app__body[data-timeline-sheet='open'],
  .app__body[data-objects-sheet='open'] {
    --viewport-bottom-inset: calc(
      var(--bottom-panel-bottom) + var(--bottom-panel-height) + 12px
    );
  }
}

@media (min-width: 641px) {
  .app__body {
    /* Wide enough for persistent side panels — narrow enough that the viewport
       still owns most of the screen, including at the 820px tablet reference. */
    grid-template-columns: 210px 1fr 220px;
  }
}

@media (min-width: 1100px) {
  .app__body {
    grid-template-columns: 210px 1fr 280px;
  }
}

@media (max-width: 640px) {
  /* The hint is mouse-oriented prose ("drag to orbit") that already truncated to
     nothing at 390px, and the document-bar cluster needs the width more. Hidden
     rather than shrunk, per the cross-cutting phone budget: title ~60px + Undo
     44 + Redo 44 + the controls still to come + gaps ≈ 320px at 390px wide. */
  .app__hint {
    display: none;
  }
}

@media (max-width: 359px) {
  /* Below the 390px narrowest reference target, and only because `ui-041`'s Objects toggle
     added a 44px control to a header that had 3px to spare at 320px (measured: 26px of
     horizontal overflow with it). The brand yields; the controls do not. */
  .app__title {
    display: none;
  }
}

@media (max-width: 480px) {
  .app__bar {
    padding: 4px 10px;
    gap: 8px;
  }

  .app__title {
    font-size: 14px;
  }

  .app__hint {
    font-size: 11px;
  }
}
</style>
