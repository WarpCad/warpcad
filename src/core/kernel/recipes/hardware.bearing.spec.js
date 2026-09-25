import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { isGroup } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { bearingSpecs } from '../tables/bearing-specs.js'
import { bearing } from './hardware.bearing.js'

const { measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

const tables = { bearingSpecs }

/**
 * Narrow an evaluated value to a Group, failing the test if it is bare geometry.
 *
 * @param {Geom3 | Group | undefined} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  return value
}

describe('the bearing recipe expands into one op record, it does not build a mesh', () => {
  it.each(Object.keys(bearingSpecs).map((spec) => [spec]))(
    '%s emits exactly one primitive.tube record matching the spec table',
    (spec) => {
      const entry = bearingSpecs[spec]
      const records = bearing({ spec }, tables)
      expect(records).toEqual([
        {
          id: 'bearing',
          op: 'primitive.tube',
          params: {
            diameter: entry.odMm,
            innerDiameter: entry.boreMm,
            height: entry.widthMm,
          },
          name: 'bearing',
        },
      ])
    }
  )

  it('is reachable through the registry as a composite op', () => {
    expect(expand('hardware.bearing', { spec: '608' })).toEqual(bearing({ spec: '608' }, tables))
  })

  it('passes params.center straight through when given', () => {
    const records = bearing({ spec: '608', center: [10, 20, 0] }, tables)
    expect(records[0]?.params?.center).toEqual([10, 20, 0])
  })

  it('omits center entirely when not given, rather than defaulting it here', () => {
    const records = bearing({ spec: '608' }, tables)
    expect(records[0]?.params).not.toHaveProperty('center')
  })

  it('passes params.segments straight through when given', () => {
    const records = bearing({ spec: '608', segments: 64 }, tables)
    expect(records[0]?.params?.segments).toBe(64)
  })

  it('omits segments entirely when not given, rather than defaulting it here', () => {
    const records = bearing({ spec: '608' }, tables)
    expect(records[0]?.params).not.toHaveProperty('segments')
  })

  it('emits only an op the registry already knows, and only JSON values', () => {
    const records = bearing({ spec: '608' }, tables)
    for (const record of records) {
      expect(record.op).toBe('primitive.tube')
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
  })

  it('builds one composite op straight to a group with "bearing" visible', () => {
    const group = asGroup(evaluateOp('hardware.bearing', { spec: '608' }))
    expect(group.names).toEqual(['bearing'])
    expect(Object.keys(group.parts).sort()).toEqual(['bearing'])
  })
})

describe('geometric sanity check — no V1 fixture exists, so this reproduces core-003’s own spike instead', () => {
  it('608 volume matches the ideal tube formula and lands close to the spike’s recorded 2305.363mm³ at 64 segments', () => {
    // docs/decisions/geometry-kernel.md, Finding 2: the spike measured
    // subtract(cylinder(OD), cylinder(ID)) for a 608 (bore 8 / OD 22 / width 7) at 64
    // segments as 2305.363mm³ against an ideal 2309.071mm³. Passing `segments: 64`
    // here reproduces that exact tessellation assumption so the comparison is
    // meaningful — the registry's own default (32 segments) would not match it.
    const entry = bearingSpecs['608']
    const idealVolumeMm3 =
      Math.PI * ((entry.odMm / 2) ** 2 - (entry.boreMm / 2) ** 2) * entry.widthMm

    const group = asGroup(evaluateOp('hardware.bearing', { spec: '608', segments: 64 }))
    const bearingGeom = group.parts.bearing
    expect(bearingGeom, 'missing part bearing').toBeDefined()
    const actualVolumeMm3 = measurements.measureVolume(/** @type {Geom3} */ (bearingGeom))

    // Ideal (continuous) formula — 735π ≈ 2309.071mm³.
    expect(idealVolumeMm3).toBeCloseTo(2309.071, 3)
    // Tessellated volume is always slightly under the ideal for a polygonal
    // approximation of a circle; 1mm3 absolute tolerance around the spike's own
    // recorded figure.
    expect(actualVolumeMm3).toBeCloseTo(2305.363, 0)
    expect(actualVolumeMm3).toBeLessThan(idealVolumeMm3)
    expect(idealVolumeMm3 - actualVolumeMm3).toBeLessThan(10)
  })
})

describe('degenerate params', () => {
  it('rejects an unknown spec key and lists the ones that exist', () => {
    /** @type {Error | undefined} */
    let thrown
    try {
      bearing({ spec: '999' }, tables)
    } catch (error) {
      thrown = /** @type {Error} */ (error)
    }
    expect(thrown).toBeDefined()
    expect(thrown?.message).toMatch(/999/)
    expect(thrown?.message).toMatch(/608/)
  })
})

describe('bearing spec table', () => {
  it('carries every field the recipe reads, in millimetres, for every entry', () => {
    for (const [name, entry] of Object.entries(bearingSpecs)) {
      expect(entry.boreMm, name).toBeGreaterThan(0)
      expect(entry.odMm, name).toBeGreaterThan(entry.boreMm)
      expect(entry.widthMm, name).toBeGreaterThan(0)
    }
  })

  it('carries exactly the 60xx/62xx/63xx series this task specifies, 16 entries total', () => {
    expect(Object.keys(bearingSpecs).sort()).toEqual(
      [
        '608',
        '6000',
        '6001',
        '6002',
        '6003',
        '6004',
        '6200',
        '6201',
        '6202',
        '6203',
        '6204',
        '6300',
        '6301',
        '6302',
        '6303',
        '6304',
      ].sort()
    )
    expect(Object.keys(bearingSpecs)).toHaveLength(16)
  })

  // Table-conformance check, not a V1 diff — see tables/bearing-specs.js's module doc
  // for why no V1 fixture exists to diff against instead.
  it('matches the published DIN 625 / ISO 15 values verbatim for every entry', () => {
    const din625 = {
      '608': { boreMm: 8, odMm: 22, widthMm: 7 },
      '6000': { boreMm: 10, odMm: 26, widthMm: 8 },
      '6001': { boreMm: 12, odMm: 28, widthMm: 8 },
      '6002': { boreMm: 15, odMm: 32, widthMm: 9 },
      '6003': { boreMm: 17, odMm: 35, widthMm: 10 },
      '6004': { boreMm: 20, odMm: 42, widthMm: 12 },
      '6200': { boreMm: 10, odMm: 30, widthMm: 9 },
      '6201': { boreMm: 12, odMm: 32, widthMm: 10 },
      '6202': { boreMm: 15, odMm: 35, widthMm: 11 },
      '6203': { boreMm: 17, odMm: 40, widthMm: 12 },
      '6204': { boreMm: 20, odMm: 47, widthMm: 14 },
      '6300': { boreMm: 10, odMm: 35, widthMm: 11 },
      '6301': { boreMm: 12, odMm: 37, widthMm: 12 },
      '6302': { boreMm: 15, odMm: 42, widthMm: 13 },
      '6303': { boreMm: 17, odMm: 47, widthMm: 14 },
      '6304': { boreMm: 20, odMm: 52, widthMm: 15 },
    }
    for (const [size, expected] of Object.entries(din625)) {
      expect(bearingSpecs[size], size).toEqual(expected)
    }
  })
})

describe('part colour: there is no V1 Bearing to take one from (TODO/core-026)', () => {
  // Re-checked for core-026: `jscad-hardware@1.1.0` has no `Bearing` factory at all (its
  // only factories are `Bolt`, `Washer` and `Nut`; this recipe's module doc), so no
  // `.color(...)` call was dropped. Inventing one would be a new decision, not a port.
  it('emits no colour on any record — there is no V1 .color() here to port', () => {
    for (const record of expand('hardware.bearing', { spec: '608' })) {
      expect(record).not.toHaveProperty('color')
      expect(record).not.toHaveProperty('colorAlpha')
    }
  })
})
