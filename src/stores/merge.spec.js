// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — duck-typed fakes of the storage boundary; the modules under test are fully
// typed and checked by `npm run typecheck`.
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { createDocument, undoAfterMergeNote } from '../core/document.js'
import { parseProject, serializeProject } from '../core/project.js'
import { useAiChatStore } from './aiChat.js'
import { useDocumentStore } from './document.js'
import { describeMerge, mergeStateOfProject, useMergeStore } from './merge.js'
import { setPersistenceDependencies, usePersistenceStore } from './persistence.js'
import { useTimelineStore } from './timeline.js'

/**
 * `TODO/ui-062` — **Merge file…**, the merge summary, and **Undo merge**, at store level.
 *
 * The real kernel and the real document: what is pinned here is what the user reads (the
 * toast and banner sentences, counted in History rows, never "0 steps") and what Undo merge
 * leaves behind (the exact rows the project had, the local undo stack untouched, a refusal by
 * name when a later local step builds on a merged row). `e2e/merge-file.e2e.js` is the
 * reachability half.
 */

const ai = { origin: 'ai' }

const cube1 = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }
const boxA = { id: 'box-a', op: 'primitive.cuboid', name: 'Box A', params: { size: [10, 10, 10], center: [40, 0, 5] } }
const cyl = { id: 'cyl-1', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 10, height: 10, center: [-40, 0, 5] } }
const move = { id: 'move-1', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [5, 0, 0] } }
const fillet = { id: 'fillet-1', op: 'modify.filletRim', target: 'cube-1', supersedes: 'cube-1', params: { face: 'top', radius: 2 } }

const NAME = 'bracket-copy.warpcad'

/** The record lines of a serialised project — everything but the trailing state line. */
function recordLines(document) {
  return serializeProject(document)
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('{"warpcad"'))
}

/**
 * Another copy of the open project, as a file read back into its own document — exactly what
 * a second tab or a phone holds after opening the downloaded file.
 */
function copyOf(document) {
  const parsed = parseProject(serializeProject(document))
  const other = createDocument({ foldCache: null })
  other.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed)
  return other
}

/** The other copy's file, as Merge file… reads it. */
function fileOf(document) {
  return mergeStateOfProject(parseProject(serializeProject(document)))
}

let documentStore
let merge

beforeEach(() => {
  setActivePinia(createPinia())
  documentStore = useDocumentStore()
  merge = useMergeStore()
  documentStore.appendAll([structuredClone(cube1), structuredClone(boxA)])
})

afterEach(() => {
  setPersistenceDependencies(null)
})

describe('the merge summary, in History rows (TODO/ui-062)', () => {
  it('added: "Merged 1 step from <name>", a toast with Undo merge', () => {
    const other = copyOf(documentStore.raw)
    other.append(structuredClone(cyl), ai)

    const result = merge.mergeIn(fileOf(other), NAME)

    expect(result).toMatchObject({ ok: true, text: `Merged 1 step from ${NAME}` })
    expect(merge.notice).toMatchObject({ kind: 'toast', text: `Merged 1 step from ${NAME}`, undoable: true })
    expect(merge.canUndo).toBe(true)
    expect(documentStore.bodies.map((body) => body.id)).toEqual(['cube-1', 'box-a', 'cyl-1'])
  })

  it('several added: plural, and still no breakdown when every row is new', () => {
    const other = copyOf(documentStore.raw)
    other.append(structuredClone(cyl), ai)
    other.append(structuredClone(move), ai)
    expect(merge.mergeIn(fileOf(other), NAME).text).toBe(`Merged 2 steps from ${NAME}`)
  })

  it('changed: the row counts, and the message says it was changed, not added', () => {
    const other = copyOf(documentStore.raw)
    other.replaceRecord('box-a', { ...structuredClone(boxA), params: { ...boxA.params, size: [12, 12, 12] } }, ai)
    expect(merge.mergeIn(fileOf(other), NAME).text).toBe(`Merged 1 step from ${NAME} (1 changed)`)
  })

  it('removed: a row the other copy took out', () => {
    const other = copyOf(documentStore.raw)
    other.removeRecords(['box-a'], ai)
    expect(merge.mergeIn(fileOf(other), NAME).text).toBe(`Merged 1 step from ${NAME} (1 removed)`)
    expect(documentStore.bodies.map((body) => body.id)).toEqual(['cube-1'])
  })

  it('a mix: the total, then each kind that happened', () => {
    const other = copyOf(documentStore.raw)
    other.append(structuredClone(cyl), ai)
    other.setSuppressed('cube-1', true, ai)
    other.removeRecords(['box-a'], ai)
    expect(merge.mergeIn(fileOf(other), NAME).text).toBe(`Merged 3 steps from ${NAME} (1 added, 1 changed, 1 removed)`)
  })

  it('marker only: "Merged a rollback point from …", never "0 steps"', () => {
    const other = copyOf(documentStore.raw)
    other.rollBackTo('cube-1', ai)
    const result = merge.mergeIn(fileOf(other), NAME)
    expect(result.text).toBe(`Merged a rollback point from ${NAME}`)
    expect(result.text).not.toMatch(/0 steps/)
    expect(merge.notice).toMatchObject({ kind: 'toast', undoable: true })
    expect(documentStore.raw.rollbackAt()).toBe(1)
  })

  it('a setting only: says which setting, never "0 steps"', () => {
    const other = copyOf(documentStore.raw)
    other.setStandingInstructions('Walls at least 2 mm', ai)
    expect(merge.mergeIn(fileOf(other), NAME).text).toBe(`Merged the standing instructions from ${NAME}`)
  })

  it('nothing new: says so, and offers no Undo merge', () => {
    const other = copyOf(documentStore.raw)
    const result = merge.mergeIn(fileOf(other), NAME)
    expect(result).toMatchObject({ ok: true, text: `${NAME} has nothing this project doesn't already have` })
    expect(merge.notice).toMatchObject({ kind: 'toast', undoable: false })
    expect(merge.canUndo).toBe(false)
  })

  it('conflicts: a banner instead of the toast, naming how many rows conflicted', () => {
    const other = copyOf(documentStore.raw)
    documentStore.append(structuredClone(move))
    // A stamped write first, so the other copy's fillet is the later-stamped row and is the
    // one that folds second — the row a merge flags (`docs-022`).
    other.setStandingInstructions('Keep the top edge rounded', ai)
    other.append(structuredClone(fillet), ai)

    const result = merge.mergeIn(fileOf(other), NAME)

    expect(result.text).toBe(`Merged 1 step from ${NAME} — 1 step conflicted`)
    expect(merge.notice).toMatchObject({ kind: 'banner', undoable: true, conflictIds: ['fillet-1'] })
    const row = documentStore.raw.timeline().find((candidate) => candidate.id === 'fillet-1')
    expect(row.broken).toBe('conflicts with step 3 (Move Cube 1, by you)')
  })

  it('Show opens History and selects the first conflicted row', () => {
    const other = copyOf(documentStore.raw)
    documentStore.append(structuredClone(move))
    other.setStandingInstructions('Keep the top edge rounded', ai)
    other.append(structuredClone(fillet), ai)
    merge.mergeIn(fileOf(other), NAME)

    merge.showConflicts()

    const timeline = useTimelineStore()
    expect(timeline.open).toBe(true)
    expect(timeline.selectedId).toBe('fillet-1')
  })

  it('pure: describeMerge counts rows, not stamps', () => {
    const change = { added: ['a', 'b'], revised: ['c'], removed: [], moved: ['c', 'd'], registers: [], parts: [] }
    expect(describeMerge(change, [], NAME)).toBe(`Merged 4 steps from ${NAME} (2 added, 2 changed)`)
  })
})

describe('Undo merge (TODO/ui-062)', () => {
  it('restores the exact prior rows, and leaves the local undo stack exactly as it was', () => {
    documentStore.append(structuredClone(move))
    const pendingBefore = documentStore.raw.pendingUndo()
    const linesBefore = recordLines(documentStore.raw)
    const rollbackBefore = documentStore.raw.rollbackAt()

    const other = copyOf(documentStore.raw)
    other.append(structuredClone(cyl), ai)
    other.replaceRecord('cube-1', { ...structuredClone(cube1), params: { ...cube1.params, size: [24, 24, 24] } }, ai)
    other.setSuppressed('box-a', true, ai)
    merge.mergeIn(fileOf(other), NAME)
    expect(recordLines(documentStore.raw)).not.toEqual(linesBefore)
    expect(documentStore.raw.timeline().find((row) => row.id === 'box-a').suppressed).toBe(true)

    const result = merge.undoMerge()

    expect(result).toEqual({ ok: true })
    expect(recordLines(documentStore.raw)).toEqual(linesBefore)
    expect(documentStore.raw.rollbackAt()).toBe(rollbackBefore)
    expect(documentStore.raw.timeline().map((row) => [row.id, row.suppressed, row.broken])).toEqual([
      ['cube-1', false, null],
      ['box-a', false, null],
      ['move-1', false, null],
    ])
    // Not on the header Undo stack, and nothing of the user's was taken off it.
    expect(documentStore.raw.pendingUndo()).toBe(pendingBefore)
    expect(merge.canUndo).toBe(false)
    // The user's own step still undoes.
    expect(documentStore.undo()).toMatchObject({ ok: true })
    expect(documentStore.raw.timeline().map((row) => row.id)).toEqual(['cube-1', 'box-a'])
  })

  it('brings back a row the merge removed, where it was, with its origin', () => {
    documentStore.append(structuredClone(cyl), ai)
    const linesBefore = recordLines(documentStore.raw)
    const other = copyOf(documentStore.raw)
    other.removeRecords(['box-a'], ai)
    merge.mergeIn(fileOf(other), NAME)

    expect(merge.undoMerge()).toEqual({ ok: true })

    expect(recordLines(documentStore.raw)).toEqual(linesBefore)
    expect(documentStore.raw.timeline().map((row) => [row.id, row.origin])).toEqual([
      ['cube-1', 'local'],
      ['box-a', 'local'],
      ['cyl-1', 'ai'],
    ])
  })

  it('takes a marker-only merge back', () => {
    const other = copyOf(documentStore.raw)
    other.rollBackTo('cube-1', ai)
    merge.mergeIn(fileOf(other), NAME)
    expect(merge.undoMerge()).toEqual({ ok: true })
    expect(documentStore.raw.rollbackAt()).toBeNull()
  })

  it('takes a conflicted merge back: the merged row goes and no row is left flagged', () => {
    const other = copyOf(documentStore.raw)
    documentStore.append(structuredClone(move))
    const before = serializeProject(documentStore.raw).split('\n')
    other.setStandingInstructions('Keep the top edge rounded', ai)
    other.append(structuredClone(fillet), ai)
    merge.mergeIn(fileOf(other), NAME)

    expect(merge.undoMerge()).toEqual({ ok: true })

    expect(documentStore.raw.timeline().map((row) => [row.id, row.broken])).toEqual([
      ['cube-1', null],
      ['box-a', null],
      ['move-1', null],
    ])
    expect(documentStore.raw.standingInstructions()).toBe('')
    expect(serializeProject(documentStore.raw)).not.toContain('leftBroken')
    expect(recordLines(documentStore.raw)).toEqual(before.filter((line) => line !== '' && !line.startsWith('{"warpcad"')))
    // The banner is replaced by what happened; nothing is left to undo.
    expect(merge.notice).toMatchObject({ kind: 'toast', text: `Took the merge from ${NAME} back out`, undoable: false })
    expect(merge.canUndo).toBe(false)
  })

  it('refuses by name when a later local step builds on a merged row, and changes nothing', () => {
    const other = copyOf(documentStore.raw)
    other.append(structuredClone(cyl), ai)
    merge.mergeIn(fileOf(other), NAME)
    documentStore.append({ id: 'lift', op: 'transform.translate', name: 'Lift', target: 'cyl-1', supersedes: 'cyl-1', params: { vector: [0, 0, 5] } })
    const linesBefore = recordLines(documentStore.raw)
    const version = documentStore.raw.version

    const result = merge.undoMerge()

    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/^Can't undo the merge: /)
    expect(result.message).toContain('"Lift"')
    expect(result.message).toContain('cyl-1')
    expect(merge.undoRefusal).toBe(result.message)
    expect(recordLines(documentStore.raw)).toEqual(linesBefore)
    expect(documentStore.raw.version).toBeGreaterThanOrEqual(version)
    expect(documentStore.raw.timeline().map((row) => row.id)).toEqual(['cube-1', 'box-a', 'cyl-1', 'lift'])
    // Still offered: the user can delete their step and try again.
    expect(merge.canUndo).toBe(true)
  })

  it('is forgotten by the next Open (a load), like Undo AI turn', () => {
    const other = copyOf(documentStore.raw)
    other.append(structuredClone(cyl), ai)
    merge.mergeIn(fileOf(other), NAME)
    documentStore.load([{ record: structuredClone(cube1), origin: 'local' }])
    expect(merge.canUndo).toBe(false)
    expect(merge.notice).toBeNull()
    expect(merge.undoMerge()).toMatchObject({ ok: false })
  })
})

describe('a copy of a different project (TODO/ui-062)', () => {
  it('is refused with the sentence, and nothing changes', () => {
    // Two version-1 files: a shared id holding different records is how relatedness tells
    // them apart (`core/merge/merge.js`).
    const mine = parseProject(`${JSON.stringify(cube1)}\n${JSON.stringify(boxA)}\n`)
    documentStore.load(mine.entries, mine.rollbackAt, mine.resolution, mine)
    const stranger = parseProject(`${JSON.stringify({ ...cube1, params: { ...cube1.params, size: [1, 1, 1] } })}\n`)
    const linesBefore = recordLines(documentStore.raw)
    const versionBefore = documentStore.version

    const result = merge.mergeIn(mergeStateOfProject(stranger), 'bracket-v2.warpcad')

    expect(result).toEqual({
      ok: false,
      text: 'bracket-v2.warpcad is a different project. Merge only works between copies of the same project.',
    })
    expect(merge.notice).toMatchObject({ kind: 'toast', tone: 'error', undoable: false, text: result.text })
    expect(recordLines(documentStore.raw)).toEqual(linesBefore)
    expect(documentStore.version).toBe(versionBefore)
    expect(merge.canUndo).toBe(false)
  })
})

describe('when Merge file… is available (TODO/ui-062)', () => {
  it('needs a step to merge into, the latest step, and no AI turn landing', () => {
    expect(merge.unavailableReason).toBe('')
    useTimelineStore().selectRow('cube-1')
    expect(merge.unavailableReason).toBe('Return to the latest step to merge')
    useTimelineStore().endPreview()
    useAiChatStore().running = true
    expect(merge.unavailableReason).toBe('Wait for the Assistant to finish')
    useAiChatStore().running = false
    documentStore.load([])
    expect(merge.unavailableReason).toBe('Nothing to merge into')
  })
})

describe('persistence.mergeFile — pick, read, parse, merge (TODO/ui-062)', () => {
  /** @param {any} picked */
  function withPicked(picked) {
    const files = {
      capabilities: { mode: 'fallback', canSaveInPlace: false, saveLabel: 'Download copy', saveAsLabel: null, openLabel: 'Open…' },
      opens: 0,
      adopted: 0,
      async open() {
        files.opens += 1
        return picked
      },
      adopt() {
        files.adopted += 1
      },
      forgetHandle() {},
      async save() {
        return { ok: true, mode: 'fallback', name: 'x.ndjson' }
      },
    }
    setPersistenceDependencies({
      backend: { async load() { return null }, async save() {}, async keepUnreadable() {} },
      files,
    })
    // A fresh pinia, so the persistence store picks up these dependencies.
    setActivePinia(createPinia())
    documentStore = useDocumentStore()
    merge = useMergeStore()
    documentStore.appendAll([structuredClone(cube1), structuredClone(boxA)])
    return files
  }

  it('merges the picked file, with no replace-confirm, and never adopts it as the Save target', async () => {
    const files = withPicked({ ok: true, name: NAME, text: '' })
    // The other copy must be a copy of *this* store's project: rebuild it from its file.
    const copy = copyOf(documentStore.raw)
    copy.append(structuredClone(cyl), ai)
    files.open = async () => ({ ok: true, name: NAME, text: serializeProject(copy) })

    const result = await usePersistenceStore().mergeFile()

    expect(result).toMatchObject({ ok: true, text: `Merged 1 step from ${NAME}` })
    expect(files.adopted).toBe(0)
    expect(documentStore.bodies.map((body) => body.id)).toEqual(['cube-1', 'box-a', 'cyl-1'])
    expect(usePersistenceStore().errorMessage).toBe('')
  })

  it('a cancelled picker changes nothing and says nothing (ui-033)', async () => {
    withPicked({ ok: false, cancelled: true })
    const linesBefore = recordLines(documentStore.raw)
    const result = await usePersistenceStore().mergeFile()
    expect(result).toEqual({ ok: false, cancelled: true })
    expect(recordLines(documentStore.raw)).toEqual(linesBefore)
    expect(merge.notice).toBeNull()
    expect(usePersistenceStore().errorMessage).toBe('')
  })

  it('a file this build cannot read: the same sentence Open shows, and nothing changes', async () => {
    withPicked({ ok: true, name: 'notes.txt', text: 'not json\n' })
    const linesBefore = recordLines(documentStore.raw)
    const result = await usePersistenceStore().mergeFile()
    expect(result.ok).toBe(false)
    expect(usePersistenceStore().errorMessage).toBe("Couldn't open notes.txt: line 1 is not valid JSON — this is not a WarpCad project file")
    expect(recordLines(documentStore.raw)).toEqual(linesBefore)
    expect(merge.canUndo).toBe(false)
  })

  it('a stale error never hides a later success', async () => {
    const files = withPicked({ ok: true, name: 'notes.txt', text: 'not json\n' })
    const persistence = usePersistenceStore()
    await persistence.mergeFile()
    expect(persistence.errorMessage).not.toBe('')
    const copy = copyOf(documentStore.raw)
    copy.append(structuredClone(cyl), ai)
    files.open = async () => ({ ok: true, name: NAME, text: serializeProject(copy) })
    await persistence.mergeFile()
    expect(persistence.errorMessage).toBe('')
    expect(persistence.chipText).toBe(`Merged 1 step from ${NAME}`)
  })

  it('the status chip follows Undo merge instead of keeping the old summary', async () => {
    const files = withPicked({ ok: true, name: NAME, text: '' })
    const copy = copyOf(documentStore.raw)
    copy.append(structuredClone(cyl), ai)
    files.open = async () => ({ ok: true, name: NAME, text: serializeProject(copy) })
    const persistence = usePersistenceStore()
    await persistence.mergeFile()
    expect(persistence.chipText).toBe(`Merged 1 step from ${NAME}`)

    // Pressed on the toast, not through persistence — the chip must still move.
    expect(merge.undoMerge()).toEqual({ ok: true })
    await nextTick()

    expect(persistence.chipText).toBe(`Took the merge from ${NAME} back out`)
  })
})

describe('local Undo after a merge says why it dropped a step (data-010 hand-off)', () => {
  it('returns the core note, which the header shows', () => {
    documentStore.append({ ...structuredClone(boxA), id: 'mine', name: 'Mine', params: { ...boxA.params, center: [80, 0, 5] } })
    const label = documentStore.raw.pendingUndo().label
    const other = copyOf(documentStore.raw)
    other.removeRecords(['mine'], ai)
    merge.mergeIn(fileOf(other), NAME)

    const result = documentStore.undo()

    expect(result).toMatchObject({ ok: true, note: undoAfterMergeNote(label, 'removed') })
  })
})
