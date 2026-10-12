// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { compareKeys, keyBetween, keysBetween, MEMBER_DIGIT, MID_DIGIT, parseKey } from './positionKey.js'

const R1 = 'aaaaaa'
const R2 = 'bbbbbb'
const R3 = 'cccccc'
const BASE = 'zzzzzz'

/**
 * @param {string} replica
 * @param {number} [start]
 */
function clock(replica, start = 0) {
  let counter = start
  return {
    next: () => ({ counter: (counter += 1), replica }),
    observe: (/** @type {number} */ seen) => {
      if (seen > counter) counter = seen
    },
  }
}

/** @param {string[]} keys */
function expectSorted(keys) {
  for (let i = 1; i < keys.length; i += 1) expect(compareKeys(keys[i - 1], keys[i])).toBeLessThan(0)
}

describe('compareKeys', () => {
  it('is plain code-unit order over the base-62 alphabet', () => {
    expect(compareKeys('0', 'A')).toBeLessThan(0)
    expect(compareKeys('Z', 'a')).toBeLessThan(0)
    expect(compareKeys('ab', 'abc')).toBeLessThan(0)
    expect(compareKeys('abc', 'abc')).toBe(0)
    expect(compareKeys('b', 'abc')).toBeGreaterThan(0)
  })
})

describe('keyBetween', () => {
  it('mints a first key that ends with the replica id', () => {
    const key = keyBetween(null, null, { counter: 1, replica: R1 })
    expect(key.endsWith(R1)).toBe(true)
    expect(parseKey(key)).toEqual([{ digit: MID_DIGIT, counter: 1, replica: R1 }])
  })

  it('throws when the neighbours are out of order or equal', () => {
    const a = keyBetween(null, null, { counter: 1, replica: R1 })
    const b = keyBetween(a, null, { counter: 2, replica: R2 })
    expect(() => keyBetween(b, a, { counter: 3, replica: R1 })).toThrow(/does not sort before/)
    expect(() => keyBetween(a, a, { counter: 3, replica: R1 })).toThrow(/does not sort before/)
  })

  it('throws on a malformed key', () => {
    expect(() => keyBetween('!!', null, { counter: 1, replica: R1 })).toThrow(/malformed/)
  })

  it('always lands strictly between its neighbours, over 3 000 random inserts by three replicas', () => {
    let seed = 7
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const clocks = [clock(R1), clock(R2), clock(R3)]
    /** @type {string[]} */
    const keys = []
    for (let i = 0; i < 3000; i += 1) {
      const c = clocks[Math.floor(random() * 3)]
      c.observe(i)
      const gap = Math.floor(random() * (keys.length + 1))
      const before = gap > 0 ? keys[gap - 1] : null
      const after = gap < keys.length ? keys[gap] : null
      const key = keyBetween(before, after, c.next())
      if (before !== null) expect(compareKeys(before, key)).toBeLessThan(0)
      if (after !== null) expect(compareKeys(key, after)).toBeLessThan(0)
      keys.splice(gap, 0, key)
    }
    expectSorted(keys)
  })

  it('continues a run as members of its first row', () => {
    const c = clock(R1)
    const head = keyBetween(null, null, c.next())
    const second = keyBetween(head, null, c.next())
    const third = keyBetween(second, null, c.next())
    expect(second.startsWith(head)).toBe(true)
    expect(third.startsWith(head)).toBe(true)
    expect(parseKey(third)).toHaveLength(2)
    expect(parseKey(third)[1].digit).toBe(MEMBER_DIGIT)
  })

  it('keeps two replicas runs at one gap apart, the earlier first stamp first', () => {
    const x = keyBetween(null, null, { counter: 1, replica: BASE })
    const y = keyBetween(x, null, { counter: 2, replica: BASE })
    // R2 starts first (counter 5), R1 later (counter 6), each inserting three rows.
    const run2 = keysBetween(x, y, 3, { counter: 5, replica: R2 })
    const run1 = keysBetween(x, y, 3, { counter: 6, replica: R1 })
    const merged = [x, y, ...run1, ...run2].sort(compareKeys)
    expect(merged).toEqual([x, ...run2, ...run1, y])
  })

  it('keysBetween returns `count` ordered keys inside the gap', () => {
    const keys = keysBetween(null, null, 50, { counter: 1, replica: R1 })
    expect(keys).toHaveLength(50)
    expectSorted(keys)
  })
})

describe('key growth (TODO/data-009 asks for these two numbers)', () => {
  /** @type {Record<string, number>} */
  const measured = {}

  it('1 000 inserts at one gap stay constant length (one replica, each after the last)', () => {
    const x = keyBetween(null, null, { counter: 1, replica: BASE })
    const y = keyBetween(x, null, { counter: 2, replica: BASE })
    const c = clock(R1, 2)
    let previous = x
    let longest = 0
    for (let i = 0; i < 1000; i += 1) {
      previous = keyBetween(previous, y, c.next())
      longest = Math.max(longest, previous.length)
    }
    measured.appendRun = longest
    // Four segments: the base's second row is a member of its first, so the gap needs an escape.
    expect(longest).toBeLessThanOrEqual(50)
  })

  it('1 000 inserts at one gap stay constant length (each right after the same row)', () => {
    const x = keyBetween(null, null, { counter: 1, replica: BASE })
    const y = keyBetween(x, null, { counter: 2, replica: BASE })
    const c = clock(R1, 2)
    let after = y
    let longest = 0
    for (let i = 0; i < 1000; i += 1) {
      after = keyBetween(x, after, c.next())
      longest = Math.max(longest, after.length)
    }
    measured.rightAfterOneRow = longest
    expect(longest).toBeLessThanOrEqual(40)
  })

  it('1 000 alternating front inserts (two replicas) stay constant length', () => {
    const clocks = [clock(R1), clock(R2)]
    /** @type {string | null} */
    let first = null
    let longest = 0
    for (let i = 0; i < 1000; i += 1) {
      const c = clocks[i % 2]
      c.observe(i)
      first = keyBetween(null, first, c.next())
      longest = Math.max(longest, first.length)
    }
    measured.alternatingFront = longest
    expect(longest).toBeLessThanOrEqual(40)
  })

  it('1 000 alternating-replica inserts at one gap, each after the other replica row', () => {
    const x = keyBetween(null, null, { counter: 1, replica: BASE })
    const y = keyBetween(x, null, { counter: 2, replica: BASE })
    const clocks = [clock(R1), clock(R2)]
    let previous = x
    let longest = 0
    for (let i = 0; i < 1000; i += 1) {
      const c = clocks[i % 2]
      c.observe(i + 2)
      previous = keyBetween(previous, y, c.next())
      longest = Math.max(longest, previous.length)
    }
    measured.alternatingAppend = longest
    expect(longest).toBeLessThanOrEqual(60)
  })

  it('worst case: 1 000 inserts that always split the newest gap in half (zig-zag)', () => {
    const c = clock(R1)
    let low = keyBetween(null, null, { counter: 1, replica: BASE })
    let high = keyBetween(low, null, { counter: 2, replica: BASE })
    c.observe(2)
    let longest = 0
    for (let i = 0; i < 1000; i += 1) {
      const key = keyBetween(low, high, { counter: c.next().counter, replica: i % 2 ? R1 : R2 })
      if (i % 2) low = key
      else high = key
      longest = Math.max(longest, key.length)
    }
    measured.zigzag = longest
    // Linear, not super-linear: one segment (about 12 characters) per ~11 halvings at worst.
    expect(longest).toBeLessThan(1000 * 12)
    console.log('position-key growth after 1 000 inserts (longest key, characters):', JSON.stringify(measured))
  })
})
