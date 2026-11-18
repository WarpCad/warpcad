<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A native `<select>` styled like `TextInput.vue` (`TODO/ui-115`). Native on purpose: iOS shows a
 * wheel with `<optgroup>` headings, which the Split sheet's joint list relies on. Options go in the
 * default slot; `v-model` is the selected value.
 */
defineProps({
  modelValue: { type: [String, Number], default: '' },
})

defineEmits(['update:modelValue'])
</script>

<template>
  <select
    class="select-input"
    :value="modelValue"
    @change="$emit('update:modelValue', /** @type {HTMLSelectElement} */ ($event.target).value)"
  >
    <slot />
  </select>
</template>

<style scoped>
.select-input {
  box-sizing: border-box;
  min-height: var(--tap);
  padding: 0 var(--space-4h);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px: iOS Safari zooms the page on focus of anything smaller. Do not restyle this down. */
  font-size: var(--text-size-xl);
}
</style>
