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
import Viewport from '../components/viewport/Viewport.vue'
</script>

<template>
  <div class="app" data-testid="app-root">
    <header class="app__bar" data-testid="app-header">
      <h1 class="app__title">WarpCad</h1>
      <p class="app__hint" data-testid="app-hint">
        Drag to orbit · use the pad to orbit, pan and zoom · tap an axis to snap the view
      </p>
    </header>
    <main class="app__body">
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
  flex: 1;
  min-height: 0;
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
