// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { isGroup, toGeom3 } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
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

// ---------------------------------------------------------------------------------------
// TODO/core-057: the handset table, the case presets, the enlarge params, named parts.
// ---------------------------------------------------------------------------------------

import { buildPhone, phoneDisplayName } from './kit.phone.js'
import { PHONE_MODELS, phoneModelById } from './phoneModels.js'

/**
 * @param {any} value
 * @returns {number}
 */
function volumeOf(value) {
  return measurements.measureVolume(isGroup(value) ? toGeom3(value) : value)
}

/** Area of a rounded rectangle: the corner arcs lose `(4 - pi) r^2`. */
const roundedArea = (/** @type {number} */ w, /** @type {number} */ l, /** @type {number} */ r) => w * l - (4 - Math.PI) * r * r

/**
 * @param {Record<string, any>} params
 * @returns {{ size: number[], zExtent: number }}
 */
function sizeOf(params) {
  const [min, max] = boundsOfPhone(params)
  return { size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], zExtent: max[2] - min[2] }
}

describe('a model with no case is exactly the handset', () => {
  for (const row of PHONE_MODELS) {
    it(`${row.id}: bounding box = table size, plus the tallest plateau in Z`, () => {
      const { size } = sizeOf({ model: row.id, case: 'none' })
      expect(size[0]).toBeCloseTo(row.widthMm, 3)
      expect(size[1]).toBeCloseTo(row.heightMm, 3)
      expect(size[2]).toBeCloseTo(row.depthMm + Math.max(...row.plateaus.map((p) => p.heightMm)), 3)
    })
  }
})

describe('a case preset adds exactly its margins', () => {
  const cases = {
    slim: [3, 3, 1.5],
    protective: [6, 6, 3],
    rugged: [12.75, 11.75, 7.98],
    techweave: [5.1, 7, 0.25],
    custom: [0, 0, 0],
  }
  for (const [id, [dx, dy, dz]] of Object.entries(cases)) {
    it(`${id}: +${dx} x +${dy} x +${dz} over the bare iPhone 17 Pro`, () => {
      const bare = sizeOf({ model: 'iphone-17-pro', case: 'none' }).size
      const cased = sizeOf({ model: 'iphone-17-pro', case: id }).size
      expect(cased[0] - bare[0]).toBeCloseTo(dx, 3)
      expect(cased[1] - bare[1]).toBeCloseTo(dy, 3)
      expect(cased[2] - bare[2]).toBeCloseTo(dz, 3)
    })
  }

  it('TechWeave on an iPhone 17 Pro is today’s 77 x 157 x 9 slab and 74 x 46 x 4 plateau', () => {
    const { size } = sizeOf({ model: 'iphone-17-pro', case: 'techweave' })
    expect(size[0]).toBeCloseTo(77, 3)
    expect(size[1]).toBeCloseTo(157, 3)
    expect(size[2]).toBeCloseTo(13, 3)
    const legacy = sizeOf({})
    expect(size).toEqual(legacy.size.map((/** @type {number} */ value) => expect.closeTo(value, 6)))
  })
})

describe('the enlarge params add on top of the preset, in every combination', () => {
  const base = sizeOf({ model: 'iphone-17-pro', case: 'slim' }).size
  for (const [all, x, y, z] of [
    [0, 0, 0, 0],
    [1, 0, 0, 0],
    [0, 0.5, 0, 0],
    [0, 0, 2, 0],
    [0, 0, 0, 1.5],
    [1, 0.5, 2, 1.5],
  ]) {
    it(`caseEnlarge ${all}, X ${x}, Y ${y}, Z ${z}`, () => {
      const got = sizeOf({
        model: 'iphone-17-pro',
        case: 'slim',
        caseEnlarge: all,
        caseEnlargeX: x,
        caseEnlargeY: y,
        caseEnlargeZ: z,
      }).size
      expect(got[0] - base[0]).toBeCloseTo(all + x, 3)
      expect(got[1] - base[1]).toBeCloseTo(all + y, 3)
      expect(got[2] - base[2]).toBeCloseTo(all + z, 3)
    })
  }

  it('refuses a negative value with the module’s usual wording', () => {
    expect(() => phone({ model: 'iphone-17-pro', case: 'slim', caseEnlarge: -1 })).toThrow(
      /kit\.phone: caseEnlarge must be a non-negative number of millimetres, got -1/
    )
    expect(() => phone({ model: 'iphone-17-pro', case: 'slim', caseEnlargeY: -0.1 })).toThrow(/caseEnlargeY/)
    expect(() => phone({ model: 'iphone-17-pro', case: 'slim', plateauClearance: -2 })).toThrow(/plateauClearance/)
  })
})

describe('the result is one group with separately addressable parts', () => {
  it('names body and plateau, each a named record', () => {
    const records = phone({ model: 'iphone-17-pro', case: 'slim' })
    expect(records.filter((r) => r.name).map((r) => r.name)).toEqual(['body', 'plateau'])
  })

  it('evaluates to one Group whose parts are body and plateau', () => {
    const value = evaluateOp('kit.phone', { model: 'iphone-17-pro', case: 'slim' })
    expect(isGroup(value)).toBe(true)
    expect(/** @type {any} */ (value).names).toEqual(['body', 'plateau'])
  })

  it('a three-part model (a table row with two extra raised features) names plateau, plateau2, plateau3', () => {
    const row = /** @type {any} */ ({
      ...phoneModelById('iphone-17-pro'),
      id: 'test-three',
      plateaus: [
        { name: 'plateau', widthMm: 30, lengthMm: 30, heightMm: 3, cornerRadiusMm: 6, xMm: 0, fromTopMm: 4, status: 'estimate', source: 't' },
        { name: 'plateau2', widthMm: 10, lengthMm: 10, heightMm: 2, cornerRadiusMm: 2, xMm: 20, fromTopMm: 6, status: 'estimate', source: 't' },
        { name: 'lensRing', widthMm: 8, lengthMm: 8, heightMm: 1, cornerRadiusMm: 2, xMm: -20, fromTopMm: 6, status: 'estimate', source: 't' },
      ],
    })
    const records = buildPhone({ model: 'test-three', case: 'none' }, [row])
    expect(records.filter((r) => r.name).map((r) => r.name)).toEqual(['body', 'plateau', 'plateau2', 'lensRing'])
  })

  it('reports the display name <Model> in <Case> case, and the bare model for no case', () => {
    expect(phoneDisplayName({ model: 'iphone-17-pro', case: 'slim' })).toBe('iPhone 17 Pro in Slim case')
    expect(phoneDisplayName({ model: 'pixel-10-pro', case: 'none' })).toBe('Pixel 10 Pro')
    expect(phoneDisplayName({})).toBe('Phone')
  })
})

describe('degenerate input is refused by name', () => {
  it('refuses a corner radius larger than half the short side', () => {
    expect(() => phone({ model: 'iphone-17-pro', case: 'slim', cornerRadius: 40 })).toThrow(/cornerRadius/)
  })
  it('refuses a zero-extent plateau', () => {
    expect(() => phone({ model: 'iphone-17-pro', case: 'slim', plateauWidth: 0 })).toThrow(/plateauWidth/)
    expect(() => phone({ model: 'iphone-17-pro', case: 'slim', plateauHeight: 0 })).toThrow(/plateauHeight/)
  })
  it('refuses a plateauClearance that reaches the slab edge', () => {
    expect(() => phone({ model: 'iphone-17-pro', case: 'none', plateauClearance: 5 })).toThrow(/must fit inside/)
  })
  it('refuses an unknown model or case, naming the choices', () => {
    expect(() => phone({ model: 'nokia-3310', case: 'slim' })).toThrow(/model "nokia-3310"/)
    expect(() => phone({ model: 'iphone-17-pro', case: 'gold' })).toThrow(/case "gold"/)
  })
  it('refuses a plateau larger than the slab on a model path too', () => {
    expect(() => phone({ model: 'iphone-17-pro', case: 'none', plateauWidth: 90 })).toThrow(/must fit inside/)
  })
})

describe('a phone with a plateau clearance cuts a larger pocket than it is', () => {
  it('grows the plateau by the clearance on every side', () => {
    const tight = evaluateOp('kit.phone', { model: 'iphone-17-pro', case: 'slim' })
    const loose = evaluateOp('kit.phone', { model: 'iphone-17-pro', case: 'slim', plateauClearance: 1 })
    const plateauOf = (/** @type {any} */ v) => measurements.measureBoundingBox(/** @type {any} */ (v).parts.plateau)
    const [tMin, tMax] = plateauOf(tight)
    const [lMin, lMax] = plateauOf(loose)
    expect(lMax[0] - lMin[0] - (tMax[0] - tMin[0])).toBeCloseTo(2, 3)
    expect(lMax[1] - lMin[1] - (tMax[1] - tMin[1])).toBeCloseTo(2, 3)
  })
})

describe('legacy documents replay unchanged (hand-pinned, not regenerated)', () => {
  // A kit.phone record exactly as the pre-core-057 Library wrote it: eight numerics, no
  // `model`, no `case`.
  const LEGACY = {
    width: 77,
    length: 157,
    thickness: 9,
    cornerRadius: 12,
    plateauWidth: 74,
    plateauLength: 46,
    plateauHeight: 4,
    plateauCornerRadius: 10,
  }

  it('keeps one fused body named phone, at the same bounds', () => {
    const value = evaluateOp('kit.phone', LEGACY)
    expect(/** @type {any} */ (value).names).toEqual(['phone'])
    const [min, max] = boundsOfPhone(LEGACY)
    // 77 x 157 x (9 + 4), centred on the origin — worked out by hand from the old defaults.
    expect(min[0]).toBeCloseTo(-38.5, 3)
    expect(max[0]).toBeCloseTo(38.5, 3)
    expect(min[1]).toBeCloseTo(-78.5, 3)
    expect(max[1]).toBeCloseTo(78.5, 3)
    expect(min[2]).toBeCloseTo(-6.5, 3)
    expect(max[2]).toBeCloseTo(6.5, 3)
  })

  it('keeps the same volume as the old union: slab + plateau, hand-computed', () => {
    const expected = roundedArea(77, 157, 12) * 9 + roundedArea(74, 46, 10) * 4
    const got = volumeOf(evaluateOp('kit.phone', LEGACY))
    expect(Math.abs(got - expected) / expected).toBeLessThan(0.003)
  })

  it('a legacy record gaining only a model keeps its unedited numbers from following the old defaults', () => {
    // Switching an old record's model in the Inspector must actually change the size, so a
    // numeric equal to the old default is "never edited" when the whole legacy set is present.
    const { size } = sizeOf({ ...LEGACY, model: 'iphone-16', case: 'none' })
    expect(size[0]).toBeCloseTo(71.6, 3)
    expect(size[1]).toBeCloseTo(147.6, 3)
  })

  it('an explicit numeric on the model path is kept (the user edited it)', () => {
    const { size } = sizeOf({ model: 'iphone-17-pro', case: 'slim', width: 80 })
    expect(size[0]).toBeCloseTo(80, 3)
  })
})

describe('subtracting the plateau alone', () => {
  const MODEL = { model: 'iphone-17-pro', case: 'techweave' }
  const slabArea = roundedArea(77, 157, 12)
  const plateauArea = roundedArea(74, 46, 10)

  /**
   * Plate 120 x 220 x 10 with its top face at z = 0; the phone's slab underside sits
   * `sink` mm below that face.
   *
   * @param {any} operand
   * @param {number} sink
   * @returns {{ removed: number, plateVolume: number }}
   */
  function cut(operand, sink) {
    const totalHeight = 9 + 4
    const centreZ = totalHeight / 2 - 4 - sink
    const { byId } = evaluate([
      { id: 'plate', op: 'primitive.cuboid', params: { size: [120, 220, 10], center: [0, 0, -5] } },
      { id: 'phone', op: 'kit.phone', params: { ...MODEL, center: [0, 0, centreZ] } },
      { id: 'cut', op: 'boolean.subtract', target: 'plate', operands: [operand], name: 'r' },
    ])
    const plate = volumeOf(byId.get('plate'))
    return { removed: plate - volumeOf(byId.get('cut')), plateVolume: plate }
  }

  it('cuts a pocket of plateauHeight when the slab sits on the plate', () => {
    const { removed } = cut({ id: 'phone', pieces: 'plateau' }, 0)
    expect(Math.abs(removed - plateauArea * 4) / (plateauArea * 4)).toBeLessThan(0.01)
  })

  it('cuts nothing from the plate with the whole group when the slab only rests on it', () => {
    const plateauOnly = cut({ id: 'phone', pieces: 'plateau' }, 0).removed
    const whole = cut('phone', 0).removed
    expect(whole).toBeCloseTo(plateauOnly, 0)
  })

  it('cuts the slab as well when the whole group is subtracted from a sunk phone', () => {
    const plateauOnly = cut({ id: 'phone', pieces: 'plateau' }, 2).removed
    const whole = cut('phone', 2).removed
    // Whole group: 2 mm of slab plus the plateau; plateau alone: just the plateau.
    expect(whole - plateauOnly).toBeGreaterThan(2 * slabArea - plateauArea - 0.01 * 2 * slabArea)
    expect(whole).toBeGreaterThan(plateauOnly)
  })
})
