<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The header's save-status chip (`TODO/io-001`, extended by `TODO/ui-033`) — the app's one
 * status surface for autosave, the result of an explicit save/open, and hosted state
 * (`docs/decisions/interaction-model-qa.md`, cross-cutting "The one status surface"; §8).
 *
 * Read-only apart from one thing: **a persistent error makes it a button that opens the File
 * menu** (§8: "clicking it opens the File menu, whose Save/Download item is then the user's
 * escape hatch"). Until `ui-033` there was no menu to open, and a chip that pretended to be a
 * button with nothing behind it would have been a dead control; now there is, so the chip is a
 * real `<button>` exactly while it has something to offer — and a plain status element the
 * rest of the time. Which store's message it shows is `useStatusSurface`'s decision.
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
 * **While the opened file has changed on disk** (`TODO/ai-009`) it is a button too: tapping
 * `File changed on disk — Reload` asks the disk-change question again after a Cancel.
 *
 * **Errors are `role="alert"`, everything else `role="status"`** — a persistent
 * "Not saved" must interrupt, "Saved · 14:02" must not.
 */
import { computed } from 'vue'

import { useStatusSurface } from '../../composables/useStatusSurface.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { usePersistenceStore } from '../../stores/persistence.js'

const surface = useStatusSurface()
const menu = useFileMenuStore()
const persistence = usePersistenceStore()

const isError = computed(() => surface.tone.value === 'error')
/** The disk-change state is what the chip shows (not outranked by an error). */
const isDiskChange = computed(() => !isError.value && persistence.diskNeedsAnswer)
const isButton = computed(() => isError.value || isDiskChange.value)

function onClick() {
  if (isError.value) menu.openMenu()
  else if (isDiskChange.value) persistence.showDiskPrompt()
}

const title = computed(() => {
  if (isError.value) return `${surface.text.value} — open the File menu`
  if (isDiskChange.value) return `${persistence.diskChangeName} changed on disk and can't be merged — reload it, or keep this version`
  return surface.text.value
})
</script>

<template>
  <component
    :is="isButton ? 'button' : 'div'"
    class="save-status"
    :class="[`save-status--${surface.tone.value}`, { 'save-status--button': isButton }]"
    :type="isButton ? 'button' : undefined"
    :role="isError ? 'alert' : isButton ? undefined : 'status'"
    :aria-live="isError ? 'assertive' : 'polite'"
    :aria-label="surface.text.value"
    :title="title"
    :data-tone="surface.tone.value"
    data-testid="save-status"
    @click="onClick()"
  >
    <span class="save-status__dot" aria-hidden="true" data-testid="save-status-dot" />
    <span class="save-status__text" data-testid="save-status-text">{{ surface.text.value }}</span>
  </component>
</template>

<style scoped>
.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  /* Capped, so a long refusal message truncates inside the header instead of
     pushing Undo/Redo off the right edge. The full text is in `title` and
     `aria-label`. */
  max-width: 280px;
  /* A fixed floor, so "Saved · 14:02" arriving ~500 ms after an edit does not slide the File
     button (and everything left of the chip) sideways under a pointer already aimed at it
     (`TODO/testing-001`). Every routine message fits; only a long error grows past it. */
  min-width: 132px;
  padding: 0 4px;
  font-size: 12px;
  color: var(--text-3);
}

.save-status--button {
  /* A real button only while it has an error to act on: reset the UA chrome so it reads as
     the same chip, and give it a full tap target. */
  min-height: var(--tap);
  border: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  touch-action: manipulation;
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

/* Paused / needs you (a diverged repository): amber text, solid amber dot. */
.save-status--warn {
  color: var(--warn);
}

.save-status--warn .save-status__dot {
  background: var(--warn);
  border-radius: 3px;
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
    min-width: 0;
    justify-content: center;
    padding: 0;
  }

  .save-status--button {
    /* A 28px-wide, full-height target that still takes only 20px of the header's row: the
       negative margins give the extra 8px back, so the error state does not shift Undo,
       Redo, History and File sideways at the one width where every pixel is budgeted. */
    width: 28px;
    margin: 0 -4px;
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
