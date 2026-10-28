// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives hand-written duck-typed fakes of the gist backend, the hosted client and
// the credential store; the modules under test are fully typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BROADER_THAN_NEEDED_MESSAGE } from '../core/gistMessages.js'
import { GistError } from '../storage/gistBackend.js'
import { GIST_CREDENTIAL_KEY, HOSTED_CREDENTIAL_KEY } from '../storage/tokenStorage.js'
import { setGistDependencies, useGistStore } from './gist.js'
import { setHostedDependencies, useHostedStore } from './hosted.js'
import { setPersistenceDependencies } from './persistence.js'

/**
 * `TODO/io-017` Stage 2 — the gist credential and the gist's UI state. Everything at the boundary
 * is faked (`CLAUDE.md`): the gist client and the IndexedDB credential store. The re-run of
 * `io-002`'s closed findings is here too: **Disconnect really deletes**, the token never reaches
 * reactive state or an error, and the two GitHub credentials never overwrite each other.
 */

const TOKEN = 'github_pat_FAKEfake_0123456789abcdefGIST'
const HOSTED_TOKEN = 'github_pat_FAKEfake_0123456789abcdefREPO'
const ID = 'aa11bb22cc33dd44ee55ff6677889900'

/** Everything a dev-tools panel, a Pinia plugin or a crash reporter could read off the store. */
function everythingReadable(store) {
  const getters = Object.keys(store)
    .map((key) => {
      try {
        return `${key}=${JSON.stringify(store[key])}`
      } catch {
        return `${key}=<unserialisable>`
      }
    })
    .join('|')
  return `${JSON.stringify(store.$state)}|${getters}`
}

/** An in-memory credential store — the IndexedDB boundary, recording every call. */
function memoryCredentials() {
  const records = new Map()
  const credentials = {
    records,
    writes: [],
    failWrites: false,
    async read(key) {
      const value = records.get(key)
      return value === undefined ? null : { ...value }
    },
    async write(key, record) {
      if (credentials.failWrites) throw new Error('QuotaExceededError')
      credentials.writes.push(key)
      records.set(key, { ...record })
    },
    async clear(key) {
      records.delete(key)
    },
    close() {},
  }
  return credentials
}

function fakeBackend(overrides = {}) {
  return {
    validateGistToken: vi.fn(async () => ({ login: 'octocat', expiresAt: '2026-11-27T14:05:00.000Z', broaderThanNeeded: false, tokenKind: 'fine-grained' })),
    createGist: vi.fn(async () => ({ id: ID, revision: 'a'.repeat(40), url: `https://gist.github.com/${ID}`, rawUrls: {} })),
    updateGist: vi.fn(async () => ({ id: ID, revision: 'b'.repeat(40), url: `https://gist.github.com/${ID}`, rawUrls: {} })),
    deleteGist: vi.fn(async () => {}),
    readGist: vi.fn(async () => ({ id: ID, description: '', text: '', revision: 'a'.repeat(40), updatedAt: null, fileName: 'p.ndjson' })),
    ...overrides,
  }
}

const files = /** @type {any} */ ({
  capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
  currentName: null,
  save: async () => ({ ok: true, mode: 'fallback', name: 'x.ndjson' }),
  open: async () => ({ ok: false, cancelled: true }),
  adopt() {},
  forgetHandle() {},
})

let credentials
let backend

beforeEach(() => {
  setActivePinia(createPinia())
  credentials = memoryCredentials()
  backend = fakeBackend()
  setGistDependencies({ backend, credentials })
  setPersistenceDependencies({
    backend: { load: async () => null, save: async () => {}, keepUnreadable: async () => {} },
    files,
  })
})

afterEach(() => {
  setGistDependencies(null)
  setHostedDependencies(null)
  setPersistenceDependencies(null)
})

describe('connect', () => {
  it('validates first, then stores the token under its own key, and shows the login', async () => {
    const gist = useGistStore()
    const result = await gist.connect(`  ${TOKEN}\n`)
    expect(backend.validateGistToken).toHaveBeenCalledWith({ token: TOKEN })
    expect(result).toEqual({ ok: true, login: 'octocat', tokenKind: 'fine-grained', expiresAt: '2026-11-27T14:05:00.000Z', broaderThanNeeded: false, warning: '' })
    expect(gist.connected).toBe(true)
    expect(gist.login).toBe('octocat')
    expect(gist.tokenKind).toBe('fine-grained')
    expect(gist.expiresAt).toBe('2026-11-27T14:05:00.000Z')
    expect(credentials.records.get(GIST_CREDENTIAL_KEY)).toMatchObject({ token: TOKEN, login: 'octocat', tokenKind: 'fine-grained' })
    expect(credentials.records.has(HOSTED_CREDENTIAL_KEY)).toBe(false)
  })

  it('never puts the token in reactive state, a getter or a result', async () => {
    const gist = useGistStore()
    const result = await gist.connect(TOKEN)
    expect(everythingReadable(gist)).not.toContain(TOKEN)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  it('a classic token broader than gist connects, with the exact warning', async () => {
    backend.validateGistToken.mockResolvedValueOnce({ login: 'octocat', expiresAt: null, broaderThanNeeded: true, tokenKind: 'classic' })
    const gist = useGistStore()
    const result = await gist.connect(TOKEN)
    expect(result.ok).toBe(true)
    expect(result.warning).toBe(BROADER_THAN_NEEDED_MESSAGE)
    expect(gist.broaderThanNeeded).toBe(true)
    expect(gist.connected).toBe(true)
  })

  it.each([
    ['rejected or expired', 'unauthorized', /rejected/],
    ['without the Gists permission', 'forbidden', /Gists/],
    ['while offline', 'offline', /No network/],
    ['shaped wrong', 'invalid', /token/],
  ])('a token %s stores nothing, connects nothing and says why in fixed words', async (_label, kind, wording) => {
    backend.validateGistToken.mockRejectedValueOnce(new GistError(kind, `server text quoting ${TOKEN}`))
    const gist = useGistStore()
    const result = await gist.connect(TOKEN)
    expect(result.ok).toBe(false)
    expect(result.kind).toBe(kind)
    expect(result.message).toMatch(wording)
    expect(result.message).not.toContain(TOKEN)
    expect(gist.connected).toBe(false)
    expect(credentials.records.size).toBe(0)
    expect(everythingReadable(gist)).not.toContain(TOKEN)
    expect(gist.authorized()).toBeNull()
  })

  it('a token the browser will not store is not reported as connected', async () => {
    credentials.failWrites = true
    const gist = useGistStore()
    const result = await gist.connect(TOKEN)
    expect(result.ok).toBe(false)
    expect(result.kind).toBe('storage')
    expect(gist.connected).toBe(false)
    expect(gist.authorized()).toBeNull()
  })
})

describe('disconnect really deletes (io-002 re-run, second credential)', () => {
  it('deletes the stored record and forgets the token in memory', async () => {
    const gist = useGistStore()
    await gist.connect(TOKEN)
    await gist.disconnect()
    expect(credentials.records.has(GIST_CREDENTIAL_KEY)).toBe(false)
    expect(gist.connected).toBe(false)
    expect(gist.login).toBe('')
    expect(gist.authorized()).toBeNull()
  })

  it('a reload after Disconnect is not connected', async () => {
    await useGistStore().connect(TOKEN)
    await useGistStore().disconnect()
    setActivePinia(createPinia())
    const gist = useGistStore()
    await gist.start()
    expect(gist.connected).toBe(false)
  })
})

describe('start', () => {
  it('restores a stored connection without touching the network, once', async () => {
    await useGistStore().connect(TOKEN)
    backend.validateGistToken.mockClear()
    setActivePinia(createPinia())
    const gist = useGistStore()
    await Promise.all([gist.start(), gist.start()])
    expect(gist.connected).toBe(true)
    expect(gist.login).toBe('octocat')
    expect(backend.validateGistToken).not.toHaveBeenCalled()
    expect(everythingReadable(gist)).not.toContain(TOKEN)
  })

  it.each([
    ['no token', { login: 'octocat' }],
    ['a token of the wrong shape', { token: 'not a token', login: 'octocat' }],
    ['a login that is not a GitHub login', { token: TOKEN, login: '<img src=x>' }],
  ])('ignores a stored record with %s', async (_label, record) => {
    credentials.records.set(GIST_CREDENTIAL_KEY, record)
    const gist = useGistStore()
    await gist.start()
    expect(gist.connected).toBe(false)
  })
})

describe('the two GitHub credentials never overwrite each other', () => {
  function hostedClient() {
    return {
      apiOrigin: 'https://api.github.com',
      read: vi.fn(async () => ({ exists: false, text: null, sha: null })),
      write: vi.fn(),
    }
  }

  it('connecting and disconnecting one leaves the other stored', async () => {
    setHostedDependencies({ client: hostedClient(), credentials })
    const hosted = useHostedStore()
    const gist = useGistStore()
    const connected = await hosted.connect({ token: HOSTED_TOKEN, owner: 'octo', repo: 'parts', path: 'warpcad-project.ndjson' })
    expect(connected.ok).toBe(true)
    await gist.connect(TOKEN)
    expect(credentials.records.get(HOSTED_CREDENTIAL_KEY).token).toBe(HOSTED_TOKEN)
    expect(credentials.records.get(GIST_CREDENTIAL_KEY).token).toBe(TOKEN)

    await gist.disconnect()
    expect(credentials.records.get(HOSTED_CREDENTIAL_KEY).token).toBe(HOSTED_TOKEN)
    expect(hosted.connected).toBe(true)

    await gist.connect(TOKEN)
    await hosted.disconnect()
    expect(credentials.records.get(GIST_CREDENTIAL_KEY).token).toBe(TOKEN)
    expect(gist.connected).toBe(true)
  })
})

describe('authorized calls', () => {
  it('hands the token to the client per call, and never to the caller', async () => {
    const gist = useGistStore()
    await gist.connect(TOKEN)
    const client = gist.authorized()
    expect(JSON.stringify(client)).not.toContain(TOKEN)
    await client.createGist({ files: { 'a.ndjson': 'x' }, description: 'd', public: false })
    expect(backend.createGist).toHaveBeenCalledWith({ token: TOKEN, files: { 'a.ndjson': 'x' }, description: 'd', public: false })
    await client.updateGist({ id: ID, files: { 'README.md': 'r' } })
    expect(backend.updateGist).toHaveBeenCalledWith({ token: TOKEN, id: ID, files: { 'README.md': 'r' } })
    await client.deleteGist({ id: ID })
    expect(backend.deleteGist).toHaveBeenCalledWith({ token: TOKEN, id: ID })
  })

  it('a call cannot smuggle in another token', async () => {
    const gist = useGistStore()
    await gist.connect(TOKEN)
    await gist.authorized().deleteGist({ id: ID, token: 'ghp_FAKEotherFAKEotherFAKEotherFAKE00' })
    expect(backend.deleteGist).toHaveBeenCalledWith({ token: TOKEN, id: ID })
  })

  it('a read needs no token at all', async () => {
    const gist = useGistStore()
    await gist.readGist(ID)
    expect(backend.readGist).toHaveBeenCalledWith({ id: ID })
  })
})

describe('revisions this session wrote', () => {
  it('remembers each, by gist, so a cached read of an earlier one is not mistaken for someone else\'s change', () => {
    const gist = useGistStore()
    gist.rememberRevision(ID, 'a'.repeat(40))
    gist.rememberRevision(ID, 'b'.repeat(40))
    expect(gist.wroteRevision(ID, 'a'.repeat(40))).toBe(true)
    expect(gist.wroteRevision(ID, 'c'.repeat(40))).toBe(false)
    expect(gist.wroteRevision('bb22cc33dd44ee55ff66778899001122', 'a'.repeat(40))).toBe(false)
    expect(gist.wroteRevision(ID, null)).toBe(false)
  })
})
