<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Assistant working** (`TODO/ai-017`): a small chip in the header while an Assistant turn runs,
 * visible with the Assistant panel closed — the user keeps editing during a turn, so the turn's
 * own status line may be folded away or shut. Read-only: the panel's **Watch** and **Stop** are the
 * controls. At ≤ 640 px it collapses to its dot, keeping the same accessible name.
 *
 * `TODO/ai-012`: also while an MCP client call runs in this tab over the live bridge — the "AI is
 * working" state Decision 11 asks for — worded for who is working. `TODO/ai-021`: and while a
 * browser agent's WebMCP call runs, on the same endpoint.
 */
import { computed } from 'vue'

import { useAiChatStore } from '../../stores/aiChat.js'
import BaseChip from './BaseChip.vue'

const chat = useAiChatStore()
const who = computed(() => {
  if (chat.running) return 'Assistant working'
  return chat.workingOrigin === 'webmcp' ? 'Browser agent working' : 'MCP agent working'
})
const detail = computed(() => {
  if (chat.running) return 'Assistant working — keep editing; its changes land when it finishes'
  const agent = chat.workingOrigin === 'webmcp' ? 'A browser agent' : 'An MCP agent'
  return `${agent} is changing this project — each change lands as it finishes`
})
</script>

<template>
  <BaseChip
    v-if="chat.running || chat.bridgeWorking"
    class="ai-working"
    tone="accent"
    size="lg"
    dot
    dot-tone="accent"
    pulse
    role="status"
    :aria-label="who"
    :title="detail"
    data-testid="ai-working-chip"
  >
    <span class="ai-working__text" aria-hidden="true">{{ who }}</span>
  </BaseChip>
</template>

<style scoped>
/* Phone: the dot only — the header has no width to spare (`AppView.vue`'s phone budget). */
@media (max-width: 640px) {
  .ai-working.base-chip {
    min-height: 20px;
    padding: 0 6px;
  }

  .ai-working__text {
    display: none;
  }
}
</style>
