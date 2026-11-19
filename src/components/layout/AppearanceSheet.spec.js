// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { stopTheme } from '../../composables/useTheme.js'
import { useAppearanceStore } from '../../stores/appearance.js'
import AppearanceSheet from './AppearanceSheet.vue'

enableAutoUnmount(afterEach)

const q = (/** @type {string} */ id) => document.body.querySelector(`[data-testid="${id}"]`)

beforeEach(() => {
  localStorage.clear()
  stopTheme()
  setActivePinia(createPinia())
})

describe('AppearanceSheet (TODO/ui-151)', () => {
  it('renders nothing while closed', () => {
    mount(AppearanceSheet, { attachTo: document.body })
    expect(q('appearance-sheet')).toBeNull()
  })

  it('opens with the picker under appearance-* ids and titled Appearance', async () => {
    mount(AppearanceSheet, { attachTo: document.body })
    const appearance = useAppearanceStore()
    appearance.open()
    await Promise.resolve()
    await Promise.resolve()
    expect(q('appearance-sheet')?.textContent).toContain('Appearance')
    expect(q('appearance-theme-light')).not.toBeNull()
    expect(q('appearance-theme-blueprint')).not.toBeNull()
    expect(q('appearance-theme-system')?.getAttribute('aria-pressed')).toBe('true')
  })

  it('the close button closes it', async () => {
    mount(AppearanceSheet, { attachTo: document.body })
    const appearance = useAppearanceStore()
    appearance.open()
    await Promise.resolve()
    ;/** @type {HTMLElement} */ (q('appearance-close')).click()
    expect(appearance.isOpen).toBe(false)
  })
})
