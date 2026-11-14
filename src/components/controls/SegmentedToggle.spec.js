// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import SegmentedToggle from './SegmentedToggle.vue'

const options = [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: 'z', label: 'Z', disabled: true },
]

/** @param {string} [modelValue] */
const mountToggle = (modelValue = 'x') =>
  mount(SegmentedToggle, { props: { modelValue, options, label: 'Axis', testid: 'axis' }, attachTo: document.body })

describe('SegmentedToggle (TODO/ui-115)', () => {
  it('is a labelled radiogroup of radio buttons, one checked', () => {
    const wrapper = mountToggle('y')
    expect(wrapper.attributes('role')).toBe('radiogroup')
    expect(wrapper.attributes('aria-label')).toBe('Axis')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((r) => r.attributes('aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(radios[1]?.attributes('data-testid')).toBe('axis-y')
  })

  it('roving tabindex: only the chosen option is a Tab stop', () => {
    const radios = mountToggle('y').findAll('[role="radio"]')
    expect(radios.map((r) => r.attributes('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('clicking an option emits it', async () => {
    const wrapper = mountToggle('x')
    await wrapper.get('[data-testid="axis-y"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['y']])
  })

  it('arrow keys move the choice and wrap, skipping a disabled option', async () => {
    const wrapper = mountToggle('x')
    await wrapper.get('[data-testid="axis-x"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['y'])
    await wrapper.get('[data-testid="axis-y"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['x'])
    await wrapper.get('[data-testid="axis-x"]').trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')?.[2]).toEqual(['y'])
  })
})
