<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The inline editor behind a variable row's **⋯ → Edit label and description…** (`TODO/ui-157`):
 * a one-line Label and a multi-line Description, **Save** and **Cancel**. Enter in the label saves
 * and Escape cancels. A label over the new write limit is refused here, under the field, with a
 * pointer to Description; core's own reason (`describeVariable`) is the backstop and is shown the
 * same way. It sends only what changed, so an unchanged old 80-character label is never re-judged.
 */
import { ref } from 'vue'

import { VARIABLE_LIMITS } from '../../core/variables.js'
import BaseButton from '../controls/BaseButton.vue'

const props = defineProps({
  name: { type: String, required: true },
  label: { type: String, default: '' },
  description: { type: String, default: '' },
})

/** `save(patch, fail, done)`: the panel runs the command, then calls `done` or `fail(text)`. */
const emit = defineEmits(['save', 'cancel'])

const label = ref(props.label)
const description = ref(props.description)
const error = ref('')

function save() {
  const nextLabel = label.value.trim()
  const nextDescription = description.value.trim()
  if (nextLabel !== props.label && nextLabel.length > VARIABLE_LIMITS.maxNewLabelLength) {
    error.value = `A label is at most ${VARIABLE_LIMITS.maxNewLabelLength} characters (this one is ${nextLabel.length}). Put the explanation in Description.`
    return
  }
  /** @type {{ label?: string, description?: string }} */
  const patch = {}
  if (nextLabel !== props.label) patch.label = nextLabel
  if (nextDescription !== props.description) patch.description = nextDescription
  if (Object.keys(patch).length === 0) {
    emit('cancel')
    return
  }
  emit(
    'save',
    patch,
    (/** @type {string} */ text) => {
      error.value = text
    },
    () => emit('cancel'),
  )
}
</script>

<template>
  <form class="vdesc" :data-testid="`variable-describe-form-${name}`" @submit.prevent="save" @keydown.escape.stop="emit('cancel')">
    <label class="vdesc__field">Label
      <input v-model="label" class="vdesc__input" type="text" autocomplete="off" :aria-label="`Label for ${name}`" :data-testid="`variable-label-input-${name}`" @keydown.enter.prevent="save" />
    </label>
    <label class="vdesc__field">Description
      <textarea v-model="description" class="vdesc__input vdesc__text" rows="3" :maxlength="VARIABLE_LIMITS.maxDescriptionLength" :aria-label="`Description for ${name}`" :data-testid="`variable-description-input-${name}`" />
    </label>
    <p v-if="error" class="vdesc__error" role="alert" :data-testid="`variable-describe-error-${name}`">{{ error }}</p>
    <div class="vdesc__actions">
      <BaseButton type="submit" variant="primary" narrow :data-testid="`variable-describe-save-${name}`">Save</BaseButton>
      <BaseButton narrow :data-testid="`variable-describe-cancel-${name}`" @click="emit('cancel')">Cancel</BaseButton>
    </div>
  </form>
</template>

<style scoped>
.vdesc {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.vdesc__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-size-xs);
  color: var(--text-3);
}

.vdesc__input {
  min-height: 44px;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: var(--text-size-md);
}

.vdesc__text {
  resize: vertical;
}

.vdesc__input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.vdesc__error {
  margin: 0;
  font-size: var(--text-size-sm);
  color: var(--danger);
}

.vdesc__actions {
  display: flex;
  gap: var(--space-3);
}
</style>
