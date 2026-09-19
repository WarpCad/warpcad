<script setup>
/**
 * The header's save-status chip (`TODO/io-001`) — the app's one status surface
 * for autosave, and later for the result of an explicit save/open
 * (`docs/decisions/interaction-model-qa.md`, cross-cutting "The one status
 * surface"; section 8).
 *
 * Read-only: it shows `usePersistenceStore`'s state and owns none of it, which
 * is why it lives in `display/` (badges, counters, status indicators) rather than
 * `storage/`. Clicking it does nothing yet — the Q&A has an error state open the
 * File ▾ menu, but that menu is `ui-033`'s; a chip that pretended to be a button
 * with nothing behind it would be a dead control.
 *
 * **Two layouts, one element.** At ≥641px it is a dot plus text. At phone width
 * the text collapses out of sight and only the 10px dot stays (green saved /
 * amber saving / red failed), because the header's 390px budget is already spent
 * on the 44px Undo and Redo targets. The text is *visually* hidden, not removed:
 * it stays in the accessibility tree and in `aria-label`, so a screen reader
 * hears the same words a laptop user reads. Colour alone would not tell the three
 * dots apart for a colour-blind user, so the shapes differ too (ring / solid /
 * square — see the styles).
 *
 * **Errors are `role="alert"`, everything else `role="status"`** — a persistent
 * "Not saved" must interrupt, "Saved · 14:02" must not.
 */
import { computed } from 'vue'

import { usePersistenceStore } from '../../stores/persistence.js'

const persistence = usePersistenceStore()

const isError = computed(() => persistence.chipTone === 'error')
</script>

<template>
  <div
    class="save-status"
    :class="`save-status--${persistence.chipTone}`"
    :role="isError ? 'alert' : 'status'"
    :aria-live="isError ? 'assertive' : 'polite'"
    :aria-label="persistence.chipText"
    :title="persistence.chipText"
    :data-tone="persistence.chipTone"
    data-testid="save-status"
  >
    <span class="save-status__dot" aria-hidden="true" data-testid="save-status-dot" />
    <span class="save-status__text" data-testid="save-status-text">{{ persistence.chipText }}</span>
  </div>
</template>

<style scoped>
.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Shrinkable, so a long refusal message truncates inside the header instead of
     pushing Undo/Redo off the right edge. The full text is in `title` and
     `aria-label`. */
  min-width: 0;
  max-width: 280px;
  padding: 0 4px;
  font-size: 12px;
  color: var(--text-3);
}

.save-status__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save-status__dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-3);
}

/* Saved: solid green disc. */
.save-status--saved .save-status__dot {
  background: var(--accent-secondary);
}

/* Saving: amber ring — hollow, so it differs from "saved" by shape as well as hue. */
.save-status--saving .save-status__dot {
  background: transparent;
  border: 2px solid var(--warn);
}

/* Failed: red square, and the text itself turns red. */
.save-status--error {
  color: var(--danger);
}

.save-status--error .save-status__dot {
  background: var(--danger);
  border-radius: 2px;
}

@media (max-width: 640px) {
  .save-status {
    /* The dot alone, in a 20px slot: the text is visually hidden below, not removed. */
    width: 20px;
    justify-content: center;
    padding: 0;
  }

  .save-status__text {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
}
</style>
