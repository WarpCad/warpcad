// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAppearanceStore } from './appearance.js'

beforeEach(() => setActivePinia(createPinia()))

describe('appearance store (TODO/ui-151)', () => {
  it('starts closed, opens, closes and toggles', () => {
    const appearance = useAppearanceStore()
    expect(appearance.isOpen).toBe(false)
    appearance.open()
    expect(appearance.isOpen).toBe(true)
    appearance.close()
    expect(appearance.isOpen).toBe(false)
    appearance.toggle()
    expect(appearance.isOpen).toBe(true)
    appearance.toggle()
    expect(appearance.isOpen).toBe(false)
  })
})
