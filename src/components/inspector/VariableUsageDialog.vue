<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * Deleting a variable something still reads (`TODO/ui-059`): its consumers, listed, and two
 * actions — **Delete and keep current values** and **Cancel**. There is no plain destructive
 * delete. A centred modal at tablet/laptop width; a bottom sheet at phone width.
 */
import BaseButton from '../controls/BaseButton.vue'
import BaseDialog from '../layout/BaseDialog.vue'

defineProps({
  name: { type: String, required: true },
  consumers: {
    type: /** @type {import('vue').PropType<import('../../core/variables.js').VariableConsumer[]>} */ (Array),
    required: true,
  },
  /** Core's refusal from the last attempt, shown rather than swallowed. */
  error: { type: String, default: '' },
})

const emit = defineEmits(['keep', 'cancel'])

// Mounted only while open (the parent `v-if`s it), so it is open for its whole life. `BaseDialog`
// owns the backdrop, the focus trap, Escape (`escapable`) and the phone bottom sheet.
</script>

<template>
  <BaseDialog
    open
    testid="variable-usage-dialog"
    backdrop-testid="variable-usage-backdrop"
    :title="`${name} is still used`"
    placement="center"
    width="480px"
    sheet
    escapable
    @backdrop="emit('cancel')"
    @escape="emit('cancel')"
  >
    <p class="usage__text">Deleting it turns each of these back into the value it has now.</p>
    <ul class="usage__list">
      <li v-for="(consumer, index) in consumers" :key="index" class="usage__row" data-testid="variable-usage-consumer">
        {{ consumer.name }}<span class="usage__what"> — {{ consumer.kind === 'condition' ? 'condition' : (consumer.path ?? 'parameter') }}</span>
      </li>
    </ul>
    <p v-if="error" class="usage__error" role="alert" data-testid="variable-usage-error">{{ error }}</p>
    <footer class="usage__footer">
      <BaseButton data-testid="variable-usage-cancel" @click="emit('cancel')">Cancel</BaseButton>
      <BaseButton variant="primary" data-testid="variable-usage-keep" @click="emit('keep')">Delete and keep current values</BaseButton>
    </footer>
  </BaseDialog>
</template>

<style scoped>
.usage__text {
  margin: 0;
  font-size: var(--text-size-sm);
  color: var(--text-2);
}

.usage__list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.usage__row {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: var(--text-size-md);
}

.usage__what {
  color: var(--text-3);
}

.usage__error {
  margin: 0;
  font-size: var(--text-size-sm);
  color: var(--danger);
}

.usage__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .usage__footer {
    flex-direction: column-reverse;
  }
}
</style>
