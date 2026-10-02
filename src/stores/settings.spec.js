// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/**
 * `settings.js` is the project's first file to touch `localStorage`
 * (`TODO/ui-019`), so this spec is also where the "always mock at the
 * boundary" convention (CLAUDE.md) gets applied to it for the first time: a
 * fake store stands in for the real `localStorage`, and one test drives it
 * into throwing outright to prove a blocked/private-browsing store can never
 * crash startup.
 */

/**
 * A minimal in-memory stand-in for the Storage interface, with a lever to
 * make either method throw the way a locked-down or private-browsing
 * `localStorage` does.
 *
 * @param {{ throwing?: boolean }} [options]
 */
function fakeLocalStorage({ throwing = false } = {}) {
  /** @type {Map<string, string>} */
  const backing = new Map()
  return {
    /** @param {string} key */
    getItem(key) {
      if (throwing) throw new DOMException('blocked', 'SecurityError')
      return backing.has(key) ? backing.get(key) : null
    },
    /** @param {string} key @param {string} value */
    setItem(key, value) {
      if (throwing) throw new DOMException('blocked', 'SecurityError')
      backing.set(key, String(value))
    },
    /** @param {string} key */
    removeItem(key) {
      backing.delete(key)
    },
    /**
     * Test-only escape hatch to seed a value without going through `setItem`.
     * @param {string} key @param {string} value
     */
    _seed(key, value) {
      backing.set(key, value)
    },
  }
}

/** @type {Storage | undefined} */
let originalLocalStorage

beforeEach(() => {
  setActivePinia(createPinia())
  originalLocalStorage = globalThis.localStorage
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: originalLocalStorage,
      configurable: true,
      writable: true,
    })
  }
})

describe('useSettingsStore — mouse navigation preset', () => {
  it('defaults to the ui-018 scheme when nothing is stored', async () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    const { useSettingsStore, DEFAULT_MOUSE_NAV_PRESET } = await import('./settings.js')
    const settings = useSettingsStore()
    expect(settings.mouseNavPreset).toBe(DEFAULT_MOUSE_NAV_PRESET)
    expect(DEFAULT_MOUSE_NAV_PRESET).toBe('shift-or-right-pans')
  })

  it('reads back a previously stored preset', async () => {
    const storage = fakeLocalStorage()
    storage._seed('warpcad.mouseNav', 'left-pans')
    vi.stubGlobal('localStorage', storage)
    const { useSettingsStore } = await import('./settings.js')
    const settings = useSettingsStore()
    expect(settings.mouseNavPreset).toBe('left-pans')
  })

  it('falls back to the default rather than throwing on a corrupt/unknown stored value', async () => {
    const storage = fakeLocalStorage()
    storage._seed('warpcad.mouseNav', 'some-garbage-value-from-an-old-build')
    vi.stubGlobal('localStorage', storage)
    const { useSettingsStore, DEFAULT_MOUSE_NAV_PRESET } = await import('./settings.js')
    expect(() => useSettingsStore()).not.toThrow()
    expect(useSettingsStore().mouseNavPreset).toBe(DEFAULT_MOUSE_NAV_PRESET)
  })

  it('falls back to the default rather than crashing when localStorage.getItem throws', async () => {
    vi.stubGlobal('localStorage', fakeLocalStorage({ throwing: true }))
    const { useSettingsStore, DEFAULT_MOUSE_NAV_PRESET } = await import('./settings.js')
    expect(() => useSettingsStore()).not.toThrow()
    expect(useSettingsStore().mouseNavPreset).toBe(DEFAULT_MOUSE_NAV_PRESET)
  })

  it('setMouseNavPreset updates the store immediately and persists the choice', async () => {
    const storage = fakeLocalStorage()
    vi.stubGlobal('localStorage', storage)
    const { useSettingsStore } = await import('./settings.js')
    const settings = useSettingsStore()
    settings.setMouseNavPreset('left-pans')
    expect(settings.mouseNavPreset).toBe('left-pans')
    expect(storage.getItem('warpcad.mouseNav')).toBe('left-pans')
  })

  it('ignores an unrecognised preset id rather than storing garbage', async () => {
    const storage = fakeLocalStorage()
    vi.stubGlobal('localStorage', storage)
    const { useSettingsStore, DEFAULT_MOUSE_NAV_PRESET } = await import('./settings.js')
    const settings = useSettingsStore()
    settings.setMouseNavPreset('not-a-real-preset')
    expect(settings.mouseNavPreset).toBe(DEFAULT_MOUSE_NAV_PRESET)
    expect(storage.getItem('warpcad.mouseNav')).toBeNull()
  })

  it('does not crash when localStorage.setItem throws on write', async () => {
    vi.stubGlobal('localStorage', fakeLocalStorage({ throwing: true }))
    const { useSettingsStore } = await import('./settings.js')
    const settings = useSettingsStore()
    expect(() => settings.setMouseNavPreset('left-pans')).not.toThrow()
    // The in-memory choice still applies for this session even though it
    // could not be persisted.
    expect(settings.mouseNavPreset).toBe('left-pans')
  })
})

describe('exportFormat (TODO/ui-034)', () => {
  it('defaults to stl, remembers a choice, and rejects anything that is not a format', async () => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
    const { useSettingsStore } = await import('./settings.js')
    const settings = useSettingsStore()
    expect(settings.exportFormat).toBe('stl')
    settings.setExportFormat('glb')
    expect(settings.exportFormat).toBe('glb')
    expect(localStorage.getItem('warpcad.exportFormat')).toBe('glb')
    settings.setExportFormat('step')
    expect(settings.exportFormat).toBe('glb')
  })

  it('a stored value that is not a format falls back to stl', async () => {
    const fake = fakeLocalStorage()
    fake._seed('warpcad.exportFormat', 'dxf')
    vi.stubGlobal('localStorage', fake)
    const { useSettingsStore } = await import('./settings.js')
    expect(useSettingsStore().exportFormat).toBe('stl')
  })

  it('a throwing localStorage never crashes reading or writing it', async () => {
    vi.stubGlobal('localStorage', fakeLocalStorage({ throwing: true }))
    const { useSettingsStore } = await import('./settings.js')
    const settings = useSettingsStore()
    expect(settings.exportFormat).toBe('stl')
    expect(() => settings.setExportFormat('obj')).not.toThrow()
    expect(settings.exportFormat).toBe('obj')
  })
})
