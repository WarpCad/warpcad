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
import BaseButton from '../controls/BaseButton.vue'
import BaseBanner from './BaseBanner.vue'

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
    <BaseBanner v-if="repeat.notice" data-testid="repeat-toast" text-testid="repeat-toast-text">{{ repeat.notice.text }}<template #actions>
        <BaseButton
          v-if="repeat.canUndoNotice"
          narrow
          data-testid="repeat-toast-undo"
          @click="repeat.undoNotice()"
        >
          Undo
        </BaseButton>
        <BaseButton
          variant="quiet"
          narrow
          data-testid="repeat-toast-dismiss"
          aria-label="Dismiss"
          title="Dismiss"
          @click="repeat.dismissNotice()"
        >
          ✕
        </BaseButton>
      </template>
    </BaseBanner>
  </div>
</template>
