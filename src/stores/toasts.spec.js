// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_LINGER_MS, useToastsStore } from './toasts.js'

/** `TODO/ui-117`: the one toast queue. Timers are faked so linger is exact. */
beforeEach(() => {
  vi.useFakeTimers()
  setActivePinia(createPinia())
})
afterEach(() => vi.useRealTimers())

describe('toasts store', () => {
  it('queues in order, oldest first', () => {
    const toasts = useToastsStore()
    toasts.show({ text: 'one' })
    toasts.show({ text: 'two' })
    toasts.show({ text: 'three' })
    expect(toasts.items.map((t) => t.text)).toEqual(['one', 'two', 'three'])
  })

  it('a second toast does not replace the first', () => {
    const toasts = useToastsStore()
    toasts.show({ text: 'Link copied, 2.3 KB' })
    toasts.show({ text: 'Saved Standoff' })
    expect(toasts.items).toHaveLength(2)
    expect(toasts.items[0].text).toBe('Link copied, 2.3 KB')
  })

  it('lingers for the default time, then leaves on its own', () => {
    const toasts = useToastsStore()
    toasts.show({ text: 'a' })
    vi.advanceTimersByTime(DEFAULT_LINGER_MS - 1)
    expect(toasts.items).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(toasts.items).toHaveLength(0)
  })

  it('each toast runs its own clock: the first leaves while the second stays', () => {
    const toasts = useToastsStore()
    toasts.show({ text: 'first' })
    vi.advanceTimersByTime(2000)
    toasts.show({ text: 'second' })
    vi.advanceTimersByTime(DEFAULT_LINGER_MS - 2000)
    expect(toasts.items.map((t) => t.text)).toEqual(['second'])
    vi.advanceTimersByTime(2000)
    expect(toasts.items).toHaveLength(0)
  })

  it('lingerMs overrides the default, and null keeps the toast until dismissed', () => {
    const toasts = useToastsStore()
    toasts.show({ text: 'short', lingerMs: 1000 })
    const sticky = toasts.show({ text: 'sticky', lingerMs: null })
    vi.advanceTimersByTime(1000)
    expect(toasts.items.map((t) => t.text)).toEqual(['sticky'])
    vi.advanceTimersByTime(60_000)
    expect(toasts.items).toHaveLength(1)
    toasts.dismiss(sticky)
    expect(toasts.items).toHaveLength(0)
  })

  it('dismiss removes one toast, cancels its timer and ignores an unknown id', () => {
    const toasts = useToastsStore()
    const a = toasts.show({ text: 'a' })
    toasts.show({ text: 'b' })
    toasts.dismiss(a)
    toasts.dismiss(9999)
    expect(toasts.items.map((t) => t.text)).toEqual(['b'])
    expect(vi.getTimerCount()).toBe(1)
  })

  it('the same key replaces its own earlier toast in place and restarts the clock', () => {
    const toasts = useToastsStore()
    toasts.show({ key: 'share', text: 'Published. Link copied' })
    toasts.show({ key: 'library', text: 'Saved Standoff' })
    vi.advanceTimersByTime(3000)
    toasts.show({ key: 'share', text: 'Gist updated' })
    expect(toasts.items.map((t) => t.text)).toEqual(['Gist updated', 'Saved Standoff'])
    vi.advanceTimersByTime(DEFAULT_LINGER_MS - 3000)
    expect(toasts.items.map((t) => t.text)).toEqual(['Gist updated'])
  })

  it('danger toasts say so: tone is kept, and the default tone is neutral', () => {
    const toasts = useToastsStore()
    toasts.show({ text: 'ok' })
    toasts.show({ text: 'Could not delete', tone: 'danger' })
    expect(toasts.items.map((t) => t.tone)).toEqual(['neutral', 'danger'])
  })

  it('update patches a keyed toast in place and restarts its clock', () => {
    const toasts = useToastsStore()
    toasts.show({ key: 'gist', text: 'Saved to gist: A', lingerMs: 1000 })
    vi.advanceTimersByTime(900)
    toasts.update('gist', { text: 'Gist link copied', action: null, lingerMs: 1000 })
    vi.advanceTimersByTime(900)
    expect(toasts.items[0].text).toBe('Gist link copied')
    vi.advanceTimersByTime(100)
    expect(toasts.items).toHaveLength(0)
  })

  it('clear empties the queue and every timer', () => {
    const toasts = useToastsStore()
    toasts.show({ text: 'a' })
    toasts.show({ text: 'b' })
    toasts.clear()
    expect(toasts.items).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
