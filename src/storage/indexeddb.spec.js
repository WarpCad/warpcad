// @ts-nocheck — this spec drives hand-written duck-typed fakes of browser globals (`window`,
// `indexedDB` via `idb`, the File System Access handles). Typing each fake against the full DOM
// / `idb` interfaces would be more code than the fakes; the *modules under test* are fully
// typed and checked by `npm run typecheck`, which is what the gate is for.
import { describe, expect, it, vi } from 'vitest'

import { AUTOSAVE_KEY, STORE_NAME, UNREADABLE_KEY, createIndexedDbBackend } from './indexeddb.js'

/**
 * `TODO/io-001` — the IndexedDB adapter behind the autosave scheduler.
 *
 * Mocked at the boundary: `idb`'s `openDB` is injected, so no real IndexedDB
 * exists here. The fake below implements only the slice of `idb`'s surface the
 * adapter is allowed to touch — `db.transaction(store, mode)` returning
 * `{ store, done }` — which is itself the test of the rule the adapter's own
 * comment states: nothing but IDB requests may be awaited between opening a
 * transaction and its `done`. Real-engine behaviour (Chromium and WebKit) is
 * `e2e/local-persistence.e2e.js`'s job.
 */

/** @param {{ failOn?: 'open' | 'put' | 'done' | 'get', value?: any }} [options] */
function fakeOpen(options = {}) {
  /** @type {Map<string, any>} */
  const data = new Map()
  if (options.value !== undefined) data.set(AUTOSAVE_KEY, options.value)
  const calls = { opened: 0, closed: 0, transactions: /** @type {any[]} */ ([]) }

  const open = vi.fn(async (/** @type {string} */ name, /** @type {number} */ version, /** @type {any} */ hooks) => {
    calls.opened += 1
    if (options.failOn === 'open') throw new Error('SecurityError: insecure')
    hooks?.upgrade?.({
      /** @param {string} store */
      createObjectStore(store) {
        calls.transactions.push(['createObjectStore', store])
      },
      objectStoreNames: { contains: () => false },
    })
    return {
      name,
      version,
      close() {
        calls.closed += 1
      },
      /** @param {string} store @param {string} mode */
      transaction(store, mode) {
        calls.transactions.push([store, mode])
        /** @type {(() => void) | undefined} */
        let finish
        const done = new Promise((resolve, reject) => {
          finish = () =>
            options.failOn === 'done'
              ? reject(new DOMException('over quota', 'QuotaExceededError'))
              : resolve(undefined)
        })
        return {
          store: {
            /** @param {string} key */
            async get(key) {
              if (options.failOn === 'get') throw new Error('read failed')
              queueMicrotask(() => finish?.())
              return data.get(key)
            },
            /** @param {any} value @param {string} key */
            async put(value, key) {
              if (options.failOn === 'put') throw new Error('put failed')
              data.set(key, value)
              queueMicrotask(() => finish?.())
              return key
            },
          },
          done,
        }
      },
    }
  })
  return { open, data, calls }
}

describe('createIndexedDbBackend', () => {
  it('creates the object store on first open', async () => {
    const { open, calls } = fakeOpen()
    const backend = createIndexedDbBackend({ open })
    await backend.load()
    expect(calls.transactions).toContainEqual(['createObjectStore', STORE_NAME])
  })

  it('returns null for a first visit — no autosave is not an error', async () => {
    const backend = createIndexedDbBackend({ open: fakeOpen().open })
    await expect(backend.load()).resolves.toBeNull()
  })

  it('write-then-read round-trips the text and timestamp exactly', async () => {
    const backend = createIndexedDbBackend({ open: fakeOpen().open })
    const text = '{"id":"a","op":"primitive.cuboid","params":{"size":[1,1,1]}}\n{"warpcad":"project-state","version":1}\n'
    await backend.save({ text, savedAt: 1758283200000 })
    await expect(backend.load()).resolves.toEqual({ text, savedAt: 1758283200000 })
  })

  it('round-trips an empty document, which is a real state', async () => {
    const backend = createIndexedDbBackend({ open: fakeOpen().open })
    await backend.save({ text: '', savedAt: 5 })
    await expect(backend.load()).resolves.toEqual({ text: '', savedAt: 5 })
  })

  it('opens the database once and reuses the connection', async () => {
    const { open } = fakeOpen()
    const backend = createIndexedDbBackend({ open })
    await backend.save({ text: 'a', savedAt: 1 })
    await backend.save({ text: 'b', savedAt: 2 })
    await backend.load()
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('waits for the transaction to complete, not just the request — a quota error surfaces from save()', async () => {
    const backend = createIndexedDbBackend({ open: fakeOpen({ failOn: 'done' }).open })
    await expect(backend.save({ text: 'x', savedAt: 1 })).rejects.toMatchObject({
      name: 'QuotaExceededError',
    })
  })

  it('rejects when the database cannot be opened (private window, blocked store)', async () => {
    const backend = createIndexedDbBackend({ open: fakeOpen({ failOn: 'open' }).open })
    await expect(backend.load()).rejects.toThrow(/insecure/)
    await expect(backend.save({ text: 'x', savedAt: 1 })).rejects.toThrow(/insecure/)
  })

  it('retries the open on the next call after a failed one, instead of caching the failure', async () => {
    const good = fakeOpen()
    let calls = 0
    const backend = createIndexedDbBackend({
      open: (name, version, hooks) => {
        calls += 1
        if (calls === 1) return Promise.reject(new Error('transient'))
        return good.open(name, version, hooks)
      },
    })
    await expect(backend.load()).rejects.toThrow('transient')
    await expect(backend.load()).resolves.toBeNull()
  })

  it('refuses a stored value that is not the shape it wrote, rather than restoring garbage', async () => {
    const backend = createIndexedDbBackend({ open: fakeOpen({ value: { nope: true } }).open })
    await expect(backend.load()).rejects.toThrow(/not readable/i)
    const numeric = createIndexedDbBackend({ open: fakeOpen({ value: 42 }).open })
    await expect(numeric.load()).rejects.toThrow(/not readable/i)
  })

  it('keeps an unreadable copy under its own key, never over the autosave', async () => {
    const { open, data } = fakeOpen()
    const backend = createIndexedDbBackend({ open })
    await backend.keepUnreadable({ text: 'garbage', savedAt: 9 })
    expect(data.get(UNREADABLE_KEY)).toEqual({ text: 'garbage', savedAt: 9 })
    expect(data.has(AUTOSAVE_KEY)).toBe(false)
  })

  it('never throws synchronously when indexedDB does not exist at all', async () => {
    // Real `idb` under Node: no global indexedDB. The adapter must turn that into a rejection.
    const backend = createIndexedDbBackend()
    await expect(backend.load()).rejects.toBeTruthy()
  })
})
