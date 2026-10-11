// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Turn what a person typed into the Variables panel into the shapes `core/variables.js`
 * takes (`TODO/ui-059`). Parsing only: whether a name, a kind, a range or an option list is
 * *acceptable* is core's call (`variableDefinitionError`), and its reason string is what the
 * panel shows. Nothing here refuses anything.
 *
 * @module composables/variableEntry
 */

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
