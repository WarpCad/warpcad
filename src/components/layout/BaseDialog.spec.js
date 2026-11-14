// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives teleported DOM through `document.body` queries.
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'

import { resetOverlayStack } from '../../composables/useOverlayStack.js'
import BaseDialog from './BaseDialog.vue'

enableAutoUnmount(afterEach)
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => resetOverlayStack())

/** `TODO/ui-116`: the one modal frame. */
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const body = () => ({ default: () => [h('button', { 'data-testid': 'first' }, 'one'), h('button', { 'data-testid': 'last' }, 'two')] })

/** @param {Record<string, unknown>} props */
async function open(props = {}) {
  const wrapper = mount(BaseDialog, { props: { open: true, testid: 'dlg', title: 'Hello', ...props }, slots: body(), attachTo: document.body })
  await nextTick()
  return wrapper
}

describe('BaseDialog', () => {
  it('is a labelled modal dialog with a dimming backdrop', async () => {
    await open()
    expect(q('dlg').getAttribute('role')).toBe('dialog')
    expect(q('dlg').getAttribute('aria-modal')).toBe('true')
    expect(q('dlg').getAttribute('aria-label')).toBe('Hello')
    expect(q('dlg-backdrop')).not.toBeNull()
  })

  it('renders nothing when closed', async () => {
    await open({ open: false })
    expect(q('dlg')).toBeNull()
    expect(q('dlg-backdrop')).toBeNull()
  })

  it('traps focus: Tab from the last control wraps to the first', async () => {
    await open()
    await nextTick()
    q('last').focus()
    q('last').dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(q('first'))
  })

  it('emits backdrop when the backdrop is clicked', async () => {
    const wrapper = await open()
    q('dlg-backdrop').click()
    expect(wrapper.emitted('backdrop')).toHaveLength(1)
  })

  it('emits escape only when escapable, and only for the top overlay', async () => {
    const quiet = await open()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(quiet.emitted('escape')).toBeUndefined()
    quiet.unmount()

    const wrapper = await open({ escapable: true })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(wrapper.emitted('escape')).toHaveLength(1)
  })

  it('carries tone, placement, width and the title test id, and passes other attributes to the dialog', async () => {
    await open({ tone: 'danger', placement: 'center', width: '560px', titleTestid: 'dlg-title', 'data-layout': 'modal' })
    expect(q('dlg').classList.contains('modal--danger')).toBe(true)
    expect(q('dlg').classList.contains('modal--center')).toBe(true)
    expect(q('dlg').style.getPropertyValue('--layout-modal-width')).toBe('560px')
    expect(q('dlg-title').textContent).toBe('Hello')
    expect(q('dlg').getAttribute('data-layout')).toBe('modal')
    expect(q('dlg-backdrop').getAttribute('data-layout')).toBeNull()
  })

  it('shows the ? only with a help topic', async () => {
    const wrapper = await open({ helpTopic: 'gist' })
    expect(document.body.querySelector('.modal__help')).not.toBeNull()
    await wrapper.setProps({ helpTopic: '' })
    expect(document.body.querySelector('.modal__help')).toBeNull()
  })
})
