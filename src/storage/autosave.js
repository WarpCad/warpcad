// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The autosave scheduler (`TODO/io-001`): when to write, never how.
 *
 * Framework-free and transport-free — it is handed a `backend` with `load` and
 * `save` and a `getText` that serialises the document, and it owns only the
 * timing and failure policy. That split is what lets `autosave.spec.js` run the
 * whole policy against an in-memory backend with fake timers, and what keeps
 * `indexeddb.js` (the real adapter) a thin, separately testable shim.
 *
 * ## The policy (`docs/decisions/interaction-model-qa.md` §8)
 *
 * - **Every mutation schedules a trailing debounced write** (500 ms) of the
 *   *whole* NDJSON log. Whole-log rather than an append delta: the log is small
 *   text, the file Save writes the same bytes, and a delta protocol would need
 *   its own recovery story for a torn write.
 * - **A max-wait cap (5 s)**, so an unbroken stream of edits cannot postpone the
 *   first write forever. A pure debounce would.
 * - **`flush()` is immediate**, wired by the store to `visibilitychange → hidden`
 *   and `pagehide`: mobile Safari kills a backgrounded tab with no warning, and
 *   a debounce alone would lose the last edit. Best effort — a page being torn
 *   down cannot be *awaited* — but an IndexedDB transaction started in those
 *   handlers is generally committed by the browser, which is the strongest
 *   guarantee the platform offers.
 * - **Writes never overlap** (a promise chain). Two in-flight `put`s to one key
 *   have no defined winner, and "the older text landed last" is a silent
 *   data-loss bug.
 * - **Failure is state, not an exception.** A throwing, blocked, full or hung
 *   store becomes an `error` status the chip shows persistently; the app keeps
 *   working, and the next change simply tries again. Nothing here ever rejects
 *   into the caller — startup and the edit path must not be able to crash on a
 *   storage problem (`src/stores/settings.js`'s rule, at IndexedDB scale).
 *
 * **Multi-tab: last writer wins.** Two tabs on one origin share one key and
 * whichever writes last silently wins. `data-002` flagged that as an open,
 * undecided item (it drafted a revision counter and a `BroadcastChannel` ping);
 * that is deliberately *not* built here — no locking is invented, and the
 * single-writer assumption is the one `docs/decisions/document-sync.md` already
 * records.
 *
 * @module storage/autosave
 */

/**
 * @typedef {object} StoredProject
 * @property {string} text The whole project, as `src/core/project.js` serialises it.
 * @property {number} savedAt Epoch milliseconds.
 */

/**
 * @typedef {object} AutosaveBackend
 * @property {() => Promise<StoredProject | null>} load `null` when nothing was ever saved.
 * @property {(record: StoredProject) => Promise<void>} save
 * @property {(record: StoredProject) => Promise<void>} keepUnreadable Preserve a copy
 *   the app refused to load, so the first edit's autosave cannot destroy it.
 */

/**
 * @typedef {{ state: 'saving' } | { state: 'saved', at: number } | { state: 'error', message: string, detail: string }} AutosaveStatus
 */

/**
 * @typedef {{ kind: 'empty' } | { kind: 'found', text: string, savedAt: number, fromMirror?: true } | { kind: 'failed', message: string, detail: string }} RestoreResult
 */

/**
 * @typedef {object} Autosaver
 * @property {() => Promise<RestoreResult>} restore Read the last autosave. Never rejects.
 * @property {() => void} notifyChange A mutation happened: schedule a write.
 * @property {() => Promise<void>} flush Write now if anything is pending. Never rejects.
 * @property {() => void} flushSync What a *dying page* calls: copy anything unsaved to the
 *   synchronous mirror, then start the IndexedDB write as `flush()` does. The mirror
 *   is what survives if the page is gone before that write commits.
 * @property {() => void} clearMirror Drop the safety copy (a refused restore).
 * @property {() => void} dispose Cancel any pending write.
 * @property {(suspended: boolean) => void} setSuspended `TODO/io-016`: while `true`, changes are
 *   ignored and `flush`/`flushSync` write nothing (store or mirror) — the Shared view showing
 *   someone else's project must never write. A write scheduled before suspending is held and
 *   goes out on resume; otherwise resuming writes nothing by itself.
 * @property {() => boolean} suspended Whether writing is suspended.
 */

/** What the chip says, and what `docs/save-load.md` quotes. */
export const STORAGE_UNAVAILABLE_MESSAGE = 'Not saved — browser storage unavailable'
export const STORAGE_FULL_MESSAGE = 'Not saved — browser storage is full'

/**
 * @param {unknown} error
 * @returns {{ message: string, detail: string }}
 */
function describeFailure(error) {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const full = error instanceof Error && error.name === 'QuotaExceededError'
  return { message: full ? STORAGE_FULL_MESSAGE : STORAGE_UNAVAILABLE_MESSAGE, detail }
}

/**
 * @param {object} options
 * @param {AutosaveBackend} options.backend
 * @param {() => string} options.getText Serialise the document *now* — called at
 *   write time, so a burst of edits writes the latest state, not the first.
 * @param {(status: AutosaveStatus) => void} options.onStatus
 * @param {number} [options.debounceMs]
 * @param {number} [options.maxWaitMs]
 * @param {number} [options.timeoutMs] A store that never answers (some private
 *   windows hang rather than throw) becomes an error instead of an eternal "Saving…".
 * @param {() => number} [options.now]
 * @param {import('./localMirror.js').SyncMirror} [options.mirror] A synchronous
 *   safety copy — see `localMirror.js` for why an unload-time IndexedDB write is not enough.
 * @returns {Autosaver}
 */
export function createAutosaver({
  backend,
  getText,
  onStatus,
  debounceMs = 500,
  maxWaitMs = 5000,
  timeoutMs = 8000,
  now = () => Date.now(),
  mirror,
}) {
  let changeCount = 0
  let savedCount = 0
  let firstChangeAt = 0
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null
  /** @type {Promise<void>} */
  let chain = Promise.resolve()
  /** `TODO/io-016`: the Shared view is showing; nothing may be written. */
  let suspended = false

  /**
   * @template T
   * @param {Promise<T>} promise
   * @returns {Promise<T>}
   */
  function withTimeout(promise, ms = timeoutMs) {
    return new Promise((resolve, reject) => {
      const handle = setTimeout(() => reject(new Error(`storage did not answer within ${ms} ms`)), ms)
      promise.then(
        (value) => {
          clearTimeout(handle)
          resolve(value)
        },
        (error) => {
          clearTimeout(handle)
          reject(error)
        },
      )
    })
  }

  function cancelTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function schedule() {
    cancelTimer()
    const waited = now() - firstChangeAt
    const delay = Math.max(0, Math.min(debounceMs, maxWaitMs - waited))
    timer = setTimeout(() => {
      timer = null
      void autosaver.flush()
    }, delay)
  }

  async function writeOnce() {
    if (savedCount === changeCount) return
    const target = changeCount
    try {
      const savedAt = now()
      const text = getText()
      await withTimeout(Promise.resolve(backend.save({ text, savedAt })))
      savedCount = target
      // A change that arrived while this write was in flight has its own timer
      // and will report for itself; announcing "Saved" now would be a claim
      // about text the store does not have yet.
      if (changeCount === target) {
        firstChangeAt = 0
        // IndexedDB has everything; the lifeboat's job is done. Only when nothing
        // newer is pending: a mirror written for a later change must outlive an
        // older write finishing.
        mirror?.clear()
        onStatus({ state: 'saved', at: savedAt })
      }
    } catch (error) {
      // `savedCount` stays behind `changeCount`, so the next change (or flush)
      // retries. The error is a persistent status until a write succeeds.
      onStatus({ state: 'error', ...describeFailure(error) })
    }
  }

  /** @type {Autosaver} */
  const autosaver = {
    async restore() {
      const candidate = mirror?.read() ?? null
      // Validated here as well as in the real mirror: a duck-typed backend is a boundary too.
      const pending =
        candidate !== null && typeof candidate.text === 'string' && Number.isFinite(candidate.savedAt)
          ? candidate
          : null
      /** @type {StoredProject | null} */
      let stored = null
      try {
        stored = (await withTimeout(Promise.resolve().then(() => backend.load()))) ?? null
      } catch (error) {
        // IndexedDB unreadable — but a mirror copy is still a real, recoverable session.
        if (pending !== null) return { kind: 'found', ...pending, fromMirror: true }
        return { kind: 'failed', ...describeFailure(error) }
      }
      if (pending !== null && (stored === null || pending.savedAt > stored.savedAt)) {
        return { kind: 'found', text: pending.text, savedAt: pending.savedAt, fromMirror: true }
      }
      // A mirror no newer than what IndexedDB holds is stale: drop it so it can
      // never win a later comparison against a fresher autosave. Not while suspended
      // (`TODO/io-016`): opening a share link writes nothing at all.
      if (pending !== null && !suspended) mirror?.clear()
      if (stored === null) return { kind: 'empty' }
      return { kind: 'found', text: stored.text, savedAt: stored.savedAt }
    },

    notifyChange() {
      if (suspended) return
      changeCount += 1
      if (firstChangeAt === 0) firstChangeAt = now()
      onStatus({ state: 'saving' })
      schedule()
    },

    flush() {
      cancelTimer()
      if (suspended) return chain
      chain = chain.then(writeOnce)
      return chain
    },

    flushSync() {
      if (suspended) return
      if (savedCount !== changeCount && mirror) {
        try {
          mirror.write({ text: getText(), savedAt: now() })
        } catch {
          /* serialisation failed; the async flush below reports it */
        }
      }
      void autosaver.flush()
    },

    clearMirror() {
      mirror?.clear()
    },

    dispose() {
      cancelTimer()
    },

    setSuspended(next) {
      if (next === suspended) return
      suspended = next
      if (next) {
        // A write already scheduled is held, not dropped: it is the user's own edit from before
        // the Shared view opened (a link pasted into an open tab), and it goes out on resume.
        cancelTimer()
        return
      }
      if (savedCount !== changeCount) schedule()
    },

    suspended() {
      return suspended
    },
  }
  return autosaver
}
