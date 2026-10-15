// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The merge core (`TODO/data-009`, `docs/decisions/document-sync.md`): one pure function that
 * takes two merge states and returns the merged one. It knows nothing of the kernel, the fold,
 * Vue or files.
 *
 * **`mergeStates` assumes validated input.** A state can come from a hostile file; validation
 * and caps (huge counters, tombstones naming live rows, oversized maps, equal stamps carrying
 * different values) live in `data-011`, before a state ever reaches this module. Here, two
 * values written under one stamp are assumed to be the same value.
 *
 * Every rule is a last-writer-wins choice by `compareStamps`:
 *
 * - **Presence.** A row is live when its `born`-or-revival stamp beats its tombstone (a tie
 *   goes to the tombstone). An edit does not revive a deleted row; a Redo, which writes a new
 *   `born`, does. Tombstones are kept.
 * - **Generation.** Two copies of a row with different `born` stamps are different lives of it;
 *   the newer life wins whole. Within one life, each field group (record, position,
 *   `suppressed`, `leftBroken`) takes the later stamp. `origin` and `intent` travel with the
 *   record.
 * - **Order.** Live rows sorted by `(position key, born stamp)`.
 * - **Registers and parts.** The later stamp wins.
 *
 * The result is commutative, associative and idempotent (`fuzz.spec.js`).
 *
 * Framework-free; imports nothing outside `src/core/replica.js` and its siblings here.
 */

import { compareStamps } from '../replica.js'
import { compareKeys } from './positionKey.js'
import { REGISTER_NAMES } from './state.js'

/** @typedef {import('../replica.js').Stamp} Stamp */
/** @typedef {import('./state.js').MergeState} MergeState */
/** @typedef {import('./state.js').MergeEntry} MergeEntry */
/** @typedef {import('./state.js').RollbackMarker} RollbackMarker */

/**
 * @template T
 * @param {[T, Stamp] | null | undefined} a
 * @param {[T, Stamp] | null | undefined} b
 * @returns {[T, Stamp] | null | undefined}
 */
function later(a, b) {
  if (!a) return b
  if (!b) return a
  return compareStamps(a[1], b[1]) >= 0 ? a : b
}

/**
 * @param {Stamp | undefined} a
 * @param {Stamp | undefined} b
 * @returns {Stamp | undefined}
 */
function laterStamp(a, b) {
  if (!a) return b
  if (!b) return a
  return compareStamps(a, b) >= 0 ? a : b
}

/**
 * Join two copies of one row.
 *
 * @param {MergeEntry | undefined} x
 * @param {MergeEntry | undefined} y
 * @returns {MergeEntry | undefined}
 */
function joinEntries(x, y) {
  if (!x) return y
  if (!y || x === y) return x
  const generation = compareStamps(x.born, y.born)
  if (generation !== 0) return generation > 0 ? x : y
  const record = compareStamps(x.rec, y.rec) >= 0 ? x : y
  const pos = later(x.pos, y.pos)
  const suppressed = later(x.suppressed, y.suppressed)
  const leftBroken = later(x.leftBroken, y.leftBroken)
  for (const whole of [x, y]) {
    if (record === whole && pos === whole.pos && suppressed === whole.suppressed && leftBroken === whole.leftBroken) {
      return whole
    }
  }
  /** @type {MergeEntry} */
  const merged = { record: record.record, origin: record.origin, born: x.born, pos: /** @type {[string, Stamp]} */ (pos), rec: record.rec }
  if (record.intent !== undefined) merged.intent = record.intent
  if (suppressed) merged.suppressed = suppressed
  if (leftBroken) merged.leftBroken = leftBroken
  return merged
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * An entry is **unstamped** when its record stamp has counter `0`: the stamp `data-011` gives
 * a record read from a version-1 file.
 *
 * @param {MergeEntry} entry
 * @returns {boolean}
 */
function unstamped(entry) {
  return entry.rec.counter === 0
}

/**
 * Whether a state holds nothing at all: no live row and no tombstone.
 *
 * @param {MergeState} state
 * @returns {boolean}
 */
function holdsNothing(state) {
  return state.entries.size === 0 && state.dead.size === 0
}

/**
 * Whether two states are copies of one project.
 *
 * - `same`: both carry the same project id.
 * - `legacy-same`: either has no project id, every id present and unstamped on both sides
 *   holds a byte-identical record, **and** the two have at least one row id in common (live
 *   or tombstoned, on either side) — or one of them holds nothing at all, so there is nothing
 *   to tell apart and nothing to bring in.
 * - `unrelated`: anything else. Callers decide what to do; {@link mergeStates} refuses it.
 *
 * `TODO/data-013`: "no row in common" used to count as related. Since `data-008` made record
 * ids replica-scoped, two projects that were each started fresh share **no** ids, so that
 * vacuous case merged unrelated projects silently. A genuine copy of a legacy project always
 * shares the legacy rows it started from (as rows, or as the tombstones its deletions left).
 *
 * @param {MergeState} a
 * @param {MergeState} b
 * @returns {'same' | 'legacy-same' | 'unrelated'}
 */
export function relatedness(a, b) {
  if (a.projectId !== null && b.projectId !== null) {
    return a.projectId === b.projectId ? 'same' : 'unrelated'
  }
  if (holdsNothing(a) || holdsNothing(b)) return 'legacy-same'
  const [small, large] = a.entries.size + a.dead.size <= b.entries.size + b.dead.size ? [a, b] : [b, a]
  let shared = false
  for (const [id, entry] of small.entries) {
    const other = large.entries.get(id)
    if (other === undefined) {
      if (large.dead.has(id)) shared = true
      continue
    }
    shared = true
    if (!unstamped(entry) || !unstamped(other)) continue
    if (entry.record !== other.record && JSON.stringify(entry.record) !== JSON.stringify(other.record)) {
      return 'unrelated'
    }
  }
  if (!shared) {
    for (const id of small.dead.keys()) {
      if (large.entries.has(id) || large.dead.has(id)) {
        shared = true
        break
      }
    }
  }
  return shared ? 'legacy-same' : 'unrelated'
}

/**
 * Merge two states. Pure: neither input is changed, and the result may share their (immutable)
 * entry objects.
 *
 * @param {MergeState} a
 * @param {MergeState} b
 * @returns {MergeState}
 * @throws {Error} When the states are {@link relatedness} `unrelated`.
 */
export function mergeStates(a, b) {
  if (relatedness(a, b) === 'unrelated') {
    throw new Error('mergeStates: the two states are copies of different projects')
  }
  let projectId = a.projectId ?? b.projectId
  if (a.projectId !== null && b.projectId !== null && b.projectId < a.projectId) projectId = b.projectId

  const ids = new Set([...a.entries.keys(), ...a.dead.keys(), ...b.entries.keys(), ...b.dead.keys()])
  /** @type {Map<string, MergeEntry>} */
  const entries = new Map()
  /** @type {Map<string, Stamp>} */
  const dead = new Map()
  for (const id of [...ids].sort(compareIds)) {
    const tomb = laterStamp(a.dead.get(id), b.dead.get(id))
    const entry = joinEntries(a.entries.get(id), b.entries.get(id))
    if (tomb) dead.set(id, tomb)
    if (entry && (!tomb || compareStamps(entry.born, tomb) > 0)) entries.set(id, entry)
  }

  /** @type {MergeState['registers']} */
  const registers = { rollbackAfter: null, resolution: null, standingInstructions: null, buildVolume: null }
  for (const name of REGISTER_NAMES) {
    registers[name] = /** @type {any} */ (later(a.registers[name], b.registers[name]) ?? null)
  }

  /** @type {MergeState['parts']} */
  const parts = new Map()
  for (const op of [...new Set([...a.parts.keys(), ...b.parts.keys()])].sort(compareIds)) {
    parts.set(op, /** @type {[unknown, Stamp]} */ (later(a.parts.get(op), b.parts.get(op))))
  }

  return { projectId, entries, dead, registers, parts }
}

/**
 * @param {{ key: string, born: Stamp, id: string }} x
 * @param {{ key: string, born: Stamp, id: string }} y
 * @returns {number}
 */
function compareSlots(x, y) {
  return compareKeys(x.key, y.key) || compareStamps(x.born, y.born) || compareIds(x.id, y.id)
}

/**
 * The live row ids in timeline order: `(position key, born stamp)`, then id.
 *
 * @param {MergeState} state
 * @returns {string[]}
 */
export function liveOrder(state) {
  return [...state.entries]
    .map(([id, entry]) => ({ id, key: entry.pos[0], born: entry.born }))
    .sort(compareSlots)
    .map((slot) => slot.id)
}

/**
 * Where the rollback marker sits in a state: `null` for no marker, otherwise the live row it
 * follows (`after: null` = before the first row). A marker whose row is dead resolves to the
 * nearest earlier live row by the position recorded with the marker.
 *
 * @param {MergeState} state
 * @returns {{ after: string | null } | null}
 */
export function resolveRollback(state) {
  const register = state.registers.rollbackAfter
  if (register === null || register[0] === null) return null
  const marker = register[0]
  if (marker.row === null) return { after: null }
  if (state.entries.has(marker.row)) return { after: marker.row }
  const target = { id: marker.row, key: marker.key, born: marker.born }
  /** @type {{ id: string, key: string, born: Stamp } | null} */
  let best = null
  for (const [id, entry] of state.entries) {
    const slot = { id, key: entry.pos[0], born: entry.born }
    if (compareSlots(slot, target) < 0 && (best === null || compareSlots(slot, best) > 0)) best = slot
  }
  return { after: best === null ? null : best.id }
}

/**
 * @param {[unknown, Stamp] | null | undefined} x
 * @param {[unknown, Stamp] | null | undefined} y
 * @returns {boolean}
 */
function sameLww(x, y) {
  if (!x || !y) return !x === !y
  return compareStamps(x[1], y[1]) === 0
}

/**
 * What changed from `before` to `after`, by stamp, so a caller can say "Merged 4 steps" and
 * build an inverse (`ui-062`'s Undo merge). Every list is sorted.
 *
 * @param {MergeState} before
 * @param {MergeState} after
 * @returns {{ added: string[], revised: string[], removed: string[], moved: string[],
 *   registers: string[], parts: string[] }}
 *   `revised`: the record, a flag or the row's life changed; `moved`: the position changed.
 */
export function diffStates(before, after) {
  /** @type {string[]} */ const added = []
  /** @type {string[]} */ const revised = []
  /** @type {string[]} */ const removed = []
  /** @type {string[]} */ const moved = []
  for (const [id, next] of after.entries) {
    const prior = before.entries.get(id)
    if (!prior) {
      added.push(id)
      continue
    }
    if (compareStamps(prior.born, next.born) !== 0 || compareStamps(prior.rec, next.rec) !== 0 ||
      !sameLww(prior.suppressed, next.suppressed) || !sameLww(prior.leftBroken, next.leftBroken)) {
      revised.push(id)
    }
    if (!sameLww(prior.pos, next.pos) || prior.pos[0] !== next.pos[0]) moved.push(id)
  }
  for (const id of before.entries.keys()) if (!after.entries.has(id)) removed.push(id)
  const registers = REGISTER_NAMES.filter((name) => !sameLww(before.registers[name], after.registers[name]))
  const parts = [...new Set([...before.parts.keys(), ...after.parts.keys()])]
    .filter((op) => !sameLww(before.parts.get(op), after.parts.get(op)))
  for (const list of [added, revised, removed, moved, parts]) list.sort(compareIds)
  return { added, revised, removed, moved, registers: [...registers], parts }
}
