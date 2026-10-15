// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument, ReplayRejection } from './document.js'
import { parseProject, serializeProject } from './project.js'
import { paramEditRecord } from './paramEdit.js'
import { registry as realRegistry } from './kernel/registry.js'
import { buildNameIndex, describeRow } from './timelineLabel.js'

const local = { origin: 'local' }

/** @param {Record<string, any>} [options] */
function realDoc(options = {}) {
  return createDocument({ registry: realRegistry, ...options })
}

/**
 * A parameter edit the way the Inspector commits one (`useParamCommands`): the replace path.
 *
 * @param {any} document
 * @param {string} bodyId
 * @param {Record<string, any>} changes
 */
function editParams(document, bodyId, changes) {
  const record = paramEditRecord(document, bodyId, changes)
  if (record === null) throw new Error('nothing to edit')
  document.reviseRecords([{ id: String(record.id), record }], local)
}

/**
 * A cuboid root named like the Library drop would.
 *
 * @param {any} document
 * @param {string} [id]
 * @param {string} [name]
 * @param {number[]} [size]
 */
function cube(document, id = 'cube-1', name = 'Cube 1', size = [10, 10, 10]) {
  document.append({ id, op: 'primitive.cuboid', name, params: { size, center: [0, 0, 0] } }, local)
}

describe('document.renameBody (TODO/core-038)', () => {
  it('appends one unnamed style.rename record and bodies() reports the new name', () => {
    const document = realDoc()
    cube(document)
    const { record } = document.renameBody('cube-1', 'Pi camera bolt', local)
    expect(record.op).toBe('style.rename')
    expect(record.supersedes).toBe('cube-1')
    // The name rides in `params`, never on `record.name`: a named record would join the
    // scene group as a second part and be counted by `nextName`.
    expect(record.name).toBeUndefined()
    expect(record.params).toEqual({ name: 'Pi camera bolt' })
    const [body] = document.bodies()
    expect(body.id).toBe('cube-1')
    expect(body.name).toBe('Pi camera bolt')
    expect(document.bodies()).toHaveLength(1)
    expect(document.records).toHaveLength(2)
  })

  it('renaming twice: the newest wins', () => {
    const document = realDoc()
    cube(document)
    document.renameBody('cube-1', 'First', local)
    document.renameBody('cube-1', 'Second', local)
    expect(document.bodies()[0].name).toBe('Second')
  })

  it('null or blank clears the override back to the generated name', () => {
    const document = realDoc()
    cube(document)
    document.renameBody('cube-1', 'Mine', local)
    document.renameBody('cube-1', null, local)
    expect(document.bodies()[0].name).toBe('Cube 1')
    document.renameBody('cube-1', 'Mine again', local)
    document.renameBody('cube-1', '   ', local)
    expect(document.bodies()[0].name).toBe('Cube 1')
  })

  it('undo restores the old name, redo brings the new one back', () => {
    const document = realDoc()
    cube(document)
    document.renameBody('cube-1', 'Mine', local)
    document.undo()
    expect(document.bodies()[0].name).toBe('Cube 1')
    document.redo()
    expect(document.bodies()[0].name).toBe('Mine')
  })

  it('survives a later move, param edit and snap-style supersession', () => {
    const document = realDoc()
    cube(document)
    document.renameBody('cube-1', 'Mine', local)
    document.append(
      { id: 'cube-1-move', op: 'transform.translate', target: 'cube-1', supersedes: document.currentIdOf('cube-1'), params: { vector: [5, 0, 0] } },
      local
    )
    expect(document.bodies()[0].name).toBe('Mine')
    editParams(document, 'cube-1', { size: [20, 10, 10] })
    expect(document.bodies()[0].name).toBe('Mine')
    // A rename after the chain grew still addresses the same lineage.
    document.renameBody('cube-1', 'Later', local)
    expect(document.bodies()[0].name).toBe('Later')
  })

  it('ui-029 repro: edit diameter, rename, edit height — diameter does not revert, name survives', () => {
    const document = realDoc()
    document.append(
      { id: 'cyl', op: 'primitive.cylinder', name: 'Cylinder 1', params: { diameter: 10, height: 10, center: [0, 0, 0] } },
      local
    )
    editParams(document, 'cyl', { diameter: 16 })
    document.renameBody('cyl', 'Spacer', local)
    expect(document.bodies()[0].params.diameter).toBe(16)
    editParams(document, 'cyl', { height: 25 })
    const [body] = document.bodies()
    expect(body.params.diameter).toBe(16)
    expect(body.params.height).toBe(25)
    expect(body.name).toBe('Spacer')
    expect(document.bodies()).toHaveLength(1)
  })

  it('nextName ignores the override and still skips a renamed root\'s number', () => {
    const document = realDoc()
    cube(document)
    document.renameBody('cube-1', 'Pi camera bolt', local)
    expect(document.nextName('Cube')).toBe('Cube 2')
    // A rename *to* a generated-looking name does not move the counter either.
    document.renameBody('cube-1', 'Cube 9', local)
    expect(document.nextName('Cube')).toBe('Cube 2')
  })

  it('refuses a rename of a deleted body, by its displayed name, and an unknown id', () => {
    const document = realDoc()
    cube(document)
    document.renameBody('cube-1', 'Mine', local)
    document.deleteBodies(['cube-1'], local)
    expect(() => document.renameBody('cube-1', 'x', local)).toThrow(/Mine.*deleted/)
    expect(() => document.renameBody('nope', 'x', local)).toThrow(/no such body/)
  })

  it('refuses an invalid name and writes nothing', () => {
    const document = realDoc()
    cube(document)
    for (const bad of ['x'.repeat(61), 'a\nb', 5]) {
      expect(() => document.renameBody('cube-1', /** @type {any} */ (bad), local)).toThrow(/renameBody/)
    }
    expect(document.records).toHaveLength(1)
  })

  it('allows a duplicate name', () => {
    const document = realDoc()
    cube(document, 'a', 'Cube 1')
    cube(document, 'b', 'Cube 2')
    document.renameBody('b', 'Cube 1', local)
    expect(document.bodies().map((body) => body.name)).toEqual(['Cube 1', 'Cube 1'])
  })

  it('round-trips through save and load', () => {
    const document = realDoc()
    cube(document)
    document.renameBody('cube-1', 'Pi camera bolt', local)
    const parsed = parseProject(serializeProject(document))
    const reloaded = realDoc()
    reloaded.loadEntries(parsed.entries)
    expect(reloaded.bodies()[0].name).toBe('Pi camera bolt')
  })

  it('a refusal names the new name: a step that needs a renamed body, replayed ahead of it', () => {
    const document = realDoc()
    cube(document, 'a', 'Cube 1')
    cube(document, 'b', 'Cube 2')
    document.renameBody('a', 'Base plate', local)
    document.append(
      {
        id: 'u',
        op: 'boolean.union',
        name: 'Union 1',
        target: String(document.currentIdOf('a')),
        operands: ['b'],
        consumes: [String(document.currentIdOf('a')), 'b'],
      },
      local
    )
    const rows = document.records.map((record) => ({ record, origin: 'local' }))
    // The union moved ahead of the rename it depends on: its operand is the rename record,
    // which the file does not have yet, and the message must name it as the user does.
    const reordered = [rows[0], rows[1], rows[3], rows[2]]
    let rejection
    try {
      realDoc().loadEntries(reordered)
    } catch (error) {
      rejection = error
    }
    expect(rejection).toBeInstanceOf(ReplayRejection)
    expect(/** @type {ReplayRejection} */ (rejection).step.reason).toBe('needs Base plate')
  })

  it('the history step label reads "Rename <name>", and the timeline row follows the new name', () => {
    const document = realDoc()
    cube(document)
    document.append(
      { id: 'cube-1-move', op: 'transform.translate', target: 'cube-1', supersedes: 'cube-1', params: { vector: [1, 0, 0] } },
      local
    )
    document.renameBody('cube-1', 'Mine', local)
    expect(document.pendingUndo()?.label).toBe('Rename Mine')
    const names = buildNameIndex(document.records)
    expect(names.get('cube-1')).toBe('Mine')
    expect(names.get('cube-1-move')).toBe('Mine')
    expect(describeRow(document.records.at(-1), names)).toBe('Rename Mine')
    document.renameBody('cube-1', null, local)
    const cleared = buildNameIndex(document.records)
    expect(cleared.get('cube-1-move')).toBe('Cube 1')
    expect(describeRow(document.records.at(-1), cleared)).toBe('Reset name of Cube 1')
  })
})
