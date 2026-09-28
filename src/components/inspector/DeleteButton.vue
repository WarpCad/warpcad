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
 * safety net, as it is for every other step.
 */
import { useDeleteCommands } from '../../composables/useDeleteCommands.js'

const commands = useDeleteCommands()
const { enabled, reason, label, describe, error, target } = commands
</script>

<template>
  <div class="delete" data-testid="inspector-delete-row">
    <button
      type="button"
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
    </button>
    <p v-if="!enabled" class="delete__reason" data-testid="inspector-delete-reason">{{ reason }}</p>
    <p v-if="error" class="delete__reason" data-testid="inspector-delete-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
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
  z-index: 1;
  margin: 16px 0 -14px;
  padding: 8px 0 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-1);
}

.delete__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 16px;
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--danger);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
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
  font-size: 0.85em;
}
</style>
