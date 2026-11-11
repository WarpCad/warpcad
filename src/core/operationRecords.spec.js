// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { buildOperateRecords } from '../ai/tools/operate.js'
import { selectedOperandsOf } from '../composables/useSelectedBody.js'
import { createDocument } from './document.js'
import { planGroupMerge } from './groupMerge.js'
import { mirrorRotationDeg } from './kernel/group.js'
import { recordsForDrop } from './library.js'
import {
  bisectParams,
  booleanRecord,
  groupMergeRecord,
  groupRecord,
  inPlaceRecord,
  mirrorRecord,
  operandFromSelection,
  snapAlignRecord,
} from './operationRecords.js'
import { rotateRecord, translateRecord } from './transform.js'

const LOCAL = { origin: 'local' }

/** @typedef {import('./document.js').WarpDocument} WarpDocument */
/** @typedef {import('./operationRecords.js').RecordOperand} RecordOperand */

/**
 * @param {WarpDocument} document
 * @param {string} op
 * @param {{ x: number, y: number }} pointMm
 * @param {Record<string, any>} [overrides]
 * @returns {string}
 */
function place(document, op, pointMm, overrides = {}) {
  const records = recordsForDrop(op, pointMm, document, overrides)
  document.appendAll(records, LOCAL)
  return /** @type {string} */ (records[0].id)
}

/**
 * @param {number} count
 * @returns {{ document: WarpDocument, ids: string[] }}
 */
function cubes(count) {
  const document = createDocument({ replica: 'abcdef' })
  const ids = Array.from({ length: count }, (_, index) => place(document, 'primitive.cuboid', { x: index * 15, y: 0 }, { size: [20, 20, 20] }))
  return { document, ids }
}

/**
 * One body as a builder operand, the way either caller resolves it: its lineage root, its
 * terminal record, its name, and the ref (bare or addressed at a part).
 *
 * @param {WarpDocument} document
 * @param {string} rootId
 * @param {string} [pieces]
 * @returns {RecordOperand}
 */
function operandOf(document, rootId, pieces) {
  const terminal = /** @type {string} */ (document.currentIdOf(rootId))
  const name = /** @type {string} */ (document.bodies().find((body) => body.id === rootId)?.name)
  return { id: rootId, terminal, name, ref: pieces === undefined ? terminal : { id: terminal, pieces } }
}

/**
 * Move a body so its terminal record differs from its lineage root.
 *
 * @param {WarpDocument} document
 * @param {string} rootId
 * @returns {string} The new terminal id.
 */
function move(document, rootId) {
  const record = translateRecord(document, rootId, [0, 0, 5])
  document.append(record, LOCAL)
  return /** @type {string} */ (record.id)
}

/**
 * A group of two cubes beside a plate: a body with parts to drill into.
 *
 * @returns {{ document: WarpDocument, group: string, plate: string }}
 */
function groupAndPlate() {
  const { document, ids } = cubes(2)
  const assemble = groupRecord(document, [operandOf(document, ids[0]), operandOf(document, ids[1])])
  document.append(assemble, LOCAL)
  const plate = place(document, 'primitive.cuboid', { x: 0, y: 0 }, { size: [100, 100, 2] })
  return { document, group: /** @type {string} */ (assemble.id), plate }
}

/**
 * A second document folded from the same entries, so the UI path and the AI path each run
 * against an identical document and mint identical ids.
 *
 * @param {WarpDocument} document
 * @returns {WarpDocument}
 */
function twinOf(document) {
  const twin = createDocument({ replica: document.replicaId() })
  twin.loadEntries(document.entries.map((entry) => ({ record: entry.record, origin: entry.origin })))
  return twin
}

describe('booleanRecord', () => {
  it('a fresh pair: named, first operand as target, every operand consumed', () => {
    const { document, ids } = cubes(2)
    const record = booleanRecord(document, 'boolean.subtract', ids.map((id) => operandOf(document, id)))
    expect(record).toEqual({
      id: 'bool-abcdef-3',
      op: 'boolean.subtract',
      name: 'Subtract 1',
      target: ids[0],
      operands: [ids[1]],
      consumes: ids,
    })
  })

  it('names each label by its own op', () => {
    const { document, ids } = cubes(2)
    const operands = ids.map((id) => operandOf(document, id))
    expect(booleanRecord(document, 'boolean.union', operands).name).toBe('Union 1')
    expect(booleanRecord(document, 'boolean.intersect', operands).name).toBe('Intersect 1')
  })

  it('a moved body is named by its terminal record, in target, operands and consumes', () => {
    const { document, ids } = cubes(2)
    const moved = move(document, ids[1])
    const record = booleanRecord(document, 'boolean.union', ids.map((id) => operandOf(document, id)))
    expect(record.target).toBe(ids[0])
    expect(record.operands).toEqual([moved])
    expect(record.consumes).toEqual([ids[0], moved])
  })

  it('a drilled-in operand goes in as { id, pieces }; consumes stays bare ids', () => {
    const { document, group, plate } = groupAndPlate()
    const record = booleanRecord(document, 'boolean.subtract', [operandOf(document, plate), operandOf(document, group, 'Cube 1')])
    expect(record.target).toBe(plate)
    expect(record.operands).toEqual([{ id: group, pieces: 'Cube 1' }])
    expect(record.consumes).toEqual([plate, group])
    expect(() => document.append(record, LOCAL)).not.toThrow()
  })

  it('refuses an op that is not a boolean, and fewer than two operands', () => {
    const { document, ids } = cubes(2)
    expect(() => booleanRecord(document, 'group.assemble', ids.map((id) => operandOf(document, id)))).toThrow(/not a boolean/)
    expect(() => booleanRecord(document, 'boolean.union', [operandOf(document, ids[0])])).toThrow(/2 or more/)
  })
})

describe('inPlaceRecord', () => {
  it('a fresh body: unnamed, target and supersedes its record, params as given', () => {
    const { document, ids } = cubes(1)
    const record = inPlaceRecord(document, 'modify.filletRim', operandOf(document, ids[0]), { radius: 2, orientation: 'z+' })
    expect(record).toEqual({
      id: 'fillet-abcdef-2',
      op: 'modify.filletRim',
      target: ids[0],
      supersedes: ids[0],
      params: { radius: 2, orientation: 'z+' },
    })
  })

  it('each in-place op takes its own id prefix', () => {
    const { document, ids } = cubes(1)
    const operand = operandOf(document, ids[0])
    /** @type {Record<string, string>} */
    const prefixes = {
      'modify.filletRim': 'fillet',
      'modify.chamferRim': 'chamfer',
      'modify.enlarge': 'enlarge',
      'modify.fit': 'fit',
      'modify.bisect': 'bisect',
      'modify.splitWithJoint': 'split',
      'group.setPartHidden': 'hide',
      'group.renamePart': 'renamepart',
    }
    for (const [op, prefix] of Object.entries(prefixes)) {
      expect(String(inPlaceRecord(document, op, operand, {}).id), op).toMatch(new RegExp(`^${prefix}-abcdef-\\d+$`))
    }
  })

  it('a moved body: target and supersedes are its terminal record, not its root', () => {
    const { document, ids } = cubes(1)
    const moved = move(document, ids[0])
    const record = inPlaceRecord(document, 'modify.enlarge', operandOf(document, ids[0]), { deltaMm: [1, 2, 3] })
    expect(record.target).toBe(moved)
    expect(record.supersedes).toBe(moved)
    expect(record.name).toBeUndefined()
  })

  it('a drilled-in operand still edits the whole body: bare terminal id, no part address', () => {
    const { document, group } = groupAndPlate()
    const record = inPlaceRecord(document, 'modify.chamferRim', operandOf(document, group, 'Cube 1'), { radius: 1, orientation: 'z+' })
    expect(record.target).toBe(group)
    expect(record.supersedes).toBe(group)
  })

  it('refuses an op that is not an in-place edit', () => {
    const { document, ids } = cubes(1)
    expect(() => inPlaceRecord(document, 'boolean.union', operandOf(document, ids[0]), {})).toThrow(/not an in-place edit/)
  })
})

describe('bisectParams', () => {
  it('no tilt is the plain two-field shape, with no tilt keys at all', () => {
    expect(bisectParams({ axis: 'z', offsetMm: 5 })).toEqual({ axis: 'z', offsetMm: 5 })
    expect(bisectParams({ axis: 'z', offsetMm: 5, angleDeg: 0, rotateAxis: 'x', rotateOffsetMm: 3 })).toEqual({ axis: 'z', offsetMm: 5 })
    expect(bisectParams({ axis: 'z', offsetMm: 5, angleDeg: Number.NaN })).toEqual({ axis: 'z', offsetMm: 5 })
  })

  it('a tilt carries its axis, and a hinge offset only when it is a number', () => {
    expect(bisectParams({ axis: 'z', offsetMm: 5, angleDeg: 30, rotateAxis: 'x' })).toEqual({ axis: 'z', offsetMm: 5, angleDeg: 30, rotateAxis: 'x' })
    expect(bisectParams({ axis: 'z', offsetMm: 5, angleDeg: 30, rotateAxis: 'x', rotateOffsetMm: 0 })).toEqual({
      axis: 'z',
      offsetMm: 5,
      angleDeg: 30,
      rotateAxis: 'x',
      rotateOffsetMm: 0,
    })
    expect(bisectParams({ axis: 'z', offsetMm: 5, angleDeg: 30, rotateAxis: 'x', rotateOffsetMm: null })).not.toHaveProperty('rotateOffsetMm')
  })
})

describe('groupRecord', () => {
  it('fresh bodies: a named group.assemble whose parts take the bodies’ names', () => {
    const { document, ids } = cubes(2)
    expect(groupRecord(document, ids.map((id) => operandOf(document, id)))).toEqual({
      id: 'group-abcdef-3',
      op: 'group.assemble',
      name: 'Group 1',
      target: ids[0],
      operands: [ids[1]],
      consumes: ids,
      params: { names: ['Cube 1', 'Cube 2'] },
    })
  })

  it('a moved body joins by its terminal record and under its body name', () => {
    const { document, ids } = cubes(2)
    const moved = move(document, ids[0])
    const record = groupRecord(document, ids.map((id) => operandOf(document, id)))
    expect(record.target).toBe(moved)
    expect(record.consumes).toEqual([moved, ids[1]])
    expect(record.params?.names).toEqual(['Cube 1', 'Cube 2'])
  })

  it('a drilled-in operand is grouped whole: bare terminal ids, its body name, never "Group 1 › Cube 1"', () => {
    const { document, ids } = cubes(3)
    const operands = [operandOf(document, ids[0]), { ...operandOf(document, ids[1]), ref: { id: ids[1], pieces: 'x' } }]
    const record = groupRecord(document, operands)
    expect(record.target).toBe(ids[0])
    expect(record.operands).toEqual([ids[1]])
    expect(record.params?.names).toEqual(['Cube 1', 'Cube 2'])
  })

  it('takes given names, trimmed, and refuses a wrong count, a blank or a repeat', () => {
    const { document, ids } = cubes(2)
    const operands = ids.map((id) => operandOf(document, id))
    expect(groupRecord(document, operands, [' Board ', 'USB-A']).params?.names).toEqual(['Board', 'USB-A'])
    expect(() => groupRecord(document, operands, ['One'])).toThrow(/one name per operand/)
    expect(() => groupRecord(document, operands, ['A', ' '])).toThrow(/1 to 80 characters/)
    expect(() => groupRecord(document, operands, ['A', 'A'])).toThrow(/must be unique/)
  })

  it('refuses an operand with named parts rather than flatten them', () => {
    const { document, group, plate } = groupAndPlate()
    expect(() => groupRecord(document, [operandOf(document, plate), operandOf(document, group)])).toThrow(/has named parts/)
  })

  it('a recoloured operand keeps its colour: the planner’s group.merge (TODO/core-077)', () => {
    const { document, ids } = cubes(2)
    document.setColorOverride(ids[0], { color: 0xff0000 }, LOCAL)
    const record = groupRecord(document, ids.map((id) => operandOf(document, id)))
    expect(record).toMatchObject({ op: 'group.merge', params: { members: [{ name: 'Cube 1', colors: { 'Cube 1': { color: 0xff0000 } } }, { name: 'Cube 2' }] } })
    expect(String(record.id)).toMatch(/^group-abcdef-\d+$/)
  })
})

describe('groupMergeRecord', () => {
  it('writes a plan’s record under a fresh group id', () => {
    const { document, group, plate } = groupAndPlate()
    const plan = planGroupMerge(document, [operandOf(document, group), operandOf(document, plate)].map(({ id, terminal, name }) => ({ id, terminal, name })))
    const record = groupMergeRecord(document, plan)
    expect(record).toEqual({ id: expect.stringMatching(/^group-abcdef-\d+$/), ...plan.record })
  })

  it('refuses a plan with errors, in the plan’s own words', () => {
    const { document } = cubes(0)
    const one = place(document, 'hardware.bolt', { x: 0, y: 0 })
    const two = place(document, 'hardware.bolt', { x: 60, y: 0 })
    const plan = planGroupMerge(
      document,
      [operandOf(document, one), operandOf(document, two)].map(({ id, terminal, name }) => ({ id, terminal, name })),
      [{}, { prefix: '' }],
    )
    expect(plan.record).toBeNull()
    expect(() => groupMergeRecord(document, plan)).toThrow(plan.errors[0])
  })
})

describe('snapAlignRecord', () => {
  it('fresh bodies: the moving body is superseded, the reference stays', () => {
    const { document, ids } = cubes(2)
    const record = snapAlignRecord(document, 'group.snap', ids.map((id) => operandOf(document, id)), { axes: 'z', orientation: 'outside+', deltaMm: 0 })
    expect(record).toEqual({
      id: 'snap-abcdef-3',
      op: 'group.snap',
      target: ids[0],
      operands: [ids[1]],
      supersedes: ids[0],
      params: { axes: 'z', orientation: 'outside+', deltaMm: 0 },
    })
    expect(String(snapAlignRecord(document, 'group.align', ids.map((id) => operandOf(document, id)), { axes: 'x', deltaMm: 0 }).id)).toMatch(/^align-/)
  })

  it('a moved body is superseded at its terminal record', () => {
    const { document, ids } = cubes(2)
    const moved = move(document, ids[0])
    const record = snapAlignRecord(document, 'group.align', ids.map((id) => operandOf(document, id)), { axes: 'x', deltaMm: 0 })
    expect(record.target).toBe(moved)
    expect(record.supersedes).toBe(moved)
  })

  it('a drilled-in moving body is addressed in target, but supersedes stays a bare id', () => {
    const { document, group, plate } = groupAndPlate()
    const record = snapAlignRecord(document, 'group.snap', [operandOf(document, group, 'Cube 1'), operandOf(document, plate)], {
      axes: 'z',
      orientation: 'outside-',
      deltaMm: 0,
    })
    expect(record.target).toEqual({ id: group, pieces: 'Cube 1' })
    expect(record.supersedes).toBe(group)
  })

  it('refuses an op that is not snap or align, and anything but two operands', () => {
    const { document, ids } = cubes(3)
    expect(() => snapAlignRecord(document, 'boolean.union', ids.slice(0, 2).map((id) => operandOf(document, id)), {})).toThrow(/not snap or align/)
    expect(() => snapAlignRecord(document, 'group.snap', ids.map((id) => operandOf(document, id)), {})).toThrow(/exactly 2/)
  })
})

describe('mirrorRecord', () => {
  it('a fresh body: a new named body, the plane as a point, the reflected rotation', () => {
    const { document, ids } = cubes(1)
    expect(mirrorRecord(document, operandOf(document, ids[0]), { axis: 'x', planeMm: 30 })).toEqual({
      id: 'mirror-abcdef-2',
      op: 'transform.mirror',
      name: 'Mirror 1',
      target: ids[0],
      params: { axis: 'x', pointMm: [30, 0, 0], rotation: mirrorRotationDeg([0, 0, 0], 'x') },
    })
  })

  it('a blank plane leaves pointMm out, so the body’s own centre applies', () => {
    const { document, ids } = cubes(1)
    expect(mirrorRecord(document, operandOf(document, ids[0]), { axis: 'y', planeMm: null }).params).not.toHaveProperty('pointMm')
    expect(mirrorRecord(document, operandOf(document, ids[0]), { axis: 'y' }).params).not.toHaveProperty('pointMm')
  })

  it('a moved and turned body: targeted at its terminal record, its rotation reflected', () => {
    const { document, ids } = cubes(1)
    const turn = rotateRecord(document, ids[0], [0, 0, 30])
    document.append(turn, LOCAL)
    const record = mirrorRecord(document, operandOf(document, ids[0]), { axis: 'x', planeMm: 0 })
    expect(record.target).toBe(turn.id)
    const rotationDeg = /** @type {[number, number, number]} */ (document.bodies().find((body) => body.id === ids[0])?.rotationDeg)
    expect(record.params?.rotation).toEqual(mirrorRotationDeg(rotationDeg, 'x'))
  })

  it('a drilled-in operand mirrors the whole body: bare terminal id', () => {
    const { document, group } = groupAndPlate()
    expect(mirrorRecord(document, operandOf(document, group, 'Cube 1'), { axis: 'z', planeMm: 0 }).target).toBe(group)
  })
})

describe('the UI path and the AI tool path write the same record', () => {
  /**
   * The UI path: the selection resolved by the composable's own pure resolver, then the
   * builder. This is what OperationsToolbar.vue and AlignPopover.vue call.
   *
   * @param {WarpDocument} document
   * @param {string[]} ids
   * @param {Record<string, string>} [parts]
   * @returns {RecordOperand[]}
   */
  function uiOperands(document, ids, parts = {}) {
    return selectedOperandsOf({
      ids,
      partOf: (rootId) => parts[rootId] ?? null,
      currentIdOf: (rootId) => document.currentIdOf(rootId),
      nameOf: (rootId) => document.bodies().find((body) => body.id === rootId)?.name,
    }).map(operandFromSelection)
  }

  /**
   * @param {WarpDocument} document
   * @param {string} op
   * @param {Array<{ id: string, pieces?: string }>} operands
   * @param {Record<string, any>} [params]
   */
  function aiRecord(document, op, operands, params) {
    return buildOperateRecords(document, { op, operands, ...(params === undefined ? {} : { params }) }).records[0]
  }

  it('a boolean over a moved body and a drilled-in part', () => {
    const { document, group, plate } = groupAndPlate()
    move(document, plate)
    const twin = twinOf(document)
    const ui = booleanRecord(document, 'boolean.subtract', uiOperands(document, [plate, group], { [group]: 'Cube 1' }))
    const ai = aiRecord(twin, 'boolean.subtract', [{ id: plate }, { id: group, pieces: 'Cube 1' }])
    expect(ui).toEqual(ai)
  })

  it('a group over a moved body', () => {
    const { document, ids } = cubes(2)
    move(document, ids[1])
    const twin = twinOf(document)
    expect(groupRecord(document, uiOperands(document, ids))).toEqual(aiRecord(twin, 'group.assemble', ids.map((id) => ({ id }))))
  })

  it('a group over a recoloured body (the planner’s group.merge)', () => {
    const { document, ids } = cubes(2)
    document.setColorOverride(ids[1], { color: 0x00ff00 }, LOCAL)
    const twin = twinOf(document)
    expect(groupRecord(document, uiOperands(document, ids))).toEqual(aiRecord(twin, 'group.assemble', ids.map((id) => ({ id }))))
  })

  it('a group merge, from the popover’s plan and from the tool’s members', () => {
    const { document, group, plate } = groupAndPlate()
    const twin = twinOf(document)
    const operands = uiOperands(document, [group, plate]).map(({ id, terminal, name }) => ({ id, terminal, name }))
    const ui = groupMergeRecord(document, planGroupMerge(document, operands))
    expect(ui).toEqual(aiRecord(twin, 'group.merge', [{ id: group }, { id: plate }]))
  })

  it('each in-place edit on a moved body', () => {
    /** @type {Array<[string, Record<string, any>]>} */
    const cases = [
      ['modify.filletRim', { radius: 2, orientation: 'z+' }],
      ['modify.chamferRim', { radius: 1, orientation: 'z-' }],
      ['modify.enlarge', { deltaMm: [1, 2, 3] }],
      ['modify.fit', { sizeMm: [10, 0, 0], keepAspectRatio: false }],
      ['modify.bisect', { axis: 'x', offsetMm: 4 }],
    ]
    for (const [op, params] of cases) {
      const { document, ids } = cubes(1)
      move(document, ids[0])
      const twin = twinOf(document)
      const ui = inPlaceRecord(document, op, uiOperands(document, ids)[0], op === 'modify.bisect' ? bisectParams(/** @type {any} */ (params)) : params)
      expect(ui, op).toEqual(aiRecord(twin, op, [{ id: ids[0] }], params))
    }
  })

  it('a tilted bisect', () => {
    const { document, ids } = cubes(1)
    const twin = twinOf(document)
    const input = { axis: 'x', offsetMm: 4, angleDeg: 20, rotateAxis: 'z', rotateOffsetMm: 2 }
    const ui = inPlaceRecord(document, 'modify.bisect', uiOperands(document, ids)[0], bisectParams(input))
    expect(ui).toEqual(aiRecord(twin, 'modify.bisect', [{ id: ids[0] }], input))
  })

  it('a snap and an align with the moving body drilled in', () => {
    const { document, group, plate } = groupAndPlate()
    move(document, group)
    const twin = twinOf(document)
    const params = { axes: 'z', orientation: 'outside+', deltaMm: 1 }
    const ui = snapAlignRecord(document, 'group.snap', uiOperands(document, [group, plate], { [group]: 'Cube 2' }), params)
    expect(ui).toEqual(aiRecord(twin, 'group.snap', [{ id: group, pieces: 'Cube 2' }, { id: plate }], params))

    const alignUi = snapAlignRecord(document, 'group.align', uiOperands(document, [plate, group]), { axes: 'xy', deltaMm: 0 })
    expect(alignUi).toEqual(aiRecord(twin, 'group.align', [{ id: plate }, { id: group }], { axes: 'xy' }))
  })

  it('a mirror of a turned body', () => {
    const { document, ids } = cubes(1)
    document.append(rotateRecord(document, ids[0], [0, 45, 0]), LOCAL)
    const twin = twinOf(document)
    const ui = mirrorRecord(document, uiOperands(document, ids)[0], { axis: 'y', planeMm: 12 })
    expect(ui).toEqual(aiRecord(twin, 'transform.mirror', [{ id: ids[0] }], { axis: 'y', planeMm: 12 }))
  })
})
