<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Allow devices on this Wi-Fi** (`TODO/ai-026`), the native app's part of the Live MCP access
 * sheet (`ConnectClaudeCode.vue`). Shown only inside the app, whose own MCP server is the host.
 *
 * - Precondition: a lease is on (`enabled`); the switch is disabled otherwise, and off by default.
 * - Trigger: the switch (`ai-connect-lan`) re-sends the sheet's lease with the Wi-Fi choice.
 * - Feedback: the Wi-Fi address and the token, each with **Copy**, a ready-to-paste
 *   `claude mcp add` line (`ai-connect-copy-cmd`), and **New token** (`ai-connect-rotate`), which
 *   ends every connected session. If the device has no Wi-Fi address the host says so here.
 *
 * The address and token are the server's, never project text. They wrap rather than scroll.
 * The server is plain HTTP, so the sheet says the token crosses the Wi-Fi unencrypted
 * (`ai-connect-lan-unencrypted`, `TODO/ai-036`), before the switch is turned on. If the device
 * changes network the host sends a new endpoint and the address here follows it.
 */
import { computed } from 'vue'

import { useLiveBridge } from '../../composables/useLiveBridge.js'
import { claudeCodeCommand } from '../../native/mcp.js'
import { useAiChatStore } from '../../stores/aiChat.js'
import StarterCopy from './StarterCopy.vue'

const props = defineProps({
  /** A lease is on. */
  enabled: { type: Boolean, required: true },
  /** The lease chosen in the sheet, re-sent with the switch. */
  lease: { type: String, required: true },
})

const chat = useAiChatStore()
const bridge = useLiveBridge()
const shown = computed(() => chat.nativeMcp.lan && chat.nativeMcp.lanUrl !== '')
const command = computed(() => claudeCodeCommand(chat.nativeMcp))

/** @param {Event} event */
function toggle(event) {
  const lan = /** @type {HTMLInputElement} */ (event.target).checked
  bridge.setAccess(/** @type {'15m' | '1h' | 'tab' | 'unlimited'} */ (props.lease), { lan })
}
</script>

<template>
  <div class="lan" data-testid="ai-connect-lan-row">
    <label class="lan__switch">
      <input type="checkbox" role="switch" class="lan__input" data-testid="ai-connect-lan" :checked="chat.nativeMcp.lan" :disabled="!enabled" @change="toggle($event)" />
      <span>Allow devices on this Wi-Fi</span>
    </label>
    <p class="lan__note">Lets an agent on another computer on this Wi-Fi connect, with the token below. Off by default.</p>
    <p class="lan__note" data-testid="ai-connect-lan-unencrypted">The address and token are sent unencrypted, so turn this on only on a network you trust: at home, not a café or conference.</p>
    <p v-if="chat.nativeMcp.lanError" class="lan__note" role="alert" data-testid="ai-connect-lan-error">{{ chat.nativeMcp.lanError }}</p>
    <template v-if="shown">
      <dl class="lan__values">
        <dt>Address</dt>
        <dd><code data-testid="ai-connect-lan-url">{{ chat.nativeMcp.lanUrl }}</code></dd>
        <dt>Token</dt>
        <dd><code data-testid="ai-connect-token">{{ chat.nativeMcp.token }}</code></dd>
      </dl>
      <div class="lan__buttons">
        <StarterCopy :text="chat.nativeMcp.lanUrl" label="Copy address" testid="ai-connect-copy-url" />
        <StarterCopy :text="chat.nativeMcp.token" label="Copy token" testid="ai-connect-copy-token" />
        <StarterCopy :text="command" label="Copy Claude Code command" testid="ai-connect-copy-cmd" />
        <button type="button" class="lan__button" data-testid="ai-connect-rotate" @click="bridge.rotateToken()">New token</button>
      </div>
      <p class="lan__note">New token ends every connected session.</p>
    </template>
  </div>
</template>

<style scoped>
.lan {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lan__switch {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  font-size: var(--text-size-lg);
  color: var(--text-1);
  cursor: pointer;
}

.lan__input {
  width: 22px;
  height: 22px;
  margin: 0;
  accent-color: var(--accent);
}

.lan__note {
  margin: 0;
  font-size: var(--text-size-sm);
  line-height: 1.5;
  color: var(--text-2);
}

.lan__values {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 10px;
  margin: 0;
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.lan__values dd {
  margin: 0;
  min-width: 0;
}

.lan__values code {
  color: var(--text-1);
  overflow-wrap: anywhere;
  user-select: all;
}

.lan__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Stacked on a phone: each is a full-width 44px target. */
@media (max-width: 479px) {
  .lan__buttons {
    flex-direction: column;
  }
}

.lan__button {
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: var(--text-size-lg);
  cursor: pointer;
  touch-action: manipulation;
}
</style>
