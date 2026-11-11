// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_RESTORE_ATTEMPTS, RESTORE_WAIT_MS, createContextRecovery } from './contextRecovery.js'

describe('createContextRecovery', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('starts ready and waits RESTORE_WAIT_MS on a loss before offering the button', () => {
    const onChange = vi.fn()
    const recovery = createContextRecovery({ onChange })
    expect(recovery.state).toBe('ready')
    recovery.lost()
    expect(recovery.state).toBe('lost')
    vi.advanceTimersByTime(RESTORE_WAIT_MS - 1)
    expect(recovery.state).toBe('lost')
    vi.advanceTimersByTime(1)
    expect(recovery.state).toBe('stalled')
    expect(onChange.mock.calls.map((call) => call[0])).toEqual(['lost', 'stalled'])
  })

  it('a restore inside the wait goes straight back to ready and cancels the button', () => {
    const recovery = createContextRecovery()
    recovery.lost()
    vi.advanceTimersByTime(1000)
    recovery.restored()
    expect(recovery.state).toBe('ready')
    vi.advanceTimersByTime(RESTORE_WAIT_MS * 2)
    expect(recovery.state).toBe('ready')
  })

  it('offers Save a copy only after MAX_RESTORE_ATTEMPTS failed attempts', () => {
    expect(MAX_RESTORE_ATTEMPTS).toBe(2)
    const recovery = createContextRecovery()
    recovery.lost()
    vi.advanceTimersByTime(RESTORE_WAIT_MS)
    recovery.attemptFailed()
    expect(recovery.state).toBe('stalled')
    expect(recovery.failures).toBe(1)
    recovery.attemptFailed()
    expect(recovery.state).toBe('failed')
    expect(recovery.failures).toBe(2)
  })

  it('a later success clears the failure count, and a fresh loss starts a fresh wait', () => {
    const recovery = createContextRecovery()
    recovery.lost()
    vi.advanceTimersByTime(RESTORE_WAIT_MS)
    recovery.attemptFailed()
    recovery.restored()
    expect(recovery.state).toBe('ready')
    expect(recovery.failures).toBe(0)
    recovery.lost()
    expect(recovery.state).toBe('lost')
    vi.advanceTimersByTime(RESTORE_WAIT_MS)
    expect(recovery.state).toBe('stalled')
  })

  it('a second loss event while already lost does not restart or shorten the wait', () => {
    const recovery = createContextRecovery()
    recovery.lost()
    vi.advanceTimersByTime(2000)
    recovery.lost()
    vi.advanceTimersByTime(1000)
    expect(recovery.state).toBe('stalled')
  })

  it('dispose cancels a pending wait', () => {
    const recovery = createContextRecovery()
    recovery.lost()
    recovery.dispose()
    vi.advanceTimersByTime(RESTORE_WAIT_MS * 2)
    expect(recovery.state).toBe('lost')
  })
})
