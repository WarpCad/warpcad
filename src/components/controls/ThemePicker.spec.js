// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { stopTheme, useTheme } from '../../composables/useTheme.js'
import { THEME_MODES, THEME_STYLES } from '../../stores/settings.js'
import ThemePicker from './ThemePicker.vue'

enableAutoUnmount(afterEach)

beforeEach(() => {
  localStorage.clear()
  stopTheme()
  setActivePinia(createPinia())
})

/** @param {Record<string, unknown>} [props] */
const mountPicker = (props = {}) => mount(ThemePicker, { props })
const pressed = (/** @type {import('@vue/test-utils').VueWrapper} */ w) =>
  w.findAll('button').filter((b) => b.attributes('aria-pressed') === 'true')

describe('ThemePicker (TODO/ui-151)', () => {
  it('draws one button per mode and one tile per style, from the lists', () => {
    const w = mountPicker()
    for (const mode of THEME_MODES) expect(w.find(`[data-testid="help-theme-${mode}"]`).exists()).toBe(true)
    expect(w.findAll('.theme-swatch')).toHaveLength(THEME_STYLES.length)
    for (const style of THEME_STYLES) expect(w.find(`[data-testid="help-theme-${style}"]`).exists()).toBe(true)
    expect(w.findAll('button')).toHaveLength(THEME_MODES.length + THEME_STYLES.length)
  })

  it('labels the modes and styles in words, "Art Deco" with its space', () => {
    const w = mountPicker()
    expect(w.get('[data-testid="help-theme-system"]').text()).toBe('System')
    expect(w.get('[data-testid="help-theme-deco"]').text()).toContain('Art Deco')
  })

  it('a click sets that preference', async () => {
    const w = mountPicker()
    await w.get('[data-testid="help-theme-light"]').trigger('click')
    expect(useTheme().preference.value).toBe('light')
    await w.get('[data-testid="help-theme-blueprint"]').trigger('click')
    expect(useTheme().preference.value).toBe('blueprint')
  })

  it('aria-pressed follows the preference: a style leaves no mode pressed and a mode leaves no style pressed', async () => {
    const w = mountPicker()
    expect(pressed(w).map((b) => b.attributes('data-testid'))).toEqual(['help-theme-system'])
    await w.get('[data-testid="help-theme-pixel"]').trigger('click')
    expect(pressed(w).map((b) => b.attributes('data-testid'))).toEqual(['help-theme-pixel'])
    await w.get('[data-testid="help-theme-dark"]').trigger('click')
    expect(pressed(w).map((b) => b.attributes('data-testid'))).toEqual(['help-theme-dark'])
  })

  it('testidPrefix renames every id and keeps the groups labelled', () => {
    const w = mountPicker({ testidPrefix: 'appearance' })
    expect(w.find('[data-testid="appearance-theme"]').exists()).toBe(true)
    expect(w.find('[data-testid="appearance-style"]').exists()).toBe(true)
    expect(w.find('[data-testid="appearance-theme-light"]').exists()).toBe(true)
    expect(w.find('[data-testid="appearance-theme-kids"]').exists()).toBe(true)
    expect(w.find('[data-testid="help-theme-light"]').exists()).toBe(false)
    const group = w.get('[data-testid="appearance-theme"]')
    const label = w.get(`#${group.attributes('aria-labelledby')}`)
    expect(label.text()).toBe('Theme')
  })

  it('keeps the Help ids by default', () => {
    const w = mountPicker()
    expect(w.find('[data-testid="help-theme"]').exists()).toBe(true)
    expect(w.find('[data-testid="help-style"]').exists()).toBe(true)
  })
})
