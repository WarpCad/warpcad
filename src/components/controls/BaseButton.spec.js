// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseButton from './BaseButton.vue'

describe('BaseButton (TODO/ui-114)', () => {
  it('renders a type="button" button with its slot', () => {
    const wrapper = mount(BaseButton, { slots: { default: 'Save' } })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.text()).toBe('Save')
  })

  it('lets a form button say type="submit"', () => {
    expect(mount(BaseButton, { attrs: { type: 'submit' } }).attributes('type')).toBe('submit')
  })

  it.each(['default', 'primary', 'danger', 'quiet', 'link', 'link-danger'])('variant %s renders its class', (variant) => {
    expect(mount(BaseButton, { props: { variant } }).classes()).toContain(`base-button--${variant}`)
  })

  it.each(['tap', 'compact', 'large'])('size %s renders its class', (size) => {
    expect(mount(BaseButton, { props: { size } }).classes()).toContain(`base-button--${size}`)
  })

  it('defaults to the default variant and tap size', () => {
    const classes = mount(BaseButton).classes()
    expect(classes).toContain('base-button--default')
    expect(classes).toContain('base-button--tap')
  })

  it('align="start" and fill add their classes', () => {
    const classes = mount(BaseButton, { props: { align: 'start', fill: true, narrow: true } }).classes()
    expect(classes).toContain('base-button--start')
    expect(classes).toContain('base-button--fill')
    expect(classes).toContain('base-button--narrow')
  })

  it('passes data-testid and listeners through, and a click fires', async () => {
    let clicks = 0
    const wrapper = mount(BaseButton, { attrs: { 'data-testid': 'x', onClick: () => clicks++ } })
    expect(wrapper.attributes('data-testid')).toBe('x')
    await wrapper.trigger('click')
    expect(clicks).toBe(1)
  })

  it('disabled blocks the click', async () => {
    let clicks = 0
    const wrapper = mount(BaseButton, { props: { disabled: true }, attrs: { onClick: () => clicks++ } })
    expect(wrapper.attributes('disabled')).toBeDefined()
    await wrapper.trigger('click')
    expect(clicks).toBe(0)
  })

  it('pressed sets aria-pressed and the active class; unset leaves aria-pressed off', () => {
    const on = mount(BaseButton, { props: { pressed: true } })
    expect(on.attributes('aria-pressed')).toBe('true')
    expect(on.classes()).toContain('base-button--active')
    const off = mount(BaseButton, { props: { pressed: false } })
    expect(off.attributes('aria-pressed')).toBe('false')
    expect(mount(BaseButton).attributes('aria-pressed')).toBeUndefined()
  })

  it('exposes focus() so a caller\'s ref can focus the button', () => {
    const wrapper = mount(BaseButton, { attachTo: document.body })
    wrapper.vm.focus()
    expect(document.activeElement).toBe(wrapper.element)
    wrapper.unmount()
  })
})
