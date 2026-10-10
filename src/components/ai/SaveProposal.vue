<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A library Save the assistant proposed (`TODO/ai-008`). The model's `save_to_library` only
 * proposes: this card shows the name and the sizes it would expose, and nothing is written to
 * **My parts** until the user taps **Confirm** (`ai-save-confirm`). **Not now** drops it.
 *
 * Precondition: a turn that built the body landed (a discarded turn has no proposal). Feedback:
 * the card turns into "Saved to My parts" and the Library's own toast and row appear — the same
 * save the Save sheet makes. The chat pins it between the transcript and the bar, outside the
 * scrolling log, so the name and both buttons stay readable in the phone's half-height sheet;
 * every button is a 44 px target. The name is model text and is rendered as text only.
 */
import { computed } from 'vue'

/** @typedef {import('../../ai/transcript.js').SaveItem} SaveItem */

const props = defineProps({
  item: { type: /** @type {import('vue').PropType<SaveItem>} */ (Object), required: true },
  /** A turn is running: answering now would race it. */
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm', 'cancel'])

const statusLine = computed(() => {
  switch (props.item.status) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return 'Saved to My parts.'
    case 'cancelled':
      return 'Not saved.'
    case 'failed':
      return `Not saved: ${props.item.error ?? 'the save failed'}.`
    default:
      return 'Nothing is saved until you tap Confirm.'
  }
})
const open = computed(() => props.item.status === 'proposed' || props.item.status === 'failed')
</script>

<template>
  <div class="save" :data-status="item.status" data-testid="ai-save-proposal">
    <p class="save__title">
      Save <strong data-testid="ai-save-name">{{ item.name }}</strong> to My parts?
    </p>
    <p v-if="item.labels.length > 0" class="save__sizes" data-testid="ai-save-sizes">Adjustable: {{ item.labels.join(', ') }}</p>
    <div class="save__actions">
      <template v-if="open">
        <button type="button" class="save__button save__button--confirm" data-testid="ai-save-confirm" :disabled="busy" @click="emit('confirm')">
          Confirm
        </button>
        <button v-if="item.status === 'proposed'" type="button" class="save__button" data-testid="ai-save-cancel" :disabled="busy" @click="emit('cancel')">
          Not now
        </button>
      </template>
      <span class="save__status" role="status" data-testid="ai-save-status">{{ statusLine }}</span>
    </div>
  </div>
</template>

<style scoped>
.save {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--accent);
  border-left-width: 4px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.save[data-status='saved'],
.save[data-status='cancelled'] {
  border-color: var(--border);
}

.save p {
  margin: 0;
}

.save__sizes,
.save__status {
  font-size: 12px;
  color: var(--text-2);
}

.save[data-status='failed'] .save__status {
  color: var(--danger);
}

.save__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
}

.save__status {
  flex: 1 1 8em;
}

.save__button {
  min-width: var(--tap);
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

.save__button--confirm {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
}

.save__button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
