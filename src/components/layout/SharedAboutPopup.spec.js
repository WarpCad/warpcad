// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives teleported DOM through `document.body` queries.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import SharedAboutPopup from './SharedAboutPopup.vue'

enableAutoUnmount(afterEach)

/**
 * `TODO/ui-091` — the popup a share or gist link opens with. The text is the sender's, so it is
 * untrusted: rendered as text through the description's Markdown subset, never as HTML.
 */

const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

beforeEach(() => setActivePinia(createPinia()))

describe('SharedAboutPopup', () => {
  it('is a labelled modal dialog showing the description, with focus on View the model', async () => {
    mount(SharedAboutPopup, { props: { open: true, text: 'Fan duct for a **120 mm** fan.\n\n- Print upright\n- Needs *supports*' }, attachTo: document.body })
    await nextTick()
    const dialog = q('shared-about')
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-label')).toBe('About this project')
    expect(q('shared-about-text').querySelector('strong').textContent).toBe('120 mm')
    expect(q('shared-about-text').querySelectorAll('li')).toHaveLength(2)
    expect(document.activeElement).toBe(q('shared-about-close'))
    expect(q('shared-about-close').textContent.trim()).toBe('View the model')
  })

  it('renders nothing when closed', () => {
    mount(SharedAboutPopup, { props: { open: false, text: 'x' }, attachTo: document.body })
    expect(q('shared-about')).toBeNull()
  })

  it('View the model, the backdrop and Escape each ask to close', async () => {
    const wrapper = mount(SharedAboutPopup, { props: { open: true, text: 'x' }, attachTo: document.body })
    await nextTick()
    q('shared-about-close').click()
    q('shared-about-backdrop').click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(3)
  })

  it('shows hostile text as inert characters: no element, no link, no image, no handler', async () => {
    const hostile =
      '<img src=x onerror=alert(1)> [x](javascript:alert(1)) @octocat <script>alert(1)</script> ‮evil <a href="javascript:alert(1)">z</a>'
    mount(SharedAboutPopup, { props: { open: true, text: hostile }, attachTo: document.body })
    await nextTick()
    const body = q('shared-about-body')
    expect(body.querySelector('img, script, a, [onerror]')).toBeNull()
    expect(body.innerHTML).not.toContain('<img')
    expect(body.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(body.textContent).toContain('[x](javascript:alert(1))')
    expect(body.textContent).toContain('@octocat')
    expect(body.textContent).not.toContain('‮')
  })
})
