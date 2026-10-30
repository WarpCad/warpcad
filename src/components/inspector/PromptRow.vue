<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector's **Prompt** row (`TODO/ai-031`): the request an agent was given, for a selected
 * body it produced (`promptsForBody` — the body's own steps, or a body a boolean consumed into
 * it). Read-only; collapsed to one ellipsised line by default, and a tap (or Enter/Space — it is
 * a button) shows the whole text, wrapped. Nothing renders for a body no prompt produced, which
 * is every body a person made by hand.
 *
 * Under the request, for one selected body, each prompt's saved reply and its **Add reply…**
 * control (`TODO/ai-032`, `src/components/ai/PromptReply.vue`).
 *
 * With several bodies selected it says how many prompts produced them — "2 prompts" — and shows
 * no text: one Inspector row is no place to read several requests side by side.
 *
 * Untrusted text (it arrives from agents and from any opened file), so it is rendered with
 * `{{ }}` text interpolation only: no `v-html`, no Markdown, no link is ever made or followed.
 */
import { computed, ref, watch } from 'vue'

import { promptsForBody } from '../../core/prompt.js'
import { useDocumentStore } from '../../stores/document.js'
import PromptReply from '../ai/PromptReply.vue'

const props = defineProps({
  /** The selected bodies' ids (lineage roots). One shows the text; several show a count. */
  bodyIds: { type: Array, required: true },
})

const documentStore = useDocumentStore()
const expanded = ref(false)

/** Every distinct prompt that produced any selected body, in the order recorded. */
const prompts = computed(() => {
  void documentStore.version // `raw` is deliberately non-reactive
  const raw = documentStore.raw
  /** @type {Map<string, import('../../core/prompt.js').PromptRecord>} */
  const found = new Map()
  for (const id of /** @type {string[]} */ (props.bodyIds)) {
    for (const prompt of promptsForBody(raw, id)) found.set(prompt.id, prompt)
  }
  return [...found.values()]
})

const single = computed(() => props.bodyIds.length === 1)
const text = computed(() => prompts.value.map((prompt) => prompt.text).join('\n\n'))
const countLabel = computed(() => `${prompts.value.length} ${prompts.value.length === 1 ? 'prompt' : 'prompts'}`)

// A different selection starts collapsed again.
watch(
  () => props.bodyIds.join('\u0000'),
  () => {
    expanded.value = false
  },
)
</script>

<template>
  <template v-if="prompts.length > 0">
    <button
      v-if="single"
      type="button"
      class="prompt"
      :class="{ 'prompt--collapsed': !expanded }"
      data-testid="inspector-prompt"
      :aria-expanded="expanded ? 'true' : 'false'"
      :title="expanded ? 'Show less' : 'The request this was built from — tap to read it all'"
      @click="expanded = !expanded"
    >
      <span class="prompt__label">Prompt</span>
      <span class="prompt__text" data-testid="inspector-prompt-text">{{ text }}</span>
    </button>
    <!-- `TODO/ai-032`: each prompt's saved reply, and Add reply…, under the request. -->
    <template v-if="single">
      <PromptReply v-for="prompt in prompts" :key="prompt.id" :prompt="prompt" />
    </template>
    <p v-else class="prompt prompt--count" data-testid="inspector-prompt">{{ countLabel }}</p>
  </template>
</template>

<style scoped>
.prompt {
  /* Like the intent line: never squeezed below its text in the scrolling Inspector column. */
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  min-height: var(--tap);
  margin: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.prompt--count {
  align-items: center;
  cursor: default;
  color: var(--text-3);
}

.prompt__label {
  flex: 0 0 auto;
  color: var(--text-3);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.prompt__text {
  flex: 1;
  min-width: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.prompt--collapsed {
  align-items: center;
}

.prompt--collapsed .prompt__text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt:hover .prompt__text,
.prompt:focus-visible .prompt__text {
  color: var(--text-1);
}
</style>
