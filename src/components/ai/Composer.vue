<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The chat's composer (`TODO/ai-006`): the message box, **Attach image**, and **Send** — which
 * becomes **Stop** while a turn runs.
 *
 * Enter sends and Shift+Enter breaks the line (not while an IME is composing — that Enter
 * confirms a character). Every control is a 44 px target, because the touch path is the whole
 * point: **Send** is a button, not only a key, and **Attach image** opens the system picker,
 * which on a phone offers the camera as well as the photo library. State lives in
 * `stores/aiChat.js`; running it is `composables/useAgent.js`.
 */
import { ref } from 'vue'

import { useAgent } from '../../composables/useAgent.js'
import { useAiChatStore } from '../../stores/aiChat.js'

const chat = useAiChatStore()
const agent = useAgent()
/** @type {import('vue').Ref<HTMLInputElement | null>} */
const picker = ref(null)

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  void agent.send()
}

/** @param {Event} event */
async function onPicked(event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const files = [...(input.files ?? [])]
  input.value = ''
  for (const file of files) await agent.attach(file)
}
</script>

<template>
  <form class="composer" data-testid="ai-composer" @submit.prevent="agent.send()">
    <ul v-if="chat.attachments.length > 0" class="composer__attachments" data-testid="ai-attachments">
      <li v-for="(attachment, index) in chat.attachments" :key="index" class="composer__thumb">
        <img :src="attachment.dataUrl" :alt="`Attached: ${attachment.name}`" />
        <button
          type="button"
          class="composer__remove"
          :aria-label="`Remove ${attachment.name}`"
          data-testid="ai-attachment-remove"
          @click="chat.removeAttachment(index)"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </li>
    </ul>
    <p v-if="chat.attaching > 0" class="composer__pending" role="status" data-testid="ai-attach-pending">Preparing image…</p>
    <p v-if="chat.attachError" class="composer__error" role="alert" data-testid="ai-attach-error">{{ chat.attachError }}</p>
    <div class="composer__row">
      <button
        type="button"
        class="composer__button"
        data-testid="ai-attach"
        aria-label="Attach image"
        title="Attach image"
        :disabled="chat.running"
        @click="picker?.click()"
      >
        📎
      </button>
      <input
        ref="picker"
        class="composer__file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        tabindex="-1"
        data-testid="ai-attach-input"
        @change="onPicked"
      />
      <textarea
        v-model="chat.draft"
        class="composer__input"
        rows="2"
        placeholder="Ask for a part or a change…"
        aria-label="Message the assistant"
        data-testid="ai-input"
        @keydown="onKeydown"
      />
      <button
        v-if="chat.running"
        type="button"
        class="composer__button composer__button--stop"
        data-testid="ai-stop"
        @click="agent.stop()"
      >
        Stop
      </button>
      <button
        v-else
        type="submit"
        class="composer__button composer__button--send"
        data-testid="ai-send"
        :disabled="!chat.canSend"
      >
        Send
      </button>
    </div>
  </form>
</template>

<style scoped>
.composer {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.composer__pending {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.composer__row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.composer__input {
  flex: 1;
  min-width: 0;
  min-height: var(--tap);
  box-sizing: border-box;
  padding: 8px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px stops iOS Safari zooming the page when the box is focused. */
  font-size: 16px;
  resize: none;
}

.composer__button {
  flex: none;
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

.composer__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.composer__button--send {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.composer__button--stop {
  border-color: var(--danger);
  color: var(--danger);
}

.composer__file {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.composer__attachments {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  flex-wrap: wrap;
}

.composer__thumb {
  position: relative;
  width: 56px;
  height: 56px;
}

.composer__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
}

/* A 44 px hit area around a 24 px badge: the badge is what you see, the area is what you tap. */
.composer__remove {
  position: absolute;
  top: -20px;
  right: -20px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
}

.composer__remove span {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--border-strong);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 12px;
}

.composer__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
}
</style>
