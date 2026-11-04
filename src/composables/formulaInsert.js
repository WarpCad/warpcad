// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What **Insert…** beside a formula box offers (`TODO/FIND-core-078`): every body, then its
 * parts (hidden ones included — a hidden cut volume is often the thing being measured), then a
 * quantity — and the reference text it types at the caret. Nobody has to know the bracket rule
 * or type `[` on a phone.
 *
 * The text is printed by `core/formula.js`'s own printer from a reference node, so it always
 * parses back to the body, part and quantity it was built from. A body whose name another body
 * shares, or that brackets cannot hold, is written by `#id`.
 *
 * @module composables/formulaInsert
 */

import { FormulaError, parseFormula, printFormula } from '../core/formula.js'

/**
 * A quantity a person can pick: what is typed, what is read, and a test-id-safe key.
 *
 * @typedef {{ quantity: string, label: string, key: string }} QuantityChoice
 */

/** @type {readonly QuantityChoice[]} */
export const FORMULA_QUANTITY_CHOICES = Object.freeze(
  [
    ['width', 'Width (X size)'],
    ['depth', 'Depth (Y size)'],
    ['height', 'Height (Z size)'],
    ['min.x', 'Left face (min X)'],
    ['min.y', 'Front face (min Y)'],
    ['min.z', 'Bottom face (min Z)'],
    ['max.x', 'Right face (max X)'],
    ['max.y', 'Back face (max Y)'],
    ['max.z', 'Top face (max Z)'],
    ['center.x', 'Centre X'],
    ['center.y', 'Centre Y'],
    ['center.z', 'Centre Z'],
  ].map(([quantity, label]) => Object.freeze({ quantity, label, key: quantity.replace('.', '-') })),
)

/**
 * One body as the list shows it.
 *
 * @typedef {object} InsertBody
 * @property {string} id The lineage root's id.
 * @property {string} name
 * @property {boolean} shared Another body has the same name, so the reference is by `#id`.
 * @property {{ name: string, hidden: boolean }[]} parts Visible first, then hidden.
 */

/**
 * Can a formula write this part name (bare or in brackets)?
 *
 * @param {string} part
 * @returns {boolean}
 */
function writablePart(part) {
  try {
    printFormula(/** @type {any} */ ({ type: 'read', body: { kind: 'id', text: 'x' }, part, quantity: 'width', at: 0 }))
    return true
  } catch (error) {
    if (error instanceof FormulaError) return false
    throw error
  }
}

/**
 * @param {readonly { id: string, name: string, partNames?: readonly string[], hiddenPartNames?: readonly string[] }[]} bodies
 *   The document store's body summaries, in order.
 * @returns {InsertBody[]}
 */
export function formulaInsertBodies(bodies) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const { name } of bodies) counts.set(name, (counts.get(name) ?? 0) + 1)
  return bodies.map((body) => ({
    id: body.id,
    name: body.name,
    shared: (counts.get(body.name) ?? 0) > 1,
    parts: [
      ...(body.partNames ?? []).map((name) => ({ name, hidden: false })),
      ...(body.hiddenPartNames ?? []).map((name) => ({ name, hidden: true })),
    ].filter((part) => writablePart(part.name)),
  }))
}

/**
 * The reference text to insert: `Base.width`, `[Cube 1].max.z`, `BPlus.[pi-mb].height`, or
 * `#screw-a1-2.depth` for a shared or unwritable name.
 *
 * @param {Pick<InsertBody, 'id' | 'name' | 'shared'>} body
 * @param {string | null} part `null` for the whole body.
 * @param {string} quantity One of {@link FORMULA_QUANTITY_CHOICES}.
 * @returns {string}
 */
export function formulaReferenceText(body, part, quantity) {
  /** @param {{ kind: 'id' | 'name', text: string }} named */
  const print = (named) => printFormula(/** @type {any} */ ({ type: 'read', body: named, part, quantity, at: 0 }))
  if (!body.shared) {
    try {
      const text = print({ kind: 'name', text: body.name })
      // Belt and braces: a name only counts as written if it reads back as itself.
      const tree = /** @type {any} */ (parseFormula(text))
      if (tree.type === 'read' && tree.body.kind === 'name' && tree.body.text === body.name) return text
    } catch (error) {
      if (!(error instanceof FormulaError)) throw error
    }
  }
  return print({ kind: 'id', text: body.id })
}
