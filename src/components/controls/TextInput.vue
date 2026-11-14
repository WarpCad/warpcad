<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A single-line text field (`TODO/ui-115`): the rule seven dialogs repeated, once. `v-model` is the
 * string. `data-testid`, `placeholder`, `autocomplete` and the rest pass straight through to the
 * `<input>`.
 *
 * The text is 16px on purpose. iOS Safari zooms the whole page when a field smaller than that gets
 * focus, so shrinking it in a restyle breaks the phone layout. Keep it.
 */
defineProps({
  modelValue: { type: String, default: '' },
  type: { type: String, default: 'text' },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <input
    class="text-input"
    :type="type"
    :value="modelValue"
    @input="$emit('update:modelValue', /** @type {HTMLInputElement} */ ($event.target).value)"
  />
</template>

<style scoped>
.text-input {
  box-sizing: border-box;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px: iOS Safari zooms the page on focus of anything smaller. Do not restyle this down. */
  font-size: var(--text-size-xl);
}
</style>
