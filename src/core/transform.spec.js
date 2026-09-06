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

/** @param {import('./document.js').WarpDocument} document */
function centreOf(document) {
  const [min, max] = boundsOf(document.bodies()[0].geometry)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
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
