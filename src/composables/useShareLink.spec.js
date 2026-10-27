// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { effectScope, nextTick, toRaw } from 'vue'

import { createDocument } from '../core/document.js'
import { parseNdjson } from '../core/ndjson.js'
import { parseProject, serializeProject } from '../core/project.js'
import { encodeShareLink } from '../core/shareLink.js'
import { useDocumentStore } from '../stores/document.js'
import { useFileMenuStore } from '../stores/fileMenu.js'
import { useMergeStore } from '../stores/merge.js'
import { setPersistenceDependencies, usePersistenceStore } from '../stores/persistence.js'
import { useShareStore } from '../stores/share.js'
import { useTimelineStore } from '../stores/timeline.js'
import { openShareLink, useShareLink } from './useShareLink.js'

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
