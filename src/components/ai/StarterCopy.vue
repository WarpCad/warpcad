<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A **Copy starter** button (`TODO/ai-029`): copies one fixed text (`src/ai/mcpPrompts.js`) for the
 * user to paste as their first message to an MCP agent. Used by the subscription and Live MCP
 * sheets. The text is always a constant, never built from the project.
 *
 * Feedback: the label reads **Copied** for two seconds; if the clipboard is blocked a note says to
 * copy the text by hand (the text itself is shown, selectable, by the parent).
 */
import { onBeforeUnmount, ref } from 'vue'

const props = defineProps({
  /** What to copy. */
  text: { type: String, required: true },
  /** The button's label before it is pressed. */
  label: { type: String, required: true },
  /** `data-testid` of the button; the note is `<testid>-status`. */
  testid: { type: String, required: true },
})

/** @type {import('vue').Ref<'' | 'copied' | 'failed'>} */
const state = ref('')
/** @type {ReturnType<typeof setTimeout> | undefined} */
let timer

onBeforeUnmount(() => clearTimeout(timer))

async function copy() {
  clearTimeout(timer)
  try {
    await navigator.clipboard.writeText(props.text)
    state.value = 'copied'
    timer = setTimeout(() => {
      state.value = ''
    }, 2000)
  } catch {
    // Clipboard blocked (an insecure origin, a denied permission): the text above is selectable.
    state.value = 'failed'
  }
}
</script>

<template>
  <div class="starter">
    <button type="button" class="starter__button" :data-testid="testid" @click="copy()">
      {{ state === 'copied' ? 'Copied' : label }}
    </button>
    <p v-if="state === 'failed'" class="starter__note" role="status" :data-testid="`${testid}-status`">
      Couldn’t copy — select the text above and copy it
    </p>
  </div>
</template>

<style scoped>
.starter {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.starter__button {
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

.starter__note {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}
</style>
