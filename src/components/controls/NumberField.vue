<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup>
/**
 * The one numeric field (`TODO/ui-115`). Before it, the app had two: a tolerant text field in the
 * Inspector (`12,5`, `12.5 mm` and `45°` all worked) and a native `type="number"` field in the
 * Fillet popover, the Split sheet and a handful of dialogs (where the browser rejected the very
 * same text, and `v-model.number` left an empty string in the ref mid-edit). Every dimension is
 * now typed the same way everywhere.
 *
 * - **Text, not a number input**: `type="text"` with `inputmode="decimal"` (`"numeric"` for an
 *   `integer` field) so a phone shows a number pad and a comma or a unit suffix is typeable.
 * - **Commits once**, on blur or Enter, through `parseNumeric` (`composables/numericEntry.js`, the
 *   one parser), clamped to `min`..`max`. Text that is not a number, or a fraction in an `integer`
 *   field, restores the old value and emits nothing. `update:modelValue` only ever carries a finite
 *   number, or `null` for a `nullable` field left blank ("Auto").
 * - **Escape** puts the old value back, and swallows the key only while there is something typed
 *   to put back, so a sheet's own Escape-to-close still works from an untouched field.
 * - **Arrow Up and Down** step by `step` (Shift: ten times that). This replaces the one thing
 *   `type="number"` gave for free. Each press commits.
 * - **`live`** also emits while typing, valid complete values only (never blank, partial or out of
 *   range), for a field whose neighbours react as it changes: the Split sheet's cut preview, a
 *   popover's Apply button enabling.
 * - **Enter** commits, then moves focus away. It does **not** submit a surrounding form, so typing
 *   a size and pressing Enter never applies a whole sheet by accident; `submit` opts a field in
 *   (the Set-scale length, whose only job is the form's one action).
 * - **`unit`** (`'mm' | 'deg' | ''`) decides how the value is formatted, and the label next to the
 *   field carries it in words, as everywhere else in the app. `format` overrides the display for a
 *   field that shows its unit in the text, such as the Inspector's rotation (`45°`).
 *
 * The root is the `<input>` itself, so `data-testid`, `aria-label`, `class` and `title` land on it.
 * The text stays 16px (set by the surrounding field styles from `TextInput.vue`): anything smaller
 * makes iOS Safari zoom the page on focus.
 */
import { computed, ref, watch } from 'vue'

import { formatNumeric, liveNumeric, resolveNumeric, stepNumeric } from '../../composables/numericEntry.js'

const props = defineProps({
  /** The value, in `unit`. `null` is blank (only meaningful with `nullable`). */
  modelValue: { type: /** @type {import('vue').PropType<number | null>} */ (Number), default: null },
  /** `'mm'`, `'deg'` or `''` (a bare count). */
  unit: { type: String, default: '' },
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined },
  /** What Arrow Up and Down add. */
  step: { type: Number, default: 1 },
  /** A whole number only: a fraction restores the field. */
  integer: { type: Boolean, default: false },
  /** Blank commits `null` (an "Auto" field) instead of restoring. */
  nullable: { type: Boolean, default: false },
  /** Also emit while typing, valid values only. */
  live: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  readonly: { type: Boolean, default: false },
  placeholder: { type: String, default: undefined },
  /** Enter also submits the surrounding `<form>`, once the value is committed. */
  submit: { type: Boolean, default: false },
  /** Display override: `(value) => text`. */
  format: { type: Function, default: undefined },
})

const emit = defineEmits(['update:modelValue'])

defineExpose({
  /** Put the cursor in the field. */
  focus: () => input.value?.focus(),
})

const input = ref(/** @type {HTMLInputElement | null} */ (null))
const editing = ref(false)
const draft = ref('')
/** The last value `live` sent, so a half-typed `12,` does not repeat `12`. */
let lastLive = /** @type {number | null | undefined} */ (undefined)
/** The last value this field sent, so a change that is not an echo of it came from outside. */
let lastEmitted = /** @type {number | null | undefined} */ (undefined)
/** True from focus until the first mouseup, so the click that focused does not drop the select-all. */
let justFocused = false

const rules = computed(() => ({ min: props.min, max: props.max, integer: props.integer, nullable: props.nullable }))

/** @param {number | null} value */
function send(value) {
  lastEmitted = value
  emit('update:modelValue', value)
}

// A change that is not an echo of what this field just sent (a dragged gizmo, a cut-plane handle,
// Undo) wins over text still being typed: the number on screen must not contradict the model.
watch(
  () => props.modelValue,
  (next) => {
    if (editing.value && !Object.is(next, lastEmitted)) draft.value = display(next)
  },
)

/** @param {number | null} value */
function display(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  return props.format ? props.format(value) : formatNumeric(value, /** @type {'mm' | 'deg' | ''} */ (props.unit))
}

const shown = computed(() => (editing.value ? draft.value : display(props.modelValue)))

/** @param {FocusEvent} event */
function onFocus(event) {
  const el = /** @type {HTMLInputElement} */ (event.target)
  if (editing.value) return
  editing.value = true
  draft.value = el.value
  lastLive = undefined
  justFocused = true
  el.select()
}

/** @param {MouseEvent} event */
function onMouseUp(event) {
  if (!justFocused) return
  justFocused = false
  event.preventDefault()
}

/** @param {Event} event */
function onInput(event) {
  const el = /** @type {HTMLInputElement} */ (event.target)
  editing.value = true
  draft.value = el.value
  if (!props.live || props.readonly) return
  // Blank is a complete value for a nullable ("Auto") field, and nothing yet for any other.
  const value = props.nullable && el.value.trim() === '' ? null : liveNumeric(el.value, rules.value)
  if (value === null && !(props.nullable && el.value.trim() === '')) return
  if (value === lastLive) return
  lastLive = value
  send(value)
}

/** @param {HTMLInputElement} el */
function finish(el) {
  editing.value = false
  el.value = display(props.modelValue)
}

/** @param {HTMLInputElement} el */
function commit(el) {
  if (!editing.value) return
  if (props.readonly) {
    finish(el)
    return
  }
  const result = resolveNumeric(el.value, rules.value)
  editing.value = false
  if (!result.ok) {
    el.value = display(props.modelValue)
    return
  }
  if (!Object.is(result.value, props.modelValue)) send(result.value)
  // Show what was committed even when the prop has not caught up yet (or never will).
  el.value = display(result.value)
  lastLive = undefined
}

/** @param {FocusEvent} event */
function onBlur(event) {
  commit(/** @type {HTMLInputElement} */ (event.target))
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  const el = /** @type {HTMLInputElement} */ (event.target)
  if (event.key === 'Enter') {
    event.preventDefault()
    commit(el)
    if (props.submit && el.form) el.form.requestSubmit()
    else el.blur()
    return
  }
  if (event.key === 'Escape') {
    if (editing.value && el.value !== display(props.modelValue)) event.stopPropagation()
    finish(el)
    return
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    if (props.readonly) return
    event.preventDefault()
    const parsed = resolveNumeric(el.value, { ...rules.value, nullable: false })
    const from = parsed.ok && parsed.value !== null ? parsed.value : (props.modelValue ?? 0)
    const delta = (event.key === 'ArrowUp' ? 1 : -1) * props.step * (event.shiftKey ? 10 : 1)
    const next = stepNumeric(from, delta, rules.value)
    editing.value = true
    draft.value = display(next)
    el.value = draft.value
    el.select()
    if (!Object.is(next, props.modelValue)) send(next)
    lastLive = next
  }
}
</script>

<template>
  <input
    ref="input"
    class="number-field"
    type="text"
    :inputmode="integer ? 'numeric' : 'decimal'"
    autocomplete="off"
    spellcheck="false"
    :readonly="readonly"
    :placeholder="placeholder"
    :aria-invalid="invalid ? 'true' : undefined"
    :value="shown"
    @focus="onFocus"
    @mouseup="onMouseUp"
    @input="onInput"
    @blur="onBlur"
    @keydown="onKeydown"
  />
</template>

<style scoped>
/*
 * Every rule is `:where()`, specificity zero, so the surrounding panel's own class (compact
 * Inspector rows, a popover's field) always wins and this is only what a bare field looks like.
 */
:where(.number-field) {
  box-sizing: border-box;
  min-width: 0;
  min-height: var(--tap);
  padding: 0 var(--space-4h);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  color: var(--text-1);
  font-family: inherit;
  /* 16px: iOS Safari zooms the page on focus of anything smaller. Do not restyle this down. */
  font-size: var(--text-size-xl);
}

:where(.number-field[aria-invalid='true']) {
  border-color: var(--danger);
}
</style>
