// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ui-107`: a model file imported **into the project**, never into My parts.
 *
 * `document.importUserPart` puts a part definition the library has never seen into the open
 * project's part layer and appends the records that place it, as **one** transaction with a
 * local origin. One Undo removes the placed instance; the definition the project carried only
 * for it is then no longer written by a save. A refusal anywhere leaves the document and the
 * project layer exactly as they were.
 *
 * And the one op change a revision may now make besides Detach: an imported mesh re-read in
 * other units (`withUnits`), so **Change units** in the Inspector is one undoable step.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { parseProject, serializeProject } from './project.js'
import { recordsForDrop } from './library.js'
import { effectiveUserPart, ensureProjectParts, resetUserParts, withdrawProjectPart } from './userPart.js'
import { importMeshBytes } from '../io/meshJob.js'
import { meshPartDefinition, withUnits } from '../io/meshPart.js'
import { binaryStl, cubeTriangles } from '../io/__fixtures__/stl.js'

const LOCAL = { origin: 'local', label: 'Import bracket.stl' }

/** @param {number} size @param {string} [name] @param {string} [op] */
async function bracketPart(size = 10, name = 'bracket', op = undefined) {
  const result = await importMeshBytes(`${name}.stl`, binaryStl(cubeTriangles(size)))
  if (!result.ok || result.kind !== 'mesh') throw new Error(result.ok ? 'not one mesh' : result.reason)
  return meshPartDefinition({ record: result.record, name, triangleCount: result.triangleCount, ...(op ? { op } : {}) })
}

afterEach(() => resetUserParts())

describe('document.importUserPart — one transaction, one Undo', () => {
  it('adds the definition to the project and the placed records in one step, and one Undo removes the instance', async () => {
    const part = await bracketPart()
    const document = createDocument({ publishesUserParts: true })
    const records = document.importUserPart(part, () => recordsForDrop(part.op, { x: 5, y: 5 }, document), LOCAL)

    expect(records.map((record) => record.op)).toEqual(['user.bracket', 'transform.translate'])
    expect(document.bodies().map((body) => body.op)).toEqual(['user.bracket'])
    expect(document.userParts().map((definition) => definition.op)).toEqual(['user.bracket'])
    expect(effectiveUserPart('user.bracket')).toBeDefined()
    // One step on the stack, named for the file.
    expect(document.pendingUndo()?.label).toBe('Import bracket.stl')
    expect(parseProject(serializeProject(document)).userParts.map((definition) => definition.op)).toEqual(['user.bracket'])

    document.undo()
    expect(document.bodies()).toEqual([])
    expect(document.canUndo()).toBe(false)
    // The definition is no longer written: a save carries only the parts live records use.
    expect(parseProject(serializeProject(document)).userParts).toEqual([])

    document.redo()
    expect(document.bodies().map((body) => body.op)).toEqual(['user.bracket'])
  })

  it('refuses an invalid definition and changes nothing', () => {
    const document = createDocument({ publishesUserParts: true })
    expect(() =>
      document.importUserPart(/** @type {any} */ ({ op: 'user.x', name: 'x', version: 1, records: [] }), () => [], LOCAL)
    ).toThrow()
    expect(document.entries).toEqual([])
    expect(document.userParts()).toEqual([])
    expect(effectiveUserPart('user.x')).toBeUndefined()
    expect(document.canUndo()).toBe(false)
  })

  it('a placement that does not fold leaves the document and the project layer as they were', async () => {
    const part = await bracketPart()
    const document = createDocument({ publishesUserParts: true })
    expect(() =>
      document.importUserPart(
        part,
        () => [
          { id: 'b-1', op: part.op, name: 'bracket 1', params: {} },
          { id: 'bad-1', op: 'transform.translate', target: 'nowhere', params: { vector: [0, 0, 0] } },
        ],
        LOCAL
      )
    ).toThrow()
    expect(document.entries).toEqual([])
    expect(document.userParts()).toEqual([])
    expect(effectiveUserPart('user.bracket')).toBeUndefined()
  })

  it('refuses a definition whose op the project already carries as a different part', async () => {
    const document = createDocument({ publishesUserParts: true })
    const first = await bracketPart(10)
    document.importUserPart(first, () => recordsForDrop(first.op, { x: 0, y: 0 }, document), LOCAL)
    const other = await bracketPart(20)
    expect(() => document.importUserPart(other, () => recordsForDrop(other.op, { x: 0, y: 0 }, document), LOCAL)).toThrow(/already carries/)
    expect(document.bodies()).toHaveLength(1)
  })

  it('an imported definition with no library entry behind it survives save and reload', async () => {
    const part = await bracketPart()
    const document = createDocument({ publishesUserParts: true })
    document.importUserPart(part, () => recordsForDrop(part.op, { x: 0, y: 0 }, document), LOCAL)
    const text = serializeProject(document)
    resetUserParts()
    const parsed = parseProject(text)
    expect(parsed.warnings).toEqual([])
    const reopened = createDocument({ publishesUserParts: true })
    reopened.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, { userParts: parsed.userParts })
    expect(reopened.bodies().map((body) => body.op)).toEqual(['user.bracket'])
    expect(reopened.brokenSteps()).toEqual([])
  })
})

describe('withdrawProjectPart — a placement session cancelled', () => {
  it('takes a staged definition back out of the project layer', async () => {
    const part = await bracketPart()
    ensureProjectParts([part])
    expect(effectiveUserPart('user.bracket')).toBeDefined()
    withdrawProjectPart('user.bracket')
    expect(effectiveUserPart('user.bracket')).toBeUndefined()
  })
})

describe('Change units — the instance swaps to a units re-read of its part, as one revision', () => {
  it('accepts user.A → user.B when B is A in other units, and one Undo puts A back', async () => {
    const part = await bracketPart(1)
    const document = createDocument({ publishesUserParts: true })
    const [created] = document.importUserPart(part, () => recordsForDrop(part.op, { x: 0, y: 0 }, document), LOCAL)
    const inches = { ...withUnits(part, 'inch'), op: 'user.bracket-2', version: 1 }
    ensureProjectParts([inches])
    document.reviseRecords([{ id: String(created.id), record: { ...created, op: inches.op } }], { origin: 'local' })
    expect(document.bodies()[0].op).toBe('user.bracket-2')
    expect(document.userParts().map((definition) => definition.op)).toEqual(['user.bracket', 'user.bracket-2'])
    document.undo()
    expect(document.bodies()[0].op).toBe('user.bracket')
  })

  it('still refuses swapping a placed part for a different part', async () => {
    const part = await bracketPart(1)
    const document = createDocument({ publishesUserParts: true })
    const [created] = document.importUserPart(part, () => recordsForDrop(part.op, { x: 0, y: 0 }, document), LOCAL)
    const other = await bracketPart(3, 'other')
    ensureProjectParts([other])
    expect(() =>
      document.reviseRecords([{ id: String(created.id), record: { ...created, op: other.op } }], { origin: 'local' })
    ).toThrow(/may not change/)
  })
})
