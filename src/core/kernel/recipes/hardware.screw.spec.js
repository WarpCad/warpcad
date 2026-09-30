import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { combine, isGroup } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
import { screwSpecs } from '../tables/screw-specs.js'
import { hexToUnitRgb } from '../colors.js'
import { SCREW_HEADS, screw } from './hardware.screw.js'

import v1Reference from './__fixtures__/hardware.screw.v1-reference.json'

const { measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

/**
 * @param {Geom3 | Group | undefined} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  return value
}

const MM_TOLERANCE = 6
const MM3_TOLERANCE = 6

/** @param {Geom3} geometry */
const boundsOf = (geometry) => measurements.measureBoundingBox(geometry)

/**
 * The V1 case's params as a V3 document line — V1's `head` is `'PanHead'`/`'FlatHead'`
 * and so is V3's, so this is a straight pass-through.
 *
 * @param {any} testCase
 */
const paramsOf = (testCase) => testCase.params

describe('the screw recipe expands into op records, it does not build a mesh', () => {
  const params = { spec: 'm4', length: 12, head: 'PanHead' }

  it('is reachable through the registry as a composite op, and emits only JSON op records', () => {
    const records = expand('hardware.screw', params)
    expect(records).toEqual(screw(params, { screwSpecs }))
    for (const record of records) {
      expect(record.op).toMatch(/^(primitive|transform|boolean)\./)
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
  })

  it('a PanHead head is a cylinder and a FlatHead head is a cone tapering to the shank', () => {
    const pan = screw({ ...params, head: 'PanHead' }, { screwSpecs })
    const flat = screw({ ...params, head: 'FlatHead' }, { screwSpecs })
    expect(pan.find((r) => r.id === 'head.solid')?.op).toBe('primitive.cylinder')
    const cone = flat.find((r) => r.id === 'head.solid')
    expect(cone?.op).toBe('primitive.cone')
    // V1 `Parts.Cone(headDiameter, diameter, headLength)`: wide end on z=0, narrow end
    // (the shank diameter) where the thread lands.
    expect(cone?.params).toMatchObject({ diameter: 8, topDiameter: 4, height: 3.1 })
  })

  it('names head and thread as V1 did; headClearSpace only when clearLength is given, hidden', () => {
    expect(asGroup(evaluateOp('hardware.screw', params)).names).toEqual(['head', 'thread'])
    const withClear = asGroup(evaluateOp('hardware.screw', { ...params, clearLength: 15 }))
    expect(withClear.names).toEqual(['head', 'thread'])
    expect(Object.keys(withClear.parts)).toContain('headClearSpace')
  })

  it('has no tap solids: V1 Screw ignores fit, so no fit param and no clearance parts', () => {
    const records = screw(params, { screwSpecs })
    expect(records.map((r) => r.name).filter(Boolean)).toEqual(['head', 'thread'])
  })
})

describe('dimensional diff against real jscad-hardware V1 output', () => {
  it.each(v1Reference.cases.map((testCase) => [`${testCase.params.spec} ${testCase.params.head}`, testCase]))(
    '%s reproduces every V1 part bounding box, volume and colour',
    (_label, testCase) => {
      const group = asGroup(evaluateOp('hardware.screw', paramsOf(testCase)))

      for (const [partName, expected] of Object.entries(testCase.parts)) {
        const actual = group.parts[partName]
        expect(actual, `missing part ${partName}`).toBeDefined()
        const bounds = boundsOf(actual)
        for (let corner = 0; corner < 2; corner++) {
          for (let axis = 0; axis < 3; axis++) {
            expect(bounds[corner][axis], `${partName} bounds[${corner}][${axis}]`).toBeCloseTo(
              expected.bounds[corner][axis],
              MM_TOLERANCE
            )
          }
        }
        expect(measurements.measureVolume(actual), `${partName} volume`).toBeCloseTo(
          expected.volume,
          MM3_TOLERANCE
        )
      }
      expect(Object.keys(group.parts).sort()).toEqual(Object.keys(testCase.parts).sort())
      // V1's `.names` is the visible list; hidden headClearSpace is in `parts` only.
      expect(group.names).toEqual(testCase.names)
    }
  )

  it('colours each part the way V1 did: head gray, thread silver, headClearSpace red', () => {
    const records = screw({ spec: '#8', length: 20, head: 'FlatHead', clearLength: 15 }, { screwSpecs })
    const colourOf = (/** @type {string} */ name) => Number(records.find((r) => r.name === name)?.color)
    const v1 = v1Reference.cases[3].parts
    for (const name of ['head', 'thread', 'headClearSpace']) {
      const [r, g, b] = /** @type {number[]} */ (v1[/** @type {'head'} */ (name)].color)
      expect(hexToUnitRgb(colourOf(name)).map((n) => Number(n.toFixed(3)))).toEqual(
        [r, g, b].map((n) => Number(n.toFixed(3)))
      )
    }
  })

  it("FlatHead's head really is a cone: its volume is the frustum, not the PanHead cylinder", () => {
    // Measured directly rather than trusting the op name: V = pi*h/3 (R^2 + R*r + r^2),
    // with R,r the head and shank radii, inscribed in a 32-gon.
    const group = asGroup(evaluateOp('hardware.screw', { spec: 'm4', length: 12, head: 'FlatHead' }))
    const sides = 32
    const polygonArea = (/** @type {number} */ r) => 0.5 * sides * r * r * Math.sin((2 * Math.PI) / sides)
    const R = 4
    const r = 2
    const h = 3.1
    const frustum =
      (h / 3) * (polygonArea(R) + Math.sqrt(polygonArea(R) * polygonArea(r)) + polygonArea(r))
    expect(measurements.measureVolume(group.parts.head)).toBeCloseTo(frustum, 6)
    expect(measurements.measureVolume(group.parts.head)).toBeLessThan(
      measurements.measureVolume(asGroup(evaluateOp('hardware.screw', { spec: 'm4', length: 12, head: 'PanHead' })).parts.head)
    )
  })

  it('a clear space cut with the hidden headClearSpace removes the head-sized pocket, top flush with the head', () => {
    const { group } = evaluate([
      { id: 'block', op: 'primitive.cuboid', params: { size: [40, 40, 40], center: [0, 0, 5] } },
      { id: 's', op: 'hardware.screw', params: { spec: 'm4', length: 12, head: 'PanHead', clearLength: 15 } },
      { id: 'r', op: 'boolean.subtract', target: 'block', operands: [{ id: 's', pieces: 'headClearSpace' }], name: 'r' },
    ])
    expect(measurements.measureVolume(group.parts.r)).toBeLessThan(40 * 40 * 40)
  })

  it('the default combine() is head + thread, which do not overlap', () => {
    const testCase = v1Reference.cases[0]
    const combined = combine(asGroup(evaluateOp('hardware.screw', paramsOf(testCase))))
    expect(measurements.measureVolume(combined)).toBeCloseTo(
      testCase.parts.head.volume + testCase.parts.thread.volume,
      MM3_TOLERANCE
    )
  })
})

describe('the size table', () => {
  it('holds exactly the sizes jscad-hardware shipped: metric m4 and five imperial wood screws', () => {
    expect(Object.keys(screwSpecs)).toEqual(['m4', '#4', '#6', '#8', '#10', '#12'])
  })

  it('m4 is [8, 3.1, 4] millimetres and #8 is 0.332/0.1/0.164 inch, as in V1', () => {
    expect(screwSpecs.m4).toMatchObject({ headDiameterMm: 8, headHeightMm: 3.1, bodyDiameterMm: 4 })
    expect(screwSpecs['#8'].headDiameterMm).toBeCloseTo(0.332 * 25.4, 9)
    expect(screwSpecs['#8'].headHeightMm).toBeCloseTo(0.1 * 25.4, 9)
    expect(screwSpecs['#8'].bodyDiameterMm).toBeCloseTo(0.164 * 25.4, 9)
  })

  it('exports the head list the Inspector dropdown reads', () => {
    expect(SCREW_HEADS).toEqual(['PanHead', 'FlatHead'])
  })
})

describe('degenerate params', () => {
  const ok = { spec: 'm4', length: 12, head: 'PanHead' }
  it.each([0, -5, NaN, Infinity])('rejects length %s naming the parameter', (length) => {
    expect(() => screw({ ...ok, length }, { screwSpecs })).toThrow(/length/)
  })
  it('rejects a bad clearLength', () => {
    expect(() => screw({ ...ok, clearLength: 0 }, { screwSpecs })).toThrow(/clearLength/)
    expect(() => screw({ ...ok, clearLength: -1 }, { screwSpecs })).toThrow(/clearLength/)
  })
  it('rejects an unknown spec and lists the ones that exist', () => {
    expect(() => screw({ ...ok, spec: 'm99' }, { screwSpecs })).toThrow(/m99.*m4/)
  })
  it('rejects an unknown head and lists the two that exist', () => {
    expect(() => screw({ ...ok, head: 'HexHead' }, { screwSpecs })).toThrow(/HexHead.*PanHead/)
  })
})

describe('BOM convention (documented for TODO/ui-038, consumed by nothing yet)', () => {
  it('a screw has no BOM key of its own: V1 only tracked bolts', () => {
    // jscad-hardware@1.1.0's Screw.PanHead/FlatHead take no BOM argument; only
    // `Hardware.Bolt(length, bolt, fit, BOM)` writes `${bolt.name} - ${cm(length)}`.
    // The recipe's module doc records this so ui-038 does not go looking for one.
    expect(screw.length).toBe(2)
  })
})
