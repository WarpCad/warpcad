// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SelectInput from './SelectInput.vue'

describe('SelectInput (TODO/ui-115)', () => {
  it('is a native select that shows the model value and emits the chosen one', async () => {
    const wrapper = mount(SelectInput, {
      props: { modelValue: 'y' },
      slots: { default: '<option value="x">X</option><option value="y">Y</option>' },
      attrs: { 'data-testid': 'axis' },
    })
    expect(wrapper.element.tagName).toBe('SELECT')
    expect(wrapper.attributes('data-testid')).toBe('axis')
    expect(/** @type {HTMLSelectElement} */ (wrapper.element).value).toBe('y')
    await wrapper.setValue('x')
    expect(wrapper.emitted('update:modelValue')).toEqual([['x']])
  })
})
