<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Live MCP access** (`TODO/ai-023`): explicit timed consent for any local MCP client to reach
 * the project open in this tab. There is no pairing code or client-specific setup.
 *
 * What it says, plainly, where it cannot work:
 *
 * - A built or hosted copy (no `npm run dev`): live editing is dev-host only.
 * - WebKit (Safari, every iOS browser): works here under `npm run dev`; a hosted (https) copy can
 *   never connect, because WebKit blocks an https page from reaching the computer's loopback.
 * - Chromium: may show its local-network-access prompt; the sheet says to choose Allow.
 *
 * The same control is available at phone and tablet widths. Access is disabled by default and
 * closes automatically when this tab disconnects, including for the unlimited lease.
 */
import { computed, ref } from 'vue'

import { useEscapeToClose } from '../../composables/useEscapeToClose.js'
import { browserEngine, useLiveBridge } from '../../composables/useLiveBridge.js'
import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'
import ModalShell from '../storage/ModalShell.vue'

const assistant = useAssistantStore()
const chat = useAiChatStore()
const bridge = useLiveBridge()

const open = computed(() => assistant.view === 'connect')
const lease = ref(/** @type {'15m' | '1h' | 'tab' | 'unlimited'} */ ('15m'))
const engine = browserEngine()

useEscapeToClose(() => open.value, () => close())

const engineNote = computed(() => {
  if (engine === 'webkit') {
    return chat.bridge === 'unavailable'
      ? 'Safari and every iPhone or iPad browser block a page served over https from reaching this computer, so a hosted copy of WarpCad cannot connect. Start WarpCad with npm run dev instead.'
      : 'Safari works here because this page is served by npm run dev on this computer. A hosted (https) copy of WarpCad cannot connect: Safari blocks it.'
  }
  if (engine === 'chromium') {
    return 'Chrome and Edge may ask to let this page reach devices on your local network. If they do, choose Allow.'
  }
  return ''
})

const status = computed(() => {
  if (chat.bridge === 'ambiguous') return chat.bridgeMessage || 'More than one MCP client or enabled tab is connected; calls are refused.'
  if (chat.bridge === 'connected') return 'An MCP client is connected to this tab.'
  if (chat.bridge === 'off') return 'Live MCP access is off.'
  if (chat.bridge === 'enabled') {
    return chat.bridgeExpiresAt === null
      ? 'Live MCP access is enabled until this tab closes or you turn it off.'
      : `Live MCP access is enabled until ${new Date(chat.bridgeExpiresAt).toLocaleTimeString()}.`
  }
  if (chat.bridge === 'expired') return 'Live MCP access expired. Enable it again to reconnect.'
  if (chat.bridge === 'disconnected') return 'The dev-server connection dropped. Reload this tab before enabling access again.'
  return chat.bridgeMessage
})

const available = computed(() => chat.bridge !== 'unavailable')
const accessEnabled = computed(() => chat.bridge === 'enabled' || chat.bridge === 'connected')

function enable() {
  bridge.setAccess(lease.value)
}

function turnOff() {
  bridge.setAccess('off')
}

/** Back to the chat once connected (its History rows and Undo AI turn live there), else away. */
function close() {
  if (accessEnabled.value) assistant.open()
  else assistant.close()
}
</script>

<template>
  <ModalShell :open="open" testid="ai-connect-sheet" title="Live MCP access" @backdrop="close()">
    <p class="connect__text" data-testid="ai-connect-explain">
      When enabled, <strong>any MCP client on this computer</strong> that can reach the local WarpCad
      endpoint can read and change the project open in this tab. Changes appear in History as
      <em>via mcp</em>; <strong>Undo AI turn</strong> can take them back. Access is off by default.
    </p>

    <p v-if="!available" class="connect__warn" role="note" data-testid="ai-connect-unavailable">
      Live MCP access is available only when WarpCad is started with <code>npm run dev</code>. This copy cannot reach the local endpoint.
    </p>

    <p v-else-if="chat.bridge === 'connected'" class="connect__ok" role="status" data-testid="ai-connect-connected">
      Connected. Make requests in your MCP client; changes appear here as they land.
    </p>

    <div v-if="available" class="connect__form">
      <label class="connect__field">
        Allow local MCP access for
        <select v-model="lease" class="connect__select" data-testid="ai-connect-lease">
          <option value="15m">15 minutes</option>
          <option value="1h">1 hour</option>
          <option value="tab">This tab</option>
          <option value="unlimited">Until turned off</option>
        </select>
      </label>
      <div class="connect__actions">
        <button v-if="accessEnabled" type="button" class="connect__button" data-testid="ai-connect-disable" @click="turnOff()">Turn off</button>
        <button type="button" class="connect__button connect__button--primary" data-testid="ai-connect-enable" @click="enable()">
          {{ accessEnabled ? 'Update access' : 'Enable access' }}
        </button>
      </div>
    </div>

    <p v-if="engineNote" class="connect__note" role="note" data-testid="ai-connect-engine-note" :data-engine="engine">{{ engineNote }}</p>
    <p class="connect__status" role="status" data-testid="ai-connect-status" :data-state="chat.bridge">{{ status }}</p>

    <div class="connect__actions">
      <button type="button" class="connect__button connect__button--primary" data-testid="ai-connect-done" @click="close()">Done</button>
    </div>
  </ModalShell>
</template>

<style scoped>
.connect__text,
.connect__note,
.connect__warn,
.connect__ok,
.connect__status {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.connect__note,
.connect__status {
  font-size: 12px;
  color: var(--text-2);
}

.connect__status {
  min-height: 1.4em;
}

.connect__warn {
  color: var(--warn);
}

.connect__ok {
  color: var(--accent);
}

.connect__form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.connect__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-2);
}

/* 16px: iOS zooms the page on focus of anything smaller. */
.connect__select {
  min-height: var(--tap);
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  font-size: 16px;
}

.connect__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.connect__button {
  min-width: 80px;
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.connect__button--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.connect__button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
