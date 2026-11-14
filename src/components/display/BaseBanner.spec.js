// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseBanner from './BaseBanner.vue'

/** `TODO/ui-117`: the one banner / strip. */
describe('BaseBanner', () => {
  it('shows its text, and the actions and footer slots only when given', () => {
    const bare = mount(BaseBanner, { slots: { default: 'Merged 4 steps' } })
    expect(bare.text()).toBe('Merged 4 steps')
    expect(bare.find('.base-banner__actions').exists()).toBe(false)
    expect(bare.find('.base-banner__footer').exists()).toBe(false)
    const full = mount(BaseBanner, { slots: { default: 'x', actions: '<button>Undo</button>', footer: '<p>refused</p>' } })
    expect(full.find('.base-banner__actions button').text()).toBe('Undo')
    expect(full.find('.base-banner__footer').text()).toBe('refused')
  })

  it('tone and layout are classes, with info and strip as the defaults', () => {
    expect(mount(BaseBanner).classes()).toEqual(expect.arrayContaining(['base-banner--strip', 'base-banner--info']))
    const box = mount(BaseBanner, { props: { tone: 'warn', layout: 'box', truncate: true } })
    expect(box.classes()).toEqual(expect.arrayContaining(['base-banner--box', 'base-banner--warn', 'base-banner--truncate']))
  })

  it('textTestid lands on the text paragraph; other attributes land on the banner', () => {
    const wrapper = mount(BaseBanner, { props: { textTestid: 'merge-banner-text' }, attrs: { 'data-testid': 'merge-banner', role: 'status' }, slots: { default: 'hi' } })
    expect(wrapper.attributes('data-testid')).toBe('merge-banner')
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.find('[data-testid="merge-banner-text"]').text()).toBe('hi')
  })
})
