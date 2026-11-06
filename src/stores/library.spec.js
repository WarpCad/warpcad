// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives a hand-written in-memory fake of the library backend, as userLibrary.spec.js
// does; the store under test is fully typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { piBoltRepeated } from '../core/__fixtures__/piScenes.js'
import { createUserLibrary } from '../storage/userLibrary.js'
import { resetUserParts, setLibraryParts, effectiveUserPart } from '../core/userPart.js'
import { cubeTriangles, binaryStl, asciiBytes } from '../io/__fixtures__/stl.js'
import { setMeshWorkerFactory } from '../io/meshClient.js'
import { useDocumentStore } from './document.js'
import { useLibraryStore } from './library.js'
import { useSelectionStore } from './selection.js'
import { useTimelineStore } from './timeline.js'

/**
 * `TODO/ui-055` — the Library's UI state: the Save to library gate by selection count, the
 * sheet's name validation, the save → My parts → rename/duplicate/delete flow, and the
 * delete-with-instances copy. The IndexedDB library and the file download are the boundaries
 * and are faked; the document, selection and kernel are real.
 */

/** An in-memory stand-in for `storage/userLibrary.js`'s object. */
function fakeBackend(initial = []) {
  /** @type {Map<string, { definition: any, thumbnail?: string }>} */
  const rows = new Map(initial.map((definition) => [definition.op, { definition }]))
  let clock = 0
  return {
    rows,
    async list() {
      return {
        parts: [...rows.values()].map((row) => row.definition),
        problems: [],
        thumbnails: Object.fromEntries([...rows].filter(([, row]) => row.thumbnail).map(([op, row]) => [op, row.thumbnail])),
        savedAt: Object.fromEntries([...rows].map(([op, row]) => [op, row.savedAt ?? 0])),
      }
    },
    async save(definition, extras = {}) {
      const kept = rows.get(definition.op)?.thumbnail
      rows.set(definition.op, { definition, thumbnail: extras.thumbnail ?? kept, savedAt: (clock += 1) })
      return definition
    },
    async remove(op) {
      rows.delete(op)
    },
    close() {},
  }
}

function setup(backend = fakeBackend()) {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const library = useLibraryStore()
  const downloads = []
  library.useBackend(backend, {
    download: (text, name) => downloads.push({ text, name }),
    thumbnailer: () => 'data:image/png;base64,AAAA',
  })
  documentStore.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } }, { origin: 'local' })
  documentStore.append({ id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { height: 20, diameter: 6, center: [8, 0, 10] } }, { origin: 'local' })
  return { documentStore, selection, library, backend, downloads }
}

function combine(documentStore, selection) {
  documentStore.append(
    { id: 'group-1', op: 'group.assemble', name: 'Group 1', target: 'cube-1', operands: ['cyl-1'], consumes: ['cube-1', 'cyl-1'], params: { names: ['Cube 1', 'Cylinder 1'] } },
    { origin: 'local' }
  )
  selection.select('group-1')
}

beforeEach(() => resetUserParts())
afterEach(() => resetUserParts())

describe('Save to library — the gate follows the selection count', () => {
  it('is disabled with nothing selected, and says to select a group', () => {
    const { library } = setup()
    expect(library.saveGate.enabled).toBe(false)
    expect(library.saveGate.reason).toMatch(/select/i)
    expect(library.openSave()).toBe(false)
    expect(library.saveOpen).toBe(false)
  })

  it('is enabled at exactly one, and disabled at two with the Combine into group hint', () => {
    const { library, selection } = setup()
    selection.select('cube-1')
    expect(library.saveGate.enabled).toBe(true)
    selection.selectMany(['cube-1', 'cyl-1'])
    expect(library.saveGate.enabled).toBe(false)
    expect(library.saveGate.reason).toMatch(/combine into group/i)
    expect(library.openSave()).toBe(false)
  })

  it('is disabled for a repeat body, with the reason on the gate (TODO/ui-076)', () => {
    const { library, selection, documentStore } = setup()
    documentStore.load(piBoltRepeated().entries.map((entry) => ({ ...entry })))
    const repeat = documentStore.raw.bodies().find((body) => body.recordId === 'rep-1')
    expect(repeat).toBeDefined()
    selection.select(repeat.id)
    expect(library.saveGate.enabled).toBe(false)
    expect(library.saveGate.reason).toMatch(/repeat can't be saved/i)
    expect(library.openSave()).toBe(false)
    expect(library.saveOpen).toBe(false)
  })

  it('is disabled while a past step is being previewed', () => {
    const { library, selection } = setup()
    const timeline = useTimelineStore()
    timeline.selectRow(timeline.rows[0].id)
    expect(timeline.previewing).toBe(true)
    // The preview cleared the selection; selecting again does not end it.
    selection.select('cube-1')
    expect(library.saveGate.enabled).toBe(false)
    expect(library.saveGate.reason).toMatch(/preview/i)
  })
})

describe('the Save sheet', () => {
  it('opens on the selected group with a suggested name, the My parts category and the group’s numbers to expose', () => {
    const { library, selection, documentStore } = setup()
    combine(documentStore, selection)
    expect(library.openSave()).toBe(true)
    expect(library.saveOpen).toBe(true)
    expect(library.saveName).toBe('Group 1')
    expect(library.saveCategory).toBe('user')
    expect(library.saveCandidates.map((c) => c.label)).toContain('Cylinder 1 height')
    expect(library.saveChosen).toEqual([])
  })

  it('validates the name live: empty, too long, and duplicate each give their own message and block Save', async () => {
    const { library, selection, documentStore } = setup()
    combine(documentStore, selection)
    library.openSave()

    library.saveName = ''
    expect(library.nameProblem).toMatch(/name/i)
    expect(library.canSave).toBe(false)

    library.saveName = 'x'.repeat(81)
    expect(library.nameProblem).toMatch(/80/)
    expect(library.canSave).toBe(false)

    library.saveName = 'Standoff'
    expect(library.nameProblem).toBe('')
    expect(library.canSave).toBe(true)
    await library.save()

    // The same name again — now it exists.
    selection.select('group-1')
    library.openSave()
    library.saveName = 'standoff'
    expect(library.nameProblem).toMatch(/already/i)
    expect(library.canSave).toBe(false)
    expect(await library.save()).toBe(false)
  })

  it('saves: the row exists, the library layer has it, the sheet closes, My parts opens, a toast says so', async () => {
    const { library, selection, documentStore, backend } = setup()
    combine(documentStore, selection)
    library.openSave()
    library.saveName = 'Standoff'
    library.saveChosen = [library.saveCandidates.find((c) => c.label === 'Cylinder 1 height').key]
    expect(await library.save()).toBe(true)

    expect(library.saveOpen).toBe(false)
    expect(library.expanded).toBe(true)
    expect(library.toast.text).toBe('Saved Standoff')
    expect(backend.rows.has('user.standoff')).toBe(true)
    expect(backend.rows.get('user.standoff').thumbnail).toMatch(/^data:image\/png/)
    expect(effectiveUserPart('user.standoff')?.params).toHaveLength(1)
    expect(library.userRows.map((row) => row.label)).toEqual(['Standoff'])
    expect(library.userRows[0]).toMatchObject({ op: 'user.standoff', inLibrary: true, usage: 0 })
    expect(library.userRows[0].thumbnail).toMatch(/^data:image\/png/)
  })

  it('keeps the sheet open and says why when storing fails', async () => {
    const { library, selection, documentStore } = setup()
    combine(documentStore, selection)
    library.openSave()
    library.saveName = 'Fails'
    library.useBackend(
      { ...fakeBackend(), save: async () => { throw new Error('storage is full') } },
      { download: () => {}, thumbnailer: () => null }
    )
    expect(await library.save()).toBe(false)
    expect(library.saveOpen).toBe(true)
    expect(library.saveError).toMatch(/storage is full/)
    expect(library.saving).toBe(false)
  })
})

describe('My parts rows', () => {
  async function savedStandoff() {
    const ctx = setup()
    combine(ctx.documentStore, ctx.selection)
    ctx.library.openSave()
    ctx.library.saveName = 'Standoff'
    await ctx.library.save()
    return ctx
  }

  it('marks a part used in the project, and counts its placed instances', async () => {
    const { library, documentStore } = await savedStandoff()
    expect(library.userRows[0].usage).toBe(0)
    documentStore.append({ id: 'u-1', op: 'user.standoff', name: 'Standoff 1', params: {} }, { origin: 'local' })
    documentStore.append({ id: 'u-2', op: 'user.standoff', name: 'Standoff 2', params: {} }, { origin: 'local' })
    expect(library.userRows[0].usage).toBe(2)
  })

  it('renames in place: same op, new label, refused if it collides with another part', async () => {
    const { library, backend } = await savedStandoff()
    library.beginRename('user.standoff')
    expect(library.renameName).toBe('Standoff')
    library.renameName = ''
    expect(library.renameProblem).toMatch(/name/i)
    library.renameName = 'Spacer'
    expect(library.renameProblem).toBe('')
    expect(await library.commitRename()).toBe(true)
    expect(backend.rows.get('user.standoff').definition.name).toBe('Spacer')
    expect(library.userRows.map((row) => row.label)).toEqual(['Spacer'])
    expect(backend.rows.get('user.standoff').thumbnail).toBeTruthy()
  })

  it('duplicates into a new part named "<name> copy", with the same thumbnail', async () => {
    const { library, backend } = await savedStandoff()
    expect(await library.duplicate('user.standoff')).toBe(true)
    expect(backend.rows.has('user.standoff-copy')).toBe(true)
    expect(backend.rows.get('user.standoff-copy').thumbnail).toBe(backend.rows.get('user.standoff').thumbnail)
    // Newest first.
    expect(library.userRows.map((row) => row.label)).toEqual(['Standoff copy', 'Standoff'])
    expect(library.revealOp).toBe('user.standoff-copy')
    expect(await library.duplicate('user.standoff')).toBe(true)
    expect(backend.rows.has('user.standoff-copy-2')).toBe(true)
  })

  it('exports a part file named after the part, containing it', async () => {
    const { library, downloads } = await savedStandoff()
    expect(library.exportPart('user.standoff')).toBe(true)
    expect(downloads).toHaveLength(1)
    expect(downloads[0].name).toBe('standoff.warpcad-part.json')
    expect(JSON.parse(downloads[0].text).parts[0].op).toBe('user.standoff')
  })

  it('imports a part file into the library, skipping a part that already exists and reporting a bad one', async () => {
    const source = await savedStandoff()
    source.library.exportPart('user.standoff')
    const text = source.downloads[0].text

    // A fresh session: nothing registered yet.
    resetUserParts()
    const { library, backend } = setup()
    expect(await library.importText(text)).toMatchObject({ added: ['Standoff'], skipped: [], problems: [] })
    expect(backend.rows.has('user.standoff')).toBe(true)
    expect(library.toast.text).toBe('Imported Standoff')
    expect(await library.importText(text)).toMatchObject({ added: [], skipped: ['Standoff'] })
    const bad = await library.importText('{nope')
    expect(bad.problems[0].reason).toMatch(/JSON/)
    expect(library.importError).toMatch(/JSON/)
  })
})

describe('Import model file — the Library flow (TODO/io-009)', () => {
  const fileOf = (bytes, name) => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })

  beforeEach(() => setMeshWorkerFactory(() => { throw new Error('no worker in jsdom') }))

  it('adds the file as a Mesh part with its size, toast and thumbnail, and refuses a bad file inline', async () => {
    const { library, backend } = setup()
    const outcome = await library.importModel(fileOf(binaryStl(cubeTriangles(20)), 'bracket.stl'))
    expect(outcome).toMatchObject({ ok: true, op: 'user.bracket' })
    expect(backend.rows.get('user.bracket').thumbnail).toBe('data:image/png;base64,AAAA')
    const row = library.userRows.find((candidate) => candidate.op === 'user.bracket')
    expect(row.mesh).toMatchObject({ triangleCount: 12, units: 'mm', unitsConfirmed: false, sizeText: '20 × 20 × 20 mm' })
    expect(library.toast.text).toBe('Imported bracket.stl — 12 triangles, 20 × 20 × 20 mm')
    expect(library.expanded).toBe(true)
    expect(library.modelImporting).toBe('')

    const before = library.userRows.length
    const bad = await library.importModel(fileOf(asciiBytes('this is not a model'), 'x.stl'))
    expect(bad.ok).toBe(false)
    expect(library.importError).not.toBe('')
    expect(library.userRows).toHaveLength(before)
  })

  it('names a second import of the same file "<name> copy" and re-reads in other units as a new version', async () => {
    const { library, backend } = setup()
    await library.importModel(fileOf(binaryStl(cubeTriangles(2)), 'bracket.stl'))
    await library.importModel(fileOf(binaryStl(cubeTriangles(2)), 'bracket.stl'))
    expect(backend.rows.has('user.bracket-copy')).toBe(true)
    expect(await library.setMeshUnits('user.bracket', 'inch')).toBe(true)
    const row = library.userRows.find((candidate) => candidate.op === 'user.bracket')
    expect(row.mesh).toMatchObject({ units: 'inch', unitsConfirmed: true, sizeText: '50.8 × 50.8 × 50.8 mm' })
    expect(backend.rows.get('user.bracket').definition.version).toBe(2)
  })
})

describe('Delete — it never deletes placed geometry', () => {
  async function standoffWithInstances(count) {
    const ctx = setup()
    combine(ctx.documentStore, ctx.selection)
    ctx.library.openSave()
    ctx.library.saveName = 'Standoff'
    await ctx.library.save()
    for (let i = 1; i <= count; i += 1) {
      ctx.documentStore.append({ id: `u-${i}`, op: 'user.standoff', name: `Standoff ${i}`, params: {} }, { origin: 'local' })
    }
    return ctx
  }

  it('with no placed instances, offers a plain Delete', async () => {
    const { library } = await standoffWithInstances(0)
    library.beginDelete('user.standoff')
    expect(library.deletePrompt).toMatchObject({ name: 'Standoff', usage: 0, confirmLabel: 'Delete' })
    expect(library.deletePrompt.message).not.toMatch(/placed instance/i)
  })

  it('with instances, says how many, and the default action is "Keep a copy in the project"', async () => {
    const { library } = await standoffWithInstances(3)
    library.beginDelete('user.standoff')
    expect(library.deletePrompt.usage).toBe(3)
    expect(library.deletePrompt.confirmLabel).toBe('Keep a copy in the project')
    expect(library.deletePrompt.message).toMatch(/3 placed/)
    expect(library.deletePrompt.message).toMatch(/stay in the project/i)
  })

  it('confirming removes it from the library only: instances, their geometry and the project copy stay', async () => {
    const { library, backend, documentStore } = await standoffWithInstances(2)
    const before = documentStore.bodies.length
    library.beginDelete('user.standoff')
    expect(await library.confirmDelete()).toBe(true)
    expect(backend.rows.has('user.standoff')).toBe(false)
    expect(documentStore.bodies.length).toBe(before)
    expect(effectiveUserPart('user.standoff')).toBeDefined()
    expect(library.userRows.map((row) => [row.label, row.inLibrary])).toEqual([['Standoff', false]])
    expect(library.deleteOp).toBe(null)
  })

  it('cancel changes nothing', async () => {
    const { library, backend } = await standoffWithInstances(1)
    library.beginDelete('user.standoff')
    library.cancelDelete()
    expect(library.deleteOp).toBe(null)
    expect(backend.rows.has('user.standoff')).toBe(true)
  })

  it('a part nothing uses disappears from the list when deleted', async () => {
    const { library } = await standoffWithInstances(0)
    library.beginDelete('user.standoff')
    await library.confirmDelete()
    expect(library.userRows).toEqual([])
  })
})

/** A real `createUserLibrary` over a tiny in-memory IndexedDB, so list() really validates (TODO/ui-095). */
function storedBackend(initial) {
  const data = new Map(initial)
  const open = async () => ({
    close() {},
    transaction: () => ({
      store: {
        get: async (key) => data.get(key),
        getAll: async () => [...data.values()],
        getAllKeys: async () => [...data.keys()],
        put: async (value, key) => void data.set(key, structuredClone(value)),
        delete: async (key) => void data.delete(key),
      },
      done: Promise.resolve(),
    }),
  })
  return { data, backend: createUserLibrary({ open }) }
}

const entry = (op, name, child) => [
  op,
  { definition: { op, name, version: 1, result: 'r1', records: [{ id: 'r1', op: child, params: child === 'primitive.cuboid' ? { size: [10, 4, 2] } : {} }], params: [] }, savedAt: 1 },
]

describe('A stored part that fails to load (TODO/ui-095)', () => {
  async function started(initial) {
    const stored = storedBackend(initial)
    const ctx = setup(stored.backend)
    await ctx.library.start()
    return { ...ctx, data: stored.data }
  }

  it('has a broken row after start(), and the banner names the part, not only the missing child', async () => {
    const { library } = await started([entry('user.feather-box', 'Feather enclosure', 'user.esp8266-feather')])
    expect(library.brokenRows).toEqual([
      expect.objectContaining({ op: 'user.feather-box', label: 'Feather enclosure', broken: true, inLibrary: true }),
    ])
    expect(library.brokenRows[0].reason).toMatch(/esp8266-feather, which is no longer in My parts/)
    expect(library.loadProblem).toMatch(/^Feather enclosure: it uses esp8266-feather/)
    expect(library.loadProblem).toMatch(/Delete it from its ⋯ menu below/)
  })

  it('confirmDelete on a broken op removes it, and its line leaves the banner', async () => {
    const { library, data } = await started([
      entry('user.feather-box', 'Feather enclosure', 'user.esp8266-feather'),
      entry('user.other', 'Other', 'user.also-missing'),
    ])
    library.beginDelete('user.feather-box')
    expect(library.deletePrompt.name).toBe('Feather enclosure')
    expect(await library.confirmDelete()).toBe(true)
    expect(data.has('user.feather-box')).toBe(false)
    expect(library.brokenRows.map((row) => row.op)).toEqual(['user.other'])
    expect(library.loadProblem).not.toMatch(/Feather enclosure/)
    expect(library.loadProblem).toMatch(/Other/)
    expect(library.toast.text).toBe('Deleted Feather enclosure from My parts')
    library.beginDelete('user.other')
    await library.confirmDelete()
    expect(library.loadProblem).toBe('')
    expect(library.brokenRows).toEqual([])
  })

  it('a project-layer row whose stored entry is broken is inLibrary, Delete removes the stored entry, Rename stays off', async () => {
    const stored = storedBackend([])
    const ctx = setup(stored.backend)
    combine(ctx.documentStore, ctx.selection)
    ctx.library.openSave()
    ctx.library.saveName = 'Standoff'
    await ctx.library.save()
    ctx.documentStore.append({ id: 'u-1', op: 'user.standoff', name: 'Standoff 1', params: {} }, { origin: 'local' })
    // The stored entry is later damaged (an older build, a deleted child); the project keeps its copy.
    const [op, record] = entry('user.standoff', 'Standoff', 'user.vanished')
    stored.data.set(op, record)
    await ctx.library.start()
    const row = ctx.library.userRows.find((r) => r.op === 'user.standoff')
    expect(row).toMatchObject({ inLibrary: true, storedBroken: true })
    expect(ctx.library.brokenRows).toEqual([])
    ctx.library.beginDelete('user.standoff')
    expect(await ctx.library.confirmDelete()).toBe(true)
    expect(stored.data.has('user.standoff')).toBe(false)
    // ui-055: the project keeps its copy, now only in the project.
    expect(ctx.library.userRows.map((r) => [r.label, r.inLibrary])).toEqual([['Standoff', false]])
    expect(ctx.library.loadProblem).toBe('')
  })

  it('Part 4: deleting a saved part another saved part nests is refused, naming the dependent; nothing is removed', async () => {
    const stored = storedBackend([])
    const ctx = setup(stored.backend)
    await stored.backend.save({ op: 'user.feather', name: 'Feather', version: 1, result: 'r1', records: [{ id: 'r1', op: 'primitive.cuboid', params: { size: [10, 4, 2] } }], params: [] })
    await stored.backend.save({ op: 'user.feather-box', name: 'Feather enclosure', version: 1, result: 'r1', records: [{ id: 'r1', op: 'user.feather', params: {} }], params: [] })
    await ctx.library.start()
    ctx.library.beginDelete('user.feather')
    expect(ctx.library.deletePrompt.confirmLabel).toBe(null)
    expect(ctx.library.deletePrompt.dependents).toEqual(['Feather enclosure'])
    expect(ctx.library.deletePrompt.message).toBe('Feather is used inside Feather enclosure in My parts. Delete Feather enclosure first.')
    expect(await ctx.library.confirmDelete()).toBe(false)
    expect(stored.data.has('user.feather')).toBe(true)
    expect(ctx.library.brokenRows).toEqual([])
  })

  it('the sequence that caused it: with no guard on the storage, deleting the nested part breaks the parent', async () => {
    const stored = storedBackend([])
    await stored.backend.save({ op: 'user.feather', name: 'Feather', version: 1, result: 'r1', records: [{ id: 'r1', op: 'primitive.cuboid', params: { size: [10, 4, 2] } }], params: [] })
    await stored.backend.save({ op: 'user.feather-box', name: 'Feather enclosure', version: 1, result: 'r1', records: [{ id: 'r1', op: 'user.feather', params: {} }], params: [] })
    expect((await stored.backend.list()).broken).toEqual([])
    await stored.backend.remove('user.feather')
    expect((await stored.backend.list()).broken.map((b) => b.op)).toEqual(['user.feather-box'])
  })
})

describe('start', () => {
  it('loads the stored library into the registry layer and the rows', async () => {
    const backend = fakeBackend()
    const first = setup(backend)
    combine(first.documentStore, first.selection)
    first.library.openSave()
    first.library.saveName = 'Standoff'
    await first.library.save()

    resetUserParts()
    setActivePinia(createPinia())
    const library = useLibraryStore()
    library.useBackend(backend, { download: () => {}, thumbnailer: () => null })
    expect(library.userRows).toEqual([])
    await library.start()
    expect(library.userRows.map((row) => row.label)).toEqual(['Standoff'])
    expect(library.userRows[0].thumbnail).toMatch(/^data:image\/png/)
  })

  it('an unreadable store is an empty library with a reason, never a failure', async () => {
    setActivePinia(createPinia())
    const library = useLibraryStore()
    library.useBackend({ ...fakeBackend(), list: async () => { throw new Error('blocked') } }, { download: () => {}, thumbnailer: () => null })
    await expect(library.start()).resolves.toBeUndefined()
    expect(library.loadProblem).toMatch(/blocked/)
    setLibraryParts([])
  })
})

describe('importedToast (TODO/io-024)', () => {
  it('names the parts and the duplicates skipped for a 3MF assembly, and only mentions skips that happened', async () => {
    const { importedToast } = await import('./library.js')
    const assembly = /** @type {any} */ ({ ok: true, kind: 'assembly', parts: new Array(29), triangleCount: 29718, duplicates: 58, skippedObjects: 0 })
    expect(importedToast('feather.3mf', assembly, '51.3 × 22.9 × 6.37 mm')).toBe(
      'Imported feather.3mf, 29 parts, 29,718 triangles, 51.3 × 22.9 × 6.37 mm. 58 exact duplicates skipped.'
    )
    expect(importedToast('feather.3mf', { ...assembly, duplicates: 0 }, '1 × 2 × 3 mm')).toBe('Imported feather.3mf, 29 parts, 29,718 triangles, 1 × 2 × 3 mm.')
    expect(importedToast('a.3mf', { ...assembly, duplicates: 1, skippedObjects: 2 }, '')).toBe(
      'Imported a.3mf, 29 parts, 29,718 triangles. 1 exact duplicate skipped. 2 support or other non-model objects skipped.'
    )
  })

  it('an STL, and a 3MF of one part, read as before', async () => {
    const { importedToast } = await import('./library.js')
    expect(importedToast('bracket.stl', /** @type {any} */ ({ kind: 'mesh', triangleCount: 12 }), '40 × 20 × 10 mm')).toBe(
      'Imported bracket.stl — 12 triangles, 40 × 20 × 10 mm'
    )
    const one = /** @type {any} */ ({ kind: 'assembly', parts: [{}], triangleCount: 12, duplicates: 0, skippedObjects: 0 })
    expect(importedToast('plate.3mf', one, '2 × 3 × 4 mm')).toBe('Imported plate.3mf — 12 triangles, 2 × 3 × 4 mm')
  })
})
