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
import { ref } from 'vue'

import Inspector from '../components/inspector/Inspector.vue'
import LibraryPanel from '../components/layout/LibraryPanel.vue'
import Viewport from '../components/viewport/Viewport.vue'

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
</script>

<template>
  <div class="app" data-testid="app-root">
    <header class="app__bar" data-testid="app-header">
      <h1 class="app__title">WarpCad</h1>
      <p class="app__hint" data-testid="app-hint">
        Drag a shape in from the Library · click a shape to inspect it · drag to orbit
      </p>
    </header>
    <main
      class="app__body"
      :data-inspector-sheet="inspectorSheet"
    >
      <LibraryPanel
        :collapse-signal="libraryCollapse"
        @open-change="libraryOpen = $event"
      />
      <Viewport />
      <Inspector
        :library-sheet-open="libraryOpen"
        @sheet-change="inspectorSheet = $event"
        @claim-sheet="libraryCollapse += 1"
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
  align-items: baseline;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
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

@media (max-width: 480px) {
  .app__bar {
    padding: 6px 10px;
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
