<script setup>
/**
 * The two status strips that live **between the header and the main area**
 * (`TODO/ui-032`, `docs/decisions/interaction-model-qa.md` §14 and §18).
 *
 * Deliberately outside the viewport, not floating in it: the top-left corner is
 * the Operations toolbar, the top-right is the orientation gizmo, and the bottom
 * band is arbitrated by `--viewport-bottom-inset`. §14 puts the preview strip
 * here for exactly that reason, and `ui-015`'s own retirement note is the
 * cautionary tale — a control that grew into the gizmo's corner and produced a
 * real, engine-specific click-interception failure.
 *
 * Three things render here, and the stacking order is specified, not incidental:
 *
 * 1. **The preview strip** (§14) — transient, UI-only, `Back to latest`.
 * 2. **The rollback strip** (§18) — persistent document state, two lines,
 *    `Roll forward`. §18: "A preview strip, if also active, stacks above it."
 * 3. **The refusal** from the last row action, as a `role="alert"`.
 *
 * The strips **outlive closing the History panel** (§18: "so the user cannot
 * forget they are rolled back"), which is why they are mounted by `AppView` and
 * not by the panel.
 *
 * Why the refusal lives here rather than inside the failing row: it has to be
 * readable when the panel is shut (a roll-forward is refused from the strip's
 * own button), and showing the same sentence twice on a 390px screen costs a
 * line the phone layout does not have. The **row** still carries the `broken`
 * chip — §15 asks for both, and this is the division that gives each one a job.
 */
import { onBeforeUnmount, onMounted } from 'vue'

import { useTimelineCommands } from '../../composables/useTimelineCommands.js'
import { useTimelineStore } from '../../stores/timeline.js'

const timeline = useTimelineStore()
const commands = useTimelineCommands()

/**
 * §14: "a `Back to latest` button. Esc does the same."
 *
 * Guarded twice over. `defaultPrevented` keeps it from stealing an Esc a
 * popover already consumed (the cross-cutting shortcut table orders it "close
 * the open popover/dialog/menu, **else** leave preview"), and a field check
 * keeps it from firing while someone is escaping out of a numeric input.
 *
 * @param {KeyboardEvent} event
 */
function onKeydown(event) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  if (!timeline.previewing) return
  const target = /** @type {HTMLElement | null} */ (event.target)
  const tag = target?.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  timeline.endPreview()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="timeline.previewing || timeline.rolledBack || timeline.error" class="strips">
    <div
      v-if="timeline.previewing"
      class="strip strip--preview"
      data-testid="timeline-preview-strip"
      role="status"
    >
      <span class="strip__text">{{ timeline.previewText }}</span>
      <button
        type="button"
        class="strip__action"
        data-testid="timeline-back-to-latest"
        @click="timeline.endPreview()"
      >
        Back to latest
      </button>
    </div>

    <div
      v-if="timeline.rolledBack"
      class="strip strip--rollback"
      data-testid="timeline-rollback-strip"
      role="status"
    >
      <div class="strip__line">
        <span class="strip__text" data-testid="timeline-rollback-text">
          {{ timeline.rollbackText }}
        </span>
        <button
          type="button"
          class="strip__action"
          data-testid="timeline-roll-forward"
          @click="commands.rollForward()"
        >
          Roll forward
        </button>
      </div>
      <!-- §18's second, smaller line. Where new steps land is the single most
           surprising thing about being rolled back, so it is stated rather than
           left for the user to infer from a row appearing mid-list. -->
      <p class="strip__detail" data-testid="timeline-rollback-detail">
        {{ timeline.rollbackDetail }}
      </p>
    </div>

    <p
      v-if="timeline.error"
      class="strip strip--error"
      role="alert"
      data-testid="timeline-error"
    >
      {{ timeline.error.message }}
    </p>
  </div>
</template>

<style scoped>
.strips {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--border);
}

.strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 14px;
  font-size: 12px;
}

.strip--preview {
  /* Amber, matching the viewport's own preview outline — one colour for one
     idea, so "this is not the live document" is legible at a glance and not
     only by reading the sentence. */
  background: color-mix(in srgb, var(--warn) 18%, var(--surface-1));
  color: var(--text-1);
  border-bottom: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
}

.strip--rollback {
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-1));
  color: var(--text-1);
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border));
}

.strip--error {
  margin: 0;
  background: color-mix(in srgb, var(--danger) 16%, var(--surface-1));
  color: var(--text-1);
  border-bottom: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border));
}

.strip__line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.strip__text {
  font-weight: 600;
}

.strip__detail {
  margin: 0;
  font-size: 11px;
  color: var(--text-2);
}

.strip__action {
  margin-left: auto;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.strip__action:hover {
  border-color: var(--accent);
  color: var(--accent);
}

@media (max-width: 640px) {
  .strip {
    padding: 4px 10px;
  }

  /* §18's phone rule: the rollback strip is two lines (~48px) and the preview
     strip stays one. The header-plus-strip height is subtracted from the
     viewport the way the header already is, so neither overlaps a control. */
  .strip__action {
    min-height: 32px;
  }
}
</style>
