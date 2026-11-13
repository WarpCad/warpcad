// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck
import { describe, expect, it, vi } from 'vitest'

import {
  CLEARED_DATA_MESSAGE,
  formatEstimate,
  hasSavedBefore,
  markSavedBefore,
  requestPersistence,
  storageEstimate,
} from './persistentStorage.js'

describe('requestPersistence', () => {
  it("returns 'granted' when the browser grants it", async () => {
    expect(await requestPersistence({ persist: async () => true })).toBe('granted')
  })
  it("returns 'denied' when the browser declines", async () => {
    expect(await requestPersistence({ persist: async () => false })).toBe('denied')
  })
  it("returns 'unsupported' when the API is absent", async () => {
    expect(await requestPersistence(undefined)).toBe('unsupported')
    expect(await requestPersistence(null)).toBe('unsupported')
    expect(await requestPersistence({})).toBe('unsupported')
  })
  it('never throws, whether persist throws or rejects', async () => {
    expect(
      await requestPersistence({
        persist: () => {
          throw new Error('nope')
        },
      }),
    ).toBe('denied')
    expect(await requestPersistence({ persist: () => Promise.reject(new Error('nope')) })).toBe('denied')
  })
})

describe('storageEstimate', () => {
  it('returns usage and quota in bytes', async () => {
    expect(await storageEstimate({ estimate: async () => ({ usage: 10, quota: 100 }) })).toEqual({ usageBytes: 10, quotaBytes: 100 })
  })
  it('returns null when the API is absent, throws, or answers nonsense', async () => {
    expect(await storageEstimate(undefined)).toBeNull()
    expect(await storageEstimate({})).toBeNull()
    expect(
      await storageEstimate({
        estimate: () => {
          throw new Error('x')
        },
      }),
    ).toBeNull()
    expect(await storageEstimate({ estimate: async () => ({}) })).toBeNull()
    expect(await storageEstimate({ estimate: async () => ({ usage: 'a', quota: 5 }) })).toBeNull()
  })
})

describe('formatEstimate', () => {
  it('words usage against quota', () => {
    expect(formatEstimate({ usageBytes: 480 * 1024 * 1024, quotaBytes: 500 * 1024 * 1024 })).toBe('using 480 MB of 500 MB')
    expect(formatEstimate({ usageBytes: 2048, quotaBytes: 4096 })).toBe('using 2 KB of 4 KB')
  })
})

describe('the saved-before flag', () => {
  function fakeStorage() {
    const map = new Map()
    return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)) }
  }
  it('is unset until marked, then set', () => {
    const storage = fakeStorage()
    expect(hasSavedBefore(storage)).toBe(false)
    markSavedBefore(storage)
    expect(hasSavedBefore(storage)).toBe(true)
  })
  it('is swallowed when localStorage is missing or throws', () => {
    const broken = {
      getItem: vi.fn(() => {
        throw new Error('blocked')
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked')
      }),
    }
    expect(hasSavedBefore(broken)).toBe(false)
    expect(() => markSavedBefore(broken)).not.toThrow()
    expect(hasSavedBefore(undefined)).toBe(false)
    expect(() => markSavedBefore(undefined)).not.toThrow()
  })
  it('has the wording the task specifies', () => {
    expect(CLEARED_DATA_MESSAGE).toBe("Your browser cleared WarpCad's saved data. Open a project file to carry on.")
  })
})
