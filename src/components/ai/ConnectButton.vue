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
import BaseButton from '../controls/BaseButton.vue'

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
    <BaseButton
      narrow
      :data-testid="testid"
      @click="assistant.openConnect()"
    >
      Live MCP access…
    </BaseButton>
  </span>
</template>

<style scoped>
.connect-entry {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.connect-entry--wide-only {
  display: none;
}

@media (min-width: 1100px) {
  .connect-entry--wide-only {
    display: inline-flex;
  }
}

.connect-entry__reason {
  font-size: var(--text-size-sm);
  color: var(--text-2);
}
</style>
