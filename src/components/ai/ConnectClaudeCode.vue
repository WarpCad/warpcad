<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Live MCP access** (`TODO/ai-023`): explicit timed consent for any local MCP client to reach
 * the project open in this tab. There is no pairing code or client-specific setup.
 *
 * What it says, plainly, where it cannot work:
 *
 * - A built or hosted copy (no `npm run dev`): live editing is dev-host only. `TODO/ai-024`: that is
 *   not a dead end — the dialog says what live access is for, that this copy uses **Browser agents**
 *   instead (a way to its switch, and its Help page), and that an MCP client can still work on a
 *   saved project file (the three ways in).
 * - The dev host: the endpoint address an MCP client connects to, so an agent can check it.
 * - WebKit (Safari, every iOS browser): works here under `npm run dev`; a hosted (https) copy can
 *   never connect, because WebKit blocks an https page from reaching the computer's loopback (said
 *   only on the dev host — a hosted copy gets the Browser agents block in every engine).
 * - Chromium: may show its local-network-access prompt; the sheet says to choose Allow.
 *
 * The same control is available at phone and tablet widths. Access is disabled by default and
 * closes automatically when this tab disconnects, including for the unlimited lease.
 *
 * `TODO/ai-026`: inside the native app the host is the app's own MCP server. The sheet then says
 * "device", shows that server's address once it listens, says **Works while WarpCad is open on
 * screen.** where access is enabled, and adds **Allow devices on this Wi-Fi** (`NativeMcpAccess.vue`).
 */
import { computed, ref } from 'vue'

import { liveEndpointUrl } from '../../ai/bridge/protocol.js'
import { STARTER_CLAUDE_CODE, STARTER_OTHER_AGENT } from '../../ai/mcpPrompts.js'
import { useEscapeToClose } from '../../composables/useEscapeToClose.js'
import { browserEngine, nativeLiveHost, useLiveBridge } from '../../composables/useLiveBridge.js'
import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'
import { useHelpStore } from '../../stores/help.js'
import ModalShell from '../storage/ModalShell.vue'
import NativeMcpAccess from './NativeMcpAccess.vue'
import StarterCopy from './StarterCopy.vue'
import BaseButton from '../controls/BaseButton.vue'

const assistant = useAssistantStore()
const chat = useAiChatStore()
const help = useHelpStore()
const bridge = useLiveBridge()
/** `TODO/ai-026`: inside the native app its own MCP server is the host, not the dev server. */
const native = nativeLiveHost()
/** Where a local MCP client connects: the dev server's port, or the app's server once it listens. */
const devEndpointUrl = typeof window === 'undefined' ? liveEndpointUrl({ protocol: 'http:', port: '5183' }) : liveEndpointUrl(window.location)
const endpointUrl = computed(() => (native ? chat.nativeMcp.url : devEndpointUrl))

const open = computed(() => assistant.view === 'connect')
const lease = ref(/** @type {'15m' | '1h' | 'tab' | 'unlimited'} */ ('15m'))
const engine = browserEngine()

useEscapeToClose(() => open.value, () => close())

const engineNote = computed(() => {
  // On a hosted copy live access is out of reach in every engine; the hosted block says what to use.
  if (chat.bridge === 'unavailable' || native) return ''
  if (engine === 'webkit') {
    return 'Safari works here because this page is served by npm run dev on this computer. A hosted (https) copy of WarpCad cannot connect: Safari blocks it.'
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
  if (chat.bridge === 'paused') return chat.bridgeMessage
  if (chat.bridge === 'enabled') {
    return chat.bridgeExpiresAt === null
      ? `Live MCP access is enabled until ${native ? 'the app closes' : 'this tab closes'} or you turn it off.`
      : `Live MCP access is enabled until ${new Date(chat.bridgeExpiresAt).toLocaleTimeString()}.`
  }
  if (chat.bridge === 'expired') return 'Live MCP access expired. Enable it again to reconnect.'
  if (chat.bridge === 'disconnected') return 'The dev-server connection dropped. Reload this tab before enabling access again.'
  return chat.bridgeMessage
})

const available = computed(() => chat.bridge !== 'unavailable')
const accessEnabled = computed(() => chat.bridge === 'enabled' || chat.bridge === 'connected' || chat.bridge === 'paused')

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
  <ModalShell :open="open" testid="ai-connect-sheet" title="Live MCP access" help-topic="claude-code" @backdrop="close()">
    <div v-if="!available" class="connect__hosted" data-testid="ai-connect-hosted">
      <p class="connect__text">
        Live MCP access lets an MCP client on your computer, such as Claude Code, edit the project open
        in a copy of WarpCad you run yourself with <code>npm run dev</code>. This copy can’t offer it.
      </p>
      <p class="connect__text">
        Here, use <strong>Browser agents</strong> instead: an agent running in this browser drives the
        project through the same tools.
        <template v-if="chat.webMcp === 'unavailable'">This browser doesn’t offer WebMCP yet; the Help page says how to turn it on in Chrome.</template>
      </p>
      <div class="connect__actions">
        <BaseButton v-if="chat.webMcp !== 'unavailable'" data-testid="ai-connect-browser-agents" @click="assistant.open()">
          Show the Browser agents switch
        </BaseButton>
        <BaseButton data-testid="ai-connect-webmcp-help" @click="help.openPage('webmcp')">About browser agents</BaseButton>
      </div>
      <p class="connect__text">
        An MCP client can also work on a saved project file; WarpCad merges its changes into the open
        project.
      </p>
      <div class="connect__actions">
        <BaseButton data-testid="ai-connect-mcp-help" @click="help.openPage('mcp', 'three-ways-in')">The three ways in</BaseButton>
      </div>
    </div>

    <template v-else>
      <p class="connect__text" data-testid="ai-connect-explain">
        When enabled, <strong>any MCP client on this {{ native ? 'device' : 'computer' }}</strong> that can reach the local WarpCad
        endpoint can read and change the project open in {{ native ? 'WarpCad' : 'this tab' }}. Changes appear in History as
        <em>via mcp</em>; <strong>Undo AI turn</strong> can take them back. Access is off by default.
      </p>
      <p class="connect__note" data-testid="ai-connect-endpoint" :data-endpoint="endpointUrl">
        <template v-if="endpointUrl">Endpoint: <code>{{ endpointUrl }}</code> (this {{ native ? 'device' : 'computer' }} only).</template>
        <template v-else>The endpoint address appears here once access is on.</template>
      </p>
      <div class="connect__starter" data-testid="ai-connect-starter-row">
        <p class="connect__text">Start the agent: paste one of these as your first message.</p>
        <pre class="connect__command" data-testid="ai-connect-starter">{{ STARTER_CLAUDE_CODE }}</pre>
        <div class="connect__starter-buttons">
          <StarterCopy :text="STARTER_CLAUDE_CODE" label="Copy for Claude Code" testid="ai-connect-copy-starter" />
          <StarterCopy :text="STARTER_OTHER_AGENT" label="Copy for another agent" testid="ai-connect-copy-starter-other" />
        </div>
        <details class="connect__note">
          <summary>What this copies</summary>
          <p data-testid="ai-connect-starter-other-text">{{ STARTER_OTHER_AGENT }}</p>
        </details>
      </div>
    </template>

    <p v-if="available && chat.bridge === 'connected'" class="connect__ok" role="status" data-testid="ai-connect-connected">
      Connected. Make requests in your MCP client; changes appear here as they land.
    </p>

    <div v-if="available" class="connect__form">
      <label class="connect__field">
        Allow local MCP access for
        <select v-model="lease" class="connect__select" data-testid="ai-connect-lease">
          <option value="15m">15 minutes</option>
          <option value="1h">1 hour</option>
          <option value="tab">{{ native ? 'Until the app closes' : 'This tab' }}</option>
          <option value="unlimited">Until turned off</option>
        </select>
      </label>
      <p v-if="native" class="connect__note" data-testid="ai-connect-onscreen">Works while WarpCad is open on screen.</p>
      <div class="connect__actions">
        <BaseButton v-if="accessEnabled" data-testid="ai-connect-disable" @click="turnOff()">Turn off</BaseButton>
        <BaseButton variant="primary" data-testid="ai-connect-enable" @click="enable()">
          {{ accessEnabled ? 'Update access' : 'Enable access' }}
        </BaseButton>
      </div>
    </div>

    <NativeMcpAccess v-if="native && available" :enabled="accessEnabled" :lease="lease" />

    <p v-if="engineNote" class="connect__note" role="note" data-testid="ai-connect-engine-note" :data-engine="engine">{{ engineNote }}</p>
    <p class="connect__status" role="status" data-testid="ai-connect-status" :data-state="chat.bridge">{{ status }}</p>

    <div class="connect__actions">
      <BaseButton data-testid="ai-connect-keys" @click="assistant.openKeySheet()">Key and model…</BaseButton>
      <BaseButton variant="primary" data-testid="ai-connect-done" @click="close()">Done</BaseButton>
    </div>
  </ModalShell>
</template>

<style scoped>
.connect__text,
.connect__note,
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

.connect__hosted {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.connect__hosted .connect__actions {
  justify-content: flex-start;
}

.connect__starter {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.connect__command {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: all;
}

.connect__starter-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Stacked on a phone: each is a full-width 44px target. */
@media (max-width: 479px) {
  .connect__starter-buttons {
    flex-direction: column;
  }

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
</style>
