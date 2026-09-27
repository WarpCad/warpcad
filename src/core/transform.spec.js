import modeling from '@jscad/modeling'
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { boundsOf, isGroup } from './kernel/group.js'
import {
  alignToOriginRecord,
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
 * Narrow an `OpRecord | null` to a real record, and assert it is one — every
 * `alignToOriginRecord` case that expects a real (non-no-op) result needs
 * this before it can `document.append` it, since the function's own return
 * type is nullable for the no-op case (`TODO/ui-050`).
 *
 * @param {import('./kernel/registry.js').OpRecord | null} record
 * @returns {import('./kernel/registry.js').OpRecord}
 */
function requireRecord(record) {
  expect(record).not.toBeNull()
  return /** @type {import('./kernel/registry.js').OpRecord} */ (record)
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

describe('alignToOriginRecord (TODO/ui-050)', () => {
  it('centres X/Y and puts the min face at 0 on Z, for a cube at an arbitrary position', () => {
    const document = docWithCube({ centerMm: [12, -7, 33] }) // size 40, so bounds: x[-8,32] y[-27,13] z[13,53]
    const record = alignToOriginRecord(document, 'cube-1', { x: 'center', y: 'center', z: 'min' })
    document.append(requireRecord(record), { origin: 'local' })

    const [min, max] = boundsOf(document.bodies()[0].geometry)
    expect((min[0] + max[0]) / 2).toBeCloseTo(0, 6)
    expect((min[1] + max[1]) / 2).toBeCloseTo(0, 6)
    expect(min[2]).toBeCloseTo(0, 6)
  })

  it('"max" puts the max face at 0 on every requested axis', () => {
    const document = docWithCube({ centerMm: [12, -7, 33] })
    const record = alignToOriginRecord(document, 'cube-1', { x: 'max', y: 'max', z: 'max' })
    document.append(requireRecord(record), { origin: 'local' })

    const [, max] = boundsOf(document.bodies()[0].geometry)
    expect(max[0]).toBeCloseTo(0, 6)
    expect(max[1]).toBeCloseTo(0, 6)
    expect(max[2]).toBeCloseTo(0, 6)
  })

  it('only touches the requested axes — X and Y are exactly unchanged when only Z is requested', () => {
    const document = docWithCube({ centerMm: [12, -7, 33] })
    const before = centreOf(document)
    const record = alignToOriginRecord(document, 'cube-1', { z: 'min' })
    document.append(requireRecord(record), { origin: 'local' })
    const after = centreOf(document)

    expect(after[0]).toBeCloseTo(before[0], 6)
    expect(after[1]).toBeCloseTo(before[1], 6)
    expect(after[2]).not.toBeCloseTo(before[2], 3)
  })

  /**
   * The Pi case — the reason the Reference picker exists at all. In
   * `raspberrypi.bplus.js`, `microsd` is snapped `outside+` under `mb`
   * (`group.js`'s `SNAP_SIDES['outside+']`: reference's min face, moving
   * part's max face), so the whole body's own min Z is 1.5 mm (the card's
   * thickness) *below* the board's. "Snap the bottom of the motherboard to
   * Z=0" has to measure from `mb` alone while moving the whole Pi.
   */
  it('the Pi case: aligning by the "mb" part alone leaves the whole body 1.5 mm below the board (the microsd)', () => {
    const document = createDocument()
    document.append(
      { id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: { model: 4 } },
      { origin: 'local' },
    )
    // The recipe's own coordinate convention already sits `mb`'s min Z at 0
    // (its module doc: "board underside at the origin") — moving the Pi
    // somewhere else first is what makes this the real "drop it anywhere,
    // then align" scenario `TODO/ui-050` was requested for, rather than a
    // no-op that happens to look right.
    document.append(translateRecord(document, 'pi-1', [50, -30, 25]), { origin: 'local' })

    const record = requireRecord(alignToOriginRecord(document, 'pi-1', { z: 'min', partName: 'mb' }))
    document.append(record, { origin: 'local' })

    const body = document.bodies()[0]
    const geometry = body.geometry
    if (!isGroup(geometry)) throw new Error('expected the Pi body to be a Group')
    const [mbMin] = boundsOf(geometry.parts.mb)
    const [wholeMin] = boundsOf(body.geometry)
    expect(mbMin[2]).toBeCloseTo(0, 6)
    expect(wholeMin[2]).toBeCloseTo(-1.5, 6)
  })

  it('a rotated body (45° about X) aligns its evaluated world bounds, not its local ones', () => {
    const document = docWithCube()
    document.append(rotateRecord(document, 'cube-1', [45, 0, 0]), { origin: 'local' })
    const record = alignToOriginRecord(document, 'cube-1', { z: 'min' })
    document.append(requireRecord(record), { origin: 'local' })

    const [min] = boundsOf(document.bodies()[0].geometry)
    expect(min[2]).toBeCloseTo(0, 6)
  })

  it('is a no-op — returns null and appends nothing — when every requested axis is already aligned', () => {
    const document = docWithCube({ centerMm: [0, 0, 33] }) // bounds z: [13, 53] — not aligned yet
    const first = alignToOriginRecord(document, 'cube-1', { z: 'min' })
    document.append(requireRecord(first), { origin: 'local' })
    const recordCountAfterFirst = document.records.length

    // Now min Z really is 0 — a second identical tap must change nothing.
    const second = alignToOriginRecord(document, 'cube-1', { z: 'min' })
    expect(second).toBeNull()
    expect(document.records.length).toBe(recordCountAfterFirst)
  })

  it('an unknown partName falls back to the whole body rather than throwing', () => {
    const document = createDocument()
    document.append(
      { id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: { model: 4 } },
      { origin: 'local' },
    )
    document.append(translateRecord(document, 'pi-1', [50, -30, 25]), { origin: 'local' })

    const whole = alignToOriginRecord(document, 'pi-1', { z: 'min' })
    const unknown = alignToOriginRecord(document, 'pi-1', { z: 'min', partName: 'not-a-real-part' })
    expect(unknown).not.toBeNull()
    expect(unknown?.params?.vector).toEqual(whole?.params?.vector)
  })

  it('a near-zero-thickness reference measures a finite delta — never NaN', () => {
    const document = createDocument()
    document.append(
      {
        id: 'flat-1',
        op: 'primitive.cuboid',
        name: 'Flat 1',
        params: { size: [40, 40, 1e-6], center: [0, 0, 10] },
      },
      { origin: 'local' },
    )
    const record = alignToOriginRecord(document, 'flat-1', { x: 'center', y: 'center', z: 'min' })
    expect(record).not.toBeNull()
    for (const component of /** @type {number[]} */ (record?.params?.vector)) {
      expect(Number.isFinite(component)).toBe(true)
    }
    expect(record?.params?.vector[2]).toBeCloseTo(-10, 3)
  })

  it('never lets a signed zero leak into the translation vector', () => {
    // A cube whose max Z is exactly 0 before the align: `-refMax[2]` computes
    // as `-0` before normalisation. X is also requested and does move, so the
    // record is real and its vector is inspectable.
    const document = docWithCube({ centerMm: [10, 0, -20] }) // bounds x:[-10,30] z:[-40,0]
    const record = alignToOriginRecord(document, 'cube-1', { x: 'center', z: 'max' })
    expect(record).not.toBeNull()
    expect(record?.params?.vector[2]).toBe(0)
    expect(Object.is(record?.params?.vector[2], -0)).toBe(false)
  })

  it('marks the record so timelineLabel can tell it apart from an ordinary move', () => {
    const document = docWithCube({ centerMm: [12, -7, 33] })
    const record = alignToOriginRecord(document, 'cube-1', { z: 'min' })
    expect(record?.op).toBe('transform.translate')
    expect(record?.params?.alignedTo).toBe(true)
    // Still carries everything an ordinary translate record must, so gizmo/
    // field sync and replay cannot tell the two apart structurally.
    expect(record?.params?.rotation).toEqual([0, 0, 0])
    expect(record?.supersedes).toBe('cube-1')
  })
})
