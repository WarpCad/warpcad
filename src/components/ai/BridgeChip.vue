<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The live bridge's state in the Assistant header (`TODO/ai-012`): *Claude Code · connected*,
 * *waiting for Claude Code*, or *disconnected — reconnect*. Shown once a connection has been
 * tried; a tap opens **Connect to Claude Code** (to reconnect with a new code, or to read why).
 */
import { computed } from 'vue'

import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'

const chat = useAiChatStore()
const assistant = useAssistantStore()

const label = computed(() => {
  if (chat.bridge === 'connected') return 'Claude Code · connected'
  if (chat.bridge === 'waiting') return 'waiting for Claude Code'
  if (chat.bridge === 'disconnected') return 'disconnected — reconnect'
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
    :title="chat.bridgeMessage || 'Connect to Claude Code'"
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
</style>
