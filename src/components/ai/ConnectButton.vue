<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Live MCP access…** (`TODO/ai-023`): the way into the live access sheet, in
 * the Assistant panel (beside **Key and model…**) and in the no-key sheet (beside **Use my Claude
 * subscription…**).
 *
 * Access stays off until the user chooses a lease here. At phone and tablet widths the Assistant
 * panel passes `onlyWhereUsable`, which hides this entry there (a 44 px row more would push **Send**
 * out of the half-height sheet); the status chip beside the connection line and the no-key sheet
 * open the same sheet instead, so it stays reachable at every width.
 */
import { useAssistantStore } from '../../stores/assistant.js'

defineProps({
  /** The button's `data-testid`; the reason line is `${testid}-reason`. */
  testid: { type: String, required: true },
  /** Hide the entry below the laptop width (the chat panel); the chip and no-key sheet remain. */
  onlyWhereUsable: { type: Boolean, default: false },
})

const assistant = useAssistantStore()
</script>

<template>
  <span class="connect-entry" :class="{ 'connect-entry--wide-only': onlyWhereUsable }">
    <button
      type="button"
      class="connect-entry__button"
      :data-testid="testid"
      @click="assistant.openConnect()"
    >
      Live MCP access…
    </button>
  </span>
</template>

<style scoped>
.connect-entry {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.connect-entry--wide-only {
  display: none;
}

@media (min-width: 1100px) {
  .connect-entry--wide-only {
    display: inline-flex;
  }
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
