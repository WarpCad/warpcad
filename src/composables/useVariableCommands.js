// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one adapter between the Variables panel / bind control and the document
 * (`TODO/ui-059`) — thin wrappers over `core/variables.js`, in the shape of
 * `useParamCommands.js`.
 *
 * **No rule lives here.** What may be bound comes from `bindableParams` (read in
 * `core/inspector.js` and carried on the body description); what is refused comes back as
 * core's own reason string, thrown as-is for the component to show; a changed value runs
 * `dependents.variableImpactOf` first and hands the repair dialog the same breakage list
 * `ui-052` uses. This file only supplies the transaction origin, the selection `meta`
 * Undo restores, one `refresh()`, and the blast-radius sentence.
 *
 * Every command is one Undo step: `setVariable`, `bindParam`, `renameVariable` and
 * `deleteVariable` are each a single `reviseRecords`; create-and-bind is core's
 * `bindParamToNewVariable` (a `document.batch(define; bind)` would be two steps — see its doc).
 *
 * @module composables/useVariableCommands
 */

import { toRaw } from 'vue'

import { variableImpactOf } from '../core/dependents.js'
import {
  VariableInUseError,
  bindParam,
  bindParamToNewVariable,
  consumersOf,
  defineVariable,
  deleteVariable,
  renameVariable,
  setVariable,
  setVariableRevision,
  unbindParam,
  variableValueLabel,
  variablesOf,
} from '../core/variables.js'
import { useDocumentStore } from '../stores/document.js'
import { useSelectionStore } from '../stores/selection.js'
import { useVariablesUiStore } from '../stores/variablesUi.js'
import { useParamCommands } from './useParamCommands.js'

/** @typedef {import('../core/variables.js').Variable} Variable */
/** @typedef {import('../core/variables.js').VariableConsumer} VariableConsumer */
/** @typedef {import('../core/dependents.js').Breakage} Breakage */
/** @typedef {import('../core/repair.js').RepairEdit} RepairEdit */

/**
 * A row of the Variables panel.
 *
 * @typedef {object} VariableRowData
 * @property {Variable} variable
 * @property {number} parameters Bindings and conditions that read it.
 * @property {number} parts Distinct bodies those belong to.
 * @property {string} valueLabel The value in words (`Pi 4`, `2 mm`, `yes`).
 */

/**
 * What {@link set} did: committed, or held for the repair dialog with the edit it would
 * commit.
 *
 * @typedef {{ committed: true, summary: string }
 *   | { needsRepair: true, breakages: Breakage[], edit: RepairEdit, summary: string }} SetResult
 */

/**
 * `piModel 4 → 5 — 3 parameters on 2 parts changed`.
 *
 * @param {Variable} variable
 * @param {unknown} next
 * @param {number} parameters
 * @param {number} parts
 * @returns {string}
 */
function summaryOf(variable, next, parameters, parts) {
  /** @param {unknown} value */
  const plain = (value) =>
    typeof value === 'boolean' ? (value ? 'yes' : 'no') : `${String(value)}${variable.kind === 'number' && variable.unit ? ` ${variable.unit}` : ''}`
  const noun = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`
  const tail = parameters === 0 ? 'nothing reads it yet' : `${noun(parameters, 'parameter')} on ${noun(parts, 'part')} changed`
  return `${variable.name} ${plain(variable.value)} → ${plain(next)} — ${tail}`
}

/**
 * @returns {{
 *   list: () => VariableRowData[],
 *   define: (definition: Parameters<typeof defineVariable>[1]) => void,
 *   set: (name: string, value: number | boolean | string) => SetResult,
 *   rename: (from: string, to: string) => void,
 *   remove: (name: string, options?: { keepValues?: boolean }) => void,
 *   bind: (recordId: string, path: string, name: string) => void,
 *   bindToNew: (recordId: string, path: string, definition: Parameters<typeof defineVariable>[1]) => void,
 *   unbind: (recordId: string, path: string) => void,
 *   setVariableCondition: (recordId: string, name: string, values: any[]) => void,
 *   applyRepair: (edit: RepairEdit, breakages: readonly Breakage[], fixes: Record<string, import('../core/repair.js').Fix>) => void,
 * }}
 */
export function useVariableCommands() {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const ui = useVariablesUiStore()
  const paramCommands = useParamCommands()

  /** The live document without Pinia's proxy (the fold cache is keyed by raw records). */
  function live() {
    return toRaw(documentStore.raw)
  }

  /** The transaction every command here commits under. */
  function transaction() {
    return { origin: 'local', meta: { selectionBefore: [...selection.ids] } }
  }

  /**
   * Run one core command, then refresh the store once. A refusal is core's, thrown
   * unchanged and atomic, so there is nothing to roll back.
   *
   * @template T
   * @param {(document: import('../core/document.js').WarpDocument, tx: ReturnType<typeof transaction>) => T} command
   * @returns {T}
   */
  function run(command) {
    const result = command(live(), transaction())
    documentStore.refresh()
    return result
  }

  return {
    /** Every variable, in log order, with how much reads it. Re-read when `version` moves. */
    list() {
      void documentStore.version
      const raw = live()
      return variablesOf(raw).map((variable) => {
        const consumers = consumersOf(raw.entries, variable.name)
        const roots = new Set(consumers.map((consumer) => raw.rootOf(consumer.recordId) ?? consumer.recordId))
        return { variable, parameters: consumers.length, parts: roots.size, valueLabel: variableValueLabel(variable) }
      })
    },

    define(definition) {
      run((document, tx) => defineVariable(document, definition, tx))
    },

    /**
     * Change a value. Runs the impact check first: nothing breaks → committed now (one
     * Undo step) and the blast-radius line is announced; something would → nothing is
     * committed and the breakages come back for `DependentRepairDialog`.
     */
    set(name, value) {
      const raw = live()
      const variable = variablesOf(raw).find((candidate) => candidate.name === name)
      if (variable === undefined) {
        // Core's own refusal, by name.
        run((document, tx) => setVariable(document, name, value, tx))
        return { committed: true, summary: '' }
      }
      const revision = setVariableRevision(raw, name, value)
      if (revision === null) return { committed: true, summary: '' }
      const { breakages, consumers } = variableImpactOf(raw, name, value)
      const roots = new Set(consumers.map((consumer) => raw.rootOf(consumer.recordId) ?? consumer.recordId))
      const summary = summaryOf(variable, value, consumers.length, roots.size)
      if (breakages.length > 0) {
        /** @type {RepairEdit} */
        const edit = {
          rootId: raw.rootOf(consumers[0]?.recordId ?? '') ?? variable.id,
          recordId: variable.id,
          record: /** @type {import('../core/kernel/registry.js').OpRecord} */ (revision.record),
          param: null,
          oldValue: variable.value,
          variable: name,
          announce: summary,
        }
        return { needsRepair: true, breakages, edit, summary }
      }
      run((document, tx) => setVariable(document, name, value, tx))
      ui.announce(summary, documentStore.version)
      return { committed: true, summary }
    },

    rename(from, to) {
      run((document, tx) => renameVariable(document, from, to, tx))
    },

    /**
     * Delete. Throws core's `VariableInUseError` (carrying the consumers) while anything
     * still reads it and `keepValues` is not set — there is no plain destructive delete.
     */
    remove(name, options = {}) {
      run((document, tx) => deleteVariable(document, name, tx, options))
    },

    bind(recordId, path, name) {
      run((document, tx) => bindParam(document, recordId, path, name, tx))
    },

    bindToNew(recordId, path, definition) {
      run((document, tx) => bindParamToNewVariable(document, recordId, path, definition, tx))
    },

    unbind(recordId, path) {
      run((document, tx) => unbindParam(document, recordId, path, tx))
    },

    /** A `{ var, in }` condition on a record — the same path as a body condition. */
    setVariableCondition(recordId, name, values) {
      paramCommands.setCondition(recordId, { var: name, in: values })
    },

    applyRepair(edit, breakages, fixes) {
      paramCommands.applyRepair(edit, breakages, fixes)
    },
  }
}

export { VariableInUseError }
