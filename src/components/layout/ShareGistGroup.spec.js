// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives duck-typed fakes of the gist client, the credential store and the clipboard.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { gistLink } from '../../core/gistLink.js'
import { gistMessage } from '../../core/gistMessages.js'
import { useDocumentStore } from '../../stores/document.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { setGistDependencies, useGistStore } from '../../stores/gist.js'
import { setPersistenceDependencies, usePersistenceStore } from '../../stores/persistence.js'
import ShareGistGroup from './ShareGistGroup.vue'

enableAutoUnmount(afterEach)

/**
 * `TODO/io-017` Stage 2 — the Share sheet's **Short link with GitHub** group, against the real
 * document, persistence and gist stores and `useGistPublish`. Only the boundary is faked: the gist
 * client, the credential store, IndexedDB and the clipboard (jsdom has no `ClipboardItem`, so the
 * plain `writeText` path is what runs here; the e2e covers the other).
 */

const TOKEN = 'github_pat_UNIT_SENTINEL_gist_not_a_real_token'
const ID = 'aa11bb22cc33dd44ee55ff6677889900'
const REV1 = '1'.repeat(40)
const REV2 = '2'.repeat(40)
const CUBE = { id: 'cube-1', op: 'primitive.cuboid', name: 'Base', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const SECRET =
  "A secret gist is not private: anyone with the link can read it, including this project's notes and instructions. Publishing sends the whole project to GitHub."

const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const flush = async () => {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

let backend
let copied

function memoryCredentials() {
  const records = new Map()
  return {
    records,
    async read(key) {
      const value = records.get(key)
      return value === undefined ? null : { ...value }
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
    createGist: vi.fn(async () => ({ id: ID, revision: REV1, url: `https://gist.github.com/${ID}`, rawUrls: {} })),
    updateGist: vi.fn(async () => ({ id: ID, revision: REV2, url: `https://gist.github.com/${ID}`, rawUrls: {} })),
    deleteGist: vi.fn(async () => {}),
    readGist: vi.fn(async () => ({ id: ID, description: '', text: '', revision: REV2, updatedAt: null, fileName: 'phone-stand.ndjson' })),
  }
  setGistDependencies({ backend, credentials: memoryCredentials() })
  setPersistenceDependencies({
    backend: { load: async () => null, save: async () => {}, keepUnreadable: async () => {} },
    files: {
      capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
      currentName: null,
      save: async () => ({ ok: true, mode: 'fallback', name: 'a.ndjson' }),
      open: async () => ({ ok: false, cancelled: true }),
      adopt() {},
      forgetHandle() {},
    },
  })
  copied = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(async (text) => copied.push(text)) },
  })
  useDocumentStore().append(CUBE)
  usePersistenceStore().projectName = 'Phone stand'
})

afterEach(() => {
  usePersistenceStore().stop()
  setGistDependencies(null)
  setPersistenceDependencies(null)
})

function render(props = {}) {
  return mount(ShareGistGroup, { attachTo: document.body, props })
}

describe('ShareGistGroup', () => {
  it('not connected: Connect GitHub for short links opens the token dialog, and the disclosure is there', async () => {
    const wrapper = render()
    await flush()
    expect(q('share-gist-group').getAttribute('data-state')).toBe('off')
    expect(q('share-gist-publish')).toBeNull()
    expect(q('share-gist-disclosure').textContent).toBe(SECRET)
    q('share-gist-connect').click()
    expect(useFileMenuStore().gistConnectOpen).toBe(true)
    expect(backend.createGist).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('over the long-link ceiling the gist button is the primary action', async () => {
    render({ tooBig: true })
    await flush()
    expect(q('share-gist-connect').classList.contains('share-gist__button--primary')).toBe(true)
  })

  it('Publish to a gist: secret by default, the short link copied, a toast, then the published controls', async () => {
    await useGistStore().connect(TOKEN)
    const wrapper = render()
    await flush()
    expect(q('share-gist-public').checked).toBe(false)
    q('share-gist-publish').click()
    await flush()
    expect(backend.createGist).toHaveBeenCalledTimes(1)
    expect(backend.createGist.mock.calls[0][0].public).toBe(false)
    expect(copied).toEqual([gistLink(ID)])
    expect(wrapper.emitted('toast')?.at(-1)).toEqual(['Published. Link copied'])
    expect(q('share-gist-group').getAttribute('data-state')).toBe('published')
    expect(q('share-gist-status').textContent).toMatch(/^Published · secret · \d\d:\d\d$/)
    expect(q('share-gist-update')).not.toBeNull()
    expect(q('share-gist-page').getAttribute('href')).toBe(`https://gist.github.com/${ID}`)
    expect(q('share-gist-public')).toBeNull()
  })

  it('Make it public publishes a public gist, and the disclosure says anyone can find it', async () => {
    await useGistStore().connect(TOKEN)
    render()
    await flush()
    q('share-gist-public').click()
    await nextTick()
    expect(q('share-gist-disclosure').textContent.startsWith('Anyone can find this.')).toBe(true)
    q('share-gist-publish').click()
    await flush()
    expect(backend.createGist.mock.calls[0][0].public).toBe(true)
    expect(q('share-gist-status').textContent).toContain('public')
  })

  it('while GitHub is being talked to, everything is disabled and the reason is on screen', async () => {
    await useGistStore().connect(TOKEN)
    let release
    backend.createGist.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ id: ID, revision: REV1, url: '', rawUrls: {} }))),
    )
    render()
    await flush()
    q('share-gist-publish').click()
    await flush()
    expect(q('share-gist-busy').textContent).toBe('Publishing to GitHub…')
    expect(q('share-gist-publish').disabled).toBe(true)
    expect(q('share-gist-public').disabled).toBe(true)
    release()
    await flush()
    expect(q('share-gist-busy')).toBeNull()
  })

  it('a clipboard that refuses shows the link to copy by hand', async () => {
    await useGistStore().connect(TOKEN)
    navigator.clipboard.writeText = vi.fn(async () => {
      throw new Error('NotAllowedError')
    })
    const wrapper = render()
    await flush()
    q('share-gist-publish').click()
    await flush()
    expect(wrapper.emitted('toast')?.at(-1)).toEqual(['Published'])
    expect(q('share-gist-link-text').value).toBe(gistLink(ID))
  })

  it('Update gist patches the same gist and says so; a gist changed elsewhere refuses in fixed words', async () => {
    await useGistStore().connect(TOKEN)
    const wrapper = render()
    await flush()
    q('share-gist-publish').click()
    await flush()
    backend.readGist.mockResolvedValueOnce({ id: ID, description: '', text: '', revision: REV2, updatedAt: null, fileName: 'phone-stand.ndjson' })
    backend.updateGist.mockResolvedValueOnce({ id: ID, revision: '3'.repeat(40), url: '', rawUrls: {} })
    q('share-gist-update').click()
    await flush()
    expect(wrapper.emitted('toast')?.at(-1)).toEqual(['Gist updated'])
    expect(backend.updateGist.mock.calls.at(-1)[0].id).toBe(ID)

    backend.readGist.mockResolvedValueOnce({ id: ID, description: '', text: '', revision: '9'.repeat(40), updatedAt: null, fileName: 'phone-stand.ndjson' })
    const calls = backend.updateGist.mock.calls.length
    q('share-gist-update').click()
    await flush()
    expect(q('share-gist-error').textContent).toBe(gistMessage('changed-remotely', 'update'))
    expect(backend.updateGist.mock.calls.length).toBe(calls)
  })

  it('Stop sharing asks first; Keep sharing deletes nothing; Stop sharing deletes the gist', async () => {
    await useGistStore().connect(TOKEN)
    const wrapper = render()
    await flush()
    q('share-gist-publish').click()
    await flush()
    q('share-gist-stop').click()
    await nextTick()
    expect(q('share-gist-stop-confirm').textContent).toContain('the link stops working')
    expect(q('share-gist-stop-confirm').textContent).toContain('may remain')
    q('share-gist-stop-cancel').click()
    await nextTick()
    expect(backend.deleteGist).not.toHaveBeenCalled()
    q('share-gist-stop').click()
    await nextTick()
    q('share-gist-stop-yes').click()
    await flush()
    expect(backend.deleteGist).toHaveBeenCalledWith(expect.objectContaining({ id: ID }))
    expect(wrapper.emitted('toast')?.at(-1)).toEqual(['Stopped sharing. The link no longer works'])
    expect(q('share-gist-group').getAttribute('data-state')).toBe('connected')
    expect(q('share-gist-publish')).not.toBeNull()
  })

  it('a project carrying someone else’s gist offers Publish, with a note, not Update', async () => {
    await useGistStore().connect(TOKEN)
    useDocumentStore().raw.setGist({ id: ID, public: false, lastRevision: REV1, owner: 'someone-else' }, { origin: 'gist' })
    useDocumentStore().refresh()
    render()
    await flush()
    expect(q('share-gist-other-owner')).not.toBeNull()
    expect(q('share-gist-publish')).not.toBeNull()
    expect(q('share-gist-update')).toBeNull()
  })
})
