// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one adapter between a Parameters-field edit and the document.
 *
 * Mirrors `useTransformCommands.js` exactly in shape — the record-building is
 * framework-free in `src/core/paramEdit.js`, and this is the thin reactive layer
 * that hands the result to the document store — but it has one thing that file
 * does not, and it is the whole reason this module exists rather than being two
 * lines in `Inspector.vue`:
 *
 * ## One replace, one undo step (`TODO/data-007`)
 *
 * A Parameters edit swaps the body's creation record in place through
 * `documentStore.revise` (`data-004`'s replace path) and the whole log re-folds, so
 * anything snapped or aligned to the body follows the new size, and the pose survives
 * because the later transforms are still in the log. `TODO/ui-029`'s original path
 * appended a rebuilt record and then re-applied the pose with `rotateToRecord` and
 * `moveToRecord`; that left a Snap evaluated against the old solid and needed a freeze on
 * any body with a fillet. One revision is one Undo step labelled `Edit <body>` (`ui-044`).
 *
 * ## Failing safe
 *
 * The guard is re-checked here before anything is built, even though the panel
 * has already greyed the fields out: a guard that lives only in a component is one
 * `v-if` away from not being a guard. `paramEditRecord` checks it again inside `core/`.
 *
 * A kernel validation error (a diameter of `0` hitting `requirePositive`) is
 * *thrown to the caller* rather than swallowed, so the Inspector can show it —
 * the same user-facing kernel-error contract `ui-027` established for the
 * Fillet/Chamfer popover. So is a later rim op that would no longer fit the new size,
 * with the step named. `revise` is atomic, so a rejected edit leaves the document and the
 * undo stack exactly as they were.
 *
 * ## A composite also gets a repair dialog (`TODO/ui-052`)
 *
 * A Pi's model or a bolt's spec is edited on the same replace path
 * (`compositeParamEditRecord`). Because a variant change can remove a part something else depends
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
import { lookupEntry, normalizedParams, paramOptions, registry } from '../core/kernel/registry.js'
import { canEditParams, compositeParamEditRecord, paramEditRecord, currentParamsOf, withComponent } from '../core/paramEdit.js'
import { nameOverrideOf } from '../core/naming.js'
import { repairChanges } from '../core/repair.js'
import { useDocumentStore } from '../stores/document.js'
import { useVariablesUiStore } from '../stores/variablesUi.js'

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
 *   setParams: (bodyId: string, changes: Record<string, unknown>, options?: { append?: readonly import('../core/kernel/registry.js').OpRecord[] }) => void,
 *   applyRepair: (edit: RepairEdit, breakages: readonly Breakage[], fixes: Record<string, Fix>) => void,
 *   resolveTargets: (bodyId: string) => { edit: RepairEdit, breakages: Breakage[] },
 *   setCondition: (recordId: string, when: { ref: string, param: string, in: any[] } | { var: string, in: any[] } | null) => void,
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
    // `TODO/core-038`: a rename wins over the creation record's generated name.
    return nameOverrideOf(live().lineageOf(id)) ?? live().recordOf(id)?.name ?? id
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
    const root = raw.recordOf(bodyId)
    // Read in the op's current shape (TODO/core-060), as the edit is: a legacy bolt's
    // Type change is from `hex`, not from `undefined`, for Only when….
    const before = root === undefined ? {} : normalizedParams(root.op, root.params ?? {})
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
   * A primitive's resize: swap the creation record in place and re-fold (`TODO/data-007`).
   *
   * Same mechanism as {@link setCompositeParams}, with one difference in what a breakage
   * means. A composite's variant change can remove a part, which a repair dialog can
   * remap or detach. A resize removes nothing; the only thing that can stop building is a
   * later rim op that no longer fits (a 5 mm fillet on a cylinder shrunk to 4 mm across).
   * There is nothing for a dialog to repair, so the edit is **refused with the step named**
   * and nothing is committed: the user shrinks the fillet first, or picks a size it fits.
   *
   * @param {string} bodyId
   * @param {Record<string, number | string | readonly number[]>} changes
   * @param {readonly import('../core/kernel/registry.js').OpRecord[]} [append] Records that
   *   go into the log in the same undo step (`TODO/sketch-003`'s photo).
   * @returns {void}
   */
  function applyChanges(bodyId, changes, append = []) {
    const raw = live()
    // Fail safe: a root with no params of its own is left exactly as it was.
    if (!canEditParams(raw, bodyId).editable) return

    const record = paramEditRecord(raw, bodyId, changes)
    if (record === null) return

    const revision = [{ id: /** @type {string} */ (record.id), record }]
    const { breakages } = impactOf(raw, revision, { editedRootId: bodyId })
    if (breakages.length > 0) {
      const first = breakages[0]
      throw new Error(
        `${first.relationship} on ${first.dependentName} (step ${first.step}) would no longer ` +
          `build at this size: ${first.reason}`
      )
    }
    // May throw (a diameter of 0, a kernel range check); `reviseRecords` then leaves the
    // document and the undo stack exactly as they were, and the caller shows the message.
    documentStore.revise(revision, { label: `Edit ${nameOf(bodyId)}`, append })
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
     * Commit one param, on the replace path either way. A primitive's typed scalar (a
     * diameter, a height) is refused if a later rim op would stop building; a composite's
     * (a Pi's model, a bolt's spec or length) opens the repair dialog — see the module doc.
     */
    setParam(bodyId, key, value) {
      const root = live().recordOf(bodyId)
      if (root !== undefined && lookupEntry(root.op)?.kind === 'composite') {
        return setCompositeParams(bodyId, { [key]: value })
      }
      applyChanges(bodyId, { [key]: /** @type {number | string} */ (value) })
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
        label:
          edit.label ?? (edit.record === null ? `Repair ${nameOf(edit.rootId)}` : `Edit ${nameOf(edit.rootId)}`),
      })
      if (edit.announce !== undefined) useVariablesUiStore().announce(edit.announce, documentStore.version)
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
      const { breakages } = impactOf(raw, [change], {
        editedRootId: (when && 'ref' in when ? when.ref : undefined) ?? _previous?.ref ?? recordId,
      })
      const bodyName = nameOf(raw.rootOf(recordId) ?? recordId)
      documentStore.revise(
        [change, ...breakages.map((breakage) => ({ id: breakage.dependentRecordId, leftBroken: true }))],
        { label: when === null ? `Remove condition from ${bodyName}` : `Edit condition on ${bodyName}` },
      )
    },

    /**
     * Commit several params of one primitive as **one** revision — one Undo step. The
     * sketch editor's Done (`TODO/sketch-001`) changes `slices` and `extrusion` together;
     * two `setParam` calls would be two steps for one editing session.
     */
    setParams(bodyId, changes, options = {}) {
      applyChanges(bodyId, /** @type {any} */ (changes), options.append ?? [])
    },

    /** Commit one typed component of a vector param: Size X, Side B. */
    setParamComponent(bodyId, key, index, value) {
      const current = currentParamsOf(live(), bodyId)[key]
      applyChanges(bodyId, { [key]: withComponent(current, index, value) })
    },
  }
}
