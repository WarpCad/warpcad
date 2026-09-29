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
 * @module composables/numericEntry
 */

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
