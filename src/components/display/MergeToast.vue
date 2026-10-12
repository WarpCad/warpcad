<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The merge toast (`TODO/ui-062`): what a clean **Merge file…** brought in —
 * `Merged 4 steps from bracket-copy.warpcad` — with **Undo merge** (`merge-undo`) beside it.
 * Also what a merge that brought nothing, a different project's refusal, and a finished Undo
 * merge say. Conflicts get `MergeBanner.vue` instead.
 *
 * **Not a second status system.** The sentence comes from `stores/merge.js`, and
 * `stores/persistence.js` puts the same sentence on the one status surface (the header chip
 * and the File menu's first line, `useStatusSurface.js`). The chip cannot carry a button,
 * which is the only reason this strip exists: it is where Undo merge lives.
 *
 * **Placement.** Mounted by `AppView.vue` in normal flow between the header and the main area,
 * full width — so at ≤640px it sits at the top of the viewport under the header and pushes the
 * viewport down rather than painting over the Operations toolbar or the nav chrome (`ui-043`'s
 * measured gap). It stays until dismissed, because Undo merge stays available until the next
 * merge or Open, and a toast that timed out would take the only way to it with it.
 */
import { useMergeStore } from '../../stores/merge.js'

const merge = useMergeStore()
</script>

<template>
  <div class="merge-toast-slot" role="status" aria-live="polite">
    <div
      v-if="merge.notice && merge.notice.kind === 'toast'"
      class="merge-strip"
      :data-tone="merge.notice.tone"
      data-testid="merge-toast"
    >
      <p class="merge-strip__text" data-testid="merge-toast-text">{{ merge.notice.text }}</p>
      <div class="merge-strip__actions">
        <button
          v-if="merge.notice.undoable && merge.canUndo"
          type="button"
          class="merge-strip__button"
          data-testid="merge-undo"
          @click="merge.undoMerge()"
        >
          Undo merge
        </button>
        <button
          type="button"
          class="merge-strip__button merge-strip__button--quiet"
          data-testid="merge-toast-dismiss"
          aria-label="Dismiss"
          title="Dismiss"
          @click="merge.dismiss()"
        >
          ✕
        </button>
      </div>
      <p v-if="merge.undoRefusal" class="merge-strip__refusal" role="alert" data-testid="merge-undo-refusal">
        {{ merge.undoRefusal }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.merge-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 2px 8px 2px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-1));
  color: var(--text-1);
}

.merge-strip[data-tone='error'] {
  background: color-mix(in srgb, var(--danger) 14%, var(--surface-1));
}

.merge-strip__text {
  flex: 1 1 12em;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.merge-strip__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.merge-strip__button {
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.merge-strip__button:hover,
.merge-strip__button:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.merge-strip__button--quiet {
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--text-2);
}

.merge-strip__refusal {
  flex: 1 0 100%;
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--danger);
  overflow-wrap: anywhere;
}

@media (max-width: 480px) {
  .merge-strip {
    padding-left: 10px;
  }
}
</style>
