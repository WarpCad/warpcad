// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BaseChip from './BaseChip.vue'

/** `TODO/ui-117`: the one pill chip. */
describe('BaseChip', () => {
  it('is a span with the plain tone and md size by default, and shows its text', () => {
    const chip = mount(BaseChip, { slots: { default: 'suppressed' } })
    expect(chip.element.tagName).toBe('SPAN')
    expect(chip.classes()).toEqual(expect.arrayContaining(['base-chip--plain', 'base-chip--md']))
    expect(chip.text()).toBe('suppressed')
    expect(chip.find('.base-chip__dot').exists()).toBe(false)
  })

  it('as="button" is a real button of type button, and listeners fall through', async () => {
    const chip = mount(BaseChip, { props: { as: 'button' }, slots: { default: 'MCP access' } })
    expect(chip.element.tagName).toBe('BUTTON')
    expect(chip.attributes('type')).toBe('button')
    await chip.trigger('click')
    expect(chip.emitted('click')).toHaveLength(1)
  })

  it('dot adds an aria-hidden dot with its tone, and pulse animates it', () => {
    const chip = mount(BaseChip, { props: { dot: true, dotTone: 'warn', pulse: true } })
    const dot = chip.find('.base-chip__dot')
    expect(dot.classes()).toEqual(expect.arrayContaining(['base-chip__dot--warn', 'base-chip__dot--pulse']))
    expect(dot.attributes('aria-hidden')).toBe('true')
  })

  it('the leading slot replaces the dot', () => {
    const chip = mount(BaseChip, { props: { dot: true }, slots: { leading: '<i class="track" />' } })
    expect(chip.find('.track').exists()).toBe(true)
    expect(chip.find('.base-chip__dot').exists()).toBe(false)
  })

  it('tone, size and dashed are classes, and data-testid, role and title land on the chip', () => {
    const chip = mount(BaseChip, { props: { tone: 'danger', size: 'sm', dashed: true }, attrs: { 'data-testid': 'chip-broken', role: 'status', title: 'why' } })
    expect(chip.classes()).toEqual(expect.arrayContaining(['base-chip--danger', 'base-chip--sm', 'base-chip--dashed']))
    expect(chip.attributes('data-testid')).toBe('chip-broken')
    expect(chip.attributes('role')).toBe('status')
    expect(chip.attributes('title')).toBe('why')
  })
})
