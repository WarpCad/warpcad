// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Turn what a person typed into the Variables panel into the shapes `core/variables.js`
 * takes (`TODO/ui-059`). Parsing only: whether a name, a kind, a range or an option list is
 * *acceptable* is core's call (`variableDefinitionError`), and its reason string is what the
 * panel shows. Nothing here refuses anything.
 *
 * Formulas (`TODO/FIND-core-078`) add the preview line's wording, caret insertion for
 * **Insert…**, and the blast-radius line for a formula whose value moved because a part it
 * measures changed. Whether a formula is *usable* is still core's call.
 *
 * @module composables/variableEntry
 */

import { formatMmValue } from '../core/units.js'

/**
 * `"Pi model"` → `"piModel"`, made unique against `taken`. A starting point the person can
 * retype, not a rule: core still checks the name when it is submitted.
 *
 * @param {string} label
 * @param {Iterable<string>} [taken]
 * @returns {string}
 */
export function suggestVariableName(label, taken = []) {
  const words = label
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word !== '')
  let name = words
    .map((word, index) => (index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('')
  if (name === '' || !/^[A-Za-z_]/.test(name)) name = `v${name}`
  name = name.slice(0, 36)
  const used = new Set(taken)
  if (!used.has(name)) return name
  for (let n = 2; ; n += 1) {
    if (!used.has(`${name}${n}`)) return `${name}${n}`
  }
}

/**
 * `"3, 4, 5"` or `"tap, close"` → option objects. A token that reads as a number becomes a
 * number, anything else stays text; the label is the token itself.
 *
 * @param {string} text
 * @returns {Array<{ value: string | number, label: string }>}
 */
export function parseOptionList(text) {
  return text
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '')
    .map((token) => {
      const asNumber = Number(token)
      return { value: Number.isFinite(asNumber) ? asNumber : token, label: token }
    })
}

/**
 * The definition "New variable from this value…" creates: the variable the field's own
 * current value and (for a choice) its own options — so binding changes nothing on screen.
 * The slot's range, when `bindableParams` gave one, is carried over as the variable's own.
 * No `label`: a label would replace the name in core's condition sentence ("Only when Model
 * is Pi 4"), and the name the person just typed is what every other surface shows.
 * Whether the result is acceptable is core's to judge.
 *
 * @param {import('../core/variables.js').BindableSlot} slot
 * @param {unknown} value The slot's current, **resolved** value.
 * @param {{ name: string, unit: string }} names
 * @returns {Record<string, any>}
 */
export function seedDefinition(slot, value, { name, unit }) {
  /** @type {Record<string, any>} */
  const definition = { name, kind: slot.kind, value }
  if (slot.kind === 'number') {
    const resolvedUnit = unit !== '' ? unit : (slot.unit ?? '')
    if (resolvedUnit === 'mm' || resolvedUnit === 'deg') definition.unit = resolvedUnit
    if (slot.min !== undefined) definition.min = slot.min
    if (slot.max !== undefined) definition.max = slot.max
  }
  if (slot.kind === 'enum') {
    definition.options = (slot.options ?? []).map((option) => ({ value: option.value, label: option.label }))
  }
  return definition
}

/**
 * A formula's value as the panel prints it: two decimals at most, trailing zeros dropped, the
 * record's unit after it. A formula with no value (a measuring one before its fold, or one
 * with an error) is a dash, never `undefined` or `NaN`.
 *
 * @param {unknown} value Millimetres (or degrees, or a plain number), as the formula worked out.
 * @param {string | undefined} unit The record's `unit` label: `mm`, `deg` or none.
 * @returns {string}
 */
export function formulaValueText(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const number = formatMmValue(value)
  return unit ? `${number} ${unit}` : number
}

/**
 * The preview line under a formula box: `= 40 mm`, or core's named error as it wrote it (a
 * syntax error carries its character position). `ok` is whether **Create** / **Save** may run.
 *
 * @param {{ value: number } | { error: string } | null} outcome `null` for an empty box.
 * @param {string | undefined} unit
 * @returns {{ ok: boolean, text: string }}
 */
export function formulaPreviewLine(outcome, unit) {
  if (outcome === null) return { ok: false, text: '' }
  if ('error' in outcome) return { ok: false, text: outcome.error }
  return { ok: true, text: `= ${formulaValueText(outcome.value, unit)}` }
}

/** Characters after which a reference can follow with no space: operators, `(`, `,`, `!`. */
const JOINS = new Set(['(', ',', '+', '-', '*', '/', '!', '<', '>', '=', '&', '|'])

/**
 * Put `insertion` where the caret is (replacing a selection), with a space before it when it
 * would otherwise run into the value before it (`2Lid.width`). The caret ends after it.
 *
 * @param {string} text
 * @param {number} start `selectionStart`.
 * @param {number} end `selectionEnd`.
 * @param {string} insertion
 * @returns {{ text: string, caret: number }}
 */
export function insertAtCaret(text, start, end, insertion) {
  const from = Math.max(0, Math.min(start, text.length))
  const to = Math.max(from, Math.min(end, text.length))
  const before = text.slice(0, from)
  const last = before.at(-1)
  const lead = last === undefined || /\s/.test(last) || JOINS.has(last) ? '' : ' '
  const head = `${before}${lead}${insertion}`
  return { text: `${head}${text.slice(to)}`, caret: head.length }
}

/**
 * The formula text **New formula from this value…** starts with: the field's current number,
 * so creating and binding it changes nothing on screen until the person edits it.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function seedFormulaText(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '0'
}

/** Below this, two formula values are the same number (floating-point noise, not a change). */
const SAME_VALUE = 1e-9

/**
 * The blast-radius lines for formulas whose value moved between two document versions — a
 * part they measure was edited, or Undo put it back: `overhang 40 mm → 60 mm — 1 parameter on
 * 1 part changed`. Keyed by record id, so a different project that happens to use the same
 * name never reads as a change. New formulas, value variables, and formulas with no value say
 * nothing.
 *
 * @param {ReadonlyMap<string, number>} before Formula record id → value, at the earlier version.
 * @param {readonly { variable: import('../core/variables.js').Variable, parameters: number, parts: number }[]} rows
 *   The Variables panel's rows now.
 * @returns {string[]}
 */
export function formulaChangeSummaries(before, rows) {
  /** @type {string[]} */
  const lines = []
  for (const { variable, parameters, parts } of rows) {
    if (typeof variable.formula !== 'string' || typeof variable.value !== 'number') continue
    const was = before.get(variable.id)
    if (was === undefined || Math.abs(was - variable.value) <= SAME_VALUE) continue
    const noun = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`
    const tail = parameters === 0 ? 'nothing reads it yet' : `${noun(parameters, 'parameter')} on ${noun(parts, 'part')} changed`
    lines.push(`${variable.name} ${formulaValueText(was, variable.unit)} → ${formulaValueText(variable.value, variable.unit)} — ${tail}`)
  }
  return lines
}

/** Control and text-direction characters: never shown raw, so stored text cannot reorder a row. */
const HIDDEN_CHARACTERS = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

/**
 * A formula's text as the panel shows it. A formula that parses comes back from core's printer
 * clean; one that does not (a hostile or damaged file) is shown as stored, so a right-to-left
 * override or a control character in it is replaced by a visible `\uFFFD` and a line break by a
 * space. Still text interpolation only — this is about what the eye sees, not markup.
 *
 * @param {string} text
 * @returns {string}
 */
export function shownFormulaText(text) {
  return String(text).replace(/\r\n|\n/g, ' ').replace(HIDDEN_CHARACTERS, '\uFFFD')
}
