// @vitest-environment jsdom
// @ts-nocheck
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

enableAutoUnmount(afterEach)

import { useFileMenuStore } from '../../stores/fileMenu.js'
import { setHostedDependencies } from '../../stores/hosted.js'
import { setPersistenceDependencies, usePersistenceStore } from '../../stores/persistence.js'
import SaveStatus from './SaveStatus.vue'

/**
 * `TODO/ui-033` — the chip is a plain status element normally, and becomes a real button that
 * opens the File menu exactly while it is showing an error (`interaction-model-qa.md` §8: the
 * menu's Save/Download item is the user's escape hatch when browser storage is failing).
 */
describe('SaveStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    setPersistenceDependencies({
      backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
      files: {
        capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
        async save() { return { ok: true, mode: 'fallback', name: 'a.ndjson' } },
        async open() { return { ok: false, cancelled: true } },
        adopt() {},
        forgetHandle() {},
      },
    })
    setHostedDependencies({
      client: { apiOrigin: 'https://api.github.com', async read() { return { exists: false, sha: null, text: null } }, async write() { return { sha: 's' } } },
      credentials: { async read() { return null }, async write() {}, async clear() {}, close() {} },
    })
  })

  it('is a status region, not a button, while nothing is wrong — and clicking it does nothing', async () => {
    const wrapper = mount(SaveStatus)
    expect(wrapper.element.tagName).toBe('DIV')
    expect(wrapper.attributes('role')).toBe('status')
    await wrapper.trigger('click')
    expect(useFileMenuStore().menuOpen).toBe(false)
  })

  it('becomes an alert button that opens the File menu while it shows an error', async () => {
    const wrapper = mount(SaveStatus)
    usePersistenceStore().errorMessage = 'Not saved — browser storage unavailable'
    await wrapper.vm.$nextTick()
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.attributes('data-tone')).toBe('error')
    await wrapper.trigger('click')
    expect(useFileMenuStore().menuOpen).toBe(true)
  })
})
