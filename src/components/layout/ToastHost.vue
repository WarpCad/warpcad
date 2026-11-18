<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one toast host (`TODO/ui-117`), mounted once by `AppView.vue`: draws `stores/toasts.js`'s
 * queue as a stack of `BaseToast` pills under the header, at the `--z-toast` tier, so two toasts
 * fired together sit one above the other instead of at the same spot.
 *
 * - **Precondition**: something called `toasts.show` (copy a share link, save to the library, a gist
 *   save). **Trigger**: none; it is feedback. **Feedback**: the pill, then it leaves on its own.
 * - Each pill keeps the `data-testid` its source gave it (`share-toast`, `library-toast`, ...).
 * - The pill's action (a button) and link (a read-only field) come from the toast itself.
 */
import BaseButton from '../controls/BaseButton.vue'
import BaseToast from '../display/BaseToast.vue'
import { useToastsStore } from '../../stores/toasts.js'

const toasts = useToastsStore()
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" data-testid="toast-host">
      <BaseToast v-for="toast in toasts.items" :key="toast.id" :tone="toast.tone" :data-testid="toast.testid" data-toast
        >{{ toast.text }}<template v-if="toast.action || toast.link" #action>
          <BaseButton v-if="toast.action" :data-testid="toast.action.testid" @click="toast.action.run()">{{ toast.action.label }}</BaseButton>
          <input
            v-else-if="toast.link"
            class="toast-host__link"
            type="text"
            readonly
            :aria-label="toast.link.label"
            :value="toast.link.value"
            :data-testid="toast.link.testid"
          />
        </template>
      </BaseToast>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 60px;
  left: 50%;
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  transform: translateX(-50%);
  /* The host never takes a tap; a toast with an action opts back in. */
  pointer-events: none;
}

.toast-host__link {
  min-width: 0;
  max-width: 100%;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: var(--text-size-sm);
}
</style>
