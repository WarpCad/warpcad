// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives a hand-written in-memory fake of the library backend, as userLibrary.spec.js
// does; the store under test is fully typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { piBoltRepeated } from '../core/__fixtures__/piScenes.js'
import { createUserLibrary } from '../storage/userLibrary.js'
import { resetUserParts, setLibraryParts, setProjectParts, effectiveUserPart } from '../core/userPart.js'
import { cubeTriangles, binaryStl, asciiBytes } from '../io/__fixtures__/stl.js'
import { importMeshBytes } from '../io/meshJob.js'
import { meshPartDefinition } from '../io/meshPart.js'
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
  it('opens on the selected group with a suggested name and the My parts category, and offers no sizes to expose (TODO/ui-105)', () => {
    const { library, selection, documentStore } = setup()
    combine(documentStore, selection)
    expect(library.openSave()).toBe(true)
    expect(library.saveOpen).toBe(true)
    expect(library.saveName).toBe('Group 1')
    expect(library.saveCategory).toBe('user')
    expect(library).not.toHaveProperty('saveCandidates')
    expect(library).not.toHaveProperty('saveChosen')
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
    expect(await library.save()).toBe(true)

    expect(library.saveOpen).toBe(false)
    expect(library.expanded).toBe(true)
    expect(library.toast.text).toBe('Saved Standoff')
    expect(backend.rows.has('user.standoff')).toBe(true)
    expect(backend.rows.get('user.standoff').thumbnail).toMatch(/^data:image\/png/)
    // A saved part is fixed: no sizes are exposed (TODO/ui-105).
    expect(effectiveUserPart('user.standoff')?.params).toHaveLength(0)
    expect(backend.rows.get('user.standoff').definition.params).toEqual([])
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
    expect(library.toast.text).toBe('Added Standoff to My parts. Open Library to place it')
    expect(await library.importText(text)).toMatchObject({ added: [], skipped: ['Standoff'] })
    const bad = await library.importText('{nope')
    expect(bad.problems[0].reason).toMatch(/JSON/)
    expect(library.importError).toMatch(/JSON/)
  })
})

describe('My parts after ui-107 — a mesh part in the library keeps its Units control', () => {
  const meshOf = async (size, name) => {
    const result = await importMeshBytes(`${name}.stl`, binaryStl(cubeTriangles(size)))
    return meshPartDefinition({ record: result.record, name, triangleCount: result.triangleCount })
  }

  it('the library store no longer imports a model file: that is File → Import model…, into the project', () => {
    const { library } = setup()
    expect(library.importModel).toBeUndefined()
    expect(library.modelImporting).toBeUndefined()
  })

  it('re-reads a stored mesh part in other units as a new version', async () => {
    const backend = fakeBackend([await meshOf(2, 'bracket')])
    const { library } = setup(backend)
    await library.start()
    expect(await library.setMeshUnits('user.bracket', 'inch')).toBe(true)
    const row = library.userRows.find((candidate) => candidate.op === 'user.bracket')
    expect(row.mesh).toMatchObject({ units: 'inch', unitsConfirmed: true, sizeText: '50.8 × 50.8 × 50.8 mm' })
    expect(backend.rows.get('user.bracket').definition.version).toBe(2)
  })

  it('a mesh part only the project carries gets no My parts row (open question 1)', async () => {
    const { library, documentStore } = setup()
    setProjectParts([await meshOf(2, 'scan')])
    documentStore.append({ id: 'scan-1', op: 'user.scan', name: 'scan 1', params: {} }, { origin: 'local' })
    expect(library.userRows.map((row) => row.op)).toEqual([])
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

describe('A part only in the open project is listed while the project uses it (TODO/ui-096)', () => {
  async function standoffPlaced(count) {
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
  async function projectOnly(count) {
    const ctx = await standoffPlaced(count)
    ctx.library.beginDelete('user.standoff')
    await ctx.library.confirmDelete()
    return ctx
  }

  it('a placed project-only part has a row with inLibrary false and its usage', async () => {
    const { library } = await projectOnly(2)
    expect(library.userRows).toEqual([expect.objectContaining({ op: 'user.standoff', inLibrary: false, usage: 2, nestedIn: [] })])
  })

  it('a library part with zero usage still has a row', async () => {
    const { library } = await standoffPlaced(0)
    expect(library.userRows.map((row) => [row.label, row.inLibrary, row.usage])).toEqual([['Standoff', true, 0]])
  })

  it('a project-only part nothing uses has no row', async () => {
    const { library } = await projectOnly(0)
    expect(library.userRows).toEqual([])
  })

  it('removing the last placed record drops the row; undo brings it back and the definition was never dropped', async () => {
    const { library, documentStore } = await projectOnly(1)
    expect(library.userRows).toHaveLength(1)
    documentStore.deleteBodies(['u-1'])
    expect(library.userRows).toEqual([])
    expect(effectiveUserPart('user.standoff')).toBeDefined()
    expect(documentStore.raw.userParts().some((part) => part.op === 'user.standoff')).toBe(true)
    documentStore.undo()
    expect(library.userRows.map((row) => [row.op, row.inLibrary])).toEqual([['user.standoff', false]])
  })

  it('a part nested in a placed project-only part has a row, and a nonzero usage signal naming the parent', async () => {
    const stored = storedBackend([])
    const ctx = setup(stored.backend)
    await stored.backend.save({ op: 'user.feather', name: 'Feather', version: 1, result: 'r1', records: [{ id: 'r1', op: 'primitive.cuboid', params: { size: [10, 4, 2] } }], params: [] })
    await stored.backend.save({ op: 'user.feather-box', name: 'Feather enclosure', version: 1, result: 'r1', records: [{ id: 'r1', op: 'user.feather', params: {} }], params: [] })
    await ctx.library.start()
    ctx.documentStore.append({ id: 'u-1', op: 'user.feather-box', name: 'Box 1', params: {} }, { origin: 'local' })
    // Delete the parent from the library first (copy kept), then the nested part.
    ctx.library.beginDelete('user.feather-box')
    await ctx.library.confirmDelete()
    ctx.library.beginDelete('user.feather')
    expect(ctx.library.deletePrompt.confirmLabel).not.toBe(null)
    await ctx.library.confirmDelete()
    const row = ctx.library.userRows.find((r) => r.op === 'user.feather')
    expect(row).toMatchObject({ inLibrary: false, usage: 0, nestedIn: ['Feather enclosure'] })
    ctx.library.beginDelete('user.feather')
    expect(ctx.library.deletePrompt).toMatchObject({ confirmLabel: null, projectOnly: true, nestedIn: ['Feather enclosure'] })
    expect(ctx.library.deletePrompt.message).toBe(
      "Feather isn't in My parts any more. It's listed here because Feather enclosure, placed in this project, uses it. Delete Feather enclosure from the view and it leaves this list. To keep Feather, choose Duplicate."
    )
    expect(await ctx.library.confirmDelete()).toBe(false)
    ctx.documentStore.deleteBodies(['u-1'])
    expect(ctx.library.userRows).toEqual([])
  })

  it('the Delete prompt for a directly placed project-only part says how many, and offers only Cancel', async () => {
    const { library } = await projectOnly(2)
    library.beginDelete('user.standoff')
    expect(library.deletePrompt).toMatchObject({ name: 'Standoff', confirmLabel: null, projectOnly: true, usage: 2 })
    expect(library.deletePrompt.message).toBe(
      "Standoff isn't in My parts any more. It's listed here because it's placed 2 times in this project. Delete those from the view and it leaves this list. To keep Standoff, choose Duplicate."
    )
    expect(await library.confirmDelete()).toBe(false)
    expect(library.userRows).toHaveLength(1)
  })

  it('projectOnlyNote gives the menu note for a row', async () => {
    const { library } = await projectOnly(1)
    expect(library.userRows[0].projectOnlyNote).toBe("Not in My parts. It's listed because it's placed once in this project.")
  })
})

describe('Save to library checks names against My parts only (TODO/ui-105)', () => {
  /** Saves Standoff, places it twice, then deletes it from My parts: the project keeps its copy. */
  async function projectOnlyStandoff() {
    const ctx = setup()
    combine(ctx.documentStore, ctx.selection)
    ctx.library.openSave()
    ctx.library.saveName = 'Standoff'
    await ctx.library.save()
    const text = (ctx.library.exportPart('user.standoff'), ctx.downloads[0].text)
    ctx.documentStore.append({ id: 'u-1', op: 'user.standoff', name: 'Standoff 1', params: {} }, { origin: 'local' })
    ctx.library.beginDelete('user.standoff')
    await ctx.library.confirmDelete()
    expect(ctx.backend.rows.has('user.standoff')).toBe(false)
    expect(effectiveUserPart('user.standoff')).toBeDefined()
    return { ...ctx, text }
  }

  /** A loose cube, selected, with the sheet open on it. */
  function openOnLooseCube(ctx, size = 3) {
    ctx.documentStore.append({ id: 'cube-9', op: 'primitive.cuboid', name: 'Cube 9', params: { size: [size, size, size], center: [60, 0, 0] } }, { origin: 'local' })
    ctx.selection.select('cube-9')
    expect(ctx.library.openSave()).toBe(true)
  }

  it('a part only the project carries does not block its name, and the save stores it with no project-only badge', async () => {
    const ctx = await projectOnlyStandoff()
    const { library, selection, backend } = ctx
    selection.select('group-1')
    library.openSave()
    expect(library.saveName).toBe('Group 1')
    library.saveName = 'Standoff'
    expect(library.nameProblem).toBe('')
    expect(library.canSave).toBe(true)
    expect(await library.save()).toBe(true)
    expect(backend.rows.has('user.standoff')).toBe(true)
    // Same geometry as the project's copy: the project's version, so no update prompt.
    expect(backend.rows.get('user.standoff').definition.version).toBe(1)
    expect(library.userRows.find((row) => row.op === 'user.standoff')).toMatchObject({ inLibrary: true, userPart: { newerVersionAvailable: false } })
  })

  it('with the same name in My parts the save is refused with the existing sentence', async () => {
    const { library, selection, documentStore } = setup()
    combine(documentStore, selection)
    library.openSave()
    library.saveName = 'Standoff'
    await library.save()
    selection.select('group-1')
    library.openSave()
    library.saveName = 'Standoff'
    expect(library.nameProblem).toBe('A part called "Standoff" already exists — pick another name')
    expect(await library.save()).toBe(false)
  })

  it('different geometry under the project’s name saves at the project’s version + 1, and the row says newer', async () => {
    const ctx = await projectOnlyStandoff()
    openOnLooseCube(ctx)
    ctx.library.saveName = 'Standoff'
    expect(ctx.library.nameProblem).toBe('')
    expect(await ctx.library.save()).toBe(true)
    expect(ctx.backend.rows.get('user.standoff').definition.version).toBe(2)
    expect(ctx.library.userRows.find((row) => row.op === 'user.standoff')).toMatchObject({
      inLibrary: true,
      userPart: { projectVersion: 1, libraryVersion: 2, newerVersionAvailable: true },
    })
  })

  it('a body named like a library part never blocks that name (body names are not checked)', async () => {
    const { library, selection, documentStore } = setup()
    documentStore.append({ id: 'hex-body', op: 'primitive.cuboid', name: 'Hexagon', params: { size: [2, 2, 2], center: [40, 0, 0] } }, { origin: 'local' })
    combine(documentStore, selection)
    library.openSave()
    library.saveName = 'Hexagon'
    expect(library.nameProblem).toBe('')
  })

  it('a name the body is built from is refused, in words, while typing', async () => {
    const ctx = await projectOnlyStandoff()
    const { library, selection, documentStore } = ctx
    documentStore.append({ id: 'cube-9', op: 'primitive.cuboid', name: 'Cube 9', params: { size: [3, 3, 3], center: [60, 0, 0] } }, { origin: 'local' })
    documentStore.append(
      { id: 'group-2', op: 'group.assemble', name: 'Outer', target: 'u-1', operands: ['cube-9'], consumes: ['u-1', 'cube-9'], params: { names: ['Inner', 'Cube 9'] } },
      { origin: 'local' }
    )
    selection.select('group-2')
    library.openSave()
    library.saveName = '  standoff '
    expect(library.nameProblem).toBe('standoff is built from a part with that name — pick another name')
    expect(library.canSave).toBe(false)
    expect(await library.save()).toBe(false)
    library.saveName = 'Outer'
    expect(library.nameProblem).toBe('')
  })

  it('saving a group carries the project-only parts inside it into My parts, leaves first, and the outer save succeeds', async () => {
    const ctx = await projectOnlyStandoff()
    const { library, selection, documentStore, backend } = ctx
    documentStore.append({ id: 'cube-9', op: 'primitive.cuboid', name: 'Cube 9', params: { size: [3, 3, 3], center: [60, 0, 0] } }, { origin: 'local' })
    documentStore.append(
      { id: 'group-2', op: 'group.assemble', name: 'Outer', target: 'u-1', operands: ['cube-9'], consumes: ['u-1', 'cube-9'], params: { names: ['Inner', 'Cube 9'] } },
      { origin: 'local' }
    )
    const order = []
    const save = backend.save.bind(backend)
    backend.save = async (definition, extras) => {
      order.push(definition.op)
      return save(definition, extras)
    }
    selection.select('group-2')
    library.openSave()
    expect(library.saveName).toBe('Outer')
    expect(await library.save()).toBe(true)
    expect(library.saveError).toBe('')
    expect(order).toEqual(['user.standoff', 'user.outer'])
    expect(backend.rows.get('user.standoff').definition.version).toBe(1)
    expect(library.userRows.find((row) => row.op === 'user.standoff')?.inLibrary).toBe(true)
  })

  it('a nested part My parts already holds is left alone', async () => {
    const ctx = await projectOnlyStandoff()
    const { library, selection, documentStore, backend } = ctx
    const held = { ...effectiveUserPart('user.standoff'), version: 7 }
    backend.rows.set('user.standoff', { definition: held })
    await library.start()
    documentStore.append({ id: 'cube-9', op: 'primitive.cuboid', name: 'Cube 9', params: { size: [3, 3, 3], center: [60, 0, 0] } }, { origin: 'local' })
    documentStore.append(
      { id: 'group-2', op: 'group.assemble', name: 'Outer', target: 'u-1', operands: ['cube-9'], consumes: ['u-1', 'cube-9'], params: { names: ['Inner', 'Cube 9'] } },
      { origin: 'local' }
    )
    selection.select('group-2')
    library.openSave()
    expect(await library.save()).toBe(true)
    expect(backend.rows.get('user.standoff').definition.version).toBe(7)
  })

  it('rename: a part only the project carries never blocks a name; one in My parts does', async () => {
    const ctx = await projectOnlyStandoff()
    const { library, selection } = ctx
    // Two saved parts: Bracket (new) and Gizmo, then rename Gizmo to the project-only Standoff.
    selection.select('group-1')
    library.openSave()
    library.saveName = 'Bracket'
    await library.save()
    library.beginRename('user.bracket')
    library.renameName = 'Standoff'
    expect(library.renameProblem).toBe('')
    library.renameName = 'Bracket'
    expect(library.renameProblem).toBe('')
    expect(await library.commitRename()).toBe(true)
  })

  it('import adds a part the project carries and My parts lacks, and still skips one My parts holds', async () => {
    const { library, backend, text } = await projectOnlyStandoff()
    expect(await library.importText(text)).toMatchObject({ added: ['Standoff'], skipped: [], problems: [] })
    expect(backend.rows.has('user.standoff')).toBe(true)
    expect(await library.importText(text)).toMatchObject({ added: [], skipped: ['Standoff'] })
  })

  it('the assistant’s proposal follows the same rule: a project-only name is saved, a lineage name is refused', async () => {
    const ctx = await projectOnlyStandoff()
    const { library, documentStore } = ctx
    const looseId = 'cube-9'
    documentStore.append({ id: looseId, op: 'primitive.cuboid', name: 'Cube 9', params: { size: [3, 3, 3], center: [60, 0, 0] } }, { origin: 'local' })
    expect(await library.saveProposed({ bodyId: 'u-1', name: 'Standoff' })).toMatchObject({ ok: false, reason: expect.stringMatching(/built from a part with that name/) })
    expect(await library.saveProposed({ bodyId: looseId, name: 'Standoff', expose: ['ignored:key'] })).toMatchObject({ ok: true, op: 'user.standoff' })
    expect(await library.saveProposed({ bodyId: looseId, name: 'standoff' })).toMatchObject({ ok: false, reason: expect.stringMatching(/already exists/) })
  })
})
