<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The link-icon button at the right edge of a bindable field (`TODO/ui-059`). Rendered only
 * for a slot `bindableParams` offered — a field core calls unbindable gets no button, and
 * its row's tooltip says why instead. The popover it toggles is `ParamBindPopover.vue`.
 */
import { computed } from 'vue'

import { useVariablesUiStore } from '../../stores/variablesUi.js'

const props = defineProps({
  /** The test-id suffix: `model`, `size-x`. */
  id: { type: String, required: true },
  label: { type: String, required: true },
  /** `<recordId>:<path>` — which field's popover is open. */
  popoverKey: { type: String, required: true },
})

const ui = useVariablesUiStore()
const open = computed(() => ui.popoverKey === props.popoverKey)
</script>

<template>
  <button
    type="button"
    class="bindbtn"
    :aria-expanded="open"
    :aria-label="`Bind ${label} to a variable`"
    :title="`Bind ${label} to a variable`"
    :data-testid="`param-bind-${id}`"
    @click="ui.togglePopover(popoverKey)"
  >
    <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
      <path d="M6.5 9.5l3-3M5 8L3.5 9.5a2.1 2.1 0 003 3L8 11M11 8l1.5-1.5a2.1 2.1 0 00-3-3L8 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>
  </button>
</template>

<style scoped>
.bindbtn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
  touch-action: manipulation;
}

.bindbtn[aria-expanded='true'] {
  border-color: var(--accent);
  color: var(--text-1);
}

.bindbtn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
