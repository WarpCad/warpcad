// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Parse what a user typed into a numeric field — shared by the Inspector's Transform
 * fields and its Parameters section (`TODO/ui-052` split the latter into
 * `ParamFields.vue`, and one parser is what keeps `"12.5 mm"` meaning the same in both).
 *
 * Tolerant of the unit suffix the field itself displays — `"12.5 mm"` and `"45°"`
 * round-trip, because a user who selects-all and retypes will often keep it — and of a
 * comma decimal separator. Anything that is not a number returns `null`, which restores
 * the field rather than committing a `NaN` the kernel would reject anyway.
 *
 * The same module holds the display half (`formatNumeric`) and the one rule for turning typed
 * text into a committable value (`resolveNumeric`), which `NumberField.vue` is built on
 * (`TODO/ui-115`).
 *
 * @module composables/numericEntry
 */

import { formatMmValue } from '../core/units.js'

/**
 * @param {string} text
 * @returns {number | null}
 */
export function parseNumeric(text) {
  const cleaned = text.replace(/[°\s]/g, '').replace(/mm$/i, '').replace(',', '.')
  if (cleaned === '' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** Decimal places a plain (unitless or degree) value is shown to; more is float noise. */
const PLAIN_DECIMALS = 6

/**
 * How a value reads in a numeric field: a millimetre length the way the Inspector shows it, any
 * other number with float noise trimmed (`0.1 + 0.2` reads `0.3`).
 *
 * @param {number} value
 * @param {'mm' | 'deg' | ''} [unit]
 * @returns {string}
 */
export function formatNumeric(value, unit = '') {
  if (!Number.isFinite(value)) return ''
  if (unit === 'mm') return formatMmValue(value)
  return String(Number(value.toFixed(PLAIN_DECIMALS)))
}

/**
 * @typedef {object} NumericRules
 * @property {number} [min]
 * @property {number} [max]
 * @property {boolean} [integer]  A fraction is refused, not rounded.
 * @property {boolean} [nullable]  Blank text is a value (`null`, "Auto"), not a mistake.
 */

/**
 * What typed text becomes. `{ ok: true, value }` is a finite number inside `min`..`max` (clamped
 * when outside), or `null` for blank text on a nullable field. `{ ok: false }` means restore the
 * field: unparseable text, or a fraction in an integer field.
 *
 * @param {string} text
 * @param {NumericRules} [rules]
 * @returns {{ ok: true, value: number | null } | { ok: false }}
 */
export function resolveNumeric(text, rules = {}) {
  if (rules.nullable && text.trim() === '') return { ok: true, value: null }
  const parsed = parseNumeric(text)
  if (parsed === null) return { ok: false }
  if (rules.integer && !Number.isInteger(parsed)) return { ok: false }
  return { ok: true, value: clampNumeric(parsed, rules) }
}

/**
 * @param {number} value
 * @param {NumericRules} [rules]
 * @returns {number}
 */
export function clampNumeric(value, rules = {}) {
  let result = value
  if (typeof rules.min === 'number' && result < rules.min) result = rules.min
  if (typeof rules.max === 'number' && result > rules.max) result = rules.max
  return result
}

/**
 * Whether typed text is a complete, acceptable value right now, with no clamping: what a `live`
 * field may emit mid-typing.
 *
 * @param {string} text
 * @param {NumericRules} [rules]
 * @returns {number | null} the number, or null when it is blank, partial or out of range
 */
export function liveNumeric(text, rules = {}) {
  const parsed = parseNumeric(text)
  if (parsed === null) return null
  if (rules.integer && !Number.isInteger(parsed)) return null
  if (typeof rules.min === 'number' && parsed < rules.min) return null
  if (typeof rules.max === 'number' && parsed > rules.max) return null
  return parsed
}

/**
 * One arrow-key step, free of float drift (`0.1 + 0.2`), kept inside `min`..`max`.
 *
 * @param {number} from
 * @param {number} delta
 * @param {NumericRules} [rules]
 * @returns {number}
 */
export function stepNumeric(from, delta, rules = {}) {
  return clampNumeric(Number((from + delta).toFixed(10)), rules)
}
