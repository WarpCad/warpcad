// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { applyViewHides, operandsHaveParts, planGroupMerge } from './groupMerge.js'
import { boundsOf, hiddenNamesOf, sizeOf } from './kernel/group.js'
import { recordsForDrop } from './library.js'

const LOCAL = Object.freeze({ origin: 'local' })

/** @typedef {import('./document.js').WarpDocument} WarpDocument */

/**
 * A cube at a known place.
 *
 * @param {WarpDocument} document
 * @param {string} id
 * @param {string} name
 * @param {number} xMm
 */
function cube(document, id, name, xMm) {
  document.append({ id, op: 'primitive.cuboid', name, params: { size: [2, 2, 2], center: [xMm, 0, 0] } }, LOCAL)
}

/**
 * The owner's file, small: a board group with a hidden part (a Hide in the view, as `Pads` is),
 * and a clearances group whose whole body is recoloured, with one part overriding that.
 *
 * @returns {WarpDocument}
 */
function boardAndClearances() {
  const document = createDocument()
  cube(document, 'pcb', 'PCB', 0)
  cube(document, 'pads', 'Pads', 10)
  document.append(
    { id: 'board', op: 'group.assemble', name: 'Board', target: 'pcb', operands: ['pads'], consumes: ['pcb', 'pads'], params: { names: ['PCB', 'Pads'] } },
    LOCAL
  )
  document.setViewHidden('board', { subPart: 'Pads', hidden: true }, LOCAL)
  cube(document, 'screen', 'Screen', 20)
  cube(document, 'mic', 'Mic', 30)
  document.append(
    { id: 'clear', op: 'group.assemble', name: 'Clearances', target: 'screen', operands: ['mic'], consumes: ['screen', 'mic'], params: { names: ['Screen', 'Mic'] } },
    LOCAL
  )
  document.setColorOverride('clear', { color: 0xff0000 }, LOCAL)
  document.setColorOverride('clear', { color: 0x0000ff, colorAlpha: 0.5, subPart: 'Mic' }, LOCAL)
  return document
}

/**
 * What the toolbar resolves a selection to.
 *
 * @param {WarpDocument} document
 * @param {readonly string[]} ids
 */
function operandsOf(document, ids) {
  return ids.map((id) => {
    const body = /** @type {import('./document.js').Body} */ (document.bodies().find((candidate) => candidate.id === id))
    return { id, terminal: body.recordId, name: body.name }
  })
}

/**
 * Commit a plan the way a caller does.
 *
 * @param {WarpDocument} document
 * @param {ReturnType<typeof planGroupMerge>} plan
 * @returns {string} The new body's id.
 */
function commit(document, plan) {
  expect(plan.errors).toEqual([])
  const id = document.nextId('group')
  document.append(/** @type {any} */ ({ id, ...plan.record }), LOCAL)
  applyViewHides(document, id, plan.viewHides, LOCAL)
  return id
}

/** @param {WarpDocument} document @param {string} id */
const body = (document, id) => /** @type {import('./document.js').Body} */ (document.bodies().find((candidate) => candidate.id === id))
/** @param {WarpDocument} document @param {string} id */
const group = (document, id) => /** @type {import('./kernel/group.js').Group} */ (body(document, id).geometry)

/**
 * Place a built-in from the Library, as a drop does.
 *
 * @param {WarpDocument} document
 * @param {string} op
 * @param {number} xMm
 * @returns {string}
 */
function place(document, op, xMm) {
  const records = recordsForDrop(op, { x: xMm, y: 0 }, document)
  document.appendAll(records, LOCAL)
  return /** @type {string} */ (records[0].id)
}

describe('planGroupMerge — the owner’s file, small', () => {
  it('merges in selection order, under the first body’s name, prefixing and hiding the second', () => {
    const document = boardAndClearances()
    const plan = planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{}, { prefix: 'clearance-', hidden: true }])
    expect(plan.previewNames).toEqual(['PCB, +1 more', 'clearance-Screen, +1 more'])
    expect(plan.record).toMatchObject({
      op: 'group.merge',
      name: 'Board',
      target: 'board',
      operands: [body(document, 'clear').recordId],
      consumes: ['board', body(document, 'clear').recordId],
    })
    const id = commit(document, plan)
    const merged = group(document, id)
    expect(Object.keys(merged.parts)).toEqual(['PCB', 'Pads', 'clearance-Screen', 'clearance-Mic'])
    expect(merged.names).toEqual(['PCB', 'Pads'])
    expect(hiddenNamesOf(merged)).toEqual(['clearance-Screen', 'clearance-Mic'])
    expect(body(document, id).name).toBe('Board')
    // Hidden parts do not count, so the size is the board's own: PCB -1..1 to Pads 9..11.
    expect(sizeOf(merged)[0]).toBeCloseTo(12, 6)
    expect(document.bodies()).toHaveLength(1)
  })

  it('leaving Hide unticked makes the second group count', () => {
    const document = boardAndClearances()
    const id = commit(document, planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{}, { prefix: 'c-' }]))
    expect(sizeOf(group(document, id))[0]).toBeCloseTo(32, 6)
  })

  it('bakes a whole-body colour per part, and a part’s own override beats it', () => {
    const document = boardAndClearances()
    const plan = planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{}, { prefix: 'c-' }])
    expect(/** @type {any} */ (plan.record).params.members[1].colors).toEqual({
      Screen: { color: 0xff0000 },
      Mic: { color: 0x0000ff, colorAlpha: 0.5 },
    })
    const id = commit(document, plan)
    expect(group(document, id).colors).toEqual({
      'c-Screen': { color: 0xff0000, alpha: 1 },
      'c-Mic': { color: 0x0000ff, alpha: 0.5 },
    })
  })

  it('keeps a Hide in the view under the new body, and Undo brings each operand back as it was', () => {
    const document = boardAndClearances()
    const id = commit(document, planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{}, { prefix: 'c-' }]))
    expect(body(document, id).viewHiddenParts).toEqual(['Pads'])
    document.undo()
    expect(document.bodies().map((candidate) => candidate.name)).toEqual(['Board', 'Clearances'])
    expect(body(document, 'board').viewHiddenParts).toEqual(['Pads'])
    expect(body(document, 'clear').colorOverrides).toHaveLength(2)
    document.redo()
    expect(body(document, id).viewHiddenParts).toEqual(['Pads'])
  })

  it('a body hidden whole hides every part it adds', () => {
    const document = boardAndClearances()
    document.setViewHidden('clear', { hidden: true }, LOCAL)
    const plan = planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{}, { prefix: 'c-' }])
    expect(plan.viewHides).toEqual([
      { subPart: 'Pads', hidden: true },
      { subPart: 'c-Screen', hidden: true },
      { subPart: 'c-Mic', hidden: true },
    ])
  })

  it('takes a first-picked plain solid as a part of the group picked after it, in either order', () => {
    const document = boardAndClearances()
    cube(document, 'cube', 'Cube 1', 40)
    const plan = planGroupMerge(document, operandsOf(document, ['cube', 'board']))
    expect(plan.rows.map((row) => row.isTarget)).toEqual([false, true])
    expect(plan.record).toMatchObject({ name: 'Board', target: 'board', operands: ['cube'] })
    const id = commit(document, plan)
    expect(Object.keys(group(document, id).parts)).toEqual(['PCB', 'Pads', 'Cube 1'])
  })

  it('a merged group merges again, and a third group can join', () => {
    const document = boardAndClearances()
    const first = commit(document, planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{}, { prefix: 'c-', hidden: true }]))
    cube(document, 'a', 'A', 50)
    cube(document, 'b', 'B', 60)
    document.append({ id: 'third', op: 'group.assemble', name: 'Third', target: 'a', operands: ['b'], consumes: ['a', 'b'], params: { names: ['A', 'B'] } }, LOCAL)
    const id = commit(document, planGroupMerge(document, operandsOf(document, [first, 'third'])))
    const merged = group(document, id)
    expect(Object.keys(merged.parts)).toEqual(['PCB', 'Pads', 'c-Screen', 'c-Mic', 'A', 'B'])
    expect(hiddenNamesOf(merged)).toEqual(['c-Screen', 'c-Mic'])
    // Baked colours survive a second merge, and the view hide carried twice.
    expect(merged.colors['c-Mic']).toEqual({ color: 0x0000ff, alpha: 0.5 })
    expect(body(document, id).viewHiddenParts).toEqual(['Pads'])
  })

  it('merges a moved and rotated group with no part moving', () => {
    const document = boardAndClearances()
    document.append({ id: 'mv', op: 'transform.translate', target: 'board', supersedes: 'board', params: { vector: [0, 5, 0], rotation: [0, 0, 0] } }, LOCAL)
    const id = commit(document, planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{}, { prefix: 'c-' }]))
    const [min, max] = boundsOf(group(document, id).parts.PCB)
    expect([min[1], max[1]]).toEqual([4, 6])
  })
})

describe('planGroupMerge — collisions and refused prefixes', () => {
  /** @param {string} prefix */
  const collidingPlan = (prefix) => {
    const document = createDocument()
    cube(document, 'a', 'Mic', 0)
    cube(document, 'b', 'Other', 10)
    document.append({ id: 'g1', op: 'group.assemble', name: 'Group 1', target: 'a', operands: ['b'], consumes: ['a', 'b'], params: { names: ['c-Mic', 'Other'] } }, LOCAL)
    cube(document, 'c', 'Mic', 20)
    cube(document, 'd', 'Lens', 30)
    document.append({ id: 'g2', op: 'group.assemble', name: 'Group 2', target: 'c', operands: ['d'], consumes: ['c', 'd'], params: { names: ['Mic', 'Lens'] } }, LOCAL)
    return planGroupMerge(document, operandsOf(document, ['g1', 'g2']), [{}, { prefix }])
  }

  it('an edit that collides is an error that names the clash, and writes no record', () => {
    const plan = collidingPlan('c-')
    expect(plan.errors).toEqual(['c-Mic is already a part of Group 1. Change the prefix.'])
    expect(plan.record).toBeNull()
  })

  it.each([
    ['a,b', /comma/],
    [' a', /start with a space/],
    ['a\u0007', /control/],
    ['x'.repeat(80), /80 characters/],
  ])('reports the prefix %j in the same place', (prefix, message) => {
    const plan = collidingPlan(prefix)
    expect(plan.errors[0]).toMatch(message)
    expect(plan.record).toBeNull()
  })

  it('a trailing space is allowed, because the prefix is used exactly as typed', () => {
    const plan = collidingPlan('my ')
    expect(plan.errors).toEqual([])
    expect(plan.rows[1].previewNames).toEqual(['my Mic', 'my Lens'])
  })

  it('an absent prefix opens with a suggestion; clearing it to "" gets the collision back', () => {
    const document = createDocument()
    const one = place(document, 'hardware.bolt', 0)
    const two = place(document, 'hardware.bolt', 40)
    const operands = operandsOf(document, [one, two])
    const opened = planGroupMerge(document, operands)
    expect(opened.suggestedPrefixes).toEqual(['', 'Bolt / screw 2-'])
    expect(opened.rows[1].previewNames[0]).toBe('Bolt / screw 2-head')
    expect(opened.errors).toEqual([])
    const cleared = planGroupMerge(document, operands, [{}, { prefix: '' }])
    expect(cleared.errors[0]).toMatch(/already a part of Bolt \/ screw 1/)
  })

  it('a suggestion leaves out what a prefix may not contain', () => {
    const document = createDocument()
    const one = place(document, 'hardware.bolt', 0)
    const two = place(document, 'hardware.bolt', 40)
    document.renameBody(two, 'Bolt, spare', LOCAL)
    expect(planGroupMerge(document, operandsOf(document, [one, two])).suggestedPrefixes[1]).toBe('Bolt spare-')
  })
})

describe('planGroupMerge — keeping a body whole', () => {
  it('with nothing merging, nothing hidden and no colour, the record equals group.assemble’s', () => {
    const document = boardAndClearances()
    cube(document, 'plain', 'Plain', 40)
    const plan = planGroupMerge(document, operandsOf(document, ['board', 'plain']), [{ merge: false }, { merge: false }])
    const plain = body(document, 'plain').recordId
    expect(plan.record).toEqual({
      op: 'group.assemble',
      name: 'Group 1',
      target: 'board',
      operands: [plain],
      consumes: ['board', plain],
      params: { names: ['Board', 'Plain'] },
    })
    const id = commit(document, plan)
    expect(group(document, id).names).toEqual(['Board', 'Plain'])
  })

  describe('a colour to keep (TODO/core-077)', () => {
    it('a recoloured solid with nothing merging writes group.merge with its colour under its name', () => {
      const document = boardAndClearances()
      cube(document, 'red', 'Red', 40)
      cube(document, 'plain', 'Plain', 50)
      document.setColorOverride('red', { color: 0xff0000 }, LOCAL)
      const plan = planGroupMerge(document, operandsOf(document, ['red', 'plain']))
      expect(plan.record).toMatchObject({
        op: 'group.merge',
        params: { members: [{ name: 'Red', colors: { Red: { color: 0xff0000 } } }, { name: 'Plain' }] },
      })
      const id = commit(document, plan)
      expect(group(document, id).colors.Red).toEqual({ color: 0xff0000, alpha: 1 })
      expect(group(document, id).colors.Plain).toBeUndefined()
    })

    it('a whole-body colour on a body kept whole does the same', () => {
      const document = boardAndClearances()
      cube(document, 'plain', 'Plain', 40)
      const plan = planGroupMerge(document, operandsOf(document, ['plain', 'clear']), [{}, { merge: false }])
      expect(plan.record).toMatchObject({ op: 'group.merge' })
      const id = commit(document, plan)
      expect(group(document, id).colors.Clearances).toEqual({ color: 0xff0000, alpha: 1 })
    })

    it('alpha survives', () => {
      const document = boardAndClearances()
      cube(document, 'ghost', 'Ghost', 40)
      cube(document, 'plain', 'Plain', 50)
      document.setColorOverride('ghost', { color: 0x00ff00, colorAlpha: 0.25 }, LOCAL)
      const id = commit(document, planGroupMerge(document, operandsOf(document, ['ghost', 'plain'])))
      expect(group(document, id).colors.Ghost).toEqual({ color: 0x00ff00, alpha: 0.25 })
    })

    it('a colour reset before grouping bakes nothing, and writes group.assemble', () => {
      const document = boardAndClearances()
      cube(document, 'red', 'Red', 40)
      cube(document, 'plain', 'Plain', 50)
      document.setColorOverride('red', { color: 0xff0000 }, LOCAL)
      document.clearColorOverride('red', {}, LOCAL)
      expect(planGroupMerge(document, operandsOf(document, ['red', 'plain'])).record).toMatchObject({ op: 'group.assemble' })
    })
  })

  it('a Hide tick on an unticked row still writes the hide, as a group.merge of name members', () => {
    const document = boardAndClearances()
    const plan = planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{ merge: false }, { merge: false, hidden: true }])
    expect(plan.record).toMatchObject({ op: 'group.merge', name: 'Group 1' })
    const id = commit(document, plan)
    expect(group(document, id).names).toEqual(['Board'])
    expect(hiddenNamesOf(group(document, id))).toEqual(['Clearances'])
  })

  it('unticking the first row makes the next merging row the target', () => {
    const document = boardAndClearances()
    const plan = planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{ merge: false }, {}])
    expect(plan.rows.map((row) => row.isTarget)).toEqual([false, true])
    expect(plan.record).toMatchObject({ name: 'Clearances' })
    const id = commit(document, plan)
    expect(Object.keys(group(document, id).parts)).toEqual(['Screen', 'Mic', 'Board'])
  })

  it('a prefix left over on the row that became the target is ignored', () => {
    const document = boardAndClearances()
    const plan = planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{ merge: false }, { prefix: 'stale-', hidden: true }])
    expect(plan.rows[1]).toMatchObject({ isTarget: true, prefix: '', hidden: false })
  })

  it('refuses hiding everything', () => {
    const document = boardAndClearances()
    const plan = planGroupMerge(document, operandsOf(document, ['board', 'clear']), [{ merge: false, hidden: true }, { merge: false, hidden: true }])
    expect(plan.errors).toEqual(['Every part would be hidden. Leave at least one visible.'])
    expect(plan.record).toBeNull()
  })

  it('a whole-body colour on a kept-whole body or a solid stays on that part', () => {
    const document = boardAndClearances()
    cube(document, 'cube', 'Cube 1', 40)
    document.setColorOverride('cube', { color: 0x00ff00 }, LOCAL)
    const id = commit(document, planGroupMerge(document, operandsOf(document, ['board', 'cube'])))
    expect(group(document, id).colors['Cube 1']).toEqual({ color: 0x00ff00, alpha: 1 })
  })

  it('two bodies with the same name kept whole collide, and it says so', () => {
    const document = boardAndClearances()
    cube(document, 'a', 'Same', 40)
    cube(document, 'b', 'Same', 50)
    const plan = planGroupMerge(document, operandsOf(document, ['board', 'a', 'b']))
    expect(plan.errors).toEqual(['Same is already a part of Same.'])
  })
})

describe('operandsHaveParts: whether Group needs to ask', () => {
  it('stays one click for plain solids, and asks for anything with parts', () => {
    const document = boardAndClearances()
    cube(document, 'x', 'X', 40)
    cube(document, 'y', 'Y', 50)
    expect(operandsHaveParts(document, operandsOf(document, ['x', 'y']))).toBe(false)
    expect(operandsHaveParts(document, operandsOf(document, ['x', 'board']))).toBe(true)
  })
})

describe('planGroupMerge — real built-ins', () => {
  /** @param {string} opA @param {string} opB */
  const pair = (opA, opB) => {
    const document = createDocument()
    const a = place(document, opA, 0)
    const b = place(document, opB, 200)
    return { document, a, b, operands: operandsOf(document, [a, b]) }
  }

  it('Pi + Camera suggests a prefix for the Camera row and commits with 52 parts', () => {
    const { document, b, operands } = pair('raspberrypi.bplus', 'raspberrypi.cameraModule')
    const plan = planGroupMerge(document, operands)
    expect(plan.suggestedPrefixes).toEqual(['', `${body(document, b).name}-`])
    const id = commit(document, plan)
    expect(Object.keys(group(document, id).parts)).toHaveLength(52)
    expect(body(document, id).name).toBe('Raspberry Pi 1')
  })

  it('Pi + Pi gives 66, and two bolts give 12', () => {
    const pis = pair('raspberrypi.bplus', 'raspberrypi.bplus')
    expect(Object.keys(group(pis.document, commit(pis.document, planGroupMerge(pis.document, pis.operands))).parts)).toHaveLength(66)
    const bolts = pair('hardware.bolt', 'hardware.bolt')
    expect(Object.keys(group(bolts.document, commit(bolts.document, planGroupMerge(bolts.document, bolts.operands))).parts)).toHaveLength(12)
  })

  it('Pi + Cube is named after the Pi in both pick orders, keeps its 33 parts and adds the Cube', () => {
    for (const cubeFirst of [false, true]) {
      const document = createDocument()
      const pi = place(document, 'raspberrypi.bplus', 0)
      cube(document, 'cube', 'Cube 1', 200)
      const id = commit(document, planGroupMerge(document, operandsOf(document, cubeFirst ? ['cube', pi] : [pi, 'cube'])))
      const merged = group(document, id)
      expect(body(document, id).name).toBe('Raspberry Pi 1')
      expect(Object.keys(merged.parts)).toHaveLength(34)
      expect(Object.keys(merged.parts)).toContain('Cube 1')
      // Its hidden holes stay hidden.
      for (const hole of ['hole1', 'hole2', 'hole3', 'hole4']) expect(hiddenNamesOf(merged)).toContain(hole)
    }
  })

  it('a Hide tick on a Cube joining a Pi makes it a hidden part, the way a bolt’s tap is', () => {
    const document = createDocument()
    const pi = place(document, 'raspberrypi.bplus', 0)
    cube(document, 'cube', 'Cube 1', 200)
    const before = sizeOf(body(document, pi).geometry)
    const id = commit(document, planGroupMerge(document, operandsOf(document, [pi, 'cube']), [{}, { hidden: true }]))
    expect(hiddenNamesOf(group(document, id))).toContain('Cube 1')
    expect(sizeOf(group(document, id))).toEqual(before)
  })

  it('a model change under a merge that now collides is refused by name and overwrites nothing (scenario 15)', () => {
    const document = createDocument()
    // A Pi 5 has no `avjack`, so a kept-whole Cube can take the name, until the Pi becomes a 4.
    document.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 5 } }, LOCAL)
    cube(document, 'cube', 'avjack', 200)
    const id = commit(document, planGroupMerge(document, operandsOf(document, ['pi', 'cube'])))
    const parts = Object.keys(group(document, id).parts)
    expect(() =>
      document.replaceRecord('pi', { id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } }, LOCAL)
    ).toThrow(/group\.merge: member 2.*"avjack"/)
    expect(Object.keys(group(document, id).parts)).toEqual(parts)
  })
})
