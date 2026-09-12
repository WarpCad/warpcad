<script setup>
/**
 * The Sketch toolbar — mounted only while sketch mode is active.
 *
 * A **third, mode-gated chrome surface**, per
 * `docs/decisions/interaction-model-qa.md` section 7's Q12: distinct from the
 * always-present Operations toolbar the same way the Library sheet is distinct
 * from the Inspector sheet. It is not a repurposing of either.
 *
 * ## Why the tool list is hardcoded and not read from a registry
 *
 * CLAUDE.md's creation-vs-operation rule is about exactly this instinct. A
 * sketch tool is drawing-specific chrome, not a row that belongs beside Cube and
 * Cylinder in the 3D-primitive Library — and "register a tool type and let a
 * generic list render it" is how the first attempt shipped a menu that dumped
 * every registered feature into one dropdown. When Rectangle, Circle and Arc
 * land they get added here, deliberately, as named tools.
 *
 * Line is the only tool today, so it is active by default on entry (section 7's
 * Q10) — shown `aria-pressed`, not as a choice the user has to make before
 * anything works. A single always-on toggle would normally be dead chrome, but
 * it is the thing that tells a user *what the drag gesture currently does*,
 * which is the whole reason sketch mode reclaims that gesture from orbit.
 */

const emit = defineEmits(['exit'])

defineProps({
  /** The active tool. One value for now; the prop exists so adding a second is additive. */
  tool: { type: String, default: 'line' },
})
</script>

<template>
  <div class="sketch-toolbar" data-testid="sketch-toolbar" :data-tool="tool">
    <span class="sketch-toolbar__label">Sketch</span>
    <div class="sketch-toolbar__tools" role="group" aria-label="Sketch tools">
      <button
        type="button"
        class="sketch-toolbar__tool"
        :class="{ 'sketch-toolbar__tool--on': tool === 'line' }"
        :aria-pressed="tool === 'line'"
        data-testid="sketch-tool-line"
        title="Drag on the working plane to draw a line"
      >
        Line
      </button>
    </div>
    <button
      type="button"
      class="sketch-toolbar__exit"
      data-testid="sketch-exit"
      title="Leave sketch mode and return to 3D navigation"
      @click="emit('exit')"
    >
      Exit Sketch
    </button>
  </div>
</template>

<style scoped>
/* The viewport's **top-left toolbar slot** — the one the Operations toolbar
   occupies the rest of the time, which is why `Viewport.vue` hides that one
   while this is up. There is exactly one such slot, and sketch mode claims it,
   the same arbitration `AppView.vue` already performs for the single
   phone-width bottom-sheet slot.
   
   Top-*centre* was the first attempt and the acceptance drive killed it: the
   viewport element is only 390px wide at both the tablet and phone reference
   sizes (persistent side columns at 820, a full-width column at 390), so a
   centred bar ran straight into the orientation gizmo in the top-right corner
   at both. Anchoring left clears the gizmo at every width by construction
   rather than by a breakpoint that has to be re-tuned whenever a panel
   changes width. */
.sketch-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  /* Never reach into the orientation gizmo's corner, whatever the viewport
     width — the same self-limiting rule `OperationsToolbar.vue` uses for the
     slot this replaces. */
  max-width: calc(100% - 24px - 150px);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-lg);
  background: var(--surface-glass);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-overlay);
  z-index: 12;
}

.sketch-toolbar__label {
  padding-left: 4px;
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

.sketch-toolbar__tools {
  display: flex;
  gap: 4px;
}

.sketch-toolbar__tool,
.sketch-toolbar__exit {
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.sketch-toolbar__tool--on {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.sketch-toolbar__exit:hover,
.sketch-toolbar__exit:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

/* Phone width: the same collapse pattern the nav chrome already uses
   (`NavigationChrome.vue`'s own 480px breakpoint) rather than a new idiom —
   smaller type and padding, never a shrunken tap target. The bar stays a
   single row at 390px: label + Line + Exit Sketch ≈ 230px. */
@media (max-width: 480px) {
  .sketch-toolbar {
    top: 8px;
    left: 8px;
    gap: 6px;
    padding: 4px 6px;
    max-width: calc(100% - 16px - 120px);
  }

  .sketch-toolbar__label {
    font-size: 10px;
  }

  .sketch-toolbar__tool,
  .sketch-toolbar__exit {
    min-height: var(--tap-compact);
    padding: 0 8px;
    font-size: 11px;
  }
}
</style>
