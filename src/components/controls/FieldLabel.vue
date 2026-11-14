<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A field's label: the words above the control, with the control in the default slot, the way
 * ten dialogs and sheets had each hand-written it (`TODO/ui-115`). `small` is the 11px, 3px-gap
 * variant the Align, Merge and Operations popovers use.
 */
defineProps({
  /** The compact variant for a popover. */
  small: { type: Boolean, default: false },
})
</script>

<template>
  <label class="field-label" :class="{ 'field-label--small': small }">
    <slot />
  </label>
</template>

<style scoped>
.field-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.field-label--small {
  gap: 3px;
  font-size: var(--text-size-xs);
}
</style>
