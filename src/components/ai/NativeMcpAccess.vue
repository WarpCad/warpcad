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
 *   ends every connected session. If the host refuses the switch (no Wi-Fi address, a VPN or
 *   cellular route, a carrier or public address, IPv6 only, or a bind failure) its reason shows
 *   under the switch as an error (`ai-connect-lan-error`, `TODO/ai-043`), and the switch reads what
 *   the host answered, not the tap.
 *
 * `TODO/ai-042`: on iOS and Android the host requires the token from a client on this device's
 * loopback address too, and says so (`loopbackNeedsToken`). While it listens, the sheet then shows
 * the token beside the loopback address (`ai-connect-loopback-row`), with **Copy token** and a
 * `claude mcp add` line that carries the `Authorization` header. On a Mac or PC it shows nothing new.
 *
 * The address and token are the server's, never project text. They wrap rather than scroll.
 * The server is plain HTTP, so the sheet says the token crosses the Wi-Fi unencrypted
 * (`ai-connect-lan-unencrypted`, `TODO/ai-036`), before the switch is turned on. If the device
 * changes network the host sends a new endpoint and the address here follows it.
 */
import { computed, ref, watch } from 'vue'

import { useLiveBridge } from '../../composables/useLiveBridge.js'
import { claudeCodeCommand, loopbackClaudeCodeCommand } from '../../native/mcp.js'
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
/** `TODO/ai-042`: a loopback client needs the token, and there is one to show. */
const loopbackShown = computed(() => chat.nativeMcp.loopbackNeedsToken && chat.nativeMcp.url !== '' && chat.nativeMcp.token !== '')
const loopbackCommand = computed(() => loopbackClaudeCodeCommand(chat.nativeMcp))

/**
 * The switch's position while the host has not answered a tap, else `null`. Without it a refused
 * tap leaves the box ticked: the host's `lan: false` equals what was rendered, so Vue never
 * re-writes `checked` (`TODO/ai-043`).
 */
const asked = ref(/** @type {boolean | null} */ (null))
const checked = computed(() => asked.value ?? chat.nativeMcp.lan)
// Every host answer, and every failure, replaces `nativeMcp`.
watch(() => chat.nativeMcp, () => {
  asked.value = null
})

/** @param {Event} event */
function toggle(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const lan = input.checked
  if (bridge.setAccess(/** @type {'15m' | '1h' | 'tab' | 'unlimited'} */ (props.lease), { lan })) asked.value = lan
  else input.checked = chat.nativeMcp.lan
}
</script>

<template>
  <div class="native">
    <div v-if="loopbackShown" class="lan" data-testid="ai-connect-loopback-row">
      <p class="lan__note">An app on this device needs this token too: on a phone or tablet any other app could reach this address.</p>
      <dl class="lan__values">
        <dt>Address</dt>
        <dd><code data-testid="ai-connect-loopback-url">{{ chat.nativeMcp.url }}</code></dd>
        <dt>Token</dt>
        <dd><code data-testid="ai-connect-loopback-token">{{ chat.nativeMcp.token }}</code></dd>
      </dl>
      <div class="lan__buttons">
        <StarterCopy :text="chat.nativeMcp.token" label="Copy token" testid="ai-connect-copy-loopback-token" />
        <StarterCopy :text="loopbackCommand" label="Copy Claude Code command" testid="ai-connect-copy-loopback-cmd" />
      </div>
    </div>
    <div class="lan" data-testid="ai-connect-lan-row">
      <label class="lan__switch">
        <input type="checkbox" role="switch" class="lan__input" data-testid="ai-connect-lan" :checked="checked" :disabled="!enabled" @change="toggle($event)" />
        <span>Allow devices on this Wi-Fi</span>
      </label>
      <p v-if="chat.nativeMcp.lanError" class="lan__error" role="alert" data-testid="ai-connect-lan-error">{{ chat.nativeMcp.lanError }}</p>
      <p class="lan__note">Lets an agent on another computer on this Wi-Fi connect, with the token below. Off by default.</p>
      <p class="lan__note" data-testid="ai-connect-lan-unencrypted">The address and token are sent unencrypted, so turn this on only on a network you trust: at home, not a café or conference.</p>
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
  </div>
</template>

<style scoped>
.native,
.lan {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.lan__switch {
  display: flex;
  align-items: center;
  gap: var(--space-4h);
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

.lan__error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--danger);
  border-radius: var(--radius-sm);
  font-size: var(--text-size-sm);
  line-height: 1.5;
  color: var(--danger);
  overflow-wrap: anywhere;
}

.lan__values {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--space-2) var(--space-4h);
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
  gap: var(--space-4);
}

/* Stacked on a phone: each is a full-width 44px target. */
@media (max-width: 479px) {
  .lan__buttons {
    flex-direction: column;
  }
}

.lan__button {
  min-height: var(--tap);
  padding: 0 var(--space-5h);
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
