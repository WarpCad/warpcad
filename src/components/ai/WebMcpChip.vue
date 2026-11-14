<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Browser agents · on / off** (`TODO/ai-021`, `docs/decisions/ai-partner.md` Decision 13): the
 * Assistant header's chip for WebMCP, and the switch itself — one 44px control, `role="switch"`,
 * so a tap flips it and a screen reader hears "Browser agents, switch, on".
 *
 * - **Absent** where the browser has no WebMCP (the panel never offers a route that cannot work).
 * - **On** (the default): WarpCad's tools are registered on `document.modelContext` while this tab
 *   is visible, so an agent running in this browser can read and change the project. Every change
 *   lands as one **Undo AI turn** group, marked **via webmcp** in History.
 * - **Off**: every tool is unregistered at once, and the choice is remembered in this browser.
 *
 * The tooltip says plainly what "on" exposes: whatever a tool returns — body names, design intent,
 * sizes — goes to whichever agent is attached, which WarpCad cannot see.
 *
 * `TODO/ai-024`: "on" never stands alone. The chip counts the tools it offers (**on — 20 tools**) or
 * says why it offers none (**on, but the tab is hidden**, **on — registration failed**), and carries
 * the diagnostic line in `data-webmcp` (`stores/aiChat.js`, `ai/webmcp/status.js`).
 */
import { computed } from 'vue'

import { useWebMcp } from '../../composables/useWebMcp.js'
import { useAiChatStore } from '../../stores/aiChat.js'
import BaseChip from '../display/BaseChip.vue'

const chat = useAiChatStore()
const webMcp = useWebMcp()

const on = computed(() => chat.webMcp === 'on')
/** Why nothing is offered, ahead of the usual tooltip. */
const why = computed(() => {
  if (!on.value) return ''
  if (!chat.webMcpVisible) return 'WarpCad offers its tools only while this tab is the one in front; come back to it and they are offered again. '
  if (chat.webMcpFailureText) return `${chat.webMcpFailureText} `
  return ''
})
const title = computed(() =>
  on.value
    ? `${why.value}Agents running in this browser can read and change this project through WarpCad’s tools — and see what those tools return, such as part names and design intent. Each change is one Undo AI turn. Tap to turn off.`
    : 'Browser agents cannot see WarpCad’s tools. Tap to let an agent running in this browser drive this project.',
)
</script>

<template>
  <BaseChip
    v-if="chat.webMcp !== 'unavailable'"
    as="button"
    class="webmcp-chip"
    tone="neutral"
    size="tap"
    role="switch"
    :aria-checked="on ? 'true' : 'false'"
    :data-state="chat.webMcp"
    :data-tools="chat.webMcpTools"
    :data-webmcp="chat.webMcpDiagnostic"
    data-testid="ai-webmcp-switch"
    :title="title"
    @click="webMcp.toggle()"
  >
    <template #leading><span class="webmcp-chip__track" aria-hidden="true"><span class="webmcp-chip__thumb" /></span></template>{{ chat.webMcpLabel }}
  </BaseChip>
</template>

<style scoped>
/* Last in the header row, so when the column is narrow it wraps onto its own line instead of
   squeezing the status away or pushing Close off the edge. */
.webmcp-chip {
  order: 10;
}

.webmcp-chip__track {
  position: relative;
  width: 22px;
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--border-strong);
  transition: background var(--duration-fast) ease;
}

.webmcp-chip__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-round);
  background: var(--surface-1);
  transition: transform var(--duration-fast) ease;
}

.webmcp-chip[aria-checked='true'] .webmcp-chip__track {
  background: var(--accent);
}

.webmcp-chip[aria-checked='true'] .webmcp-chip__thumb {
  transform: translateX(10px);
}

@media (prefers-reduced-motion: reduce) {
  .webmcp-chip__track,
  .webmcp-chip__thumb {
    transition: none;
  }
}
</style>
