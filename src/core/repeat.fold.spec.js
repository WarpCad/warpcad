// SPDX-License-Identifier: AGPL-3.0-or-later
import modeling from '@jscad/modeling'
import { describe, expect, it } from 'vitest'

import { LOCAL, partBoundsOf, piBoltOnHole1, piBoltRepeated } from './__fixtures__/piScenes.js'
import { tallyBom } from './bom.js'
import { impactOf } from './dependents.js'
import { createDocument } from './document.js'
import { add, boundsOf, createGroup } from './kernel/group.js'
import { registry as realRegistry } from './kernel/registry.js'
import { compositeParamEditRecord, paramEditability, stepParamEditRecord } from './paramEdit.js'
import { parseProject, serializeProject } from './project.js'
import { offeredFixesOf, repairChanges } from './repair.js'
import { REPEAT_OP, detachRepeat, removeRepeatMember, repeatMoveRefusal } from './repeat.js'
import { buildNameIndex, describeRow } from './timelineLabel.js'
import { translateRecord } from './transform.js'

/**
 * `TODO/core-061`: a linked `pattern.repeat` row, folded against a real Pi 5, a real
 * Touchscreen 2 and a real M2.5 bolt — the user's own scene. Millimetres, Z up.
 */

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {import('./document.js').WarpDocument} WarpDocument */

const MERGE = Object.freeze({ origin: 'merge' })

/**
 * @param {[Vec3, Vec3]} bounds
 * @returns {Vec3}
 */
function centre([min, max]) {
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/** @param {WarpDocument} document @param {string} id */
function bodyOf(document, id) {
  const body = document.bodies().find((candidate) => candidate.id === id)
  if (!body) throw new Error(`no body ${id}`)
  return body
}

/** One member of the repeat body, by its target name. */
function memberBounds(/** @type {WarpDocument} */ document, /** @type {string} */ target, id = 'rep-1') {
  const part = /** @type {any} */ (bodyOf(document, id).geometry).parts?.[target]
  if (!part) throw new Error(`no member ${target}`)
  return /** @type {[Vec3, Vec3]} */ (boundsOf(part))
}

/** Bolt 1's own bounds. */
const boltBounds = (/** @type {WarpDocument} */ document) => /** @type {[Vec3, Vec3]} */ (boundsOf(bodyOf(document, 'bolt-1').geometry))

/** @param {WarpDocument} document @param {string} target */
function expectOnItsHole(document, target, id = 'rep-1') {
  const [x, y] = centre(memberBounds(document, target, id))
  const [hx, hy] = centre(partBoundsOf(document, 'pi-1', target))
  expect(x).toBeCloseTo(hx, 6)
  expect(y).toBeCloseTo(hy, 6)
}

/** @param {WarpDocument} document @param {string} target */
function expectBoltsZ(document, target) {
  const [min, max] = memberBounds(document, target)
  const [boltMin, boltMax] = boltBounds(document)
  expect(min[2]).toBeCloseTo(boltMin[2], 6)
  expect(max[2]).toBeCloseTo(boltMax[2], 6)
}

const TARGETS = ['hole2', 'hole3', 'hole4']

describe('the user’s scenario, with numbers', () => {
  it('Bolt 1 sits on hole1; one repeat row puts the same bolt on hole2, hole3 and hole4', () => {
    const document = piBoltRepeated()
    // Bolt 1 itself, for the record: centred on hole1, 5 mm into mb.
    const [bx, by] = centre(boltBounds(document))
    const [hx, hy] = centre(partBoundsOf(document, 'pi-1', 'hole1'))
    expect(bx).toBeCloseTo(hx, 6)
    expect(by).toBeCloseTo(hy, 6)

    for (const target of TARGETS) {
      expectOnItsHole(document, target)
      expectBoltsZ(document, target)
    }
  })

  it('is one body and one History row, named after its source, with every member addressable', () => {
    const before = piBoltOnHole1()
    const document = piBoltRepeated()
    expect(document.bodies()).toHaveLength(before.bodies().length + 1)
    expect(document.entries).toHaveLength(before.entries.length + 1)

    const body = bodyOf(document, 'rep-1')
    expect(body.op).toBe(REPEAT_OP)
    expect(body.name).toBe('Bolt 1 ×3')
    expect(/** @type {any} */ (body.geometry).names).toEqual(TARGETS)
    // A bolt's own parts ride along, hidden, so a nut can find `hole3.thread` or a case `hole3.tap`.
    expect(Object.keys(/** @type {any} */ (body.geometry).parts)).toEqual(expect.arrayContaining(['hole3.head', 'hole3.thread', 'hole3.tap']))
    expect(body.repeat).toMatchObject({
      source: 'bolt-1',
      sourceName: 'Bolt 1',
      seed: { id: 'pi-1', pieces: 'hole1' },
      targets: TARGETS,
      members: TARGETS,
      broken: [],
      inactive: [],
    })
  })

  it('reads `Repeat → hole2, hole3, hole4` in History and on the Undo button', () => {
    const document = piBoltRepeated()
    const row = document.timeline().find((candidate) => candidate.id === 'rep-1')
    expect(row?.label).toBe('Repeat → hole2, hole3, hole4')
    const names = buildNameIndex(document.entries.map((entry) => entry.record))
    expect(describeRow(document.recordOf('rep-1'), names)).toBe('Repeat → hole2, hole3, hole4')
    expect(document.pendingUndo()?.label).toBe('Repeat → hole2, hole3, hole4')
  })

  it('a refused repeat appends nothing', () => {
    const document = piBoltOnHole1()
    const length = document.entries.length
    expect(() =>
      document.append(
        { id: 'rep-x', op: REPEAT_OP, params: { source: 'bolt-1', seed: { id: 'pi-1', pieces: 'hole2' }, targets: ['hole3'] } },
        LOCAL
      )
    ).toThrow("Nothing in Bolt 1's steps refers to hole2, so every repeat would land on Bolt 1")
    expect(document.entries).toHaveLength(length)
  })
})

describe('linked: an edit to Bolt 1’s steps reaches every member', () => {
  it('a length change through the replace path changes every member’s Z extent with Bolt 1’s', () => {
    const document = piBoltRepeated()
    // The Snap pins the bolt's bottom to mb, so a longer bolt grows upward: the max moves.
    const [, before] = memberBounds(document, 'hole3')
    const record = compositeParamEditRecord(document, 'bolt-1', { length: 16 })
    document.reviseRecords([{ id: 'bolt-1', record: /** @type {any} */ (record) }], LOCAL)
    for (const target of TARGETS) expectBoltsZ(document, target)
    const [boltMin, boltMax] = boltBounds(document)
    expect(boltMax[2] - boltMin[2]).toBeGreaterThan(14)
    expect(memberBounds(document, 'hole3')[1][2]).toBeCloseTo(before[2] + 6, 6)
  })

  it('editing the Align’s offset moves every member by the same amount', () => {
    const document = piBoltRepeated()
    const record = stepParamEditRecord(document, 'bolt-align', { deltaMm: 2 })
    document.replaceRecord('bolt-align', /** @type {any} */ (record), LOCAL)
    for (const target of ['hole1', ...TARGETS]) {
      const [x, y] = target === 'hole1' ? centre(boltBounds(document)) : centre(memberBounds(document, target))
      const [hx, hy] = centre(partBoundsOf(document, 'pi-1', target))
      expect(x).toBeCloseTo(hx + 2, 6)
      expect(y).toBeCloseTo(hy + 2, 6)
    }
  })

  it('moving the screen (so the Pi moves with it) carries every member along', () => {
    const document = piBoltRepeated()
    const move = /** @type {any} */ (document.recordOf('screen-1-move'))
    document.replaceRecord('screen-1-move', { ...move, params: { ...move.params, vector: [70, 10, 3] } }, LOCAL)
    for (const target of TARGETS) {
      expectOnItsHole(document, target)
      expectBoltsZ(document, target)
    }
  })

  it('not linked: a move of Bolt 1 appended after the Repeat row moves Bolt 1 alone', () => {
    const document = piBoltRepeated()
    const before = memberBounds(document, 'hole2')
    document.append(translateRecord(document, 'bolt-1', [10, 0, 0]), LOCAL)
    expect(memberBounds(document, 'hole2')).toEqual(before)
    const [bx] = centre(boltBounds(document))
    const [hx] = centre(partBoundsOf(document, 'pi-1', 'hole1'))
    expect(bx).toBeCloseTo(hx + 10, 6)
  })
})

describe('members are derived (decision 6)', () => {
  it('a move of the repeat body is refused with the reason, and the Inspector cannot edit its params', () => {
    const document = piBoltRepeated()
    expect(repeatMoveRefusal(document, 'rep-1')).toBe('Move Bolt 1 or Raspberry Pi 1; the repeats follow them')
    expect(repeatMoveRefusal(document, 'bolt-1')).toBeNull()
    const length = document.entries.length
    expect(() => document.append(translateRecord(document, 'rep-1', [5, 0, 0]), LOCAL)).toThrow(
      'Move Bolt 1 or Raspberry Pi 1; the repeats follow them'
    )
    expect(document.entries).toHaveLength(length)
    expect(paramEditability(document.lineageOf('rep-1'))).toEqual({ editable: false, blockedBy: REPEAT_OP })
  })

  it('a rename and a recolour of the whole repeat body are allowed', () => {
    const document = piBoltRepeated()
    document.renameBody('rep-1', 'Corner bolts', LOCAL)
    document.setColorOverride('rep-1', { color: 0x00ff00 }, LOCAL)
    const body = bodyOf(document, 'rep-1')
    expect(body.name).toBe('Corner bolts')
    expect(body.colorOverrides).toEqual([{ color: 0x00ff00 }])
  })

  it('colour follows the source: Bolt 1’s whole-body colour is the repeat’s until the repeat sets its own', () => {
    const document = piBoltRepeated()
    document.setColorOverride('bolt-1', { color: 0xff0000 }, LOCAL)
    expect(bodyOf(document, 'rep-1').colorOverrides).toEqual([{ color: 0xff0000 }])
    document.setColorOverride('rep-1', { color: 0x0000ff }, LOCAL)
    expect(bodyOf(document, 'rep-1').colorOverrides).toEqual([{ color: 0x0000ff }])
  })
})

describe('removing one member, and detaching (decision 7)', () => {
  it('removing hole3 is one replace of the repeat row and one Undo step', () => {
    const document = piBoltRepeated()
    const length = document.entries.length
    removeRepeatMember(document, 'rep-1', 'hole3', LOCAL)
    expect(document.entries).toHaveLength(length)
    expect(document.recordOf('rep-1')?.params?.targets).toEqual(['hole2', 'hole4'])
    expect(/** @type {any} */ (bodyOf(document, 'rep-1').geometry).names).toEqual(['hole2', 'hole4'])
    expect(bodyOf(document, 'rep-1').name).toBe('Bolt 1 ×2')
    document.undo()
    expect(document.recordOf('rep-1')?.params?.targets).toEqual(TARGETS)
  })

  it('the Delete key on a drilled-in member takes the same path (document.removePart)', () => {
    const document = piBoltRepeated()
    document.removePart('rep-1', 'hole3', LOCAL)
    expect(document.recordOf('rep-1')?.params?.targets).toEqual(['hole2', 'hole4'])
  })

  it('removing the last target deletes the repeat body', () => {
    const document = piBoltRepeated({ targets: ['hole2'] })
    removeRepeatMember(document, 'rep-1', 'hole2', LOCAL)
    expect(document.bodies().some((body) => body.id === 'rep-1')).toBe(false)
    document.undo()
    expect(document.bodies().some((body) => body.id === 'rep-1')).toBe(true)
  })

  it('Detach writes one independent lineage per member, exactly where the members were, in one step', () => {
    const document = piBoltRepeated()
    const expected = TARGETS.map((target) => memberBounds(document, target))
    const created = detachRepeat(document, 'rep-1', LOCAL)
    expect(created).toHaveLength(3)
    expect(document.bodies().some((body) => body.id === 'rep-1')).toBe(false)
    created.forEach((id, index) => {
      const body = bodyOf(document, id)
      expect(body.op).toBe('hardware.bolt')
      const [min, max] = /** @type {[Vec3, Vec3]} */ (boundsOf(body.geometry))
      for (let axis = 0; axis < 3; axis += 1) {
        expect(min[axis]).toBeCloseTo(expected[index][0][axis], 6)
        expect(max[axis]).toBeCloseTo(expected[index][1][axis], 6)
      }
      // Independent: nothing in its lineage is Bolt 1's.
      expect(document.lineageOf(id).some((record) => document.rootOf(/** @type {string} */ (record.id)) === 'bolt-1')).toBe(false)
    })
    expect(created.map((id) => bodyOf(document, id).name)).toEqual(['Bolt 2', 'Bolt 3', 'Bolt 4'])
    // Editing Bolt 1 now moves Bolt 1 only.
    const record = compositeParamEditRecord(document, 'bolt-1', { length: 16 })
    document.reviseRecords([{ id: 'bolt-1', record: /** @type {any} */ (record) }], LOCAL)
    expect(boundsOf(bodyOf(document, created[0]).geometry)[1][2]).toBeCloseTo(expected[0][1][2], 6)
    document.undo()
    document.undo()
    expect(bodyOf(document, 'rep-1').repeat?.members).toEqual(TARGETS)
    expect(created.some((id) => document.bodies().some((body) => body.id === id))).toBe(false)
  })
})

describe('the BOM counts members as copies of the source (decision 9)', () => {
  it('Bolt 1 plus Bolt 1 ×3 is one row of four M2.5 bolts', () => {
    const rows = tallyBom(piBoltRepeated().bodies())
    const bolts = rows.filter((row) => row.op === 'hardware.bolt')
    expect(bolts).toEqual([expect.objectContaining({ detail: 'M2.5 socket × 10 mm', count: 4 })])
  })
})

/**
 * A camera module (HQ: holes `hole1`–`hole4`) with a cube aligned to `hole1` and repeated to
 * the other three. The classic v2 board numbers its holes `hole0`–`hole3`, so changing the
 * model loses exactly `hole4` — the "part went away" case for one member. (No Raspberry Pi
 * board model lacks a hole, so the camera stands in for the spec's Pi.)
 */
function cameraScene() {
  const document = createDocument()
  document.append({ id: 'cam-1', op: 'raspberrypi.cameraModule', name: 'Camera 1', params: { model: 'hq' } }, LOCAL)
  document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [2, 2, 2], center: [50, 0, 0] } }, LOCAL)
  document.append(
    { id: 'cube-align', op: 'group.align', target: 'cube-1', supersedes: 'cube-1', operands: [{ id: 'cam-1', pieces: 'hole1' }], params: { axes: 'xy', deltaMm: 0 } },
    LOCAL
  )
  document.append(
    { id: 'rep-1', op: REPEAT_OP, params: { source: 'cube-1', seed: { id: 'cam-1', pieces: 'hole1' }, targets: ['hole2', 'hole3', 'hole4'] } },
    LOCAL
  )
  return document
}

/** @param {WarpDocument} document */
const toV2 = (document) => ({ id: 'cam-1', record: { .../** @type {any} */ (document.recordOf('cam-1')), params: { model: 'v2' } } })

describe('dependents and repair (decision 8)', () => {
  const edit = /** @type {import('./repair.js').RepairEdit} */ ({ rootId: 'cam-1', record: null, param: 'model', oldValue: 'hq' })

  it('a model without hole4 reports one broken member; the others are unaffected', () => {
    const document = cameraScene()
    const { breakages, preview } = impactOf(document, [toV2(document)], { editedRootId: 'cam-1' })
    expect(breakages).toHaveLength(1)
    expect(breakages[0]).toMatchObject({
      dependentRecordId: 'rep-1',
      dependentBodyId: 'rep-1',
      key: 'rep-1#hole4',
      member: 'hole4',
      relationship: 'Repeat → hole4',
      missingPieces: ['hole4'],
      placement: false,
    })
    expect(breakages[0].newParts).toEqual(expect.arrayContaining(['hole0', 'hole1', 'hole2', 'hole3']))
    expect(offeredFixesOf(breakages[0], { enumParam: true })).toEqual(['condition', 'remap', 'removeTarget', 'leave'])
    // In the tolerant preview the two good members are still built.
    expect(bodyOf(preview, 'rep-1').repeat).toMatchObject({ members: ['hole2', 'hole3'], broken: [{ target: 'hole4' }] })
  })

  /**
   * @param {import('./repair.js').Fix} fix
   */
  function repaired(fix) {
    const document = cameraScene()
    const change = toV2(document)
    const { breakages } = impactOf(document, [change], { editedRootId: 'cam-1' })
    const changes = repairChanges(document, { ...edit, record: change.record }, breakages, { 'rep-1#hole4': fix })
    document.reviseRecords(changes, LOCAL)
    return document
  }

  it('Remap points the member at another part', () => {
    const document = repaired({ kind: 'remap', pieces: { hole4: 'hole0' } })
    expect(document.recordOf('rep-1')?.params?.targets).toEqual(['hole2', 'hole3', 'hole0'])
    expect(bodyOf(document, 'rep-1').repeat?.members).toEqual(['hole2', 'hole3', 'hole0'])
  })

  it('Remove this repeat drops the target', () => {
    const document = repaired({ kind: 'removeTarget' })
    expect(document.recordOf('rep-1')?.params?.targets).toEqual(['hole2', 'hole3'])
  })

  it('Only when… keeps the member for the old model; on v2 it is off, not broken, and not counted', () => {
    const document = repaired({ kind: 'condition', scope: 'operation' })
    expect(document.recordOf('rep-1')?.params?.when).toEqual({ hole4: { ref: 'cam-1', param: 'model', in: ['hq'] } })
    expect(bodyOf(document, 'rep-1').repeat).toMatchObject({ members: ['hole2', 'hole3'], broken: [], inactive: ['hole4'] })
    expect(document.brokenSteps()).toEqual([])
  })

  it('Leave broken keeps the row, draws the two good members and says which one is broken', () => {
    const document = repaired({ kind: 'leave' })
    const body = bodyOf(document, 'rep-1')
    expect(/** @type {any} */ (body.geometry).names).toEqual(['hole2', 'hole3'])
    expect(body.repeat?.broken).toEqual([{ target: 'hole4', reason: expect.stringMatching(/hole4/) }])
    expect(document.brokenSteps().map((step) => step.id)).toEqual(['rep-1'])
  })

  it('deleting the source breaks the repeat as a whole: refused unless the repeat is left broken', () => {
    const document = piBoltRepeated()
    const length = document.entries.length
    expect(() => document.deleteBodies(['bolt-1'], LOCAL)).toThrow(/Bolt 1 has been deleted/)
    expect(document.entries).toHaveLength(length)

    document.reviseRecords([{ id: 'rep-1', leftBroken: true }], LOCAL)
    document.deleteBodies(['bolt-1'], LOCAL)
    expect(document.bodies().some((body) => body.id === 'rep-1')).toBe(false)
    expect(document.brokenSteps().find((step) => step.id === 'rep-1')?.reason).toMatch(/Bolt 1 has been deleted/)

    // Deleting both together is fine: the repeats go with their source.
    const both = piBoltRepeated()
    both.deleteBodies(['bolt-1', 'rep-1'], LOCAL)
    expect(both.bodies().some((body) => body.id === 'rep-1' || body.id === 'bolt-1')).toBe(false)
  })

  it('a broken member is not counted in the BOM', () => {
    const document = piBoltRepeated()
    // Leave hole3 broken by hand: a target the Pi does not have, on a left-broken row.
    const record = /** @type {any} */ (document.recordOf('rep-1'))
    document.reviseRecords([{ id: 'rep-1', record: { ...record, params: { ...record.params, targets: ['hole2', 'hole9', 'hole4'] } }, leftBroken: true }], LOCAL)
    expect(tallyBom(document.bodies()).find((row) => row.op === 'hardware.bolt')?.count).toBe(3)
  })
})

describe('save, reload, merge (decision 10)', () => {
  it('round-trips byte for byte, members where they were', () => {
    const original = piBoltRepeated()
    const text = serializeProject(original)
    expect(text).toContain('"op":"pattern.repeat","params":{"source":"bolt-1","seed":{"id":"pi-1","pieces":"hole1"},"targets":["hole2","hole3","hole4"]}')
    const restored = createDocument()
    const { entries, rollbackAt, merge } = parseProject(text)
    restored.loadEntries(entries, rollbackAt, undefined, { merge })
    expect(serializeProject(restored)).toBe(text)
    for (const target of TARGETS) expect(memberBounds(restored, target)).toEqual(memberBounds(original, target))
  })

  it('two replicas each removing a different target converge on one answer, both ways', () => {
    const base = piBoltRepeated().entries.map((entry) => structuredClone(entry.record))
    /** @param {string} replica */
    const replicaOf = (replica) => createDocument({ replica, actions: structuredClone(base) })

    const run = (/** @type {boolean} */ humanFirst) => {
      const human = replicaOf('hhhhhh')
      const other = replicaOf('oooooo')
      removeRepeatMember(human, 'rep-1', 'hole2', LOCAL)
      removeRepeatMember(other, 'rep-1', 'hole4', { origin: 'mcp' })
      if (humanFirst) {
        human.mergeFrom(other.mergeState(), MERGE)
        return human
      }
      other.mergeFrom(human.mergeState(), MERGE)
      return other
    }
    const a = run(true)
    const b = run(false)
    expect(serializeProject(a)).toBe(serializeProject(b))
    const targets = /** @type {string[]} */ (a.recordOf('rep-1')?.params?.targets)
    expect([['hole3', 'hole4'], ['hole2', 'hole3']]).toContainEqual(targets)
    expect(bodyOf(a, 'rep-1').repeat?.members).toEqual(targets)
  })
})

describe('degenerate cases', () => {
  it('a bare primitive source (no parts of its own)', () => {
    const document = piBoltOnHole1()
    const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [3, 3, 3], center: [0, 0, 0] } }, LOCAL)
    document.append(
      { id: 'cube-align', op: 'group.align', target: 'cube-1', supersedes: 'cube-1', operands: [{ id: pi, pieces: 'hole1' }], params: { axes: 'xy', deltaMm: 0 } },
      LOCAL
    )
    document.append({ id: 'rep-c', op: REPEAT_OP, params: { source: 'cube-1', seed: { id: 'pi-1', pieces: 'hole1' }, targets: TARGETS } }, LOCAL)
    for (const target of TARGETS) expectOnItsHole(document, target, 'rep-c')
    expect(/** @type {any} */ (bodyOf(document, 'rep-c').geometry).names).toEqual(TARGETS)
  })

  it('a seed part that is itself a repeat member: a cube repeated across the repeated bolts', () => {
    const document = piBoltRepeated()
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [1, 1, 1], center: [0, 0, 0] } }, LOCAL)
    document.append(
      { id: 'cube-align', op: 'group.align', target: 'cube-1', supersedes: 'cube-1', operands: [{ id: 'rep-1', pieces: 'hole2' }], params: { axes: 'xy', deltaMm: 0 } },
      LOCAL
    )
    document.append({ id: 'rep-c', op: REPEAT_OP, params: { source: 'cube-1', seed: { id: 'rep-1', pieces: 'hole2' }, targets: ['hole3', 'hole4'] } }, LOCAL)
    for (const target of ['hole3', 'hole4']) {
      const [x, y] = centre(memberBounds(document, target, 'rep-c'))
      const [bx, by] = centre(memberBounds(document, target))
      expect(x).toBeCloseTo(bx, 6)
      expect(y).toBeCloseTo(by, 6)
    }
  })

  it('a source whose lineage includes a Fillet', () => {
    const document = piBoltOnHole1()
    const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [6, 6, 6], center: [0, 0, 0] } }, LOCAL)
    document.append({ id: 'cube-fillet', op: 'modify.filletRim', target: 'cube-1', supersedes: 'cube-1', params: { radius: 1, orientation: 'z+' } }, LOCAL)
    document.append(
      { id: 'cube-align', op: 'group.align', target: 'cube-fillet', supersedes: 'cube-fillet', operands: [{ id: pi, pieces: 'hole1' }], params: { axes: 'xy', deltaMm: 0 } },
      LOCAL
    )
    document.append({ id: 'rep-c', op: REPEAT_OP, params: { source: 'cube-1', seed: { id: 'pi-1', pieces: 'hole1' }, targets: TARGETS } }, LOCAL)
    for (const target of TARGETS) expectOnItsHole(document, target, 'rep-c')
  })

  it('targets at the limit (64) fold; 65 are refused', () => {
    // A test-only op: one comb of 70 tiny cubes in a row, so 64 real targets exist.
    const comb = () => {
      let group = createGroup('comb')
      for (let index = 0; index < 70; index += 1) {
        group = add(group, modeling.primitives.cuboid({ size: [1, 1, 1], center: [index * 3, 0, 0] }), `p${index}`)
      }
      return group
    }
    const registry = Object.freeze({ ...realRegistry, 'test.comb': Object.freeze({ kind: 'native', operandCount: 0, build: comb }) })
    const document = createDocument({ registry: /** @type {any} */ (registry) })
    document.append({ id: 'comb-1', op: 'test.comb', name: 'Comb 1', params: {} }, LOCAL)
    document.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [1, 1, 1], center: [0, 9, 0] } }, LOCAL)
    document.append(
      { id: 'cube-align', op: 'group.align', target: 'cube-1', supersedes: 'cube-1', operands: [{ id: 'comb-1', pieces: 'p0' }], params: { axes: 'x', deltaMm: 0 } },
      LOCAL
    )
    const targets = Array.from({ length: 64 }, (_, index) => `p${index + 1}`)
    document.append({ id: 'rep-c', op: REPEAT_OP, params: { source: 'cube-1', seed: { id: 'comb-1', pieces: 'p0' }, targets } }, LOCAL)
    expect(bodyOf(document, 'rep-c').repeat?.members).toHaveLength(64)
    const [x] = centre(memberBounds(document, 'p64', 'rep-c'))
    expect(x).toBeCloseTo(64 * 3, 6)
    expect(() =>
      document.append({ id: 'rep-d', op: REPEAT_OP, params: { source: 'cube-1', seed: { id: 'comb-1', pieces: 'p0' }, targets: [...targets, 'p65'] } }, LOCAL)
    ).toThrow('A repeat has at most 64 targets; this one has 65')
  })
})
