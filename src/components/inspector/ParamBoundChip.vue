<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * A bound field's chip (`TODO/ui-059`), in place of the editor: the variable's name, its
 * current value read-only beside it, and a menu with **Edit variable** (scroll the
 * Variables section to that row) and **Unbind** (rewrite the field to its current literal —
 * nothing jumps). A binding that cannot resolve shows core's reason in an error state
 * rather than a silent literal.
 */
import { ref } from 'vue'

defineProps({
  /** The test-id suffix: the param key (and component), e.g. `model`, `size-x`. */
  id: { type: String, required: true },
  name: { type: String, required: true },
  /** The resolved value, as text. */
  shown: { type: String, default: '' },
  /** Core's reason this binding cannot resolve, when it cannot. */
  problem: { type: String, default: '' },
})

const emit = defineEmits(['edit', 'unbind'])
const menu = ref(false)
</script>

<template>
  <div class="chip" :data-broken="problem ? 'true' : 'false'" :data-testid="`param-chip-${id}`" :data-variable="name">
    <button type="button" class="chip__name" :aria-expanded="menu" :aria-label="`Variable ${name}`" data-testid="param-chip-toggle" @click="menu = !menu">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path d="M6.5 9.5l3-3M5 8L3.5 9.5a2.1 2.1 0 003 3L8 11M11 8l1.5-1.5a2.1 2.1 0 00-3-3L8 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
      </svg>
      <span class="chip__text">{{ name }}</span>
    </button>
    <span v-if="!problem" class="chip__value" data-testid="param-chip-value">{{ shown }}</span>
    <p v-if="problem" class="chip__error" role="alert" data-testid="param-chip-error">Variable {{ problem }}</p>
    <div v-if="menu" class="chip__menu" data-testid="param-chip-menu">
      <p class="chip__full">{{ name }}</p>
      <button type="button" class="chip__item" data-testid="param-chip-edit" :disabled="Boolean(problem)" @click="menu = false; emit('edit')">Edit variable</button>
      <button type="button" class="chip__item" data-testid="param-chip-unbind" @click="menu = false; emit('unbind')">Unbind</button>
    </div>
  </div>
</template>

<style scoped>
.chip {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.chip__name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--accent);
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
}

.chip__name:focus-visible,
.chip__item:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.chip__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip__value {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.chip[data-broken='true'] .chip__name {
  border-style: dashed;
  border-color: var(--danger, var(--border-strong));
}

.chip__error {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: var(--danger, var(--text-1));
}

.chip__menu {
  display: flex;
  flex-basis: 100%;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.chip__full {
  margin: 0;
  font-size: 12px;
  color: var(--text-3);
  overflow-wrap: anywhere;
}

.chip__item {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.chip__item:disabled {
  color: var(--text-3);
  cursor: default;
}
</style>
