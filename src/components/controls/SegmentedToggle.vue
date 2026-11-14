<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A single-choice row of buttons (`TODO/ui-115`): options in, value out. It is a
 * `role="radiogroup"` with a roving tabindex, so Tab enters the group once, on the chosen option,
 * and Arrow keys move the choice and the focus together. Each option is a `role="radio"` button
 * with `aria-checked`, `data-value` and a `data-testid` of `<testid>-<value>` when `testid` is set.
 * Buttons are `--tap` high.
 *
 * @typedef {{ value: string, label: string, title?: string, disabled?: boolean }} SegmentedOption
 */
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: /** @type {import('vue').PropType<SegmentedOption[]>} */ (Array), required: true },
  /** The accessible name of the group. */
  label: { type: String, default: undefined },
  /** Prefix for each option's `data-testid`. */
  testid: { type: String, default: undefined },
})

const emit = defineEmits(['update:modelValue'])

const buttons = ref(/** @type {HTMLButtonElement[]} */ ([]))

/** The option that takes the Tab stop: the chosen one, else the first enabled. */
function tabStop() {
  const chosen = props.options.find((o) => o.value === props.modelValue && !o.disabled)
  return (chosen ?? props.options.find((o) => !o.disabled))?.value
}

/** @param {KeyboardEvent} event @param {number} index */
function onKeydown(event, index) {
  const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
  const back = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
  if (!forward && !back) return
  event.preventDefault()
  const n = props.options.length
  for (let step = 1; step <= n; step++) {
    const next = (index + (forward ? step : -step) + n * step) % n
    const option = props.options[next]
    if (option && !option.disabled) {
      emit('update:modelValue', option.value)
      buttons.value[next]?.focus()
      return
    }
  }
}
</script>

<template>
  <div class="segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      ref="buttons"
      type="button"
      role="radio"
      class="segmented__option"
      :aria-checked="option.value === modelValue ? 'true' : 'false'"
      :tabindex="option.value === tabStop() ? 0 : -1"
      :disabled="option.disabled"
      :title="option.title"
      :data-value="option.value"
      :data-testid="testid ? `${testid}-${option.value}` : undefined"
      @click="emit('update:modelValue', option.value)"
      @keydown="onKeydown($event, index)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: flex;
  gap: 6px;
}

.segmented__option {
  flex: 1 1 auto;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: var(--text-size-md);
  cursor: pointer;
  touch-action: manipulation;
}

.segmented__option[aria-checked='true'] {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.segmented__option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
