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
import BaseButton from '../controls/BaseButton.vue'
import BaseBanner from './BaseBanner.vue'

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
    <BaseBanner v-if="persistence.nativeRestoreNotice" data-testid="native-restore-toast">
      Restored your last session from the app's backup copy.
      <template #actions>
        <BaseButton
          variant="quiet"
          narrow
          data-testid="native-restore-toast-dismiss"
          aria-label="Dismiss"
          title="Dismiss"
          @click="persistence.dismissNativeRestoreNotice()"
        >
          ✕
        </BaseButton>
      </template>
    </BaseBanner>
  </div>
</template>
