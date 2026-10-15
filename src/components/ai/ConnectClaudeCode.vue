<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * **Connect to Claude Code** (`TODO/ai-012`, Decision 11): the live bridge's pairing sheet.
 *
 * Claude Code, on the user's own Claude plan and on this computer, asks WarpCad for a change; the
 * first time, its reply carries an 8-character code. Typing it here pairs this tab with that
 * Claude Code session, and from then on its tool calls land in this project as `mcp` History rows,
 * with **Undo AI turn** to take them back. No key, no token: WarpCad supplies only the tools.
 *
 * What it says, plainly, where it cannot work:
 *
 * - A built or hosted copy (no `npm run dev`): live editing is dev-host only.
 * - WebKit (Safari, every iOS browser): works here under `npm run dev`; a hosted (https) copy can
 *   never connect, because WebKit blocks an https page from reaching the computer's loopback.
 * - Chromium: may show its local-network-access prompt; the sheet says to choose Allow.
 *
 * `ModalShell`'s top-anchored frame, like the key sheet: at phone width the keyboard cannot cover
 * the field. (On a phone or tablet the button that opens it is disabled with the reason anyway —
 * `ConnectButton.vue`.) The code is a one-session handshake, not a credential (Decision 8); the
 * field is cleared once it is sent.
 */
import { computed, ref, watch } from 'vue'

import { useEscapeToClose } from '../../composables/useEscapeToClose.js'
import { browserEngine, deviceReason, useLiveBridge } from '../../composables/useLiveBridge.js'
import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'
import ModalShell from '../storage/ModalShell.vue'

const assistant = useAssistantStore()
const chat = useAiChatStore()
const bridge = useLiveBridge()

const open = computed(() => assistant.view === 'connect')
const code = ref('')
const engine = browserEngine()

watch(open, (now) => {
  if (now) code.value = ''
})

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
  if (chat.bridge === 'waiting') return 'Checking the code…'
  return chat.bridgeMessage
})

const canSubmit = computed(() => code.value.trim() !== '' && deviceReason.value === '' && chat.bridge !== 'waiting')

function submit() {
  if (!canSubmit.value) return
  if (bridge.connect(code.value)) code.value = ''
}

/** Back to the chat once connected (its History rows and Undo AI turn live there), else away. */
function close() {
  if (chat.bridge === 'connected') assistant.open()
  else assistant.close()
}
</script>

<template>
  <ModalShell :open="open" testid="ai-connect-sheet" title="Connect to Claude Code" help-topic="claude-code" @backdrop="close()">
    <p class="connect__text" data-testid="ai-connect-explain">
      Lets <strong>Claude Code</strong>, running on this computer on your own Claude plan, add and change
      steps in the project open here. Each change shows in History marked <em>via mcp</em>, and
      <strong>Undo AI turn</strong> takes it back. WarpCad sends no key and stores nothing.
    </p>

    <p v-if="chat.bridge === 'unavailable'" class="connect__warn" role="note" data-testid="ai-connect-unavailable">
      Live editing runs only when WarpCad is started with <code>npm run dev</code> on the same computer
      as Claude Code. This copy can't reach it.
    </p>

    <p v-else-if="chat.bridge === 'connected'" class="connect__ok" role="status" data-testid="ai-connect-connected">
      Connected. Ask Claude Code for a change, and it appears here.
    </p>

    <form v-else class="connect__form" novalidate @submit.prevent="submit()">
      <p class="connect__text">
        In Claude Code, ask for any change (say, “add a 40 mm cube”). It replies with a code like
        <code>K7Q4-FX2M</code>. Type it here.
      </p>
      <p v-if="deviceReason" class="connect__warn" role="note" data-testid="ai-connect-device-reason">{{ deviceReason }}.</p>
      <label class="connect__field">
        Code
        <input
          v-model="code"
          class="connect__input"
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          autocorrect="off"
          spellcheck="false"
          maxlength="12"
          placeholder="K7Q4-FX2M"
          data-testid="ai-connect-code"
        />
      </label>
      <div class="connect__actions">
        <button type="button" class="connect__button" data-testid="ai-connect-cancel" @click="close()">Cancel</button>
        <button type="submit" class="connect__button connect__button--primary" data-testid="ai-connect-submit" :disabled="!canSubmit">
          Connect
        </button>
      </div>
    </form>

    <p v-if="engineNote" class="connect__note" role="note" data-testid="ai-connect-engine-note" :data-engine="engine">{{ engineNote }}</p>
    <p class="connect__status" role="status" data-testid="ai-connect-status" :data-state="chat.bridge">{{ status }}</p>

    <div v-if="chat.bridge === 'connected' || chat.bridge === 'unavailable'" class="connect__actions">
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
.connect__input {
  min-height: var(--tap);
  box-sizing: border-box;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 16px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
