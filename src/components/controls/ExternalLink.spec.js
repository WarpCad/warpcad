// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ExternalLink from './ExternalLink.vue'

/** @type {any} */
const bridgeGlobal = globalThis

afterEach(() => {
  delete bridgeGlobal.__TAURI_INTERNALS__
  vi.restoreAllMocks()
})

describe('ExternalLink (TODO/build-029)', () => {
  it('is a plain new-tab anchor on the web, and the click is left alone', async () => {
    const wrapper = mount(ExternalLink, { props: { href: 'https://example.com/' }, slots: { default: 'Go' } })
    const a = wrapper.get('a')
    expect(a.attributes()).toMatchObject({ href: 'https://example.com/', target: '_blank', rel: 'noopener noreferrer' })
    expect(a.text()).toBe('Go')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('in the shell, cancels the click and asks the shell to open the page once', async () => {
    const invoke = vi.fn(async () => undefined)
    bridgeGlobal.__TAURI_INTERNALS__ = { invoke }
    const wrapper = mount(ExternalLink, { props: { href: 'https://example.com/a' }, slots: { default: 'Go' } })
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.get('a').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('plugin:opener|open_url', { url: 'https://example.com/a' })
  })
})
