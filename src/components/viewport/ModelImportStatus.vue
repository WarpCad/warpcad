<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one status line of **File → Import model…** (`TODO/ui-107`), near the top of the 3D view:
 *
 * - while the worker reads the file: *Reading bracket.stl…*, a spinner and **Cancel**
 *   (`model-import-reading`, `model-import-cancel`) — moved here from the Library, where the
 *   import no longer happens;
 * - a refusal (too large, not a model, unknown units) in the same place, `role="alert"`, with a
 *   dismiss button (`model-import-error`); the project did not change;
 * - after a commit, for a few seconds: *Imported bracket.stl — 12 triangles, 40 × 20 × 10 mm*,
 *   and for a 3MF the parts and anything skipped (`model-import-notice`, `role="status"`).
 *
 * Reads `stores/modelImport.js` only. The spinner is a CSS transform animation, so it keeps
 * turning on the compositor while the main thread folds.
 *
 * **Only its buttons take the pointer.** The line sits at the top centre at every width, where
 * the Library's own toast is, over the Operations toolbar's row at tablet and phone width. It is
 * pointer-transparent everywhere but Cancel and ✕, so it never blocks a toolbar button or a click
 * in the view (found by `e2e/import-3mf.e2e.js`'s hit test: the notice covered Align at tablet
 * width, and at phone width a lower position caught the click meant for the model).
 */
import { useModelImportStore } from '../../stores/modelImport.js'

const modelImport = useModelImportStore()
</script>

<template>
  <div
    v-if="modelImport.reading || modelImport.error || modelImport.notice"
    class="import-status"
    data-testid="model-import-status"
  >
    <p v-if="modelImport.reading" class="import-status__line" role="status" data-testid="model-import-reading">
      <span class="import-status__spinner" aria-hidden="true" />
      <span class="import-status__text">Reading {{ modelImport.reading }}…</span>
      <button type="button" class="import-status__button" data-testid="model-import-cancel" @click="modelImport.cancelReading()">
        Cancel
      </button>
    </p>
    <p v-else-if="modelImport.error" class="import-status__line import-status__line--error" role="alert" data-testid="model-import-error-line">
      <span class="import-status__text" data-testid="model-import-error">{{ modelImport.error }}</span>
      <button
        type="button"
        class="import-status__button"
        data-testid="model-import-error-dismiss"
        aria-label="Dismiss"
        @click="modelImport.dismissError()"
      >
        ✕
      </button>
    </p>
    <p v-else class="import-status__line" role="status" data-testid="model-import-notice">
      <span class="import-status__text">{{ modelImport.notice }}</span>
    </p>
  </div>
</template>

<style scoped>
.import-status {
  position: absolute;
  top: 8px;
  left: 50%;
  z-index: 6;
  width: max-content;
  max-width: min(440px, calc(100% - 32px));
  transform: translateX(-50%);
  pointer-events: none;
}

.import-status * {
  pointer-events: none;
}

.import-status__line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 4px 4px 4px 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
  color: var(--text-1);
  font-size: 12px;
  line-height: 1.4;
}

.import-status__line[data-testid='model-import-notice'] {
  padding: 8px 12px;
}

.import-status__line--error {
  border-color: var(--danger);
  color: var(--danger);
}

.import-status__text {
  flex: 1 1 auto;
  min-width: 0;
  overflow-wrap: anywhere;
}

.import-status__spinner {
  flex: none;
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: import-spin 0.8s linear infinite;
}

@keyframes import-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .import-status__spinner {
    animation: none;
  }
}

.import-status__button {
  flex: none;
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
}

.import-status__button:hover,
.import-status__button:focus-visible {
  border-color: var(--border-strong);
}

</style>
