// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import VisuallyHidden from './VisuallyHidden.vue'

/** `TODO/ui-117`: assistive-technology-only text. */
describe('VisuallyHidden', () => {
  it('is a span carrying .visually-hidden, with its text in the DOM', () => {
    const wrapper = mount(VisuallyHidden, { slots: { default: 'My parts' } })
    expect(wrapper.element.tagName).toBe('SPAN')
    expect(wrapper.classes()).toContain('visually-hidden')
    expect(wrapper.text()).toBe('My parts')
  })

  it('as picks the element', () => {
    expect(mount(VisuallyHidden, { props: { as: 'p' } }).element.tagName).toBe('P')
  })
})
