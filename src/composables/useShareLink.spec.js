// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, toRaw } from 'vue'

import { createDocument } from '../core/document.js'
import { parseNdjson } from '../core/ndjson.js'
import { parseProject, serializeProject } from '../core/project.js'
import { encodeShareLink } from '../core/shareLink.js'
import { GistError } from '../storage/gistBackend.js'
import { useDocumentStore } from '../stores/document.js'
import { useFileMenuStore } from '../stores/fileMenu.js'
import { setGistDependencies, useGistStore } from '../stores/gist.js'
import { useMergeStore } from '../stores/merge.js'
import { setPersistenceDependencies, usePersistenceStore } from '../stores/persistence.js'
import { useShareStore } from '../stores/share.js'
import { useTimelineStore } from '../stores/timeline.js'
import { openGistLink, openShareLink, useShareLink } from './useShareLink.js'

/**
 * `TODO/io-016` Stage 2 — the share route and the Shared view's three ways out, against the real
 * document, timeline, merge, File-menu and persistence stores. Only the boundary is faked
 * (CLAUDE.md): IndexedDB is an in-memory backend that records every write, the file layer is a
 * stub, and the address bar is an injected `env`. Runs in Node, where `CompressionStream` is real.
 */

// Hostile project files, read through Vite like `shareLink.spec.js` does (`src/` is typed for the browser).
const hostileFixtures = import.meta.glob('../../e2e/fixtures/hostile-*.ndjson', { query: '?raw', import: 'default', eager: true })

const CUBE = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const CYLINDER = { id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 16, height: 20, center: [-40, 0, 10] } }
const MINE = { id: 'mine-1', op: 'primitive.cuboid', name: 'My cube', params: { size: [5, 5, 5], center: [60, 0, 2.5] } }

/** An in-memory autosave backend that records every write — the IndexedDB boundary. */
function memoryBackend() {
  const backend = {
    /** @type {{ text: string, savedAt: number } | null} */
    stored: null,
    /** @type {{ text: string, savedAt: number }[]} */
    saves: [],
    async load() {
      return backend.stored
    },
    /** @param {{ text: string, savedAt: number }} record */
    async save(record) {
      backend.saves.push(record)
      backend.stored = record
    },
    async keepUnreadable() {},
  }
  return backend
}

/** The file layer, stubbed: nothing here may open a picker. */
const files = /** @type {any} */ ({
  capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
  currentName: null,
  save: async () => ({ ok: true, mode: 'fallback', name: 'x.ndjson' }),
  open: async () => ({ ok: false, cancelled: true }),
  adopt() {},
  forgetHandle() {},
})

/**
 * A fake address bar.
 *
 * @param {string} initial
 */
function fakeEnv(initial) {
  /** @type {Set<() => void>} */
  const listeners = new Set()
  const env = {
    current: initial,
    cleared: 0,
    hash: () => env.current,
    clearHash() {
      env.cleared += 1
      env.current = ''
    },
    /** @param {() => void} listener */
    onHashChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** @param {string} next */
    navigate(next) {
      env.current = next
      for (const listener of listeners) listener()
    },
    listenerCount: () => listeners.size,
  }
  return env
}

/**
 * The sender's project as records, with a project id (a project made in WarpCad mints one on
 * its first change).
 *
 * @param {string} [projectId]
 */
function senderRecords(projectId = 'senderproject0001') {
  const doc = createDocument({ mintProjectId: () => projectId })
  doc.append(CUBE, { origin: 'local' })
  doc.append(CYLINDER, { origin: 'local' })
  return parseNdjson(serializeProject(doc)).records
}

/** @param {readonly object[]} records @param {string} [name] */
const linkHash = async (records, name = 'Phone stand') => new URL(await encodeShareLink(records, { name, note: 'For Dad' })).hash

/** Let every queued promise and Vue watcher run. */
async function settle() {
  for (let i = 0; i < 8; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
  }
}

/** The live document's project id, read without minting one. */
const liveProjectId = () => toRaw(useDocumentStore().raw).mergeState().projectId

/** @type {ReturnType<typeof memoryBackend>} */
let backend

beforeEach(() => {
  setActivePinia(createPinia())
  backend = memoryBackend()
  setPersistenceDependencies({ backend, files })
})

afterEach(() => {
  usePersistenceStore().stop()
  setPersistenceDependencies(null)
})

/**
 * What the root view does: wire the route at setup, then boot storage.
 *
 * @param {ReturnType<typeof fakeEnv>} env
 */
async function boot(env) {
  const scope = effectScope()
  const route = scope.run(() => useShareLink({ env }))
  await usePersistenceStore().start()
  await settle()
  return { scope, route: /** @type {NonNullable<typeof route>} */ (route) }
}

describe('the share route at boot', () => {
  it('a valid link shows the Shared view: title, note, both bodies through Watch, the hash cleared', async () => {
    const env = fakeEnv(await linkHash(senderRecords()))
    const { scope } = await boot(env)
    const share = useShareStore()
    const timeline = useTimelineStore()
    expect(share.phase).toBe('ready')
    expect(share.name).toBe('Phone stand')
    expect(share.note).toBe('For Dad')
    expect(timeline.watching).toBe(true)
    expect(timeline.previewBodies?.map((body) => body.id).sort()).toEqual(['cube-1', 'cyl-1'])
    // The live document is not the shared one: nothing was loaded into it.
    expect(useDocumentStore().raw.entries).toHaveLength(0)
    expect(env.current).toBe('')
    expect(env.cleared).toBe(1)
    scope.stop()
  })

  it('suspends autosave synchronously at setup, before the boot restore can run', async () => {
    const env = fakeEnv(await linkHash(senderRecords()))
    const scope = effectScope()
    scope.run(() => useShareLink({ env }))
    expect(usePersistenceStore().autosaveSuspended).toBe(true)
    expect(useShareStore().phase).toBe('opening')
    await settle()
    scope.stop()
  })

  it('leaves the app alone when there is no share link (and a help link is not touched)', async () => {
    const env = fakeEnv('#/help/booleans')
    const { scope } = await boot(env)
    expect(useShareStore().phase).toBe('off')
    expect(usePersistenceStore().autosaveSuspended).toBe(false)
    expect(env.current).toBe('#/help/booleans')
    expect(env.cleared).toBe(0)
    scope.stop()
  })

  it.each([
    ['truncated', async () => (await linkHash(senderRecords())).slice(0, 60), 'malformed'],
    ['a version this build does not know', async () => '#/share/v9/abc', 'unsupported-version'],
    ['not base64url', async () => '#/share/v1/%%%%', 'malformed'],
  ])('a %s link shows the incomplete screen, loads nothing, and keeps its hash', async (_label, make, reason) => {
    const hash = await make()
    const env = fakeEnv(hash)
    const { scope } = await boot(env)
    const share = useShareStore()
    expect(share.phase).toBe('incomplete')
    expect(share.reason).toBe(reason)
    expect(useTimelineStore().watching).toBe(false)
    expect(useDocumentStore().raw.entries).toHaveLength(0)
    expect(env.current).toBe(hash)
    scope.stop()
  })

  it('Start WarpCad clears the unread link and returns to the editor with autosave back on', async () => {
    const env = fakeEnv('#/share/v1/AAAA')
    const { scope, route } = await boot(env)
    expect(useShareStore().phase).toBe('incomplete')
    route.leave()
    expect(useShareStore().phase).toBe('off')
    expect(env.current).toBe('')
    expect(usePersistenceStore().autosaveSuspended).toBe(false)
    scope.stop()
  })

  it('a link pasted into an open tab (hashchange) opens the Shared view; a help hash does not', async () => {
    const env = fakeEnv('')
    const { scope } = await boot(env)
    env.navigate('#/help/save-load')
    await settle()
    expect(useShareStore().phase).toBe('off')
    env.navigate(await linkHash(senderRecords()))
    await settle()
    expect(useShareStore().phase).toBe('ready')
    scope.stop()
    expect(env.listenerCount()).toBe(0)
  })

  it('a newer link supersedes a read still in flight', async () => {
    const env = fakeEnv('')
    const share = useShareStore()
    const deps = { env, share, restored: () => Promise.resolve() }
    const first = openShareLink(await linkHash(senderRecords(), 'First'), deps)
    const second = openShareLink(await linkHash(senderRecords(), 'Second'), deps)
    await Promise.all([first, second])
    expect(share.name).toBe('Second')
  })

  it('keeps showing the shared project when a whole-document load would end the Watch', async () => {
    const env = fakeEnv(await linkHash(senderRecords()))
    const { scope } = await boot(env)
    const timeline = useTimelineStore()
    useDocumentStore().load([], null, 'normal')
    await settle()
    expect(timeline.watching).toBe(true)
    expect(timeline.previewBodies).toHaveLength(2)
    scope.stop()
  })
})

describe('opening never writes', () => {
  it('the stored session is byte-identical after opening a link, flushing and hiding the page', async () => {
    const session = serializeProject((() => {
      const doc = createDocument({ mintProjectId: () => 'mineproject00001' })
      doc.append(MINE, { origin: 'local' })
      return doc
    })())
    backend.stored = { text: session, savedAt: 1000 }
    const env = fakeEnv(await linkHash(senderRecords()))
    const { scope } = await boot(env)
    expect(useShareStore().phase).toBe('ready')
    // Everything that would normally write: a document change, a flush, a page hide.
    useDocumentStore().append({ ...MINE, id: 'mine-2' })
    await usePersistenceStore().flush()
    usePersistenceStore().onVisibilityChange('hidden')
    await settle()
    expect(backend.saves).toEqual([])
    expect(backend.stored).toEqual({ text: session, savedAt: 1000 })
    // Leaving without making a copy writes nothing either.
    useShareStore().leave()
    await settle()
    expect(backend.saves).toEqual([])
    scope.stop()
  })
})

describe('Make my own copy to edit', () => {
  it('an empty browser (a first visit): no question, the editor holds the copy as a new project, and it autosaves', async () => {
    const env = fakeEnv(await linkHash(senderRecords()))
    const { scope } = await boot(env)
    useShareStore().makeCopy()
    await settle()
    expect(useFileMenuStore().confirm).toBeNull()
    expect(useShareStore().phase).toBe('off')
    expect(useDocumentStore().raw.entries.map((entry) => entry.record.id)).toEqual(['cube-1', 'cyl-1'])
    // A new local project (`TODO/data-013`), never mistaken for the sender's.
    expect(liveProjectId()).not.toBeNull()
    expect(liveProjectId()).not.toBe('senderproject0001')
    expect(usePersistenceStore().projectName).toBe('Phone stand')
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(backend.saves.length).toBeGreaterThan(0)
    scope.stop()
  })

  it('data-013 re-run: the copy refuses a merge of the sender\'s original as a different project', async () => {
    const records = senderRecords()
    const env = fakeEnv(await linkHash(records))
    const { scope } = await boot(env)
    useShareStore().makeCopy()
    await settle()
    const result = await usePersistenceStore().mergeText(serializeProject((() => {
      const doc = createDocument({ mintProjectId: () => 'senderproject0001' })
      doc.append(CUBE, { origin: 'local' })
      return doc
    })()), 'phone-stand.ndjson')
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : 'message' in result ? result.message : result.text).toMatch(/different project/)
    scope.stop()
  })

  it('a browser holding a session asks the existing Replace question first; Cancel keeps both', async () => {
    const mine = createDocument({ mintProjectId: () => 'mineproject00001' })
    mine.append(MINE, { origin: 'local' })
    backend.stored = { text: serializeProject(mine), savedAt: 1000 }
    const env = fakeEnv(await linkHash(senderRecords()))
    const { scope } = await boot(env)
    const menu = useFileMenuStore()
    useShareStore().makeCopy()
    expect(menu.confirm).toBe('share')
    menu.cancelConfirm()
    expect(useShareStore().phase).toBe('ready')
    expect(useDocumentStore().raw.entries.map((entry) => entry.record.id)).toEqual(['mine-1'])
    useShareStore().makeCopy()
    menu.confirmReplace()
    await settle()
    expect(useShareStore().phase).toBe('off')
    expect(useDocumentStore().raw.entries.map((entry) => entry.record.id)).toEqual(['cube-1', 'cyl-1'])
    expect(liveProjectId()).not.toBe('senderproject0001')
    scope.stop()
  })

  it('the same project re-sent offers Merge their changes (with Undo merge), not Replace', async () => {
    // The browser holds the sender's own project (same id); the link is a newer copy of it,
    // edited on another device (another replica) with one more step.
    const older = createDocument({ mintProjectId: () => 'senderproject0001' })
    older.append(CUBE, { origin: 'local' })
    const olderText = serializeProject(older)
    backend.stored = { text: olderText, savedAt: 1000 }
    const parsed = parseProject(olderText)
    const elsewhere = createDocument({ resolution: parsed.resolution })
    elsewhere.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed.merge === undefined ? {} : { merge: parsed.merge })
    elsewhere.append(CYLINDER, { origin: 'local' })
    const update = parseNdjson(serializeProject(elsewhere)).records

    const env = fakeEnv(await linkHash(update, 'Phone stand v2'))
    const { scope } = await boot(env)
    expect(useShareStore().phase).toBe('ready')
    expect(useDocumentStore().raw.entries.map((entry) => entry.record.id)).toEqual(['cube-1'])
    const menu = useFileMenuStore()
    useShareStore().makeCopy()
    expect(menu.confirm).toBe('share-update')
    menu.confirmMerge()
    await settle()
    expect(useShareStore().phase).toBe('off')
    expect(useDocumentStore().raw.entries.map((entry) => entry.record.id).sort()).toEqual(['cube-1', 'cyl-1'])
    expect(liveProjectId()).toBe('senderproject0001')
    expect(useMergeStore().notice?.undoable).toBe(true)
    scope.stop()
  })
})

describe('hostile projects behave through a link exactly as through Open…', () => {
  it.each(Object.entries(hostileFixtures))('%s', async (_path, text) => {
    // Through Open…
    const opened = await usePersistenceStore().openText(text, 'hostile.ndjson')
    const openedIds = useDocumentStore().raw.entries.map((entry) => entry.record.id)
    const openedIntents = useDocumentStore().raw.entries.map((entry) => entry.intent ?? null)

    // Through a link, in a fresh app.
    setActivePinia(createPinia())
    setPersistenceDependencies({ backend: memoryBackend(), files })
    const env = fakeEnv(await linkHash(parseNdjson(text).records, 'Hostile'))
    const { scope } = await boot(env)
    const share = useShareStore()
    if (!opened.ok) {
      expect(share.phase).toBe('incomplete')
    } else {
      expect(share.phase).toBe('ready')
      const shown = useTimelineStore().previewDocument()
      expect(shown?.entries.map((entry) => entry.record.id)).toEqual(openedIds)
      expect(shown?.entries.map((entry) => entry.intent ?? null)).toEqual(openedIntents)
    }
    scope.stop()
  })
})

/* ------------------------------------------------------------------ io-017 */

const GIST_ID = 'aa11bb22cc33dd44ee55ff6677889900'
const OTHER_GIST_ID = 'bb22cc33dd44ee55ff66778899001122'
const REVISION = 'c'.repeat(40)
const GIST_HASH = `#/gist/${GIST_ID}`

/**
 * A project as a gist holds it: published by its owner, so it carries the `gist` field.
 *
 * @param {{ projectId?: string, gistId?: string, extra?: boolean }} [options]
 */
function publishedText({ projectId = 'senderproject0001', gistId = GIST_ID, extra = false } = {}) {
  const doc = createDocument({ mintProjectId: () => projectId })
  doc.append(CUBE, { origin: 'local' })
  if (extra) doc.append(CYLINDER, { origin: 'local' })
  doc.setGist({ id: gistId, public: false, lastRevision: REVISION, owner: 'octocat' }, { origin: 'gist' })
  return serializeProject(doc)
}

/** @typedef {(options: { id: string }) => Promise<import('../storage/gistBackend.js').GistRead>} FakeRead */

/**
 * The unauthenticated gist read, faked at the boundary. Typed loosely (`any`): a `vi.fn` is not
 * the client's exact signature, and the store under test is the typed side.
 *
 * @param {FakeRead} read
 * @returns {any}
 */
function gistBackend(read) {
  return {
    validateGistToken: vi.fn(),
    createGist: vi.fn(),
    updateGist: vi.fn(),
    deleteGist: vi.fn(),
    readGist: vi.fn(read),
  }
}

/**
 * @param {string} text
 * @param {string} [description]
 * @returns {FakeRead}
 */
const servedAs = (text, description = 'Phone stand') => async ({ id }) => ({
  id,
  description,
  text,
  revision: REVISION,
  updatedAt: '2026-10-28T14:05:00Z',
  fileName: 'phone-stand.ndjson',
})

/** @type {import('../storage/tokenStorage.js').CredentialStore} */
const noCredentials = { read: async () => null, write: async () => {}, clear: async () => {}, close() {} }

describe('the gist route at boot (io-017)', () => {
  /** @type {any} */
  let gistApi

  beforeEach(() => {
    gistApi = gistBackend(servedAs(publishedText({ extra: true })))
    setGistDependencies({ backend: gistApi, credentials: noCredentials })
  })

  afterEach(() => setGistDependencies(null))

  it('reads the gist with no token and shows the Shared view: both bodies, the title, the hash cleared', async () => {
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    expect(gistApi.readGist).toHaveBeenCalledWith({ id: GIST_ID })
    const share = useShareStore()
    const gist = useGistStore()
    expect(share.phase).toBe('ready')
    expect(share.name).toBe('Phone stand')
    expect(gist.linkPhase).toBe('shown')
    expect(gist.linkId).toBe(GIST_ID)
    expect(gist.linkDescription).toBe('Phone stand')
    expect(useTimelineStore().previewBodies?.map((body) => body.id).sort()).toEqual(['cube-1', 'cyl-1'])
    expect(useDocumentStore().raw.entries).toHaveLength(0)
    expect(env.current).toBe('')
    expect(env.cleared).toBe(1)
    scope.stop()
  })

  it('suspends autosave synchronously at setup, before the boot restore can run', async () => {
    const env = fakeEnv(GIST_HASH)
    const scope = effectScope()
    scope.run(() => useShareLink({ env }))
    expect(usePersistenceStore().autosaveSuspended).toBe(true)
    expect(useShareStore().phase).toBe('opening')
    expect(useGistStore().linkPhase).toBe('opening')
    await settle()
    scope.stop()
  })

  it.each([
    ['a trailing slash', `${GIST_HASH}/`],
    ['surrounding whitespace (a pasted value)', `  ${GIST_HASH} \n`],
  ])('accepts %s', async (_label, hash) => {
    const env = fakeEnv(hash)
    const { scope } = await boot(env)
    expect(gistApi.readGist).toHaveBeenCalledWith({ id: GIST_ID })
    expect(useShareStore().phase).toBe('ready')
    scope.stop()
  })

  it.each([
    ['rate-limited', new GistError('rate-limited', 'limited'), 'GitHub is busy. Try again in a few minutes.'],
    ['not-found', new GistError('not-found', 'gone'), /^This shared project can't be found\./],
    ['empty', new GistError('empty', 'empty'), /^This shared project can't be found\./],
    ['no-project-file', new GistError('no-project-file', 'none'), /^This shared project can't be found\./],
    ['offline', new GistError('offline', 'No network'), /^No network\./],
  ])('a %s read shows the full-screen message, loads nothing and keeps the hash', async (kind, error, wording) => {
    gistApi.readGist.mockImplementation(async () => {
      throw error
    })
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    const share = useShareStore()
    const gist = useGistStore()
    expect(share.phase).toBe('incomplete')
    expect(gist.linkPhase).toBe('failed')
    expect(gist.linkReason).toBe(kind)
    if (typeof wording === 'string') expect(gist.linkMessage).toBe(wording)
    else expect(gist.linkMessage).toMatch(wording)
    expect(gist.linkMessage).not.toContain(GIST_ID)
    expect(useTimelineStore().watching).toBe(false)
    expect(useDocumentStore().raw.entries).toHaveLength(0)
    expect(env.current).toBe(GIST_HASH)
    scope.stop()
  })

  it('a gist whose project file does not load is "can\'t be opened", never a half-parsed project', async () => {
    gistApi.readGist.mockImplementation(servedAs('{"id":"a","op":"primitive.cuboid"}\nthis is not json\n'))
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    expect(useShareStore().phase).toBe('incomplete')
    expect(useGistStore().linkReason).toBe('unreadable')
    expect(useGistStore().linkMessage).toMatch(/can't be opened/)
    expect(useTimelineStore().watching).toBe(false)
    scope.stop()
  })

  it('a link that is not a gist id never reaches GitHub', async () => {
    const env = fakeEnv('#/gist/../../user')
    const { scope } = await boot(env)
    expect(gistApi.readGist).not.toHaveBeenCalled()
    expect(useShareStore().phase).toBe('incomplete')
    expect(useGistStore().linkReason).toBe('invalid-link')
    expect(useGistStore().linkMessage).toMatch(/incomplete/)
    scope.stop()
  })

  it('Start WarpCad clears an unread gist link and returns to the editor with autosave back on', async () => {
    gistApi.readGist.mockImplementation(async () => {
      throw new GistError('not-found', 'gone')
    })
    const env = fakeEnv(GIST_HASH)
    const { scope, route } = await boot(env)
    route.leave()
    expect(useShareStore().phase).toBe('off')
    expect(useGistStore().linkPhase).toBe('off')
    expect(env.current).toBe('')
    expect(usePersistenceStore().autosaveSuspended).toBe(false)
    scope.stop()
  })

  it('the gist description is untrusted: shown as one capped line of plain text, HTML and Markdown literal', async () => {
    const hostile = '<img src=x onerror=alert(1)>\n**bold** [x](javascript:alert(1))\u202E' + 'x'.repeat(5000)
    gistApi.readGist.mockImplementation(servedAs(publishedText(), hostile))
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    const gist = useGistStore()
    expect(typeof gist.linkDescription).toBe('string')
    expect(gist.linkDescription.startsWith('<img src=x onerror=alert(1)> **bold** [x](javascript:alert(1))x')).toBe(true)
    expect(gist.linkDescription).not.toMatch(/[\n\u202E]/)
    expect(Array.from(gist.linkDescription).length).toBeLessThanOrEqual(200)
    expect(Array.from(useShareStore().name).length).toBeLessThanOrEqual(200)
    scope.stop()
  })

  it('a gist link pasted into an open tab opens it; a help hash is never read as a gist and keeps its own route', async () => {
    const env = fakeEnv('#/help/booleans')
    const { scope } = await boot(env)
    expect(gistApi.readGist).not.toHaveBeenCalled()
    expect(useShareStore().phase).toBe('off')
    expect(env.current).toBe('#/help/booleans')
    env.navigate(GIST_HASH)
    await settle()
    expect(useShareStore().phase).toBe('ready')
    expect(useGistStore().linkPhase).toBe('shown')
    // The gist route owns `#/gist/`: a help hash arriving afterwards is not something it clears.
    env.navigate('#/help/save-load')
    await settle()
    expect(env.current).toBe('#/help/save-load')
    expect(gistApi.readGist).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('a newer gist link supersedes a read still in flight', async () => {
    /** @type {(value: any) => void} */
    let releaseFirst = () => {}
    gistApi.readGist
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)))
      .mockImplementationOnce(servedAs(publishedText(), 'Second'))
    const env = fakeEnv('')
    const deps = { env, share: useShareStore(), gist: useGistStore(), restored: () => Promise.resolve() }
    const first = openGistLink(GIST_HASH, deps)
    const second = openGistLink(`#/gist/${OTHER_GIST_ID}`, deps)
    await second
    releaseFirst(await servedAs(publishedText(), 'First')({ id: GIST_ID }))
    await first
    expect(useShareStore().name).toBe('Second')
    expect(useGistStore().linkId).toBe(OTHER_GIST_ID)
  })
})

describe('opening a gist never writes (io-016 re-run, gist fixture)', () => {
  afterEach(() => setGistDependencies(null))

  it('the stored session is byte-identical after opening a gist link, flushing and hiding the page', async () => {
    setGistDependencies({ backend: gistBackend(servedAs(publishedText())), credentials: noCredentials })
    const session = serializeProject((() => {
      const doc = createDocument({ mintProjectId: () => 'mineproject00001' })
      doc.append(MINE, { origin: 'local' })
      return doc
    })())
    backend.stored = { text: session, savedAt: 1000 }
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    expect(useShareStore().phase).toBe('ready')
    useDocumentStore().append({ ...MINE, id: 'mine-2' })
    await usePersistenceStore().flush()
    usePersistenceStore().onVisibilityChange('hidden')
    await settle()
    expect(backend.saves).toEqual([])
    expect(backend.stored).toEqual({ text: session, savedAt: 1000 })
    useShareStore().leave()
    await settle()
    expect(backend.saves).toEqual([])
    scope.stop()
  })
})

describe('Make my own copy to edit, from a gist', () => {
  afterEach(() => setGistDependencies(null))

  it('the copy is a new project and never inherits the sender\'s gist', async () => {
    setGistDependencies({ backend: gistBackend(servedAs(publishedText())), credentials: noCredentials })
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    useShareStore().makeCopy()
    await settle()
    expect(useShareStore().phase).toBe('off')
    expect(useDocumentStore().raw.entries.map((entry) => entry.record.id)).toEqual(['cube-1'])
    expect(toRaw(useDocumentStore().raw).gist()).toBeNull()
    expect(liveProjectId()).not.toBe('senderproject0001')
    scope.stop()
  })
})

describe('the owner opening their own gist link', () => {
  afterEach(() => setGistDependencies(null))

  /** The owner's browser holds the published project; the gist has one more body from another device. */
  function ownerSession() {
    backend.stored = { text: publishedText(), savedAt: 1000 }
    setGistDependencies({ backend: gistBackend(servedAs(publishedText({ extra: true }))), credentials: noCredentials })
  }

  it('is not shown as a read-only copy: the state is own-link', async () => {
    ownerSession()
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    expect(useGistStore().linkPhase).toBe('own-link')
    expect(useGistStore().linkId).toBe(GIST_ID)
    expect(env.current).toBe('')
    scope.stop()
  })

  it('a link to a different gist than the project\'s own is the ordinary Shared view', async () => {
    backend.stored = { text: publishedText({ gistId: OTHER_GIST_ID }), savedAt: 1000 }
    setGistDependencies({ backend: gistBackend(servedAs(publishedText({ extra: true }))), credentials: noCredentials })
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    expect(useGistStore().linkPhase).toBe('shown')
    scope.stop()
  })

  it('a project carrying someone else\'s gist (a file sent by hand) is not the owner when another account is connected', async () => {
    backend.stored = { text: publishedText(), savedAt: 1000 }
    /** @type {import('../storage/tokenStorage.js').CredentialStore} */
    const someoneElse = {
      read: async () => ({ token: 'github_pat_FAKEfake_0123456789abcdefOTHER', login: 'someoneelse', tokenKind: 'fine-grained' }),
      write: async () => {},
      clear: async () => {},
      close() {},
    }
    setGistDependencies({ backend: gistBackend(servedAs(publishedText({ extra: true }))), credentials: someoneElse })
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    expect(useGistStore().login).toBe('someoneelse')
    expect(useGistStore().linkPhase).toBe('shown')
    scope.stop()
  })

  it('Open it to edit stays in the current project and merges the gist in through mergeIn', async () => {
    ownerSession()
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    expect(useDocumentStore().raw.entries.map((entry) => entry.record.id)).toEqual(['cube-1'])
    const result = await useGistStore().openOwnToEdit()
    await settle()
    expect(result?.ok).toBe(true)
    expect(useShareStore().phase).toBe('off')
    expect(useGistStore().linkPhase).toBe('off')
    expect(usePersistenceStore().autosaveSuspended).toBe(false)
    expect(useDocumentStore().raw.entries.map((entry) => entry.record.id).sort()).toEqual(['cube-1', 'cyl-1'])
    expect(liveProjectId()).toBe('senderproject0001')
    expect(toRaw(useDocumentStore().raw).gist()?.id).toBe(GIST_ID)
    expect(useMergeStore().notice?.undoable).toBe(true)
    scope.stop()
  })

  it('Make a copy asks the existing Replace question and lands a new project without the gist', async () => {
    ownerSession()
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    const menu = useFileMenuStore()
    useGistStore().makeOwnCopy()
    expect(menu.confirm).toBe('share')
    menu.confirmReplace()
    await settle()
    expect(useShareStore().phase).toBe('off')
    expect(useDocumentStore().raw.entries.map((entry) => entry.record.id).sort()).toEqual(['cube-1', 'cyl-1'])
    expect(liveProjectId()).not.toBe('senderproject0001')
    expect(toRaw(useDocumentStore().raw).gist()).toBeNull()
    scope.stop()
  })
})

describe('hostile projects behave through a gist exactly as through Open…', () => {
  afterEach(() => setGistDependencies(null))

  it.each(Object.entries(hostileFixtures))('%s', async (_path, text) => {
    const opened = await usePersistenceStore().openText(text, 'hostile.ndjson')
    const openedIds = useDocumentStore().raw.entries.map((entry) => entry.record.id)

    setActivePinia(createPinia())
    setPersistenceDependencies({ backend: memoryBackend(), files })
    setGistDependencies({ backend: gistBackend(servedAs(text, 'Hostile')), credentials: noCredentials })
    const env = fakeEnv(GIST_HASH)
    const { scope } = await boot(env)
    const share = useShareStore()
    if (!opened.ok) {
      expect(share.phase).toBe('incomplete')
      expect(useGistStore().linkReason).toBe('unreadable')
    } else {
      expect(share.phase).toBe('ready')
      expect(useTimelineStore().previewDocument()?.entries.map((entry) => entry.record.id)).toEqual(openedIds)
    }
    scope.stop()
  })
})
