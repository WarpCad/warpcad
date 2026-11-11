// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAutosaver } from './autosave.js'

/**
 * `TODO/io-001` — the autosave scheduler, against an in-memory backend.
 *
 * CLAUDE.md: "always mock at the boundary … a unit test must never need a real
 * GPU context or a real network" — and by the same rule never a real
 * IndexedDB. The backend below is the two-method interface the scheduler is
 * written against; `indexeddb.spec.js` covers the real adapter behind it, and
 * `e2e/local-persistence.e2e.js` covers it in real engines.
 */

/**
 * @param {object} [options]
 * @param {(record: any) => Promise<void>} [options.save]
 * @param {() => Promise<any>} [options.load]
 */
function memoryBackend(options = {}) {
  /** @type {any[]} */
  const writes = []
  /** @type {any} */
  let stored = null
  return {
    writes,
    get stored() {
      return stored
    },
    /** @param {any} value */
    set stored(value) {
      stored = value
    },
    load: options.load ?? (async () => stored),
    /** @param {any} record */
    async save(record) {
      if (options.save) await options.save(record)
      writes.push(record)
      stored = record
    },
    keepUnreadable: async () => {},
  }
}

/** @param {Partial<Parameters<typeof createAutosaver>[0]> & { backend: any }} options */
function autosaver(options) {
  /** @type {any[]} */
  const statuses = []
  let text = 'v1'
  const saver = createAutosaver({
    getText: () => text,
    onStatus: (status) => statuses.push(status),
    debounceMs: 500,
    maxWaitMs: 5000,
    timeoutMs: 8000,
    ...options,
  })
  return {
    saver,
    statuses,
    /** @param {string} next */
    setText(next) {
      text = next
    },
    last: () => statuses[statuses.length - 1],
  }
}

describe('createAutosaver', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes nothing on its own — only a change schedules a write', async () => {
    const backend = memoryBackend()
    autosaver({ backend })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(backend.writes).toEqual([])
  })

  it('debounces: a burst of changes becomes one write of the *latest* text', async () => {
    const backend = memoryBackend()
    const { saver, setText } = autosaver({ backend })

    setText('a')
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(300)
    setText('b')
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(300)
    setText('c')
    saver.notifyChange()
    expect(backend.writes).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(500)
    expect(backend.writes).toHaveLength(1)
    expect(backend.writes[0].text).toBe('c')
  })

  it('cannot be starved: a change every 400ms still writes within maxWait', async () => {
    const backend = memoryBackend()
    const { saver } = autosaver({ backend })
    for (let i = 0; i < 20; i += 1) {
      saver.notifyChange()
      await vi.advanceTimersByTimeAsync(400)
    }
    expect(backend.writes.length).toBeGreaterThanOrEqual(1)
  })

  it('reports Saving… when a change arrives and Saved with a time once the write lands', async () => {
    const backend = memoryBackend()
    const { saver, statuses } = autosaver({ backend })
    saver.notifyChange()
    expect(statuses.map((s) => s.state)).toEqual(['saving'])
    await vi.advanceTimersByTimeAsync(600)
    expect(statuses.map((s) => s.state)).toEqual(['saving', 'saved'])
    expect(statuses[1].at).toBe(Date.parse('2026-09-19T12:00:00Z') + 500)
  })

  it('flush() writes immediately — the visibilitychange/pagehide path', async () => {
    const backend = memoryBackend()
    const { saver, setText } = autosaver({ backend })
    setText('last edit')
    saver.notifyChange()
    await saver.flush()
    expect(backend.writes.map((w) => w.text)).toEqual(['last edit'])
    // ...and the debounce timer that was pending does not write it a second time.
    await vi.advanceTimersByTimeAsync(2000)
    expect(backend.writes).toHaveLength(1)
  })

  it('flush() with nothing pending is a no-op, not a redundant write', async () => {
    const backend = memoryBackend()
    const { saver } = autosaver({ backend })
    await saver.flush()
    expect(backend.writes).toHaveLength(0)
  })

  it('never overlaps two writes, and a change made mid-write is written afterwards', async () => {
    /** @type {(() => void)[]} */
    const releases = []
    let concurrent = 0
    let peak = 0
    const backend = memoryBackend({
      save: () => {
        concurrent += 1
        peak = Math.max(peak, concurrent)
        return new Promise((resolve) => {
          releases.push(() => {
            concurrent -= 1
            resolve(undefined)
          })
        })
      },
    })
    const { saver, setText, last } = autosaver({ backend })

    setText('first')
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(500) // first write starts, hangs
    setText('second')
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(500) // second is due, must queue behind the first
    expect(releases).toHaveLength(1)

    releases[0]()
    await vi.advanceTimersByTimeAsync(0)
    expect(releases).toHaveLength(2)
    releases[1]()
    await vi.advanceTimersByTimeAsync(0)

    expect(peak).toBe(1)
    expect(backend.writes.map((w) => w.text)).toEqual(['first', 'second'])
    expect(backend.stored.text).toBe('second')
    expect(last().state).toBe('saved')
  })

  it('a throwing store degrades to a persistent error, and the next change retries', async () => {
    let failing = true
    const backend = memoryBackend({
      save: async () => {
        if (failing) throw new Error('storage blocked')
      },
    })
    const { saver, last } = autosaver({ backend })

    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(600)
    expect(last().state).toBe('error')
    expect(last().message).toMatch(/not saved/i)
    expect(backend.writes).toHaveLength(0)

    // It does not throw into the app, and it does not give up: fix the store, edit again.
    failing = false
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(600)
    expect(last().state).toBe('saved')
    expect(backend.writes).toHaveLength(1)
  })

  it('says the store is full when the failure is a QuotaExceededError', async () => {
    const backend = memoryBackend({
      save: async () => {
        throw new DOMException('full', 'QuotaExceededError')
      },
    })
    const { saver, last } = autosaver({ backend })
    saver.notifyChange()
    await saver.flush()
    expect(last().state).toBe('error')
    expect(last().message).toMatch(/full/i)
  })

  it('a hung store times out into the same error rather than sitting on Saving… forever', async () => {
    const backend = memoryBackend({ save: () => new Promise(() => {}) })
    const { saver, last } = autosaver({ backend })
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(500 + 8000 + 10)
    expect(last().state).toBe('error')
  })

  it('a serialisation failure is also reported, not thrown', async () => {
    const backend = memoryBackend()
    const { saver, last } = autosaver({
      backend,
      getText: () => {
        throw new Error('boom')
      },
    })
    saver.notifyChange()
    await expect(saver.flush()).resolves.toBeUndefined()
    expect(last().state).toBe('error')
  })

  it('dispose() cancels a pending write', async () => {
    const backend = memoryBackend()
    const { saver } = autosaver({ backend })
    saver.notifyChange()
    saver.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(backend.writes).toHaveLength(0)
  })
})

describe('createAutosaver.restore', () => {
  it('returns the stored text and when it was saved', async () => {
    const backend = memoryBackend()
    backend.stored = { text: '{"op":"x"}\n', savedAt: 1234 }
    const { saver } = autosaver({ backend })
    await expect(saver.restore()).resolves.toEqual({
      kind: 'found',
      text: '{"op":"x"}\n',
      savedAt: 1234,
    })
  })

  it('says "empty" for a first visit, which is not an error', async () => {
    const { saver } = autosaver({ backend: memoryBackend() })
    await expect(saver.restore()).resolves.toEqual({ kind: 'empty' })
  })

  it('degrades a throwing read to a failed result — startup must never crash', async () => {
    const backend = memoryBackend({
      load: async () => {
        throw new Error('SecurityError: The operation is insecure.')
      },
    })
    const { saver } = autosaver({ backend })
    const result = await saver.restore()
    expect(result.kind).toBe('failed')
    expect(/** @type {any} */ (result).message).toMatch(/not saved/i)
  })

  it('a synchronous throw from the backend is also contained', async () => {
    const backend = memoryBackend()
    backend.load = () => {
      throw new Error('indexedDB is not defined')
    }
    const { saver } = autosaver({ backend })
    expect((await saver.restore()).kind).toBe('failed')
  })

  it('times out a hung read instead of blocking startup', async () => {
    vi.useFakeTimers()
    try {
      const backend = memoryBackend({ load: () => new Promise(() => {}) })
      const { saver } = autosaver({ backend, timeoutMs: 3000 })
      const pending = saver.restore()
      await vi.advanceTimersByTimeAsync(3001)
      expect((await pending).kind).toBe('failed')
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * The synchronous safety copy for a page that dies mid-write.
 *
 * Found by driving real Chromium: placing a solid and reloading inside the debounce
 * window lost it, because an IndexedDB write *started* in `pagehide` is not
 * committed before the renderer is torn down (`put` issued, transaction never
 * completes, no abort either). `localStorage.setItem` is synchronous and is
 * durable by the time the handler returns, so it is the one thing a dying page can
 * still do. See `src/storage/localMirror.js`.
 */
describe('createAutosaver — the synchronous mirror', () => {
  /** @param {{ record?: any, throwOnWrite?: boolean }} [options] */
  function fakeMirror(options = {}) {
    const mirror = {
      record: options.record ?? null,
      cleared: 0,
      write(/** @type {any} */ record) {
        if (options.throwOnWrite) throw new Error('quota')
        mirror.record = record
      },
      read: () => mirror.record,
      clear() {
        mirror.cleared += 1
        mirror.record = null
      },
    }
    return mirror
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushSync() copies the pending text to the mirror synchronously, and still starts the IndexedDB write', async () => {
    const backend = memoryBackend()
    const mirror = fakeMirror()
    const { saver, setText } = autosaver({ backend, mirror })
    setText('typed just now')
    saver.notifyChange()

    saver.flushSync()
    expect(mirror.record).toEqual({ text: 'typed just now', savedAt: Date.now() }) // no await
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.writes.map((w) => w.text)).toEqual(['typed just now'])
  })

  it('flushSync() with nothing pending writes nothing — visibilitychange fires on every tab switch', () => {
    const mirror = fakeMirror()
    const { saver } = autosaver({ backend: memoryBackend(), mirror })
    saver.flushSync()
    expect(mirror.record).toBeNull()
  })

  it('clears the mirror once IndexedDB has the same text', async () => {
    const backend = memoryBackend()
    const mirror = fakeMirror()
    const { saver } = autosaver({ backend, mirror })
    saver.notifyChange()
    saver.flushSync()
    await vi.advanceTimersByTimeAsync(0)
    expect(mirror.record).toBeNull()
  })

  it('keeps the mirror when a newer change landed while the older write was in flight', async () => {
    /** @type {(() => void) | undefined} */
    let release
    const backend = memoryBackend({ save: () => new Promise((resolve) => (release = () => resolve(undefined))) })
    const mirror = fakeMirror()
    const { saver, setText } = autosaver({ backend, mirror })
    setText('one')
    saver.notifyChange()
    saver.flushSync()
    await vi.advanceTimersByTimeAsync(0) // write of "one" in flight
    setText('two')
    saver.notifyChange()
    saver.flushSync() // mirror now holds "two"
    release?.() // the older write completes
    await vi.advanceTimersByTimeAsync(0)
    expect(mirror.record?.text).toBe('two')
  })

  it('a full or blocked localStorage does not break anything', async () => {
    const backend = memoryBackend()
    const { saver } = autosaver({ backend, mirror: fakeMirror({ throwOnWrite: true }) })
    saver.notifyChange()
    expect(() => saver.flushSync()).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(backend.writes).toHaveLength(1)
  })

  it('restore() prefers a mirror that is newer than the stored copy, and says where it came from', async () => {
    const backend = memoryBackend()
    backend.stored = { text: 'older', savedAt: 100 }
    const mirror = fakeMirror({ record: { text: 'newer', savedAt: 200 } })
    const { saver } = autosaver({ backend, mirror })
    await expect(saver.restore()).resolves.toEqual({
      kind: 'found',
      text: 'newer',
      savedAt: 200,
      fromMirror: true,
    })
  })

  it('restore() uses a mirror alone when IndexedDB has nothing (the first-ever session was cut short)', async () => {
    const mirror = fakeMirror({ record: { text: 'only copy', savedAt: 5 } })
    const { saver } = autosaver({ backend: memoryBackend(), mirror })
    expect(await saver.restore()).toMatchObject({ kind: 'found', text: 'only copy', fromMirror: true })
  })

  it('restore() recovers from the mirror even when IndexedDB is unreadable', async () => {
    const backend = memoryBackend({
      load: async () => {
        throw new Error('blocked')
      },
    })
    const mirror = fakeMirror({ record: { text: 'saved by pagehide', savedAt: 5 } })
    const { saver } = autosaver({ backend, mirror })
    expect(await saver.restore()).toMatchObject({ kind: 'found', text: 'saved by pagehide', fromMirror: true })
  })

  it('restore() discards a mirror that is older than the stored copy', async () => {
    const backend = memoryBackend()
    backend.stored = { text: 'newer', savedAt: 300 }
    const mirror = fakeMirror({ record: { text: 'stale', savedAt: 100 } })
    const { saver } = autosaver({ backend, mirror })
    const result = await saver.restore()
    expect(result).toEqual({ kind: 'found', text: 'newer', savedAt: 300 })
    expect(mirror.record).toBeNull()
  })

  it('a malformed mirror entry is ignored, not trusted', async () => {
    const mirror = fakeMirror({ record: /** @type {any} */ ({ text: 42 }) })
    const { saver } = autosaver({ backend: memoryBackend(), mirror })
    expect(await saver.restore()).toEqual({ kind: 'empty' })
  })
})

/**
 * `TODO/io-016`: while the Shared view shows someone else's project, autosave is **suspended** —
 * opening a link must never write to IndexedDB, so a person with a saved session loses nothing by
 * looking. The flag is the whole change to the scheduler: no write, no mirror copy, no status.
 */
describe('createAutosaver — suspended (the Shared view)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** A mirror that records every write and clear. */
  function countingMirror() {
    const mirror = {
      /** @type {any} */
      record: null,
      writes: 0,
      cleared: 0,
      /** @param {any} record */
      write(record) {
        mirror.writes += 1
        mirror.record = record
      },
      read: () => mirror.record,
      clear() {
        mirror.cleared += 1
        mirror.record = null
      },
    }
    return mirror
  }

  it('starts unsuspended', () => {
    const { saver } = autosaver({ backend: memoryBackend() })
    expect(saver.suspended()).toBe(false)
  })

  it('ignores changes, flush() and flushSync() while suspended: nothing reaches the store or the mirror', async () => {
    const backend = memoryBackend()
    const mirror = countingMirror()
    const { saver, statuses } = autosaver({ backend, mirror })
    saver.setSuspended(true)
    saver.notifyChange()
    saver.notifyChange()
    saver.flushSync()
    await saver.flush()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(backend.writes).toEqual([])
    expect(mirror.writes).toBe(0)
    expect(statuses).toEqual([])
  })

  it('holds a write that was already scheduled when it is suspended, and sends it on resume', async () => {
    const backend = memoryBackend()
    const { saver, setText } = autosaver({ backend })
    setText('my last edit')
    saver.notifyChange()
    saver.setSuspended(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(backend.writes).toEqual([])
    saver.setSuspended(false)
    await vi.advanceTimersByTimeAsync(600)
    expect(backend.writes.map((record) => record.text)).toEqual(['my last edit'])
  })

  it('resuming writes nothing by itself; the next change writes the then-current text', async () => {
    const backend = memoryBackend()
    const { saver, setText } = autosaver({ backend })
    saver.setSuspended(true)
    saver.notifyChange()
    saver.setSuspended(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(backend.writes).toEqual([])
    setText('the copy')
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(600)
    expect(backend.writes.map((record) => record.text)).toEqual(['the copy'])
  })

  it('still restores while suspended (a read), and leaves a stale mirror alone instead of clearing it', async () => {
    const backend = memoryBackend()
    backend.stored = { text: 'saved session', savedAt: 2000 }
    const mirror = countingMirror()
    mirror.record = { text: 'older', savedAt: 1000 }
    const { saver } = autosaver({ backend, mirror })
    saver.setSuspended(true)
    expect(await saver.restore()).toEqual({ kind: 'found', text: 'saved session', savedAt: 2000 })
    expect(mirror.cleared).toBe(0)
  })
})

/**
 * `TODO/io-015` — the app-data copy (`Application Support/autosave.ndjson`) in the iOS app.
 * The native boundary is the two-method `nativeMirror` interface, mocked here; the real one is
 * `nativeMirror.spec.js`'s.
 */
describe('createAutosaver — the native mirror (TODO/io-015)', () => {
  /** A project text whose newest Lamport counter is `counter`. */
  const project = (/** @type {number} */ counter, tag = '') => `{"k":"state","tag":"${tag}"}\n{"id":"box-abcdef-${counter}"}\n`

  /**
   * @param {object} [options]
   * @param {string | null} [options.stored]
   * @param {(record: any) => Promise<void>} [options.write]
   * @param {() => Promise<string | null>} [options.read]
   */
  function nativeMirror(options = {}) {
    /** @type {any[]} */
    const writes = []
    /** @type {string | null} */
    let held = options.stored ?? null
    return {
      writes,
      write: vi.fn(async (/** @type {any} */ record) => {
        if (options.write) await options.write(record)
        writes.push(record)
        held = record.text
      }),
      read: vi.fn(options.read ?? (async () => held)),
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the same text to the mirror after the debounce — not before', async () => {
    const backend = memoryBackend()
    const native = nativeMirror()
    const { saver, setText } = autosaver({ backend, nativeMirror: native })
    setText(project(3))
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(499)
    expect(native.write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(backend.writes.map((r) => r.text)).toEqual([project(3)])
    expect(native.writes.map((r) => r.text)).toEqual([project(3)])
  })

  it('still writes the mirror when the IndexedDB write fails, and the chip still says Not saved', async () => {
    const backend = memoryBackend({ save: async () => { throw new Error('blocked') } })
    const native = nativeMirror()
    const { saver, last } = autosaver({ backend, nativeMirror: native })
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(600)
    expect(native.write).toHaveBeenCalledTimes(1)
    expect(last().state).toBe('error')
  })

  it('a mirror failure is reported to the log, and does not turn Saved into Not saved', async () => {
    const backend = memoryBackend()
    const problems = vi.fn()
    const native = nativeMirror({ write: async () => { throw new Error('disk full') } })
    const { saver, last } = autosaver({ backend, nativeMirror: native, onNativeProblem: problems })
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(600)
    expect(last().state).toBe('saved')
    expect(problems).toHaveBeenCalledTimes(1)
    expect(String(problems.mock.calls[0][0])).toContain('disk full')
  })

  it('a mirror that never answers does not delay or block Saved, nor the next write', async () => {
    const backend = memoryBackend()
    const native = nativeMirror({ write: () => new Promise(() => {}) })
    const { saver, last, setText } = autosaver({ backend, nativeMirror: native })
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(600)
    expect(last().state).toBe('saved')
    setText('next')
    saver.notifyChange()
    await vi.advanceTimersByTimeAsync(600)
    expect(backend.writes.map((r) => r.text)).toEqual(['v1', 'next'])
  })

  it('a page being hidden starts the mirror write at once, beside the synchronous mirror', async () => {
    const backend = memoryBackend()
    const native = nativeMirror()
    const { saver, setText } = autosaver({ backend, nativeMirror: native })
    setText(project(4))
    saver.notifyChange()
    saver.flushSync()
    expect(native.write).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(600)
    expect(native.write).toHaveBeenCalledTimes(1)
  })

  describe('restore', () => {
    /** @param {{ idb?: string | null, native?: string | null, valid?: (text: string) => boolean, nativeRead?: () => Promise<string | null> }} given */
    function setup({ idb = null, native = null, valid, nativeRead }) {
      const backend = memoryBackend()
      if (idb !== null) backend.stored = { text: idb, savedAt: 1000 }
      const problems = vi.fn()
      const mirror = nativeMirror({ stored: native, read: nativeRead })
      const made = autosaver({ backend, nativeMirror: mirror, validateNative: valid, onNativeProblem: problems })
      return { ...made, problems, mirror }
    }

    it('IndexedDB only: restores it, not marked as native', async () => {
      const { saver } = setup({ idb: project(2) })
      expect(await saver.restore()).toEqual({ kind: 'found', text: project(2), savedAt: 1000 })
    })

    it('native only: native wins because IndexedDB has no autosave, and says where it came from', async () => {
      const { saver } = setup({ native: project(2) })
      const result = await saver.restore()
      expect(result).toMatchObject({ kind: 'found', text: project(2), fromNative: true })
    })

    it('native only, and IndexedDB cannot be opened at all: native still restores', async () => {
      const backend = memoryBackend({ load: async () => { throw new Error('connection lost') } })
      const { saver } = autosaver({ backend, nativeMirror: nativeMirror({ stored: project(2) }) })
      expect(await saver.restore()).toMatchObject({ kind: 'found', text: project(2), fromNative: true })
    })

    it('both equal: IndexedDB is used, with no restore announcement', async () => {
      const { saver } = setup({ idb: project(2), native: project(2) })
      const result = await saver.restore()
      expect(result).toEqual({ kind: 'found', text: project(2), savedAt: 1000 })
      expect(result).not.toHaveProperty('fromNative')
    })

    it('both differ: the later Lamport stamp wins — native newer', async () => {
      const { saver } = setup({ idb: project(2, 'idb'), native: project(9, 'native') })
      expect(await saver.restore()).toMatchObject({ kind: 'found', text: project(9, 'native'), fromNative: true })
    })

    it('both differ: the later Lamport stamp wins — IndexedDB newer', async () => {
      const { saver } = setup({ idb: project(9, 'idb'), native: project(2, 'native') })
      expect(await saver.restore()).toEqual({ kind: 'found', text: project(9, 'idb'), savedAt: 1000 })
    })

    it('both differ with the same stamp: IndexedDB stays (never a merge)', async () => {
      const { saver } = setup({ idb: project(5, 'idb'), native: project(5, 'native') })
      expect(await saver.restore()).toEqual({ kind: 'found', text: project(5, 'idb'), savedAt: 1000 })
    })

    it('reads stamps from the state line too, as [counter, replica] pairs', async () => {
      const older = `{"k":"state","merge":{"project":[4,"abcdef"]}}\n`
      const newer = `{"k":"state","merge":{"project":[11,"abcdef"]}}\n`
      const { saver } = setup({ idb: older, native: newer })
      expect(await saver.restore()).toMatchObject({ text: newer, fromNative: true })
    })

    it('native corrupt: ignored with a message, IndexedDB restored', async () => {
      const { saver, problems } = setup({ idb: project(2), native: '{ torn', valid: () => false })
      expect(await saver.restore()).toEqual({ kind: 'found', text: project(2), savedAt: 1000 })
      expect(problems).toHaveBeenCalledTimes(1)
      expect(String(problems.mock.calls[0][0])).toMatch(/backup copy/i)
    })

    it('native corrupt and IndexedDB empty: starts empty, with the message', async () => {
      const { saver, problems } = setup({ native: '{ torn', valid: () => false })
      expect(await saver.restore()).toEqual({ kind: 'empty' })
      expect(problems).toHaveBeenCalledTimes(1)
    })

    it('a native read that throws is the same as no native copy', async () => {
      const { saver, problems } = setup({ idb: project(2), nativeRead: async () => { throw new Error('nope') } })
      expect(await saver.restore()).toEqual({ kind: 'found', text: project(2), savedAt: 1000 })
      expect(problems).toHaveBeenCalledTimes(1)
    })

    it('without a native mirror, restore is exactly what it was', async () => {
      const backend = memoryBackend()
      const { saver } = autosaver({ backend })
      expect(await saver.restore()).toEqual({ kind: 'empty' })
    })
  })
})
