// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import NumberField from './NumberField.vue'

enableAutoUnmount(afterEach)

/** @param {Record<string, unknown>} [props] */
function field(props = {}) {
  const wrapper = mount(NumberField, { props: { modelValue: 10, unit: 'mm', ...props }, attachTo: document.body })
  const input = /** @type {import('@vue/test-utils').DOMWrapper<HTMLInputElement>} */ (wrapper.get('input'))
  /** @param {string} text */
  const type = async (text) => {
    await input.trigger('focus')
    input.element.value = text
    await input.trigger('input')
  }
  /** @returns {(number | null)[]} */
  const emitted = () => (wrapper.emitted('update:modelValue') ?? []).map((args) => /** @type {number} */ (args[0]))
  return { wrapper, input, type, emitted }
}

describe('NumberField (TODO/ui-115)', () => {
  it('is a text input with a decimal keypad, never a native number input', () => {
    const { input } = field()
    expect(input.attributes('type')).toBe('text')
    expect(input.attributes('inputmode')).toBe('decimal')
    expect(input.element.value).toBe('10')
  })

  it('uses a whole-number keypad for an integer field', () => {
    expect(field({ integer: true }).input.attributes('inputmode')).toBe('numeric')
  })

  it('passes data-testid, aria-label and class through to the input itself', () => {
    const wrapper = mount(NumberField, {
      props: { modelValue: 1 },
      attrs: { 'data-testid': 'x', 'aria-label': 'Radius', class: 'mine' },
    })
    const input = wrapper.get('input')
    expect(input.attributes('data-testid')).toBe('x')
    expect(input.attributes('aria-label')).toBe('Radius')
    expect(input.classes()).toContain('mine')
  })

  /** @type {[string, string, number][]} */
  const accepted = [
    ['12.5', 'mm', 12.5],
    ['12,5', 'mm', 12.5],
    ['12.5 mm', 'mm', 12.5],
    ['45°', 'deg', 45],
    ['-3', 'mm', -3],
    ['1e3', 'mm', 1000],
  ]
  for (const [text, unit, expected] of accepted) {
    it(`commits "${text}" as ${expected} on blur`, async () => {
      const { input, type, emitted } = field({ unit })
      await type(text)
      await input.trigger('blur')
      expect(emitted()).toHaveLength(1)
      expect(/** @type {number} */ (emitted()[0])).toBeCloseTo(expected, 9)
    })
  }

  for (const text of ['-', '', 'abc', 'Infinity', '12..5']) {
    it(`restores the old value on "${text}" and emits nothing`, async () => {
      const { input, type, emitted } = field()
      await type(text)
      await input.trigger('blur')
      expect(emitted()).toEqual([])
      expect(input.element.value).toBe('10')
    })
  }

  it('commits once on Enter and not again on the blur that follows', async () => {
    const { input, type, emitted } = field()
    await type('7')
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('blur')
    expect(emitted()).toEqual([7])
  })

  it('commits once on blur', async () => {
    const { input, type, emitted } = field()
    await type('8')
    await input.trigger('blur')
    await input.trigger('blur')
    expect(emitted()).toEqual([8])
  })

  it('does not emit when the text parses to the value it already has', async () => {
    const { input, type, emitted } = field({ modelValue: 12.5 })
    await type('12,5 mm')
    await input.trigger('blur')
    expect(emitted()).toEqual([])
  })

  it('clamps to min and max', async () => {
    const low = field({ min: 1, max: 20 })
    await low.type('-5')
    await low.input.trigger('blur')
    expect(low.emitted()).toEqual([1])
    const high = field({ min: 1, max: 20 })
    await high.type('99')
    await high.input.trigger('blur')
    expect(high.emitted()).toEqual([20])
    // As a v-model parent would: the clamped value comes back in.
    await high.wrapper.setProps({ modelValue: 20 })
    expect(high.input.element.value).toBe('20')
  })

  it('an integer field refuses a fraction and restores', async () => {
    const { input, type, emitted } = field({ integer: true, modelValue: 6 })
    await type('6.5')
    await input.trigger('blur')
    expect(emitted()).toEqual([])
    expect(input.element.value).toBe('6')
    await type('8')
    await input.trigger('blur')
    expect(emitted()).toEqual([8])
  })

  it('Escape restores the old text, emits nothing, and a blur after it commits nothing', async () => {
    const { input, type, emitted } = field()
    await type('77')
    await input.trigger('keydown', { key: 'Escape' })
    expect(input.element.value).toBe('10')
    await input.trigger('blur')
    expect(emitted()).toEqual([])
  })

  it('arrow keys step, Shift steps by ten', async () => {
    const { input, emitted } = field({ modelValue: 10, step: 0.5 })
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'ArrowUp' })
    await input.trigger('keydown', { key: 'ArrowUp' })
    await input.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    const values = emitted()
    expect(values[0]).toBeCloseTo(10.5, 9)
    expect(values[1]).toBeCloseTo(11, 9)
    expect(values[2]).toBeCloseTo(6, 9)
  })

  it('arrow keys do not float-drift (0.1 steps)', async () => {
    const { input, emitted } = field({ modelValue: 0.1, step: 0.1 })
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(/** @type {number} */ (emitted()[0])).toBeCloseTo(0.2, 12)
    expect(input.element.value).toBe('0.2')
  })

  it('arrow keys stay inside min and max', async () => {
    const { input, emitted } = field({ modelValue: 1, min: 1, max: 2, step: 5 })
    await input.trigger('focus')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(emitted()).toEqual([])
    await input.trigger('keydown', { key: 'ArrowUp' })
    expect(emitted()).toEqual([2])
  })

  it('selects all on focus', async () => {
    const { input } = field()
    await input.trigger('focus')
    expect(input.element.selectionStart).toBe(0)
    expect(input.element.selectionEnd).toBe(2)
  })

  it('a nullable field commits blank as null (Auto), and shows the placeholder for null', async () => {
    const { input, type, emitted } = field({ nullable: true, modelValue: 4, placeholder: 'Auto' })
    await type('  ')
    await input.trigger('blur')
    expect(emitted()).toEqual([null])
    const empty = field({ nullable: true, modelValue: null, placeholder: 'Auto' })
    expect(empty.input.element.value).toBe('')
    expect(empty.input.attributes('placeholder')).toBe('Auto')
  })

  it('live emits valid numbers while typing, never a blank or half-typed one', async () => {
    const { type, emitted } = field({ live: true })
    await type('1')
    await type('12')
    await type('12,')
    await type('-')
    await type('')
    expect(emitted()).toEqual([1, 12])
  })

  it('live on a nullable field emits null as soon as it is cleared', async () => {
    const { type, emitted } = field({ live: true, nullable: true, modelValue: 4 })
    await type('')
    expect(emitted()).toEqual([null])
  })

  it('live does not emit an out-of-range number mid-typing, but blur still clamps it', async () => {
    const { input, type, emitted } = field({ live: true, min: 6, max: 30 })
    await type('1')
    expect(emitted()).toEqual([])
    await input.trigger('blur')
    expect(emitted()).toEqual([6])
  })

  it('a readonly field does not commit', async () => {
    const { input, type, emitted } = field({ readonly: true })
    await type('5')
    await input.trigger('blur')
    expect(emitted()).toEqual([])
  })

  it('shows an outside change when idle, and an outside change wins over text still being typed', async () => {
    const { wrapper, input, type } = field({ modelValue: 10 })
    await wrapper.setProps({ modelValue: 25 })
    expect(input.element.value).toBe('25')
    await type('3')
    await wrapper.setProps({ modelValue: 40 })
    expect(input.element.value).toBe('40')
  })

  it('does not overwrite typing with the echo of its own live emit', async () => {
    const { wrapper, input, type } = field({ modelValue: 10, live: true })
    await type('12,')
    await wrapper.setProps({ modelValue: 12 })
    expect(input.element.value).toBe('12,')
  })

  it('marks itself invalid for assistive tech', () => {
    expect(field({ invalid: true }).input.attributes('aria-invalid')).toBe('true')
  })

  it('formats a millimetre value without float noise', () => {
    expect(field({ modelValue: 0.1 + 0.2 }).input.element.value).toBe('0.3')
  })
})
