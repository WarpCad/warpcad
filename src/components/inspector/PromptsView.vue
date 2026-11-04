<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The **Prompts view** (`TODO/ui-092`, part 3): every request in the project, oldest first, with
 * its reply and the parts it made. A view inside the Inspector, not a modal — the 3D view stays
 * visible and usable. At tablet and laptop width it replaces the Inspector's content, opened by
 * the **Prompts (N) ›** bar and closed by **‹ Inspector**; at phone width it is the bottom sheet's
 * third tab.
 *
 * **What is lit.** Hovering a row with a real mouse, or focusing it from the keyboard, lights every
 * live part of that request in the hover tint, each with its x-ray twin; hovering or focusing one
 * part row lights only that part. With neither, the **expanded** row stays lit and says
 * **Highlighting N parts** — the touch path, since a phone has no hover — until it collapses, the
 * view closes or this unmounts. Hidden parts light nothing (`TODO/ui-089`). The camera never moves.
 *
 * Selecting in the 3D view leaves this open and marks the rows behind the selected part; tapping a
 * part row selects that body and returns to the Inspector.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { promptTouchedParts } from '../../core/prompt.js'
import { usePromptHighlight, usePromptParts } from '../../composables/usePromptHighlight.js'
import { useDocumentStore } from '../../stores/document.js'
import { usePromptsUiStore } from '../../stores/promptsUi.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useTimelineStore } from '../../stores/timeline.js'
import PromptsViewRow from './PromptsViewRow.vue'

const documentStore = useDocumentStore()
const selection = useSelectionStore()
const ui = usePromptsUiStore()
const timeline = useTimelineStore()
const { partsOf } = usePromptParts()
const highlight = usePromptHighlight()

/** @type {import('vue').Ref<HTMLElement | null>} */
const root = ref(null)

/** Every request, oldest first, with what its row shows. */
const rows = computed(() => {
  void documentStore.version // `raw` is deliberately non-reactive
  const raw = documentStore.raw
  const selected = new Set(selection.ids)
  return raw.prompts().map((prompt) => {
    const parts = partsOf(prompt.id)
    return {
      prompt,
      parts,
      drawn: parts.filter((part) => part.drawn).map((part) => part.bodyId),
      touchedParts: parts.length > 0 || promptTouchedParts(raw, prompt),
      marked: parts.some((part) => selected.has(part.bodyId)),
    }
  })
})
const shown = computed(() => {
  const only = ui.filterIds
  if (only === null) return rows.value
  return rows.value.filter((row) => only.includes(row.prompt.id))
})

/**
 * `TODO/ui-092`, part 4: the edit controls are offered only while the project can be edited — not
 * while the viewport previews something else (the read-only Watch of an AI turn, a History step,
 * a shared view), when Undo is off too.
 */
const editable = computed(() => !timeline.previewing)

/**
 * The request **Combine with next** would fold in: the next one in the project, and only when it
 * is shown too (a filtered list never combines with a row the person cannot see).
 *
 * @param {string} promptId
 * @returns {string} `''` for none.
 */
function nextIdOf(promptId) {
  const at = rows.value.findIndex((row) => row.prompt.id === promptId)
  const next = rows.value[at + 1]?.prompt.id ?? ''
  return next !== '' && shown.value.some((row) => row.prompt.id === next) ? next : ''
}

// --- what is lit ---------------------------------------------------------

const pointerPrompt = ref('')
const focusPrompt = ref('')
const pointerBody = ref('')
const focusBody = ref('')

/** The request lit as a whole right now, or `''` — hover and focus win over an expansion. */
const litPrompt = computed(() => (pointerBody.value || focusBody.value ? '' : pointerPrompt.value || focusPrompt.value || ui.expandedId))
const litBody = computed(() => pointerBody.value || focusBody.value)

/** @type {import('vue').ComputedRef<import('../../composables/usePromptHighlight.js').PromptHighlight>} */
const want = computed(() => {
  const bodyId = litBody.value
  if (bodyId) {
    const part = rows.value.flatMap((row) => row.parts).find((candidate) => candidate.bodyId === bodyId)
    return part?.drawn ? { bodyId } : null
  }
  const row = rows.value.find((candidate) => candidate.prompt.id === litPrompt.value)
  return row && row.drawn.length > 0 ? { bodyIds: row.drawn } : null
})
watch(want, (next) => highlight.show(next), { immediate: true })

/** @param {{ prompt: { id: string }, parts: { bodyId: string, drawn: boolean }[], drawn: string[] }} row */
function highlightingOf(row) {
  if (litPrompt.value === row.prompt.id) return row.drawn.length
  const part = row.parts.find((candidate) => candidate.bodyId === litBody.value)
  return part?.drawn ? 1 : 0
}

/**
 * @param {string} promptId
 * @param {string} target `''` for the row, or a part's body id.
 * @param {PointerEvent} event
 */
function onEnter(promptId, target, event) {
  if (!highlight.isRealMouse(event)) return
  if (target === '') {
    if (pointerPrompt.value !== promptId) pointerPrompt.value = promptId
    if (pointerBody.value !== '') pointerBody.value = ''
  } else if (pointerBody.value !== target) {
    pointerBody.value = target
  }
}

/**
 * @param {string} promptId
 * @param {string} target
 * @param {PointerEvent} event
 */
function onLeave(promptId, target, event) {
  if (event.pointerType !== 'mouse') return
  if (target === '') {
    if (pointerPrompt.value === promptId) pointerPrompt.value = ''
    pointerBody.value = ''
  } else if (pointerBody.value === target) {
    pointerBody.value = ''
  }
}

/** @param {string} promptId @param {string} target */
function onFocus(promptId, target) {
  if (!highlight.isKeyboardFocus()) return
  if (target === '') focusPrompt.value = promptId
  else focusBody.value = target
}

/** @param {string} promptId @param {string} target */
function onBlur(promptId, target) {
  if (target === '' && focusPrompt.value === promptId) focusPrompt.value = ''
  if (target !== '' && focusBody.value === target) focusBody.value = ''
}

/** Tapping a part row: select that body and go back to the Inspector, where its feedback is. */
function onSelect(/** @type {string} */ bodyId) {
  selection.select(bodyId)
  ui.close()
}

// A link asked for one row: bring it into view once it is rendered.
watch(
  () => ui.revealId,
  async (promptId) => {
    if (!promptId) return
    await nextTick()
    const item = root.value?.querySelector(`[data-testid="prompts-item"][data-prompt-id="${CSS.escape(promptId)}"]`)
    if (item && typeof item.scrollIntoView === 'function') item.scrollIntoView({ block: 'nearest' })
    ui.revealId = ''
  },
  { immediate: true },
)
</script>

<template>
  <section ref="root" class="prompts-view" data-testid="prompts-view" aria-label="Prompts">
    <div class="prompts-view__head">
      <button type="button" class="prompts-view__back" data-testid="prompts-view-back" @click="ui.close()">‹ Inspector</button>
      <h3 class="prompts-view__title">Prompts ({{ rows.length }})</h3>
    </div>
    <p v-if="ui.filterIds !== null" class="prompts-view__filter" data-testid="prompts-view-filter">
      <span>For {{ ui.filterLabel }}</span>
      <span aria-hidden="true">·</span>
      <button type="button" class="prompts-view__show-all" data-testid="prompts-view-show-all" @click="ui.showAll()">Show all</button>
    </p>
    <ol class="prompts-view__list">
      <PromptsViewRow
        v-for="row in shown"
        :key="row.prompt.id"
        :prompt="row.prompt"
        :parts="row.parts"
        :touched-parts="row.touchedParts"
        :expanded="ui.expandedId === row.prompt.id"
        :marked="row.marked"
        :highlighting="highlightingOf(row)"
        :editable="editable"
        :next-id="nextIdOf(row.prompt.id)"
        @toggle="ui.toggle(row.prompt.id)"
        @enter="(target, event) => onEnter(row.prompt.id, target, event)"
        @leave="(target, event) => onLeave(row.prompt.id, target, event)"
        @focus="(target) => onFocus(row.prompt.id, target)"
        @blur="(target) => onBlur(row.prompt.id, target)"
        @press="highlight.notePress()"
        @select="onSelect"
      />
    </ol>
  </section>
</template>

<style scoped>
.prompts-view {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex-shrink: 0;
}

.prompts-view__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--tap);
  border-bottom: 1px solid var(--border);
}

.prompts-view__back {
  min-height: var(--tap);
  padding: 0 8px 0 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.prompts-view__title {
  margin: 0;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.prompts-view__filter {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  min-width: 0;
  color: var(--text-2);
  font-size: 12px;
}

.prompts-view__filter > span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompts-view__show-all {
  flex: 0 0 auto;
  min-height: var(--tap);
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.prompts-view__back:focus-visible,
.prompts-view__show-all:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.prompts-view__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Phone: the sheet's tabs name the view and switch back, so no back button or title line. */
@media (max-width: 640px) {
  .prompts-view__head {
    display: none;
  }
}
</style>
