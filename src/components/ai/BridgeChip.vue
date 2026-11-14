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

import { PAUSED_NOTICE } from '../../composables/useLiveBridge.js'
import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'
import BaseChip from '../display/BaseChip.vue'

const chat = useAiChatStore()
const assistant = useAssistantStore()

const label = computed(() => {
  // `TODO/ai-026`: the native app is back from the background, and a client had been connected.
  if (chat.bridge === 'paused') return PAUSED_NOTICE
  if (chat.bridge === 'connected') return 'MCP agent · connected'
  if (chat.bridge === 'enabled') return 'MCP access · enabled'
  if (chat.bridge === 'ambiguous') return 'MCP routing · ambiguous'
  if (chat.bridge === 'expired') return 'MCP access · expired'
  if (chat.bridge === 'disconnected') return 'MCP connection · disconnected'
  return ''
})

/** The dot's colour: accent while connected, warning when something is wrong, muted otherwise. */
const dotTone = computed(() => {
  if (chat.bridge === 'connected') return 'accent'
  if (chat.bridge === 'disconnected' || chat.bridge === 'ambiguous' || chat.bridge === 'expired') return 'warn'
  return 'muted'
})
</script>

<template>
  <BaseChip
    v-if="label !== ''"
    as="button"
    class="bridge-chip"
    :tone="chat.bridge === 'disconnected' ? 'warn' : 'neutral'"
    size="tap"
    dot
    :dot-tone="dotTone"
    :data-state="chat.bridge"
    data-testid="ai-bridge-chip"
    :title="chat.bridgeMessage || 'Live MCP access'"
    @click="assistant.openConnect()"
  >{{ label }}</BaseChip>
</template>

<style scoped>
/* The paused notice is long: it wraps rather than pushing the header wider. */
.bridge-chip[data-state='paused'] {
  white-space: normal;
  text-align: start;
}
</style>
