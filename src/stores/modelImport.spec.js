// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives duck-typed fakes of the library backend and the drop target; the stores
// under test are typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { effectiveUserPart, resetUserParts, setLibraryParts } from '../core/userPart.js'
import { asciiBytes, binaryStl, boxTriangles } from '../io/__fixtures__/stl.js'
import { importMeshBytes } from '../io/meshJob.js'
import { setMeshWorkerFactory } from '../io/meshClient.js'
import { meshPartDefinition } from '../io/meshPart.js'
import { useDocumentStore } from './document.js'
import { useLibraryStore } from './library.js'
import { useModelImportStore } from './modelImport.js'
import { usePlacementStore } from './placement.js'
import { useSelectionStore } from './selection.js'

/**
 * `TODO/ui-107` — **File → Import model…** imports into the open project, never into My parts.
 *
 * The worker read is the main-thread fallback here (no worker in jsdom); the library's storage
 * and the viewport's drop target are the boundaries, faked. The document, the registry's part
 * layers, the selection and the kernel are real.
 */

const fileOf = (bytes, name) => ({ name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) })
const BRACKET = () => fileOf(binaryStl(boxTriangles([40, 20, 10])), 'bracket.stl')

function fakeBackend(initial = []) {
  const rows = new Map(initial.map((definition) => [definition.op, { definition }]))
  return {
    rows,
    save: vi.fn(async (definition, extras = {}) => {
      rows.set(definition.op, { definition, thumbnail: extras.thumbnail ?? null, savedAt: rows.size + 1 })
      return definition
    }),
    async list() {
      return {
        parts: [...rows.values()].map((row) => row.definition),
        problems: [],
        thumbnails: {},
        savedAt: Object.fromEntries([...rows].map(([op, row]) => [op, row.savedAt ?? 0])),
      }
    },
    async remove(op) {
      rows.delete(op)
    },
    close() {},
  }
}

/** A drop target that projects a client point straight onto the plane, as mm. */
function fakeTarget() {
  return {
    contains: () => true,
    preview() {},
    clearPreview() {},
    commit(op, x, y, overrides, place) {
      return place ? place({ x, y }) : null
    },
  }
}

async function setup(libraryParts = []) {
  setActivePinia(createPinia())
  const backend = fakeBackend(libraryParts)
  const library = useLibraryStore()
  library.useBackend(backend, { download: () => {}, thumbnailer: () => 'data:image/png;base64,AAAA' })
  await library.start()
  const placement = usePlacementStore()
  placement.registerTarget(fakeTarget())
  return { backend, library, placement, imports: useModelImportStore(), documentStore: useDocumentStore(), selection: useSelectionStore() }
}

beforeEach(() => {
  resetUserParts()
  setMeshWorkerFactory(() => {
    throw new Error('no worker in jsdom')
  })
})
afterEach(() => resetUserParts())

describe('Import model… — into the project, in one transaction', () => {
  it('arms a placement session; a click commits one selected body, and My parts is untouched', async () => {
    const { backend, library, placement, imports, documentStore, selection } = await setup()
    const outcome = await imports.importFile(BRACKET())
    expect(outcome).toMatchObject({ ok: true, op: 'user.bracket' })
    expect(imports.reading).toBe('')
    expect(placement.armed).toBe(true)
    expect(imports.placingLabel).toBe('bracket.stl')
    // Nothing is in the project until the click.
    expect(documentStore.bodies).toEqual([])

    placement.hover(10, 10)
    const id = placement.commitArmed(30, -20)
    expect(id).not.toBeNull()
    expect(documentStore.bodies.map((body) => body.op)).toEqual(['user.bracket'])
    expect(documentStore.bodies[0].name).toBe('bracket 1')
    expect(selection.ids).toEqual([id])
    expect(documentStore.undoLabel).toMatch(/Import bracket\.stl/)
    expect(imports.placingLabel).toBe('')

    // Never the library: no save, and no My parts row for a part that was never saved there.
    expect(backend.save).not.toHaveBeenCalled()
    expect(library.userRows).toEqual([])
  })

  it('one Undo removes the placed model', async () => {
    const { placement, imports, documentStore } = await setup()
    await imports.importFile(BRACKET())
    placement.commitArmed(0, 0)
    expect(documentStore.bodies).toHaveLength(1)
    documentStore.undo()
    expect(documentStore.bodies).toEqual([])
    expect(documentStore.canUndo).toBe(false)
  })

  it('Cancel ends the session with nothing added and takes the staged part back out', async () => {
    const { placement, imports, documentStore, backend } = await setup()
    await imports.importFile(BRACKET())
    expect(effectiveUserPart('user.bracket')).toBeDefined()
    imports.cancelPlacement()
    expect(placement.armed).toBe(false)
    expect(documentStore.bodies).toEqual([])
    expect(documentStore.canUndo).toBe(false)
    expect(effectiveUserPart('user.bracket')).toBeUndefined()
    expect(backend.save).not.toHaveBeenCalled()
  })

  it('a refused file shows the reason and changes nothing', async () => {
    const { placement, imports, documentStore, backend } = await setup()
    const outcome = await imports.importFile(fileOf(asciiBytes('this is not a model'), 'x.stl'))
    expect(outcome.ok).toBe(false)
    expect(imports.error).not.toBe('')
    expect(imports.reading).toBe('')
    expect(placement.armed).toBe(false)
    expect(documentStore.raw.entries).toEqual([])
    expect(backend.save).not.toHaveBeenCalled()
  })

  it('a name My parts already holds is still accepted for the project, under an op of its own', async () => {
    const stored = await importMeshBytes('Bracket.stl', binaryStl(boxTriangles([5, 5, 5])))
    const mine = meshPartDefinition({ record: stored.record, name: 'Bracket', triangleCount: stored.triangleCount })
    const { placement, imports, documentStore, library } = await setup([mine])
    expect(library.userRows.map((row) => row.op)).toEqual(['user.bracket'])
    const outcome = await imports.importFile(BRACKET())
    expect(outcome.ok).toBe(true)
    // The project's copy keeps the file's name; it never shadows the library's Bracket.
    expect(outcome.op).not.toBe('user.bracket')
    expect(effectiveUserPart(outcome.op)?.name).toBe('bracket')
    expect(effectiveUserPart('user.bracket')?.name).toBe('Bracket')
    placement.commitArmed(0, 0)
    expect(documentStore.bodies.map((body) => body.op)).toEqual([outcome.op])
    expect(library.userRows.map((row) => row.op)).toEqual(['user.bracket'])
  })

  it('a second import of the same file in the project is named "<name> copy"', async () => {
    const { placement, imports } = await setup()
    await imports.importFile(BRACKET())
    placement.commitArmed(0, 0)
    const second = await imports.importFile(BRACKET())
    expect(effectiveUserPart(second.op)?.name).toBe('bracket copy')
  })

  it('a file dropped on the view commits at the drop point with no session', async () => {
    const { placement, imports, documentStore } = await setup()
    const outcome = await imports.importFile(BRACKET(), { at: { clientX: 40, clientY: 50 } })
    expect(outcome.ok).toBe(true)
    expect(placement.armed).toBe(false)
    expect(documentStore.bodies).toHaveLength(1)
  })
})

describe('Save to library… on an imported model (TODO/ui-107, ui-105)', () => {
  it('saves the project copy itself, so exactly one My parts row appears, with its size', async () => {
    const { placement, imports, library, backend } = await setup()
    await imports.importFile(BRACKET())
    placement.commitArmed(0, 0)
    expect(library.openSave()).toBe(true)
    // The sheet suggests the part's name, not the instance's "bracket 1".
    expect(library.saveName).toBe('bracket')
    expect(library.nameProblem).toBe('')
    expect(await library.save()).toBe(true)
    expect(backend.save).toHaveBeenCalledTimes(1)
    expect(library.userRows.map((row) => row.op)).toEqual(['user.bracket'])
    expect(library.userRows[0].mesh?.sizeText).toBe('40 × 20 × 10 mm')
  })

  it('a name My parts holds is refused in words, as ui-105 does', async () => {
    const stored = await importMeshBytes('Bracket.stl', binaryStl(boxTriangles([5, 5, 5])))
    const mine = meshPartDefinition({ record: stored.record, name: 'Bracket', triangleCount: stored.triangleCount })
    const { placement, imports, library } = await setup([mine])
    await imports.importFile(BRACKET())
    placement.commitArmed(0, 0)
    library.openSave()
    expect(library.nameProblem).toMatch(/already exists/)
    library.saveName = 'bracket 40'
    expect(library.nameProblem).toBe('')
    expect(await library.save()).toBe(true)
    expect(library.userRows.map((row) => row.op).sort()).toEqual(['user.bracket', 'user.bracket-40'])
  })
})

describe('Change units — in the Inspector, as one undoable step', () => {
  it('re-reads the selected imported mesh in inches; Undo puts it back', async () => {
    const { placement, imports, documentStore } = await setup()
    await imports.importFile(fileOf(binaryStl(boxTriangles([1, 0.5, 0.25])), 'tiny.stl'))
    const id = placement.commitArmed(0, 0)
    const sizeOf = () => {
      const [min, max] = documentStore.bodies[0].bounds
      return max.map((value, axis) => value - min[axis])
    }
    expect(sizeOf()[0]).toBeCloseTo(1, 6)
    expect(imports.setUnits(id, 'inch')).toBe(true)
    expect(sizeOf()[0]).toBeCloseTo(25.4, 6)
    expect(documentStore.bodies[0].name).toBe('tiny 1')
    documentStore.undo()
    expect(sizeOf()[0]).toBeCloseTo(1, 6)
  })
})
