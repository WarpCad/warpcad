<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The merge banner (`TODO/ui-062`): a merge that left rows conflicted —
 * `Merged 4 steps from bracket-copy.warpcad — 2 steps conflicted` — with **Show**
 * (`merge-banner-show`: opens History, on a phone its bottom sheet, and selects the first
 * conflicted row, whose broken chip and reason say what it lost to) and **Undo merge**. It stays
 * until dismissed: a conflict is a job for the user, not a passing notice. There is no review
 * dialog (`docs-022`): each conflicted row is fixed with its own History actions — Edit,
 * Suppress — or by deleting the body, and fixing it clears its chip because it then builds.
 *
 * Same placement and the same one-status-surface rule as `MergeToast.vue`.
 */
import { useMergeStore } from '../../stores/merge.js'

const merge = useMergeStore()
</script>

<template>
  <div class="merge-banner-slot" role="status" aria-live="polite">
    <div
      v-if="merge.notice && merge.notice.kind === 'banner'"
      class="merge-strip"
      :data-tone="merge.notice.tone"
      data-testid="merge-banner"
    >
      <p class="merge-strip__text" data-testid="merge-banner-text">{{ merge.notice.text }}</p>
      <div class="merge-strip__actions">
        <button type="button" class="merge-strip__button" data-testid="merge-banner-show" @click="merge.showConflicts()">
          Show
        </button>
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
          data-testid="merge-banner-dismiss"
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
  border-left: 4px solid var(--warn);
  background: color-mix(in srgb, var(--warn) 16%, var(--surface-1));
  color: var(--text-1);
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
