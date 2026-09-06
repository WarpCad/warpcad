import modeling from '@jscad/modeling'
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { boundsOf } from './kernel/group.js'
import {
  moveToRecord,
  positionOf,
  rotateToRecord,
  rotationOf,
  rotateRecord,
  translateRecord,
} from './transform.js'

/**
 * The shared move/rotate mutation (`TODO/ui-012`).
 *
 * The point of this module having its own spec — rather than the behaviour being
 * asserted only through a component — is the contract underneath both input
 * paths: a gizmo drag and a typed Inspector field must produce the *same* record.
 * If that ever stopped being true, the two would drift, which is precisely what
 * `render-001`'s one-camera-two-inputs rule exists to prevent.
 */

/** @param {{ centerMm?: [number, number, number] }} [options] */
function docWithCube({ centerMm = [0, 0, 20] } = {}) {
  const document = createDocument()
  document.append(
    {
      id: 'cube-1',
      op: 'primitive.cuboid',
      name: 'Cube 1',
      params: { size: [40, 40, 40], center: centerMm },
    },
    { origin: 'local' }
  )
  return document
}

/**
 * A 20 × 40 × 60 block — three distinct extents, so a rotation landing on the
 * wrong axes cannot hide behind two equal ones the way it can on a cube.
 *
 * @returns {import('./document.js').WarpDocument}
 */
function docWithBlock() {
  const document = createDocument()
  document.append(
    {
      id: 'block-1',
      op: 'primitive.cuboid',
      name: 'Block 1',
      params: { size: [20, 40, 60], center: [0, 0, 30] },
    },
    { origin: 'local' }
  )
  return document
}

/**
 * The body's world-axis bounding-box size — a coordinate-free-enough statement of
 * "which way is this solid actually pointing", used to compare two orientations
 * without trusting either one's carried angle triple.
 *
 * @param {import('./document.js').WarpDocument} document
 * @returns {number[]}
 */
function sizeAlong(document) {
  const [min, max] = boundsOf(document.bodies()[0].geometry)
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

/** @param {import('./document.js').WarpDocument} document */
function centreOf(document) {
  const [min, max] = boundsOf(document.bodies()[0].geometry)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

const { mat4, vec3 } = modeling.maths

/** @param {number} degrees */
const rad = (degrees) => (degrees * Math.PI) / 180

/**
 * The kernel's own matrix for a degree triple — `mat4.fromTaitBryanRotation` is
 * what `transforms.rotate` calls, so this *is* what a `rotationDeg` triple means.
 *
 * @param {readonly number[]} degrees
 */
const kernelMatrix = (degrees) =>
  mat4.fromTaitBryanRotation(mat4.create(), rad(degrees[2]), rad(degrees[1]), rad(degrees[0]))

/** @type {[number, number, number][]} */
const UNIT_AXES = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

/**
 * Where a rotation sends the three unit axes. Comparing orientations this way
 * rather than comparing angle triples is what lets these tests assert against
 * `@jscad/modeling`'s own arithmetic instead of against `src/core/rotation.js`.
 *
 * @param {readonly number[]} degrees
 * @returns {number[][]}
 */
function axesUnder(degrees) {
  const matrix = kernelMatrix(degrees)
  return UNIT_AXES.map((axis) => Array.from(vec3.transform(vec3.create(), axis, matrix)))
}

/**
 * Where a history of world-frame deltas sends the three unit axes, applied one
 * after another — the composition `transform.rotate` actually performs on the
 * solid, with no matrix-multiply convention to get backwards.
 *
 * @param {readonly (readonly number[])[]} deltas
 * @returns {number[][]}
 */
function axesAfterHistory(deltas) {
  return UNIT_AXES.map((axis) => {
    /** @type {[number, number, number]} */
    let point = [axis[0], axis[1], axis[2]]
    for (const delta of deltas) {
      const turned = vec3.transform(vec3.create(), point, kernelMatrix(delta))
      point = [turned[0], turned[1], turned[2]]
    }
    return point
  })
}

/**
 * @param {number[][]} actual
 * @param {number[][]} expected
 */
function expectSameAxes(actual, expected) {
  for (let axis = 0; axis < 3; axis += 1) {
    for (let component = 0; component < 3; component += 1) {
      expect(actual[axis][component]).toBeCloseTo(expected[axis][component], 9)
    }
  }
}

/**
 * Turn a body through a whole history of deltas, one record each — the shape a
 * user's ring drags and typed fields actually produce.
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {string} bodyId
 * @param {readonly [number, number, number][]} deltas
 */
function applyTurns(document, bodyId, deltas) {
  for (const delta of deltas) {
    document.append(rotateRecord(document, bodyId, delta), { origin: 'local' })
  }
}

describe('positionOf / rotationOf — reading a body\'s current transform', () => {
  it('reads position off the evaluated geometry, not the raw center param', () => {
    const document = docWithCube({ centerMm: [10, -5, 20] })
    expect(positionOf(document, 'cube-1')).toEqual([10, -5, 20])
    expect(rotationOf(document, 'cube-1')).toEqual([0, 0, 0])
  })

  it('follows the body through a move', () => {
    const document = docWithCube()
    document.append(translateRecord(document, 'cube-1', [7, 0, 0]), { origin: 'local' })
    const [x, , z] = positionOf(document, 'cube-1')
    expect(x).toBeCloseTo(7, 6)
    expect(z).toBeCloseTo(20, 6)
  })
})

describe('translateRecord', () => {
  it('builds a superseding transform.translate against the lineage\'s current id', () => {
    const document = docWithCube()
    const record = translateRecord(document, 'cube-1', [5, 0, 0])
    expect(record.op).toBe('transform.translate')
    expect(record.target).toBe('cube-1')
    expect(record.supersedes).toBe('cube-1')
    expect(record.params?.vector).toEqual([5, 0, 0])
    // Deliberately unnamed: a `name` would append to the scene group's `names`
    // list, and a superseding record sharing its predecessor's name would union
    // a body with itself in `combine()` (see group.js's un-deduplicated `names`).
    expect(record.name).toBeUndefined()
    expect(record.id).not.toBe('cube-1')
  })

  it('moves the body without duplicating it', () => {
    const document = docWithCube()
    document.append(translateRecord(document, 'cube-1', [12, 0, 0]), { origin: 'local' })
    expect(document.bodies()).toHaveLength(1)
    expect(centreOf(document)[0]).toBeCloseTo(12, 6)

    // And again, from the moved state — the second record must target the first
    // record's *result*, not the original.
    document.append(translateRecord(document, 'cube-1', [3, 0, 0]), { origin: 'local' })
    expect(document.bodies()).toHaveLength(1)
    expect(centreOf(document)[0]).toBeCloseTo(15, 6)
  })

  it('rejects a non-finite delta rather than appending NaN geometry', () => {
    const document = docWithCube()
    expect(() => translateRecord(document, 'cube-1', [Number.NaN, 0, 0])).toThrow(/finite/)
  })
})

describe('rotateRecord', () => {
  it('turns the body about its own centre and accumulates absolute degrees', () => {
    const document = docWithCube({ centerMm: [30, 0, 20] })
    document.append(rotateRecord(document, 'cube-1', [0, 0, 30]), { origin: 'local' })
    expect(document.bodies()).toHaveLength(1)
    // Rotating about its own centre leaves the body where it is.
    const [x, y, z] = centreOf(document)
    expect(x).toBeCloseTo(30, 6)
    expect(y).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(20, 6)
    expect(rotationOf(document, 'cube-1')).toEqual([0, 0, 30])

    document.append(rotateRecord(document, 'cube-1', [0, 0, 15]), { origin: 'local' })
    expect(rotationOf(document, 'cube-1')).toEqual([0, 0, 45])
    expect(document.bodies()).toHaveLength(1)
  })

  it('carries the composition of an out-of-order history, not the sum (TODO/core-004)', () => {
    // The finding's own worked example, and the one a user reaches by dragging
    // the Z ring and then the X ring. The solid ends up at `Rx(90)·Rz(90)`; the
    // old carried sum said `[90, 0, 90]`, which denotes `Rz(90)·Rx(90)` — a
    // genuinely different orientation, off by a 120° turn about a diagonal.
    const document = docWithCube()
    applyTurns(document, 'cube-1', [
      [0, 0, 90],
      [90, 0, 0],
    ])
    const carried = rotationOf(document, 'cube-1')

    expectSameAxes(axesUnder(carried), axesAfterHistory([[0, 0, 90], [90, 0, 0]]))
    // Not the sum — asserted explicitly, so this cannot pass by coincidence.
    expect(() => expectSameAxes(axesUnder(carried), axesUnder([90, 0, 90]))).toThrow()
  })

  it('carries the reverse order to its own, different, orientation (TODO/core-004)', () => {
    // X then Z is the in-order case and was always exact; asserting it alongside
    // its reverse is what shows the two are being kept apart rather than both
    // collapsing onto one answer.
    const document = docWithCube()
    applyTurns(document, 'cube-1', [
      [90, 0, 0],
      [0, 0, 90],
    ])
    const carried = rotationOf(document, 'cube-1')

    expectSameAxes(axesUnder(carried), axesAfterHistory([[90, 0, 0], [0, 0, 90]]))
    expect(carried).toEqual([90, 0, 90])
  })

  it('leaves a single-axis history at exactly the numbers it always showed', () => {
    // Regression guard: this is the path every prior test and every acceptance
    // drive exercises, and composing must not move it by so much as a float ulp.
    const document = docWithCube()
    applyTurns(document, 'cube-1', [
      [0, 30, 0],
      [0, 25, 0],
      [0, -10, 0],
    ])
    expect(rotationOf(document, 'cube-1')).toEqual([0, 45, 0])
  })

  it('leaves an X-then-Y-then-Z history at exactly the numbers it always showed', () => {
    const document = docWithCube()
    applyTurns(document, 'cube-1', [
      [30, 0, 0],
      [0, 40, 0],
      [0, 0, 50],
    ])
    expect(rotationOf(document, 'cube-1')).toEqual([30, 40, 50])
  })

  it('a move after a rotate keeps the rotation readable', () => {
    // The state param has to be carried forward by *every* transform record, or
    // the Inspector's Rotation fields would silently reset on the next drag.
    const document = docWithCube()
    document.append(rotateRecord(document, 'cube-1', [0, 0, 90]), { origin: 'local' })
    document.append(translateRecord(document, 'cube-1', [10, 0, 0]), { origin: 'local' })
    expect(rotationOf(document, 'cube-1')).toEqual([0, 0, 90])
    expect(document.bodies()).toHaveLength(1)
  })
})

describe('moveToRecord / rotateToRecord — the typed-field path', () => {
  it('a typed absolute position becomes the same kind of record as a drag', () => {
    const document = docWithCube({ centerMm: [0, 0, 20] })
    const record = moveToRecord(document, 'cube-1', [25, 0, 20])
    expect(record.op).toBe('transform.translate')
    // The typed value is absolute; the record is a delta from where the body is.
    expect(record.params?.vector[0]).toBeCloseTo(25, 6)
    expect(record.params?.vector[2]).toBeCloseTo(0, 6)

    document.append(record, { origin: 'local' })
    expect(document.bodies()).toHaveLength(1)
    expect(positionOf(document, 'cube-1')[0]).toBeCloseTo(25, 6)
  })

  it('a typed absolute rotation becomes a delta rotation about the body centre', () => {
    const document = docWithCube()
    document.append(rotateRecord(document, 'cube-1', [0, 0, 20]), { origin: 'local' })
    const record = rotateToRecord(document, 'cube-1', [0, 0, 50])
    expect(record.params?.angles[2]).toBeCloseTo(30, 6)

    document.append(record, { origin: 'local' })
    expect(rotationOf(document, 'cube-1')).toEqual([0, 0, 50])
  })

  it('a typed absolute rotation lands on the typed value after an out-of-order history (TODO/core-004)', () => {
    // Consequence 2 of the finding. `rotateToRecord` used to subtract per axis,
    // which is only the right delta while the carried triple is a plain sum. Once
    // the carried value is the real composition the delta has to be the *relative*
    // rotation `R(target)·R(current)⁻¹`, or typing a number lands somewhere else.
    // Asserted against the **geometry**, not against the carried number: the old
    // per-axis subtraction is self-consistent with the old per-axis addition, so
    // `rotationOf` would report the typed value either way while the solid sat
    // somewhere else entirely. A 20 × 40 × 60 block, so no axis can hide behind
    // an equal extent.
    const typed = docWithBlock()
    applyTurns(typed, 'block-1', [
      [0, 0, 90],
      [90, 0, 0],
    ])
    typed.append(rotateToRecord(typed, 'block-1', [30, 40, 50]), { origin: 'local' })

    // The same block, turned straight to [30, 40, 50] in one record and nothing
    // else. Whatever history the first one came through, the two solids must now
    // be in the same orientation — which their world bounding boxes report.
    const direct = docWithBlock()
    applyTurns(direct, 'block-1', [[30, 40, 50]])

    expect(rotationOf(typed, 'block-1')).toEqual([30, 40, 50])
    expect(typed.bodies()).toHaveLength(1)
    for (let axis = 0; axis < 3; axis += 1) {
      expect(sizeAlong(typed)[axis]).toBeCloseTo(sizeAlong(direct)[axis], 6)
    }

    // And typing zeros really does put it back flat, rather than to some residue
    // of the history it came through: a flat 20 × 40 × 60 block measures 20 × 40
    // × 60 on the world axes, and nothing else does.
    typed.append(rotateToRecord(typed, 'block-1', [0, 0, 0]), { origin: 'local' })
    expect(rotationOf(typed, 'block-1')).toEqual([0, 0, 0])
    expect(sizeAlong(typed)[0]).toBeCloseTo(20, 6)
    expect(sizeAlong(typed)[1]).toBeCloseTo(40, 6)
    expect(sizeAlong(typed)[2]).toBeCloseTo(60, 6)
  })

  it('both directions agree: dragging then reading, and typing then reading', () => {
    // The claim `TODO/ui-012`'s Done-when makes in one sentence, asserted.
    const dragged = docWithCube()
    dragged.append(translateRecord(dragged, 'cube-1', [18, 0, 0]), { origin: 'local' })

    const typed = docWithCube()
    typed.append(moveToRecord(typed, 'cube-1', [18, 0, 20]), { origin: 'local' })

    expect(positionOf(dragged, 'cube-1')[0]).toBeCloseTo(positionOf(typed, 'cube-1')[0], 6)
    expect(dragged.bodies()).toHaveLength(1)
    expect(typed.bodies()).toHaveLength(1)
  })

  it('rejects a typed value that is not a finite number', () => {
    const document = docWithCube()
    expect(() => moveToRecord(document, 'cube-1', [Number.NaN, 0, 20])).toThrow(/finite/)
  })
})
