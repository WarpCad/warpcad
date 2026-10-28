// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — drives hand-written duck-typed fakes of the gist backend and the credential
// store; the modules under test are fully typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, toRaw } from 'vue'

import { createDocument } from '../core/document.js'
import { gistLink, isGistRawUrl } from '../core/gistLink.js'
import { serializeProject } from '../core/project.js'
import { GistError } from '../storage/gistBackend.js'
import { useDocumentStore } from '../stores/document.js'
import { setGistDependencies, useGistStore } from '../stores/gist.js'
import { setPersistenceDependencies, usePersistenceStore } from '../stores/persistence.js'
import { GIST_ORIGIN, useGistPublish } from './useGistPublish.js'

/**
 * `TODO/io-017` Stage 2 — publishing, updating and stopping a gist, against the real document and
 * persistence stores. Only the boundary is faked (`CLAUDE.md`): the gist client, the credential
 * store, IndexedDB and the file layer. No real token, no network.
 */

const TOKEN = 'github_pat_FAKEfake_0123456789abcdefGIST'
const ID = 'aa11bb22cc33dd44ee55ff6677889900'
const REV1 = '1'.repeat(40)
const REV2 = '2'.repeat(40)
const REV3 = '3'.repeat(40)
const NOW = Date.UTC(2026, 9, 28, 14, 5)

const CUBE = { id: 'cube-1', op: 'primitive.cuboid', name: 'Base', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const CYLINDER = { id: 'cyl-1', op: 'primitive.cylinder', name: 'Back plate', params: { diameter: 16, height: 20, center: [-40, 0, 10] } }

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

function fakeBackend() {
  return {
    validateGistToken: vi.fn(async () => ({ login: 'octocat', expiresAt: null, broaderThanNeeded: false, tokenKind: 'fine-grained' })),
    createGist: vi.fn(async () => ({ id: ID, revision: REV1, url: `https://gist.github.com/${ID}`, rawUrls: {} })),
    updateGist: vi.fn(async () => ({ id: ID, revision: REV2, url: `https://gist.github.com/${ID}`, rawUrls: {} })),
    deleteGist: vi.fn(async () => {}),
    readGist: vi.fn(async () => ({ id: ID, description: '', text: '', revision: REV2, updatedAt: null, fileName: 'phone-stand.ndjson' })),
  }
}

/** The file layer: records what **Download copy** would have downloaded. */
function fakeFiles() {
  const layer = {
    saved: /** @type {string[]} */ ([]),
    capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
    currentName: null,
    async save(text) {
      layer.saved.push(text)
      return { ok: true, mode: 'fallback', name: 'phone-stand.ndjson' }
    },
    open: async () => ({ ok: false, cancelled: true }),
    adopt() {},
    forgetHandle() {},
  }
  return layer
}

function memoryBackend() {
  const store = {
    stored: null,
    saves: [],
    async load() {
      return store.stored
    },
    async save(record) {
      store.saves.push(record)
      store.stored = record
    },
    async keepUnreadable() {},
  }
  return store
}

let backend
let files
let autosave

/** The composable inside a scope, as a component's setup would hold it. */
function mount() {
  const scope = effectScope()
  const api = scope.run(() => useGistPublish({ now: () => NOW }))
  return { scope, api }
}

/** A project with two named bodies, called "Phone stand". */
function buildProject() {
  const documentStore = useDocumentStore()
  documentStore.append(CUBE)
  documentStore.append(CYLINDER)
  usePersistenceStore().projectName = 'Phone stand'
}

/** The README text the last call of `fn` carried. */
const readmeOf = (fn) => fn.mock.calls.at(-1)[0].files['README.md']

beforeEach(async () => {
  setActivePinia(createPinia())
  backend = fakeBackend()
  files = fakeFiles()
  autosave = memoryBackend()
  setGistDependencies({ backend, credentials: memoryCredentials() })
  setPersistenceDependencies({ backend: autosave, files })
  await useGistStore().connect(TOKEN)
  backend.validateGistToken.mockClear()
})

afterEach(() => {
  usePersistenceStore().stop()
  setGistDependencies(null)
  setPersistenceDependencies(null)
})

describe('publish — the gates', () => {
  it('an empty project publishes nothing', async () => {
    const { scope, api } = mount()
    expect(api.canPublish.value).toBe(false)
    const result = await api.publish()
    expect(result).toMatchObject({ ok: false, kind: 'no-bodies' })
    expect(backend.createGist).not.toHaveBeenCalled()
    scope.stop()
  })

  it('without a connected token it publishes nothing and says to connect', async () => {
    await useGistStore().disconnect()
    buildProject()
    const { scope, api } = mount()
    expect(api.canPublish.value).toBe(false)
    const result = await api.publish()
    expect(result).toMatchObject({ ok: false, kind: 'not-connected' })
    expect(backend.createGist).not.toHaveBeenCalled()
    scope.stop()
  })
})

describe('publish — the two calls', () => {
  it('creates a secret gist with the project file and a placeholder README, then patches the real README', async () => {
    buildProject()
    const { scope, api } = mount()
    expect(api.canPublish.value).toBe(true)
    const result = await api.publish()

    expect(backend.createGist).toHaveBeenCalledTimes(1)
    const created = backend.createGist.mock.calls[0][0]
    expect(created.token).toBe(TOKEN)
    expect(created.public).toBe(false)
    expect(Object.keys(created.files).sort()).toEqual(['README.md', 'phone-stand.ndjson'])
    // The placeholder has no id yet, so no Open in WarpCad link.
    expect(created.files['README.md']).not.toContain('Open in WarpCad')
    expect(created.files['README.md']).toContain('# Phone stand')

    expect(backend.updateGist).toHaveBeenCalledTimes(1)
    const patched = backend.updateGist.mock.calls[0][0]
    expect(patched.id).toBe(ID)
    expect(Object.keys(patched.files)).toEqual(['README.md'])
    const readme = patched.files['README.md']
    expect(readme).toContain(`[Open in WarpCad](${gistLink(ID)})`)
    const raw = `https://gist.githubusercontent.com/octocat/${ID}/raw/phone-stand.ndjson`
    expect(isGistRawUrl(raw)).toBe(true)
    expect(readme).toContain(`(<${raw}>)`)
    expect(readme).toContain('- Last published 2026-10-28 14:05 UTC')

    expect(result).toEqual({ ok: true, id: ID, link: gistLink(ID), revision: REV2 })
    expect(toRaw(useDocumentStore().raw).gist()).toEqual({ id: ID, public: false, lastRevision: REV2, owner: 'octocat' })
    expect(api.published.value).toBe(true)
    expect(api.shortLink.value).toBe(gistLink(ID))
    expect(api.pageUrl.value).toBe(`https://gist.github.com/${ID}`)
    expect(api.link()).toBe(gistLink(ID))
    const gist = useGistStore()
    expect(gist.publishState).toBe('idle')
    expect(gist.lastPublishedAt).toBe(NOW)
    expect(gist.lastErrorKind).toBe('')
    scope.stop()
  })

  it('the project file is byte-identical to Download copy', async () => {
    buildProject()
    await usePersistenceStore().saveFile()
    const downloaded = files.saved.at(-1)
    const { scope, api } = mount()
    await api.publish()
    expect(typeof downloaded).toBe('string')
    expect(backend.createGist.mock.calls[0][0].files['phone-stand.ndjson']).toBe(downloaded)
    scope.stop()
  })

  it('Make it public is only sent when asked for, and is recorded', async () => {
    buildProject()
    const { scope, api } = mount()
    await api.publish({ public: true })
    expect(backend.createGist.mock.calls[0][0].public).toBe(true)
    expect(toRaw(useDocumentStore().raw).gist().public).toBe(true)
    scope.stop()
  })

  it('setting the field is not an undo step', async () => {
    buildProject()
    const documentStore = useDocumentStore()
    const label = documentStore.undoLabel
    const { scope, api } = mount()
    await api.publish()
    expect(documentStore.undoLabel).toBe(label)
    documentStore.undo()
    expect(toRaw(documentStore.raw).gist()?.id).toBe(ID)
    scope.stop()
  })

  it('a failed README patch still publishes: the gist exists and the link works, with a warning', async () => {
    backend.updateGist.mockRejectedValueOnce(new GistError('server', 'GitHub is having trouble right now'))
    buildProject()
    const { scope, api } = mount()
    const result = await api.publish()
    expect(result).toEqual({ ok: true, id: ID, link: gistLink(ID), revision: REV1, warning: 'readme' })
    expect(toRaw(useDocumentStore().raw).gist()).toEqual({ id: ID, public: false, lastRevision: REV1, owner: 'octocat' })
    expect(useGistStore().lastWarning).toBe('readme')
    scope.stop()
  })

  it('a failed create changes nothing and reports fixed wording', async () => {
    backend.createGist.mockRejectedValueOnce(new GistError('rate-limited', `limited; token ${TOKEN}`))
    buildProject()
    const { scope, api } = mount()
    const result = await api.publish()
    expect(result).toEqual({ ok: false, kind: 'rate-limited', message: 'GitHub is busy. Try again in a few minutes.' })
    expect(toRaw(useDocumentStore().raw).gist()).toBeNull()
    expect(backend.updateGist).not.toHaveBeenCalled()
    const gist = useGistStore()
    expect(gist.publishState).toBe('idle')
    expect(gist.lastErrorKind).toBe('rate-limited')
    expect(gist.lastErrorMessage).not.toContain(TOKEN)
    scope.stop()
  })

  it('reports publishing while the calls are in flight, and refuses a second call meanwhile', async () => {
    /** @type {(value: any) => void} */
    let release = () => {}
    backend.createGist.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    buildProject()
    const { scope, api } = mount()
    const first = api.publish()
    // Busy from the tap itself, before anything has been sent.
    expect(useGistStore().publishState).toBe('publishing')
    await vi.waitFor(() => expect(backend.createGist).toHaveBeenCalled())
    expect(await api.publish()).toMatchObject({ ok: false, kind: 'busy' })
    release({ id: ID, revision: REV1, url: '', rawUrls: {} })
    expect((await first).ok).toBe(true)
    expect(useGistStore().publishState).toBe('idle')
    scope.stop()
  })

  it('a project replaced while the gist was being created never gets the field', async () => {
    /** @type {(value: any) => void} */
    let release = () => {}
    backend.createGist.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)))
    buildProject()
    const { scope, api } = mount()
    const pending = api.publish()
    await vi.waitFor(() => expect(backend.createGist).toHaveBeenCalled())
    useDocumentStore().load([], null, 'normal')
    release({ id: ID, revision: REV1, url: '', rawUrls: {} })
    const result = await pending
    expect(result).toMatchObject({ ok: true, id: ID, warning: 'project-changed' })
    expect(toRaw(useDocumentStore().raw).gist()).toBeNull()
    expect(backend.updateGist).not.toHaveBeenCalled()
    scope.stop()
  })

  it('an already-published project is updated, not published twice', async () => {
    buildProject()
    const { scope, api } = mount()
    await api.publish()
    expect(await api.publish()).toMatchObject({ ok: false, kind: 'already-published' })
    expect(backend.createGist).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})

describe('the README carries the minimum', () => {
  it('lists body names only; never intent text or standing instructions, which stay in the project file', async () => {
    const documentStore = useDocumentStore()
    toRaw(documentStore.raw).append(CUBE, { origin: 'local', intent: 'SECRET-INTENT-TEXT' })
    documentStore.refresh()
    documentStore.append(CYLINDER)
    documentStore.setStandingInstructions('SECRET-STANDING-INSTRUCTIONS')
    usePersistenceStore().projectName = 'Phone stand'
    const { scope, api } = mount()
    await api.publish()
    const created = backend.createGist.mock.calls[0][0]
    for (const readme of [created.files['README.md'], readmeOf(backend.updateGist)]) {
      expect(readme).toContain('2 bodies: Base, Back plate')
      expect(readme).not.toContain('SECRET-INTENT-TEXT')
      expect(readme).not.toContain('SECRET-STANDING-INSTRUCTIONS')
      expect(readme).not.toContain(TOKEN)
    }
    // The owner chose to publish the whole project: the file itself still carries them.
    expect(created.files['phone-stand.ndjson']).toContain('SECRET-STANDING-INSTRUCTIONS')
    expect(created.description).not.toContain('SECRET')
    scope.stop()
  })
})

describe('update — the interim rule: refuse if the gist changed', () => {
  async function published() {
    buildProject()
    const mounted = mount()
    await mounted.api.publish()
    backend.createGist.mockClear()
    backend.updateGist.mockClear()
    backend.updateGist.mockResolvedValue({ id: ID, revision: REV3, url: '', rawUrls: {} })
    useDocumentStore().append({ ...CUBE, id: 'cube-2', name: 'Lip', params: { size: [5, 5, 5], center: [40, 0, 2.5] } })
    return mounted
  }

  it('reads the gist first and, at the revision last published, patches the same id with both files', async () => {
    const { scope, api } = await published()
    const expected = serializeProject(toRaw(useDocumentStore().raw))
    const result = await api.update()
    expect(backend.readGist).toHaveBeenCalledWith({ id: ID })
    expect(backend.updateGist).toHaveBeenCalledTimes(1)
    const patched = backend.updateGist.mock.calls[0][0]
    expect(patched.id).toBe(ID)
    expect(patched.token).toBe(TOKEN)
    expect(Object.keys(patched.files).sort()).toEqual(['README.md', 'phone-stand.ndjson'])
    // Exactly what Download copy would have written at that moment.
    expect(patched.files['phone-stand.ndjson']).toBe(expected)
    expect(patched.files['README.md']).toContain('3 bodies: Base, Back plate, Lip')
    expect(result).toEqual({ ok: true, id: ID, link: gistLink(ID), revision: REV3 })
    expect(toRaw(useDocumentStore().raw).gist().lastRevision).toBe(REV3)
    expect(backend.createGist).not.toHaveBeenCalled()
    scope.stop()
  })

  it('refuses, writing nothing, when the gist is at a revision this project never published', async () => {
    const { scope, api } = await published()
    backend.readGist.mockResolvedValueOnce({ id: ID, description: '', text: '', revision: 'f'.repeat(40), updatedAt: null, fileName: 'phone-stand.ndjson' })
    const result = await api.update()
    expect(result).toEqual({
      ok: false,
      kind: 'changed-remotely',
      message: 'This gist changed since you last published it. Open its link first, then update.',
    })
    expect(backend.updateGist).not.toHaveBeenCalled()
    expect(toRaw(useDocumentStore().raw).gist().lastRevision).toBe(REV2)
    scope.stop()
  })

  it('a cached read of a revision this session wrote earlier is not someone else\'s change', async () => {
    const { scope, api } = await published()
    // GitHub can serve a read up to 60 s old: the create's revision, not the README patch's.
    backend.readGist.mockResolvedValueOnce({ id: ID, description: '', text: '', revision: REV1, updatedAt: null, fileName: 'phone-stand.ndjson' })
    expect((await api.update()).ok).toBe(true)
    scope.stop()
  })

  it('a renamed project replaces the old file instead of leaving two', async () => {
    const { scope, api } = await published()
    usePersistenceStore().projectName = 'Desk stand'
    await api.update()
    const patched = backend.updateGist.mock.calls[0][0]
    expect(patched.files['phone-stand.ndjson']).toBeNull()
    expect(typeof patched.files['desk-stand.ndjson']).toBe('string')
    scope.stop()
  })

  it('a gist deleted on GitHub says it cannot be found and keeps the field', async () => {
    const { scope, api } = await published()
    backend.readGist.mockRejectedValueOnce(new GistError('not-found', 'That gist was not found'))
    const result = await api.update()
    expect(result).toMatchObject({ ok: false, kind: 'not-found' })
    expect(result.message).toMatch(/can't be found/)
    expect(backend.updateGist).not.toHaveBeenCalled()
    expect(toRaw(useDocumentStore().raw).gist()?.id).toBe(ID)
    scope.stop()
  })

  it('a project with no published gist has nothing to update', async () => {
    buildProject()
    const { scope, api } = mount()
    expect(await api.update()).toMatchObject({ ok: false, kind: 'not-published' })
    expect(backend.readGist).not.toHaveBeenCalled()
    scope.stop()
  })
})

describe('stop sharing', () => {
  it('deletes the gist and clears the field', async () => {
    buildProject()
    const { scope, api } = mount()
    await api.publish()
    const result = await api.stop()
    expect(backend.deleteGist).toHaveBeenCalledWith({ token: TOKEN, id: ID })
    expect(result).toEqual({ ok: true, alreadyGone: false })
    expect(toRaw(useDocumentStore().raw).gist()).toBeNull()
    expect(api.published.value).toBe(false)
    expect(api.link()).toBeNull()
    scope.stop()
  })

  it('a gist already gone (404) counts as stopped', async () => {
    buildProject()
    const { scope, api } = mount()
    await api.publish()
    backend.deleteGist.mockRejectedValueOnce(new GistError('not-found', 'gone'))
    expect(await api.stop()).toEqual({ ok: true, alreadyGone: true })
    expect(toRaw(useDocumentStore().raw).gist()).toBeNull()
    scope.stop()
  })

  it('any other failure keeps the field, so the link is not forgotten while the gist still exists', async () => {
    buildProject()
    const { scope, api } = mount()
    await api.publish()
    backend.deleteGist.mockRejectedValueOnce(new GistError('offline', 'No network'))
    expect(await api.stop()).toMatchObject({ ok: false, kind: 'offline' })
    expect(toRaw(useDocumentStore().raw).gist()?.id).toBe(ID)
    scope.stop()
  })
})

describe('someone else\'s gist field (an opened file, not a published one)', () => {
  it('is not "published" for this account: Update refuses and Publish makes this account\'s own gist', async () => {
    buildProject()
    const raw = toRaw(useDocumentStore().raw)
    raw.setGist({ id: 'bb22cc33dd44ee55ff66778899001122', public: false, lastRevision: REV1, owner: 'someoneelse' }, { origin: GIST_ORIGIN })
    useDocumentStore().refresh()
    const { scope, api } = mount()
    expect(api.published.value).toBe(false)
    expect(api.canPublish.value).toBe(true)
    expect(await api.update()).toMatchObject({ ok: false, kind: 'not-published' })
    expect(await api.stop()).toMatchObject({ ok: false, kind: 'not-published' })
    expect(backend.deleteGist).not.toHaveBeenCalled()
    const result = await api.publish()
    expect(result.ok).toBe(true)
    expect(raw.gist()).toEqual({ id: ID, public: false, lastRevision: REV2, owner: 'octocat' })
    scope.stop()
  })
})

describe('nothing is uploaded on its own', () => {
  it('editing, autosave, a page hide, Open and a reload of a published project never call GitHub', async () => {
    buildProject()
    const { scope, api } = mount()
    await api.publish()
    for (const fn of Object.values(backend)) fn.mockClear()

    const documentStore = useDocumentStore()
    const persistence = usePersistenceStore()
    await persistence.start()
    documentStore.append({ ...CUBE, id: 'cube-9', name: 'Later', params: { size: [3, 3, 3], center: [70, 0, 1.5] } })
    await persistence.flush()
    persistence.onVisibilityChange('hidden')
    await new Promise((resolve) => setTimeout(resolve, 700))
    const text = serializeProject(toRaw(documentStore.raw))
    expect(text).toContain(ID)
    await persistence.openText(text, 'phone-stand.ndjson')

    // A fresh app restoring the same session.
    setActivePinia(createPinia())
    setGistDependencies({ backend, credentials: memoryCredentials() })
    setPersistenceDependencies({ backend: autosave, files })
    const again = effectScope()
    again.run(() => useGistPublish())
    await usePersistenceStore().start()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(toRaw(useDocumentStore().raw).gist()?.id).toBe(ID)

    for (const fn of Object.values(backend)) expect(fn).not.toHaveBeenCalled()
    again.stop()
    scope.stop()
  })
})

/*
 * `TODO/io-020`: the Share sheet's Name is the gist's title. The sheet passes it in; the project
 * was never saved, so `persistence.projectName` is empty here.
 */
describe('the Share sheet\'s name is the gist\'s title (io-020)', () => {
  function unsavedProject() {
    buildProject()
    usePersistenceStore().projectName = ''
  }

  it('publish({ name }) names the file, the README heading and the description, though the project was never saved', async () => {
    unsavedProject()
    const { scope, api } = mount()
    await api.publish({ name: 'Fan Duct' })

    const created = backend.createGist.mock.calls[0][0]
    expect(created.description).toBe('Fan Duct')
    expect(Object.keys(created.files).sort()).toEqual(['README.md', 'fan-duct.ndjson'])
    expect(created.files['README.md']).toContain('# Fan Duct')
    expect(backend.updateGist.mock.calls[0][0].files['README.md']).toContain('# Fan Duct')
    scope.stop()
  })

  it('a sheet name changed between publish and update renames the description, README and file, and removes the old file', async () => {
    unsavedProject()
    const { scope, api } = mount()
    await api.publish({ name: 'Fan Duct' })
    backend.createGist.mockClear()
    backend.updateGist.mockClear()
    backend.updateGist.mockResolvedValue({ id: ID, revision: REV3, url: '', rawUrls: {} })
    // The gist as GitHub has it: the file the publish above created.
    backend.readGist.mockResolvedValueOnce({ id: ID, description: '', text: '', revision: REV2, updatedAt: null, fileName: 'fan-duct.ndjson' })

    await api.update({ name: 'Desk stand' })
    const patched = backend.updateGist.mock.calls[0][0]
    expect(patched.description).toBe('Desk stand')
    expect(patched.files['fan-duct.ndjson']).toBeNull()
    expect(typeof patched.files['desk-stand.ndjson']).toBe('string')
    expect(patched.files['README.md']).toContain('# Desk stand')
    scope.stop()
  })

  it('a blank sheet name publishes as Untitled, never an empty title', async () => {
    unsavedProject()
    const { scope, api } = mount()
    await api.publish({ name: '   ' })

    const created = backend.createGist.mock.calls[0][0]
    expect(created.description).toBe('Untitled')
    expect(created.files['README.md']).toContain('# Untitled')
    scope.stop()
  })
})
