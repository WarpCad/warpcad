// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { diffStates, liveOrder, mergeStates, relatedness, resolveRollback } from './merge.js'
import { insertTag, keyBetween, keysBetween } from './positionKey.js'
import { canonicalJSON, emptyMergeState } from './state.js'

/** @typedef {import('./state.js').MergeState} MergeState */
/** @typedef {import('./state.js').MergeEntry} MergeEntry */

const A = 'aaaaaa'
const B = 'bbbbbb'

/** @param {number} counter @param {string} [replica] */
const s = (counter, replica = A) => ({ counter, replica })

/**
 * @param {string} id
 * @param {string} key
 * @param {import('../replica.js').Stamp} born
 * @param {Partial<MergeEntry>} [extra]
 * @returns {MergeEntry}
 */
function row(id, key, born, extra = {}) {
  return { record: { id, type: 'box', size: 10 }, origin: 'local', born, pos: [key, born], rec: born, ...extra }
}

/**
 * @param {MergeEntry[]} rows
 * @param {[string, import('../replica.js').Stamp][]} [dead]
 * @param {string | null} [projectId]
 * @returns {MergeState}
 */
function stateOf(rows, dead = [], projectId = 'proj-1') {
  const state = emptyMergeState(projectId)
  rows.forEach((entry) => state.entries.set(/** @type {any} */ (entry.record).id, entry))
  dead.forEach(([id, stamp]) => state.dead.set(id, stamp))
  return state
}

/** @param {MergeState} x @param {MergeState} y */
function bothWays(x, y) {
  const xy = mergeStates(x, y)
  expect(canonicalJSON(xy)).toBe(canonicalJSON(mergeStates(y, x)))
  return xy
}

const K1 = keyBetween(null, null, s(1))
const K2 = keyBetween(K1, null, s(2))
const K3 = keyBetween(K2, null, s(3))
const base = stateOf([row('op-1', K1, s(1)), row('op-2', K2, s(2)), row('op-3', K3, s(3))])

/**
 * @param {MergeState} state
 * @param {(entries: Map<string, MergeEntry>, dead: Map<string, import('../replica.js').Stamp>, registers: MergeState['registers']) => void} edit
 * @returns {MergeState}
 */
function edited(state, edit) {
  const next = { ...state, entries: new Map(state.entries), dead: new Map(state.dead), registers: { ...state.registers }, parts: new Map(state.parts) }
  edit(next.entries, next.dead, next.registers)
  return next
}

/** @param {MergeState} state @param {string} id @param {import('../replica.js').Stamp} stamp */
const remove = (state, id, stamp) => edited(state, (entries, dead) => {
  entries.delete(id)
  dead.set(id, stamp)
})

/** @param {MergeState} state @param {string} id @param {number} size @param {import('../replica.js').Stamp} stamp */
const editSize = (state, id, size, stamp) => edited(state, (entries) => {
  const entry = /** @type {MergeEntry} */ (entries.get(id))
  entries.set(id, { ...entry, record: { ...(/** @type {object} */ (entry.record)), size }, rec: stamp })
})

/** @param {MergeState} state @param {string} id @param {string} key @param {import('../replica.js').Stamp} stamp */
const move = (state, id, key, stamp) => edited(state, (entries) => {
  const entry = /** @type {MergeEntry} */ (entries.get(id))
  entries.set(id, { ...entry, pos: [key, stamp] })
})

/** @param {MergeState} state @param {string} id */
const marker = (state, id, /** @type {import('../replica.js').Stamp} */ stamp) => edited(state, (entries, _dead, registers) => {
  const entry = /** @type {MergeEntry} */ (entries.get(id))
  registers.rollbackAfter = [{ row: id, key: entry.pos[0], born: entry.born }, stamp]
})

describe('presence', () => {
  it('a delete racing a param edit removes the row, whichever stamp is later, in both merge orders', () => {
    for (const [deleteAt, editAt] of [[5, 6], [6, 5]]) {
      const deleted = remove(base, 'op-2', s(deleteAt, A))
      const editedSide = editSize(base, 'op-2', 99, s(editAt, B))
      const merged = bothWays(deleted, editedSide)
      expect(merged.entries.has('op-2')).toBe(false)
      expect(merged.dead.get('op-2')).toEqual(s(deleteAt, A))
      expect(liveOrder(merged)).toEqual(['op-1', 'op-3'])
    }
  })

  it('a move racing a delete removes the row', () => {
    const moved = move(base, 'op-1', keyBetween(K3, null, s(7, B)), s(7, B))
    const deleted = remove(base, 'op-1', s(5, A))
    const merged = bothWays(moved, deleted)
    expect(liveOrder(merged)).toEqual(['op-2', 'op-3'])
  })

  it('a Redo after the other side merged the tombstone brings the row back', () => {
    const undone = remove(base, 'op-2', s(5, A))
    const other = mergeStates(base, undone) // B has merged A's tombstone
    expect(other.entries.has('op-2')).toBe(false)
    const redone = edited(undone, (entries) => {
      entries.set('op-2', { ...row('op-2', K2, s(2)), born: s(8, A) })
    })
    const merged = bothWays(other, redone)
    expect(liveOrder(merged)).toEqual(['op-1', 'op-2', 'op-3'])
    expect(merged.dead.get('op-2')).toEqual(s(5, A)) // the tombstone is kept
  })

  it('a Redo is a new life: an edit to the old life does not mix into it', () => {
    const undone = remove(base, 'op-2', s(5, A))
    const redone = edited(undone, (entries) => entries.set('op-2', { ...row('op-2', K2, s(2)), born: s(8, A) }))
    const staleEdit = editSize(base, 'op-2', 99, s(12, B))
    const merged = bothWays(redone, staleEdit)
    expect(/** @type {any} */ (merged.entries.get('op-2')?.record).size).toBe(10)
  })

  it('a tie between born and tombstone stamps goes to the tombstone', () => {
    const state = stateOf([row('op-9', K1, s(4))], [['op-9', s(4)]])
    expect(mergeStates(state, emptyMergeState('proj-1')).entries.has('op-9')).toBe(false)
  })
})

describe('record, position and flags', () => {
  it('a later param edit wins, whole record', () => {
    const merged = bothWays(editSize(base, 'op-1', 20, s(5, A)), editSize(base, 'op-1', 30, s(6, B)))
    expect(/** @type {any} */ (merged.entries.get('op-1')?.record).size).toBe(30)
  })

  it('two moves of one row converge on the later one, with no duplicate', () => {
    const toEnd = keyBetween(K3, null, s(5, A))
    const toFront = keyBetween(null, K1, s(6, B))
    const merged = bothWays(move(base, 'op-2', toEnd, s(5, A)), move(base, 'op-2', toFront, s(6, B)))
    expect(liveOrder(merged)).toEqual(['op-2', 'op-1', 'op-3'])
  })

  it('a move on one side and an edit on the other both survive', () => {
    const toEnd = keyBetween(K3, null, s(5, A))
    const merged = bothWays(move(base, 'op-1', toEnd, s(5, A)), editSize(base, 'op-1', 40, s(6, B)))
    expect(liveOrder(merged)).toEqual(['op-2', 'op-3', 'op-1'])
    expect(/** @type {any} */ (merged.entries.get('op-1')?.record).size).toBe(40)
  })

  it('suppressed and leftBroken are separate last-writer-wins flags', () => {
    const one = edited(base, (entries) => {
      entries.set('op-1', { .../** @type {MergeEntry} */ (entries.get('op-1')), suppressed: [true, s(5, A)], leftBroken: [true, s(9, A)] })
    })
    const two = edited(base, (entries) => {
      entries.set('op-1', { .../** @type {MergeEntry} */ (entries.get('op-1')), suppressed: [false, s(6, B)] })
    })
    const merged = bothWays(one, two)
    expect(merged.entries.get('op-1')?.suppressed).toEqual([false, s(6, B)])
    expect(merged.entries.get('op-1')?.leftBroken).toEqual([true, s(9, A)])
  })

  it('origin and intent travel with the record and never change', () => {
    const withIntent = stateOf([row('op-1', K1, s(1), { origin: 'ai', intent: { prompt: 'a box' } })])
    const later = editSize(withIntent, 'op-1', 50, s(6, B))
    const merged = bothWays(withIntent, later)
    expect(merged.entries.get('op-1')?.origin).toBe('ai')
    expect(merged.entries.get('op-1')?.intent).toEqual({ prompt: 'a box' })
  })

  it('orders by position key, then born stamp', () => {
    const same = stateOf([row('op-x', K1, s(4, B)), row('op-y', K1, s(4, A))])
    expect(liveOrder(same)).toEqual(['op-y', 'op-x'])
  })
})

describe('a same-clock tie at one gap (TODO/data-014)', () => {
  const Z = 'zzzzzz'
  // Neither competitor is `A`, which minted `K3`: an insert after a replica's own row continues
  // its run and sorts first whatever the tag (`positionKey.js`, the member exception).

  /**
   * One replica's row appended after `K3`, keyed the way the document mints it.
   *
   * @param {string} id
   * @param {string} origin
   * @param {import('../replica.js').Stamp} stamp
   */
  function appended(id, origin, stamp) {
    return edited(base, (entries) => {
      entries.set(id, row(id, keyBetween(K3, null, insertTag(stamp, origin)), stamp, { origin }))
    })
  }

  it('the local step sorts first, whichever replica id is lower, in both merge orders', () => {
    for (const [localReplica, otherReplica] of [[B, Z], [Z, B]]) {
      for (const other of ['ai', 'mcp', 'webmcp', 'remote', 'programmatic', 'a file said this']) {
        const merged = bothWays(appended('mine', 'local', s(4, localReplica)), appended('theirs', other, s(4, otherReplica)))
        expect(liveOrder(merged), `${other} on ${otherReplica}`).toEqual(['op-1', 'op-2', 'op-3', 'mine', 'theirs'])
      }
    }
  })

  it('two steps of the same rank fall back to the replica order, stable across runs', () => {
    for (const [first, second] of [['local', 'local'], ['ai', 'mcp'], ['mcp', 'ai']]) {
      const runs = [0, 1].map(() => canonicalJSON(bothWays(appended('on-z', first, s(4, Z)), appended('on-b', second, s(4, B)))))
      expect(runs[1]).toBe(runs[0])
      const merged = bothWays(appended('on-z', first, s(4, Z)), appended('on-b', second, s(4, B)))
      expect(liveOrder(merged).slice(3), `${first}/${second}`).toEqual(['on-b', 'on-z'])
    }
  })

  it('not a tie: the earlier stamp sorts first, whoever made it', () => {
    const merged = bothWays(appended('mine', 'local', s(5, B)), appended('theirs', 'ai', s(4, Z)))
    expect(liveOrder(merged).slice(3)).toEqual(['theirs', 'mine'])
    const reverse = bothWays(appended('mine', 'local', s(4, Z)), appended('theirs', 'ai', s(5, B)))
    expect(liveOrder(reverse).slice(3)).toEqual(['mine', 'theirs'])
  })

  it('a run stays whole behind its head, and a tied local run goes first', () => {
    const mine = edited(base, (entries) => {
      keysBetween(K3, null, 3, insertTag(s(4, Z), 'local')).forEach((key, i) => entries.set(`mine-${i}`, row(`mine-${i}`, key, s(4, Z))))
    })
    const theirs = edited(base, (entries) => {
      keysBetween(K3, null, 2, insertTag(s(4, B), 'ai')).forEach((key, i) => entries.set(`theirs-${i}`, row(`theirs-${i}`, key, s(4, B), { origin: 'ai' })))
    })
    expect(liveOrder(bothWays(mine, theirs)).slice(3)).toEqual(['mine-0', 'mine-1', 'mine-2', 'theirs-0', 'theirs-1'])
  })

  it('insertTag keeps the stamp order and puts a local insert first on a counter tie', () => {
    expect(insertTag(s(4, Z), 'local')).toEqual({ counter: 8, replica: Z })
    expect(insertTag(s(4, B), 'ai')).toEqual({ counter: 9, replica: B })
    expect(insertTag(s(3, B), 'ai').counter).toBeLessThan(insertTag(s(4, Z), 'local').counter)
  })
})

describe('registers and parts', () => {
  it('both sides moving the marker: the later stamp wins', () => {
    const merged = bothWays(marker(base, 'op-1', s(5, A)), marker(base, 'op-3', s(6, B)))
    expect(resolveRollback(merged)).toEqual({ after: 'op-3' })
  })

  it('the marker row deleted by the other side resolves to the nearest earlier live row', () => {
    const marked = marker(base, 'op-3', s(5, A))
    const merged = bothWays(marked, remove(base, 'op-3', s(6, B)))
    expect(resolveRollback(merged)).toEqual({ after: 'op-2' })
    const both = bothWays(merged, remove(base, 'op-2', s(7, B)))
    expect(resolveRollback(both)).toEqual({ after: 'op-1' })
    const none = bothWays(both, remove(base, 'op-1', s(8, B)))
    expect(resolveRollback(none)).toEqual({ after: null })
  })

  it('no marker resolves to null, a start marker to "before the first row"', () => {
    expect(resolveRollback(base)).toBeNull()
    const start = edited(base, (_e, _d, registers) => {
      registers.rollbackAfter = [{ row: null }, s(4)]
    })
    expect(resolveRollback(start)).toEqual({ after: null })
  })

  it('resolution, standing instructions, build volume and parts are last-writer-wins', () => {
    const one = edited(base, (_e, _d, registers) => {
      registers.resolution = ['fine', s(5, A)]
      registers.standingInstructions = ['metric', s(9, A)]
    })
    one.parts.set('part-1', [{ v: 1 }, s(5, A)])
    const two = edited(base, (_e, _d, registers) => {
      registers.resolution = ['draft', s(6, B)]
      registers.buildVolume = [{ x: 200 }, s(3, B)]
    })
    two.parts.set('part-1', [{ v: 2 }, s(6, B)])
    two.parts.set('part-2', [{ v: 3 }, s(2, B)])
    const merged = bothWays(one, two)
    expect(merged.registers.resolution?.[0]).toBe('draft')
    expect(merged.registers.standingInstructions?.[0]).toBe('metric')
    expect(merged.registers.buildVolume?.[0]).toEqual({ x: 200 })
    expect(merged.parts.get('part-1')?.[0]).toEqual({ v: 2 })
    expect(merged.parts.get('part-2')?.[0]).toEqual({ v: 3 })
  })
})

describe('relatedness and project id', () => {
  it('same project id is same; different ids are unrelated and never merged', () => {
    expect(relatedness(base, stateOf([], [], 'proj-1'))).toBe('same')
    const other = stateOf([], [], 'proj-2')
    expect(relatedness(base, other)).toBe('unrelated')
    expect(() => mergeStates(base, other)).toThrow(/different projects/)
  })

  it('legacy-same when a side has no project id and shared unstamped rows match byte for byte', () => {
    const legacy = (/** @type {number} */ size) => stateOf([row('op-1', K1, s(0), { record: { id: 'op-1', type: 'box', size } })], [], null)
    expect(relatedness(legacy(10), legacy(10))).toBe('legacy-same')
    expect(relatedness(legacy(10), legacy(11))).toBe('unrelated')
    const stamped = stateOf([row('op-1', K1, s(3), { record: { id: 'op-1', type: 'box', size: 11 } })], [], 'proj-1')
    expect(relatedness(legacy(10), stamped)).toBe('legacy-same') // a stamped row may differ
  })

  // `TODO/data-013`: "no row in common" is no longer evidence of being related. Two projects
  // started from New share no ids at all (`data-008` made ids replica-scoped), and the old
  // vacuous rule merged them silently.
  it('two states without project ids that share no id are unrelated, unless one side is empty', () => {
    const mine = stateOf([row('op-aaaaaa-1', K1, s(1))], [], null)
    const theirs = stateOf([row('op-bbbbbb-1', K1, s(1, B))], [], null)
    expect(relatedness(mine, theirs)).toBe('unrelated')
    expect(() => mergeStates(mine, theirs)).toThrow(/different projects/)
    // A side with no rows and no tombstones has nothing to tell the two apart, and merging it
    // brings nothing in (an AI fork seeded from the live document starts this way).
    expect(relatedness(mine, emptyMergeState(null))).toBe('legacy-same')
    expect(relatedness(emptyMergeState(null), theirs)).toBe('legacy-same')
  })

  it('a fresh project with an id and a legacy file that share no id are unrelated', () => {
    const fresh = stateOf([row('op-aaaaaa-1', K1, s(1))], [], 'proj-1')
    const legacy = stateOf([row('op-1', K1, s(0))], [], null)
    expect(relatedness(fresh, legacy)).toBe('unrelated')
    expect(relatedness(legacy, fresh)).toBe('unrelated')
  })

  it('a shared tombstone is a shared id: a copy that deleted every common row is still related', () => {
    const legacy = stateOf([row('op-1', K1, s(0))], [], null)
    const deletedIt = stateOf([row('op-bbbbbb-4', K2, s(4, B))], [['op-1', s(3, B)]], null)
    expect(relatedness(legacy, deletedIt)).toBe('legacy-same')
    expect(relatedness(deletedIt, legacy)).toBe('legacy-same')
  })

  it('a merged state takes the defined project id, or the lexically smaller', () => {
    const legacy = stateOf([], [], null)
    expect(mergeStates(legacy, base).projectId).toBe('proj-1')
    expect(mergeStates(base, legacy).projectId).toBe('proj-1')
    expect(mergeStates(legacy, legacy).projectId).toBeNull()
  })
})

describe('diffStates', () => {
  it('lists added, revised, removed, moved and changed registers', () => {
    let after = remove(base, 'op-1', s(5, B))
    after = editSize(after, 'op-2', 77, s(6, B))
    after = move(after, 'op-3', keyBetween(null, K2, s(7, B)), s(7, B))
    after = edited(after, (entries, _d, registers) => {
      entries.set('op-4', row('op-4', keyBetween(K3, null, s(8, B)), s(8, B)))
      registers.resolution = ['fine', s(9, B)]
    })
    after.parts.set('part-1', [{}, s(10, B)])
    expect(diffStates(base, after)).toEqual({
      added: ['op-4'],
      revised: ['op-2'],
      removed: ['op-1'],
      moved: ['op-3'],
      registers: ['resolution'],
      parts: ['part-1'],
    })
    expect(diffStates(base, base)).toEqual({ added: [], revised: [], removed: [], moved: [], registers: [], parts: [] })
  })
})

describe('degenerate states', () => {
  const tombs = stateOf([], [['op-1', s(5)], ['op-2', s(6)]])

  it('empty states, one empty side, identical states, all tombstones', () => {
    const empty = emptyMergeState('proj-1')
    expect(canonicalJSON(mergeStates(empty, empty))).toBe(canonicalJSON(empty))
    expect(canonicalJSON(bothWays(empty, base))).toBe(canonicalJSON(base))
    expect(canonicalJSON(mergeStates(base, base))).toBe(canonicalJSON(base))
    expect(canonicalJSON(mergeStates(tombs, tombs))).toBe(canonicalJSON(tombs))
    const merged = bothWays(base, tombs)
    expect(liveOrder(merged)).toEqual(['op-3'])
    expect([...merged.dead.keys()]).toEqual(['op-1', 'op-2'])
  })

  it('does not change its inputs', () => {
    const before = canonicalJSON(base)
    mergeStates(base, remove(base, 'op-1', s(5)))
    expect(canonicalJSON(base)).toBe(before)
  })
})
