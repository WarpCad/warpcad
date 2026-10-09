<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The header's **Assistant** button (`TODO/ai-004`). Always present — never gated on a
 * selection, a key or anything else. Pressing it opens the chat if a key is stored and the key
 * sheet if not, so "how do I connect it" is never a hunt: the button *is* the way in.
 *
 * Its dot (`ConnectionDot`) shows the connection with every sheet closed. At phone width the
 * word gives way to a glyph (the header has ~320 px of budget and the document-bar cluster needs
 * it); the accessible name stays "Assistant" and the tap target stays 44 px.
 */
import ConnectionDot from '../display/ConnectionDot.vue'
import { useAssistantStore } from '../../stores/assistant.js'

const assistant = useAssistantStore()
</script>

<template>
  <button
    type="button"
    class="assistant-button"
    data-testid="assistant-button"
    :aria-label="`Assistant — ${assistant.statusText}`"
    title="Assistant"
    @click="assistant.open()"
  >
    <span class="assistant-button__glyph" aria-hidden="true">✦</span>
    <span class="assistant-button__label">Assistant</span>
    <span v-if="assistant.dotState !== 'none'" class="assistant-button__badge">
      <ConnectionDot :state="assistant.dotState" testid="assistant-dot" />
    </span>
  </button>
</template>

<style scoped>
.assistant-button {
  position: relative;
  flex: none;
  /* A whole-pixel width, and the same width with or without the dot: the dot is a corner badge
     (like the File button's), not a flex child. A content-sized button had a fractional width,
     which put every header control to its left on a fractional x and made the docs stills'
     1px edges flicker between runs; it would also have shifted them whenever a key was saved. */
  width: 118px;
  box-sizing: border-box;
  height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-2);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
}

.assistant-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.assistant-button__glyph {
  font-size: 15px;
}

.assistant-button__badge {
  position: absolute;
  top: 3px;
  right: 3px;
  display: flex;
  /* The ring of surface colour lifts the 14px badge off the button's border. */
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--surface-1);
  pointer-events: none;
}

@media (max-width: 640px) {
  .assistant-button {
    width: var(--tap);
    padding: 0;
  }

  .assistant-button__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
}
</style>
