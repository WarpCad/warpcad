// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import IconButton from './IconButton.vue'

const svg = '<svg viewBox="0 0 24 24"><path d="M0 0" fill="currentColor"/></svg>'

afterEach(() => vi.restoreAllMocks())

describe('IconButton (TODO/ui-114)', () => {
  it('renders the label as aria-label and title, and the slot as the icon', () => {
    const wrapper = mount(IconButton, { props: { label: 'Zoom in' }, slots: { default: svg } })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.attributes('aria-label')).toBe('Zoom in')
    expect(wrapper.attributes('title')).toBe('Zoom in')
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it.each(['default', 'primary', 'danger', 'quiet'])('variant %s renders its class', (variant) => {
    expect(mount(IconButton, { props: { label: 'x', variant } }).classes()).toContain(`icon-button--${variant}`)
  })

  it('is a square tap target by default and compact on request', () => {
    expect(mount(IconButton, { props: { label: 'x' } }).classes()).toContain('icon-button--tap')
    expect(mount(IconButton, { props: { label: 'x', size: 'compact' } }).classes()).toContain('icon-button--compact')
  })

  it('a title prop overrides the title, not the aria-label', () => {
    const wrapper = mount(IconButton, { props: { label: 'Undo', title: 'Undo (Ctrl+Z)' } })
    expect(wrapper.attributes('aria-label')).toBe('Undo')
    expect(wrapper.attributes('title')).toBe('Undo (Ctrl+Z)')
  })

  it('disabled blocks the click; pressed sets aria-pressed; data-testid passes through', async () => {
    let clicks = 0
    const wrapper = mount(IconButton, { props: { label: 'x', disabled: true, pressed: true }, attrs: { 'data-testid': 'icon', onClick: () => clicks++ } })
    await wrapper.trigger('click')
    expect(clicks).toBe(0)
    expect(wrapper.attributes('aria-pressed')).toBe('true')
    expect(wrapper.attributes('data-testid')).toBe('icon')
  })

  it('bordered draws the toolbar look, and pressed adds the active look to it', () => {
    const plain = mount(IconButton, { props: { label: 'x' } })
    expect(plain.classes()).not.toContain('icon-button--bordered')
    const on = mount(IconButton, { props: { label: 'x', bordered: true, pressed: true } })
    expect(on.classes()).toEqual(expect.arrayContaining(['icon-button--bordered', 'icon-button--active']))
    expect(on.attributes('aria-pressed')).toBe('true')
    expect(mount(IconButton, { props: { label: 'x', bordered: true, pressed: false } }).attributes('aria-pressed')).toBe('false')
  })

  it('warns when label is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mount(IconButton, { slots: { default: svg } })
    expect(warn.mock.calls.flat().join(' ')).toMatch(/label/)
  })
})
