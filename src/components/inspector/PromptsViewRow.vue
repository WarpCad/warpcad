<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * One request in the Prompts view (`TODO/ui-092`, part 3).
 *
 * Collapsed, the row is one button: the request's first line (two lines at most, ellipsised),
 * how many live parts it has — **N parts**, **No parts left** when they are all gone, **No parts**
 * when it never made one — and **Reply** or **No reply**. Enter, Space, a click or a tap toggle it
 * (`aria-expanded`). Expanded, it shows the whole request, its reply with **Add reply…** (the one
 * for this request, `PromptReply.vue`), and its parts, each with its role (**Made**, **Changed**,
 * **Went into**) and **hidden** when the user hid it. Tapping a part selects it.
 *
 * It reports pointer, focus and press events up, and the view decides what is lit
 * (`usePromptHighlight`). Untrusted text — `{{ }}` only: no `v-html`, no Markdown, no links.
 *
 * **Editing** (`TODO/ui-092`, part 4), only in an expanded row and only while the project can be
 * edited (`editable`: not the read-only Watch view of an AI turn, not a History preview): **Edit
 * request** (a text area with the whole request; **Save** overwrites it, and the row then reads
 * **Edited**), **Remove request** (the record only — its parts stay), **Combine with next** on any
 * row but the last, and the reply's **Add reply…**, **Edit reply** and **Remove reply**. Each goes
 * through the document store as the local user, so it is one step on the top-bar Undo, and the
 * row updates at once. A refusal (over the 20,000-character cap, the reply full) is said in words
 * under the controls, nothing changed.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { responseTextOf } from '../../core/prompt.js'
import { useDocumentStore } from '../../stores/document.js'
import PromptReply from '../ai/PromptReply.vue'

const props = defineProps({
  /** The request, as the document hands it out. */
  prompt: { type: /** @type {import('vue').PropType<import('../../core/prompt.js').PromptRecord>} */ (Object), required: true },
  /** Its live parts, from the prompt index. */
  parts: { type: /** @type {import('vue').PropType<import('../../composables/usePromptHighlight.js').PromptPart[]>} */ (Array), required: true },
  /** With no live part: whether it ever made or changed one (**No parts left**) or not (**No parts**). */
  touchedParts: { type: Boolean, default: false },
  expanded: { type: Boolean, default: false },
  /** One of its parts is selected. */
  marked: { type: Boolean, default: false },
  /** How many of its parts are lit right now because of this row; 0 when another surface has the highlight. */
  highlighting: { type: Number, default: 0 },
  /** `TODO/ui-092`, part 4: the edit controls are offered (the project can be edited now). */
  editable: { type: Boolean, default: false },
  /** The next request's id, for **Combine with next**; `''` on the last row. */
  nextId: { type: String, default: '' },
})

const emit = defineEmits({
  toggle: () => true,
  /** A pointer moved over the row (`''`) or one of its part rows (a body id). */
  enter: (/** @type {string} */ _target, /** @type {PointerEvent} */ _event) => true,
  leave: (/** @type {string} */ _target, /** @type {PointerEvent} */ _event) => true,
  focus: (/** @type {string} */ _target) => true,
  blur: (/** @type {string} */ _target) => true,
  press: () => true,
  select: (/** @type {string} */ _bodyId) => true,
})

/** The first line with text in it. */
const firstLine = computed(() => props.prompt.text.split('\n').find((line) => line.trim() !== '')?.trim() ?? '')
const hasReply = computed(() => responseTextOf(props.prompt) !== '')
const partsLabel = computed(() => {
  const count = props.parts.length
  if (count > 0) return `${count} ${count === 1 ? 'part' : 'parts'}`
  return props.touchedParts ? 'No parts left' : 'No parts'
})
const detailId = computed(() => `prompts-detail-${props.prompt.id}`)

/** @type {Record<import('../../core/prompt.js').PromptRole, string>} */
const ROLE_LABELS = { made: 'Made', changed: 'Changed', wentInto: 'Went into' }

// --- editing (`TODO/ui-092`, part 4) ---------------------------------------

const documentStore = useDocumentStore()
const editingRequest = ref(false)
const requestDraft = ref('')
const problem = ref('')
/** @type {import('vue').Ref<HTMLTextAreaElement | null>} */
const requestField = ref(null)

/** @param {unknown} error */
function say(error) {
  problem.value = error instanceof Error ? error.message.replace(/^document\.\w+: /, '') : String(error)
}

async function openRequestEdit() {
  problem.value = ''
  requestDraft.value = props.prompt.text
  editingRequest.value = true
  await nextTick()
  requestField.value?.focus()
}

function cancelRequestEdit() {
  editingRequest.value = false
  requestDraft.value = ''
  problem.value = ''
}

function saveRequestEdit() {
  try {
    documentStore.editPromptText(props.prompt.id, requestDraft.value)
    cancelRequestEdit()
  } catch (error) {
    say(error)
  }
}

function removeRequest() {
  problem.value = ''
  try {
    documentStore.removePrompt(props.prompt.id)
  } catch (error) {
    say(error)
  }
}

function combineWithNext() {
  problem.value = ''
  try {
    documentStore.combinePrompts(props.prompt.id, props.nextId)
  } catch (error) {
    say(error)
  }
}

// Collapsing the row, or the project becoming read-only, closes the form unsaved.
watch(
  () => props.expanded && props.editable,
  (open) => {
    if (!open) cancelRequestEdit()
  },
)
</script>

<template>
  <li
    class="item"
    :class="{ 'item--expanded': expanded, 'item--marked': marked }"
    data-testid="prompts-item"
    :data-prompt-id="prompt.id"
    :data-expanded="expanded ? 'true' : 'false'"
    :data-marked="marked ? 'true' : 'false'"
    @pointermove="emit('enter', '', $event)"
    @pointerleave="emit('leave', '', $event)"
    @pointerdown="emit('press')"
  >
    <button
      type="button"
      class="row"
      data-testid="prompts-row"
      :data-prompt-id="prompt.id"
      :aria-expanded="expanded ? 'true' : 'false'"
      :aria-controls="detailId"
      @click="emit('toggle')"
      @focus="emit('focus', '')"
      @blur="emit('blur', '')"
    >
      <span class="row__text" data-testid="prompts-row-text">{{ firstLine }}</span>
      <span class="row__meta" data-testid="prompts-row-meta">
        <span data-testid="prompts-row-parts">{{ partsLabel }}</span>
        <span aria-hidden="true"> · </span>
        <span data-testid="prompts-row-reply">{{ hasReply ? 'Reply' : 'No reply' }}</span>
        <template v-if="prompt.edited">
          <span aria-hidden="true"> · </span>
          <span data-testid="prompts-row-edited">Edited</span>
        </template>
        <template v-if="marked">
          <span aria-hidden="true"> · </span>
          <span class="row__mark" data-testid="prompts-row-marked">Selected part</span>
        </template>
      </span>
      <span class="row__chevron" :class="{ 'row__chevron--open': expanded }" aria-hidden="true">▸</span>
    </button>

    <div v-if="expanded" :id="detailId" class="detail" data-testid="prompts-row-detail">
      <p v-if="highlighting > 0" class="detail__lit" role="status" data-testid="prompts-row-highlighting">
        Highlighting {{ highlighting }} {{ highlighting === 1 ? 'part' : 'parts' }}
      </p>
      <span class="detail__label">Request</span>
      <form v-if="editingRequest" class="edit" data-testid="prompts-edit-request-form" @submit.prevent="saveRequestEdit">
        <label class="detail__label" :for="`request-edit-${prompt.id}`">Edit the request</label>
        <textarea :id="`request-edit-${prompt.id}`" ref="requestField" v-model="requestDraft" class="edit__field" rows="8" data-testid="prompts-edit-request-input" />
        <div class="edit__actions">
          <button type="button" class="edit__button" data-testid="prompts-edit-request-cancel" @click="cancelRequestEdit">Cancel</button>
          <button type="submit" class="edit__button edit__button--confirm" data-testid="prompts-edit-request-save" :disabled="requestDraft.trim() === ''">Save</button>
        </div>
      </form>
      <p v-else class="detail__text" data-testid="prompts-row-full">{{ prompt.text }}</p>
      <div v-if="editable && !editingRequest" class="edit__actions edit__actions--start" data-testid="prompts-row-edits">
        <button type="button" class="edit__button" data-testid="prompts-edit-request" @click="openRequestEdit">Edit request</button>
        <button type="button" class="edit__button" data-testid="prompts-remove-request" @click="removeRequest">Remove request</button>
        <button v-if="nextId !== ''" type="button" class="edit__button" data-testid="prompts-combine-next" @click="combineWithNext">Combine with next</button>
      </div>
      <p v-if="problem !== ''" class="edit__problem" role="alert" data-testid="prompts-row-problem">{{ problem }}</p>
      <PromptReply :prompt="prompt" :edits="editable" :read-only="!editable" />
      <template v-if="parts.length > 0">
        <span class="detail__label">Parts</span>
        <ul class="parts" aria-label="Parts">
          <li v-for="part in parts" :key="part.bodyId">
            <button
              type="button"
              class="part"
              :class="{ 'part--hidden': !part.drawn }"
              data-testid="prompts-part"
              :data-body-id="part.bodyId"
              :data-role="part.role"
              :title="`Select ${part.name}`"
              @pointermove.stop="emit('enter', part.bodyId, $event)"
              @pointerleave="emit('leave', part.bodyId, $event)"
              @focus="emit('focus', part.bodyId)"
              @blur="emit('blur', part.bodyId)"
              @click="emit('select', part.bodyId)"
            >
              <span class="part__name">{{ part.name }}</span>
              <span class="part__role" data-testid="prompts-part-role">{{ ROLE_LABELS[part.role] }}</span>
              <span v-if="!part.drawn" class="part__hidden" data-testid="prompts-part-hidden">hidden</span>
            </button>
          </li>
        </ul>
      </template>
    </div>
  </li>
</template>

<style scoped>
.item {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-bottom: 1px solid var(--border);
}

.item--marked .row {
  box-shadow: inset 3px 0 0 var(--accent);
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'text chevron'
    'meta chevron';
  gap: 2px 8px;
  align-items: center;
  width: 100%;
  min-height: var(--tap);
  padding: 6px 4px 6px 8px;
  border: 0;
  background: transparent;
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.row:hover,
.item:hover > .row {
  background: var(--surface-2);
}

.row:focus-visible,
.part:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.row__text {
  grid-area: text;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.row__meta {
  grid-area: meta;
  color: var(--text-3);
  font-size: 11px;
}

.row__mark {
  color: var(--accent);
}

.row__chevron {
  grid-area: chevron;
  color: var(--text-3);
  transition: transform 0.12s ease;
}

.row__chevron--open {
  transform: rotate(90deg);
}

.detail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 2px 4px 10px 8px;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.45;
}

.detail__lit {
  margin: 0;
  color: var(--accent);
  font-size: 12px;
}

.detail__label {
  color: var(--text-3);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.detail__text {
  margin: 0;
  max-height: 40vh;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.edit__field {
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

/* Wraps rather than scrolling sideways at 390 px; each button stays a 44 px target. */
.edit__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.edit__actions--start {
  justify-content: flex-start;
  padding: 2px 0 4px;
}

.edit__button {
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

.edit__button--confirm {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.edit__button:disabled {
  opacity: 0.5;
  cursor: default;
}

.edit__button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.edit__problem {
  margin: 0;
  color: var(--danger);
}

.parts {
  margin: 0;
  padding: 0;
  list-style: none;
}

.part {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: var(--tap);
  padding: 0 4px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.part:hover {
  background: var(--surface-2);
}

.part--hidden .part__name {
  color: var(--text-3);
}

.part__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.part__role,
.part__hidden {
  flex: 0 0 auto;
  color: var(--text-3);
  font-size: 11px;
}
</style>
