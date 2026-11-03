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
 * **The link (`TODO/ui-092`, part 3).** First, a compact 44 px link to the Prompts view
 * (`inspector-prompt-link`), read from the document store's prompt index: one prompt reads
 * **Made by** or **Changed by** and its first line, then **›**; several read **Made by 1, changed
 * by 2 ›**, or **2 prompts ›** where the roles match. It opens the Prompts view with that request
 * expanded and scrolled into view, or filtered to the several. A mouse over it lights the
 * requests' parts, as a row in the view does. The request text and reply below it are the old
 * surface, removed by the finding's Part 5.
 *
 * Untrusted text (it arrives from agents and from any opened file), so it is rendered with
 * `{{ }}` text interpolation only: no `v-html`, no Markdown, no link is ever made or followed.
 */
import { computed, ref, watch } from 'vue'

import { promptsForBody } from '../../core/prompt.js'
import { usePromptHighlight, usePromptParts } from '../../composables/usePromptHighlight.js'
import { useDocumentStore } from '../../stores/document.js'
import { usePromptsUiStore } from '../../stores/promptsUi.js'
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
    highlight.clear()
  },
)

// --- the link to the Prompts view (TODO/ui-092) ---------------------------

const promptsUi = usePromptsUiStore()
const { drawnIdsOf } = usePromptParts()
const highlight = usePromptHighlight()

/** @type {Record<import('../../core/prompt.js').PromptRole, number>} */
const ROLE_RANK = { made: 0, changed: 1, wentInto: 2 }

/**
 * Each prompt behind the selection, oldest first, with what it did — from the index, never a
 * lineage walk. Across several bodies a prompt that made one and changed another counts as made.
 * A prompt whose part went into this one changed it, as far as this body is concerned.
 */
const linked = computed(() => {
  const byBody = documentStore.promptIndex.byBody
  /** @type {Map<string, import('../../core/prompt.js').PromptRole>} */
  const roles = new Map()
  for (const bodyId of /** @type {string[]} */ (props.bodyIds)) {
    for (const { promptId, role } of byBody.get(bodyId) ?? []) {
      const seen = roles.get(promptId)
      if (seen === undefined || ROLE_RANK[role] < ROLE_RANK[seen]) roles.set(promptId, role)
    }
  }
  const order = [...documentStore.promptIndex.byPrompt.keys()]
  return [...roles].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([promptId, role]) => ({ promptId, made: role === 'made' }))
})

const linkLabel = computed(() => {
  const list = linked.value
  if (list.length === 1) {
    const prompt = documentStore.raw.promptOf(list[0].promptId)
    const first = prompt?.text.split('\n').find((line) => line.trim() !== '')?.trim() ?? ''
    return { lead: list[0].made ? 'Made by' : 'Changed by', text: first }
  }
  const made = list.filter((entry) => entry.made).length
  const changed = list.length - made
  if (made === 0 || changed === 0) return { lead: `${list.length} prompts`, text: '' }
  return { lead: `Made by ${made}, changed by ${changed}`, text: '' }
})

function openLink() {
  highlight.clear()
  const ids = linked.value.map((entry) => entry.promptId)
  const only = props.bodyIds.length === 1 ? documentStore.bodies.find((body) => body.id === props.bodyIds[0]) : undefined
  promptsUi.openFor(ids, only ? only.name : `${props.bodyIds.length} parts`)
}

/** @param {PointerEvent} event */
function onLinkMove(event) {
  if (!highlight.isRealMouse(event)) return
  highlight.show({ bodyIds: drawnIdsOf(linked.value.map((entry) => entry.promptId)) })
}

/** @param {PointerEvent} event */
function onLinkLeave(event) {
  if (event.pointerType === 'mouse') highlight.clear()
}
</script>

<template>
  <button
    v-if="linked.length > 0"
    type="button"
    class="prompt-link"
    data-testid="inspector-prompt-link"
    :data-prompt-ids="linked.map((entry) => entry.promptId).join(',')"
    title="Open the request in the Prompts view"
    @click="openLink"
    @pointermove="onLinkMove"
    @pointerleave="onLinkLeave"
  >
    <span class="prompt-link__lead" data-testid="inspector-prompt-link-lead">{{ linkLabel.lead }}</span>
    <span v-if="linkLabel.text !== ''" class="prompt-link__text" data-testid="inspector-prompt-link-text">{{ linkLabel.text }}</span>
    <span class="prompt-link__chevron" aria-hidden="true">›</span>
  </button>
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
.prompt-link {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  min-height: var(--tap);
  margin: 0;
  padding: 0 2px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.prompt-link:hover {
  background: var(--surface-2);
  color: var(--text-1);
}

.prompt-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.prompt-link__lead {
  flex: 0 0 auto;
  color: var(--text-3);
}

.prompt-link__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-link__chevron {
  margin-left: auto;
  color: var(--accent);
  font-size: 15px;
}

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
