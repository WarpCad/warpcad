<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one-time toast after a launch that restored from the app's backup copy (`TODO/io-015`):
 * *"Restored your last session from the app's backup copy."*
 *
 * - **Precondition**: the iOS app launched with IndexedDB empty or unreadable while
 *   *Application Support/autosave.ndjson* held a project (`storage/autosave.js`, the restore rule).
 * - **Trigger**: none; it is automatic at launch. **Dismiss** closes it early.
 * - **Feedback**: the restored project is already open with its History; the toast says why.
 * - **Placement**: in flow under the header, the same slot and shape as the merge and Repeat toasts,
 *   so at phone width it pushes the viewport down instead of covering the toolbars or the bottom sheet.
 *
 * It clears itself after a while; nothing about it is document state.
 */
import { onBeforeUnmount, watch } from 'vue'

import { usePersistenceStore } from '../../stores/persistence.js'

/** How long the toast stays, ms. */
const LINGER_MS = 12_000

const persistence = usePersistenceStore()

/** @type {ReturnType<typeof setTimeout> | null} */
let timer = null

watch(
  () => persistence.nativeRestoreNotice,
  (showing) => {
    if (timer !== null) clearTimeout(timer)
    timer = showing ? setTimeout(() => persistence.dismissNativeRestoreNotice(), LINGER_MS) : null
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (timer !== null) clearTimeout(timer)
})
</script>

<template>
  <div class="native-restore-slot" role="status" aria-live="polite">
    <div v-if="persistence.nativeRestoreNotice" class="native-restore-toast" data-testid="native-restore-toast">
      <p class="native-restore-toast__text">Restored your last session from the app's backup copy.</p>
      <button
        type="button"
        class="native-restore-toast__dismiss"
        data-testid="native-restore-toast-dismiss"
        aria-label="Dismiss"
        title="Dismiss"
        @click="persistence.dismissNativeRestoreNotice()"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<style scoped>
.native-restore-toast {
  display: flex;
  align-items: center;
  gap: 4px 10px;
  padding: 2px 8px 2px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-1));
  color: var(--text-1);
}

.native-restore-toast__text {
  flex: 1 1 12em;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.native-restore-toast__dismiss {
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.native-restore-toast__dismiss:hover,
.native-restore-toast__dismiss:focus-visible {
  border-color: var(--accent);
  color: var(--accent);
  outline: none;
}

@media (max-width: 480px) {
  .native-restore-toast {
    padding-left: 10px;
  }
}
</style>
