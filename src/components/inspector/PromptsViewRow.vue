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
 * Presentational: it reports pointer, focus and press events up, and the view decides what is lit
 * (`usePromptHighlight`). Untrusted text — `{{ }}` only: no `v-html`, no Markdown, no links.
 */
import { computed } from 'vue'

import { responseTextOf } from '../../core/prompt.js'
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
      <p class="detail__text" data-testid="prompts-row-full">{{ prompt.text }}</p>
      <PromptReply :prompt="prompt" />
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
