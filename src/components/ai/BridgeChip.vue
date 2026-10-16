<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The live MCP access state in the Assistant header. A tap opens the lease controls and any
 * current routing refusal. Shown once access has been enabled (or has gone wrong), not while it is
 * simply off: an always-on chip wraps the header at phone width and pushes the sheet past the
 * viewport's nav chrome. While off, the lease control is the Assistant panel's **Live MCP access…**
 * button (laptop) or the no-key sheet's (phone and tablet).
 */
import { computed } from 'vue'

import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'

const chat = useAiChatStore()
const assistant = useAssistantStore()

const label = computed(() => {
  if (chat.bridge === 'connected') return 'MCP agent · connected'
  if (chat.bridge === 'enabled') return 'MCP access · enabled'
  if (chat.bridge === 'ambiguous') return 'MCP routing · ambiguous'
  if (chat.bridge === 'expired') return 'MCP access · expired'
  if (chat.bridge === 'disconnected') return 'MCP connection · disconnected'
  return ''
})
</script>

<template>
  <button
    v-if="label !== ''"
    type="button"
    class="bridge-chip"
    :data-state="chat.bridge"
    data-testid="ai-bridge-chip"
    :title="chat.bridgeMessage || 'Live MCP access'"
    @click="assistant.openConnect()"
  >
    <span class="bridge-chip__dot" aria-hidden="true" />{{ label }}
  </button>
</template>

<style scoped>
.bridge-chip {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: var(--tap);
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  touch-action: manipulation;
}

.bridge-chip__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-2);
}

.bridge-chip[data-state='connected'] .bridge-chip__dot {
  background: var(--accent);
}

.bridge-chip[data-state='disconnected'] {
  border-color: var(--warn);
}

.bridge-chip[data-state='disconnected'] .bridge-chip__dot {
  background: var(--warn);
}

.bridge-chip[data-state='ambiguous'] .bridge-chip__dot,
.bridge-chip[data-state='expired'] .bridge-chip__dot {
  background: var(--warn);
}
</style>
