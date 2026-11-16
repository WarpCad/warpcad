// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import { stopTheme, useTheme } from './useTheme.js'

/**
 * `useTheme` is the one reader of `prefers-color-scheme` (`TODO/ui-113`). The boundary is mocked:
 * a `matchMedia` whose `matches` the test flips and whose change event it fires, and an in-memory
 * `localStorage` that can be made to throw.
 */

/** @param {boolean} initialLight */
function fakeMatchMedia(initialLight) {
  const state = { light: initialLight, queries: /** @type {string[]} */ ([]) }
  /** @type {Set<(e: { matches: boolean }) => void>} */
  const listeners = new Set()
  const matchMedia = vi.fn((/** @type {string} */ query) => {
    state.queries.push(query)
    return {
      get matches() {
        return state.light
      },
      addEventListener: (/** @type {string} */ _t, /** @type {any} */ fn) => listeners.add(fn),
      removeEventListener: (/** @type {string} */ _t, /** @type {any} */ fn) => listeners.delete(fn),
    }
  })
  return {
    matchMedia,
    state,
    /** @param {boolean} light */
    flip(light) {
      state.light = light
      for (const fn of listeners) fn({ matches: light })
    },
  }
}

/** @param {{ throwing?: boolean }} [options] */
function fakeLocalStorage({ throwing = false } = {}) {
  /** @type {Map<string, string>} */
  const backing = new Map()
  return {
    getItem(/** @type {string} */ k) {
      if (throwing) throw new DOMException('blocked', 'SecurityError')
      return backing.has(k) ? /** @type {string} */ (backing.get(k)) : null
    },
    setItem(/** @type {string} */ k, /** @type {string} */ v) {
      if (throwing) throw new DOMException('blocked', 'SecurityError')
      backing.set(k, String(v))
    },
    removeItem: (/** @type {string} */ k) => void backing.delete(k),
    backing,
  }
}

/** @type {ReturnType<typeof fakeMatchMedia>} */
let media
/** @type {ReturnType<typeof fakeLocalStorage>} */
let storage

/** @param {boolean} [light] @param {boolean} [throwing] */
function boot(light = false, throwing = false) {
  stopTheme()
  media = fakeMatchMedia(light)
  storage = fakeLocalStorage({ throwing })
  vi.stubGlobal('matchMedia', media.matchMedia)
  window.matchMedia = /** @type {any} */ (media.matchMedia)
  vi.stubGlobal('localStorage', storage)
  setActivePinia(createPinia())
}

beforeEach(() => {
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  stopTheme()
  vi.unstubAllGlobals()
})

describe('useTheme', () => {
  it('defaults to System and resolves from the mocked scheme', () => {
    boot(true)
    const theme = useTheme()
    expect(theme.preference.value).toBe('system')
    expect(theme.resolved.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('System follows the change event', () => {
    boot(false)
    const theme = useTheme()
    expect(theme.resolved.value).toBe('dark')
    media.flip(true)
    expect(theme.resolved.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    media.flip(false)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('Dark and Light ignore the system scheme and its changes', () => {
    boot(true)
    const theme = useTheme()
    theme.setPreference('dark')
    expect(theme.resolved.value).toBe('dark')
    media.flip(false)
    media.flip(true)
    expect(theme.resolved.value).toBe('dark')
    theme.setPreference('light')
    media.flip(false)
    expect(theme.resolved.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('choosing System again resolves from the current scheme', () => {
    boot(false)
    const theme = useTheme()
    theme.setPreference('light')
    theme.setPreference('system')
    expect(theme.resolved.value).toBe('dark')
  })

  it('persists the preference across a fresh boot', () => {
    boot(false)
    useTheme().setPreference('light')
    expect(storage.backing.get('warpcad.theme')).toBe('light')
    stopTheme()
    setActivePinia(createPinia())
    expect(useTheme().preference.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('ignores an unknown preference', () => {
    boot(false)
    const theme = useTheme()
    theme.setPreference('sepia')
    expect(theme.preference.value).toBe('system')
    expect(storage.backing.has('warpcad.theme')).toBe(false)
  })

  it('degrades to System when storage is blocked, without throwing', () => {
    boot(true, true)
    let theme = /** @type {ReturnType<typeof useTheme>} */ (/** @type {unknown} */ (null))
    expect(() => {
      theme = useTheme()
      theme.setPreference('dark')
    }).not.toThrow()
    // This session still honours the choice; the next boot would be System.
    expect(theme.resolved.value).toBe('dark')
  })

  it('falls back to dark without matchMedia', () => {
    boot(true)
    // @ts-expect-error a browser without matchMedia
    window.matchMedia = undefined
    vi.stubGlobal('matchMedia', undefined)
    expect(useTheme().resolved.value).toBe('dark')
  })

  it('calls onChange listeners with the resolved theme, and stops after unsubscribe', async () => {
    boot(false)
    const theme = useTheme()
    const seen = /** @type {string[]} */ ([])
    const off = theme.onChange((t) => seen.push(t))
    media.flip(true)
    theme.setPreference('dark')
    await nextTick()
    expect(seen).toEqual(['light', 'dark'])
    off()
    theme.setPreference('light')
    await nextTick()
    expect(seen).toEqual(['light', 'dark'])
  })

  it('reads the scheme query in this one place', () => {
    boot(false)
    useTheme()
    expect(new Set(media.state.queries)).toEqual(new Set(['(prefers-color-scheme: light)']))
  })
})

/**
 * `TODO/ui-121`: inside a native shell the theme is also told to the shell (`set_theme`), as `system`,
 * `light` or `dark`; a style is sent as its scheme. Nothing is sent on the web.
 */
describe('useTheme and the native shell', () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let invoke

  /** @param {boolean} native */
  function bootNative(native, light = false) {
    boot(light)
    invoke = vi.fn(() => Promise.resolve(null))
    if (native) vi.stubGlobal('__TAURI_INTERNALS__', { invoke })
  }
  const sent = () => invoke.mock.calls.filter((c) => c[0] === 'set_theme').map((c) => c[1].theme)

  it('sends system at start, and nothing on the web', () => {
    bootNative(true)
    useTheme()
    expect(sent()).toEqual(['system'])
    bootNative(false)
    useTheme()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('sends the mode the user chose, and system again when they return to System', () => {
    bootNative(true)
    const theme = useTheme()
    theme.setPreference('light')
    theme.setPreference('dark')
    theme.setPreference('system')
    expect(sent()).toEqual(['system', 'light', 'dark', 'system'])
  })

  it('does not send when the device flips while the preference is System', () => {
    bootNative(true)
    useTheme()
    media.flip(true)
    media.flip(false)
    expect(sent()).toEqual(['system'])
  })

  it('maps a style to its scheme, and sends nothing for a switch between styles of one scheme', () => {
    bootNative(true)
    const theme = useTheme()
    theme.setPreference('kids') // light
    theme.setPreference('minimal') // light
    theme.setPreference('glass') // light
    theme.setPreference('deco') // dark
    theme.setPreference('pixel') // dark
    theme.setPreference('light')
    expect(sent()).toEqual(['system', 'light', 'dark', 'light'])
  })

  it('survives a bridge that rejects', async () => {
    bootNative(true)
    invoke.mockRejectedValue(new Error('no such command'))
    const theme = useTheme()
    expect(() => theme.setPreference('light')).not.toThrow()
    await nextTick()
  })
})

