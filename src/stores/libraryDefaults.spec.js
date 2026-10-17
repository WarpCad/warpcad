// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { libraryRow } from '../core/library.js'
import { useLibraryDefaultsStore } from './libraryDefaults.js'

const KEY = 'warpcad.library.lastParams'
const bolt = libraryRow('hardware.bolt')

describe('libraryDefaults store (TODO/ui-068)', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })
  afterEach(() => vi.restoreAllMocks())

  it('remembers a bolt edit and hands it back as the next drag\'s overrides', () => {
    const store = useLibraryDefaultsStore()
    expect(store.overridesFor(bolt)).toEqual({})
    store.remember('hardware.bolt', { type: 'socket', spec: 'm2.5', length: 8, fit: 'loose', clearLength: 3 })
    expect(store.overridesFor(bolt)).toEqual({ type: 'socket', spec: 'm2.5', length: 8, fit: 'loose' })
    expect(store.isCustom(bolt)).toBe(true)
  })

  it('ignores a primitive, which is never remembered', () => {
    const store = useLibraryDefaultsStore()
    store.remember('primitive.cuboid', { size: [50, 50, 50] })
    expect(store.remembered).toEqual({})
  })

  it('reset(op) removes only that op', () => {
    const store = useLibraryDefaultsStore()
    store.remember('hardware.bolt', { type: 'socket', spec: 'm2.5', length: 8 })
    store.remember('hardware.nut', { spec: 'm5', fit: 'loose' })
    store.reset('hardware.bolt')
    expect(store.remembered['hardware.bolt']).toBeUndefined()
    expect(store.remembered['hardware.nut']).toBeDefined()
    expect(store.isCustom(bolt)).toBe(false)
  })

  it('survives a fresh store instance (the reload)', () => {
    useLibraryDefaultsStore().remember('hardware.bolt', { type: 'socket', spec: 'm2.5', length: 8 })
    setActivePinia(createPinia())
    expect(useLibraryDefaultsStore().overridesFor(bolt)).toMatchObject({ type: 'socket', spec: 'm2.5', length: 8 })
  })

  it('corrupt JSON loads as empty', () => {
    localStorage.setItem(KEY, '{not json')
    expect(useLibraryDefaultsStore().remembered).toEqual({})
    localStorage.setItem(KEY, '[1,2]')
    setActivePinia(createPinia())
    expect(useLibraryDefaultsStore().remembered).toEqual({})
  })

  it('a throwing localStorage leaves the store empty and working', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const store = useLibraryDefaultsStore()
    expect(store.remembered).toEqual({})
    store.remember('hardware.bolt', { type: 'socket', spec: 'm2.5', length: 8 })
    expect(store.overridesFor(bolt)).toMatchObject({ spec: 'm2.5' })
  })

  it('setChoice reconciles a dependent Size when the Type changes', () => {
    const store = useLibraryDefaultsStore()
    store.setChoice(bolt, 'type', 'pan')
    const next = store.overridesFor(bolt)
    expect(next.type).toBe('pan')
    expect(next.spec).not.toBe('m10')
  })

  it('a stale remembered value never reaches a drag: validated on read', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'hardware.bolt': { type: 'pan', spec: 'm10', length: 8, fit: 'zzz' } }))
    const store = useLibraryDefaultsStore()
    const overrides = store.overridesFor(bolt)
    expect(overrides.type).toBe('pan')
    expect(overrides.spec).not.toBe('m10')
  })
})
