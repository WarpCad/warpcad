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
import BaseButton from '../controls/BaseButton.vue'
import BaseBanner from './BaseBanner.vue'

const merge = useMergeStore()
</script>

<template>
  <div class="merge-toast-slot" role="status" aria-live="polite">
    <BaseBanner
      v-if="merge.notice && merge.notice.kind === 'toast'"
      :tone="merge.notice.tone === 'error' ? 'danger' : 'info'"
      :data-tone="merge.notice.tone"
      data-testid="merge-toast"
      text-testid="merge-toast-text"
    >{{ merge.notice.text }}<template #actions>
        <BaseButton
          v-if="merge.notice.undoable && merge.canUndo"
          narrow
          data-testid="merge-undo"
          @click="merge.undoMerge()"
        >
          Undo merge
        </BaseButton>
        <BaseButton
          variant="quiet"
          narrow
          data-testid="merge-toast-dismiss"
          aria-label="Dismiss"
          title="Dismiss"
          @click="merge.dismiss()"
        >
          ✕
        </BaseButton>
      </template>
      <template v-if="merge.undoRefusal" #footer>
        <p class="merge-toast__refusal" role="alert" data-testid="merge-undo-refusal">{{ merge.undoRefusal }}</p>
      </template>
    </BaseBanner>
  </div>
</template>

<style scoped>
.merge-toast__refusal {
  margin: 0 0 4px;
  font-size: var(--text-size-sm);
  line-height: 1.35;
  color: var(--danger);
  overflow-wrap: anywhere;
}
</style>
