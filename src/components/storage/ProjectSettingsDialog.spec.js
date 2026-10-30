// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — duck-typed fakes of the storage boundary; the components are typechecked.
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

enableAutoUnmount(afterEach)

import { createInstructionTrust } from '../../ai/instructionTrust.js'
import { DESCRIPTION_LIMITS } from '../../core/description.js'
import { INSTRUCTIONS_MAX_LENGTH } from '../../core/intent.js'
import { useDocumentStore } from '../../stores/document.js'
import { setHostedDependencies } from '../../stores/hosted.js'
import { setPersistenceDependencies } from '../../stores/persistence.js'
import { setProjectSettingsDependencies } from '../../stores/projectSettings.js'
import FileMenu from './FileMenu.vue'

/**
 * `TODO/ai-003` — File ▾ → Project settings…: one multi-line field for the project's
 * standing instructions, with a character count against the cap. Instructions that arrived
 * with a loaded file are shown with a "Use this project's instructions" confirm
 * (`docs/decisions/ai-partner.md` decision 7). `e2e/design-intent.e2e.js` is the
 * reachability half.
 */

const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

function setup() {
  setActivePinia(createPinia())
  setPersistenceDependencies({
    backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
    files: {
      capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
      async save() { return { ok: true } },
      async open() { return { ok: false, cancelled: true } },
      adopt() {},
      forgetHandle() {},
    },
  })
  setHostedDependencies({
    client: { apiOrigin: 'https://api.github.com', async read() { return { exists: false } }, async write() { return {} } },
    credentials: { async read() { return null }, async write() {}, async clear() {}, close() {} },
  })
  const trust = createInstructionTrust({ storage: null })
  setProjectSettingsDependencies({ trust })
  const wrapper = mount(FileMenu, { attachTo: document.body })
  return { wrapper, trust, documentStore: useDocumentStore() }
}

async function openSettings(wrapper) {
  await wrapper.get('[data-testid="file-menu-button"]').trigger('click')
  await nextTick()
  q('project-settings').click()
  await nextTick()
}

/** @param {string} text */
async function type(text) {
  const field = q('project-settings-text')
  field.value = text
  field.dispatchEvent(new Event('input'))
  await nextTick()
}

describe('File ▾ → Project settings…', () => {
  it('is an item of the Design group that opens the dialog and closes the menu', async () => {
    const { wrapper } = setup()
    await wrapper.get('[data-testid="file-menu-button"]').trigger('click')
    await nextTick()
    const item = q('project-settings')
    expect(item?.textContent?.trim()).toBe('Project settings…')
    expect(item.closest('[role="group"]')?.getAttribute('aria-label')).toBe('Design')
    item.click()
    await nextTick()
    expect(q('file-menu')).toBeNull()
    expect(q('project-settings-dialog')).not.toBeNull()
  })

  it('shows the current instructions and a live character count against the cap', async () => {
    const { wrapper, documentStore } = setup()
    documentStore.setStandingInstructions('Walls at least 1.6 mm')
    await openSettings(wrapper)
    expect(q('project-settings-text').value).toBe('Walls at least 1.6 mm')
    expect(q('project-settings-count').textContent).toContain(`21 / ${INSTRUCTIONS_MAX_LENGTH}`)
    expect(q('project-settings-text').getAttribute('maxlength')).toBe(String(INSTRUCTIONS_MAX_LENGTH))
    await type('Print on a 220×220 mm bed')
    expect(q('project-settings-count').textContent).toContain(`25 / ${INSTRUCTIONS_MAX_LENGTH}`)
  })

  it('Save writes them to the document (a document change, so autosave and the chip follow) and trusts them', async () => {
    const { wrapper, documentStore, trust } = setup()
    await openSettings(wrapper)
    const before = documentStore.version
    await type('Print on a 220×220 mm bed')
    q('project-settings-save').click()
    await nextTick()
    expect(documentStore.standingInstructions).toBe('Print on a 220×220 mm bed')
    expect(documentStore.version).toBeGreaterThan(before)
    expect(trust.isTrusted('Print on a 220×220 mm bed')).toBe(true)
    expect(q('project-settings-dialog')).toBeNull()
  })

  it('Cancel discards the edit', async () => {
    const { wrapper, documentStore } = setup()
    documentStore.setStandingInstructions('keep')
    await openSettings(wrapper)
    await type('changed')
    q('project-settings-cancel').click()
    await nextTick()
    expect(documentStore.standingInstructions).toBe('keep')
    expect(q('project-settings-dialog')).toBeNull()
  })

  it('instructions that came with a loaded file are flagged until confirmed; confirming trusts them', async () => {
    const { wrapper, documentStore, trust } = setup()
    documentStore.load([], null, 'normal', { standingInstructions: 'From the file' })
    await openSettings(wrapper)
    expect(q('project-settings-untrusted')?.textContent).toMatch(/came with this project/i)
    q('project-settings-trust').click()
    await nextTick()
    expect(trust.isTrusted('From the file')).toBe(true)
    expect(q('project-settings-untrusted')).toBeNull()
  })

  it('no confirm is offered for instructions typed here, or for none at all', async () => {
    const { wrapper } = setup()
    await openSettings(wrapper)
    expect(q('project-settings-untrusted')).toBeNull()
  })

  it('renders hostile text as text: no element is created from it', async () => {
    const { wrapper, documentStore } = setup()
    documentStore.load([], null, 'normal', { standingInstructions: '<img src=x data-evil="1"><b>bold</b>' })
    await openSettings(wrapper)
    const dialog = q('project-settings-dialog')
    expect(dialog.querySelector('img, b')).toBeNull()
    expect(q('project-settings-text').value).toBe('<img src=x data-evil="1"><b>bold</b>')
  })
})

/**
 * `TODO/io-023` — the project's **Description**, for people to read, above the standing
 * instructions (which are for the AI). A small Markdown subset with a live preview; everything
 * outside it is shown as typed. The preview is built from elements with text content, never from
 * markup.
 */
describe('File ▾ → Project settings… — Description', () => {
  /** @param {string} text */
  async function describeAs(text) {
    const field = q('project-settings-description')
    field.value = text
    field.dispatchEvent(new Event('input'))
    await nextTick()
  }

  it('comes before the standing instructions, says it is for people, and shows the current text', async () => {
    const { wrapper, documentStore } = setup()
    documentStore.setDescription('A wall duct.')
    await openSettings(wrapper)
    const field = q('project-settings-description')
    expect(field.value).toBe('A wall duct.')
    expect(field.getAttribute('maxlength')).toBe(String(DESCRIPTION_LIMITS.maxLength))
    expect(field.compareDocumentPosition(q('project-settings-text')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(q('project-settings-dialog').textContent).toMatch(/for people/i)
  })

  it('previews the Markdown subset live: paragraphs, a list, bold, italic and code', async () => {
    const { wrapper } = setup()
    await openSettings(wrapper)
    expect(q('project-settings-description-preview')).toBeNull()
    await describeAs('A **wall** duct, *PETG*.\n\n- one `1.6`\n- two')
    const preview = q('project-settings-description-preview')
    expect(preview.querySelectorAll('p')).toHaveLength(1)
    expect(preview.querySelectorAll('li')).toHaveLength(2)
    expect(preview.querySelector('strong')?.textContent).toBe('wall')
    expect(preview.querySelector('em')?.textContent).toBe('PETG')
    expect(preview.querySelector('code')?.textContent).toBe('1.6')
    expect(q('project-settings-description-count').textContent).toContain(`/ ${DESCRIPTION_LIMITS.maxLength}`)
  })

  it('Save writes it to the document with the instructions; Cancel discards it', async () => {
    const { wrapper, documentStore } = setup()
    await openSettings(wrapper)
    const before = documentStore.version
    await describeAs('A **wall** duct.')
    q('project-settings-save').click()
    await nextTick()
    expect(documentStore.description).toBe('A **wall** duct.')
    expect(documentStore.version).toBeGreaterThan(before)

    await openSettings(wrapper)
    await describeAs('changed')
    q('project-settings-cancel').click()
    await nextTick()
    expect(documentStore.description).toBe('A **wall** duct.')
  })

  it('renders hostile text as text: no link, image, script, heading or HTML element is created', async () => {
    const { wrapper } = setup()
    await openSettings(wrapper)
    await describeAs('# Heading\n\n[x](javascript:alert(1)) ![i](https://e.vil/p.png) <img src=x onerror=alert(1)> <script>alert(1)</script> <b>b</b>')
    const preview = q('project-settings-description-preview')
    expect(preview.querySelector('a, img, script, h1, h2, b, iframe')).toBeNull()
    expect(preview.textContent).toContain('# Heading')
    expect(preview.textContent).toContain('[x](javascript:alert(1))')
    expect(preview.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})
