<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * Deleting a variable something still reads (`TODO/ui-059`): its consumers, listed, and two
 * actions — **Delete and keep current values** and **Cancel**. There is no plain destructive
 * delete. A centred modal at tablet/laptop width; a bottom sheet at phone width.
 */
import { onBeforeUnmount, onMounted } from 'vue'

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

/** @param {KeyboardEvent} event */
function onKey(event) {
  if (event.key !== 'Escape') return
  event.stopPropagation()
  emit('cancel')
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="usage">
    <div class="usage__backdrop" data-testid="variable-usage-backdrop" @click="emit('cancel')"></div>
    <section class="usage__panel" role="dialog" aria-modal="true" aria-labelledby="usage-title" data-testid="variable-usage-dialog">
      <h2 id="usage-title" class="usage__title">{{ name }} is still used</h2>
      <p class="usage__text">Deleting it turns each of these back into the value it has now.</p>
      <ul class="usage__list">
        <li v-for="(consumer, index) in consumers" :key="index" class="usage__row" data-testid="variable-usage-consumer">
          {{ consumer.name }}<span class="usage__what"> — {{ consumer.kind === 'condition' ? 'condition' : (consumer.path ?? 'parameter') }}</span>
        </li>
      </ul>
      <p v-if="error" class="usage__error" role="alert" data-testid="variable-usage-error">{{ error }}</p>
      <footer class="usage__footer">
        <button type="button" class="usage__btn" data-testid="variable-usage-cancel" @click="emit('cancel')">Cancel</button>
        <button type="button" class="usage__btn usage__btn--primary" data-testid="variable-usage-keep" @click="emit('keep')">Delete and keep current values</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.usage {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.usage__backdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--surface-0) 60%, transparent);
}

.usage__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(480px, 100%);
  max-height: min(80vh, 640px);
  padding: 14px 16px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md, 10px);
  background: var(--surface-1);
  color: var(--text-1);
  box-shadow: 0 12px 40px rgb(0 0 0 / 35%);
}

.usage__title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}

.usage__text {
  margin: 0;
  font-size: 12px;
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
  font-size: 13px;
}

.usage__what {
  color: var(--text-3);
}

.usage__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger, var(--text-1));
}

.usage__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.usage__btn {
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.usage__btn--primary {
  border-color: var(--accent);
}

.usage__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  .usage {
    align-items: flex-end;
    padding: 0;
  }

  .usage__panel {
    width: 100%;
    max-height: 80vh;
    border-radius: var(--radius-md, 10px) var(--radius-md, 10px) 0 0;
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }

  .usage__footer {
    flex-direction: column-reverse;
  }
}
</style>
