<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
import PopoverGrip from './PopoverGrip.vue'

/**
 * What **⊞ Group** asks when a selected body has named parts (`TODO/core-076`): which bodies merge
 * their parts, under what prefix, and which stay hidden. `OperationsToolbar.vue` owns the button,
 * the backdrop and Escape; this owns everything inside. With no parts anywhere, Group stays one
 * click and this never opens.
 *
 * Everything shown is read off `planGroupMerge` (`core/groupMerge.js`), which the AI `operate` tool
 * also writes through. It has no side effects, so it runs on open and on every keystroke, and the
 * preview, the collision error and the record can never disagree. This component holds only what
 * the person changed; a prefix they have not touched is the planner's suggestion, which is how two
 * Pis open with `Raspberry Pi 2-` already filled in and commit enabled.
 *
 * Rows stay in selection order even when unticking one moves the target, so nothing jumps under
 * a finger. The list scrolls inside the popover and stays short enough to leave commit reachable
 * above a phone's on-screen keyboard.
 *
 * @module components/viewport/GroupMergePopover
 */
import { computed, reactive, toRaw } from 'vue'

import HelpButton from '../controls/HelpButton.vue'

import { useSelectedOperands } from '../../composables/useSelectedBody.js'
import { applyViewHides, planGroupMerge } from '../../core/groupMerge.js'
import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

const emit = defineEmits(['close'])

const documentStore = useDocumentStore()
const selection = useSelectionStore()
const selectedOperands = useSelectedOperands()

/**
 * What the person changed, by body. A row with no entry takes the planner's defaults.
 *
 * @type {Record<string, import('../../core/groupMerge.js').GroupMergeChoice>}
 */
const choices = reactive({})

const operands = computed(() =>
  selectedOperands.value.map((operand) => ({ id: operand.rootId, terminal: operand.terminalId, name: operand.name })),
)

const plan = computed(() => {
  void documentStore.version
  return planGroupMerge(
    toRaw(documentStore.raw),
    operands.value,
    operands.value.map((operand) => choices[operand.id]),
  )
})

/** A kernel refusal at commit, which the plan could not foresee. Cleared by the next edit. */
const commitError = reactive({ message: /** @type {string | null} */ (null) })

const errorText = computed(() => plan.value.errors[0] ?? commitError.message)
const canCommit = computed(() => plan.value.record !== null)

/**
 * @param {string} id
 * @param {import('../../core/groupMerge.js').GroupMergeChoice} change
 */
function choose(id, change) {
  commitError.message = null
  choices[id] = { ...choices[id], ...change }
}

/** @param {Event} event */
const checkedOf = (event) => /** @type {HTMLInputElement} */ (event.target).checked
/** @param {Event} event */
const valueOf = (event) => /** @type {HTMLInputElement} */ (event.target).value

/**
 * The row's summary line.
 *
 * @param {import('../../core/groupMerge.js').GroupMergeRow} row
 * @returns {string}
 */
function summaryOf(row) {
  if (!row.hasParts) return `${row.name} · 1 part`
  if (!row.merges) return `${row.name} · one part`
  const parts = `${row.name} · ${row.partCount} ${row.partCount === 1 ? 'part' : 'parts'}`
  return row.isTarget ? `${parts} · keeps its names` : parts
}

/** Write the plan: the record, then the hides under the new body, then select the result. */
function commit() {
  const current = plan.value
  if (current.record === null) return
  const raw = documentStore.raw
  const id = raw.nextId('group')
  try {
    documentStore.append(/** @type {import('../../core/kernel/registry.js').OpRecord} */ ({ id, ...current.record }), { origin: 'local' })
  } catch (error) {
    commitError.message = error instanceof Error ? error.message : String(error)
    return
  }
  if (current.viewHides.length > 0) {
    applyViewHides(raw, id, current.viewHides, { origin: 'local' })
    documentStore.refresh()
  }
  selection.select(id)
  emit('close')
}
</script>

<template>
  <div class="group-merge" data-testid="group-merge-popover">
    <PopoverGrip />
    <p class="group-merge__title">Group {{ plan.rows.length }} objects</p>

    <ul class="group-merge__rows" data-testid="group-merge-rows">
      <li
        v-for="(row, index) in plan.rows"
        :key="row.id"
        class="group-merge__row"
        :data-testid="`group-merge-row-${index}`"
        :data-target="row.isTarget ? 'true' : 'false'"
      >
        <p class="group-merge__summary" :data-testid="`group-merge-summary-${index}`">{{ summaryOf(row) }}</p>

        <label v-if="row.hasParts" class="group-merge__check">
          <input
            type="checkbox"
            :checked="row.merges"
            :data-testid="`group-merge-keep-${index}`"
            @change="choose(row.id, { merge: checkedOf($event) })"
          />
          Merge parts
        </label>

        <template v-if="!row.isTarget">
          <label v-if="row.merges" class="group-merge__field">
            Prefix
            <input
              type="text"
              maxlength="80"
              autocapitalize="off"
              autocomplete="off"
              spellcheck="false"
              :value="row.prefix"
              :data-testid="`group-merge-prefix-${index}`"
              @input="choose(row.id, { prefix: valueOf($event) })"
              @keydown.enter.prevent="commit"
            />
          </label>

          <label class="group-merge__check">
            <input
              type="checkbox"
              :checked="row.hidden"
              :data-testid="`group-merge-hide-${index}`"
              @change="choose(row.id, { hidden: checkedOf($event) })"
            />
            {{ row.merges ? 'Hide these parts' : 'Hide this part' }}
          </label>

          <p v-if="row.merges" class="group-merge__preview" :data-testid="`group-merge-preview-${index}`">
            {{ plan.previewNames[index] }}
          </p>
        </template>
      </li>
    </ul>

    <p class="group-merge__note" data-testid="group-merge-note">
      Hidden parts stay out of the size, export and whole-object cuts, and you can still cut with them.
    </p>

    <p v-if="errorText" class="group-merge__error" data-testid="group-merge-error" role="alert">{{ errorText }}</p>

    <div class="group-merge__actions">
      <button type="button" class="group-merge__cancel" data-testid="group-merge-cancel" @click="emit('close')">Cancel</button>
      <button type="button" class="group-merge__commit" data-testid="group-merge-commit" :disabled="!canCommit" @click="commit">Group</button>
    </div>

    <HelpButton topic="group" class="group-merge__help" />
  </div>
</template>

<style scoped>
/* The frame (fixed position, width, glass) is `.ops__popover`, passed in by `OperationsToolbar.vue`;
   only the inside is styled here. */

.group-merge__help {
  position: absolute;
  top: 0;
  right: 0;
}

.group-merge__title {
  margin: 0;
  padding-right: 34px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text-1);
}

/* Capped at 40% of the height, so the list scrolls here rather than pushing commit under a phone's
   on-screen keyboard. */
.group-merge__rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 40vh;
  overflow-y: auto;
}

.group-merge__row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.group-merge__row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.group-merge__summary {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.group-merge__check {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: var(--tap, 44px);
  font-size: 12px;
  color: var(--text-1);
  cursor: pointer;
}

.group-merge__check input {
  width: 18px;
  height: 18px;
  margin: 0;
}

.group-merge__field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: var(--text-2);
}

/* 16 px: anything smaller makes iOS zoom the page when the field takes focus. */
.group-merge__field input {
  min-height: var(--tap, 44px);
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 16px;
}

.group-merge__preview,
.group-merge__note {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-2);
  overflow-wrap: anywhere;
}

.group-merge__error {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-1);
  font-size: 11px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.group-merge__actions {
  display: flex;
  gap: 8px;
}

.group-merge__cancel,
.group-merge__commit {
  flex: 1;
  min-height: var(--tap, 44px);
  border-radius: var(--radius-sm);
  font-weight: 600;
  cursor: pointer;
  touch-action: manipulation;
}

.group-merge__cancel {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-1);
}

.group-merge__commit {
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--text-1);
}

.group-merge__commit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.group-merge__check input:focus-visible,
.group-merge__field input:focus-visible,
.group-merge__cancel:focus-visible,
.group-merge__commit:focus-visible {
  outline: 2px solid var(--accent);
}
</style>
