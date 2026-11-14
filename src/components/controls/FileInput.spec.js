// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import FileInput from './FileInput.vue'

describe('FileInput (TODO/ui-115)', () => {
  it('is a file input kept out of the tab order and the layout', () => {
    const wrapper = mount(FileInput, { attrs: { accept: '.stl', 'data-testid': 'pick' } })
    expect(wrapper.attributes('type')).toBe('file')
    expect(wrapper.attributes('tabindex')).toBe('-1')
    expect(wrapper.attributes('accept')).toBe('.stl')
    expect(wrapper.attributes('data-testid')).toBe('pick')
    expect(wrapper.classes()).toContain('file-input')
  })

  it('open() clicks the input', () => {
    const wrapper = mount(FileInput)
    const click = vi.spyOn(/** @type {HTMLInputElement} */ (wrapper.element), 'click')
    wrapper.vm.open()
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('emits the chosen files once and clears the input so the same file can be chosen again', async () => {
    const wrapper = mount(FileInput)
    const file = new File(['x'], 'a.stl')
    const input = /** @type {HTMLInputElement} */ (wrapper.element)
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await wrapper.trigger('change')
    expect(wrapper.emitted('change')).toEqual([[[file]]])
    expect(input.value).toBe('')
  })
})
