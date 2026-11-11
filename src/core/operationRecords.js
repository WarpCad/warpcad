// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The record each operation is appended with (`TODO/core-081`): one builder per operation
 * family, shared by the Operations toolbar, its popovers and the AI `operate` tool, so a click
 * and a tool call write the same record for the same operands.
 *
 * Callers keep what is theirs: reading the selection (or resolving a tool call's ids), calling
 * a builder, appending with their own origin, and showing a refusal. The rules live here:
 *
 * - **Id prefixes.** `bool`, `group`, `mirror`, `snap`, `align`, and one per in-place edit
 *   ({@link IN_PLACE_PREFIXES}). Each builder mints its id from `document.nextId`.
 * - **A boolean** is named after its verb, takes the first operand as `target` and the rest as
 *   `operands` (each possibly a `{ id, pieces }` part address), and `consumes` what
 *   `consumesOf` says (`TODO/core-064`: a drilling Pi stays).
 * - **An in-place edit** (fillet, chamfer, enlarge, fit, bisect, split, hide/rename a part) is
 *   unnamed, and `target` and `supersedes` are both the body's *terminal* record, never a part
 *   address. `Body.name` is read off the lineage root only, so a name here would be inert.
 * - **Snap and Align** address the moving body (`target` may be a part), keep the reference
 *   as their one operand, and `supersedes` the moving body's bare terminal id.
 * - **Group** names its parts after the operands' *body* names, not their labels, so a
 *   drilled-in operand joins as "Cube 1", never "Group 1 › Cube 1"; it groups whole bodies by
 *   terminal id. A recoloured operand goes through the merge planner (`TODO/core-077`).
 * - **Mirror** is a new body: named, `target` only, no `supersedes` or `consumes`, carrying
 *   the reflected rotation of the body it copies.
 *
 * Whether a boolean is built off-thread (`TODO/core-079`) is the document store's decision at
 * append time, not part of the record.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 *
 * @module core/operationRecords
 */

import { consumesOf } from './booleanConsumes.js'
import { hasMergeableParts, planGroupMerge } from './groupMerge.js'
import { mirrorRotationDeg } from './kernel/group.js'

/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */
/** @typedef {import('./groupMerge.js').GroupMergePlan} GroupMergePlan */

/**
 * One operand, as both callers resolve it.
 *
 * @typedef {object} RecordOperand
 * @property {string} id The body's lineage-root id.
 * @property {string} terminal The record currently representing it.
 * @property {string} name The body's own name, with no part attached.
 * @property {string | { id: string, pieces: string }} ref The terminal id, or a part address of it.
 */

/** The label each boolean's result is numbered by ("Subtract 1"). */
export const BOOLEAN_LABELS = Object.freeze({
  'boolean.union': 'Union',
  'boolean.subtract': 'Subtract',
  'boolean.intersect': 'Intersect',
})

/** The id prefix of each one-body edit in place. */
export const IN_PLACE_PREFIXES = Object.freeze({
  'modify.filletRim': 'fillet',
  'modify.chamferRim': 'chamfer',
  'modify.enlarge': 'enlarge',
  'modify.fit': 'fit',
  'modify.bisect': 'bisect',
  'modify.splitWithJoint': 'split',
  'group.setPartHidden': 'hide',
  'group.renamePart': 'renamepart',
})

/** The id prefix of each positioning op. */
const POSITION_PREFIXES = Object.freeze({ 'group.snap': 'snap', 'group.align': 'align' })

/**
 * A UI selection operand (`composables/useSelectedBody.js`'s `SelectedOperand`) as a builder
 * operand.
 *
 * @param {{ rootId: string, terminalId: string, name: string, ref: string | { id: string, pieces: string } }} selected
 * @returns {RecordOperand}
 */
export function operandFromSelection(selected) {
  return { id: selected.rootId, terminal: selected.terminalId, name: selected.name, ref: selected.ref }
}

/**
 * A Union, Subtract or Intersect. See the module note.
 *
 * @param {WarpDocument} document
 * @param {string} op
 * @param {readonly RecordOperand[]} operands The base first.
 * @returns {OpRecord}
 */
export function booleanRecord(document, op, operands) {
  const label = /** @type {Record<string, string>} */ (BOOLEAN_LABELS)[op]
  if (label === undefined) throw new Error(`${op} is not a boolean`)
  if (operands.length < 2) throw new Error(`${op} needs 2 or more operands, got ${operands.length}`)
  return {
    id: document.nextId('bool'),
    op,
    name: document.nextName(label),
    // `target` before `operands` is the fold's input order: the first operand is the minuend.
    target: operands[0].ref,
    operands: operands.slice(1).map((operand) => operand.ref),
    consumes: consumesOf(document, op, operands),
  }
}

/**
 * A one-body edit in place. See the module note. `params` are written as given.
 *
 * @param {WarpDocument} document
 * @param {string} op
 * @param {RecordOperand} operand
 * @param {Record<string, any>} params
 * @returns {OpRecord}
 */
export function inPlaceRecord(document, op, operand, params) {
  const prefix = /** @type {Record<string, string>} */ (IN_PLACE_PREFIXES)[op]
  if (prefix === undefined) throw new Error(`${op} is not an in-place edit`)
  return { id: document.nextId(prefix), op, target: operand.terminal, supersedes: operand.terminal, params }
}

/**
 * Bisect's params. Without a tilt it is the plain two-field shape, with no tilt keys at all;
 * with one, `rotateOffsetMm` is left out unless it is a number, because an omitted hinge is the
 * third axis's centre and a literal `0` is its minimum face.
 *
 * @param {{ axis: string, offsetMm: number | null, angleDeg?: number | null, rotateAxis?: string, rotateOffsetMm?: number | null }} input
 * @returns {Record<string, any>}
 */
export function bisectParams({ axis, offsetMm, angleDeg, rotateAxis, rotateOffsetMm }) {
  const tilted = typeof angleDeg === 'number' && Number.isFinite(angleDeg) && angleDeg !== 0
  if (!tilted) return { axis, offsetMm }
  return {
    axis,
    offsetMm,
    angleDeg,
    ...(rotateAxis === undefined ? {} : { rotateAxis }),
    ...(typeof rotateOffsetMm === 'number' && Number.isFinite(rotateOffsetMm) ? { rotateOffsetMm } : {}),
  }
}

/**
 * Group (`group.assemble`), over bodies with no named parts. See the module note. A body with
 * parts is refused: the Group popover's merge ({@link groupMergeRecord}) is the way to keep them.
 *
 * @param {WarpDocument} document
 * @param {readonly RecordOperand[]} operands
 * @param {readonly string[]} [names] One part name per operand. Default: each body's own name.
 * @returns {OpRecord}
 */
export function groupRecord(document, operands, names = operands.map((operand) => operand.name)) {
  const op = 'group.assemble'
  const composite = operands.find((operand) => hasMergeableParts(document.scene.byId.get(operand.terminal)))
  if (composite !== undefined) {
    throw new Error(
      `${op}: ${composite.name} has named parts, and this would flatten them into one. ` +
        'Use group.merge to keep them; a member with a name keeps one body whole as a single part.'
    )
  }
  if (names.length !== operands.length) throw new Error(`${op}: give one name per operand — ${operands.length} operands, ${names.length} names`)
  const trimmed = names.map((name) => name.trim())
  if (trimmed.some((name) => name === '' || name.length > 80)) throw new Error(`${op}: each part name must be 1 to 80 characters`)
  if (new Set(trimmed).size !== trimmed.length) throw new Error(`${op}: part names must be unique, got ${JSON.stringify(trimmed)}`)
  // `TODO/core-077`: a recoloured operand keeps its colour only in a `group.merge` record, so the
  // planner decides; with no colour to keep it writes the same `group.assemble` as below.
  const planned = planGroupMerge(
    document,
    operands.map(({ id, terminal, name }) => ({ id, terminal, name })),
    trimmed.map((name) => ({ name }))
  )
  if (planned.record?.op === 'group.merge') return { id: document.nextId('group'), ...planned.record }
  return {
    id: document.nextId('group'),
    op,
    name: document.nextName('Group'),
    target: operands[0].terminal,
    operands: operands.slice(1).map((operand) => operand.terminal),
    consumes: operands.map((operand) => operand.terminal),
    params: { names: trimmed },
  }
}

/**
 * A planned Group (`core/groupMerge.js`'s {@link planGroupMerge}) as a record, under a fresh
 * id. Refused with the plan's own errors when it has no record.
 *
 * @param {WarpDocument} document
 * @param {GroupMergePlan} plan
 * @returns {OpRecord}
 */
export function groupMergeRecord(document, plan) {
  if (plan.record === null) throw new Error(plan.errors.join(' '))
  return /** @type {OpRecord} */ ({ id: document.nextId('group'), ...plan.record })
}

/**
 * Snap or Align: the moving body (first operand) is superseded, the reference stays. See the
 * module note.
 *
 * @param {WarpDocument} document
 * @param {string} op `group.snap` or `group.align`.
 * @param {readonly RecordOperand[]} operands The moving body, then the reference.
 * @param {Record<string, any>} params
 * @returns {OpRecord}
 */
export function snapAlignRecord(document, op, operands, params) {
  const prefix = /** @type {Record<string, string>} */ (POSITION_PREFIXES)[op]
  if (prefix === undefined) throw new Error(`${op} is not snap or align`)
  if (operands.length !== 2) throw new Error(`${op} needs exactly 2 operands, got ${operands.length}`)
  return {
    id: document.nextId(prefix),
    op,
    // `target` before `operands` is the fold's input order: the moving body is `inputs[0]`.
    target: operands[0].ref,
    operands: [operands[1].ref],
    // A bare record id even when `target` is addressed: it names the record this one continues.
    supersedes: operands[0].terminal,
    params,
  }
}

/**
 * Mirror: a reflected copy as a new body. See the module note. A blank `planeMm` is left out,
 * so the kernel mirrors through the body's own centre.
 *
 * @param {WarpDocument} document
 * @param {RecordOperand} operand
 * @param {{ axis: 'x' | 'y' | 'z', planeMm?: number | null }} input
 * @returns {OpRecord}
 */
export function mirrorRecord(document, operand, { axis, planeMm }) {
  const hasPlane = typeof planeMm === 'number' && Number.isFinite(planeMm)
  /** @type {[number, number, number]} */
  const pointMm = [0, 0, 0]
  if (hasPlane) pointMm[['x', 'y', 'z'].indexOf(axis)] = planeMm
  const source = document.bodies().find((body) => body.id === operand.id)
  return {
    id: document.nextId('mirror'),
    op: 'transform.mirror',
    name: document.nextName('Mirror'),
    target: operand.terminal,
    params: {
      axis,
      ...(hasPlane ? { pointMm } : {}),
      // Without this the copy of a turned part reports a zero rotation and its dimension lines
      // measure the shadow of the box, not the part.
      rotation: mirrorRotationDeg(source?.rotationDeg ?? [0, 0, 0], axis),
    },
  }
}
