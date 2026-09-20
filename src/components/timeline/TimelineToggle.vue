<script setup>
/**
 * The header bar's **History** toggle (`TODO/ui-032`).
 *
 * The third slot in the cross-cutting "document bar" cluster
 * (`docs/decisions/interaction-model-qa.md`), sized to land beside Undo/Redo
 * and the save-status chip without moving either — `HistoryControls.vue`'s own
 * module note reserved the space for exactly this.
 *
 * §13: **default closed on every device, every load**, and not persisted. The
 * viewport stays clear until the user asks for the panel.
 */
import { useTimelineStore } from '../../stores/timeline.js'

const timeline = useTimelineStore()
</script>

<template>
  <button
    type="button"
    class="timeline-toggle"
    data-testid="timeline-toggle"
    :aria-pressed="timeline.open"
    :title="timeline.open ? 'Close History' : 'Open History'"
    :aria-label="timeline.open ? 'Close History' : 'Open History'"
    :data-step-count="timeline.stepCount"
    @click="timeline.toggle()"
  >
    <span class="timeline-toggle__glyph" aria-hidden="true">☰</span>
    <!-- Icon + label at ≥641px, icon-only below, per the phone header budget:
         title ~60px + Undo 44 + Redo 44 + History 44 + File 44 + chip ≈ 320px
         at 390px wide. The word does not fit and the accessible name above
         carries it instead. -->
    <span class="timeline-toggle__label">History</span>
  </button>
</template>

<style scoped>
.timeline-toggle {
  /* 44px minimum at every width — the one device with no keyboard shortcut is
     also the one where this is the only way in (CLAUDE.md Responsive Layout). */
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

.timeline-toggle__glyph {
  font-size: 15px;
}

.timeline-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.timeline-toggle[aria-pressed='true'] {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 16%, var(--surface-1));
  color: var(--accent);
}

@media (max-width: 640px) {
  .timeline-toggle {
    min-width: var(--tap);
    padding: 0;
  }

  .timeline-toggle__label {
    display: none;
  }
}
</style>
