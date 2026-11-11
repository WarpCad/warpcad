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

import { counterOfId, isReplicaId } from '../core/replica.js'

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
 * `TODO/io-015`: the iOS app's second copy, in *Application Support* (`./nativeMirror.js`).
 *
 * @typedef {object} NativeMirror
 * @property {(record: StoredProject) => Promise<void>} write
 * @property {() => Promise<string | null>} read The copy's text, `null` when there is none.
 */

/**
 * @typedef {{ state: 'saving' } | { state: 'saved', at: number } | { state: 'error', message: string, detail: string }} AutosaveStatus
 */

/**
 * @typedef {{ kind: 'empty' } | { kind: 'found', text: string, savedAt: number, fromMirror?: true, fromNative?: true } | { kind: 'failed', message: string, detail: string }} RestoreResult
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

/** What the log says of a backup copy that cannot be used (`TODO/io-015`). */
export const NATIVE_COPY_UNUSABLE_MESSAGE = "The app's backup copy of your last session could not be read, so it was ignored"

/**
 * The newest Lamport counter a project text carries: the largest counter of any replica-scoped
 * record id (`box-abcdef-7`), and of any stamp in the state line (a `[counter, replica]` pair or a
 * `{ counter, replica }` object). `0` for a text with none (a legacy file, or not a project).
 * Reading only, and it never throws: this decides a recovery, not a merge.
 *
 * @param {string} text
 * @returns {number}
 */
export function lamportOfText(text) {
  let newest = 0
  /** @param {unknown} value */
  function visit(value) {
    if (typeof value === 'string') {
      newest = Math.max(newest, counterOfId(value))
    } else if (Array.isArray(value)) {
      if (value.length === 2 && Number.isSafeInteger(value[0]) && value[0] >= 0 && isReplicaId(value[1])) newest = Math.max(newest, value[0])
      for (const item of value) visit(item)
    } else if (value !== null && typeof value === 'object') {
      const { counter, replica } = /** @type {Record<string, unknown>} */ (value)
      if (Number.isSafeInteger(counter) && /** @type {number} */ (counter) >= 0 && isReplicaId(replica)) newest = Math.max(newest, /** @type {number} */ (counter))
      for (const item of Object.values(value)) visit(item)
    }
  }
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      visit(JSON.parse(line))
    } catch {
      /* a torn line carries no stamp */
    }
  }
  return newest
}

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
 * @param {NativeMirror} [options.nativeMirror] `TODO/io-015`: the iOS app's copy in *Application
 *   Support*, written after each IndexedDB write (whether it succeeds or fails) and read at restore.
 *   A failure of it is logged through `onNativeProblem`, never shown as "Not saved", and never
 *   awaited by the IndexedDB path.
 * @param {(text: string) => boolean} [options.validateNative] Whether a copy read from `nativeMirror`
 *   is a usable project; a copy that is not is ignored. Defaults to "any text".
 * @param {(message: string) => void} [options.onNativeProblem] Where a mirror problem goes; defaults to `console.warn`.
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
  nativeMirror,
  validateNative = () => true,
  onNativeProblem = (message) => console.warn(message),
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

  /** The change count the app copy last started a write for. */
  let nativeStartedCount = 0

  /**
   * Start the app-copy write for `text` (the document as of `target` changes) without awaiting it.
   * Writes to it never overlap (its own chain), and one that fails or hangs is only logged.
   *
   * @param {string} text
   * @param {number} target
   */
  function mirrorToNative(text, target) {
    if (!nativeMirror || nativeStartedCount >= target) return
    nativeStartedCount = target
    const record = { text, savedAt: now() }
    const start = async () => withTimeout(Promise.resolve(nativeMirror.write(record)))
    // Straight away when idle (a dying page may not get another tick), else after the one in flight.
    const attempt = nativeInFlight === 0 ? start() : nativeChain.then(start)
    nativeInFlight += 1
    nativeChain = attempt
      .catch((error) => {
        // Retry on the next change: this one did not land.
        if (nativeStartedCount === target) nativeStartedCount = target - 1
        onNativeProblem(`The app's backup copy was not written: ${error instanceof Error ? error.message : String(error)}`)
      })
      .finally(() => {
        nativeInFlight -= 1
      })
  }

  let nativeInFlight = 0
  /** @type {Promise<void>} */
  let nativeChain = Promise.resolve()

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
    /** @type {string | null} */
    let text = null
    try {
      const savedAt = now()
      text = getText()
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
    // After the IndexedDB write, whichever way it went: the app copy is the one that survives
    // when that store is reclaimed. Not awaited, so it can never slow or fail the path above.
    if (text !== null) mirrorToNative(text, target)
  }

  /** @type {Autosaver} */
  const autosaver = {
    async restore() {
      /** @returns {Promise<StoredProject | null>} The usable app copy, or `null` (with a log line when there is a copy that cannot be used). */
      async function readNative() {
        if (!nativeMirror) return null
        try {
          const text = await withTimeout(Promise.resolve(nativeMirror.read()))
          if (text === null || text === undefined) return null
          if (typeof text !== 'string' || !validateNative(text)) {
            onNativeProblem(NATIVE_COPY_UNUSABLE_MESSAGE)
            return null
          }
          return { text, savedAt: now() }
        } catch (error) {
          onNativeProblem(`${NATIVE_COPY_UNUSABLE_MESSAGE} (${error instanceof Error ? error.message : String(error)})`)
          return null
        }
      }

      const candidate = mirror?.read() ?? null
      // Validated here as well as in the real mirror: a duck-typed backend is a boundary too.
      const pending =
        candidate !== null && typeof candidate.text === 'string' && Number.isFinite(candidate.savedAt)
          ? candidate
          : null
      const native = await readNative()
      /** @type {StoredProject | null} */
      let stored = null
      try {
        stored = (await withTimeout(Promise.resolve().then(() => backend.load()))) ?? null
      } catch (error) {
        // IndexedDB unreadable — but a mirror copy is still a real, recoverable session.
        if (pending !== null) return { kind: 'found', ...pending, fromMirror: true }
        if (native !== null) return { kind: 'found', ...native, fromNative: true }
        return { kind: 'failed', ...describeFailure(error) }
      }
      // `TODO/io-015`: the app copy wins only when IndexedDB has no autosave, or when it carries a
      // later Lamport stamp (a crash between the two writes). Never a merge: recovery, not sync.
      if (native !== null && pending === null && (stored === null || (native.text !== stored.text && lamportOfText(native.text) > lamportOfText(stored.text)))) {
        return { kind: 'found', ...native, fromNative: true }
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
      if (savedCount !== changeCount && (mirror || nativeMirror)) {
        try {
          const text = getText()
          mirror?.write({ text, savedAt: now() })
          // The page may be suspended before IndexedDB answers: start the app copy now.
          mirrorToNative(text, changeCount)
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
