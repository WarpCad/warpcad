// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives teleported DOM through `document.body` queries.
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'

import { resetOverlayStack } from '../../composables/useOverlayStack.js'
import BasePopover from './BasePopover.vue'

enableAutoUnmount(afterEach)
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => resetOverlayStack())

/** `TODO/ui-116`: the one popover frame. */
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const slots = { default: () => h('p', { 'data-testid': 'inside' }, 'hello') }
const press = (target) => target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))

async function open(props = {}) {
  const anchor = document.createElement('button')
  anchor.setAttribute('data-testid', 'anchor')
  document.body.append(anchor)
  const wrapper = mount(BasePopover, { props: { open: true, testid: 'pop', title: 'Pop', anchor, ...props }, slots, attachTo: document.body })
  await nextTick()
  await nextTick()
  return { wrapper, anchor }
}

describe('BasePopover', () => {
  it('is a labelled, non-modal dialog with no backdrop', async () => {
    await open()
    expect(q('pop').getAttribute('role')).toBe('dialog')
    expect(q('pop').getAttribute('aria-modal')).toBeNull()
    expect(q('pop-backdrop')).toBeNull()
  })

  it('closes on a press outside, and not on a press inside or on its anchor', async () => {
    const { wrapper, anchor } = await open()
    press(q('inside'))
    press(anchor)
    expect(wrapper.emitted('close')).toBeUndefined()
    press(document.body)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes on Escape', async () => {
    const { wrapper } = await open()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('is placed from a rect anchor', async () => {
    await open({ anchor: { left: 100, top: 40, right: 160, bottom: 70 } })
    expect(q('pop').style.left).toBe('100px')
    expect(q('pop').style.top).toBe('76px')
  })

  it('modal adds a backdrop that closes it, and stops the outside-press listener', async () => {
    const { wrapper } = await open({ modal: true })
    press(document.body)
    expect(wrapper.emitted('close')).toBeUndefined()
    q('pop-backdrop').click()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('draggable renders the grip and marks the frame; without it there is no grip', async () => {
    const { wrapper } = await open({ draggable: true })
    expect(q('popover-grip')).not.toBeNull()
    expect(q('pop').hasAttribute('data-popover-frame')).toBe(true)
    await wrapper.setProps({ draggable: false })
    expect(q('popover-grip')).toBeNull()
  })
})
