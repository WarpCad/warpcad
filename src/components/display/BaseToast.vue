<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one floating toast pill (`TODO/ui-117`). Presentational only: the queue is
 * `stores/toasts.js` and the stack is `layout/ToastHost.vue`.
 *
 * - **`tone`**: `neutral` (default) or `danger`. A danger toast is `role="alert"`, the rest
 *   `role="status"`.
 * - **Default slot** the text. **`action` slot** a button or a read-only link field; a toast that
 *   has one takes taps (`data-interactive`), the rest never take a tap from what is under them.
 * - `data-testid` and every other attribute fall through to the pill.
 */
import { computed, useSlots } from 'vue'

const props = defineProps({
  /** `neutral | danger` */
  tone: { type: String, default: 'neutral', validator: (/** @type {string} */ v) => ['neutral', 'danger'].includes(v) },
})

const slots = useSlots()
const role = computed(() => (props.tone === 'danger' ? 'alert' : 'status'))
const interactive = computed(() => (slots.action ? 'true' : undefined))
</script>

<template>
  <div class="base-toast" :role="role" :data-tone="tone" :data-interactive="interactive">
    <span class="base-toast__text"><slot /></span>
    <span v-if="$slots.action" class="base-toast__action"><slot name="action" /></span>
  </div>
</template>

<style scoped>
.base-toast {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 12px;
  width: max-content;
  max-width: calc(100vw - 32px);
  padding: 8px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-pill);
  background: var(--surface-1);
  color: var(--text-1);
  font-family: var(--font);
  font-size: var(--text-size-md);
  box-shadow: var(--shadow-overlay);
  overflow-wrap: anywhere;
  /* A toast never takes a tap from what is under it, unless it carries a control. */
  pointer-events: none;
}

.base-toast[data-tone='danger'] {
  border-color: var(--danger);
}

.base-toast[data-interactive='true'] {
  padding: 6px 6px 6px 14px;
  border-radius: var(--radius-lg);
  pointer-events: auto;
}

.base-toast__action {
  display: inline-flex;
  align-items: center;
}
</style>
