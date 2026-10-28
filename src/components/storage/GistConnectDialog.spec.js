// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives duck-typed fakes of the gist client and the credential store.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { BROADER_THAN_NEEDED_MESSAGE, gistMessage } from '../../core/gistMessages.js'
import { GistError } from '../../storage/gistBackend.js'
import { GIST_CREDENTIAL_KEY, HOSTED_CREDENTIAL_KEY } from '../../storage/tokenStorage.js'
import { useFileMenuStore } from '../../stores/fileMenu.js'
import { setGistDependencies, useGistStore } from '../../stores/gist.js'
import { setPersistenceDependencies } from '../../stores/persistence.js'
import GistConnectDialog from './GistConnectDialog.vue'

enableAutoUnmount(afterEach)

/**
 * `TODO/io-017` Stage 2 — the gist token dialog. The credential rules `ConnectDialog.spec.js` pins
 * for the repository token, on the second key: the token is typed once, never shown back, never
 * in the DOM after submit, failures are fixed wording, and **Disconnect** really deletes — the
 * gist record only, never the repository token's.
 */

const TOKEN = 'github_pat_UNIT_SENTINEL_gist_not_a_real_token'
const HOSTED_RECORD = { token: 'github_pat_UNIT_SENTINEL_repo', owner: 'octo', repo: 'parts', path: 'p.ndjson' }
const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)
const flush = async () => {
  for (let i = 0; i < 6; i += 1) await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

let credentials
let backend

function memoryCredentials() {
  const records = new Map([[HOSTED_CREDENTIAL_KEY, { ...HOSTED_RECORD }]])
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
  credentials = memoryCredentials()
  backend = {
    validateGistToken: vi.fn(async () => ({ login: 'octocat', expiresAt: '2026-11-27T14:05:00.000Z', broaderThanNeeded: false, tokenKind: 'fine-grained' })),
    createGist: vi.fn(),
    updateGist: vi.fn(),
    deleteGist: vi.fn(),
    readGist: vi.fn(),
  }
  setGistDependencies({ backend, credentials })
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
})

afterEach(() => {
  setGistDependencies(null)
  setPersistenceDependencies(null)
})

async function open() {
  mount(GistConnectDialog, { attachTo: document.body })
  useFileMenuStore().openGistConnect()
  await flush()
}

async function typeToken(value = TOKEN) {
  const input = q('gist-connect-token')
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}

describe('GistConnectDialog', () => {
  it('asks for the token first, as a password field, with the recommended token spelled out', async () => {
    await open()
    const dialog = q('gist-connect-dialog')
    expect(dialog).not.toBeNull()
    expect(dialog.classList.contains('modal--sheet')).toBe(true)
    const input = q('gist-connect-token')
    expect(input.getAttribute('type')).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('off')
    // The field comes before the explanation.
    expect(input.compareDocumentPosition(q('gist-connect-help')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const help = q('gist-connect-help').textContent.replace(/\s+/g, ' ')
    expect(help).toContain('Create a fine-grained token with no repository access and only Gists: Read and write')
    expect(help).toContain('Or use a classic token with only the gist box ticked')
    expect(help).toContain("GitHub can't limit a token to one gist")
    expect(q('gist-connect-github-link').getAttribute('href')).toBe('https://github.com/settings/personal-access-tokens/new')
    expect(q('gist-connect-github-link').getAttribute('rel')).toContain('noopener')
    expect(q('gist-connect-submit').disabled).toBe(true)
  })

  it('connects through the store, wipes the field, and shows the login, kind and expiry — never the token', async () => {
    await open()
    await typeToken(`  ${TOKEN} `)
    expect(q('gist-connect-submit').disabled).toBe(false)
    q('gist-connect-submit').click()
    await flush()
    expect(backend.validateGistToken).toHaveBeenCalledWith({ token: TOKEN })
    expect(q('gist-connect-token')).toBeNull()
    expect(q('gist-connect-status').textContent).toContain('Connected as octocat')
    expect(q('gist-connect-kind').textContent).toContain('Fine-grained token · expires 27 Nov 2026')
    expect(q('gist-connect-warning')).toBeNull()
    expect(document.body.innerHTML).not.toContain(TOKEN)
    expect(credentials.records.get(GIST_CREDENTIAL_KEY)).toMatchObject({ token: TOKEN, login: 'octocat' })
    expect(credentials.records.get(HOSTED_CREDENTIAL_KEY)).toEqual(HOSTED_RECORD)
  })

  it('a classic token broader than gist connects, with the warning', async () => {
    backend.validateGistToken.mockResolvedValueOnce({ login: 'octocat', expiresAt: null, broaderThanNeeded: true, tokenKind: 'classic' })
    await open()
    await typeToken()
    q('gist-connect-submit').click()
    await flush()
    expect(q('gist-connect-warning').textContent.trim()).toBe(BROADER_THAN_NEEDED_MESSAGE)
    expect(q('gist-connect-kind').textContent).toContain('Classic token · no expiry date reported')
    expect(useGistStore().connected).toBe(true)
  })

  it.each(['unauthorized', 'forbidden', 'offline'])('a %s failure stores nothing and shows only fixed wording', async (kind) => {
    backend.validateGistToken.mockRejectedValueOnce(new GistError(kind, `server said ${TOKEN}`))
    await open()
    await typeToken()
    q('gist-connect-submit').click()
    await flush()
    expect(q('gist-connect-error').textContent.trim()).toBe(gistMessage(kind, 'connect'))
    expect(document.body.innerHTML).not.toContain(TOKEN)
    expect(q('gist-connect-token').value).toBe('')
    expect(credentials.records.has(GIST_CREDENTIAL_KEY)).toBe(false)
    expect(useGistStore().connected).toBe(false)
  })

  it('Disconnect really deletes the gist credential, and leaves the repository token alone', async () => {
    await open()
    await typeToken()
    q('gist-connect-submit').click()
    await flush()
    q('gist-disconnect').click()
    await flush()
    expect(credentials.records.has(GIST_CREDENTIAL_KEY)).toBe(false)
    expect(credentials.records.get(HOSTED_CREDENTIAL_KEY)).toEqual(HOSTED_RECORD)
    expect(useGistStore().connected).toBe(false)
    expect(q('gist-connect-token')).not.toBeNull()
    expect(q('gist-connect-note').textContent).toContain('The token is deleted from this browser')
  })

  it('opened while connected shows the connection, and Done closes it', async () => {
    await useGistStore().connect(TOKEN)
    await open()
    expect(q('gist-connect-status')).not.toBeNull()
    expect(q('gist-connect-token')).toBeNull()
    q('gist-connect-done').click()
    await flush()
    expect(useFileMenuStore().gistConnectOpen).toBe(false)
    expect(q('gist-connect-dialog')).toBeNull()
  })
})
