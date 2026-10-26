<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The drag handle at the top of an operation popover (`TODO/ui-087`). It only marks the target:
 * `usePopoverDrag` finds it by `data-popover-grip`, so the drag, the arrow keys and the
 * double-click reset all live in one place. Every popover that has a grip has one of these as its
 * first child, so the grip looks and reaches the same on each.
 */
</script>

<template>
  <div
    class="popover-grip"
    data-popover-grip
    data-testid="popover-grip"
    role="button"
    tabindex="0"
    aria-label="Move this panel"
    title="Drag to move · arrow keys nudge · double-click to reset"
  >
    <span aria-hidden="true">⠿</span>
  </div>
</template>

<style scoped>
/* Full width of the frame, short and centred: the glyph is the affordance. Negative margin pulls
   it up into the frame's padding so it sits on the top edge rather than adding a band. */
.popover-grip {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 22px;
  margin: -6px -6px 0;
  color: var(--text-3);
  font-size: 14px;
  line-height: 1;
  cursor: grab;
  touch-action: none;
  user-select: none;
  border-radius: 4px;
}

.popover-grip:active {
  cursor: grabbing;
}

.popover-grip:focus-visible {
  color: var(--accent);
  outline: 1px solid var(--accent);
  outline-offset: -2px;
}

/* A phone's thumb cannot reliably hit 22 px; the grip grows to the 44 px tap target the rest of
   the phone layout uses. */
@media (max-width: 640px) {
  .popover-grip {
    height: 44px;
    margin-top: -16px;
  }
}
</style>
