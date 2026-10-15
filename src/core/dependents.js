// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The pre-commit **impact check** for a composite param edit (`TODO/ui-052`): before a
 * Pi 4 becomes a Pi 5, which records elsewhere in the document would stop building
 * because of it — and why, in words a user can act on.
 *
 * ## One evaluator, not two
 *
 * The check is the document's own fold, run over the candidate log in a throwaway
 * document with `tolerateAll` (`document.js`'s `foldActive`): every failing row is folded
 * as identity and reported instead of aborting the fold, so one broken snap cannot hide
 * a second one after it. The breakages are then **diffed against the live document's**
 * — only a row that builds today and would not tomorrow is the user's new problem; a row
 * already left broken is not re-reported. So a part-name breakage (`pieces: 'avjack'` on
 * a board with no AV jack) and any other re-fold failure (a fillet that no longer fits a
 * smaller bolt head) come out of the same mechanism, with no second evaluator to drift.
 *
 * ## Main thread, deliberately
 *
 * The task asked for this to be a job in the evaluation worker, on the premise that
 * `core-030`/`core-031` had moved the fold there. They did not: `core-031` chose a
 * per-record fold cache over moving the fold (`document.js`'s module note), so every row
 * action already folds on the main thread. The check shares the live document's cache,
 * so everything but the edited composite is a cache hit, and a whole Raspberry Pi
 * recipe builds in under 10 ms — measured, see the task's retirement note.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM, no three.js.
 *
 * @module core/dependents
 */

import { createDocument, foldableEntry } from './document.js'
import { isGroup } from './kernel/group.js'
import { nameOverrideOf } from './naming.js'
import { paramOptions, partAliasesOf } from './kernel/registry.js'
import { consumersOf, resolveParams, setVariableRevision, variablesOf } from './variables.js'

/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./document.js').RecordRevision} RecordRevision */
/** @typedef {import('./document.js').BrokenStep} BrokenStep */
/** @typedef {import('./kernel/registry.js').OpRecord} OpRecord */

/**
 * One dependent a change breaks — a row of the repair dialog.
 *
 * @typedef {object} Breakage
 * @property {string} dependentRecordId The record that no longer builds.
 * @property {string} dependentBodyId The body it belongs to — its lineage root, e.g. the
 *   cube a snap moved; for a boolean, the boolean's own result.
 * @property {string} dependentName That body's display name, e.g. `Cube 1`.
 * @property {number} step Its 1-based History row.
 * @property {string} relationship `Snap → avjack`, `Subtract (operand) →
 *   clearance-avjack`, or the op's own verb (`Fillet`) when no part is involved.
 * @property {boolean} placement A Snap or Align — the only kind Detach is offered for.
 * @property {string[]} missingPieces Named parts it uses that the new variant lacks.
 * @property {string[]} newParts Every part the new variant has, for the Remap select.
 * @property {Record<string, string>} suggestions Missing piece → a real alias on the new
 *   variant, only where the recipe declares one. Never a fuzzy match.
 * @property {string} reason `Pi 5 has no part named \`avjack\``, or the kernel's own
 *   message.
 * @property {string[]} refIds The ids of this record's operands that belong to the
 *   edited body — the references a Remap rewrites.
 */

/** Verb per op, for a breakage's relationship column. */
const RELATIONSHIP_VERBS = Object.freeze({
  'group.snap': 'Snap',
  'group.align': 'Align',
  'boolean.subtract': 'Subtract (operand)',
  'boolean.union': 'Union (operand)',
  'boolean.intersect': 'Intersect (operand)',
  'modify.filletRim': 'Fillet',
  'modify.chamferRim': 'Chamfer',
  'modify.enlarge': 'Resize',
  'modify.fit': 'Fit',
  'modify.bisect': 'Bisect',
  'transform.translate': 'Move',
  'transform.rotate': 'Rotate',
  'transform.mirror': 'Mirror',
  'group.assemble': 'Group',
})

/** The two ops that *place* one body against another. */
const PLACEMENT_OPS = Object.freeze(new Set(['group.snap', 'group.align']))

/**
 * Apply revisions to a copy of the log — the same substitution `reviseRecords` makes.
 *
 * @param {WarpDocument} document
 * @param {readonly RecordRevision[]} changes
 */
function revisedEntries(document, changes) {
  const byId = new Map(changes.map((change) => [change.id, change]))
  return document.entries.map((entry) => {
    const base = foldableEntry(entry)
    const change = byId.get(/** @type {string} */ (entry.record.id))
    if (change === undefined) return base
    const record = change.record ?? base.record
    const leftBroken = change.leftBroken ?? base.leftBroken === true
    const { leftBroken: _flag, ...rest } = base
    return leftBroken ? { ...rest, record, leftBroken: true } : { ...rest, record }
  })
}

/**
 * Fold the candidate log in a throwaway document that tolerates every failure.
 *
 * @param {WarpDocument} document
 * @param {readonly RecordRevision[]} changes
 * @returns {WarpDocument}
 */
function previewOf(document, changes) {
  const preview = createDocument({ foldCache: document.foldCache, resolution: document.resolution() })
  preview.loadEntries(revisedEntries(document, changes), document.rollbackAt(), document.resolution(), {
    tolerateAll: true,
  })
  return preview
}

/**
 * The label of the variant a body now is — `Pi 5`, `1/4 socket` — for "`Pi 5` has no
 * part named …". Reads the first enum param that changed, else the first enum at all.
 *
 * @param {OpRecord | undefined} root The edited body's creation record, as it is now.
 * @param {Record<string, any>} [previous] Its params before the change, if any.
 * @param {ReadonlyMap<string, import('./variables.js').Variable>} [variables] A param bound
 *   to a project variable (`TODO/core-050`) is read at the variable's value, never as the
 *   `{ "$var" }` object — or the label would be `[object Object]`.
 * @returns {string | null}
 */
function variantLabelOf(root, previous, variables = undefined) {
  if (root === undefined) return null
  const params = variables === undefined ? (root.params ?? {}) : resolveParams(root.params ?? {}, variables).params
  const enums = Object.entries(paramOptions(root.op, params)).filter(([, field]) => field.kind === 'enum')
  const before = previous && variables !== undefined ? resolveParams(previous, variables).params : previous
  const changed = before ? enums.find(([key]) => !Object.is(before[key], params[key])) : undefined
  const [key, field] = changed ?? enums[0] ?? []
  if (key === undefined || field === undefined || field.kind !== 'enum') return root.name ?? null
  return field.options.find((option) => Object.is(option.value, params[key]))?.label ?? String(params[key])
}

/**
 * Describe one broken row as a {@link Breakage}.
 *
 * @param {WarpDocument} before The live document — lineage and names as the user knows them.
 * @param {WarpDocument} after The document the row is broken in.
 * @param {BrokenStep} step
 * @param {string} editedRootId
 * @param {Record<string, any>} [previousParams]
 * @returns {Breakage}
 */
function describeBreakage(before, after, step, editedRootId, previousParams) {
  const record = /** @type {OpRecord} */ (after.recordOf(step.id))
  const editedRoot = after.recordOf(editedRootId)

  /** @type {string[]} */
  const refIds = []
  /** @type {string[]} */
  const pieces = []
  for (const ref of [record.target, ...(record.operands ?? [])]) {
    const refId = typeof ref === 'string' ? ref : ref?.id
    if (typeof refId !== 'string' || before.rootOf(refId) !== editedRootId) continue
    refIds.push(refId)
    if (typeof ref === 'object' && typeof ref.pieces === 'string') {
      for (const piece of ref.pieces.split(',')) if (piece.trim()) pieces.push(piece.trim())
    }
  }

  // What the new variant actually has, off the preview fold itself.
  const value = refIds.map((id) => after.scene.byId.get(id)).find((candidate) => candidate !== undefined)
  const newParts = value !== undefined && isGroup(value) ? Object.keys(value.parts) : []
  const missingPieces = value === undefined ? [] : pieces.filter((piece) => !newParts.includes(piece))

  const aliases = editedRoot ? partAliasesOf(editedRoot.op) : {}
  /** @type {Record<string, string>} */
  const suggestions = {}
  for (const piece of missingPieces) {
    const alias = aliases[piece]
    if (alias !== undefined && newParts.includes(alias)) {
      suggestions[piece] = alias
      continue
    }
    // A hidden `clearance-<x>` follows whatever `<x>` itself is an alias of.
    if (piece.startsWith('clearance-')) {
      const partAlias = aliases[piece.slice('clearance-'.length)]
      const clearance = partAlias === undefined ? undefined : `clearance-${partAlias}`
      if (clearance !== undefined && newParts.includes(clearance)) suggestions[piece] = clearance
    }
  }

  const verb = /** @type {Record<string, string>} */ (RELATIONSHIP_VERBS)[record.op] ?? record.op
  const relationship = pieces.length > 0 ? `${verb} → ${pieces.join(',')}` : verb

  let reason = step.reason.replace(/^can't be built: /, '')
  if (missingPieces.length > 0) {
    const variant = variantLabelOf(editedRoot, previousParams, new Map(variablesOf(after).map((variable) => [variable.name, variable]))) ?? 'The new version'
    const names = missingPieces.map((piece) => `\`${piece}\``).join(', ')
    reason = `${variant} has no ${missingPieces.length === 1 ? 'part' : 'parts'} named ${names}`
  }

  const dependentBodyId = before.rootOf(step.id) ?? after.rootOf(step.id) ?? step.id
  const bodyRecord = before.recordOf(dependentBodyId) ?? after.recordOf(dependentBodyId)
  const beforeLineage = before.lineageOf(dependentBodyId)
  const renamedLineage = beforeLineage.length > 0 ? beforeLineage : after.lineageOf(dependentBodyId)
  return {
    dependentRecordId: step.id,
    dependentBodyId,
    // `TODO/core-038`: what the user calls it now, rename included.
    dependentName: nameOverrideOf(renamedLineage) ?? bodyRecord?.name ?? dependentBodyId,
    step: step.step,
    relationship,
    placement: PLACEMENT_OPS.has(record.op),
    missingPieces,
    newParts,
    suggestions,
    reason,
    refIds,
  }
}

/**
 * What would a set of revisions newly break?
 *
 * @param {WarpDocument} document The live document. Not modified.
 * @param {readonly RecordRevision[]} changes The candidate revision — for a param edit,
 *   the composite's replaced creation record.
 * @param {{ editedRootId: string }} options Which body is being edited.
 * @returns {{ breakages: Breakage[], preview: WarpDocument }} `preview` is the candidate
 *   document itself — where every dependent that still builds now sits.
 * @throws {Error} When the edited body itself would not build: that is a bad value, not
 *   a dependent to repair, and the Inspector shows it like any other rejected edit.
 */
export function impactOf(document, changes, { editedRootId }) {
  const preview = previewOf(document, changes)
  const already = new Set(document.brokenSteps().map((step) => step.id))
  const activeCount = document.rollbackAt() ?? document.entries.length
  const activeIds = new Set(document.entries.slice(0, activeCount).map((entry) => entry.record.id))
  const previousParams = document.recordOf(editedRootId)?.params ?? {}

  /** @type {Breakage[]} */
  const breakages = []
  for (const step of preview.brokenSteps()) {
    if (already.has(step.id) || !activeIds.has(step.id)) continue
    if (step.id === editedRootId) throw new Error(step.reason.replace(/^can't be built: /, ''))
    breakages.push(describeBreakage(document, preview, step, editedRootId, previousParams))
  }
  return { breakages, preview }
}

/**
 * The rows **already** left broken against one body — what the Inspector's warning
 * banner counts and what **Resolve…** reopens the dialog with.
 *
 * @param {WarpDocument} document
 * @param {string} rootId The body whose parts the rows refer to.
 * @returns {Breakage[]}
 */
export function brokenDependentsOf(document, rootId) {
  /** @type {Breakage[]} */
  const list = []
  for (const step of document.brokenSteps()) {
    const record = document.recordOf(step.id)
    if (record === undefined) continue
    const refs = [record.target, ...(record.operands ?? [])]
    const own = document.rootOf(step.id) === rootId
    const touches = refs.some((ref) => {
      const refId = typeof ref === 'string' ? ref : ref?.id
      if (typeof refId !== 'string' || document.rootOf(refId) !== rootId) return false
      // A body's own rows do not *depend* on it — a snap's bare `target` is just the
      // body it moves — unless the row addresses one of the body's own **parts**: the
      // Pi snapped *by* its AV jack depends on that jack as much as a cube snapped *to*
      // it does, and its banner has to offer Resolve… just the same.
      return !own || (typeof ref === 'object' && typeof ref.pieces === 'string')
    })
    if (!touches) continue
    list.push(describeBreakage(document, document, step, rootId))
  }
  return list
}

/**
 * @typedef {object} BrokenReference
 * @property {string} recordId The broken row in this body's own history.
 * @property {string} refBodyId The body it depends on — what Resolve… repairs against.
 * @property {string} refBodyName
 * @property {string} relationship As {@link Breakage}'s.
 * @property {string[]} pieces The named parts it uses on that body.
 * @property {string} reason
 */

/**
 * The other side of {@link brokenDependentsOf}: the broken rows in **this** body's own
 * history that depend on another body — what the dependent's Inspector banner says
 * (`Snapped to Raspberry Pi 1 ▸ avjack, which no longer exists.`).
 *
 * @param {WarpDocument} document
 * @param {string} bodyId
 * @returns {BrokenReference[]}
 */
export function brokenReferencesOf(document, bodyId) {
  /** @type {BrokenReference[]} */
  const list = []
  for (const step of document.brokenSteps()) {
    if (document.rootOf(step.id) !== bodyId) continue
    const record = document.recordOf(step.id)
    if (record === undefined) continue
    for (const ref of [record.target, ...(record.operands ?? [])]) {
      const refId = typeof ref === 'string' ? ref : ref?.id
      const refBodyId = typeof refId === 'string' ? document.rootOf(refId) : undefined
      if (refBodyId === undefined || refBodyId === bodyId) continue
      const breakage = describeBreakage(document, document, step, refBodyId)
      list.push({
        recordId: step.id,
        refBodyId,
        refBodyName: nameOverrideOf(document.lineageOf(refBodyId)) ?? document.recordOf(refBodyId)?.name ?? refBodyId,
        relationship: breakage.relationship,
        pieces: typeof ref === 'object' && typeof ref.pieces === 'string' ? ref.pieces.split(',') : [],
        reason: breakage.reason,
      })
      break
    }
  }
  return list
}

/**
 * What would changing a project variable newly break (`TODO/core-050`)?
 *
 * Editing a variable's value is, in effect, editing every bound record at once, so this is
 * {@link impactOf}'s check run over **all** of them: the candidate log (the definition
 * record with the new value) folded in a throwaway, tolerant document, its broken rows
 * diffed against the live document's. Unlike a single param edit, a bound record that
 * itself no longer builds is *reported* here rather than thrown — it is one of several
 * consumers, and the user needs the whole list, by name, before committing.
 *
 * @param {WarpDocument} document The live document. Not modified.
 * @param {string} name
 * @param {number | boolean | string} value
 * @returns {{ breakages: Breakage[], preview: WarpDocument, consumers: import('./variables.js').VariableConsumer[] }}
 *   `consumers` is every binding and condition that reads the variable, in log order.
 * @throws {import('./variables.js').VariableError} For an unknown variable, or a value
 *   outside the variable's own kind, range or options — the value itself is wrong.
 */
export function variableImpactOf(document, name, value) {
  const consumers = consumersOf(document.entries, name)
  const revision = setVariableRevision(document, name, value)
  if (revision === null) return { breakages: [], preview: previewOf(document, []), consumers }
  const preview = previewOf(document, [revision])
  const already = new Set(document.brokenSteps().map((step) => step.id))
  const activeCount = document.rollbackAt() ?? document.entries.length
  const activeIds = new Set(document.entries.slice(0, activeCount).map((entry) => entry.record.id))
  const boundRoots = new Set(
    consumers.map((consumer) => document.rootOf(consumer.recordId)).filter((id) => id !== undefined),
  )

  /** @type {Breakage[]} */
  const breakages = []
  for (const step of preview.brokenSteps()) {
    if (already.has(step.id) || !activeIds.has(step.id)) continue
    // The body the breakage is "against": a bound body this row references, else its own.
    const record = preview.recordOf(step.id)
    const refRoots = [record?.target, ...(record?.operands ?? [])]
      .map((ref) => (typeof ref === 'string' ? ref : ref?.id))
      .map((id) => (typeof id === 'string' ? document.rootOf(id) : undefined))
    const editedRootId =
      refRoots.find((root) => root !== undefined && boundRoots.has(root)) ?? document.rootOf(step.id) ?? step.id
    breakages.push(describeBreakage(document, preview, step, editedRootId))
  }
  return { breakages, preview, consumers }
}
