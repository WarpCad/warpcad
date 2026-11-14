// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TextInput from './TextInput.vue'

describe('TextInput (TODO/ui-115)', () => {
  it('shows the value and emits update:modelValue as the user types', async () => {
    const wrapper = mount(TextInput, { props: { modelValue: 'abc' } })
    const input = wrapper.get('input')
    expect(input.element.value).toBe('abc')
    await input.setValue('abcd')
    expect(wrapper.emitted('update:modelValue')).toEqual([['abcd']])
  })

  it('takes a type, and passes testid and placeholder through to the input', () => {
    const wrapper = mount(TextInput, {
      props: { type: 'password' },
      attrs: { 'data-testid': 'key', placeholder: 'sk-…' },
    })
    expect(wrapper.attributes('type')).toBe('password')
    expect(wrapper.attributes('data-testid')).toBe('key')
    expect(wrapper.attributes('placeholder')).toBe('sk-…')
  })
})
