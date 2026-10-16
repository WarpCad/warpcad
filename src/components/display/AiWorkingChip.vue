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
  <span
    v-if="chat.running || chat.bridgeWorking"
    class="ai-working"
    role="status"
    :aria-label="who"
    :title="detail"
    data-testid="ai-working-chip"
  >
    <span class="ai-working__dot" aria-hidden="true" />
    <span class="ai-working__text" aria-hidden="true">{{ who }}</span>
  </span>
</template>

<style scoped>
.ai-working {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-1));
  color: var(--text-1);
  font-size: 12px;
  white-space: nowrap;
}

.ai-working__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  animation: ai-working-pulse 1.4s ease-in-out infinite;
}

@keyframes ai-working-pulse {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ai-working__dot {
    animation: none;
  }
}

/* Phone: the dot only — the header has no width to spare (`AppView.vue`'s phone budget). */
@media (max-width: 640px) {
  .ai-working {
    min-height: 20px;
    padding: 0 6px;
  }

  .ai-working__text {
    display: none;
  }
}
</style>
