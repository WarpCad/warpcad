// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The merge state: the per-entry merge metadata that sits beside the feature records
 * (`TODO/data-009`, `docs/decisions/document-sync.md`). Plain JSON-safe data apart from the
 * `Map`s; the record itself is opaque here. Its file encoding is `data-011`'s.
 *
 * Framework-free; imports nothing outside `src/core/replica.js`.
 */

/** @typedef {import('../replica.js').Stamp} Stamp */

/**
 * A last-writer-wins value: the value and the stamp that wrote it.
 *
 * @template T
 * @typedef {[T, Stamp]} Lww
 */

/**
 * One live row.
 *
 * - `born` is the **born-or-revival** stamp: set at birth, replaced by a Redo. It decides
 *   presence against a tombstone and is the order tie-break. It is also the row's
 *   *generation*: copies of a row with different `born` stamps are different lives of it,
 *   and only the newest life's fields count.
 * - `rec` stamps the whole record (one stamp per row, decided by `docs-022`).
 * - `origin` and `intent` are set at birth and never change, so they carry no stamp.
 *
 * @typedef {object} MergeEntry
 * @property {unknown} record The record line's value, opaque.
 * @property {string} origin
 * @property {unknown} [intent]
 * @property {Stamp} born
 * @property {Lww<string>} pos The position key.
 * @property {Stamp} rec
 * @property {Lww<boolean>} [suppressed]
 * @property {Lww<boolean>} [leftBroken]
 */

/**
 * The rollback marker's value: no marker (`null`), a marker before the first row
 * (`{ row: null }`), or "after row X". The row's position key and born stamp are kept with the
 * id so a marker whose row is dead still resolves to the nearest earlier live row, because a
 * tombstone keeps only an id and a stamp.
 *
 * @typedef {null | { row: null } | { row: string, key: string, born: Stamp }} RollbackMarker
 */

/**
 * @typedef {object} MergeRegisters
 * @property {Lww<RollbackMarker> | null} rollbackAfter
 * @property {Lww<unknown> | null} resolution
 * @property {Lww<unknown> | null} standingInstructions
 * @property {Lww<unknown> | null} buildVolume
 */

/**
 * @typedef {object} MergeState
 * @property {string | null} projectId
 * @property {Map<string, MergeEntry>} entries Live rows only.
 * @property {Map<string, Stamp>} dead Tombstones: id and stamp only. Kept after a merge,
 *   including for a row a later Redo brought back.
 * @property {MergeRegisters} registers A `null` register has never been written.
 * @property {Map<string, Lww<unknown>>} parts User-part definitions by op.
 * @property {Map<string, Lww<boolean>>} viewHidden `TODO/ui-089`: the user's Hide / Show, one
 *   switch per body and per part, keyed by `src/core/visibility.js`'s `viewKey`. A show is kept
 *   as `[false, stamp]`, not dropped, so a later show beats an earlier hide in a merge. Stamped
 *   per key rather than as one register, so two replicas hiding different parts both keep theirs.
 */

/**
 * The replica id every derived ("legacy") stamp carries, with counter `0` — a value no clock
 * ever issues (`tick` starts at 1), so it marks metadata derived from a file rather than
 * written by an edit. Fixed, so two builds upgrading one file derive identical metadata.
 */
export const LEGACY_REPLICA = 'legacy'

/** @type {Stamp} */
export const LEGACY_STAMP = Object.freeze({ counter: 0, replica: LEGACY_REPLICA })

/**
 * @param {Stamp} stamp
 * @returns {boolean}
 */
export function isLegacyStamp(stamp) {
  return stamp.counter === 0 && stamp.replica === LEGACY_REPLICA
}

/** The document-level registers, in their canonical order. */
export const REGISTER_NAMES = /** @type {const} */ (['rollbackAfter', 'resolution', 'standingInstructions', 'buildVolume'])

/**
 * A state with nothing in it.
 *
 * @param {string | null} [projectId]
 * @returns {MergeState}
 */
export function emptyMergeState(projectId = null) {
  return {
    projectId,
    entries: new Map(),
    dead: new Map(),
    registers: { rollbackAfter: null, resolution: null, standingInstructions: null, buildVolume: null },
    parts: new Map(),
    viewHidden: new Map(),
  }
}

/**
 * @param {MergeEntry} entry
 * @returns {Record<string, unknown>}
 */
function plainEntry(entry) {
  /** @type {Record<string, unknown>} */
  const out = { record: entry.record, origin: entry.origin }
  if (entry.intent !== undefined) out.intent = entry.intent
  out.born = [entry.born.counter, entry.born.replica]
  out.pos = [entry.pos[0], [entry.pos[1].counter, entry.pos[1].replica]]
  out.rec = [entry.rec.counter, entry.rec.replica]
  if (entry.suppressed) out.suppressed = [entry.suppressed[0], [entry.suppressed[1].counter, entry.suppressed[1].replica]]
  if (entry.leftBroken) out.leftBroken = [entry.leftBroken[0], [entry.leftBroken[1].counter, entry.leftBroken[1].replica]]
  return out
}

/**
 * @template K, V
 * @param {Map<K, V>} map
 * @returns {[K, V][]}
 */
function sortedPairs(map) {
  return [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/**
 * A canonical, order-independent JSON form of a state: ids sorted, field order fixed. Two
 * states are equal exactly when these strings are. Not the file encoding (`data-011`).
 *
 * @param {MergeState} state
 * @returns {string}
 */
export function canonicalJSON(state) {
  return JSON.stringify({
    projectId: state.projectId,
    entries: sortedPairs(state.entries).map(([id, entry]) => [id, plainEntry(entry)]),
    dead: sortedPairs(state.dead).map(([id, stamp]) => [id, [stamp.counter, stamp.replica]]),
    registers: REGISTER_NAMES.map((name) => {
      const register = state.registers[name]
      return register === null ? null : [register[0], [register[1].counter, register[1].replica]]
    }),
    parts: sortedPairs(state.parts).map(([op, [definition, stamp]]) => [op, definition, [stamp.counter, stamp.replica]]),
    viewHidden: sortedPairs(state.viewHidden).map(([key, [hidden, stamp]]) => [key, hidden, [stamp.counter, stamp.replica]]),
  })
}

/**
 * The highest stamp counter anywhere in a state, for a clock to `observe` after reading it.
 *
 * @param {MergeState} state
 * @returns {number}
 */
export function highestCounter(state) {
  let highest = 0
  const see = (/** @type {Stamp | undefined} */ stamp) => {
    if (stamp && stamp.counter > highest) highest = stamp.counter
  }
  for (const entry of state.entries.values()) {
    see(entry.born)
    see(entry.pos[1])
    see(entry.rec)
    see(entry.suppressed?.[1])
    see(entry.leftBroken?.[1])
  }
  for (const stamp of state.dead.values()) see(stamp)
  for (const name of REGISTER_NAMES) see(state.registers[name]?.[1])
  for (const [, stamp] of state.parts.values()) see(stamp)
  for (const [, stamp] of state.viewHidden.values()) see(stamp)
  return highest
}
