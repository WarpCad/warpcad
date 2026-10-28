// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives duck-typed fakes of the gist client and the credential store.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, toRaw } from 'vue'

import { gistMessage } from '../../core/gistMessages.js'
import { GistError } from '../../storage/gistBackend.js'
import { useDocumentStore } from '../../stores/document.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { setGistDependencies, useGistStore } from '../../stores/gist.js'
import { setPersistenceDependencies, usePersistenceStore } from '../../stores/persistence.js'
import SaveAsGistDialog from './SaveAsGistDialog.vue'

enableAutoUnmount(afterEach)

/**
 * `TODO/io-021` — the **Save as gist…** dialog: the connect step first when there is no token,
 * then the name (io-020's pre-fill) and **Secret / Public**; a failure is `gistMessages.js`'s
 * wording and leaves the project's `gist` field unset; success closes it and leaves a toast that
 * names the gist and carries **Copy link**.
 */

const TOKEN = 'github_pat_UNIT_SENTINEL_gist_not_a_real_token'
const ID = 'aa11bb22cc33dd44ee55ff6677889900'
const REV1 = '1'.repeat(40)
const REV2 = '2'.repeat(40)
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

let backend
let copied

function memoryCredentials() {
  const records = new Map()
  return {
    async read(key) {
      return records.get(key) ?? null
    },
    async write(key, record) {
      records.set(key, { ...record })
    },
    async clear(key) {
      records.delete(key)
    },
    close() {},
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  backend = {
    validateGistToken: vi.fn(async () => ({ login: 'octocat', expiresAt: null, broaderThanNeeded: false, tokenKind: 'fine-grained' })),
    createGist: vi.fn(async () => ({ id: ID, revision: REV1, url: '', rawUrls: {} })),
    updateGist: vi.fn(async () => ({ id: ID, revision: REV2, url: '', rawUrls: {} })),
    deleteGist: vi.fn(),
    readGist: vi.fn(),
  }
  setGistDependencies({ backend, credentials: memoryCredentials() })
  setPersistenceDependencies({
    backend: { load: async () => null, save: async () => {}, keepUnreadable: async () => {} },
    files: {
      capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
      save: async () => ({ ok: true, mode: 'fallback', name: 'a.ndjson' }),
      open: async () => ({ ok: false, cancelled: true }),
      adopt() {},
      forgetHandle() {},
    },
  })
  copied = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async (text) => copied.push(text) },
  })
  useDocumentStore().append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Base', params: { size: [10, 10, 10], center: [0, 0, 5] } })
})

afterEach(() => {
  setGistDependencies(null)
  setPersistenceDependencies(null)
})

async function open() {
  mount(SaveAsGistDialog, { attachTo: document.body })
  useFileMenuStore().requestSaveAsGist()
  await flush()
}

describe('SaveAsGistDialog — the connect step first', () => {
  it('with no token it shows only the connect step, which opens the token dialog over it', async () => {
    await open()
    expect(q('save-gist-dialog')).not.toBeNull()
    expect(q('save-gist-connect')).not.toBeNull()
    expect(q('save-gist-name')).toBeNull()
    expect(q('save-gist-submit')).toBeNull()
    q('save-gist-connect').click()
    await flush()
    const menu = useFileMenuStore()
    expect(menu.gistConnectOpen).toBe(true)
    expect(menu.gistSaveOpen).toBe(true)
    expect(backend.createGist).not.toHaveBeenCalled()
  })

  it('once connected (the token dialog done) the same dialog shows the form', async () => {
    await open()
    await useGistStore().connect(TOKEN)
    await flush()
    expect(q('save-gist-connect')).toBeNull()
    expect(q('save-gist-name')).not.toBeNull()
  })
})

describe('SaveAsGistDialog — the form', () => {
  beforeEach(async () => {
    await useGistStore().connect(TOKEN)
  })

  it('the name is pre-filled with the project name, Untitled when it has none; Secret is the default', async () => {
    await open()
    expect(q('save-gist-name').value).toBe('Untitled')
    expect(q('save-gist-secret').checked).toBe(true)
    expect(q('save-gist-public').checked).toBe(false)
    useFileMenuStore().closeSaveAsGist()
    await flush()
    usePersistenceStore().projectName = 'Phone stand'
    useFileMenuStore().requestSaveAsGist()
    await flush()
    expect(q('save-gist-name').value).toBe('Phone stand')
  })

  it('Save creates a secret gist under the typed name, closes, and leaves a toast with Copy link', async () => {
    await open()
    const field = q('save-gist-name')
    field.value = 'Bracket'
    field.dispatchEvent(new Event('input'))
    q('save-gist-submit').click()
    await flush()
    await vi.waitFor(() => expect(q('save-gist-dialog')).toBeNull())
    expect(backend.createGist.mock.calls[0][0]).toMatchObject({ description: 'Bracket', public: false })
    expect(q('save-gist-toast')?.textContent).toContain('Saved to gist: Bracket')
    q('save-gist-toast-copy').click()
    await flush()
    expect(copied).toEqual([`https://app.warpcad.com/#/gist/${ID}`])
  })

  it('Public is sent when chosen', async () => {
    await open()
    q('save-gist-public').click()
    await flush()
    q('save-gist-submit').click()
    await flush()
    await vi.waitFor(() => expect(backend.createGist).toHaveBeenCalledTimes(1))
    expect(backend.createGist.mock.calls[0][0].public).toBe(true)
  })

  it('a failure shows the gist wording, keeps the dialog, and leaves the gist field unset', async () => {
    backend.createGist.mockRejectedValueOnce(new GistError('rate-limited', `limited; token ${TOKEN}`))
    await open()
    q('save-gist-submit').click()
    await flush()
    await vi.waitFor(() => expect(q('save-gist-error')?.textContent?.trim()).toBe(gistMessage('rate-limited', 'publish')))
    expect(q('save-gist-dialog')).not.toBeNull()
    expect(toRaw(useDocumentStore().raw).gist()).toBeNull()
    expect(document.body.innerHTML).not.toContain(TOKEN)
  })
})
