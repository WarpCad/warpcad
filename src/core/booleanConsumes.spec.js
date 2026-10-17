// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LOCAL, partBoundsOf, piWith } from './__fixtures__/piScenes.js'
import { consumesOf, keepsToolBody } from './booleanConsumes.js'
import { tallyBom } from './bom.js'
import { impactOf } from './dependents.js'
import { createDocument } from './document.js'
import { boundsOf, volumeOf } from './kernel/group.js'
import { drillPartsOf } from './kernel/registry.js'
import { offeredFixesOf } from './repair.js'
import { repeatRefusal } from './repeat.js'

/**
 * `TODO/core-064`: a Subtract that cuts with a Raspberry Pi's mounting hole leaves the Pi in
 * the scene, so one Pi can drill all four holes. Every other boolean operand is still consumed.
 */

/** @typedef {import('./document.js').WarpDocument} WarpDocument */

/**
 * A Pi (moved off the origin, as a Library drop leaves it) and a 2 mm plate under the whole
 * board, centred in Z on the mounting holes so each hole cuts straight through it.
 *
 * @param {object} [options]
 * @param {number} [options.model]
 * @returns {WarpDocument}
 */
function piOverPlate({ model = 4 } = {}) {
  const document = createDocument()
  document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model } }, LOCAL)
  document.append(
    { id: 'pi-1-move', op: 'transform.translate', target: 'pi-1', supersedes: 'pi-1', params: { vector: [10, 5, 0], rotation: [0, 0, 0] } },
    LOCAL,
  )
  const [min, max] = partBoundsOf(document, 'pi-1', 'hole1')
  const zMm = (min[2] + max[2]) / 2
  document.append(
    { id: 'plate-1', op: 'primitive.cuboid', name: 'Plate 1', params: { size: [120, 90, 2], center: [52.5, 33, zMm] } },
    LOCAL,
  )
  return document
}

/**
 * What the Operations toolbar's `run()` writes for "the plate, then the Pi's `pieces`, Subtract".
 *
 * @param {WarpDocument} document
 * @param {string} pieces
 * @param {string} id
 * @returns {import('./kernel/registry.js').OpRecord}
 */
function subtractPiPart(document, pieces, id) {
  const plate = /** @type {string} */ (document.currentIdOf('plate-1'))
  const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
  const operands = [
    { terminal: plate, ref: plate },
    { terminal: pi, ref: { id: pi, pieces } },
  ]
  const record = {
    id,
    op: 'boolean.subtract',
    name: document.nextName('Subtract'),
    target: operands[0].ref,
    operands: [operands[1].ref],
    consumes: consumesOf(document, 'boolean.subtract', operands),
  }
  document.append(record, LOCAL)
  return record
}

/** @param {WarpDocument} document @param {string} id */
function bodyOf(document, id) {
  return document.bodies().find((body) => body.id === id)
}

/** @param {WarpDocument} document */
function plateBody(document) {
  return document.bodies().find((body) => body.id === document.rootOf(/** @type {string} */ (document.currentIdOf('plate-1'))))
}

describe('drillPartsOf — which parts of a recipe drill', () => {
  it('a Raspberry Pi board drills with its four mounting holes and the Pi 5 fan holes, and nothing else', () => {
    expect([...drillPartsOf('raspberrypi.bplus')].sort()).toEqual(['fan1hole', 'fan2hole', 'hole1', 'hole2', 'hole3', 'hole4'])
  })

  it('every other op drills with nothing: a fastener’s tap, a camera, a HAT, a primitive', () => {
    for (const op of ['hardware.bolt', 'raspberrypi.cameraModule', 'raspberrypi.hat', 'primitive.cuboid', 'nonexistent.op']) {
      expect(drillPartsOf(op), op).toEqual([])
    }
  })
})

describe('consumesOf — the records a boolean retires', () => {
  it('a Subtract cutting with a Pi’s hole1 retires only the plate', () => {
    const document = piOverPlate()
    const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
    expect(pi).toBe('pi-1-move')
    const operands = [
      { terminal: 'plate-1', ref: 'plate-1' },
      { terminal: pi, ref: { id: pi, pieces: 'hole1' } },
    ]
    expect(consumesOf(document, 'boolean.subtract', operands)).toEqual(['plate-1'])
    expect(keepsToolBody(document, 'boolean.subtract', operands[1], 1)).toBe(true)
  })

  it('several holes at once, and a Pi 5 fan hole, keep the Pi too', () => {
    const document = piOverPlate({ model: 5 })
    const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
    for (const pieces of ['hole1,hole2', 'hole3, hole4', 'fan1hole']) {
      expect(keepsToolBody(document, 'boolean.subtract', { terminal: pi, ref: { id: pi, pieces } }, 1), pieces).toBe(true)
    }
  })

  it('a hole mixed with any other part, or the whole Pi, consumes it — that is a cut with the board', () => {
    const document = piOverPlate()
    const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
    for (const ref of [{ id: pi, pieces: 'hole1,usb1' }, { id: pi, pieces: 'clearance-avjack' }, pi]) {
      const operands = [
        { terminal: 'plate-1', ref: 'plate-1' },
        { terminal: pi, ref },
      ]
      expect(consumesOf(document, 'boolean.subtract', operands), JSON.stringify(ref)).toEqual(['plate-1', pi])
    }
  })

  it('only Subtract keeps the tool, and only as a cutting operand: Union, Intersect and the Pi as the base consume it', () => {
    const document = piOverPlate()
    const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
    const hole = { terminal: pi, ref: { id: pi, pieces: 'hole1' } }
    const plate = { terminal: 'plate-1', ref: 'plate-1' }
    expect(consumesOf(document, 'boolean.union', [plate, hole])).toEqual(['plate-1', pi])
    expect(consumesOf(document, 'boolean.intersect', [plate, hole])).toEqual(['plate-1', pi])
    expect(consumesOf(document, 'boolean.subtract', [hole, plate])).toEqual([pi, 'plate-1'])
    expect(consumesOf(document, 'group.assemble', [plate, { terminal: pi, ref: pi }])).toEqual(['plate-1', pi])
  })

  it('cube minus cube, and a fastener’s tap, still consume both operands (scenario 5 unchanged)', () => {
    const document = createDocument()
    document.append({ id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20] } }, LOCAL)
    document.append({ id: 'b', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [5, 5, 30] } }, LOCAL)
    document.append({ id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { type: 'socket', spec: 'm3', length: 10, fit: 'loose' } }, LOCAL)
    const cubes = [
      { terminal: 'a', ref: 'a' },
      { terminal: 'b', ref: 'b' },
    ]
    expect(consumesOf(document, 'boolean.subtract', cubes)).toEqual(['a', 'b'])
    const tap = [
      { terminal: 'a', ref: 'a' },
      { terminal: 'bolt-1', ref: { id: 'bolt-1', pieces: 'tap' } },
    ]
    expect(consumesOf(document, 'boolean.subtract', tap)).toEqual(['a', 'bolt-1'])
  })

  it('a Pi that is no longer a Pi at its root (it was the base of an earlier cut) is consumed', () => {
    const document = piOverPlate()
    document.append({ id: 'nick', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [2, 2, 2], center: [100, 100, 0] } }, LOCAL)
    document.append(
      { id: 'pi-cut', op: 'boolean.subtract', name: 'Subtract 1', target: 'pi-1-move', operands: ['nick'], consumes: ['pi-1-move', 'nick'] },
      LOCAL,
    )
    const operand = { terminal: 'pi-cut', ref: { id: 'pi-cut', pieces: 'hole1' } }
    expect(keepsToolBody(document, 'boolean.subtract', operand, 1)).toBe(false)
  })

  it('never lists one record twice, and always retires the base', () => {
    const document = piOverPlate()
    const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
    const operands = [
      { terminal: 'plate-1', ref: 'plate-1' },
      { terminal: pi, ref: { id: pi, pieces: 'hole1' } },
      { terminal: pi, ref: { id: pi, pieces: 'usb1' } },
    ]
    expect(consumesOf(document, 'boolean.subtract', operands)).toEqual(['plate-1', pi])
  })
})

describe('one Pi drills four holes (TODO/core-064)', () => {
  it('the Pi stays in place after each Subtract, and the plate loses one hole’s worth of material each time', () => {
    const document = piOverPlate()
    const piBefore = boundsOf(/** @type {any} */ (bodyOf(document, 'pi-1')?.geometry))
    const holeVolume = volumeOf(/** @type {any} */ (bodyOf(document, 'pi-1')?.geometry).parts.hole1)
    const [holeMin, holeMax] = partBoundsOf(document, 'pi-1', 'hole1')
    // The plate is 2 mm of the hole's height, and the hole is a straight prism: that fraction.
    const perHole = (holeVolume * 2) / (holeMax[2] - holeMin[2])
    let previous = volumeOf(/** @type {any} */ (plateBody(document)?.geometry))

    for (const [index, hole] of ['hole1', 'hole2', 'hole3', 'hole4'].entries()) {
      subtractPiPart(document, hole, `bool-${index + 1}`)
      const pi = bodyOf(document, 'pi-1')
      expect(pi, `after ${hole}`).toBeDefined()
      const piNow = boundsOf(/** @type {any} */ (pi?.geometry))
      for (let corner = 0; corner < 2; corner += 1) {
        for (let axis = 0; axis < 3; axis += 1) expect(piNow[corner][axis]).toBeCloseTo(piBefore[corner][axis], 9)
      }
      // The Pi's own holes are unchanged: hole1 is still a part, at the same place.
      const [min, max] = partBoundsOf(document, 'pi-1', 'hole1')
      expect(min[0]).toBeCloseTo(holeMin[0], 9)
      expect(max[2]).toBeCloseTo(holeMax[2], 9)

      const now = volumeOf(/** @type {any} */ (plateBody(document)?.geometry))
      expect(previous - now, `${hole} removed`).toBeCloseTo(perHole, 3)
      previous = now
      // Two bodies, never more: the plate (as its latest Subtract) and the one Pi.
      expect(document.bodies().map((body) => body.id)).toEqual(['pi-1', `bool-${index + 1}`])
    }
  })

  it('the BOM counts one Pi, not four (and not none)', () => {
    const document = piOverPlate()
    for (const [index, hole] of ['hole1', 'hole2', 'hole3', 'hole4'].entries()) subtractPiPart(document, hole, `bool-${index + 1}`)
    const pis = tallyBom(document.bodies()).filter((row) => row.op === 'raspberrypi.bplus')
    expect(pis).toEqual([expect.objectContaining({ count: 1 })])
  })

  it('Undo takes back the last hole and leaves the Pi alone', () => {
    const document = piOverPlate()
    subtractPiPart(document, 'hole1', 'bool-1')
    const oneHole = volumeOf(/** @type {any} */ (plateBody(document)?.geometry))
    subtractPiPart(document, 'hole2', 'bool-2')
    document.undo()
    expect(document.bodies().map((body) => body.id)).toEqual(['pi-1', 'bool-1'])
    expect(volumeOf(/** @type {any} */ (plateBody(document)?.geometry))).toBeCloseTo(oneHole, 6)
  })

  it('the moved Pi drills where it now is: a later Subtract reads its current record', () => {
    const document = piOverPlate()
    subtractPiPart(document, 'hole1', 'bool-1')
    document.append(
      { id: 'pi-1-move-2', op: 'transform.translate', target: 'pi-1-move', supersedes: 'pi-1-move', params: { vector: [5, 0, 0], rotation: [0, 0, 0] } },
      LOCAL,
    )
    const record = subtractPiPart(document, 'hole1', 'bool-2')
    expect(record.operands).toEqual([{ id: 'pi-1-move-2', pieces: 'hole1' }])
    expect(record.consumes).toEqual(['bool-1'])
    expect(bodyOf(document, 'pi-1')).toBeDefined()
  })
})

describe('a drilled-with Pi is an ordinary body afterwards', () => {
  it('deleting the Pi keeps every hole and breaks nothing', () => {
    const document = piOverPlate()
    for (const [index, hole] of ['hole1', 'hole2'].entries()) subtractPiPart(document, hole, `bool-${index + 1}`)
    const drilled = volumeOf(/** @type {any} */ (plateBody(document)?.geometry))
    document.deleteBodies(['pi-1'], LOCAL)
    expect(document.bodies().map((body) => body.id)).toEqual(['bool-2'])
    expect(volumeOf(/** @type {any} */ (plateBody(document)?.geometry))).toBeCloseTo(drilled, 6)
    expect(document.brokenSteps()).toEqual([])
  })

  it('the repair dialog for a model change is the one a consumed Pi got: same row, same fixes', () => {
    /** @param {boolean} survive */
    const breakageOf = (survive) => {
      const document = piOverPlate({ model: 5 })
      const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
      document.append(
        {
          id: 'bool-1',
          op: 'boolean.subtract',
          name: 'Subtract 1',
          target: 'plate-1',
          operands: [{ id: pi, pieces: 'fan1hole' }],
          consumes: survive ? ['plate-1'] : ['plate-1', pi],
        },
        LOCAL,
      )
      const record = piWith(document, { model: 4 })
      const { breakages } = impactOf(document, [{ id: 'pi-1', record }], { editedRootId: 'pi-1' })
      return breakages
    }
    const kept = breakageOf(true)
    const consumed = breakageOf(false)
    expect(kept).toHaveLength(1)
    const pick = (/** @type {any} */ breakage) => ({
      dependentRecordId: breakage.dependentRecordId,
      dependentBodyId: breakage.dependentBodyId,
      relationship: breakage.relationship,
      missingPieces: breakage.missingPieces,
      placement: breakage.placement,
    })
    expect(pick(kept[0])).toEqual(pick(consumed[0]))
    expect(kept[0].relationship).toBe('Subtract (operand) → fan1hole')
    expect(offeredFixesOf(kept[0], { enumParam: true })).toEqual(offeredFixesOf(consumed[0], { enumParam: true }))
  })
})

describe('Repeat and a drilled plate (TODO/core-061 interplay)', () => {
  it('refuses to repeat the cut plate onto the other holes — it would copy the whole plate per hole', () => {
    const document = piOverPlate()
    subtractPiPart(document, 'hole1', 'bool-1')
    const reason = repeatRefusal(document, { source: 'bool-1', seed: { id: 'pi-1', pieces: 'hole1' }, targets: ['hole2', 'hole3', 'hole4'] })
    expect(reason).toMatch(/copy/)
    expect(reason).toMatch(/Subtract/)
    expect(reason).toMatch(/one at a time/)
  })
})
