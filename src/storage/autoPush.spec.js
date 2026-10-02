// @ts-nocheck — hand-written fakes for the push boundary; the module under test is fully
// typed and checked by `npm run typecheck`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HostedError } from './hostedBackend.js'
import { DEBOUNCE_MS, MAX_WAIT_MS, createAutoPusher } from './autoPush.js'

/**
 * `TODO/io-002` — the auto-push scheduler's policy, decided in
 * `docs/decisions/interaction-model-qa.md` §11 (rules 1-7) rather than left to the
 * implementer. Pure logic with an injected clock, exactly like `autosave.js`: no
 * network, no Vue, no storage, so every number below is asserted with fake timers
 * instead of hand-waved.
 */

/**
 * @param {object} [options]
 * @param {Array<Error | null>} [options.outcomes] One entry per call; `null` = success.
 */
function harness({ outcomes = [] } = {}) {
  const pushes = []
  const statuses = []
  let index = 0
  const pusher = createAutoPusher({
    async push(context) {
      pushes.push({ ...context, at: Date.now() })
      const outcome = outcomes[index] ?? null
      index += 1
      if (outcome) throw outcome
    },
    onStatus(status) {
      statuses.push({ ...status, at: Date.now() })
    },
  })
  return { pusher, pushes, statuses, state: () => pusher.status().state }
}

const conflict = () => new HostedError('conflict', 'The repository copy changed since you last loaded or saved it')
const offline = () => new HostedError('offline', 'No network — nothing was written')
const rejected = () => new HostedError('unauthorized', 'GitHub rejected this token')

describe('the auto-push scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is off until switched on, and a mutation while off never pushes', async () => {
    const { pusher, pushes, state } = harness()
    expect(state()).toBe('off')
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(pushes).toHaveLength(0)
  })

  it('pushes once immediately when switched on, so the user sees it work', async () => {
    const { pusher, pushes, state } = harness()
    await pusher.enable()
    expect(pushes).toHaveLength(1)
    expect(pushes[0].reason).toBe('enabled')
    expect(state()).toBe('in-sync')
  })

  it('turns one burst of edits into ONE push, 30 s after the last of them', async () => {
    const { pusher, pushes, state } = harness()
    await pusher.enable()
    expect(pushes).toHaveLength(1)

    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(5_000)
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(5_000)
    pusher.notifyMutation()
    expect(state()).toBe('pending')

    // 29 s after the last edit: still nothing — the debounce is trailing.
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1_000)
    expect(pushes).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(2_000)
    expect(pushes).toHaveLength(2)
    expect(pushes[1].reason).toBe('auto')
    expect(state()).toBe('in-sync')
  })

  it('pushes anyway after 5 minutes of unbroken editing (the max-wait cap)', async () => {
    const { pusher, pushes } = harness()
    await pusher.enable()
    const startedAt = Date.now()

    // An edit every 20 s forever: a pure debounce would postpone the write indefinitely.
    for (let elapsed = 0; elapsed < 11 * 60_000; elapsed += 20_000) {
      pusher.notifyMutation()
      await vi.advanceTimersByTimeAsync(20_000)
    }

    const auto = pushes.filter((push) => push.reason === 'auto')
    expect(auto.length).toBeGreaterThanOrEqual(2)
    expect(auto[0].at - startedAt).toBeLessThanOrEqual(MAX_WAIT_MS + 20_000)
    expect(auto[0].at - startedAt).toBeGreaterThanOrEqual(MAX_WAIT_MS - 20_000)
  })

  it('pauses on a conflict, raises the dialog ONCE, and attempts nothing further', async () => {
    const { pusher, pushes, state } = harness({ outcomes: [null, conflict()] })
    await pusher.enable()
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)

    expect(pushes).toHaveLength(2)
    expect(state()).toBe('paused')
    expect(pusher.status().conflict).toBe(true)
    expect(pusher.status().message).toMatch(/changed/i)

    // More edits while paused: no second dialog, no further attempts.
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(pushes).toHaveLength(2)
    expect(pusher.status().conflict).toBe(true)
  })

  it('stays paused after Cancel — paused, not off — and pushes again only when resumed', async () => {
    const { pusher, pushes } = harness({ outcomes: [null, conflict()] })
    await pusher.enable()
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)

    pusher.dismissConflict()
    expect(pusher.status().conflict).toBe(false)
    expect(pusher.status().state).toBe('paused')
    expect(pusher.enabled).toBe(true) // paused, not switched off

    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(pushes).toHaveLength(2)

    await pusher.resume({ pushNow: true })
    expect(pushes).toHaveLength(3)
    expect(pusher.status().state).toBe('in-sync')
  })

  it('pause() holds a switched-on pusher in the paused state with a message, and only resume() leaves it', async () => {
    const { pusher, pushes, state } = harness()
    await pusher.enable()
    expect(pushes).toHaveLength(1)

    pusher.pause('New project — auto-push paused')
    expect(state()).toBe('paused')
    expect(pusher.enabled).toBe(true) // paused, not off
    expect(pusher.status().message).toBe('New project — auto-push paused')
    expect(pusher.status().conflict).toBe(false) // a note, not a dialog

    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(pushes).toHaveLength(1)

    await pusher.resume({ pushNow: true })
    expect(pushes).toHaveLength(2)
    expect(state()).toBe('in-sync')
  })

  it('pause() on a pusher that is off does nothing', () => {
    const { pusher, state } = harness()
    pusher.pause('x')
    expect(state()).toBe('off')
  })

  it('retries a network failure with backoff 10 s, 30 s, 2 min, capped at 5 min — and raises no dialog', async () => {
    const { pusher, pushes, statuses } = harness({
      outcomes: [null, offline(), offline(), offline(), offline(), null],
    })
    await pusher.enable()
    const failedAt = Date.now() + DEBOUNCE_MS
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1)
    expect(pushes).toHaveLength(2)
    expect(pusher.status().state).toBe('paused')
    expect(pusher.status().conflict).toBe(false)
    expect(pusher.status().message).toMatch(/offline|retry/i)

    await vi.advanceTimersByTimeAsync(9_000)
    expect(pushes).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1_500) // 10 s
    expect(pushes).toHaveLength(3)

    await vi.advanceTimersByTimeAsync(30_000) // 30 s
    expect(pushes).toHaveLength(4)

    await vi.advanceTimersByTimeAsync(120_000) // 2 min
    expect(pushes).toHaveLength(5)

    await vi.advanceTimersByTimeAsync(300_000) // capped at 5 min
    expect(pushes).toHaveLength(6)
    expect(pusher.status().state).toBe('in-sync')
    expect(statuses.some((status) => status.conflict)).toBe(false)
  })

  it('retries the immediate push that switching on performs, even with no edit behind it', async () => {
    // The regression this pins: a retry that degraded into an ordinary scheduled push
    // would find nothing pending and quietly do nothing, leaving a connection switched
    // on, reporting "will retry", and never retrying.
    const { pusher, pushes, state } = harness({ outcomes: [offline(), offline(), null] })
    await pusher.enable()
    expect(pushes).toHaveLength(1)
    expect(state()).toBe('paused')

    await vi.advanceTimersByTimeAsync(10_500)
    expect(pushes).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(30_500)
    expect(pushes).toHaveLength(3)
    expect(state()).toBe('in-sync')
  })

  it('treats a rejected token as a failure to show, not something to retry', async () => {
    const { pusher, pushes, state } = harness({ outcomes: [null, rejected()] })
    await pusher.enable()
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)

    expect(state()).toBe('failed')
    expect(pusher.status().message).toMatch(/token/i)
    expect(pusher.status().conflict).toBe(false)

    // No backoff retry: a bad token does not get better by waiting, and hammering a
    // rejected credential is how a rate limit is earned.
    await vi.advanceTimersByTimeAsync(20 * 60_000)
    expect(pushes).toHaveLength(2)
  })

  it('never overlaps two pushes, and an edit made during one is pushed after it', async () => {
    let release
    const pushes = []
    const pusher = createAutoPusher({
      async push(context) {
        pushes.push(context.reason)
        if (pushes.length === 2) await new Promise((resolve) => (release = resolve))
      },
      onStatus() {},
    })
    await pusher.enable()
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1)
    expect(pushes).toHaveLength(2) // in flight

    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1)
    expect(pushes).toHaveLength(2) // still only the in-flight one

    release()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1)
    expect(pushes).toHaveLength(3)
  })

  it('switching off cancels everything pending, and switching on again starts clean', async () => {
    const { pusher, pushes, state } = harness({ outcomes: [null, conflict()] })
    await pusher.enable()
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)
    expect(state()).toBe('paused')

    pusher.disable()
    expect(state()).toBe('off')
    expect(pusher.status().conflict).toBe(false)
    pusher.notifyMutation()
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(pushes).toHaveLength(2)

    await pusher.enable()
    expect(pushes).toHaveLength(3)
    expect(state()).toBe('in-sync')
  })

  it('a restored connection is on without pushing, and schedules one push only if work is pending', async () => {
    const quiet = harness()
    quiet.pusher.restore({ pending: false })
    expect(quiet.state()).toBe('in-sync')
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(quiet.pushes).toHaveLength(0)

    const ahead = harness()
    ahead.pusher.restore({ pending: true })
    expect(ahead.state()).toBe('pending')
    expect(ahead.pushes).toHaveLength(0) // not immediately: no flush on boot
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1_000)
    expect(ahead.pushes).toHaveLength(1)
    expect(ahead.state()).toBe('in-sync')
  })

  it('reports pending → pushing → in-sync, the shape-coded states the chip mirrors', async () => {
    const { pusher, statuses } = harness()
    await pusher.enable()
    statuses.length = 0
    pusher.notifyMutation()
    expect(statuses.at(-1).state).toBe('pending')
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 1)
    expect(statuses.map((status) => status.state)).toEqual(['pending', 'pushing', 'in-sync'])
  })
})
