/**
 * The one adapter between a Parameters-field edit and the document.
 *
 * Mirrors `useTransformCommands.js` exactly in shape — the record-building is
 * framework-free in `src/core/paramEdit.js`, and this is the thin reactive layer
 * that hands the result to the document store — but it has one thing that file
 * does not, and it is the whole reason this module exists rather than being two
 * lines in `Inspector.vue`:
 *
 * ## Three appends, in one order, as one undo step
 *
 * A rebuilt creation record ignores every record before it (`paramEdit.js`'s own
 * module doc), so a body that had been moved and turned comes back at its
 * creation params' own spot, un-turned. Restoring the pose is two more appends:
 *
 * 1. the rebuilt creation record,
 * 2. `rotateToRecord(...)` back to the pre-edit absolute rotation, then
 * 3. `moveToRecord(...)` back to the pre-edit absolute position.
 *
 * **Rotate before move, never the other way round.** `rotateRecord` turns a body
 * about its own *bounding-box centre*, and for anything that is not symmetric
 * about that point the box's centre moves when the solid turns. Restoring the
 * position last is what makes the final measured centre land exactly on the
 * pre-edit one instead of near it — and "near it" is the silent-drift failure
 * `TODO/ui-029` names ("editing a param must not silently snap the body back to
 * the origin"), just smaller.
 *
 * Both are `transform.js`'s own absolute-target builders, the same two a typed
 * Position or Rotation field already calls. Nothing here composes a pose itself;
 * a second implementation of that arithmetic is exactly what `transform.js`'s
 * module doc exists to prevent.
 *
 * All three go through one `documentStore.batch` (`TODO/ui-044`), so they are one
 * Undo step labelled `Edit <body>`. Committed separately they were two or three,
 * and one press of Undo left the body at its creation spot with the new params, a
 * state the user never made. `appendAll` cannot do this: the rotate-back and
 * move-back are measured against the rebuilt body, so each record can only be
 * built once the one before it has folded, which `batch` allows.
 *
 * ## Failing safe
 *
 * The guard is re-checked here before anything is built, even though the panel
 * has already greyed the fields out: `TODO/ui-029`'s named failure mode is
 * silent loss of a downstream op's effect, and a guard that lives only in a
 * component is one `v-if` away from not being a guard. `paramEditRecord` checks
 * it a third time, inside `core/`, for the same reason.
 *
 * A kernel validation error (a diameter of `0` hitting `requirePositive`) is
 * *thrown to the caller* rather than swallowed, so the Inspector can show it —
 * the same user-facing kernel-error contract `ui-027` established for the
 * Fillet/Chamfer popover, reused here rather than reinvented. `batch` is atomic,
 * so a rejected edit leaves the document and the undo stack exactly as they were,
 * whichever of the three records refused.
 *
 * ## A composite is a different path (`TODO/ui-052`)
 *
 * A Pi's model or a bolt's spec is edited on `data-004`'s **replace** path instead: the
 * creation record is swapped in place (`compositeParamEditRecord`) and the whole log
 * re-folds, so the pose survives without any re-apply and a snap onto one of its parts
 * follows the change. Because a variant change can remove a part something else depends
 * on, {@link setParam} runs the impact check (`src/core/dependents.js`) **before**
 * committing: nothing breaks → it commits at once, one Undo step; something would break
 * → nothing is committed and the breakages come back for the repair dialog, whose choices
 * {@link applyRepair} then commits together with the edit, again as one Undo step.
 *
 * Synchronous, not the `async` the task sketched: that was for a worker round-trip, and
 * the fold (and so the check) runs on the main thread by `core-031`'s decision. A Pi
 * builds in under 10 ms, and a synchronous result keeps `ui-029`'s "a rejected value
 * throws" contract for every caller.
 *
 * @module composables/useParamCommands
 */

import { toRaw } from 'vue'

import { brokenDependentsOf, impactOf } from '../core/dependents.js'
import { evaluate } from '../core/kernel/index.js'
import { isGroup } from '../core/kernel/group.js'
import { paramOptions, registry } from '../core/kernel/registry.js'
import { canEditParams, compositeParamEditRecord, paramEditRecord, currentParamsOf, withComponent } from '../core/paramEdit.js'
import { repairChanges } from '../core/repair.js'
import { moveToRecord, positionOf, rotateToRecord, rotationOf } from '../core/transform.js'
import { useDocumentStore } from '../stores/document.js'

/** @typedef {import('../core/paramEdit.js').ParamEditability} ParamEditability */
/** @typedef {import('../core/dependents.js').Breakage} Breakage */
/** @typedef {import('../core/repair.js').RepairEdit} RepairEdit */
/** @typedef {import('../core/repair.js').Fix} Fix */

/**
 * What {@link setParam} did.
 *
 * @typedef {{ committed: true }
 *   | { needsRepair: true, breakages: Breakage[], edit: RepairEdit }} ParamResult
 */

/**
 * @returns {{
 *   canEdit: (bodyId: string) => ParamEditability,
 *   setParam: (bodyId: string, key: string, value: unknown) => ParamResult,
 *   setCompositeParams: (bodyId: string, values: Record<string, unknown>) => ParamResult,
 *   setParamComponent: (bodyId: string, key: string, index: number, value: number) => void,
 *   applyRepair: (edit: RepairEdit, breakages: readonly Breakage[], fixes: Record<string, Fix>) => void,
 *   resolveTargets: (bodyId: string) => { edit: RepairEdit, breakages: Breakage[] },
 *   setCondition: (recordId: string, when: { ref: string, param: string, in: any[] } | null) => void,
 * }}
 */
export function useParamCommands() {
  const documentStore = useDocumentStore()

  /**
   * The live document without Pinia's proxy: the fold cache is keyed by the *raw*
   * record objects, and a proxied record would miss it (the History preview's reason).
   */
  function live() {
    return toRaw(documentStore.raw)
  }

  /** @param {string} id */
  function nameOf(id) {
    return live().recordOf(id)?.name ?? id
  }

  /**
   * A composite param edit: impact-check, then commit or hand back the breakages.
   *
   * @param {string} bodyId
   * @param {Record<string, unknown>} values Params to change — one from the Inspector, the
   *   whole form from a History row's Edit.
   * @returns {ParamResult}
   */
  function setCompositeParams(bodyId, values) {
    const raw = live()
    const before = raw.recordOf(bodyId)?.params ?? {}
    const record = compositeParamEditRecord(raw, bodyId, values)
    if (record === null) return { committed: true }
    const changes = [{ id: bodyId, record }]
    const { breakages } = impactOf(raw, changes, { editedRootId: bodyId })
    // The enum that actually changed is what Only when… keeps a dependent for.
    const schema = paramOptions(record.op, record.params ?? {})
    const key = Object.keys(values).find(
      (candidate) => schema[candidate]?.kind === 'enum' && !Object.is(before[candidate], record.params?.[candidate])
    )
    /** @type {RepairEdit} */
    const edit = {
      rootId: bodyId,
      record,
      param: key ?? null,
      oldValue: key === undefined ? undefined : before[key],
    }
    if (breakages.length > 0) return { needsRepair: true, breakages, edit }
    documentStore.revise(changes, { label: `Edit ${nameOf(bodyId)}` })
    return { committed: true }
  }

  /**
   * The values of an enum param for which a composite **has** every one of `pieces` —
   * what **Only when…** offers on Resolve…, where the value the part existed at is
   * no longer known. Measured by building each variant, not guessed from names.
   *
   * @param {import('../core/kernel/registry.js').OpRecord} root
   * @param {string} key
   * @param {readonly string[]} pieces
   * @returns {any[]}
   */
  function valuesWithParts(root, key, pieces) {
    const field = paramOptions(root.op, root.params ?? {})[key]
    if (field?.kind !== 'enum') return []
    return field.options
      .map((option) => option.value)
      .filter((value) => {
        try {
          const probe = evaluate([{ id: 'probe', op: root.op, params: { ...root.params, [key]: value } }], {
            registry,
          }).byId.get('probe')
          return probe !== undefined && isGroup(probe) && pieces.every((piece) => piece in probe.parts)
        } catch {
          return false
        }
      })
  }

  /**
   * Rebuild one body's creation record with new params, then put it back where
   * it was. See the module doc for why the order is rotate-then-move.
   *
   * @param {string} bodyId
   * @param {Record<string, number | readonly number[]>} changes
   * @returns {void}
   */
  function applyChanges(bodyId, changes) {
    const raw = documentStore.raw
    // Fail safe, not loud-after-the-fact: a lineage carrying a fillet, a chamfer
    // or anything else non-transform is left exactly as it was.
    if (!canEditParams(raw, bodyId).editable) return

    const record = paramEditRecord(raw, bodyId, changes)
    if (record === null) return

    // Measured *before* the rebuild, off the evaluated geometry — the same two
    // numbers the Transform fields are showing, so a param edit and a typed
    // Position can never disagree about where the body is.
    const positionMm = positionOf(raw, bodyId)
    const rotationDeg = rotationOf(raw, bodyId)

    // Every mutation goes through the command layer inside an origin-tagged
    // transaction (CLAUDE.md Architecture); `'local'` because the trigger is this
    // user's own typing. May throw (a diameter of 0, a kernel range check); the
    // batch then leaves everything as it was and the caller shows the message.
    documentStore.batch(
      (commit) => {
        commit(record)

        if (rotationDeg.some((deg) => deg !== 0)) {
          commit(rotateToRecord(raw, bodyId, rotationDeg))
        }
        // Re-measured rather than assumed: the rebuilt solid is a different size,
        // and the rotation above may have shifted its bounding-box centre, so this
        // asks where the body *is now* before deciding how far it has to go back.
        const rebuiltMm = positionOf(raw, bodyId)
        if (rebuiltMm.some((mm, index) => mm !== positionMm[index])) {
          commit(moveToRecord(raw, bodyId, positionMm))
        }
      },
      { origin: 'local' }
    )
  }

  return {
    /**
     * Whether this body's Parameters fields may be offered as editable at all,
     * and — when they may not — the op that stands in the way, so the panel can
     * say which one rather than just refusing.
     */
    canEdit(bodyId) {
      return canEditParams(documentStore.raw, bodyId)
    },

    /**
     * Commit one param. A primitive's typed scalar (a diameter, a height) goes through
     * `ui-029`'s append path, unchanged; a composite's (a Pi's model, a bolt's spec or
     * length) through the replace path with its impact check — see the module doc.
     */
    setParam(bodyId, key, value) {
      const verdict = canEditParams(live(), bodyId)
      if (verdict.path === 'replace') return setCompositeParams(bodyId, { [key]: value })
      applyChanges(bodyId, { [key]: /** @type {number} */ (value) })
      return { committed: true }
    },

    /** Several params of one composite at once — a History row's whole Edit form. */
    setCompositeParams,

    /**
     * Commit a held edit together with the fix chosen for every breakage — one
     * revision, one Undo step labelled `Edit <body>`.
     */
    applyRepair(edit, breakages, fixes) {
      const changes = repairChanges(live(), edit, breakages, fixes)
      documentStore.revise(changes, {
        label: edit.record === null ? `Repair ${nameOf(edit.rootId)}` : `Edit ${nameOf(edit.rootId)}`,
      })
    },

    /**
     * What **Resolve…** reopens the dialog with for a body's committed breakages: the
     * rows left broken against it, and an edit with no record (nothing new to commit)
     * whose Only-when values are the variants that really have the missing parts.
     */
    resolveTargets(bodyId) {
      const raw = live()
      const root = raw.recordOf(bodyId)
      const breakages = brokenDependentsOf(raw, bodyId)
      const enumKey = root
        ? Object.entries(paramOptions(root.op, root.params ?? {})).find(([, field]) => field.kind === 'enum')?.[0]
        : undefined
      const missing = [...new Set(breakages.flatMap((breakage) => breakage.missingPieces))]
      const values = root && enumKey ? valuesWithParts(root, enumKey, missing) : []
      return {
        edit: {
          rootId: bodyId,
          record: null,
          param: enumKey !== undefined && values.length > 0 ? enumKey : null,
          oldValue: undefined,
          conditionValues: values,
        },
        breakages,
      }
    },

    /**
     * Set, change or remove the condition on a record (the Inspector's Condition row).
     *
     * A condition that stops holding may bring back a body whose snap cannot build —
     * removing "only when Pi 4" on a Pi 5 brings back a cube snapped to a jack the Pi 5
     * does not have. That is the original problem, restored rather than hidden, so
     * those rows come back **left broken** (flagged, with Resolve…) in the same step.
     */
    setCondition(recordId, when) {
      const raw = live()
      const record = raw.recordOf(recordId)
      if (record === undefined) throw new Error(`No step "${recordId}" in this document`)
      const { when: _previous, ...rest } = record
      const next = when === null ? rest : { ...rest, when }
      const change = { id: recordId, record: next }
      const { breakages } = impactOf(raw, [change], { editedRootId: when?.ref ?? _previous?.ref ?? recordId })
      const bodyName = nameOf(raw.rootOf(recordId) ?? recordId)
      documentStore.revise(
        [change, ...breakages.map((breakage) => ({ id: breakage.dependentRecordId, leftBroken: true }))],
        { label: when === null ? `Remove condition from ${bodyName}` : `Edit condition on ${bodyName}` },
      )
    },

    /** Commit one typed component of a vector param: Size X, Side B. */
    setParamComponent(bodyId, key, index, value) {
      const raw = documentStore.raw
      const current = currentParamsOf(raw, bodyId)[key]
      applyChanges(bodyId, { [key]: withComponent(current, index, value) })
    },
  }
}
