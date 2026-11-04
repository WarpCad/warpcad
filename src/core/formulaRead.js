// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Reading a body's size for a formula (`TODO/FIND-core-078`, part 2): the `read(body, part,
 * quantity)` a formula variable's evaluator is handed, built from a view of the fold.
 *
 * ## At the consumer's row
 *
 * A formula has no row of its own. It is worked out at each row that binds it, against the
 * bodies **as they stand just above that row** — what a JSCAD line does when it runs. The
 * view says what "above" means: `atIndex` is the row, `terminalOf` is the record that
 * represents a lineage there. A row can only read rows above it, so a geometric cycle cannot
 * be written. Everything else is a named error, never `0` or a guess:
 *
 * - a body built at or after this row — *reads Base, which is not built until step 7* (a body
 *   reading itself while it is being created gets the same sentence);
 * - a body deleted **anywhere** in the active log (`pattern.repeat`'s decision 8), suppressed,
 *   after the rollback marker, left out by its condition, or not built because its row is broken;
 * - a part the body does not have, listing the parts it does have.
 *
 * A **consumed** body (a cutter that went into a Subtract) reads as itself: `terminalOf` must
 * be the lineage's own last record (`terminalByRoot`), never `currentIdOf`, which walks through
 * a retired root to the boolean's result and would measure the wrong solid.
 *
 * Quantities are world-axis bounds in millimetres. A body with no part is its **visible**
 * parts (`boundsOf`); a named part may be hidden (a hidden cut volume is often the thing being
 * measured). Bounds are memoised by geometry object (`kernel/measure.js`'s `memoBoundsOf`),
 * so a group with holes pays its union once, however many formulas read it.
 *
 * Names reach data only through `Map`s and `Object.hasOwn`, so `#__proto__.width` and
 * `box.[__proto__].width` are ordinary "no such body/part" errors.
 *
 * Framework-free (CLAUDE.md, Project Structure).
 *
 * @module core/formulaRead
 */

import { FormulaError, measureBounds } from './formula.js'
import { isGroup } from './kernel/group.js'
import { memoBoundsOf } from './kernel/measure.js'

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./kernel/group.js').Group} Group */
/** @typedef {import('./formula.js').FormulaQuantity} FormulaQuantity */

/** How many of a body's part names a "no such part" error lists. */
const LISTED_PARTS = 40

/**
 * One part reading a formula took, for the "reads before a later change" report.
 *
 * @typedef {object} FormulaReading
 * @property {string} root The lineage root read.
 * @property {string | null} part
 * @property {FormulaQuantity} quantity
 * @property {number} value Millimetres.
 */

/**
 * What a reader needs to know about the fold, as of one row.
 *
 * @typedef {object} FormulaReadView
 * @property {number} atIndex The 0-based row the read is "just above"; the active count for the
 *   end of the log.
 * @property {number} activeCount Rows before the rollback marker.
 * @property {(id: string) => string | undefined} rootOf Any record id's lineage root, by the log;
 *   `undefined` for an id no record has.
 * @property {(root: string) => number} indexOf The 0-based row that creates the lineage, or -1.
 * @property {(root: string) => boolean} suppressed
 * @property {(root: string) => boolean} deleted Deleted anywhere in the active log.
 * @property {(root: string) => 'condition' | 'broken'} leftOut Why a lineage created above the
 *   row was not built.
 * @property {(root: string) => string | undefined} terminalOf The record representing the lineage
 *   just above the row, or `undefined` when it was not built.
 * @property {(recordId: string) => Geom3 | Group | undefined} geometryOf
 * @property {(root: string) => string} nameOf What the user calls the body.
 * @property {(reading: FormulaReading) => void} [onRead] Told of each successful reading.
 */

/**
 * A name for an error message: control and direction characters removed, cut to 60.
 *
 * @param {string} text
 * @returns {string}
 */
function quoted(text) {
  const clean = String(text).replace(/[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g, '')
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean
}

/**
 * @param {string} message
 * @returns {FormulaError}
 */
const readError = (message) => new FormulaError(message, { code: 'reference' })

/**
 * Does this solid, or every visible part of this group, hold no polygons? Its box would read
 * as all zeros — a size it does not have — so a formula is told, by name, instead.
 *
 * @param {Geom3 | Group} geometry
 * @returns {boolean}
 */
function isEmpty(geometry) {
  if (isGroup(geometry)) {
    return geometry.holes.length === 0 && geometry.names.every((name) => (geometry.parts[name]?.polygons?.length ?? 0) === 0)
  }
  return Array.isArray(geometry.polygons) && geometry.polygons.length === 0
}

/**
 * One quantity of a body, or of one of its parts — `null` when the body has no such part.
 *
 * @param {Geom3 | Group} geometry
 * @param {string | null} part
 * @param {FormulaQuantity} quantity
 * @returns {number | null}
 * @throws {FormulaError} For a body or part with nothing to measure (it is empty).
 */
export function quantityOf(geometry, part, quantity) {
  let target = geometry
  if (part !== null) {
    if (!isGroup(geometry) || !Object.hasOwn(geometry.parts, part)) return null
    target = geometry.parts[part]
  }
  if (isEmpty(target)) throw readError('is empty — there is nothing to measure')
  return measureBounds(memoBoundsOf(target), quantity)
}

/**
 * A formula reader over a view of the fold.
 *
 * @param {FormulaReadView} view
 * @returns {import('./formula.js').FormulaRead}
 */
export function formulaReaderOf(view) {
  return (body, part, quantity) => {
    if (body.kind !== 'id') {
      throw readError(`reads ${quoted(body.text)} by name — a saved formula names each body by its #id`)
    }
    const root = view.rootOf(body.text)
    if (root === undefined) throw readError(`reads #${quoted(body.text)}, but there is no body #${quoted(body.text)}`)
    const name = quoted(view.nameOf(root))
    if (view.deleted(root)) throw readError(`reads ${name}, which has been deleted`)
    if (view.suppressed(root)) throw readError(`reads ${name}, which is suppressed`)
    const at = view.indexOf(root)
    if (at >= view.activeCount) throw readError(`reads ${name}, which is after the rollback marker`)
    if (at >= view.atIndex) throw readError(`reads ${name}, which is not built until step ${at + 1}`)
    const terminal = view.terminalOf(root)
    const geometry = terminal === undefined ? undefined : view.geometryOf(terminal)
    if (geometry === undefined) {
      throw readError(view.leftOut(root) === 'condition' ? `reads ${name}, which its condition leaves out` : `reads ${name}, which is not being built`)
    }
    /** @type {number | null} */
    let value
    try {
      value = quantityOf(geometry, part, quantity)
    } catch (error) {
      if (!(error instanceof FormulaError)) throw error
      throw readError(`reads ${name}${part === null ? '' : `.${quoted(part)}`}, which ${error.message}`)
    }
    if (value === null) {
      const label = `${name}.${quoted(/** @type {string} */ (part))}`
      if (!isGroup(geometry)) throw readError(`reads ${label}, but ${name} has no parts`)
      const names = Object.keys(geometry.parts)
      const listed = names.slice(0, LISTED_PARTS).map(quoted).join(', ') + (names.length > LISTED_PARTS ? `, … (${names.length} in all)` : '')
      throw readError(`reads ${label}, but ${name} has no part ${quoted(/** @type {string} */ (part))} — its parts are: ${listed}`)
    }
    view.onRead?.({ root, part, quantity, value })
    return value
  }
}
