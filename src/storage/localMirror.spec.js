import { describe, expect, it } from 'vitest'

import { MIRROR_KEY, createLocalStorageMirror } from './localMirror.js'

/**
 * A `Storage`-shaped fake.
 *
 * @param {{ throwOnRead?: boolean, throwOnWrite?: boolean }} [options]
 */
function fakeStorage(options = {}) {
  /** @type {Map<string, string>} */
  const data = new Map()
  return {
    data,
    /** @param {string} key */
    getItem: (key) => {
      if (options.throwOnRead) throw new Error('SecurityError')
      return data.get(key) ?? null
    },
    /** @param {string} key @param {string} value */
    setItem: (key, value) => {
      if (options.throwOnWrite) throw new DOMException('full', 'QuotaExceededError')
      data.set(key, value)
    },
    /** @param {string} key */
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

describe('createLocalStorageMirror', () => {
  it('round-trips a record through one JSON entry', () => {
    const storage = fakeStorage()
    const mirror = createLocalStorageMirror({ storage })
    mirror.write({ text: '{"op":"a"}\n', savedAt: 7 })
    expect(JSON.parse(storage.data.get(MIRROR_KEY) ?? '')).toEqual({ text: '{"op":"a"}\n', savedAt: 7 })
    expect(mirror.read()).toEqual({ text: '{"op":"a"}\n', savedAt: 7 })
  })

  it('reads null when nothing is there, or when the entry is corrupt', () => {
    const storage = fakeStorage()
    const mirror = createLocalStorageMirror({ storage })
    expect(mirror.read()).toBeNull()
    storage.data.set(MIRROR_KEY, 'not json')
    expect(mirror.read()).toBeNull()
    storage.data.set(MIRROR_KEY, '{"text":1}')
    expect(mirror.read()).toBeNull()
  })

  it('clear() removes the entry', () => {
    const storage = fakeStorage()
    const mirror = createLocalStorageMirror({ storage })
    mirror.write({ text: 'x', savedAt: 1 })
    mirror.clear()
    expect(mirror.read()).toBeNull()
  })

  it('never throws: quota, a throwing read, or no storage at all', () => {
    const full = createLocalStorageMirror({ storage: fakeStorage({ throwOnWrite: true }) })
    expect(() => full.write({ text: 'x', savedAt: 1 })).not.toThrow()
    const blocked = createLocalStorageMirror({ storage: fakeStorage({ throwOnRead: true }) })
    expect(blocked.read()).toBeNull()
    expect(() => blocked.clear()).not.toThrow()
    const none = createLocalStorageMirror({ storage: null })
    expect(none.read()).toBeNull()
    expect(() => none.write({ text: 'x', savedAt: 1 })).not.toThrow()
  })
})
