// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Property suite for the merge core (`TODO/data-009`). Every case is seeded; a failure names
 * its seed so `caseFor(seed)` reproduces it exactly.
 */
import { describe, expect, it } from 'vitest'
import { liveOrder, mergeStates } from './merge.js'
import { compareKeys, keyBetween } from './positionKey.js'
import { canonicalJSON, emptyMergeState, highestCounter } from './state.js'
import { compareStamps } from '../replica.js'

/** @typedef {import('./state.js').MergeState} MergeState */
/** @typedef {import('./state.js').MergeEntry} MergeEntry */
/** @typedef {import('../replica.js').Stamp} Stamp */

const PROJECT = 'proj-fuzz'
const BASE_REPLICA = 'zzzzzz'
const REPLICAS = ['aaaaaa', 'mmmmmm', 'qqqqqq']

/** mulberry32: small, fast, and fully determined by its seed. */
function prng(/** @type {number} */ seed) {
  let t = seed >>> 0
  const next = () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (/** @type {number} */ n) => Math.floor(next() * n),
    /** @template T @param {T[]} list @returns {T} */
    pick: (list) => list[Math.floor(next() * list.length)],
  }
}

/** @param {MergeState} state @returns {MergeState} */
function copy(state) {
  return { ...state, entries: new Map(state.entries), dead: new Map(state.dead), registers: { ...state.registers }, parts: new Map(state.parts) }
}

/**
 * One writer: a replica id, a Lamport counter, its state, and the rows it removed (for Redo).
 *
 * @param {string} replica
 * @param {MergeState} state
 */
function writer(replica, state) {
  return { replica, counter: highestCounter(state), state: copy(state), /** @type {Map<string, MergeEntry>} */ removed: new Map() }
}

/** @typedef {ReturnType<typeof writer>} Writer */

/** @param {Writer} w @returns {Stamp} */
function tick(w) {
  w.counter += 1
  return { counter: w.counter, replica: w.replica }
}

/**
 * The key for a new slot at gap `gap` of `order` (ids), skipping `skip`.
 *
 * @param {MergeState} state
 * @param {string[]} order
 * @param {number} gap
 * @param {Stamp} stamp
 */
function keyAtGap(state, order, gap, stamp) {
  const keyOf = (/** @type {string} */ id) => /** @type {MergeEntry} */ (state.entries.get(id)).pos[0]
  let before = gap > 0 ? keyOf(order[gap - 1]) : null
  let after = gap < order.length ? keyOf(order[gap]) : null
  // Two rows can share a key only through a tie the born stamp breaks; step past it.
  if (before !== null && after !== null && compareKeys(before, after) >= 0) after = null
  return keyBetween(before, after, stamp)
}

/**
 * One random edit by `w`, as the command layer would write it.
 *
 * @param {Writer} w
 * @param {ReturnType<typeof prng>} rand
 * @param {Writer[]} all
 */
function randomEdit(w, rand, all) {
  const state = w.state
  const order = liveOrder(state)
  const roll = rand.int(100)
  if (roll < 30 || order.length === 0) {
    const stamp = tick(w)
    const id = `op-${w.replica}-${stamp.counter}`
    const key = keyAtGap(state, order, rand.int(order.length + 1), stamp)
    state.entries.set(id, { record: { id, size: rand.int(100) }, origin: rand.pick(['local', 'ai']), born: stamp, pos: [key, stamp], rec: stamp })
    return
  }
  const id = rand.pick(order)
  const entry = /** @type {MergeEntry} */ (state.entries.get(id))
  if (roll < 45) {
    state.entries.set(id, { ...entry, record: { id, size: rand.int(100) }, rec: tick(w) })
  } else if (roll < 57) {
    const rest = order.filter((other) => other !== id)
    const stamp = tick(w)
    state.entries.set(id, { ...entry, pos: [keyAtGap(state, rest, rand.int(rest.length + 1), stamp), stamp] })
  } else if (roll < 67) {
    w.removed.set(id, entry)
    state.entries.delete(id)
    state.dead.set(id, tick(w))
  } else if (roll < 74) {
    const candidates = [...w.removed.keys()].filter((removedId) => !state.entries.has(removedId))
    if (candidates.length === 0) return
    const revived = rand.pick(candidates)
    state.entries.set(revived, { .../** @type {MergeEntry} */ (w.removed.get(revived)), born: tick(w) })
    w.removed.delete(revived)
  } else if (roll < 80) {
    state.entries.set(id, { ...entry, [rand.pick(['suppressed', 'leftBroken'])]: [rand.next() < 0.5, tick(w)] })
  } else if (roll < 86) {
    const which = rand.int(3)
    const value = which === 0 ? null : which === 1 ? { row: null } : { row: id, key: entry.pos[0], born: entry.born }
    state.registers = { ...state.registers, rollbackAfter: [/** @type {any} */ (value), tick(w)] }
  } else if (roll < 91) {
    const name = rand.pick(/** @type {const} */ (['resolution', 'standingInstructions', 'buildVolume']))
    state.registers = { ...state.registers, [name]: [rand.int(5), tick(w)] }
  } else if (roll < 95) {
    state.parts.set(`part-${rand.int(3)}`, [{ v: rand.int(9) }, tick(w)])
  } else if (all.length > 1) {
    const other = rand.pick(all.filter((x) => x !== w))
    w.state = mergeStates(w.state, other.state)
    w.counter = Math.max(w.counter, highestCounter(w.state))
  }
}

/**
 * A shared base and three replicas' independent edit scripts on it.
 *
 * @param {number} seed
 * @returns {MergeState[]}
 */
function caseFor(seed) {
  const rand = prng(seed)
  const baseWriter = writer(BASE_REPLICA, emptyMergeState(PROJECT))
  const baseEdits = rand.int(10)
  for (let i = 0; i < baseEdits; i += 1) randomEdit(baseWriter, rand, [baseWriter])
  const writers = REPLICAS.map((replica) => writer(replica, baseWriter.state))
  const steps = 1 + rand.int(30)
  for (let i = 0; i < steps; i += 1) {
    const w = rand.pick(writers)
    randomEdit(w, rand, writers)
  }
  return writers.map((w) => w.state)
}

/** @param {MergeState[]} states @param {number[]} order */
function mergeInOrder(states, order) {
  return order.slice(1).reduce((acc, index) => mergeStates(acc, states[index]), states[order[0]])
}

const PERMUTATIONS = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]

/** @param {number} seed */
function checkLaws(seed) {
  const [a, b, c] = caseFor(seed)
  const j = canonicalJSON
  const ab = mergeStates(a, b)
  expect(j(ab), `commutative, seed ${seed}`).toBe(j(mergeStates(b, a)))
  expect(j(mergeStates(ab, c)), `associative, seed ${seed}`).toBe(j(mergeStates(a, mergeStates(b, c))))
  for (const x of [a, b, c]) expect(j(mergeStates(x, x)), `idempotent, seed ${seed}`).toBe(j(x))
  const all = PERMUTATIONS.map((order) => j(mergeInOrder([a, b, c], order)))
  for (const result of all) expect(result, `six merge orders, seed ${seed}`).toBe(all[0])
  expect(j(mergeStates(a, ab)), `absorbs, seed ${seed}`).toBe(j(ab))
  // Normalised: no live row is at or behind its tombstone.
  const merged = mergeInOrder([a, b, c], [0, 1, 2])
  for (const [id, entry] of merged.entries) {
    const tomb = merged.dead.get(id)
    if (tomb) expect(compareStamps(entry.born, tomb), `live over tombstone, seed ${seed}`).toBeGreaterThan(0)
  }
}

describe('merge laws over three replicas from a shared base', () => {
  it('commutative, associative, idempotent; all six orders identical (2 000 fixed seeds)', () => {
    for (let seed = 1; seed <= 2000; seed += 1) checkLaws(seed)
  })

  it('holds for a time-boxed run of random seeds', () => {
    const until = Date.now() + 1500
    let ran = 0
    while (Date.now() < until) {
      const seed = Math.floor(Math.random() * 2 ** 31)
      try {
        checkLaws(seed)
      } catch (error) {
        throw new Error(`merge law failed for random seed ${seed}: ${/** @type {Error} */ (error).message}`)
      }
      ran += 1
    }
    expect(ran).toBeGreaterThan(0)
  })
})

/**
 * Three replicas each insert a run of rows at one gap of a shared base. With `ownGap`, the
 * gap's left neighbour is a row the first replica minted.
 *
 * @param {number} seed
 * @param {boolean} ownGap
 */
function runCase(seed, ownGap) {
  const rand = prng(seed)
  const baseWriter = writer(BASE_REPLICA, emptyMergeState(PROJECT))
  const owner = writer(REPLICAS[0], emptyMergeState(PROJECT))
  const rows = 1 + rand.int(6)
  for (let i = 0; i < rows; i += 1) {
    const w = ownGap && rand.next() < 0.5 ? owner : baseWriter
    w.counter = Math.max(baseWriter.counter, owner.counter)
    const stamp = tick(w)
    const order = liveOrder(baseWriter.state)
    const id = `op-${w.replica}-${stamp.counter}`
    const key = keyAtGap(baseWriter.state, order, rand.int(order.length + 1), stamp)
    baseWriter.state.entries.set(id, { record: { id }, origin: 'local', born: stamp, pos: [key, stamp], rec: stamp })
    baseWriter.counter = owner.counter = Math.max(baseWriter.counter, owner.counter)
  }
  const order = liveOrder(baseWriter.state)
  const lefts = [...order.keys()].filter((i) => order[i].includes(ownGap ? REPLICAS[0] : BASE_REPLICA))
  const gap = lefts.length > 0 && rand.next() < 0.9 ? rand.pick(lefts) + 1 : (ownGap ? -1 : 0)
  if (gap < 0) return null
  const writers = REPLICAS.map((replica) => writer(replica, baseWriter.state))
  /** @type {{ ids: string[], first: Stamp }[]} */
  const runs = writers.map(() => ({ ids: [], first: { counter: 0, replica: '' } }))
  const keyOf = (/** @type {Writer} */ w, /** @type {string} */ id) => /** @type {MergeEntry} */ (w.state.entries.get(id)).pos[0]
  const after = gap < order.length ? order[gap] : null
  const lengths = writers.map(() => 1 + rand.int(6))
  // Interleave the writers' inserts in time; other edits push their clocks on.
  while (writers.some((_, i) => runs[i].ids.length < lengths[i])) {
    const i = rand.int(writers.length)
    if (runs[i].ids.length >= lengths[i]) continue
    const w = writers[i]
    w.counter += rand.int(4)
    const stamp = tick(w)
    const previous = runs[i].ids.length > 0 ? runs[i].ids[runs[i].ids.length - 1] : gap > 0 ? order[gap - 1] : null
    const key = keyBetween(previous === null ? null : keyOf(w, previous), after === null ? null : keyOf(w, after), stamp)
    const id = `op-${w.replica}-${stamp.counter}`
    w.state.entries.set(id, { record: { id }, origin: 'local', born: stamp, pos: [key, stamp], rec: stamp })
    if (runs[i].ids.length === 0) runs[i].first = stamp
    runs[i].ids.push(id)
  }
  const merged = mergeInOrder(writers.map((w) => w.state), [0, 1, 2])
  return { merged: liveOrder(merged), runs }
}

describe('position-key properties under merge', () => {
  /** @param {string[]} merged @param {string[]} ids */
  const contiguous = (merged, ids) => {
    const start = merged.indexOf(ids[0])
    return ids.every((id, k) => merged[start + k] === id)
  }

  it('runs do not interleave, at a gap after a base row (1 000 seeds)', () => {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const result = /** @type {NonNullable<ReturnType<typeof runCase>>} */ (runCase(seed, false))
      for (const run of result.runs) expect(contiguous(result.merged, run.ids), `contiguous, seed ${seed}`).toBe(true)
    }
  })

  it('runs do not interleave, at a gap after a row one of the writers minted (1 000 seeds)', () => {
    let checked = 0
    for (let seed = 1; seed <= 1000; seed += 1) {
      const result = runCase(seed, true)
      if (result === null) continue
      checked += 1
      for (const run of result.runs) expect(contiguous(result.merged, run.ids), `contiguous, seed ${seed}`).toBe(true)
    }
    expect(checked).toBeGreaterThan(500)
  })

  it('same-gap order follows the first stamp, at a gap after a base row (1 000 seeds)', () => {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const result = /** @type {NonNullable<ReturnType<typeof runCase>>} */ (runCase(seed, false))
      const byPosition = [...result.runs].sort((x, y) => result.merged.indexOf(x.ids[0]) - result.merged.indexOf(y.ids[0]))
      const byStamp = [...result.runs].sort((x, y) => compareStamps(x.first, y.first))
      expect(byPosition.map((run) => run.ids[0]), `stamp order, seed ${seed}`).toEqual(byStamp.map((run) => run.ids[0]))
    }
  })
})

describe('scale', () => {
  it('merges two 5 000-entry states in near-linear time', () => {
    const left = writer(REPLICAS[0], emptyMergeState(PROJECT))
    /** @type {string | null} */
    let previous = null
    for (let i = 0; i < 5000; i += 1) {
      const stamp = tick(left)
      const key = keyBetween(previous, null, stamp)
      previous = key
      left.state.entries.set(`op-${i}`, { record: { id: `op-${i}`, size: i }, origin: 'local', born: stamp, pos: [key, stamp], rec: stamp })
    }
    const right = writer(REPLICAS[1], left.state)
    for (let i = 0; i < 5000; i += 3) {
      const entry = /** @type {MergeEntry} */ (right.state.entries.get(`op-${i}`))
      right.state.entries.set(`op-${i}`, { ...entry, record: { id: `op-${i}`, size: -i }, rec: tick(right) })
    }
    for (let i = 1; i < 5000; i += 7) {
      right.state.entries.delete(`op-${i}`)
      right.state.dead.set(`op-${i}`, tick(right))
    }
    const started = performance.now()
    const merged = mergeStates(left.state, right.state)
    const order = liveOrder(merged)
    const elapsed = performance.now() - started
    console.log(`merge + order of two 5 000-entry states: ${elapsed.toFixed(1)} ms`)
    expect(order.length).toBe(5000 - Math.ceil(4999 / 7))
    expect(elapsed).toBeLessThan(2000)
  })
})
