<script setup>
/**
 * The header bar's **Objects** toggle (`TODO/ui-041`).
 *
 * Sits in the document-bar cluster beside History and File. It is the *trigger* half of
 * the Objects list's interaction contract: the list is a selection route for bodies a
 * click cannot reach (one fully inside another), so it has to be findable without
 * already knowing it exists — a control that is reachable only by someone who has read
 * the docs has failed the same rule an unmounted one has.
 *
 * Icon-only at phone width, like its neighbours: title ~65 + Undo 44 + Redo 44 +
 * Objects 44 + History 44 + File 48 + chip 20 + gaps fits 390px with room to spare
 * (measured — see the task's retirement note), and the accessible name carries the word.
 * A cube glyph rather than History's list glyph, so the two toggles do not read as
 * the same control twice.
 */
import { useObjectsPanelStore } from '../../stores/objectsPanel.js'

const objects = useObjectsPanelStore()
</script>

<template>
  <button
    type="button"
    class="objects-toggle"
    data-testid="objects-toggle"
    :aria-pressed="objects.open"
    :title="objects.open ? 'Close Objects' : 'Open Objects — select any body from a list'"
    :aria-label="objects.open ? 'Close Objects' : 'Open Objects'"
    :data-object-count="objects.rows.length"
    @click="objects.toggle()"
  >
    <svg
      class="objects-toggle__glyph"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M8 1.5 14 4.8v6.4L8 14.5 2 11.2V4.8Z M2 4.8 8 8.1l6-3.3 M8 8.1v6.4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
    </svg>
    <span class="objects-toggle__label">Objects</span>
  </button>
</template>

<style scoped>
.objects-toggle {
  min-width: var(--tap);
  height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}

.objects-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.objects-toggle[aria-pressed='true'] {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-1));
  color: var(--accent);
}

@media (max-width: 640px) {
  .objects-toggle {
    padding: 0;
  }

  .objects-toggle__label {
    display: none;
  }
}
</style>
