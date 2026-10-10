// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The History panel's command adapter (`TODO/ui-032`).
 *
 * `data-004` built all five row actions on the document itself — `replaceRecord`,
 * `setSuppressed`, `canMove`/`moveStep`, `rollBackTo`/`rollForward` — and proved
 * them in `src/core/timeline.spec.js`. **This file builds nothing of that
 * again.** It is the thin reactive layer CLAUDE.md's Architecture note asks for,
 * mirroring `useTransformCommands.js`/`useParamCommands.js`, and it owns exactly
 * four things the core deliberately left to the panel:
 *
 * 1. **A refusal becomes something renderable.** `data-004` *throws* a
 *    {@link ReplayRejection} — the right call for a framework-free module, and
 *    fatal in a click handler. Every action here returns an
 *    {@link RowActionResult} instead, carrying the typed {@link BrokenStep} so
 *    the panel chips the failing row without parsing a message. Nothing is ever
 *    caught and dropped: §15's contract is that the user is *told*, and a silent
 *    `catch` here would be the `SECOND-ATTEMPT.md` failure mode exactly.
 * 2. **The UI-layer rules §18 adds on top of the document's own.** On an
 *    inactive row only Suppress is available; Edit and Move are disabled with
 *    `Roll forward first — inactive steps can't be checked yet`. The document
 *    permits a move there (its static check only rules out what is *provably*
 *    illegal), so this gate is genuinely this layer's, not a duplicate.
 * 3. **Which params a row actually offers**, as fields a form can render —
 *    including the two the user can see but not change, so `Edit` can say why
 *    rather than open an empty form.
 * 4. **The side effects a row action has on the rest of the app**: the preview
 *    ends (§14), the selection is pruned to bodies that still exist, and the
 *    document store refreshes so the viewport re-renders.
 *
 * Each action is **one undoable transaction**, and each passes the selection that
 * preceded it as `meta` — the same convention `src/stores/document.js`'s
 * `appendAll` uses — so §19's "the selection that existed before the undone
 * action is restored" holds for a row action as it does for a placement.
 */

import { ReplayRejection } from '../core/document.js'
import { hasEditableParams, lookupEntry, paramOptions } from '../core/kernel/registry.js'
import { stepParamEditRecord, stepParamEditability } from '../core/paramEdit.js'
import { RIM_FACE_OPTIONS, buildNameIndex, describeRow } from '../core/timelineLabel.js'
import { useDocumentStore } from '../stores/document.js'
import { useRepairDialogStore } from '../stores/repairDialog.js'
import { useSelectionStore } from '../stores/selection.js'
import { useTimelineStore } from '../stores/timeline.js'
import { useParamCommands } from './useParamCommands.js'

/** @typedef {import('../core/document.js').BrokenStep} BrokenStep */

/**
 * @typedef {object} RowActionResult
 * @property {boolean} ok
 * @property {string} [message] Why it was refused, ready to show. Never absent
 *   when `ok` is `false`.
 * @property {BrokenStep | null} [broken] The row to chip, when one is named.
 */

/**
 * @typedef {object} StepField
 * @property {string} key The param name, as the record stores it.
 * @property {string} label What the form calls it.
 * @property {'number' | 'vector' | 'choice' | 'text' | 'boolean'} kind
 * @property {any} value
 * @property {ReadonlyArray<{ value: any, label: string }>} [choices]
 * @property {ReadonlyArray<string>} [axes] `vector` only: per-component labels.
 */

/** §18's shared refusal for Edit and Move on a row past the marker. */
const INACTIVE_REASON = "Roll forward first — inactive steps can't be checked yet"

/**
 * Params a past-step edit may never write. Mirrors `paramEdit.js`'s own
 * `RESERVED_STEP_PARAMS`, which is private to that module — repeated here only
 * to *explain* the refusal in the UI, never to decide it. `stepParamEditRecord`
 * remains the thing that actually enforces it.
 */
const RESERVED = Object.freeze(new Set(['rotation', 'segments']))

/** Friendly names for the param keys the registry's ops actually use. */
const FIELD_LABELS = Object.freeze({
  radius: 'Radius',
  orientation: 'Face',
  size: 'Size',
  center: 'Position',
  diameter: 'Diameter',
  height: 'Height',
  vector: 'Offset',
  deltaMm: 'Change by',
  sizeMm: 'Fit to',
  offsetMm: 'Offset',
  axis: 'Axis',
  keepAspectRatio: 'Keep proportions',
})

/** @param {string} key */
function labelForField(key) {
  return (
    /** @type {Record<string, string>} */ (FIELD_LABELS)[key] ??
    key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase()
  )
}

/**
 * Turn a thrown core error into something the panel can render.
 *
 * **The message is rebuilt, not passed through.** `ReplayRejection.message` is
 * composed from `BrokenStep.label`, which is `document.js`'s deliberately
 * shallow verb-plus-subject (`Fillet Cube 1`) — and that typedef says outright
 * that "`ui-032` renders its own richer label and may ignore this". Section 15's
 * specified message is the *rich* one:
 *
 * > `Step 4 (Fillet Top (+Z) 4 mm on Cube 1) can't be built: radius 4 mm doesn't fit`
 *
 * Without the face and the radius, a document with two fillets on one body
 * produces two identical refusals and the user cannot tell which row to go fix
 * — which is most of the value of naming the row at all.
 *
 * @param {unknown} error
 * @param {(id: string) => string | null} richLabel
 * @param {string} [prefix] Section 18's `Can't roll forward: ` framing.
 * @returns {RowActionResult}
 */
function refusal(error, richLabel, prefix = '') {
  if (error instanceof ReplayRejection) {
    const step = error.step
    const label = richLabel(step.id) ?? step.label
    return {
      ok: false,
      message: `${prefix}Step ${step.step} (${label}) ${step.reason}`,
      broken: step,
    }
  }
  const raw = error instanceof Error ? error.message : String(error)
  // The core names itself in its thrown messages (`document.moveStep: …`),
  // which is right for a developer error and noise in a row's status line.
  return { ok: false, message: `${prefix}${raw.replace(/^document\.\w+: /, '')}`, broken: null }
}

export function useTimelineCommands() {
  const documentStore = useDocumentStore()
  const timelineStore = useTimelineStore()
  const selection = useSelectionStore()
  const repairDialog = useRepairDialogStore()
  const paramCommands = useParamCommands()

  /** The transaction envelope every row action shares (§19's selection restore). */
  function transaction() {
    return { origin: 'local', meta: { selectionBefore: [...selection.ids] } }
  }

  /** @param {string} id */
  function rowFor(id) {
    return timelineStore.rows.find((row) => row.id === id) ?? null
  }

  /**
   * The rich label for a row id, for a refusal message. Read off the *log*
   * rather than the rendered row list, because the failing row may be one the
   * panel is not currently showing.
   *
   * @param {string} id
   * @returns {string | null}
   */
  function richLabel(id) {
    const record = documentStore.raw.recordOf(id)
    if (record === undefined) return null
    return describeRow(record, buildNameIndex(documentStore.raw.records))
  }

  /**
   * Everything that has to happen *around* a successful row action.
   *
   * §14: "any row action ends the preview and returns the viewport to the latest
   * state — the scenario's 'sphere is untouched' check needs the sphere
   * visible." And a suppress or an edit can retire a body the user had selected,
   * which would otherwise leave the gizmo attached to nothing.
   */
  function settle() {
    documentStore.refresh()
    timelineStore.endPreview()
    timelineStore.clearError()
    const live = new Set(documentStore.bodies.map((body) => body.id))
    const survivors = selection.ids.filter((id) => live.has(id))
    if (survivors.length !== selection.ids.length) {
      if (survivors.length === 0) selection.clear()
      else selection.selectMany(survivors)
    }
  }

  /**
   * @param {RowActionResult} result
   * @returns {RowActionResult}
   */
  function report(result) {
    if (!result.ok) timelineStore.setError(result.message ?? '', result.broken ?? null)
    return result
  }

  /**
   * May this row's params be edited, and if not, **why** — in words the button's
   * tooltip can use (§15: "`Edit` is disabled with `This step has no
   * parameters`").
   *
   * @param {string} id
   * @returns {{ editable: boolean, reason: string | null }}
   */
  function editability(id) {
    const record = documentStore.raw.recordOf(id)
    if (record === undefined) return { editable: false, reason: 'No such step' }

    const row = rowFor(id)
    if (row !== null && !row.active) return { editable: false, reason: INACTIVE_REASON }

    const verdict = stepParamEditability(record)
    if (verdict.editable) return { editable: true, reason: null }

    // Three different refusals wear the same `editable: false` in the core;
    // saying which one it is, in the user's terms, is this layer's job.
    if (record.consumes !== undefined) {
      return { editable: false, reason: 'This step has no parameters' }
    }
    if (record.op === 'asset.image') {
      return { editable: false, reason: 'A reference photo is changed from its sketch’s Slices panel (Edit sketch)' }
    }
    if (lookupEntry(record.op)?.kind === 'composite') {
      return {
        editable: false,
        reason: "This library part's options aren't described yet, so they can't be edited",
      }
    }
    const keys = Object.keys(record.params ?? {})
    if (keys.length > 0 && keys.every((key) => RESERVED.has(key))) {
      // The honest statement of a real, inherited capability gap, named rather
      // than papered over: `core-004` decided rotation is carried **absolutely**
      // on every later transform record, so editing one row's copy would be
      // silently overwritten by the next — the wrong-geometry-no-error class
      // this milestone exists to catch. `data-004`'s retirement note asked this
      // task by name to disable Edit with this reason instead of rendering a
      // form with no fields in it. Making it editable is a new task.
      return {
        editable: false,
        reason:
          'Rotation is carried as an absolute value on every later step, so it can’t be ' +
          'edited here — turn the body with the gizmo or the Inspector instead',
      }
    }
    return { editable: false, reason: 'This step has no parameters' }
  }

  /**
   * The row's editable params, as fields a form can render.
   *
   * @param {string} id
   * @returns {StepField[]}
   */
  function fieldsFor(id) {
    const record = documentStore.raw.recordOf(id)
    if (record === undefined) return []
    const isRim = record.op === 'modify.filletRim' || record.op === 'modify.chamferRim'

    // A composite's params come from its registry schema (`TODO/ui-052`): a catalogue
    // choice is a dropdown of the values the recipe accepts, in the schema's own order
    // and labels — the same control the Inspector offers, for a Pi a Subtract consumed
    // and that only History can reach any more.
    if (lookupEntry(record.op)?.kind === 'composite' && hasEditableParams(record.op)) {
      const params = record.params ?? {}
      /** @type {StepField[]} */
      const schemaFields = []
      for (const [key, field] of Object.entries(paramOptions(record.op, params))) {
        if (field.kind === 'enum') {
          if (params[key] !== undefined) {
            schemaFields.push({ key, label: field.label, kind: 'choice', value: params[key], choices: field.options })
          }
          continue
        }
        const value = params[key] ?? field.default
        if (value !== undefined) schemaFields.push({ key, label: field.label, kind: 'number', value })
      }
      return schemaFields
    }

    /** @type {StepField[]} */
    const fields = []
    for (const [key, value] of Object.entries(record.params ?? {})) {
      if (RESERVED.has(key)) continue
      const label = labelForField(key)
      if (typeof value === 'number') {
        fields.push({ key, label, kind: 'number', value })
      } else if (Array.isArray(value) && value.every((entry) => typeof entry === 'number')) {
        fields.push({
          key,
          label,
          kind: 'vector',
          value: value.slice(),
          axes: ['X', 'Y', 'Z'].slice(0, value.length),
        })
      } else if (typeof value === 'boolean') {
        fields.push({ key, label, kind: 'boolean', value })
      } else if (typeof value === 'string') {
        // A face is a catalogue choice with real words behind it, not free
        // text — the same six options the popover offered when the step was
        // created, from the one canonical table.
        if (isRim && key === 'orientation') {
          fields.push({ key, label, kind: 'choice', value, choices: RIM_FACE_OPTIONS })
        } else {
          fields.push({ key, label, kind: 'text', value })
        }
      }
    }
    return fields
  }

  /**
   * §15: edit one past step in place and replay everything after it.
   *
   * @param {string} id
   * @param {Record<string, number | readonly number[] | string | boolean>} changes
   * @returns {RowActionResult}
   */
  function applyEdit(id, changes) {
    const current = documentStore.raw.recordOf(id)
    // A composite's creation row: the same impact check as the Inspector's dropdown, and
    // the same repair dialog when the change would break something (`TODO/ui-052`).
    if (current !== undefined && lookupEntry(current.op)?.kind === 'composite' && hasEditableParams(current.op)) {
      // Only what the user changed: the form also shows a schema param the record does
      // not carry at the recipe's default (a Pi's clearance), and writing that back would
      // put a value in the log nobody chose.
      const shown = new Map(fieldsFor(id).map((field) => [field.key, field.value]))
      /** @type {Record<string, unknown>} */
      const changed = {}
      for (const [key, value] of Object.entries(changes)) {
        if (!Object.is(shown.get(key), value)) changed[key] = value
      }
      if (Object.keys(changed).length === 0) {
        return report({ ok: false, message: 'Nothing to apply — the values are unchanged.', broken: null })
      }
      try {
        const result = paramCommands.setCompositeParams(id, changed)
        if ('needsRepair' in result) {
          repairDialog.show({ edit: result.edit, breakages: result.breakages })
          return { ok: true }
        }
        settle()
        return { ok: true }
      } catch (error) {
        return report(refusal(error, richLabel))
      }
    }
    try {
      const record = stepParamEditRecord(documentStore.raw, id, changes)
      if (record === null) {
        return report({
          ok: false,
          message: 'Nothing to apply — the values are unchanged.',
          broken: null,
        })
      }
      documentStore.raw.replaceRecord(id, record, transaction())
      settle()
      return { ok: true }
    } catch (error) {
      return report(refusal(error, richLabel))
    }
  }

  /**
   * §16: take a step out of the evaluation without taking it out of the log.
   *
   * @param {string} id
   * @param {boolean} suppressed
   * @returns {RowActionResult}
   */
  function setSuppressed(id, suppressed) {
    try {
      documentStore.raw.setSuppressed(id, suppressed, transaction())
      settle()
      return { ok: true }
    } catch (error) {
      return report(refusal(error, richLabel))
    }
  }

  /**
   * §17's honest disabled state, plus §18's inactive-row rule on top of it.
   *
   * @param {string} id
   * @param {number} delta `-1` up, `+1` down.
   * @returns {{ allowed: boolean, reason: string | null }}
   */
  function canMove(id, delta) {
    const row = rowFor(id)
    if (row !== null && !row.active) return { allowed: false, reason: INACTIVE_REASON }
    return documentStore.raw.canMove(id, delta)
  }

  /**
   * §17: move one step one position, and replay.
   *
   * @param {string} id
   * @param {number} delta
   * @returns {RowActionResult}
   */
  function moveStep(id, delta) {
    const verdict = canMove(id, delta)
    if (!verdict.allowed) {
      return report({ ok: false, message: verdict.reason ?? 'That move is not allowed', broken: null })
    }
    try {
      documentStore.raw.moveStep(id, delta, transaction())
      settle()
      return { ok: true }
    } catch (error) {
      return report(refusal(error, richLabel))
    }
  }

  /**
   * §18: set the rollback marker just after this step.
   *
   * @param {string} id
   * @returns {RowActionResult}
   */
  function rollBackTo(id) {
    try {
      documentStore.raw.rollBackTo(id, transaction())
      settle()
      // §18: "Selection is cleared once, at the moment of rollback (a body may
      // no longer exist), and works normally afterwards." Cleared outright
      // rather than pruned, because which bodies survive is not the point — the
      // user has moved the document to a different state.
      selection.clear()
      return { ok: true }
    } catch (error) {
      return report(refusal(error, richLabel))
    }
  }

  /**
   * §18: clear the marker and replay the whole log in its new order.
   *
   * @returns {RowActionResult}
   */
  function rollForward() {
    try {
      documentStore.raw.rollForward(transaction())
      settle()
      return { ok: true }
    } catch (error) {
      // §18 names the framing: "the strip says which row and why — `Can't roll
      // forward: step 5 (…) needs Cube 1 as it was before step 3`".
      return report(refusal(error, richLabel, "Can't roll forward: "))
    }
  }

  return {
    editability,
    fieldsFor,
    applyEdit,
    setSuppressed,
    canMove,
    moveStep,
    rollBackTo,
    rollForward,
  }
}
