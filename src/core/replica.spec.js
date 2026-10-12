// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { compareStamps, counterOfId, createClock, createReplicaId, isReplicaId, isStamp, REPLICA_ID_LENGTH } from './replica.js'

describe('createReplicaId', () => {
  it('is six characters from the 32-symbol lower-case alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      const id = createReplicaId()
      expect(id).toHaveLength(REPLICA_ID_LENGTH)
      expect(isReplicaId(id)).toBe(true)
    }
  })

  it('takes its randomness from the injected generator, so a spec can fix it', () => {
    const fixed = () => Uint8Array.from([0, 1, 2, 3, 31, 32])
    expect(createReplicaId(fixed)).toBe('abcd7a')
  })

  it('does not repeat across calls from the real generator (30 bits, 200 draws)', () => {
    const seen = new Set(Array.from({ length: 200 }, () => createReplicaId()))
    expect(seen.size).toBe(200)
  })
})

describe('isReplicaId', () => {
  it('rejects the wrong length, case, and symbols', () => {
    expect(isReplicaId('abc')).toBe(false)
    expect(isReplicaId('ABCDEF')).toBe(false)
    expect(isReplicaId('abcde1')).toBe(false)
    expect(isReplicaId(undefined)).toBe(false)
    expect(isReplicaId(123456)).toBe(false)
  })
})

describe('compareStamps', () => {
  const a = { counter: 3, replica: 'aaaaaa' }
  const b = { counter: 3, replica: 'bbbbbb' }
  const c = { counter: 4, replica: 'aaaaaa' }

  it('orders by counter first, then replica id', () => {
    expect(compareStamps(a, c)).toBeLessThan(0)
    expect(compareStamps(c, a)).toBeGreaterThan(0)
    expect(compareStamps(a, b)).toBeLessThan(0)
    expect(compareStamps(b, a)).toBeGreaterThan(0)
  })

  it('is total: equal only for the identical stamp', () => {
    expect(compareStamps(a, { ...a })).toBe(0)
    expect(compareStamps(a, b)).not.toBe(0)
  })

  it('sorts a shuffled set into one order whatever the input order', () => {
    const stamps = [c, b, a, { counter: 1, replica: 'zzzzzz' }]
    const forward = [...stamps].sort(compareStamps)
    const backward = [...stamps].reverse().sort(compareStamps)
    expect(forward).toEqual(backward)
    expect(forward[0].counter).toBe(1)
  })
})

describe('isStamp', () => {
  it('accepts a counter and a replica id', () => {
    expect(isStamp({ counter: 0, replica: 'abcdef' })).toBe(true)
    expect(isStamp({ counter: 12, replica: 'k3f5xa' })).toBe(true)
  })

  it('rejects anything malformed', () => {
    expect(isStamp(null)).toBe(false)
    expect(isStamp('3')).toBe(false)
    expect(isStamp({ counter: -1, replica: 'abcdef' })).toBe(false)
    expect(isStamp({ counter: 1.5, replica: 'abcdef' })).toBe(false)
    expect(isStamp({ counter: Number.NaN, replica: 'abcdef' })).toBe(false)
    expect(isStamp({ counter: 1, replica: 'ABCDEF' })).toBe(false)
    expect(isStamp({ counter: 1 })).toBe(false)
    expect(isStamp({ replica: 'abcdef' })).toBe(false)
  })
})

describe('createClock', () => {
  it('ticks upward from its start and stamps with its replica', () => {
    const clock = createClock('abcdef', 5)
    expect(clock.now()).toBe(5)
    expect(clock.tick()).toBe(6)
    expect(clock.tick()).toBe(7)
    expect(clock.stamp()).toEqual({ counter: 7, replica: 'abcdef' })
  })

  it('observe moves it ahead of a stamp it read, and never backwards', () => {
    const clock = createClock('abcdef')
    clock.observe(10)
    expect(clock.now()).toBe(10)
    clock.observe(3)
    expect(clock.now()).toBe(10)
    expect(clock.tick()).toBe(11)
  })

  it('ignores a malformed observation instead of poisoning the counter', () => {
    const clock = createClock('abcdef', 2)
    clock.observe(Number.NaN)
    clock.observe(-4)
    clock.observe(1.5)
    expect(clock.now()).toBe(2)
  })

  it('refuses a replica id that is not one', () => {
    expect(() => createClock('nope')).toThrow(/replica id/)
  })
})

describe('counterOfId', () => {
  it('reads the counter off a replica-scoped id, including a derived one', () => {
    expect(counterOfId('cube-k3f5xa-12')).toBe(12)
    expect(counterOfId('cube-k3f5xa-12-move-k3f5xa-13')).toBe(13)
  })

  it('reads zero for a legacy id, which carries no replica', () => {
    expect(counterOfId('op-7')).toBe(0)
    expect(counterOfId('cube-3-move-4')).toBe(0)
    expect(counterOfId('')).toBe(0)
  })
})
