// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The repair dialog's state (`TODO/ui-052`) — UI state only, per CLAUDE.md's Project
 * Structure: which held edit or committed breakage the dialog is showing, and the fix the
 * user has picked for each row so far. Nothing here is document state; Apply commits
 * through `useParamCommands().applyRepair`, and Cancel simply forgets.
 *
 * One store rather than props threaded through the Inspector, because two places open the
 * same dialog: an Inspector field (a held model change, or **Resolve…**) and a History
 * row's Edit (the only way to reach a Pi a Subtract has consumed).
 *
 * @module stores/repairDialog
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { defaultFixOf } from '../core/repair.js'

/** @typedef {import('../core/dependents.js').Breakage} Breakage */
/** @typedef {import('../core/repair.js').RepairEdit} RepairEdit */
/** @typedef {import('../core/repair.js').Fix} Fix */

/**
 * The field the held edit came from, so the Inspector's select can show the new value in
 * a pending state while the dialog is open — and snap back on Cancel.
 *
 * @typedef {object} PendingField
 * @property {string} bodyId
 * @property {string} key
 * @property {unknown} value
 */

export const useRepairDialogStore = defineStore('repairDialog', () => {
  const open = ref(false)
  /** @type {import('vue').ShallowRef<RepairEdit | null>} */
  const edit = shallowRef(/** @type {RepairEdit | null} */ (null))
  /** @type {import('vue').ShallowRef<Breakage[]>} */
  const breakages = shallowRef(/** @type {Breakage[]} */ ([]))
  /** @type {import('vue').Ref<Record<string, Fix>>} */
  const fixes = ref(/** @type {Record<string, Fix>} */ ({}))
  /** @type {import('vue').Ref<PendingField | null>} */
  const pending = ref(/** @type {PendingField | null} */ (null))
  /** The last refusal Apply met, shown in the dialog rather than swallowed. */
  const error = ref(/** @type {string | null} */ (null))

  /**
   * Open the dialog.
   *
   * @param {object} options
   * @param {RepairEdit} options.edit
   * @param {Breakage[]} options.breakages
   * @param {PendingField | null} [options.pending]
   */
  function show({ edit: nextEdit, breakages: nextBreakages, pending: nextPending = null }) {
    edit.value = nextEdit
    breakages.value = nextBreakages
    /** @type {Record<string, Fix>} */
    const initial = {}
    for (const breakage of nextBreakages) initial[breakage.dependentRecordId] = defaultFixOf(breakage)
    fixes.value = initial
    pending.value = nextPending
    error.value = null
    open.value = true
  }

  /**
   * @param {string} recordId
   * @param {Fix} fix
   */
  function setFix(recordId, fix) {
    fixes.value = { ...fixes.value, [recordId]: fix }
  }

  function close() {
    open.value = false
    edit.value = null
    breakages.value = []
    fixes.value = {}
    pending.value = null
    error.value = null
  }

  /** Apply is disabled until every row has a fix. */
  const complete = computed(() =>
    breakages.value.every((breakage) => fixes.value[breakage.dependentRecordId] !== undefined),
  )

  return { open, edit, breakages, fixes, pending, error, complete, show, setFix, close }
})
