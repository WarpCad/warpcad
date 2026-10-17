// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — duck-typed fakes of the service-worker registration and document.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { canReloadNow, createUpdateScheduler, DEFAULT_CHECK_INTERVAL_MS } from './appUpdate.js'

/** A document stand-in: visibility plus add/removeEventListener. */
function fakeDocument() {
  /** @type {Map<string, Set<() => void>>} */
  const listeners = new Map()
  return {
    visibilityState: 'visible',
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type).add(fn)
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn)
    },
    fire(type) {
      for (const fn of listeners.get(type) ?? []) fn()
    },
    count(type) {
      return listeners.get(type)?.size ?? 0
    },
  }
}

describe('canReloadNow', () => {
  const quiet = { dragging: false, editing: false, unsaved: false, mergeWaiting: false }

  it('is true when nothing is in progress', () => {
    expect(canReloadNow(quiet)).toBe(true)
  })

  it.each(['dragging', 'editing', 'unsaved', 'mergeWaiting'])('is false while %s', (key) => {
    expect(canReloadNow({ ...quiet, [key]: true })).toBe(false)
  })
})

describe('createUpdateScheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('calls registration.update() on the interval, and stops after stop()', async () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined) }
    const doc = fakeDocument()
    const scheduler = createUpdateScheduler({ getRegistration: () => registration, document: doc })
    scheduler.start()
    expect(registration.update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(DEFAULT_CHECK_INTERVAL_MS)
    expect(registration.update).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(DEFAULT_CHECK_INTERVAL_MS * 2)
    expect(registration.update).toHaveBeenCalledTimes(3)
    scheduler.stop()
    await vi.advanceTimersByTimeAsync(DEFAULT_CHECK_INTERVAL_MS * 3)
    expect(registration.update).toHaveBeenCalledTimes(3)
    expect(doc.count('visibilitychange')).toBe(0)
  })

  it('checks when the tab becomes visible, and not when it becomes hidden', async () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined) }
    const doc = fakeDocument()
    const scheduler = createUpdateScheduler({ getRegistration: () => registration, document: doc })
    scheduler.start()
    doc.visibilityState = 'hidden'
    doc.fire('visibilitychange')
    expect(registration.update).not.toHaveBeenCalled()
    doc.visibilityState = 'visible'
    doc.fire('visibilitychange')
    expect(registration.update).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('does nothing, and does not throw, while there is no registration', async () => {
    const doc = fakeDocument()
    let registration = null
    const scheduler = createUpdateScheduler({ getRegistration: () => registration, document: doc })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(DEFAULT_CHECK_INTERVAL_MS)
    expect(await scheduler.checkNow()).toBe('unavailable')
    // The registration arrives later (registerSW resolves asynchronously): the next tick uses it.
    registration = { update: vi.fn().mockResolvedValue(undefined) }
    await vi.advanceTimersByTimeAsync(DEFAULT_CHECK_INTERVAL_MS)
    expect(registration.update).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('never throws on a rejected update(), and reports failed', async () => {
    const registration = { update: vi.fn().mockRejectedValue(new Error('offline')) }
    const scheduler = createUpdateScheduler({ getRegistration: () => registration, document: fakeDocument() })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(DEFAULT_CHECK_INTERVAL_MS)
    expect(registration.update).toHaveBeenCalledTimes(1)
    expect(await scheduler.checkNow()).toBe('failed')
    scheduler.stop()
  })

  it('checkNow reports found when a worker is installing or waiting, latest otherwise', async () => {
    let registration = { update: vi.fn().mockResolvedValue(undefined), installing: null, waiting: null }
    const scheduler = createUpdateScheduler({ getRegistration: () => registration, document: fakeDocument() })
    expect(await scheduler.checkNow()).toBe('latest')
    registration = { update: vi.fn().mockResolvedValue(undefined), installing: {}, waiting: null }
    expect(await scheduler.checkNow()).toBe('found')
    registration = { update: vi.fn().mockResolvedValue(undefined), installing: null, waiting: {} }
    expect(await scheduler.checkNow()).toBe('found')
  })

  it('start() twice does not double the timers', async () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined) }
    const scheduler = createUpdateScheduler({ getRegistration: () => registration, document: fakeDocument() })
    scheduler.start()
    scheduler.start()
    await vi.advanceTimersByTimeAsync(DEFAULT_CHECK_INTERVAL_MS)
    expect(registration.update).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })
})
