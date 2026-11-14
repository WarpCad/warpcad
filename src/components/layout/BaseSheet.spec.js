// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives teleported DOM through `document.body` queries.
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'

import { overlayStackDepth, resetOverlayStack } from '../../composables/useOverlayStack.js'
import BaseSheet from './BaseSheet.vue'

enableAutoUnmount(afterEach)
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => resetOverlayStack())

/** `TODO/ui-116`: the one sheet frame, modal or not. */
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const slots = { default: () => [h('button', { 'data-testid': 'first' }, 'one'), h('button', { 'data-testid': 'last' }, 'two')] }
const tab = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))

async function open(props = {}) {
  const wrapper = mount(BaseSheet, { props: { open: true, testid: 'sh', title: 'A sheet', ...props }, slots, attachTo: document.body })
  await nextTick()
  return wrapper
}

describe('BaseSheet', () => {
  it('a modal sheet dims the page, says aria-modal and traps focus', async () => {
    await open({ modal: true })
    expect(q('sh-backdrop')).not.toBeNull()
    expect(q('sh').getAttribute('aria-modal')).toBe('true')
    await nextTick()
    q('last').focus()
    q('last').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(q('first'))
  })

  it('a non-modal sheet (the default) has no backdrop, no aria-modal and no trap', async () => {
    await open()
    expect(q('sh-backdrop')).toBeNull()
    expect(q('sh').getAttribute('aria-modal')).toBeNull()
    expect(q('sh').getAttribute('data-modal')).toBe('false')
    q('last').focus()
    tab()
    // Nothing moved focus: the page keeps its own Tab order.
    expect(document.activeElement).toBe(q('last'))
  })

  it('a non-modal sheet still joins the overlay stack: Escape reaches it', async () => {
    const wrapper = await open()
    escape()
    expect(wrapper.emitted('escape')).toHaveLength(1)
  })

  it('Escape closes the top overlay only', async () => {
    const under = await open({ testid: 'under' })
    const over = await open({ testid: 'over', modal: true })
    escape()
    expect(over.emitted('escape')).toHaveLength(1)
    expect(under.emitted('escape')).toBeUndefined()
  })

  it('takes side and card as classes, a tier for its layer, and the frame element', async () => {
    await open({ side: 'right', card: true, tier: 'help', as: 'form' })
    const frame = q('sh')
    expect(frame.tagName).toBe('FORM')
    expect(frame.classList.contains('sheet--right')).toBe(true)
    expect(frame.classList.contains('sheet--card')).toBe(true)
    expect(frame.style.getPropertyValue('--layout-sheet-z-frame')).toBe('var(--z-help-frame)')
  })


  it('a modal sheet takes a clear scrim: it still catches the click but does not dim', async () => {
    const wrapper = await open({ modal: true, scrim: 'clear' })
    const backdrop = q('sh-backdrop')
    expect(backdrop.classList.contains('sheet__backdrop--clear')).toBe(true)
    backdrop.click()
    expect(wrapper.emitted('backdrop')).toHaveLength(1)
    await wrapper.setProps({ scrim: 'dim' })
    expect(q('sh-backdrop').classList.contains('sheet__backdrop--clear')).toBe(false)
  })

  it('opts out of the overlay stack when told not to: Escape never reaches it', async () => {
    const wrapper = await open({ stack: false })
    escape()
    expect(wrapper.emitted('escape')).toBeUndefined()
    expect(overlayStackDepth()).toBe(0)
  })

  it('the dock tier is the --z-dock layer, for both the frame and the backdrop', async () => {
    await open({ tier: 'dock' })
    expect(q('sh').style.getPropertyValue('--layout-sheet-z-frame')).toBe('var(--z-dock)')
    expect(q('sh').style.getPropertyValue('--layout-sheet-z')).toBe('var(--z-dock)')
  })

  it('anchors a card where the caller says, and defaults to the top-right corner', async () => {
    await open({ card: true, top: '90px', right: '20px' })
    expect(q('sh').style.getPropertyValue('--layout-sheet-top')).toBe('90px')
    expect(q('sh').style.getPropertyValue('--layout-sheet-right')).toBe('20px')
  })

  it('draws a header with the ? only when it has a help topic', async () => {
    const wrapper = await open({ helpTopic: 'gist' })
    expect(document.body.querySelector('.sheet__help')).not.toBeNull()
    await wrapper.setProps({ helpTopic: '' })
    expect(document.body.querySelector('.sheet__head')).toBeNull()
  })

  it('does not teleport when told not to', async () => {
    const wrapper = mount(BaseSheet, { props: { open: true, testid: 'docked', title: 'Docked', teleport: false }, slots })
    await nextTick()
    expect(wrapper.find('[data-testid="docked"]').exists()).toBe(true)
  })
})
