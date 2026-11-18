<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector's **Delete** / **Remove part** button (`TODO/ui-051`).
 *
 * The only route to delete on a phone or tablet, which has no Delete key, so it is a
 * real 44 px tap target and never hover-only. It sits at the **bottom** of the
 * single-body section and of the multi-selection summary, so a stray tap near the top
 * fields cannot hit it, and it is styled destructive from the `--danger` token.
 *
 * It is deliberately not in the Operations toolbar: that is the surface for operations
 * that *combine* bodies (CLAUDE.md, creation vs. operation), and delete is not one.
 *
 * All the deciding — enabled or not, why not, body or part — is `useDeleteCommands`,
 * the same command the Delete/Backspace keys call. No confirm dialog: Undo is the
 * safety net, as it is for every other step. A body a formula measures says so under the button
 * before the tap (`TODO/FIND-core-078`), naming the formulas and what they feed.
 */
import { useDeleteCommands } from '../../composables/useDeleteCommands.js'
import { useRepeatStore } from '../../stores/repeat.js'
import BaseButton from '../controls/BaseButton.vue'

const commands = useDeleteCommands()
const { enabled, reason, label, describe, error, target, formulaNote } = commands

/**
 * `TODO/ui-069`: deleting a body that repeats follow asks first — the one question this button
 * ever asks, because the answer is not something Undo alone can express (the repeats can go
 * too, or stay broken in History). Asked by the Delete key as well; answered here.
 */
const repeat = useRepeatStore()
</script>

<template>
  <div class="delete" data-testid="inspector-delete-row">
    <BaseButton
      variant="danger"
      class="delete__btn"
      :data-testid="target?.kind === 'part' ? 'inspector-remove-part' : 'inspector-delete'"
      :disabled="!enabled"
      :title="enabled ? describe : reason"
      :aria-label="enabled ? describe : `${label} — ${reason}`"
      @click="commands.run()"
    >
      <svg class="delete__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h2v-8h-2zm4 0v8h2v-8h-2z"
          fill="currentColor"
        />
      </svg>
      <span>{{ label }}</span>
    </BaseButton>
    <p v-if="!enabled" class="delete__reason" data-testid="inspector-delete-reason">{{ reason }}</p>
    <p v-if="enabled && formulaNote" class="delete__reason" data-testid="inspector-delete-formulas">{{ formulaNote }}</p>
    <p v-if="error" class="delete__reason" data-testid="inspector-delete-error" role="alert">{{ error }}</p>
    <div v-if="repeat.deleteConfirm" class="delete__confirm" role="alertdialog" data-testid="delete-repeats-confirm" :aria-label="repeat.deleteConfirm.question">
      <p class="delete__question" data-testid="delete-repeats-question">{{ repeat.deleteConfirm.question }}</p>
      <div class="delete__choices">
        <BaseButton variant="danger" data-testid="delete-repeats-too" @click="commands.resolveDelete('with-repeats')">
          Delete the repeats
        </BaseButton>
        <BaseButton data-testid="delete-repeats-leave-broken" @click="commands.resolveDelete('leave-broken')">
          Leave broken
        </BaseButton>
        <BaseButton data-testid="delete-repeats-cancel" @click="commands.resolveDelete(null)">
          Cancel
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.delete__confirm {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: 8px;
}

.delete__question {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.4;
  color: var(--text-1);
}

.delete__choices {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}


/*
 * Pinned to the bottom of the Inspector's scroll area (Step 2 of TODO/ui-051, measured):
 * the phone sheet shows 321px of a 958px Cube description and a 2,686px Pi one, so a
 * plain last-in-the-section button sat 580-2,300px below the fold. Sticky keeps it at
 * the bottom — away from the top fields — and visible without scrolling at every
 * width. `-14px` absorbs the sheet's own bottom padding so nothing shows under it.
 */
.delete {
  position: sticky;
  bottom: -14px;
  z-index: calc(var(--z-canvas-overlay) + 1);
  margin: 16px 0 -14px;
  padding: var(--space-4) 0 var(--space-5h);
  border-top: 1px solid var(--border);
  background: var(--surface-1);
}

.delete__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: 0 var(--space-6);
  font-weight: var(--weight-medium);
}

.delete__btn:hover:not(:disabled),
.delete__btn:focus-visible {
  background: var(--danger);
  color: var(--surface-0);
}

.delete__btn:disabled {
  border-color: var(--border);
  color: var(--text-3);
  cursor: not-allowed;
}

.delete__icon {
  width: 18px;
  height: 18px;
}

.delete__reason {
  margin: 6px 0 0;
  color: var(--text-2);
  font-size: var(--text-size-sm);
}
</style>
