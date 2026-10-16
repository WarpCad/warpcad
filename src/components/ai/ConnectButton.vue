<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Live MCP access…** (`TODO/ai-023`): the way into the live access sheet, in
 * the Assistant panel (beside **Key and model…**) and in the no-key sheet (beside **Use my Claude
 * subscription…**).
 *
 * Available at phone and tablet widths too; only the host's dev server and Origin gate can expose
 * this local endpoint, and access remains off until the user chooses a lease here.
 */
import { useAssistantStore } from '../../stores/assistant.js'

defineProps({
  /** The button's `data-testid`; the reason line is `${testid}-reason`. */
  testid: { type: String, required: true },
  /** Retained for call-site compatibility; the access control is reachable at every width. */
  onlyWhereUsable: { type: Boolean, default: false },
})

const assistant = useAssistantStore()
</script>

<template>
  <span class="connect-entry">
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
