// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FieldLabel from './FieldLabel.vue'

describe('FieldLabel (TODO/ui-115)', () => {
  it('is a label wrapping its text and its control', () => {
    const wrapper = mount(FieldLabel, { slots: { default: 'Width <input data-testid="w" />' } })
    expect(wrapper.element.tagName).toBe('LABEL')
    expect(wrapper.text()).toContain('Width')
    expect(wrapper.find('[data-testid="w"]').exists()).toBe(true)
  })

  it('has a small variant', () => {
    expect(mount(FieldLabel).classes()).not.toContain('field-label--small')
    expect(mount(FieldLabel, { props: { small: true } }).classes()).toContain('field-label--small')
  })
})
