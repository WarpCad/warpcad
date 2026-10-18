// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppUpdateStore } from './appUpdate.js'

describe('appUpdate store', () => {
  /** @type {ReturnType<typeof useAppUpdateStore>} */
  let store
  const reload = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    reload.mockReset()
    store = useAppUpdateStore()
    store.setReloadPage(reload)
  })

  it('starts quiet', () => {
    expect(store.needRefresh).toBe(false)
    expect(store.checking).toBe(false)
    expect(store.lastChecked).toBe(0)
    expect(store.message).toBe('')
  })

  it('noteNeedRefresh shows the toast; Later clears it until the next detection', () => {
    store.noteNeedRefresh()
    expect(store.needRefresh).toBe(true)
    store.later()
    expect(store.needRefresh).toBe(false)
    store.noteNeedRefresh()
    expect(store.needRefresh).toBe(true)
  })

  it('exposes the build it is running', () => {
    expect(typeof store.version).toBe('string')
    expect(typeof store.commit).toBe('string')
  })

  it('labels the build by its commit alone, never the placeholder package version (ai-024)', () => {
    expect(store.buildLabel).toBe(`build ${store.commit}`)
    expect(store.buildLabel).not.toMatch(/0\.0\.0|\+/)
  })

  it('check() reports the latest version, and clears checking', async () => {
    store.attach({ checkNow: vi.fn().mockResolvedValue('latest') })
    const pending = store.check()
    expect(store.checking).toBe(true)
    await pending
    expect(store.checking).toBe(false)
    expect(store.message).toBe('You are on the latest version')
    expect(store.lastChecked).toBeGreaterThan(0)
  })

  it('check() reports a found update', async () => {
    store.attach({ checkNow: vi.fn().mockResolvedValue('found') })
    await store.check()
    expect(store.message).toBe('Update found, reload to apply')
  })

  it('check() clears checking and says so when the check fails', async () => {
    store.attach({ checkNow: vi.fn().mockResolvedValue('failed') })
    await store.check()
    expect(store.checking).toBe(false)
    expect(store.message).toMatch(/could not check/i)
  })

  it('check() clears checking even if the checker itself rejects', async () => {
    store.attach({ checkNow: vi.fn().mockRejectedValue(new Error('boom')) })
    await store.check()
    expect(store.checking).toBe(false)
    expect(store.message).toMatch(/could not check/i)
  })

  it('check() without a service worker says updates are not available here', async () => {
    await store.check()
    expect(store.checking).toBe(false)
    expect(store.message).toMatch(/not available/i)
  })

  it('reload(true) reloads at once', () => {
    store.noteNeedRefresh()
    store.reload(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reload(false) asks first, and reloads only on confirm', () => {
    store.noteNeedRefresh()
    store.reload(false)
    expect(reload).not.toHaveBeenCalled()
    expect(store.confirming).toBe(true)
    store.cancelConfirm()
    expect(store.confirming).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    store.reload(false)
    store.confirmReload()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('Later also closes the confirmation', () => {
    store.noteNeedRefresh()
    store.reload(false)
    store.later()
    expect(store.confirming).toBe(false)
  })
})
