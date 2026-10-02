// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Turn the fixes chosen in the repair dialog into one revision (`TODO/ui-052`).
 *
 * Every fix is a revision of an **existing** row, never an appended one — so the model
 * change and every repair go to `document.reviseRecords` together, re-fold once, and are
 * one Undo step that puts back the Pi 4 *and* the original snap, with no half-state.
 *
 * | Fix | What it writes |
 * |---|---|
 * | **Remap** | the dependent's `{ id, pieces }` operand, one piece renamed |
 * | **Detach** | the Snap/Align replaced by the `transform.translate` it amounted to |
 * | **Only when…** | a `when` on the dependent body's creation record (whole body) or on the one dependent record (this operation) |
 * | **Leave broken** | the row's `leftBroken` flag — see `document.js`'s module note |
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 *
 * @module core/repair
 */

import { boundsOf } from './kernel/group.js'

/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./document.js').RecordRevision} RecordRevision */
/** @typedef {import('./dependents.js').Breakage} Breakage */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * @typedef {{ kind: 'remap', pieces: Record<string, string> }
 *   | { kind: 'detach' }
 *   | { kind: 'condition', scope: 'body' | 'operation', values?: any[] }
 *   | { kind: 'leave' }} Fix
 */

/** @typedef {'condition' | 'remap' | 'detach' | 'leave'} FixKind */

/**
 * The edit the dialog is repairing: a composite's replaced creation record, and which
 * enum param changed from what — the old value is what **Only when…** keeps the
 * dependent for. `record` is `null` for **Resolve…**, which repairs an edit that was
 * already committed.
 *
 * @typedef {object} RepairEdit
 * @property {string} rootId
 * @property {OpRecord | null} record
 * @property {string | null} param The enum param that changed, or `null` for a number.
 * @property {any} oldValue
 * @property {any[]} [conditionValues] The values **Only when…** keeps the dependent for,
 *   when they are not simply `[oldValue]` — Resolve… offers the variants that really
 *   have the missing parts, since the value before the committed change is gone.
 */

/**
 * Which fixes a row may choose, in the order the dialog lists them.
 *
 * - **Only when…** only when the change is to an **enum** param — "only when length is
 *   20" is out of scope.
 * - **Remap** only when a named part went missing — there is something to remap.
 * - **Detach** only for a placement (Snap/Align): there is no "keep where it is" for a
 *   boolean's operand.
 * - **Leave broken** always.
 *
 * @param {Pick<Breakage, 'missingPieces' | 'placement'>} breakage
 * @param {{ enumParam: boolean }} context
 * @returns {FixKind[]}
 */
export function offeredFixesOf(breakage, { enumParam }) {
  /** @type {FixKind[]} */
  const kinds = []
  if (enumParam) kinds.push('condition')
  if (breakage.missingPieces.length > 0) kinds.push('remap')
  if (breakage.placement) kinds.push('detach')
  kinds.push('leave')
  return kinds
}

/**
 * The fix a row starts on: the suggested Remap when the recipe has a real alias for every
 * missing part, otherwise Leave broken. **Only when…** is never the default — it changes
 * what the design *means* (one design, two revisions), so the user has to choose it.
 *
 * @param {Pick<Breakage, 'missingPieces' | 'suggestions'>} breakage
 * @returns {Fix}
 */
export function defaultFixOf(breakage) {
  const { missingPieces, suggestions } = breakage
  if (missingPieces.length > 0 && missingPieces.every((piece) => suggestions[piece] !== undefined)) {
    return { kind: 'remap', pieces: { ...suggestions } }
  }
  return { kind: 'leave' }
}

/**
 * A body's bounding-box centre, measured off evaluated geometry.
 *
 * @param {import('./kernel/group.js').Group | import('@jscad/modeling').geometries.geom3.Geom3} geometry
 * @returns {[number, number, number]}
 */
function centreOf(geometry) {
  const [min, max] = boundsOf(geometry)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/**
 * Rename pieces inside every operand that addresses the edited body.
 *
 * @param {WarpDocument} document
 * @param {OpRecord} record
 * @param {string} rootId
 * @param {Record<string, string>} pieces Old piece → new piece.
 * @returns {OpRecord}
 */
function remapped(document, record, rootId, pieces) {
  /**
   * @param {import('./kernel/registry.js').OperandRef} ref
   * @returns {import('./kernel/registry.js').OperandRef}
   */
  const rename = (ref) => {
    if (typeof ref === 'string' || typeof ref.pieces !== 'string') return ref
    if (document.rootOf(ref.id) !== rootId) return ref
    const next = ref.pieces
      .split(',')
      .map((piece) => piece.trim())
      .map((piece) => pieces[piece] ?? piece)
      .join(',')
    return { id: ref.id, pieces: next }
  }
  return {
    ...record,
    ...(record.target !== undefined ? { target: rename(record.target) } : {}),
    ...(record.operands !== undefined ? { operands: record.operands.map(rename) } : {}),
  }
}

/**
 * The plain move a Snap or Align amounted to, measured off the **live** document — so
 * detaching keeps the body exactly where it is on screen now.
 *
 * @param {WarpDocument} document
 * @param {OpRecord} record
 * @returns {OpRecord}
 */
function detached(document, record) {
  const from = typeof record.supersedes === 'string' ? document.scene.byId.get(record.supersedes) : undefined
  const to = record.id === undefined ? undefined : document.scene.byId.get(record.id)
  if (from === undefined || to === undefined) {
    throw new Error(`repair: cannot detach "${record.id}" — its placement has no evaluated geometry to measure`)
  }
  const [fx, fy, fz] = centreOf(from)
  const [tx, ty, tz] = centreOf(to)
  const previous = document.recordOf(/** @type {string} */ (record.supersedes))
  const rotation = previous?.params?.rotation
  return {
    id: record.id,
    op: 'transform.translate',
    // A bare id: a translate edits the one body it supersedes, never a named part.
    target: record.supersedes,
    supersedes: record.supersedes,
    params: {
      vector: [tx - fx, ty - fy, tz - fz],
      ...(Array.isArray(rotation) ? { rotation: rotation.slice() } : {}),
    },
  }
}

/**
 * Turn the dialog's choices into one revision.
 *
 * @param {WarpDocument} document The live document, before the edit.
 * @param {RepairEdit} edit
 * @param {readonly Breakage[]} breakages Every row the dialog listed.
 * @param {Record<string, Fix>} fixes The choice per row, keyed by `dependentRecordId`.
 * @returns {RecordRevision[]} For `document.reviseRecords` — the edit first.
 * @throws {Error} When a row has no fix: Apply stays disabled until every row has one,
 *   and this is the same rule for any caller that skips the dialog.
 */
export function repairChanges(document, edit, breakages, fixes) {
  /** @type {Map<string, RecordRevision>} */
  const changes = new Map()
  if (edit.record !== null) changes.set(edit.rootId, { id: edit.rootId, record: edit.record })

  /**
   * @param {string} id
   * @param {Partial<RecordRevision>} change
   */
  const merge = (id, change) => {
    const previous = changes.get(id) ?? { id }
    changes.set(id, { ...previous, ...change, id })
  }
  /** @param {string} id */
  const recordFor = (id) => {
    const pending = changes.get(id)?.record
    const record = pending ?? document.recordOf(id)
    if (record === undefined) throw new Error(`repair: no step "${id}" in this document`)
    return record
  }

  for (const breakage of breakages) {
    const id = breakage.dependentRecordId
    const fix = fixes[id]
    if (fix === undefined) throw new Error(`repair: no fix chosen for "${id}" (${breakage.dependentName})`)

    if (fix.kind === 'leave') {
      merge(id, { leftBroken: true })
    } else if (fix.kind === 'remap') {
      merge(id, { record: remapped(document, recordFor(id), edit.rootId, fix.pieces), leftBroken: false })
    } else if (fix.kind === 'detach') {
      if (!breakage.placement) throw new Error(`repair: "${id}" is not a Snap or Align, so it cannot be detached`)
      merge(id, { record: detached(document, recordFor(id)), leftBroken: false })
    } else if (fix.kind === 'condition') {
      const values = fix.values ?? edit.conditionValues ?? [edit.oldValue]
      if (edit.param === null || values.length === 0 || values.some((value) => value === undefined)) {
        throw new Error(`repair: "${id}" can only be made conditional on a choice, and this change is not one`)
      }
      const when = { ref: edit.rootId, param: edit.param, in: values }
      // Whole body: the dependent body's creation record — only a *creation* record's
      // condition takes a whole body out. A boolean's result has none (its lineage starts
      // at the boolean itself), so it falls back to this operation.
      const bodyRoot = document.recordOf(breakage.dependentBodyId)
      const creates = bodyRoot !== undefined && bodyRoot.supersedes === undefined && bodyRoot.consumes === undefined
      // Never the edited body itself: "the Pi only exists while the Pi is a Pi 4" would
      // make the Pi 5 delete itself. Its own row (the Pi snapped by its own AV jack) can
      // only be conditioned as this operation.
      const self = breakage.dependentBodyId === edit.rootId
      const target = fix.scope === 'body' && creates && !self ? breakage.dependentBodyId : id
      merge(target, { record: { ...recordFor(target), when } })
      // The row itself no longer needs tolerating once the condition covers it.
      merge(id, { leftBroken: false })
    }
  }
  return [...changes.values()]
}
