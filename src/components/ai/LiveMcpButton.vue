<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The header's **Live MCP access** entry (`TODO/ui-075`), phone width only. The Assistant panel's
 * own row is laptop-only (a 44 px row more pushed **Send** out of the half sheet), so a phone user
 * who had turned access on could reach the sheet from the chip, but never turn it on without a
 * detour through the no-key sheet. This opens the same sheet (`assistant.openConnect()`); no logic
 * is duplicated.
 *
 * Absent on a hosted copy (`bridge === 'unavailable'`): live access is dev-host only there, and the
 * Assistant button's sheets already say what to use instead. A corner badge shows when access is on
 * or an agent is connected, shape-coded like `ConnectionDot` (hollow ring: enabled, solid: connected).
 */
import { computed } from 'vue'

import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'

const assistant = useAssistantStore()
const chat = useAiChatStore()

const shown = computed(() => chat.bridge !== 'unavailable')
const badge = computed(() => (chat.bridge === 'connected' ? 'connected' : chat.bridge === 'enabled' ? 'enabled' : 'none'))
const label = computed(() => {
  if (chat.bridge === 'connected') return 'Live MCP access — an agent is connected'
  if (chat.bridge === 'enabled') return 'Live MCP access — on'
  return 'Live MCP access — off'
})
</script>

<template>
  <button
    v-if="shown"
    type="button"
    class="live-mcp-button"
    data-testid="live-mcp-button"
    :data-state="chat.bridge"
    :aria-label="label"
    title="Live MCP access"
    @click="assistant.openConnect()"
  >
    <span aria-hidden="true">⇄</span>
    <span v-if="badge !== 'none'" class="live-mcp-button__badge" :class="`live-mcp-button__badge--${badge}`" aria-hidden="true" />
  </button>
</template>

<style scoped>
/* Phone only: tablet and laptop reach the sheet from the Assistant panel and its chip. */
.live-mcp-button {
  display: none;
}

@media (max-width: 640px) {
  .live-mcp-button {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--tap);
    height: var(--tap);
    box-sizing: border-box;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
    color: var(--text-2);
    font-family: inherit;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    touch-action: manipulation;
  }
}

.live-mcp-button__badge {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 10px;
  height: 10px;
  box-sizing: border-box;
  border: 2px solid var(--accent);
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--surface-1);
}

.live-mcp-button__badge--connected {
  background: var(--accent);
}
</style>
