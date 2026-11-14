// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SectionHeading from './SectionHeading.vue'

/** `TODO/ui-117`: the one small uppercase section heading. */
describe('SectionHeading', () => {
  it('is an h3 by default, and level picks the element', () => {
    expect(mount(SectionHeading, { slots: { default: 'Color' } }).element.tagName).toBe('H3')
    expect(mount(SectionHeading, { props: { level: 2 }, slots: { default: 'Inspector' } }).element.tagName).toBe('H2')
  })

  it('shows its text and lets a class and data-testid land on the heading', () => {
    const heading = mount(SectionHeading, { attrs: { class: 'inspector__heading', 'data-testid': 'library-heading-user' }, slots: { default: 'My parts' } })
    expect(heading.text()).toBe('My parts')
    expect(heading.classes()).toEqual(expect.arrayContaining(['section-heading', 'inspector__heading']))
    expect(heading.attributes('data-testid')).toBe('library-heading-user')
  })
})
