<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * One row of the History list, and — when it is the selected row — its action
 * bar and inline edit form (`TODO/ui-032`, §§14-18).
 *
 * **Why the actions live on the selected row rather than on every row.** §16
 * decided it and gives the reason: at 390px, five icons beside every row put a
 * destructive-looking control next to every tap target and invite accidental
 * toggles while scrolling. Revealing them on the selected row costs one extra
 * tap and removes that entirely. It is also what keeps a row a legal 44px tap
 * target instead of a strip of 20px ones.
 *
 * **Why the edit form is inline and not a popover.** §15 puts it "inside the
 * selected timeline row; not the Inspector" — the Inspector edits the *current*
 * state of a selected body (`ui-029`), this edits a *past record*. Same fields,
 * different target, and putting them in visibly different places is what stops
 * the two being confused. At phone width it scrolls with the sheet, which a
 * popover pinned to a row would not.
 *
 * **Enablement is never guessed.** Every disabled button here carries the real
 * reason from `useTimelineCommands` — §17's static `canMove`, §15's
 * `stepParamEditability`, §18's inactive-row rule — rather than a local
 * heuristic. CLAUDE.md's Interaction Model is explicit that a control is
 * disabled until its preconditions are actually met, and an honest *reason* is
 * what makes a disabled control teach instead of frustrate.
 *
 * **Design intent (`TODO/ai-003`).** A row whose step carries intent (why an AI or MCP
 * client made it) shows a small note icon — a separate 44px button beside the row, so
 * expanding never selects. Expanding shows the intent and the origin chip under the row; it
 * is not always-visible text, which keeps the phone sheet short. The intent is untrusted
 * (it comes from whatever file was opened), so it is rendered with `{{ }}` text
 * interpolation only, never `v-html`.
 */
import { computed, nextTick, ref, watch } from 'vue'

import { useTimelineCommands } from '../../composables/useTimelineCommands.js'
import { originChipText } from '../../core/origin.js'
import { useTimelineStore } from '../../stores/timeline.js'

const props = defineProps({
  row: {
    type: /** @type {import('vue').PropType<import('../../stores/timeline.js').TimelineRowView>} */ (
      Object
    ),
    required: true,
  },
  selected: { type: Boolean, default: false },
  /**
   * True when a body the user has selected in the 3D view is one this row
   * touches. §13's single passive link between the two selections: "a subtle
   * tint, without selecting or scrolling anything."
   */
  related: { type: Boolean, default: false },
})

const emit = defineEmits(['select'])

const timeline = useTimelineStore()
const commands = useTimelineCommands()

const editing = ref(false)
/** `TODO/ai-003`: whether this row's intent is expanded. Per row, not persisted. */
const intentOpen = ref(false)
const intentId = computed(() => `timeline-intent-${props.row.step}`)
// A closed list, never the file's own words (`src/core/origin.js`, `TODO/ai-009`).
const originLabel = computed(() => originChipText(props.row.origin))
/** @type {import('vue').Ref<Record<string, any>>} */
const draft = ref({})

const editVerdict = computed(() => commands.editability(props.row.id))
const fields = computed(() => commands.fieldsFor(props.row.id))
const upVerdict = computed(() => commands.canMove(props.row.id, -1))
const downVerdict = computed(() => commands.canMove(props.row.id, 1))

/**
 * §18: a rollback target must be **active** and **not the last row** — there
 * would be no tail to deactivate otherwise.
 */
const rollbackVerdict = computed(() => {
  if (!props.row.active) {
    return { allowed: false, reason: 'This step is already inactive' }
  }
  if (props.row.step >= timeline.stepCount) {
    return { allowed: false, reason: 'There is nothing after this step to roll back past' }
  }
  return { allowed: true, reason: null }
})

/** The `broken` reason to show: the shadow check's, or the last refusal's. */
const brokenReason = computed(() => {
  if (props.row.broken !== null) return props.row.broken
  const failing = timeline.error?.broken
  return failing && failing.id === props.row.id ? failing.reason : null
})

// Selecting a different row closes any form this one had open, so an abandoned
// edit can never be applied later by a stray Enter.
watch(
  () => props.selected,
  (isSelected) => {
    if (!isSelected) editing.value = false
  }
)

function startEdit() {
  /** @type {Record<string, any>} */
  const next = {}
  for (const field of fields.value) {
    next[field.key] = Array.isArray(field.value) ? field.value.slice() : field.value
  }
  draft.value = next
  editing.value = true
  void nextTick(() => {
    const first = /** @type {HTMLElement | null} */ (
      document.querySelector('[data-testid^="timeline-field-"]')
    )
    first?.focus()
  })
}

/**
 * The draft's current value for a vector field, typed.
 *
 * Read through a helper rather than indexed inline in the template: `draft` is
 * a `Record<string, any>` (a record's params genuinely are heterogeneous), and
 * iterating it directly in `v-for` leaves the loop index inferred as
 * `string | number`, which is neither true nor useful.
 *
 * @param {import('../../composables/useTimelineCommands.js').StepField} field
 * @returns {number[]}
 */
function vectorOf(field) {
  const value = draft.value[field.key]
  return Array.isArray(value) ? /** @type {number[]} */ (value) : []
}

/**
 * One component of a vector param.
 *
 * Bound through an explicit handler rather than `v-model` on an array element:
 * a per-axis `v-model` into `draft[key][i]` mutates the array in place, which
 * leaves the original record's array aliased when the edit is then cancelled.
 * Copy-on-write here is what makes Cancel actually cancel.
 *
 * @param {import('../../composables/useTimelineCommands.js').StepField} field
 * @param {number} index
 * @param {Event} event
 */
function onVectorInput(field, index, event) {
  const input = /** @type {HTMLInputElement} */ (event.target)
  const next = (draft.value[field.key] ?? []).slice()
  next[index] = Number(input.value)
  draft.value[field.key] = next
}

function apply() {
  const result = commands.applyEdit(props.row.id, draft.value)
  // §15 on failure: "the form stays open with the value the user typed." The
  // named error is already on the strip via the store, and the chip below.
  if (result.ok) editing.value = false
}

function cancel() {
  editing.value = false
  timeline.clearError()
}
</script>

<template>
  <li class="row-wrap">
    <div class="row-line">
      <button
        type="button"
        class="row"
        :class="{
          'row--selected': selected,
          'row--suppressed': row.suppressed,
          'row--inactive': !row.active,
          'row--conditioned-off': row.inactiveBy !== null,
          'row--related': related && !selected,
        }"
        :data-testid="`timeline-row-${row.step}`"
        :data-step-id="row.id"
        :data-active="row.active"
        :data-suppressed="row.suppressed"
        :data-conditioned-off="row.inactiveBy !== null"
        :aria-current="selected ? 'true' : undefined"
        @click="emit('select', row.id)"
      >
        <span class="row__step" aria-hidden="true">{{ row.step }}</span>
        <span class="row__text">{{ row.text }}</span>
        <span class="row__chips">
          <span v-if="row.suppressed" class="chip chip--muted" data-testid="chip-suppressed">
            suppressed
          </span>
          <span v-if="!row.active" class="chip chip--muted" data-testid="chip-inactive">inactive</span>
          <!-- A condition (TODO/ui-052): shown whether or not it currently holds, so a row
               that only exists on a Pi 4 says so on a Pi 4 too. While it does not hold the
               row greys like a suppressed one, but carries this chip instead of the
               "suppressed" label, so the two can be told apart. -->
          <span
            v-if="row.condition"
            class="chip chip--condition"
            data-testid="timeline-condition-chip"
            :data-holds="row.inactiveBy === null ? 'true' : 'false'"
            :title="row.condition.sentence"
          >
            {{ row.condition.chip }}
          </span>
          <span
            v-if="brokenReason"
            class="chip chip--broken"
            data-testid="chip-broken"
            :title="brokenReason"
          >
            broken
          </span>
          <!-- §19 point 2: a step someone else added is never hidden — it is in
               History with an origin chip, so the user can see it and can
               Suppress or Edit it like any other step. Absent for local edits,
               which is almost all of them today. -->
          <span v-if="row.origin !== 'local'" class="chip" data-testid="chip-origin">{{ originLabel }}</span>
        </span>
      </button>
      <button
        v-if="row.intent !== null"
        type="button"
        class="row__intent-toggle"
        data-testid="timeline-intent-toggle"
        :aria-expanded="intentOpen ? 'true' : 'false'"
        :aria-controls="intentId"
        aria-label="Why this step exists"
        title="Why this step exists"
        @click="intentOpen = !intentOpen"
      >
        <svg class="row__intent-icon" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 1.5h7l3 3v10H3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
          <path d="M5.5 7h5M5.5 9.5h5M5.5 12h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div v-if="row.intent !== null && intentOpen" :id="intentId" class="intent" data-testid="timeline-intent">
      <span class="chip intent__origin" data-testid="timeline-intent-origin">{{ originLabel }}</span>
      <p class="intent__text">{{ row.intent }}</p>
    </div>

    <!-- The broken chip's reason, printed (`TODO/ui-062`): its `title` is a hover tooltip, and a
         phone has no hover — so on the selected row the reason ("conflicts with step 6 (Move
         Cube 1, by you)") is plain text, read the same way at every width. -->
    <p v-if="selected && brokenReason" class="row__broken-reason" data-testid="timeline-broken-reason">
      {{ brokenReason }}
    </p>

    <div v-if="selected" class="actions" data-testid="timeline-actions">
      <button
        type="button"
        class="actions__btn"
        data-testid="timeline-edit"
        :disabled="!editVerdict.editable || editing"
        :title="editVerdict.reason ?? 'Edit this step’s values'"
        @click="startEdit()"
      >
        Edit
      </button>
      <button
        type="button"
        class="actions__btn"
        data-testid="timeline-suppress"
        :aria-pressed="row.suppressed"
        :title="
          row.suppressed
            ? 'Put this step back into the document'
            : 'Take this step out without deleting it'
        "
        @click="commands.setSuppressed(row.id, !row.suppressed)"
      >
        {{ row.suppressed ? 'Unsuppress' : 'Suppress' }}
      </button>
      <button
        type="button"
        class="actions__btn"
        data-testid="timeline-move-up"
        :disabled="!upVerdict.allowed"
        :title="upVerdict.reason ?? 'Move this step one position earlier'"
        @click="commands.moveStep(row.id, -1)"
      >
        Move up
      </button>
      <button
        type="button"
        class="actions__btn"
        data-testid="timeline-move-down"
        :disabled="!downVerdict.allowed"
        :title="downVerdict.reason ?? 'Move this step one position later'"
        @click="commands.moveStep(row.id, 1)"
      >
        Move down
      </button>
      <button
        type="button"
        class="actions__btn"
        data-testid="timeline-rollback"
        :disabled="!rollbackVerdict.allowed"
        :title="rollbackVerdict.reason ?? 'Stop evaluating after this step — nothing is deleted'"
        @click="commands.rollBackTo(row.id)"
      >
        Roll back to here
      </button>
    </div>

    <form v-if="selected && editing" class="edit" data-testid="timeline-edit-form" @submit.prevent="apply()">
      <label v-for="field in fields" :key="field.key" class="edit__field">
        <span class="edit__label">{{ field.label }}</span>

        <input
          v-if="field.kind === 'number'"
          v-model.number="draft[field.key]"
          class="edit__input"
          type="number"
          step="any"
          inputmode="decimal"
          :data-testid="`timeline-field-${field.key}`"
        />

        <span v-else-if="field.kind === 'vector'" class="edit__vector">
          <input
            v-for="(component, index) in vectorOf(field)"
            :key="index"
            class="edit__input edit__input--axis"
            type="number"
            step="any"
            inputmode="decimal"
            :value="component"
            :aria-label="`${field.label} ${field.axes?.[index] ?? index + 1}`"
            :data-testid="`timeline-field-${field.key}-${index}`"
            @input="onVectorInput(field, index, $event)"
          />
        </span>

        <select
          v-else-if="field.kind === 'choice'"
          v-model="draft[field.key]"
          class="edit__input"
          :data-testid="`timeline-field-${field.key}`"
        >
          <option v-for="choice in field.choices" :key="choice.value" :value="choice.value">
            {{ choice.label }}
          </option>
        </select>

        <input
          v-else-if="field.kind === 'boolean'"
          v-model="draft[field.key]"
          type="checkbox"
          :data-testid="`timeline-field-${field.key}`"
        />

        <input
          v-else
          v-model="draft[field.key]"
          class="edit__input"
          type="text"
          :data-testid="`timeline-field-${field.key}`"
        />
      </label>

      <div class="edit__buttons">
        <button type="submit" class="actions__btn actions__btn--primary" data-testid="timeline-apply">
          Apply
        </button>
        <button type="button" class="actions__btn" data-testid="timeline-cancel" @click="cancel()">
          Cancel
        </button>
      </div>
    </form>
  </li>
</template>

<style scoped>
.row-wrap {
  list-style: none;
  border-bottom: 1px solid var(--border);
}

.row-line {
  display: flex;
  align-items: stretch;
}

.row {
  flex: 1;
  min-width: 0;
  /* §13: rows are ≥44px tall — a list you scroll with a thumb is a list whose
     rows are tap targets. */
  min-height: var(--tap);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 0;
  border-left: 3px solid transparent;
  background: transparent;
  color: var(--text-1);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  touch-action: manipulation;
}

.row:hover {
  background: var(--surface-2);
}

.row--selected {
  /* §13: "a selected row gets an accent left bar" — deliberately not the 3D
     highlight, because a row selection and a body selection are two different
     selections and must never look like one. */
  border-left-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.row--related {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

.row--suppressed .row__text {
  /* Legible without colour — strike-through plus the chip's own word, per §16's
     phone rule. */
  text-decoration: line-through;
  color: var(--text-3);
}

.row--inactive {
  opacity: 0.55;
}

/* Greyed like a suppressed row, without the strike-through: nothing was switched off by
   hand, the condition simply does not hold right now (TODO/ui-052). */
.row--conditioned-off .row__text {
  color: var(--text-3);
}

.row--conditioned-off {
  opacity: 0.7;
}

.row__step {
  min-width: 18px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  font-size: 11px;
}

.row__text {
  flex: 1;
  min-width: 0;
}

.row__chips {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.chip {
  padding: 1px 6px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  color: var(--text-2);
  font-size: 10px;
  white-space: nowrap;
}

.chip--muted {
  color: var(--text-3);
}

.chip--condition {
  border-style: dashed;
  color: var(--text-2);
  max-width: 14em;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip--broken {
  border-color: var(--danger);
  color: var(--danger);
}

.row__intent-toggle {
  flex: 0 0 auto;
  width: var(--tap);
  min-height: var(--tap);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  touch-action: manipulation;
}

.row__intent-toggle:hover,
.row__intent-toggle[aria-expanded='true'] {
  color: var(--accent);
}

.row__intent-icon {
  width: 16px;
  height: 16px;
}

.row__broken-reason {
  margin: 0;
  padding: 0 10px 6px 13px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--danger);
  overflow-wrap: anywhere;
}

.intent {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 0 10px 8px 13px;
}

.intent__text {
  margin: 0;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.45;
  /* Untrusted text: keep its own line breaks, and never let a long token widen the sheet. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 10px 8px 13px;
}

.actions__btn {
  min-height: var(--tap);
  padding: 4px 10px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-1);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  touch-action: manipulation;
}

.actions__btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.actions__btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.actions__btn--primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.edit {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 10px 10px 13px;
}

.edit__field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit__label {
  min-width: 72px;
  color: var(--text-2);
  font-size: 12px;
}

.edit__vector {
  display: flex;
  gap: 4px;
}

.edit__input {
  flex: 1;
  min-width: 0;
  min-height: 34px;
  padding: 4px 6px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px, not smaller: anything below it makes iOS Safari zoom the page on
     focus, which on a bottom sheet scrolls the form out from under the thumb.
     §15's phone rule names this explicitly. */
  font-size: 16px;
}

.edit__input--axis {
  width: 64px;
  flex: 0 0 auto;
}

.edit__buttons {
  display: flex;
  gap: 6px;
}
</style>
