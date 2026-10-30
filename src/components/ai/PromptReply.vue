<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The reply saved under one prompt (`TODO/ai-032`), shown below the request in the Inspector's
 * **Prompt** row: what the agent said back — headline numbers, deviations, a **Problems met**
 * section — collapsed to a few lines, with **Show all** to read the rest.
 *
 * **Add reply…** (decision 4) is how a reply reaches a prompt after the fact (the Fan Duct file):
 * it opens a text area; **Add** appends the text as one segment through the document store as
 * the local user, so it is one undo step (`Add reply`) and Undo takes it back. A refusal (empty,
 * or the reply already at its 20,000-character cap) is said under the text area, nothing changed.
 *
 * Untrusted text — it arrives from agents and from any opened file — so it is rendered with
 * `{{ }}` interpolation only: no `v-html`, no Markdown, no link made or followed.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { responseTextOf } from '../../core/prompt.js'
import { useDocumentStore } from '../../stores/document.js'

const props = defineProps({
  /** The prompt, as `promptsForBody` hands it out. */
  prompt: { type: /** @type {import('vue').PropType<import('../../core/prompt.js').PromptRecord>} */ (Object), required: true },
})

const documentStore = useDocumentStore()
const expanded = ref(false)
const adding = ref(false)
const draft = ref('')
const problem = ref('')
/** @type {import('vue').Ref<HTMLTextAreaElement | null>} */
const field = ref(null)

const reply = computed(() => responseTextOf(props.prompt))
/** Long enough that the collapsed view (four lines) hides some of it. */
const long = computed(() => reply.value.length > 240 || reply.value.split('\n').length > 4)

async function open() {
  adding.value = true
  problem.value = ''
  await nextTick()
  field.value?.focus()
}

function cancel() {
  adding.value = false
  draft.value = ''
  problem.value = ''
}

function add() {
  try {
    documentStore.addPromptResponse(props.prompt.id, draft.value)
    cancel()
  } catch (error) {
    problem.value = error instanceof Error ? error.message.replace(/^document\.\w+: /, '') : String(error)
  }
}

// A different prompt starts collapsed, with no form open.
watch(
  () => props.prompt.id,
  () => {
    expanded.value = false
    cancel()
  },
)
</script>

<template>
  <div class="reply" data-testid="prompt-reply" :data-prompt-id="prompt.id">
    <template v-if="reply !== ''">
      <span class="reply__label">Reply</span>
      <p class="reply__text" :class="{ 'reply__text--collapsed': !expanded }" data-testid="prompt-reply-text">{{ reply }}</p>
      <button v-if="long" type="button" class="reply__toggle" data-testid="prompt-reply-toggle" :aria-expanded="expanded ? 'true' : 'false'" @click="expanded = !expanded">
        {{ expanded ? 'Show less' : 'Show all' }}
      </button>
    </template>
    <button v-if="!adding" type="button" class="reply__add" data-testid="prompt-reply-add" @click="open">Add reply…</button>
    <form v-else class="reply__form" data-testid="prompt-reply-form" @submit.prevent="add">
      <label class="reply__label" :for="`reply-${prompt.id}`">Paste the agent's reply</label>
      <textarea :id="`reply-${prompt.id}`" ref="field" v-model="draft" class="reply__field" rows="6" data-testid="prompt-reply-input" />
      <p v-if="problem !== ''" class="reply__problem" role="alert" data-testid="prompt-reply-problem">{{ problem }}</p>
      <div class="reply__actions">
        <button type="button" class="reply__button" data-testid="prompt-reply-cancel" @click="cancel">Cancel</button>
        <button type="submit" class="reply__button reply__button--confirm" data-testid="prompt-reply-submit" :disabled="draft.trim() === ''">Add</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.reply {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 0 0 6px;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.45;
}

.reply__label {
  color: var(--text-3);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.reply__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 40vh;
  overflow-y: auto;
}

.reply__text--collapsed {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  overflow: hidden;
}

.reply__toggle {
  align-self: flex-start;
  min-height: var(--tap);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.reply__add,
.reply__button {
  min-height: var(--tap);
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  touch-action: manipulation;
}

/* Full-width: a phone-sized tap target in the Inspector column. */
.reply__add {
  width: 100%;
}

.reply__form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.reply__field {
  box-sizing: border-box;
  width: 100%;
  min-height: 8em;
  padding: 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  font-size: 16px; /* 16px: iOS Safari does not zoom the page on focus. */
  resize: vertical;
}

.reply__problem {
  margin: 0;
  color: var(--danger);
}

.reply__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.reply__button--confirm {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.reply__button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
