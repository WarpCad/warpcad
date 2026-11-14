// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseToast from './BaseToast.vue'

/** `TODO/ui-117`: the one floating pill. */
describe('BaseToast', () => {
  it('is a status by default and an alert for danger', () => {
    expect(mount(BaseToast, { slots: { default: 'Saved' } }).attributes('role')).toBe('status')
    const danger = mount(BaseToast, { props: { tone: 'danger' }, slots: { default: 'Failed' } })
    expect(danger.attributes('role')).toBe('alert')
    expect(danger.attributes('data-tone')).toBe('danger')
  })

  it('shows its text and its action slot, and only marks itself interactive with an action', () => {
    const plain = mount(BaseToast, { slots: { default: 'Saved' } })
    expect(plain.text()).toBe('Saved')
    expect(plain.attributes('data-interactive')).toBeUndefined()
    const withAction = mount(BaseToast, { slots: { default: 'Saved', action: '<button>Copy</button>' } })
    expect(withAction.find('button').exists()).toBe(true)
    expect(withAction.attributes('data-interactive')).toBe('true')
  })

  it('passes data-testid through to the toast', () => {
    expect(mount(BaseToast, { attrs: { 'data-testid': 'share-toast' } }).attributes('data-testid')).toBe('share-toast')
  })
})
