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
import BaseButton from '../controls/BaseButton.vue'
import BaseBanner from './BaseBanner.vue'

const merge = useMergeStore()
</script>

<template>
  <div class="merge-banner-slot" role="status" aria-live="polite">
    <BaseBanner
      v-if="merge.notice && merge.notice.kind === 'banner'"
      tone="warn"
      :data-tone="merge.notice.tone"
      data-testid="merge-banner"
      text-testid="merge-banner-text"
    >{{ merge.notice.text }}<template #actions>
        <BaseButton narrow data-testid="merge-banner-show" @click="merge.showConflicts()">
          Show
        </BaseButton>
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
          data-testid="merge-banner-dismiss"
          aria-label="Dismiss"
          title="Dismiss"
          @click="merge.dismiss()"
        >
          ✕
        </BaseButton>
      </template>
      <template v-if="merge.undoRefusal" #footer>
        <p class="merge-banner__refusal" role="alert" data-testid="merge-undo-refusal">{{ merge.undoRefusal }}</p>
      </template>
    </BaseBanner>
  </div>
</template>

<style scoped>
.merge-banner__refusal {
  margin: 0 0 4px;
  font-size: var(--text-size-sm);
  line-height: 1.35;
  color: var(--danger);
  overflow-wrap: anywhere;
}
</style>
