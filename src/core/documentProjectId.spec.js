// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A project id tells copies of one project from different projects (`TODO/data-013`,
 * `docs/decisions/document-sync.md`).
 *
 * What this file pins down:
 *
 * 1. **Minting.** A document mints a project id on its first change, never on a load, and
 *    never twice: Undo of that first change keeps it. An untouched empty document still
 *    saves as `''`.
 * 2. **Two projects started from New** are refused with {@link UnrelatedProjectError}; a copy
 *    of one project (its file opened again, on another replica) still merges.
 * 3. **Legacy files** (no id: version 1, or version 2 from before this task) never get a
 *    random id, because two devices editing copies of one such file would mint two different
 *    ones and refuse each other. They are compared by the legacy rule, which now needs at least
 *    one id in common.
 * 4. **The file format**: the id rides in the state line's `merge.project`; record lines are
 *    unchanged and the state-line version stays 2.
 * 5. **Conflict wording** is the same on every replica and after a reload: a `local` row is
 *    never called "by you", since the row may have been made on another copy.
 */
import { describe, expect, it } from 'vitest'

import { UnrelatedProjectError, createDocument } from './document.js'
import { parseProject, serializeProject } from './project.js'

const MERGE = { origin: 'merge' }
const local = { origin: 'local' }
const ai = { origin: 'ai' }

/** @param {any} document @param {number} x */
function placeCube(document, x = 0) {
  const id = document.nextId('cuboid')
  document.append(
    { id, op: 'primitive.cuboid', name: document.nextName('Cube'), params: { size: [20, 20, 20], center: [x, 0, 10] } },
    local
  )
  return id
}

/**
 * Open a project file's text in a fresh document — the app's Open, minus the UI.
 *
 * @param {string} text
 * @param {Parameters<typeof createDocument>[0]} [options]
 */
function open(text, options = {}) {
  const parsed = parseProject(text)
  const document = createDocument(options)
  document.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed)
  return document
}

/** The merge state a file carries, as **Merge file…** reads it. @param {string} text */
const stateOfFile = (text) => open(text).mergeState()

/** @param {string} text */
const stateLineOf = (text) => JSON.parse(/** @type {string} */ (text.trimEnd().split('\n').at(-1)))

/** @param {string} text */
const recordLinesOf = (text) => text.trimEnd().split('\n').filter((line) => !line.includes('"warpcad":"project-state"'))

/** A version-1 file: legacy ids, no state line. */
const V1 =
  '{"id":"op-1","op":"primitive.cuboid","name":"Cube 1","params":{"size":[20,20,20],"center":[0,0,10]}}\n' +
  '{"id":"op-2","op":"primitive.cuboid","name":"Cube 2","params":{"size":[10,10,10],"center":[40,0,5]}}\n'

/** Another version-1 project, sharing no ids with {@link V1}. */
const OTHER_V1 = '{"id":"base","op":"primitive.cuboid","name":"Base","params":{"size":[40,40,4],"center":[0,0,2]}}\n'

describe('minting a project id', () => {
  it('a fresh document has none until its first change, and an untouched one still saves as an empty file', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    expect(document.mergeState().projectId).toBeNull()
    expect(serializeProject(document)).toBe('')
    placeCube(document)
    const id = document.mergeState().projectId
    expect(id).toMatch(/^[a-z2-7]{16}$/)
    placeCube(document, 40)
    expect(document.mergeState().projectId).toBe(id)
  })

  it('two fresh documents mint different ids', () => {
    const a = createDocument({ replica: 'aaaaaa' })
    const b = createDocument({ replica: 'bbbbbb' })
    placeCube(a)
    placeCube(b)
    expect(a.mergeState().projectId).not.toBe(b.mergeState().projectId)
  })

  it('Undo of the first change keeps the id, and the next change does not mint another', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    const id = document.mergeState().projectId
    document.undo()
    expect(document.mergeState().projectId).toBe(id)
    document.redo()
    expect(document.mergeState().projectId).toBe(id)
    document.undo()
    placeCube(document, 70)
    expect(document.mergeState().projectId).toBe(id)
  })

  it('New (loading an empty project) clears the old id; the first change mints a new one', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    const first = document.mergeState().projectId
    document.loadEntries([], null)
    expect(document.mergeState().projectId).toBeNull()
    placeCube(document)
    const second = document.mergeState().projectId
    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
  })

  it('a no-op change mints nothing', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    document.rollForward(local)
    expect(document.mergeState().projectId).toBeNull()
  })

  it('ensureProjectId mints one now, once, for a document that may have one', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    const id = document.ensureProjectId()
    expect(id).toMatch(/^[a-z2-7]{16}$/)
    expect(document.ensureProjectId()).toBe(id)
    placeCube(document)
    expect(document.mergeState().projectId).toBe(id)
  })

  it('an injected source is used, for specs that pin file bytes', () => {
    const document = createDocument({ replica: 'aaaaaa', mintProjectId: () => 'fixedprojectid22' })
    placeCube(document)
    expect(document.mergeState().projectId).toBe('fixedprojectid22')
  })
})

describe('two projects started from New are refused', () => {
  it('merging one into the other throws UnrelatedProjectError and changes nothing', () => {
    const mine = createDocument({ replica: 'aaaaaa' })
    const theirs = createDocument({ replica: 'bbbbbb' })
    placeCube(mine)
    placeCube(theirs, 50)
    const before = serializeProject(mine)
    expect(() => mine.mergeFrom(theirs.mergeState(), MERGE)).toThrow(UnrelatedProjectError)
    expect(serializeProject(mine)).toBe(before)
  })

  it('also through their saved files, as Merge file… reads them', () => {
    const mine = createDocument({ replica: 'aaaaaa' })
    const theirs = createDocument({ replica: 'bbbbbb' })
    placeCube(mine)
    placeCube(theirs, 50)
    expect(() => mine.mergeFrom(stateOfFile(serializeProject(theirs)), MERGE)).toThrow(UnrelatedProjectError)
  })

  it('so do two projects saved before ids were minted (version 2, no id), when they share no id', () => {
    const mine = createDocument({ replica: 'aaaaaa' })
    const theirs = createDocument({ replica: 'bbbbbb' })
    placeCube(mine)
    placeCube(theirs, 50)
    // What a build from before this task wrote: the same file, without `merge.project`.
    const strip = (/** @type {string} */ text) => {
      const lines = text.trimEnd().split('\n')
      const state = JSON.parse(/** @type {string} */ (lines.pop()))
      delete state.merge.project
      return [...lines, JSON.stringify(state)].join('\n') + '\n'
    }
    const oldMine = open(strip(serializeProject(mine)), { replica: 'cccccc' })
    expect(oldMine.mergeState().projectId).toBeNull()
    expect(() => oldMine.mergeFrom(stateOfFile(strip(serializeProject(theirs))), MERGE)).toThrow(UnrelatedProjectError)
  })
})

describe('a copy of one project still merges', () => {
  it('the same file opened twice, edited on both, merges both ways under the one id', () => {
    const laptop = createDocument({ replica: 'aaaaaa' })
    placeCube(laptop)
    const id = laptop.mergeState().projectId
    const phone = open(serializeProject(laptop), { replica: 'pppppp' })
    expect(phone.mergeState().projectId).toBe(id)

    placeCube(phone, 60)
    placeCube(laptop, -60)
    const outcome = laptop.mergeFrom(stateOfFile(serializeProject(phone)), MERGE)
    expect(outcome.change.added).toHaveLength(1)
    expect(laptop.entries).toHaveLength(3)
    expect(laptop.mergeState().projectId).toBe(id)

    phone.mergeFrom(laptop.mergeState(), MERGE)
    expect(serializeProject(phone)).toBe(serializeProject(laptop))
  })

  it('an empty document merging a copy takes its id, and later changes keep it', () => {
    const source = createDocument({ replica: 'aaaaaa' })
    placeCube(source)
    const target = createDocument({ replica: 'bbbbbb' })
    target.mergeFrom(source.mergeState(), MERGE)
    expect(target.mergeState().projectId).toBe(source.mergeState().projectId)
    placeCube(target, 40)
    expect(target.mergeState().projectId).toBe(source.mergeState().projectId)
  })
})

describe('the file format', () => {
  it('the id survives save → load → save, in the state line only, at version 2', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    placeCube(document, 40)
    const id = document.mergeState().projectId
    const text = serializeProject(document)

    expect(stateLineOf(text).version).toBe(2)
    expect(stateLineOf(text).merge.project).toBe(id)
    expect(recordLinesOf(text)).toEqual(document.entries.map((entry) => JSON.stringify(entry.record)))

    const reopened = open(text, { replica: 'bbbbbb' })
    expect(reopened.mergeState().projectId).toBe(id)
    expect(serializeProject(reopened)).toBe(text)
  })

  it('a version-1 file opened and saved unchanged is byte-identical, and has no id', () => {
    const document = open(V1)
    expect(document.mergeState().projectId).toBeNull()
    expect(serializeProject(document)).toBe(V1)
  })

  it('a version-1 file opened and edited is not given an id, and its record lines are unchanged', () => {
    const document = open(V1, { replica: 'aaaaaa' })
    placeCube(document, 80)
    expect(document.mergeState().projectId).toBeNull()
    const text = serializeProject(document)
    expect(stateLineOf(text).merge.project).toBeUndefined()
    expect(recordLinesOf(text).slice(0, 2)).toEqual(recordLinesOf(V1))
  })

  it('two copies of one version-1 file, each edited, still merge (no random id split them)', () => {
    const laptop = open(V1, { replica: 'aaaaaa' })
    const phone = open(V1, { replica: 'pppppp' })
    placeCube(laptop, 80)
    placeCube(phone, -80)
    laptop.mergeFrom(stateOfFile(serializeProject(phone)), MERGE)
    expect(laptop.entries).toHaveLength(4)
    expect(laptop.mergeState().projectId).toBeNull()
  })

  it('a document whose legacy content arrived by merge does not mint later', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    document.mergeFrom(stateOfFile(V1), MERGE)
    placeCube(document, 80)
    expect(document.mergeState().projectId).toBeNull()
    expect(document.ensureProjectId()).toBeNull()
  })

  it('a document seeded with actions is legacy, like the file it stands for', () => {
    const document = createDocument({ replica: 'aaaaaa', actions: parseProject(V1).entries.map((entry) => entry.record) })
    placeCube(document, 80)
    expect(document.mergeState().projectId).toBeNull()
  })
})

describe('a version-1 file and a project with an id (the legacy rule, kept)', () => {
  /** A project that has an id and holds V1's rows: an empty project that merged V1 in. */
  function projectHoldingV1() {
    const document = createDocument({ replica: 'aaaaaa' })
    const id = document.ensureProjectId()
    document.mergeFrom(stateOfFile(V1), MERGE)
    placeCube(document, 80)
    expect(document.mergeState().projectId).toBe(id)
    return document
  }

  it('merges when every shared id holds a byte-identical record', () => {
    const document = projectHoldingV1()
    const outcome = document.mergeFrom(stateOfFile(V1), MERGE)
    expect(outcome.change.added).toEqual([])
  })

  it('is refused when a shared id holds a different record', () => {
    const document = projectHoldingV1()
    const changed = V1.replace('"size":[10,10,10]', '"size":[11,11,11]')
    expect(() => document.mergeFrom(stateOfFile(changed), MERGE)).toThrow(UnrelatedProjectError)
  })

  it('is refused when no id is shared at all', () => {
    const document = projectHoldingV1()
    expect(() => document.mergeFrom(stateOfFile(OTHER_V1), MERGE)).toThrow(UnrelatedProjectError)
  })

  it('a project started from New and an unrelated version-1 file are refused', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    expect(() => document.mergeFrom(stateOfFile(V1), MERGE)).toThrow(UnrelatedProjectError)
  })
})

describe('conflict wording names no person for a local row', () => {
  /**
   * The laptop moves Cube 1 while the phone fillets it — both by hand, on two copies of one
   * project — and the phone's file is merged into the laptop.
   */
  function conflicted() {
    const laptop = createDocument({ replica: 'aaaaaa' })
    const cube = placeCube(laptop)
    const phone = open(serializeProject(laptop), { replica: 'pppppp' })
    laptop.append({ id: laptop.nextId('move'), op: 'transform.translate', target: cube, supersedes: cube, params: { vector: [5, 0, 0] } }, local)
    phone.append(
      { id: phone.nextId('fillet'), op: 'modify.filletRim', target: cube, supersedes: cube, params: { face: 'top', radius: 2 } },
      local
    )
    const outcome = laptop.mergeFrom(stateOfFile(serializeProject(phone)), MERGE)
    return { laptop, phone, outcome }
  }

  it('a local winner is named by step and label only — never "by you"', () => {
    const { outcome } = conflicted()
    expect(outcome.conflicts).toHaveLength(1)
    expect(outcome.conflicts[0].reason).toMatch(/^conflicts with step 2 \((Move|Fillet) Cube 1\)$/)
  })

  it('reads the same on the other copy and after a reload', () => {
    const { laptop, phone, outcome } = conflicted()
    expect(outcome.conflicts).toHaveLength(1)
    phone.mergeFrom(laptop.mergeState(), MERGE)
    const reasonOn = (/** @type {any} */ document) =>
      document.timeline().find((/** @type {any} */ row) => row.id === outcome.conflicts[0].id).broken
    expect(reasonOn(phone)).toBe(outcome.conflicts[0].reason)
    expect(reasonOn(open(serializeProject(laptop), { replica: 'rrrrrr' }))).toBe(outcome.conflicts[0].reason)
  })

  it('a winner from another program still says which', () => {
    // Cube 1 comes from a file neither side minted, so same-gap order follows the stamps.
    const laptop = open(V1, { replica: 'aaaaaa' })
    const fork = open(V1, { replica: 'ffffff' })
    fork.append({ id: fork.nextId('move'), op: 'transform.translate', target: 'op-1', supersedes: 'op-1', params: { vector: [5, 0, 0] } }, ai)
    // Stamped later than the fork's row, so the fork's move folds first and wins.
    laptop.observeMergeClock(fork.mergeClock() + 5)
    laptop.append({ id: laptop.nextId('fillet'), op: 'modify.filletRim', target: 'op-1', supersedes: 'op-1', params: { face: 'top', radius: 2 } }, local)
    const outcome = laptop.mergeFrom(fork.mergeState(), MERGE)
    expect(outcome.conflicts.map((conflict) => conflict.reason)).toEqual(['conflicts with step 3 (Move Cube 1, via ai)'])
  })
})
