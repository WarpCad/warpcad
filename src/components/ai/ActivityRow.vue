<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * One tool call in the chat (`TODO/ai-006`): a compact row — what the assistant did, and how it
 * came out. Tapping it selects the body it made or changed, so the viewport answers the chat;
 * the tap is inert (and the row says so to assistive tech) until that body is actually on
 * screen — a call in the turn still running, or in a discarded turn, has nothing to select.
 *
 * An **error** row is a different shape, not only a different colour: a ✕ glyph, the tool's
 * own reason, and a "Then:" line saying what the assistant did next, so a failure is never a
 * dead end. Text only — a tool's reason can quote project text, so nothing here is markup.
 *
 * A **check** row (`TODO/ai-007`: `measure`, `check_printability`, `check_clearance`,
 * `capture_view`) adds its numbers on a second line, and a failed check — a problem found, two
 * bodies interpenetrating — is a different shape again: a ⚠ glyph and a dashed coloured edge.
 * A capture adds the picture the model saw as a thumbnail; tapping it opens it full width in
 * place (and tapping again folds it), so the human can see exactly what the model looked at.
 * The image is a `data:` URL the app made itself — never a remote resource.
 */
import { computed, ref } from 'vue'

const props = defineProps({
  item: { type: /** @type {import('vue').PropType<import('../../ai/transcript.js').ToolItem>} */ (Object), required: true },
  /** What the assistant did right after this row (error rows only). */
  next: { type: String, default: '' },
  /** Whether tapping can select something right now. */
  selectable: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

const glyph = computed(() => {
  if (props.item.status === 'running') return '…'
  if (props.item.status === 'error') return '✕'
  if (props.item.status === 'discarded') return '↺'
  if (props.item.check === 'fail') return '⚠'
  return '✓'
})

/** The thumbnail opened full width. */
const expanded = ref(false)

const result = computed(() => {
  if (props.item.status === 'running') return 'working'
  if (props.item.status === 'error') return props.item.error ?? 'failed'
  if (props.item.status === 'discarded') return 'not kept'
  return ''
})
</script>

<template>
  <div class="activity">
    <button
      type="button"
      class="row"
      :class="[`row--${item.status}`, item.check ? `row--check-${item.check}` : '']"
      :disabled="!selectable"
      :data-testid="`ai-activity-${item.id}`"
      :data-status="item.status"
      :data-check="item.check ?? ''"
      :aria-label="selectable ? `${item.label} — select it` : item.check === 'fail' ? `${item.label} — found a problem` : item.label"
      @click="emit('select', item.bodyIds)"
    >
      <span class="row__glyph" aria-hidden="true">{{ glyph }}</span>
      <span class="row__body">
        <span class="row__label" data-testid="ai-activity-label">{{ item.label }}</span>
        <span v-if="result" class="row__result" data-testid="ai-activity-result">{{ result }}</span>
        <span v-if="item.summary && item.status === 'ok'" class="row__summary" data-testid="ai-activity-summary">{{ item.summary }}</span>
        <span v-if="item.status === 'error' && next" class="row__next" data-testid="ai-activity-next">Then: {{ next }}</span>
      </span>
    </button>
    <button
      v-if="item.thumbnail"
      type="button"
      class="shot"
      :class="{ 'shot--open': expanded }"
      data-testid="ai-activity-thumbnail"
      :aria-expanded="expanded ? 'true' : 'false'"
      :aria-label="expanded ? 'Fold the picture the assistant captured' : 'Open the picture the assistant captured'"
      @click="expanded = !expanded"
    >
      <img class="shot__img" :src="item.thumbnail" alt="What the assistant saw" data-testid="ai-activity-thumbnail-img" />
    </button>
  </div>
</template>

<style scoped>
.activity {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-height: var(--tap);
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.row:disabled {
  cursor: default;
  opacity: 1;
}

.row__glyph {
  flex: none;
  width: 16px;
  padding-top: 2px;
  text-align: center;
  color: var(--text-2);
}

.row__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.row__result,
.row__summary,
.row__next {
  font-size: 12px;
  color: var(--text-2);
}

/* Error rows differ in shape (✕, a coloured edge, the reason and what came next), not in colour alone. */
.row--error {
  border-color: var(--danger);
  border-left-width: 4px;
}

.row--error .row__glyph,
.row--error .row__result {
  color: var(--danger);
}

.row--discarded {
  border-style: dashed;
  color: var(--text-2);
}

/* A failed check differs in shape too: ⚠, a dashed coloured edge. */
.row--check-fail {
  border-color: var(--danger);
  border-left-width: 4px;
  border-left-style: dashed;
}

.row--check-fail .row__glyph,
.row--check-fail .row__summary {
  color: var(--danger);
}

.shot {
  align-self: flex-start;
  min-width: var(--tap);
  min-height: var(--tap);
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  cursor: zoom-in;
  touch-action: manipulation;
}

.shot__img {
  display: block;
  width: 120px;
  height: auto;
}

.shot--open {
  align-self: stretch;
  cursor: zoom-out;
}

.shot--open .shot__img {
  width: 100%;
}
</style>
