// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Which operands a boolean record **retires** — its `consumes` (`TODO/core-064`).
 *
 * `consumes` is decided by whoever writes the record (`document.js`'s consumption note), and
 * two writers write booleans: the Operations toolbar's `run()` and the AI `operate` tool
 * (`src/ai/tools/operate.js`, which the MCP server shares). Both ask this module, so the
 * rule cannot drift between a click and a model's tool call.
 *
 * ## The rule
 *
 * Every operand is retired, as it always was, **except** a cutting operand of a Subtract that
 * names only **drill parts** of its body: `{ id, pieces: 'hole1' }` on a Raspberry Pi. That
 * body stays in the scene, so the same Pi can drill `hole2` next, and a user drilling four
 * holes places one Pi, not four (the user's decision of 2026-10-17). Precisely:
 *
 * - the op is `boolean.subtract`, and the operand is not the first one (the base is always
 *   the thing being cut, so it is always retired);
 * - the operand is a sub-part address, and every part it lists is one of the drill parts the
 *   body's creation op declares (`drillPartsOf` in `kernel/registry.js`; today only
 *   `raspberrypi.bplus`: `hole1`–`hole4`, `fan1hole`, `fan2hole`). A hole mixed with any
 *   other part (`hole1,usb1`) is a cut with the board, and retires it;
 * - the body's lineage root is still that recipe: a Pi that was itself the base of an earlier
 *   cut is a Subtract result now, not a Pi.
 *
 * Union, Intersect and Group retire everything. So does a fastener's `tap`: acceptance
 * scenario 5 records the bolt leaving the Objects list, and nothing in `core-064` asked to
 * change that.
 *
 * ## What survival means for the rest of the document
 *
 * Nothing new: the Subtract reads the Pi's record as it was at that step, through `operands`,
 * exactly as a Snap reads its reference body. Undo, delete, reorder, the load cascade and
 * part capture all follow `operands` already, so the dependency is seen without `consumes`.
 * No record field changed shape, so old project files and the merge format are unaffected: a
 * Subtract saved before this task still lists the Pi in `consumes`, and still means that.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 *
 * @module core/booleanConsumes
 */

import { drillPartsOf } from './kernel/registry.js'

/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/** The one op whose cutting operand may survive. */
const SUBTRACT_OP = 'boolean.subtract'

/**
 * One operand of a boolean about to be written.
 *
 * @typedef {object} BooleanOperand
 * @property {string} terminal The record that currently represents the body — what
 *   `consumes` names.
 * @property {string | { id: string, pieces: string }} ref How the record's `target` or
 *   `operands` names it: the terminal id, or a sub-part address of it.
 */

/**
 * The two document questions the rule asks. A `WarpDocument` is one.
 *
 * @typedef {object} LineageView
 * @property {(id: string) => string | undefined} rootOf The lineage root of any record id.
 * @property {(id: string) => OpRecord | undefined} recordOf
 */

/**
 * The part names an operand addresses, or `[]` for a whole body.
 *
 * @param {BooleanOperand['ref']} ref
 * @returns {string[]}
 */
function piecesOf(ref) {
  if (typeof ref !== 'object' || ref === null || typeof ref.pieces !== 'string') return []
  return ref.pieces
    .split(',')
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0)
}

/**
 * Does this operand's body **survive** the boolean being written? See the module note.
 *
 * @param {LineageView} view
 * @param {string} op The boolean's registry key, e.g. `'boolean.subtract'`.
 * @param {BooleanOperand} operand
 * @param {number} index Its position: 0 is the base (`target`), 1+ are the cutting operands.
 * @returns {boolean}
 */
export function keepsToolBody(view, op, operand, index) {
  if (op !== SUBTRACT_OP || index < 1) return false
  const pieces = piecesOf(operand.ref)
  if (pieces.length === 0) return false
  const root = view.rootOf(operand.terminal)
  const creation = root === undefined ? undefined : view.recordOf(root)
  if (creation === undefined) return false
  const drills = drillPartsOf(creation.op)
  return drills.length > 0 && pieces.every((piece) => drills.includes(piece))
}

/**
 * The `consumes` a boolean (or Group) record should carry: every operand's terminal id, in
 * operand order, once each, except the bodies {@link keepsToolBody} leaves in the scene. Never
 * empty, since the base is always retired.
 *
 * @param {LineageView} view
 * @param {string} op
 * @param {readonly BooleanOperand[]} operands The base first, as the record's `target`.
 * @returns {string[]}
 */
export function consumesOf(view, op, operands) {
  // A Set, so a body named twice is listed once (the document refuses a duplicate). A body
  // named by a hole *and* by its USB jack is retired: the second address cuts with the board.
  /** @type {Set<string>} */
  const retired = new Set()
  operands.forEach((operand, index) => {
    if (!keepsToolBody(view, op, operand, index)) retired.add(operand.terminal)
  })
  return [...retired]
}
