<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Connect to Claude Code…** (`TODO/ai-012`): the way into the live bridge's pairing sheet, in
 * the Assistant panel (beside **Key and model…**) and in the no-key sheet (beside **Use my Claude
 * subscription…**).
 *
 * On a phone or tablet it is **disabled with the reason shown beside it** — "Claude Code must run
 * on this device" — rather than hidden: a browser there cannot reach Claude Code on another
 * machine, and a tooltip is no use on a touch screen. The Assistant panel passes
 * `onlyWhereUsable`: its phone and tablet sheet is a half-height bottom sheet where two more lines
 * push **Send** out of view, so there the disabled control and its reason live on the no-key sheet
 * only — the way into the Assistant when there is no key, which is when Claude Code is the route.
 */
import { deviceReason } from '../../composables/useLiveBridge.js'
import { useAssistantStore } from '../../stores/assistant.js'

defineProps({
  /** The button's `data-testid`; the reason line is `${testid}-reason`. */
  testid: { type: String, required: true },
  /** Render nothing on a phone or tablet instead of the disabled control (the chat panel). */
  onlyWhereUsable: { type: Boolean, default: false },
})

const assistant = useAssistantStore()
</script>

<template>
  <span v-if="!(onlyWhereUsable && deviceReason)" class="connect-entry">
    <button
      type="button"
      class="connect-entry__button"
      :data-testid="testid"
      :disabled="deviceReason !== ''"
      :aria-describedby="deviceReason ? `${testid}-reason` : undefined"
      @click="assistant.openConnect()"
    >
      Connect to Claude Code…
    </button>
    <span v-if="deviceReason" :id="`${testid}-reason`" class="connect-entry__reason" :data-testid="`${testid}-reason`">{{ deviceReason }}</span>
  </span>
</template>

<style scoped>
.connect-entry {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.connect-entry__button {
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.connect-entry__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.connect-entry__reason {
  font-size: 12px;
  color: var(--text-2);
}
</style>
