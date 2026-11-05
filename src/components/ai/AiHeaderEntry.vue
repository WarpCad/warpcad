<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The header's **AI** entry (`TODO/ui-078`). On a laptop or tablet, or on a hosted copy (no live
 * bridge), it is just the **Assistant** button, unchanged. On a phone of a dev host it is one
 * grouped 44 px trigger (✦ ▾) that opens a small menu with the two ways in, because two separate
 * 44 px items (Live MCP access, Assistant) did not fit the 390 px header with a comfortable gap:
 *
 * | Row | Opens | Same call as before |
 * |---|---|---|
 * | `assistant-button` | the chat (or the key sheet with no key) | `assistant.open()` |
 * | `live-mcp-button` | the Live MCP access sheet | `assistant.openConnect()` |
 *
 * The trigger carries the live-access state as a corner badge (hollow ring: enabled, solid:
 * connected, shape-coded like `ConnectionDot`) and as `data-state`; with live access off, the same
 * corner shows the Assistant's key dot (`assistant-dot`). The menu closes on a row,
 * Escape, or a press outside it. Rows are 44 px tall. No logic lives here; both rows delegate to
 * the assistant store.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import ConnectionDot from '../display/ConnectionDot.vue'
import AssistantButton from './AssistantButton.vue'
import { useAiChatStore } from '../../stores/aiChat.js'
import { useAssistantStore } from '../../stores/assistant.js'

const assistant = useAssistantStore()
const chat = useAiChatStore()

/** Phone width: the same `640px` switch every sheet in the app uses. */
const phone = ref(typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 640px)').matches)
/** @type {MediaQueryList | null} */
let query = null
/** @param {{ matches: boolean }} e */
function onQuery(e) {
  phone.value = e.matches
  if (!e.matches) open.value = false
}

const grouped = computed(() => phone.value && chat.bridge !== 'unavailable')
const open = ref(false)
const root = ref(/** @type {HTMLElement | null} */ (null))

const badge = computed(() => (chat.bridge === 'connected' ? 'connected' : chat.bridge === 'enabled' ? 'enabled' : 'none'))
/** The trigger's one corner badge: live access when it is on, else the Assistant's key dot. */
const triggerDot = computed(() => (badge.value === 'none' ? assistant.dotState : 'none'))
const liveLabel = computed(() => {
  if (chat.bridge === 'connected') return 'Live MCP access — an agent is connected'
  if (chat.bridge === 'enabled') return 'Live MCP access — on'
  return 'Live MCP access — off'
})

/** @param {'assistant' | 'connect'} which */
function choose(which) {
  open.value = false
  if (which === 'assistant') assistant.open()
  else assistant.openConnect()
}

/** @param {Event} e */
function onOutside(e) {
  if (open.value && root.value && !root.value.contains(/** @type {Node} */ (e.target))) open.value = false
}
/** @param {KeyboardEvent} e */
function onKey(e) {
  if (e.key === 'Escape' && open.value) open.value = false
}

onMounted(() => {
  if (typeof window === 'undefined' || !window.matchMedia) return
  query = window.matchMedia('(max-width: 640px)')
  phone.value = query.matches
  query.addEventListener('change', onQuery)
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  query?.removeEventListener('change', onQuery)
  document.removeEventListener('pointerdown', onOutside)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="grouped" ref="root" class="ai-entry">
    <button
      type="button"
      class="ai-entry__trigger"
      data-testid="ai-menu-button"
      :data-state="chat.bridge"
      :aria-expanded="open"
      aria-haspopup="menu"
      :aria-label="`AI — Assistant and Live MCP access (${liveLabel})`"
      title="AI"
      @click="open = !open"
    >
      <span aria-hidden="true">✦</span>
      <span v-if="badge !== 'none'" class="ai-entry__badge" :class="`ai-entry__badge--${badge}`" aria-hidden="true" />
      <span v-else-if="triggerDot !== 'none'" class="ai-entry__dot">
        <ConnectionDot :state="triggerDot" testid="assistant-dot" />
      </span>
    </button>
    <div v-if="open" class="ai-entry__menu" role="menu" data-testid="ai-menu">
      <button
        type="button"
        role="menuitem"
        class="ai-entry__row"
        data-testid="assistant-button"
        :aria-label="`Assistant — ${assistant.statusText}`"
        @click="choose('assistant')"
      >
        <span aria-hidden="true">✦</span>
        <span class="ai-entry__row-label">Assistant</span>
        <ConnectionDot v-if="assistant.dotState !== 'none'" :state="assistant.dotState" testid="assistant-row-dot" />
      </button>
      <button
        type="button"
        role="menuitem"
        class="ai-entry__row"
        data-testid="live-mcp-button"
        :data-state="chat.bridge"
        :aria-label="liveLabel"
        @click="choose('connect')"
      >
        <span aria-hidden="true">⇄</span>
        <span class="ai-entry__row-label">Live MCP access</span>
        <span v-if="badge !== 'none'" class="ai-entry__badge ai-entry__badge--row" :class="`ai-entry__badge--${badge}`" aria-hidden="true" />
      </button>
    </div>
  </div>
  <AssistantButton v-else />
</template>

<style scoped>
.ai-entry {
  position: relative;
  flex: none;
}

.ai-entry__trigger {
  position: relative;
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

.ai-entry__trigger[aria-expanded='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.ai-entry__menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 208px;
  padding: 4px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
}

.ai-entry__row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: var(--tap);
  box-sizing: border-box;
  padding: 0 12px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.ai-entry__row:hover {
  background: var(--surface-2, var(--border));
}

.ai-entry__row-label {
  flex: 1;
}

.ai-entry__badge {
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

.ai-entry__dot {
  position: absolute;
  top: 3px;
  right: 3px;
  display: flex;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--surface-1);
  pointer-events: none;
}

.ai-entry__badge--row {
  position: static;
  flex: none;
  box-shadow: none;
}

.ai-entry__badge--connected {
  background: var(--accent);
}
</style>
