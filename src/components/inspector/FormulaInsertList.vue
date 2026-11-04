<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * What **Insert…** beside a formula box opens (`TODO/FIND-core-078`): every body, then its parts
 * — hidden ones too, marked, because a hidden cut volume is often the thing being measured —
 * then the quantity. The reference it builds (`composables/formulaInsert.js`) is handed to the
 * box to put at the caret, so nobody has to know the syntax or type `[` on a phone.
 *
 * Tap-driven, no hover. At phone width it is a bottom sheet of its own, like the bind list; wider,
 * it opens inline under the box. It lists bodies whatever is selected. Names are text
 * interpolation only, never markup.
 */
import { computed, ref } from 'vue'

import { FORMULA_QUANTITY_CHOICES, formulaInsertBodies, formulaReferenceText } from '../../composables/formulaInsert.js'
import { useDocumentStore } from '../../stores/document.js'

const emit = defineEmits(['insert', 'close'])

const documentStore = useDocumentStore()

const bodies = computed(() => formulaInsertBodies(documentStore.bodies))
const bodyId = ref('')
/** `undefined` while the part is still to choose; `null` for the whole body. */
const part = ref(/** @type {string | null | undefined} */ (undefined))

const body = computed(() => bodies.value.find((candidate) => candidate.id === bodyId.value))
const stage = computed(() => (body.value === undefined ? 'body' : part.value === undefined ? 'part' : 'quantity'))

const title = computed(() => {
  if (stage.value === 'body') return 'Measure which body?'
  if (stage.value === 'part') return `Which part of ${body.value?.name ?? ''}?`
  return `Which size of ${part.value === null ? body.value?.name : `${body.value?.name} ▸ ${part.value}`}?`
})

/** @param {string} id */
function chooseBody(id) {
  bodyId.value = id
  const chosen = bodies.value.find((candidate) => candidate.id === id)
  // A body with no named parts has only its whole self to measure.
  part.value = chosen !== undefined && chosen.parts.length === 0 ? null : undefined
}

function back() {
  if (stage.value === 'quantity' && (body.value?.parts.length ?? 0) > 0) part.value = undefined
  else bodyId.value = ''
}

/** @param {string} quantity */
function choose(quantity) {
  const chosen = body.value
  if (chosen === undefined || part.value === undefined) return
  emit('insert', formulaReferenceText(chosen, part.value, quantity))
}
</script>

<template>
  <div class="finsert" role="group" :aria-label="title" data-testid="formula-insert-list" :data-stage="stage">
    <div class="finsert__head">
      <button v-if="stage !== 'body'" type="button" class="finsert__btn finsert__btn--small" data-testid="formula-insert-back" @click="back">‹ Back</button>
      <p class="finsert__title">{{ title }}</p>
      <button type="button" class="finsert__btn finsert__btn--small" data-testid="formula-insert-close" @click="emit('close')">Close</button>
    </div>
    <ul v-if="stage === 'body'" class="finsert__list">
      <li v-for="entry in bodies" :key="entry.id">
        <button type="button" class="finsert__btn" :data-testid="`formula-insert-body-${entry.id}`" @click="chooseBody(entry.id)">
          {{ entry.name }}<span v-if="entry.shared" class="finsert__hint">#{{ entry.id }}</span>
        </button>
      </li>
      <li v-if="bodies.length === 0" class="finsert__empty" data-testid="formula-insert-empty">No bodies yet. Place one first, then measure it here.</li>
    </ul>
    <ul v-else-if="stage === 'part'" class="finsert__list">
      <li><button type="button" class="finsert__btn" data-testid="formula-insert-part-whole" @click="part = null">The whole {{ body?.name }}</button></li>
      <li v-for="entry in body?.parts" :key="entry.name">
        <button type="button" class="finsert__btn" :data-testid="`formula-insert-part-${entry.name}`" @click="part = entry.name">
          {{ entry.name }}<span v-if="entry.hidden" class="finsert__hint">hidden</span>
        </button>
      </li>
    </ul>
    <ul v-else class="finsert__list finsert__list--grid">
      <li v-for="choice in FORMULA_QUANTITY_CHOICES" :key="choice.key">
        <button type="button" class="finsert__btn" :data-testid="`formula-insert-quantity-${choice.key}`" @click="choose(choice.quantity)">
          {{ choice.label }}<span class="finsert__code">.{{ choice.quantity }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.finsert {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.finsert__head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.finsert__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.finsert__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.finsert__list--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}

.finsert__btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font: inherit;
  font-size: 13px;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
  touch-action: manipulation;
}

.finsert__btn--small {
  width: auto;
  flex: none;
}

.finsert__btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.finsert__hint,
.finsert__code {
  flex: none;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.finsert__empty {
  font-size: 12px;
  color: var(--text-3);
}

@media (max-width: 640px) {
  .finsert {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 45;
    max-height: 60vh;
    overflow-y: auto;
    padding-bottom: max(8px, env(safe-area-inset-bottom));
    border-radius: var(--radius-md, 10px) var(--radius-md, 10px) 0 0;
    box-shadow: var(--shadow-overlay);
  }
}
</style>
