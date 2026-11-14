// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives teleported DOM through `document.body` queries.
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useToastsStore } from '../../stores/toasts.js'
import ToastHost from './ToastHost.vue'

enableAutoUnmount(afterEach)
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  document.body.innerHTML = ''
})

/** `TODO/ui-117`: the toast host renders the queue, stacked, and gives danger `role="alert"`. */
const all = (id) => [...document.body.querySelectorAll(`[data-testid="${id}"]`)]

describe('ToastHost', () => {
  it('renders nothing visible for an empty queue, and every toast of a full one in order', async () => {
    mount(ToastHost, { attachTo: document.body })
    const toasts = useToastsStore()
    expect(document.body.querySelectorAll('[data-toast]')).toHaveLength(0)
    toasts.show({ text: 'Link copied, 2.3 KB', testid: 'share-toast', key: 'share' })
    toasts.show({ text: 'Saved Standoff', testid: 'library-toast', key: 'library' })
    await nextTick()
    const rows = [...document.body.querySelectorAll('[data-toast]')]
    expect(rows.map((r) => r.textContent.trim())).toEqual(['Link copied, 2.3 KB', 'Saved Standoff'])
    expect(all('share-toast')).toHaveLength(1)
    expect(all('library-toast')).toHaveLength(1)
  })

  it('status for a normal toast, alert for danger', async () => {
    mount(ToastHost, { attachTo: document.body })
    const toasts = useToastsStore()
    toasts.show({ text: 'fine', testid: 'ok' })
    toasts.show({ text: 'broke', tone: 'danger', testid: 'bad' })
    await nextTick()
    expect(all('ok')[0].getAttribute('role')).toBe('status')
    expect(all('bad')[0].getAttribute('role')).toBe('alert')
  })

  it('an action renders as a button that runs it, and a link field renders as a read-only input', async () => {
    mount(ToastHost, { attachTo: document.body })
    const toasts = useToastsStore()
    const run = vi.fn()
    toasts.show({ text: 'Saved to gist', testid: 'g', action: { label: 'Copy link', testid: 'g-copy', run } })
    await nextTick()
    all('g-copy')[0].click()
    expect(run).toHaveBeenCalledTimes(1)
    toasts.update(toasts.items[0].key ?? toasts.items[0].id, { action: null, link: { value: 'https://x/y', label: 'The link', testid: 'g-link' } })
    await nextTick()
    expect(all('g-copy')).toHaveLength(0)
    expect(all('g-link')[0].value).toBe('https://x/y')
    expect(all('g-link')[0].readOnly).toBe(true)
  })

  it('a toast leaves the DOM when the queue drops it', async () => {
    mount(ToastHost, { attachTo: document.body })
    const toasts = useToastsStore()
    const id = toasts.show({ text: 'gone soon', testid: 't' })
    await nextTick()
    expect(all('t')).toHaveLength(1)
    toasts.dismiss(id)
    await nextTick()
    expect(all('t')).toHaveLength(0)
  })
})
