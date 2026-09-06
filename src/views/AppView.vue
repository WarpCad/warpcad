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
import LibraryPanel from '../components/layout/LibraryPanel.vue'
import Viewport from '../components/viewport/Viewport.vue'
</script>

<template>
  <div class="app" data-testid="app-root">
    <header class="app__bar" data-testid="app-header">
      <h1 class="app__title">WarpCad</h1>
      <p class="app__hint" data-testid="app-hint">
        Drag a shape in from the Library · drag to orbit · tap an axis to snap the view
      </p>
    </header>
    <main class="app__body">
      <LibraryPanel />
      <Viewport />
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
  /* Phone first (CLAUDE.md Responsive Layout): one column, the viewport, with
     the Library panel overlaying it as a bottom sheet. The persistent column
     below is the wide-screen case, not the default. */
  grid-template-columns: 1fr;
  flex: 1;
  min-height: 0;
}

@media (max-width: 640px) {
  .app__body {
    /* The collapsed tab's 44px tap target plus its border and breathing room. */
    --viewport-bottom-inset: 52px;
  }
}

@media (min-width: 641px) {
  .app__body {
    /* Wide enough for a persistent side panel — narrow enough that the viewport
       still owns most of the screen. */
    grid-template-columns: 210px 1fr;
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
