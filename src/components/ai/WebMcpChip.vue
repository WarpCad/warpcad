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
 */
import { computed } from 'vue'

import { useWebMcp } from '../../composables/useWebMcp.js'
import { useAiChatStore } from '../../stores/aiChat.js'

const chat = useAiChatStore()
const webMcp = useWebMcp()

const on = computed(() => chat.webMcp === 'on')
const title = computed(() =>
  on.value
    ? 'Agents running in this browser can read and change this project through WarpCad’s tools — and see what those tools return, such as part names and design intent. Each change is one Undo AI turn. Tap to turn off.'
    : 'Browser agents cannot see WarpCad’s tools. Tap to let an agent running in this browser drive this project.',
)
</script>

<template>
  <button
    v-if="chat.webMcp !== 'unavailable'"
    type="button"
    role="switch"
    class="webmcp-chip"
    :aria-checked="on ? 'true' : 'false'"
    :data-state="chat.webMcp"
    :data-tools="chat.webMcpTools"
    data-testid="ai-webmcp-switch"
    :title="title"
    @click="webMcp.toggle()"
  >
    <span class="webmcp-chip__track" aria-hidden="true"><span class="webmcp-chip__thumb" /></span>{{ on ? 'Browser agents · on' : 'Browser agents · off' }}
  </button>
</template>

<style scoped>
/* Last in the header row, so when the column is narrow it wraps onto its own line instead of
   squeezing the status away or pushing Close off the edge. */
.webmcp-chip {
  order: 10;
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

.webmcp-chip__track {
  position: relative;
  width: 22px;
  height: 12px;
  border-radius: 999px;
  background: var(--border-strong);
  transition: background 120ms ease;
}

.webmcp-chip__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--surface-1);
  transition: transform 120ms ease;
}

.webmcp-chip[aria-checked='true'] .webmcp-chip__track {
  background: var(--accent);
}

.webmcp-chip[aria-checked='true'] .webmcp-chip__thumb {
  transform: translateX(10px);
}

.webmcp-chip:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .webmcp-chip__track,
  .webmcp-chip__thumb {
    transition: none;
  }
}
</style>
