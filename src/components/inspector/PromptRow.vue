<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The Inspector's **Prompt** row (`TODO/ai-031`): for a selected body a recorded prompt made or
 * changed, a compact 44 px link to the Prompts view (`TODO/ui-092`, part 3). Nothing renders for a
 * body no prompt produced, which is every body a person made by hand.
 *
 * Read from the document store's prompt index, never a lineage walk: one prompt reads **Made by**
 * or **Changed by** and its first line, then **›**; several read **Made by 1, changed by 2 ›**, or
 * **2 prompts ›** where the roles match. Several bodies selected get the same link. It opens the
 * Prompts view with that request expanded and scrolled into view, or filtered to the several. A
 * mouse over it lights the requests' parts, as a row in the view does.
 *
 * The request's full text, its reply and **Add reply…** live in the Prompts view, one per request
 * (`PromptsViewRow.vue`, `src/components/ai/PromptReply.vue`), never here (`TODO/ui-092`, part 5):
 * one Inspector row is no place to read several requests, and joining them is what showed two
 * unlabelled **Add reply…** buttons on the Fan Duct project.
 *
 * Untrusted text (it arrives from agents and from any opened file), so it is rendered with
 * `{{ }}` text interpolation only: no `v-html`, no Markdown, no link is ever made or followed.
 */
import { computed, watch } from 'vue'

import { usePromptHighlight, usePromptParts } from '../../composables/usePromptHighlight.js'
import { useDocumentStore } from '../../stores/document.js'
import { usePromptsUiStore } from '../../stores/promptsUi.js'

const props = defineProps({
  /** The selected bodies' ids (lineage roots). */
  bodyIds: { type: Array, required: true },
})

const documentStore = useDocumentStore()
const promptsUi = usePromptsUiStore()
const { drawnIdsOf } = usePromptParts()
const highlight = usePromptHighlight()

// A different selection drops a mouse highlight the old one left.
watch(
  () => props.bodyIds.join('\u0000'),
  () => highlight.clear(),
)

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
  <div v-if="linked.length > 0" class="prompt-row" data-testid="inspector-prompt">
    <button
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
  </div>
</template>

<style scoped>
.prompt-row {
  /* Like the intent line: never squeezed below its link in the scrolling Inspector column. */
  flex-shrink: 0;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.prompt-link {
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
</style>
