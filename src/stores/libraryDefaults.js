// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Library's memory of each part's last-used params (`TODO/ui-068`).
 *
 * UI-only and **per device**, not per project: it is a preference ("what *I* last picked"),
 * so it is never written to the project file and never merges. It lives in `localStorage`
 * under {@link STORAGE_KEY} behind the same boundary `settings.js` uses — every read and write
 * in `try/catch`, so a blocked, full or corrupt store means "nothing remembered", never an
 * error.
 *
 * ## Who writes it
 *
 * Only local, user-driven choices: a committed Inspector or History-row param edit
 * (`useParamCommands`, the one boundary the AI tools and the MCP server never cross — they
 * edit through `src/ai/tools/`), and the row's own pre-drag dropdowns ({@link setChoice}).
 * Merges, opening a file and AI turns never call {@link remember}. **Undo does not roll it
 * back**: it is not document state.
 *
 * The rules for what is kept and how a stored set is validated on read live in
 * `src/core/libraryDefaults.js`.
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { reconcileParamEdit } from '../core/kernel/registry.js'
import { libraryRow } from '../core/library.js'
import { differsFromDefaults, effectiveDefaultsFor, rememberedFrom } from '../core/libraryDefaults.js'

/** Namespaced like the other persisted preferences. */
export const STORAGE_KEY = 'warpcad.library.lastParams'

/** Shared payload for a row with nothing remembered, so the common drag allocates nothing. */
const NO_OVERRIDES = Object.freeze({})

/**
 * @returns {Record<string, Record<string, any>>} The stored memory, or `{}` for anything
 *   missing, corrupt or unreadable.
 */
function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value !== null && typeof value === 'object' && !Array.isArray(value))
    )
  } catch {
    return {}
  }
}

/** @param {Record<string, Record<string, any>>} value */
function writeStored(value) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Remembered for this session in memory; just not across reloads.
  }
}

/**
 * @param {string} op
 * @returns {import('../core/library.js').LibraryRow | null} The op's Library row, or `null` when
 *   it has none (a primitive-less op, the replay-only screw, a user part that was deleted).
 */
function rowFor(op) {
  try {
    return libraryRow(op)
  } catch {
    return null
  }
}

export const useLibraryDefaultsStore = defineStore('libraryDefaults', () => {
  /** @type {import('vue').Ref<Record<string, Record<string, any>>>} */
  const remembered = ref(readStored())

  /** @param {string} op @param {Record<string, any> | null} params */
  function commit(op, params) {
    const next = { ...remembered.value }
    if (params === null) delete next[op]
    else next[op] = params
    remembered.value = next
    writeStored(next)
  }

  /**
   * Remember what the user just committed on a placed body of `op`. Ignored for an op whose
   * row does not remember (Primitives, Text), has no row, or exposes nothing editable.
   *
   * @param {string} op
   * @param {Record<string, any> | undefined} params The edited record's params.
   * @param {ReadonlyMap<string, any>} [variables] Resolves any `{ $var }` binding.
   * @returns {void}
   */
  function remember(op, params, variables) {
    const row = rowFor(op)
    if (row === null || !row.remembersParams) return
    const kept = rememberedFrom(op, params, { variables })
    if (kept !== null) commit(op, kept)
  }

  /**
   * The row's dropdown changed (`TODO/ui-068`): lay the picked value over what is effective now,
   * reconcile the values that depend on it (a new Type strands the old Size), and remember it.
   *
   * @param {import('../core/library.js').LibraryRow} row
   * @param {string} param
   * @param {any} value
   * @returns {void}
   */
  function setChoice(row, param, value) {
    if (!row.remembersParams) return
    const next = reconcileParamEdit(row.op, { ...effectiveDefaultsFor(row, remembered.value[row.op]), [param]: value }, [param])
    const kept = rememberedFrom(row.op, next)
    if (kept !== null) commit(row.op, kept)
  }

  /** @param {string} op @returns {void} Put one row back to its registry defaults. */
  function reset(op) {
    if (remembered.value[op] !== undefined) commit(op, null)
  }

  /**
   * The full params a drag from `row` starts with (its defaults when nothing is remembered).
   *
   * @param {import('../core/library.js').LibraryRow} row
   * @returns {Record<string, any>}
   */
  function effectiveFor(row) {
    return effectiveDefaultsFor(row, remembered.value[row.op])
  }

  /**
   * The overrides a drag from `row` hands `placement.begin` on top of its defaults: nothing for
   * a row with nothing remembered (and for every row that never remembers).
   *
   * @param {import('../core/library.js').LibraryRow} row
   * @returns {Record<string, any>}
   */
  function overridesFor(row) {
    if (!row.remembersParams || remembered.value[row.op] === undefined) return NO_OVERRIDES
    const effective = effectiveFor(row)
    return effective === row.defaults ? NO_OVERRIDES : effective
  }

  /**
   * Whether the row's effective params differ from its registry defaults — the summary line and
   * **↺ Reset** appear exactly then.
   *
   * @param {import('../core/library.js').LibraryRow} row
   * @returns {boolean}
   */
  function isCustom(row) {
    return differsFromDefaults(row, remembered.value[row.op])
  }

  return { remembered, remember, setChoice, reset, effectiveFor, overridesFor, isCustom }
})
