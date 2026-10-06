// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { isGroup } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
import { FIT_CLEARANCE_MM } from '../tables/fit-clearances.js'
import { MetricWashers, washerSpecs } from '../tables/washer-specs.js'
import { hexToUnitRgb } from '../colors.js'
import { washer } from './hardware.washer.js'

import v1Reference from './__fixtures__/hardware.washer.v1-reference.json'

const { measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

const tables = { washerSpecs, FIT_CLEARANCE_MM }

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

/** Millimetre tolerance for the V1↔V3 diff — see `hardware.bolt.spec.js` for why. */
const MM_TOLERANCE = 6
/** Cubic-millimetre volumes are ~10^2-10^3, so 6 decimal places is ~1e-9 relative. */
const MM3_TOLERANCE = 6

/** @param {Geom3} geometry */
const boundsOf = (geometry) => measurements.measureBoundingBox(geometry)

/**
 * `[dx, dy, dz]` of a `[min, max]` bounds pair, in millimetres.
 *
 * @param {readonly (readonly number[])[]} bounds
 * @returns {[number, number, number]}
 */
function sizeOfBounds(bounds) {
  const [min, max] = bounds
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

describe('the washer recipe expands into op records, it does not build a mesh', () => {
  it('emits one primitive.tube record, named "washer", when fit is omitted', () => {
    const records = washer({ spec: '1/4' }, tables)
    expect(records).toEqual([
      {
        id: 'washer',
        op: 'primitive.tube',
        params: {
          diameter: washerSpecs['1/4'].odMm,
          innerDiameter: washerSpecs['1/4'].idMm,
          height: washerSpecs['1/4'].thicknessMm,
        },
        name: 'washer',
        color: 0x808080,
      },
    ])
  })

  it('emits a second primitive.cylinder record, named "clearance" and hidden, when fit is given', () => {
    const records = washer({ spec: '1/4', fit: 'loose' }, tables)
    expect(records).toEqual([
      {
        id: 'washer',
        op: 'primitive.tube',
        params: {
          diameter: washerSpecs['1/4'].odMm,
          innerDiameter: washerSpecs['1/4'].idMm,
          height: washerSpecs['1/4'].thicknessMm,
        },
        name: 'washer',
        color: 0x808080,
      },
      {
        id: 'clearance',
        op: 'primitive.cylinder',
        params: {
          diameter: washerSpecs['1/4'].odMm + FIT_CLEARANCE_MM.loose,
          height: washerSpecs['1/4'].thicknessMm,
        },
        name: 'clearance',
        hidden: true,
        color: 0xff0000,
      },
    ])
  })

  it('is reachable through the registry as a composite op', () => {
    expect(expand('hardware.washer', { spec: '1/4', fit: 'loose' })).toEqual(
      washer({ spec: '1/4', fit: 'loose' }, tables)
    )
  })

  it('passes params.center straight through to both primitives when given', () => {
    const records = washer({ spec: '1/4', fit: 'loose', center: [10, 20, 0] }, tables)
    expect(records[0]?.params?.center).toEqual([10, 20, 0])
    expect(records[1]?.params?.center).toEqual([10, 20, 0])
  })

  it('omits center entirely when not given, rather than defaulting it here', () => {
    const records = washer({ spec: '1/4', fit: 'loose' }, tables)
    for (const record of records) {
      expect(record.params).not.toHaveProperty('center')
    }
  })

  it('emits only ops the registry already knows, and only JSON values', () => {
    const records = washer({ spec: '1/4', fit: 'loose' }, tables)
    for (const record of records) {
      expect(record.op).toMatch(/^primitive\.(tube|cylinder)$/)
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
  })

  it('builds one composite op straight to a group with only "washer" visible when fit is omitted', () => {
    const group = asGroup(evaluateOp('hardware.washer', { spec: '1/4' }))
    expect(group.names).toEqual(['washer'])
    expect(Object.keys(group.parts).sort()).toEqual(['washer'])
  })

  it('builds a group with "washer" visible and "clearance" hidden-but-addressable when fit is given', () => {
    const group = asGroup(evaluateOp('hardware.washer', { spec: '1/4', fit: 'loose' }))
    expect(group.names).toEqual(['washer'])
    expect(Object.keys(group.parts).sort()).toEqual(['clearance', 'washer'])
  })
})

describe('dimensional diff against real jscad-hardware V1 output (imperial sizes only)', () => {
  it.each(
    v1Reference.cases.map((testCase) => [
      `${testCase.params.spec} fit=${testCase.params.fit ?? 'omitted'}`,
      testCase,
    ])
  )('%s reproduces every V1 part size and volume', (_label, testCase) => {
    const { spec } = testCase.params
    const fit = testCase.params.fit ?? undefined
    const group = asGroup(evaluateOp('hardware.washer', { spec, fit }))

    expect(group.names).toEqual(['washer'])
    expect(Object.keys(group.parts).sort()).toEqual(Object.keys(testCase.parts).sort())

    for (const [partName, expected] of Object.entries(testCase.parts)) {
      const actual = group.parts[partName]
      expect(actual, `missing part ${partName}`).toBeDefined()
      const actualSize = sizeOfBounds(boundsOf(actual))
      const expectedSize = sizeOfBounds(expected.bounds)
      for (let axis = 0; axis < 3; axis++) {
        expect(actualSize[axis], `${partName} size[${axis}]`).toBeCloseTo(
          expectedSize[axis],
          MM_TOLERANCE
        )
      }
      expect(measurements.measureVolume(actual), `${partName} volume`).toBeCloseTo(
        expected.volume,
        MM3_TOLERANCE
      )
    }
  })
})

describe('degenerate params', () => {
  it('rejects an unknown spec key and lists the ones that exist', () => {
    /** @type {Error | undefined} */
    let thrown
    try {
      washer({ spec: 'm7', fit: 'loose' }, tables)
    } catch (error) {
      thrown = /** @type {Error} */ (error)
    }
    expect(thrown).toBeDefined()
    expect(thrown?.message).toMatch(/m7/)
    expect(thrown?.message).toMatch(/1\/4/)
  })

  it('rejects an unknown fit key when fit is given, rather than producing NaN', () => {
    expect(() => washer({ spec: '1/4', fit: 'snug' }, tables)).toThrow(/snug/)
    expect(() => evaluateOp('hardware.washer', { spec: '1/4', fit: 'snug' })).toThrow(/snug/)
  })

  it('does not require fit at all — an absent fit is a valid, one-part washer', () => {
    expect(() => washer({ spec: '1/4' }, tables)).not.toThrow()
  })
})

describe('washer spec table', () => {
  it('carries every field the recipe reads, in millimetres, for every entry', () => {
    for (const [name, entry] of Object.entries(washerSpecs)) {
      expect(entry.idMm, name).toBeGreaterThan(0)
      expect(entry.odMm, name).toBeGreaterThan(entry.idMm)
      expect(entry.thicknessMm, name).toBeGreaterThan(0)
    }
  })

  it('carries exactly the ImperialWashers and MetricWashers entries jscad-hardware/ISO 7089 define', () => {
    expect(Object.keys(washerSpecs).sort()).toEqual(
      [
        '1/4', '1/4 fender', '5/16',
        'm1.6', 'm2', 'm2.5', 'm3', 'm4', 'm5', 'm6', 'm8', 'm10', 'm12', 'm14', 'm16', 'm20',
      ].sort()
    )
  })

  // Table-conformance check, not a V1 diff — see tables/washer-specs.js's module doc
  // for why the metric entries have no V1 fixture to diff against instead.
  it('matches the published ISO 7089 values verbatim for every metric size', () => {
    const iso7089 = {
      m3: { idMm: 3.2, odMm: 7, thicknessMm: 0.5 },
      m4: { idMm: 4.3, odMm: 9, thicknessMm: 0.8 },
      m5: { idMm: 5.3, odMm: 10, thicknessMm: 1.0 },
      m6: { idMm: 6.4, odMm: 12, thicknessMm: 1.6 },
      m8: { idMm: 8.4, odMm: 16, thicknessMm: 1.6 },
      m10: { idMm: 10.5, odMm: 20, thicknessMm: 2.0 },
      m12: { idMm: 13, odMm: 24, thicknessMm: 2.5 },
    }
    for (const [size, expected] of Object.entries(iso7089)) {
      expect(MetricWashers[size], size).toEqual(expected)
    }
  })
})

describe('metric sizes exercised through the recipe itself (no V1 fixture; shape parity check)', () => {
  it('m6 with fit omitted produces the same expansion shape as the imperial case', () => {
    const records = washer({ spec: 'm6' }, tables)
    expect(records).toEqual([
      {
        id: 'washer',
        op: 'primitive.tube',
        params: {
          diameter: MetricWashers.m6.odMm,
          innerDiameter: MetricWashers.m6.idMm,
          height: MetricWashers.m6.thicknessMm,
        },
        name: 'washer',
        color: 0x808080,
      },
    ])
    const group = asGroup(evaluateOp('hardware.washer', { spec: 'm6' }))
    expect(group.names).toEqual(['washer'])
  })

  it('m6 with fit: loose produces the same expansion shape as the imperial case', () => {
    const records = washer({ spec: 'm6', fit: 'loose' }, tables)
    expect(records).toEqual([
      {
        id: 'washer',
        op: 'primitive.tube',
        params: {
          diameter: MetricWashers.m6.odMm,
          innerDiameter: MetricWashers.m6.idMm,
          height: MetricWashers.m6.thicknessMm,
        },
        name: 'washer',
        color: 0x808080,
      },
      {
        id: 'clearance',
        op: 'primitive.cylinder',
        params: {
          diameter: MetricWashers.m6.odMm + FIT_CLEARANCE_MM.loose,
          height: MetricWashers.m6.thicknessMm,
        },
        name: 'clearance',
        hidden: true,
        color: 0xff0000,
      },
    ])
    const group = asGroup(evaluateOp('hardware.washer', { spec: 'm6', fit: 'loose' }))
    expect(group.names).toEqual(['washer'])
    expect(Object.keys(group.parts).sort()).toEqual(['clearance', 'washer'])
  })
})

describe('part colours, diffed against measured V1 output (TODO/core-026)', () => {
  // V1, `jscad-hardware.jscad:57-76` (re-read for core-026):
  //   w.add(Parts.Tube(washer.od, washer.id, washer.thickness).color('gray'), 'washer');
  //   w.add(Parts.Cylinder(washer.od + Hardware.Clearances[fit], washer.thickness).color('red'),
  //     'clearance');
  // The fixture's `color` is what V1's real `.color()` left on every polygon, as
  // `[r, g, b, a]` in 0-1; `hexToUnitRgb` is the same `/ 255` V1 did, so exact equality.

  it('emits gray on washer and red on the hidden clearance', () => {
    const records = washer({ spec: '1/4', fit: 'loose' }, tables)
    expect(records.find((record) => record.name === 'washer')).toMatchObject({ color: 0x808080 })
    expect(records.find((record) => record.name === 'clearance')).toMatchObject({
      color: 0xff0000,
      hidden: true,
    })
    for (const record of records) expect(record).not.toHaveProperty('colorAlpha')
  })

  it.each(v1Reference.cases.map((testCase) => [String(testCase.params.fit), testCase]))(
    'fit %s: every record colour equals the colour V1 left on that part',
    (_fit, testCase) => {
      const { spec, fit } = testCase.params
      const records = washer({ spec, ...(fit === null ? {} : { fit }) }, tables)
      for (const [partName, expected] of Object.entries(testCase.parts)) {
        const record = records.find((candidate) => candidate.name === partName)
        expect(record?.color, partName).toBeTypeOf('number')
        const actual = [...hexToUnitRgb(/** @type {number} */ (record?.color)), record?.colorAlpha ?? 1]
        expect(actual, partName).toEqual(expected.color)
      }
    }
  )

  it('the evaluated group carries the same colours', () => {
    const group = asGroup(evaluateOp('hardware.washer', { spec: '1/4', fit: 'loose' }))
    expect(group.colors).toEqual({
      washer: { color: 0x808080, alpha: 1 },
      clearance: { color: 0xff0000, alpha: 1 },
    })
  })
})
