// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useHelpStore } from '../stores/help.js'
import { useHelpShortcut } from './useHelpShortcut.js'

/** @type {ReturnType<typeof mount> | null} */
let wrapper = null

beforeEach(() => {
  setActivePinia(createPinia())
  wrapper = mount(defineComponent({ setup() { useHelpShortcut(); return () => h('div') } }))
})
afterEach(() => wrapper?.unmount())

/** @param {Partial<KeyboardEventInit> & { target?: Element }} init */
function press(init) {
  const { target, ...rest } = init
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...rest })
  ;(target ?? document.body).dispatchEvent(event)
  return event
}

describe('? and F1 open help (TODO/ui-061)', () => {
  it('? opens Getting started, and again closes it', () => {
    const help = useHelpStore()
    press({ key: '?', shiftKey: true })
    expect(help.isOpen).toBe(true)
    expect(help.page).toBe('getting-started')
    press({ key: '?', shiftKey: true })
    expect(help.isOpen).toBe(false)
  })

  it('F1 opens it and suppresses the browser help', () => {
    const help = useHelpStore()
    const event = press({ key: 'F1' })
    expect(help.isOpen).toBe(true)
    expect(event.defaultPrevented).toBe(true)
  })

  it('is ignored while a text field has focus', () => {
    const help = useHelpStore()
    const input = document.createElement('input')
    document.body.append(input)
    press({ key: '?', shiftKey: true, target: input })
    expect(help.isOpen).toBe(false)
    input.remove()
  })

  it('is ignored with Ctrl, Cmd or Alt held', () => {
    const help = useHelpStore()
    press({ key: '?', ctrlKey: true })
    press({ key: '?', metaKey: true })
    press({ key: '?', altKey: true })
    expect(help.isOpen).toBe(false)
  })
})
