<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * What **Insert…** beside a formula box opens (`TODO/FIND-core-078`): every body, then its parts
 * — hidden ones too, marked, because a hidden cut volume is often the thing being measured —
 * then the quantity. The reference it builds (`composables/formulaInsert.js`) is handed to the
 * box to put at the caret, so nobody has to know the syntax or type `[` on a phone.
 *
 * Tap-driven, no hover. At phone width it is a non-modal `BaseSheet`, like the bind list (`TODO/ui-116`); wider,
 * it opens inline under the box. It lists bodies whatever is selected. Names are text
 * interpolation only, never markup.
 */
import { computed, ref } from 'vue'

import { FORMULA_QUANTITY_CHOICES, formulaInsertBodies, formulaReferenceText } from '../../composables/formulaInsert.js'
import { useMediaQuery } from '../../composables/useMediaQuery.js'
import BaseButton from '../controls/BaseButton.vue'
import BaseSheet from '../layout/BaseSheet.vue'
import { useDocumentStore } from '../../stores/document.js'

const emit = defineEmits(['insert', 'close'])

const documentStore = useDocumentStore()

/** At phone width the list is a non-modal `BaseSheet` (`TODO/ui-116`); wider it is the inline box. */
const isPhone = useMediaQuery('(max-width: 640px)')

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

const frame = computed(() => (isPhone.value ? BaseSheet : 'div'))
const frameProps = computed(() =>
  isPhone.value
    ? { open: true, testid: 'formula-insert-list', title: title.value, tier: 'popover', 'data-stage': stage.value, onEscape: () => emit('close') }
    : { 'data-testid': 'formula-insert-list', role: 'group', 'aria-label': title.value, 'data-stage': stage.value, class: 'finsert--inline' },
)

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
  <component :is="frame" v-bind="frameProps" class="finsert">
    <div class="finsert__head">
      <BaseButton v-if="stage !== 'body'" size="compact" class="finsert__small" data-testid="formula-insert-back" @click="back">‹ Back</BaseButton>
      <p class="finsert__title">{{ title }}</p>
      <BaseButton size="compact" class="finsert__small" data-testid="formula-insert-close" @click="emit('close')">Close</BaseButton>
    </div>
    <ul v-if="stage === 'body'" class="finsert__list">
      <li v-for="entry in bodies" :key="entry.id">
        <BaseButton align="start" class="finsert__btn" :data-testid="`formula-insert-body-${entry.id}`" @click="chooseBody(entry.id)">
          {{ entry.name }}<span v-if="entry.shared" class="finsert__hint">#{{ entry.id }}</span>
        </BaseButton>
      </li>
      <li v-if="bodies.length === 0" class="finsert__empty" data-testid="formula-insert-empty">No bodies yet. Place one first, then measure it here.</li>
    </ul>
    <ul v-else-if="stage === 'part'" class="finsert__list">
      <li><BaseButton align="start" class="finsert__btn" data-testid="formula-insert-part-whole" @click="part = null">The whole {{ body?.name }}</BaseButton></li>
      <li v-for="entry in body?.parts" :key="entry.name">
        <BaseButton align="start" class="finsert__btn" :data-testid="`formula-insert-part-${entry.name}`" @click="part = entry.name">
          {{ entry.name }}<span v-if="entry.hidden" class="finsert__hint">hidden</span>
        </BaseButton>
      </li>
    </ul>
    <ul v-else class="finsert__list finsert__list--grid">
      <li v-for="choice in FORMULA_QUANTITY_CHOICES" :key="choice.key">
        <BaseButton align="start" class="finsert__btn" :data-testid="`formula-insert-quantity-${choice.key}`" @click="choose(choice.quantity)">
          {{ choice.label }}<span class="finsert__code">.{{ choice.quantity }}</span>
        </BaseButton>
      </li>
    </ul>
  </component>
</template>

<style scoped>
.finsert {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* The inline box under the formula; the phone sheet's frame is `BaseSheet`'s. */
.finsert--inline {
  padding: 8px;
  border: 1px solid var(--border-strong);
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
  font-size: var(--text-size-sm);
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

/* Layout only: an option row spaces its label and hint apart and fills the list's width. */
.finsert__btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  overflow-wrap: anywhere;
}

.finsert__small {
  flex: none;
}

.finsert__hint,
.finsert__code {
  flex: none;
  font-family: var(--font-mono);
  font-size: var(--text-size-xs);
  color: var(--text-3);
}

.finsert__empty {
  font-size: var(--text-size-sm);
  color: var(--text-3);
}
</style>
