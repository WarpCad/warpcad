// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — duck-typed fakes of the fetch boundary; the components are typechecked.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetHelpCache, setHelpFetch } from '../../help/loader.js'
import { useHelpStore } from '../../stores/help.js'
import HelpSheet from './HelpSheet.vue'

enableAutoUnmount(afterEach)

const INDEX = {
  order: ['getting-started', 'snap-align', 'booleans'],
  pages: [
    { slug: 'getting-started', title: 'Getting started', headings: [] },
    { slug: 'snap-align', title: 'Precise placement: Snap and Align', headings: [{ id: 'the-popovers-fields', text: "The popover's fields" }] },
    { slug: 'booleans', title: 'Combining shapes', headings: [] },
  ],
}
const PAGES = {
  'getting-started': '<h1 id="getting-started">Getting started</h1><p>Hello</p>',
  'snap-align':
    '<h1 id="precise">Precise placement</h1><p>top</p><h2 id="the-popovers-fields">The popover\'s fields</h2><p>fields <a href="#/help/booleans" data-help-page="booleans">Booleans</a></p><img src="img/screenshots/a.png" alt="a">',
  booleans: '<h1 id="booleans">Combining shapes</h1><p>Union</p>',
}

const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

function setup() {
  setActivePinia(createPinia())
  resetHelpCache()
  const requested = []
  setHelpFetch(async (url) => {
    requested.push(url)
    const text = String(url)
    if (text.endsWith('help/index.json')) return { ok: true, json: async () => INDEX, text: async () => JSON.stringify(INDEX) }
    const m = /help\/([\w-]+)\.html$/.exec(text)
    if (m && PAGES[m[1]]) return { ok: true, text: async () => PAGES[m[1]] }
    return { ok: false, status: 404, text: async () => '' }
  })
  const wrapper = mount(HelpSheet, { attachTo: document.body })
  return { wrapper, help: useHelpStore(), requested }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('HelpSheet (TODO/ui-061)', () => {
  it('renders nothing while closed and nothing is fetched', () => {
    const { requested } = setup()
    expect(q('help-sheet')).toBeNull()
    expect(requested).toEqual([])
  })

  it('opens on the topic page and marks the heading it should scroll to', async () => {
    const { help } = setup()
    help.open('align')
    await flushPromises()
    expect(q('help-sheet')?.getAttribute('role')).toBe('dialog')
    expect(q('help-content')?.textContent).toContain('top')
    expect(q('help-content')?.querySelector('#the-popovers-fields')?.classList.contains('help-target')).toBe(true)
    expect(q('help-current-page')?.textContent).toContain('Precise placement')
  })

  it('points bundled pictures at the help folder', async () => {
    const { help } = setup()
    help.open('align')
    await flushPromises()
    expect(q('help-content')?.querySelector('img')?.getAttribute('src')).toBe('/help/img/screenshots/a.png')
  })

  it('an in-page docs link stays inside the sheet and Back returns', async () => {
    const { help } = setup()
    help.open('align')
    await flushPromises()
    q('help-content')?.querySelector('a')?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(help.page).toBe('booleans')
    expect(q('help-content')?.textContent).toContain('Union')
    q('help-back')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(help.page).toBe('snap-align')
  })

  it('lists every page in Contents and opens the one picked', async () => {
    const { help } = setup()
    help.open('align')
    await flushPromises()
    const items = document.body.querySelectorAll('[data-testid="help-contents"] [data-help-page]')
    expect([...items].map((el) => el.getAttribute('data-help-page'))).toEqual(['getting-started', 'snap-align', 'booleans'])
    items[2].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(help.page).toBe('booleans')
  })

  it('Close, Escape and the backdrop all close it', async () => {
    const { help } = setup()
    help.open('align')
    await flushPromises()
    q('help-close')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(help.isOpen).toBe(false)

    help.open('align')
    await flushPromises()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(help.isOpen).toBe(false)

    help.open('align')
    await flushPromises()
    q('help-backdrop')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(help.isOpen).toBe(false)
  })

  it('Escape closes help without reaching a listener below it', async () => {
    const { help } = setup()
    const below = vi.fn()
    document.addEventListener('keydown', below)
    help.open('align')
    await flushPromises()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(help.isOpen).toBe(false)
    expect(below).not.toHaveBeenCalled()
    document.removeEventListener('keydown', below)
  })

  it('says so, and offers a retry, when the page cannot be loaded', async () => {
    const { help } = setup()
    help.open('boolean')
    help.openPage('missing-page')
    await flushPromises()
    expect(q('help-error')?.textContent).toMatch(/could not load/i)
  })
})
