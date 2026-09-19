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
