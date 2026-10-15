// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useHelpStore } from '../../stores/help.js'
import HelpButton from './HelpButton.vue'

enableAutoUnmount(afterEach)
beforeEach(() => setActivePinia(createPinia()))

describe('HelpButton (TODO/ui-061)', () => {
  it('is a labelled test-id button named for the tool', () => {
    const wrapper = mount(HelpButton, { props: { topic: 'align' } })
    const button = wrapper.get('[data-testid="help-align"]')
    expect(button.element.tagName).toBe('BUTTON')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-label')).toBe('Help: Align')
  })

  it('opens the help store on its topic when pressed', async () => {
    const help = useHelpStore()
    const wrapper = mount(HelpButton, { props: { topic: 'mirror' } })
    await wrapper.get('button').trigger('click')
    expect(help.isOpen).toBe(true)
    expect(help.topic).toBe('mirror')
  })

  it('is never disabled, even when the tool it documents is', () => {
    const wrapper = mount(HelpButton, { props: { topic: 'snap' } })
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })

  it('a tool name can be passed when the topic title is not what the surface calls itself', () => {
    const wrapper = mount(HelpButton, { props: { topic: 'fillet', label: 'Fillet and Chamfer' } })
    expect(wrapper.get('button').attributes('aria-label')).toBe('Help: Fillet and Chamfer')
  })
})
