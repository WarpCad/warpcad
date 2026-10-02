<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The hosted-storage status dot on the File button (`TODO/ui-033`,
 * `docs/decisions/interaction-model-qa.md` §11 rule 4, Q12).
 *
 * Visible with the menu closed, and **each state distinct by shape, not colour alone**
 * (a red/green pair is exactly what a colour-blind user cannot tell apart):
 *
 * | `state` | Shape |
 * |---|---|
 * | `in-sync` | `●` solid green disc |
 * | `pending` | `◌` hollow ring — edits are waiting for the auto-push debounce |
 * | `pushing` | animated ring |
 * | `paused` | amber `!` — a conflict, or a retrying failure; needs the user |
 * | `failed` | red `✕` — bad token or scope |
 *
 * `none` (no connection) renders nothing at all: an empty slot would read as a status.
 * Read-only: it shows what `stores/hosted.js` already computed and owns none of it, which is
 * why it lives in `display/`. The words for each state are the button's `aria-label` and the
 * chip; this element is `aria-hidden` so a screen reader does not hear the glyph twice.
 */
defineProps({
  state: {
    type: /** @type {import('vue').PropType<'none' | 'in-sync' | 'pending' | 'pushing' | 'paused' | 'failed'>} */ (
      String
    ),
    default: 'none',
  },
})
</script>

<template>
  <span
    v-if="state !== 'none'"
    class="hosted-dot"
    :class="`hosted-dot--${state}`"
    :data-dot-state="state"
    aria-hidden="true"
    data-testid="file-menu-dot"
  >
    <template v-if="state === 'paused'">!</template>
    <template v-else-if="state === 'failed'">✕</template>
  </span>
</template>

<style scoped>
.hosted-dot {
  /* Sits on the File button's top-right corner. The ring of surface colour around it lifts
     it off the button's border so a 14px badge stays legible on a 44px control. */
  position: absolute;
  top: 3px;
  right: 3px;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--surface-1);
  font-size: 10px;
  font-weight: 800;
  line-height: 1;
  pointer-events: none;
}

.hosted-dot--in-sync {
  background: var(--accent-secondary);
}

.hosted-dot--pending {
  background: var(--surface-1);
  border: 2px solid var(--accent);
}

.hosted-dot--pushing {
  background: transparent;
  border: 2px solid var(--accent);
  border-top-color: transparent;
  animation: hosted-dot-spin 0.9s linear infinite;
}

.hosted-dot--paused {
  background: var(--warn);
  color: var(--accent-contrast);
  border-radius: 3px;
}

.hosted-dot--failed {
  background: var(--danger);
  color: var(--accent-contrast);
}

@keyframes hosted-dot-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hosted-dot--pushing {
    animation: none;
    border-style: dashed;
    border-top-color: var(--accent);
  }
}
</style>
