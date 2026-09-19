/**
 * The auto-push scheduler (`TODO/io-002`): **when** to commit to the repository,
 * never how. The sibling of `autosave.js` one layer out — same shape (a policy
 * object with an injected clock, testable with fake timers against an in-memory
 * push), different numbers and a much more careful failure policy, because every
 * write here is a git commit and a network round-trip.
 *
 * The policy is not this file's invention: `docs/decisions/interaction-model-qa.md`
 * §11 (`data-002`, confirmed by the user) decided it rule by rule.
 *
 * - **Off for every new connection.** Auto-push is opt-in; a commit per edit is
 *   not something to start doing on a user's behalf.
 * - **Turning it on pushes once, immediately** — "it is never on silently".
 * - **A trailing 30-second debounce**, so one burst of work (a gizmo-drag session,
 *   several field edits, a drop and a boolean) becomes **one** commit, plus a
 *   **5-minute maximum wait** so unbroken editing still reaches the repository.
 * - **Undo, redo, timeline edits and rollback are mutations** and schedule a push;
 *   preview is not a mutation and never does. That distinction is the caller's
 *   (`stores/hosted.js` subscribes to committed document versions only).
 * - **A conflict pauses, it never overwrites.** The dialog is raised **once**; more
 *   edits while paused attempt nothing and raise nothing. Cancel leaves it
 *   **paused, not off**.
 * - **A network failure is not a conflict**: no dialog, retry at 10 s, 30 s, 2 min,
 *   then every 5 min.
 * - **A rejected token is not retried.** Waiting does not fix it, and hammering a
 *   rejected credential is how a rate limit is earned.
 * - **No flush on `pagehide`.** A network write cannot be relied on while a tab is
 *   being killed, and `io-001`'s local autosave is already the durable copy — so
 *   this module deliberately has no flush-on-unload entry point at all.
 *
 * @module storage/autoPush
 */

import { isTransient } from './hostedBackend.js'

/** Trailing debounce: one burst of edits becomes one commit. */
export const DEBOUNCE_MS = 30_000

/** …but unbroken editing still pushes within this. */
export const MAX_WAIT_MS = 300_000

/** Backoff for a transient failure, then the last value forever. */
export const BACKOFF_MS = [10_000, 30_000, 120_000, 300_000]

/**
 * @typedef {'off' | 'in-sync' | 'pending' | 'pushing' | 'paused' | 'failed'} AutoPushState
 *
 * Mirrored by the File-button dot and the chip, each distinct **by shape** and not
 * only by colour (§11 rule 4): `●` in sync, `◌` pending, animated ring pushing,
 * `!` paused, `✕` failed.
 */

/**
 * @typedef {object} AutoPushStatus
 * @property {AutoPushState} state
 * @property {string} message Safe to show the user; never contains a credential.
 * @property {boolean} conflict A conflict dialog is waiting to be raised/answered.
 * @property {number} pushedAt Epoch ms of the last successful push, or 0.
 */

/**
 * @typedef {object} AutoPusher
 * @property {boolean} enabled
 * @property {() => Promise<void>} enable Switch on; pushes once immediately.
 * @property {(options?: { pending?: boolean }) => void} restore Switched on by a restored
 *   connection: no immediate push, and one scheduled only when `pending`.
 * @property {() => void} disable Switch off; cancels everything pending.
 * @property {() => void} notifyMutation A committed document change happened.
 * @property {(options?: { pushNow?: boolean }) => Promise<void>} resume Leave the paused state.
 * @property {() => void} dismissConflict Cancel: drop the dialog, stay paused.
 * @property {() => AutoPushStatus} status
 * @property {() => void} dispose
 */

/**
 * @param {object} options
 * @param {(context: { reason: 'enabled' | 'auto' | 'resume' }) => Promise<void>} options.push
 *   Performs one push. Throws a `HostedError`; its `kind` decides what happens next.
 * @param {(status: AutoPushStatus) => void} options.onStatus
 * @param {number} [options.debounceMs]
 * @param {number} [options.maxWaitMs]
 * @param {number[]} [options.backoffMs]
 * @param {() => number} [options.now]
 * @returns {AutoPusher}
 */
export function createAutoPusher({
  push,
  onStatus,
  debounceMs = DEBOUNCE_MS,
  maxWaitMs = MAX_WAIT_MS,
  backoffMs = BACKOFF_MS,
  now = () => Date.now(),
}) {
  let enabled = false
  let changeCount = 0
  let pushedCount = 0
  let firstChangeAt = 0
  let retryIndex = 0
  let pushedAt = 0
  /** @type {AutoPushState} */
  let state = 'off'
  let message = ''
  let conflict = false
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null
  /** @type {Promise<void>} */
  let chain = Promise.resolve()
  let inFlight = false

  function snapshot() {
    return { state, message, conflict, pushedAt }
  }

  /**
   * @param {AutoPushState} next
   * @param {string} [text]
   */
  function report(next, text = '') {
    state = next
    message = text
    onStatus(snapshot())
  }

  function cancelTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  /** @param {number} delay */
  function arm(delay) {
    cancelTimer()
    timer = setTimeout(() => {
      timer = null
      run('auto')
    }, Math.max(0, delay))
  }

  function schedule() {
    if (!enabled || state === 'paused' || state === 'failed') return
    const waited = now() - firstChangeAt
    arm(Math.min(debounceMs, maxWaitMs - waited))
  }

  /** @param {'enabled' | 'auto' | 'resume'} reason */
  function run(reason) {
    chain = chain.then(() => pushOnce(reason))
    return chain
  }

  /** @param {'enabled' | 'auto' | 'resume'} reason */
  async function pushOnce(reason) {
    if (!enabled || state === 'paused' || state === 'failed') return
    // Nothing new to say, unless this push was asked for explicitly.
    if (reason === 'auto' && pushedCount === changeCount) return
    const target = changeCount
    inFlight = true
    report('pushing', 'Pushing…')
    try {
      await push({ reason })
      pushedCount = target
      retryIndex = 0
      pushedAt = now()
      if (changeCount === target) {
        firstChangeAt = 0
        report('in-sync', '')
      } else {
        // An edit landed while this push was in flight: it has its own schedule, and
        // claiming "in sync" now would be a claim about text the repository lacks.
        report('pending', '')
        schedule()
      }
    } catch (error) {
      onFailure(/** @type {any} */ (error), reason)
    } finally {
      inFlight = false
    }
  }

  /**
   * @param {import('./hostedBackend.js').HostedError} error
   * @param {'enabled' | 'auto' | 'resume'} reason What was being attempted, so the
   *   retry attempts the same thing. A retry of the immediate push that `enable()`
   *   does must not degrade into a scheduled `'auto'` push: there is no pending
   *   *change* behind it, so `'auto'` would find nothing to do and the failure would
   *   never be retried at all.
   */
  function onFailure(error, reason) {
    cancelTimer()
    if (error?.kind === 'conflict') {
      // Pause and raise the dialog once. Nothing further is attempted until the user
      // answers — this is the branch that makes "never silently overwrite" true.
      conflict = true
      report('paused', error.message)
      return
    }
    if (error?.kind === 'unauthorized' || error?.kind === 'forbidden' || error?.kind === 'invalid') {
      report('failed', error.message ?? 'Hosted storage rejected the request')
      return
    }
    if (isTransient(error)) {
      const wait = Math.max(
        backoffMs[Math.min(retryIndex, backoffMs.length - 1)],
        // A rate limit says how long to wait; never retry sooner than it asked.
        error.kind === 'rate-limited' ? (error.retryAfterMs ?? 0) : 0,
      )
      retryIndex += 1
      report(
        'paused',
        error.kind === 'offline' ? 'Offline — will retry' : `${error.message} — will retry`,
      )
      // Retrying is not a new mutation: re-arm directly rather than through
      // `schedule()`, which the paused state would refuse.
      timer = setTimeout(() => {
        timer = null
        // Leave the paused state only to attempt the retry itself.
        state = 'pending'
        run(reason)
      }, wait)
      return
    }
    report('failed', error?.message ?? 'Hosted storage could not be reached')
  }

  /** @type {AutoPusher} */
  const pusher = {
    get enabled() {
      return enabled
    },

    async enable() {
      if (enabled && state !== 'off') {
        // Already on: nothing to announce.
        return
      }
      enabled = true
      conflict = false
      retryIndex = 0
      state = 'pending'
      // "Turning it on pushes once immediately … it is never on silently."
      await run('enabled')
    },

    restore({ pending = false } = {}) {
      // A reload of a connection that already had auto-push on: switched on, but
      // **not** pushed immediately — §11 rule 3 schedules one push only when the
      // restored document is ahead of what was last pushed, and nothing otherwise.
      enabled = true
      conflict = false
      retryIndex = 0
      if (pending) {
        changeCount += 1
        firstChangeAt = now()
        report('pending', '')
        schedule()
      } else {
        report('in-sync', '')
      }
    },

    disable() {
      enabled = false
      cancelTimer()
      conflict = false
      changeCount = 0
      pushedCount = 0
      firstChangeAt = 0
      retryIndex = 0
      report('off', '')
    },

    notifyMutation() {
      changeCount += 1
      if (firstChangeAt === 0) firstChangeAt = now()
      if (!enabled) return
      if (state === 'paused' || state === 'failed') return // paused means paused
      if (!inFlight) report('pending', '')
      schedule()
    },

    async resume({ pushNow = false } = {}) {
      if (!enabled) return
      conflict = false
      retryIndex = 0
      state = 'pending'
      if (pushNow) {
        await run('resume')
      } else {
        report('in-sync', '')
      }
    },

    dismissConflict() {
      // Cancel: the dialog goes away, auto-push stays **paused, not off**.
      conflict = false
      onStatus(snapshot())
    },

    status: snapshot,

    dispose() {
      cancelTimer()
    },
  }
  return pusher
}
