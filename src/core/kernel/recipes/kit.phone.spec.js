// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { isGroup, toGeom3 } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { phone } from './kit.phone.js'

const { measurements } = modeling

/**
 * Bounding box `[min, max]` of an evaluated `kit.phone`, in millimetres.
 *
 * @param {Record<string, any>} [params]
 * @returns {[number[], number[]]}
 */
function boundsOfPhone(params = {}) {
  const value = evaluateOp('kit.phone', params)
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  const [min, max] = measurements.measureBoundingBox(toGeom3(value))
  return [min, max]
}

describe('the phone recipe expands into op records, it does not build a mesh', () => {
  it('ends in one named record, and no other record carries a name', () => {
    const records = phone({})
    expect(records.at(-1)).toMatchObject({ id: 'phone', name: 'phone', op: 'transform.translate' })
    expect(records.filter((record) => record.name)).toHaveLength(1)
  })

  it('unions the plateau into the slab before centring', () => {
    const ops = phone({}).map((record) => record.op)
    expect(ops).toEqual([
      'profile.roundedRectangle',
      'profile.extrudeLinear',
      'transform.translate',
      'profile.roundedRectangle',
      'profile.extrudeLinear',
      'transform.translate',
      'boolean.union',
      'transform.translate',
    ])
  })

  it('is reachable through expand() as a registered composite op', () => {
    expect(expand('kit.phone', {}).at(-1)).toMatchObject({ name: 'phone' })
  })

  it('bakes no segment count, so the design resolution decides', () => {
    expect(phone({}).filter((record) => record.params?.segments !== undefined)).toEqual([])
  })
})

describe('the phone recipe builds the stand-in', () => {
  it('is slab plus plateau tall, and exactly the phone footprint', () => {
    const [min, max] = boundsOfPhone({ width: 77, length: 157, thickness: 9, plateauHeight: 4 })
    expect(max[0] - min[0]).toBeCloseTo(77, 3)
    expect(max[1] - min[1]).toBeCloseTo(157, 3)
    expect(max[2] - min[2]).toBeCloseTo(13, 3)
  })

  it('centres its bounding box on the origin', () => {
    const [min, max] = boundsOfPhone()
    for (let axis = 0; axis < 3; axis += 1) expect((min[axis] + max[axis]) / 2).toBeCloseTo(0, 3)
  })

  it('honours a caller-supplied centre', () => {
    const [min, max] = boundsOfPhone({ center: [10, 20, 30] })
    expect((min[0] + max[0]) / 2).toBeCloseTo(10, 3)
    expect((min[1] + max[1]) / 2).toBeCloseTo(20, 3)
    expect((min[2] + max[2]) / 2).toBeCloseTo(30, 3)
  })

  it('puts the plateau at the +Y end and below the slab', () => {
    // The plateau is the only thing below the slab's underside (z = bottom + plateauHeight),
    // so a thin horizontal slice there must reach the +Y end and not the −Y end.
    const value = evaluateOp('kit.phone', { plateauLength: 40, plateauHeight: 4 })
    const geometry = toGeom3(/** @type {any} */ (value))
    const [min, max] = measurements.measureBoundingBox(geometry)
    const bottom = min[2]
    const plateauYs = modeling.geometries.geom3
      .toPolygons(geometry)
      .flatMap((polygon) => polygon.vertices)
      .filter((v) => v[2] < bottom + 3.5)
      .map((v) => v[1])
    expect(Math.max(...plateauYs)).toBeCloseTo(max[1], 2)
    expect(Math.min(...plateauYs)).toBeGreaterThan(min[1] + 100)
  })
})

describe('the phone recipe refuses what cannot be built', () => {
  it('rejects a plateau larger than the phone', () => {
    expect(() => phone({ width: 70, plateauWidth: 80 })).toThrow(/must fit inside/)
    expect(() => phone({ length: 100, plateauLength: 110 })).toThrow(/must fit inside/)
  })

  it('names the parameter on a non-positive dimension', () => {
    expect(() => phone({ plateauHeight: 0 })).toThrow(/plateauHeight/)
    expect(() => phone({ thickness: -1 })).toThrow(/thickness/)
  })

  it('rejects a corner radius that does not fit', () => {
    expect(() => phone({ cornerRadius: 50 })).toThrow(/cornerRadius/)
    expect(() => phone({ plateauCornerRadius: 30 })).toThrow(/plateauCornerRadius/)
  })
})
