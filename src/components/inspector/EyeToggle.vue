<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The eye on an Objects-list row (`TODO/ui-089`): **Hide** / **Show** a body or one of its
 * parts in the 3D view. One button on every body row and every part row, in the scene list
 * and in the Inspector's Parts list, so the three places cannot draw it three ways.
 *
 * Three pictures: an open eye (shown), an eye with a slash (hidden), and an eye whose pupil is
 * half filled (a body shown with **some parts hidden**). The label is the action a tap takes —
 * `Hide Cube 1 A` / `Show Cube 1 A` — so a screen reader and a test read the same thing; the
 * mixed state's tap shows every part, so it is labelled Show too.
 *
 * Never a text chip: the word *hidden* on a part row belongs to a recipe's helper part
 * (`ui-047`), and the eye is how a user hide is told apart from it. A 44 × 44 px tap target
 * at every width; the row's name truncates before this ever wraps.
 *
 * @module components/inspector/EyeToggle
 */
import { computed } from 'vue'

const props = defineProps({
  /** `shown`, `hidden`, or `mixed` (a body row only: shown, with some part hidden). */
  state: { type: String, default: 'shown' },
  /** What the row names, for the label: `Cube 1`, `Cube 1 A`. */
  name: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle'])

const label = computed(() => `${props.state === 'shown' ? 'Hide' : 'Show'} ${props.name}`)

const title = computed(() => {
  if (props.state === 'mixed') return `Some parts of ${props.name} are hidden — show them all`
  return props.state === 'hidden' ? `Show ${props.name} in the view` : `Hide ${props.name} in the view`
})
</script>

<template>
  <button
    type="button"
    class="eye"
    :class="`eye--${state}`"
    :aria-label="label"
    :title="title"
    :data-eye="state"
    :disabled="disabled"
    @click.stop="emit('toggle')"
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path class="eye__lid" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle v-if="state === 'shown'" class="eye__pupil" cx="12" cy="12" r="3" />
      <template v-else-if="state === 'mixed'">
        <circle class="eye__ring" cx="12" cy="12" r="3" />
        <path class="eye__pupil" d="M12 9a3 3 0 0 0 0 6z" />
      </template>
      <template v-else>
        <circle class="eye__ring" cx="12" cy="12" r="3" />
        <path class="eye__slash" d="M4 4l16 16" />
      </template>
    </svg>
  </button>
</template>

<style scoped>
.eye {
  flex: 0 0 var(--tap);
  width: var(--tap);
  min-height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  touch-action: manipulation;
}

.eye--hidden {
  color: var(--text-3);
}

.eye svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.eye__pupil {
  fill: currentColor;
  stroke: none;
}

.eye__slash {
  stroke-width: 2;
}

.eye:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

@media (hover: hover) {
  .eye:hover:not(:disabled) {
    color: var(--text-1);
  }
}

.eye:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
