<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The toast after a Repeat's Apply (`TODO/ui-069`): *"Repeated Bolt 1 on 3 more holes"*, with
 * **Undo** while the Repeat is still the step Undo would take back. In flow under the header,
 * the same slot and shape as the merge toast (`MergeToast.vue`), so at phone width it pushes
 * the viewport down rather than covering the Operations toolbar or the navigation chrome.
 *
 * It clears itself after a while; nothing about it is document state.
 */
import { onBeforeUnmount, watch } from 'vue'

import { useRepeatStore } from '../../stores/repeat.js'

/** How long the toast stays, ms. */
const LINGER_MS = 10_000

const repeat = useRepeatStore()

/** @type {ReturnType<typeof setTimeout> | null} */
let timer = null

watch(
  () => repeat.notice,
  (notice) => {
    if (timer !== null) clearTimeout(timer)
    timer = notice === null ? null : setTimeout(() => repeat.dismissNotice(), LINGER_MS)
  },
)

onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer)
})
</script>

<template>
  <div class="repeat-toast-slot" role="status" aria-live="polite">
    <div v-if="repeat.notice" class="repeat-toast" data-testid="repeat-toast">
      <p class="repeat-toast__text" data-testid="repeat-toast-text">{{ repeat.notice.text }}</p>
      <div class="repeat-toast__actions">
        <button
          v-if="repeat.canUndoNotice"
          type="button"
          class="repeat-toast__button"
          data-testid="repeat-toast-undo"
          @click="repeat.undoNotice()"
        >
          Undo
        </button>
        <button
          type="button"
          class="repeat-toast__button repeat-toast__button--quiet"
          data-testid="repeat-toast-dismiss"
          aria-label="Dismiss"
          title="Dismiss"
          @click="repeat.dismissNotice()"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.repeat-toast {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 2px 8px 2px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-1));
  color: var(--text-1);
}

.repeat-toast__text {
  flex: 1 1 12em;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.repeat-toast__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.repeat-toast__button {
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.repeat-toast__button:hover,
.repeat-toast__button:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

.repeat-toast__button--quiet {
  padding: 0;
  border-color: transparent;
  background: transparent;
  color: var(--text-2);
}

@media (max-width: 480px) {
  .repeat-toast {
    padding-left: 10px;
  }
}
</style>
