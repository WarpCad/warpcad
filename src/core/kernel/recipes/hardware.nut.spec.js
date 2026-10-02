// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { isGroup } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
import { FIT_CLEARANCE_MM } from '../tables/fit-clearances.js'
import { nutSpecs } from '../tables/nut-specs.js'
import { nut } from './hardware.nut.js'

import v1Reference from './__fixtures__/hardware.nut.v1-reference.json'

const { measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

const tables = { nutSpecs, FIT_CLEARANCE_MM }

/**
 * Narrow an evaluated value to bare geometry, failing the test if it is a Group.
 *
 * @param {Geom3 | Group | undefined} value
 * @returns {Geom3}
 */
function asGeometry(value) {
  if (value === undefined || isGroup(value)) throw new Error('expected bare geometry')
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

describe('the nut recipe expands into a single op record, it does not build a mesh', () => {
  it('emits one primitive.hexagon record, named "nut"', () => {
    const records = nut({ spec: 'm4', fit: 'loose' }, tables)
    expect(records).toEqual([
      {
        id: 'nut',
        op: 'primitive.hexagon',
        params: { diameter: 8.1 + FIT_CLEARANCE_MM.loose, height: 3.2 },
        name: 'nut',
      },
    ])
  })

  it('is reachable through the registry as a composite op', () => {
    expect(expand('hardware.nut', { spec: 'm4', fit: 'loose' })).toEqual(
      nut({ spec: 'm4', fit: 'loose' }, tables)
    )
  })

  it('passes params.center straight through to the primitive when given', () => {
    const records = nut({ spec: 'm4', fit: 'loose', center: [10, 20, 0] }, tables)
    expect(records[0]?.params?.center).toEqual([10, 20, 0])
  })

  it('omits center entirely when not given, rather than defaulting it here', () => {
    const records = nut({ spec: 'm4', fit: 'loose' }, tables)
    expect(records[0]?.params).not.toHaveProperty('center')
  })

  it('emits only an op the registry already knows, and only JSON values', () => {
    const records = nut({ spec: 'm4', fit: 'loose' }, tables)
    for (const record of records) {
      expect(record.op).toBe('primitive.hexagon')
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
  })

  it('builds one composite op straight to bare geometry via combine', () => {
    const group = evaluateOp('hardware.nut', { spec: 'm4', fit: 'loose' })
    expect(isGroup(group)).toBe(true)
    expect(/** @type {Group} */ (group).names).toEqual(['nut'])
  })
})

describe('dimensional diff against real jscad-hardware V1 output', () => {
  it.each(v1Reference.cases.map((testCase) => [`${testCase.params.spec} ${testCase.params.fit}`, testCase]))(
    '%s reproduces the V1 nut size and volume',
    (_label, testCase) => {
      const { spec, fit } = testCase.params
      const { byId } = evaluate([{ id: 'n', op: 'hardware.nut', params: { spec, fit } }])
      const group = /** @type {Group} */ (byId.get('n'))
      const geometry = asGeometry(group.parts.nut)

      const actualSize = sizeOfBounds(boundsOf(geometry))
      const expectedSize = sizeOfBounds(testCase.bounds)
      for (let axis = 0; axis < 3; axis++) {
        expect(actualSize[axis], `size[${axis}]`).toBeCloseTo(expectedSize[axis], MM_TOLERANCE)
      }
      expect(measurements.measureVolume(geometry)).toBeCloseTo(testCase.volume, MM3_TOLERANCE)
    }
  )
})

describe('degenerate params', () => {
  it('rejects an unknown spec key and lists the ones that exist', () => {
    /** @type {Error | undefined} */
    let thrown
    try {
      nut({ spec: 'm5', fit: 'loose' }, tables)
    } catch (error) {
      thrown = /** @type {Error} */ (error)
    }
    expect(thrown).toBeDefined()
    expect(thrown?.message).toMatch(/m5/)
    expect(thrown?.message).toMatch(/m4/)
  })

  it('rejects a missing fit, which V1 has no default for either', () => {
    expect(() => nut({ spec: 'm4' }, tables)).toThrow(/fit is required/)
    expect(() => evaluateOp('hardware.nut', { spec: 'm4' })).toThrow(/fit is required/)
  })

  it('rejects an unknown fit, which would otherwise silently produce NaN diameter', () => {
    expect(() => nut({ spec: 'm4', fit: 'snug' }, tables)).toThrow(/snug/)
  })
})

describe('nut spec table', () => {
  it('carries every field the recipe or a future recipe might read, in millimetres', () => {
    for (const [name, entry] of Object.entries(nutSpecs)) {
      expect(entry.acrossFlatsMm, name).toBeGreaterThan(0)
      expect(entry.acrossCornersMm, name).toBeGreaterThan(entry.acrossFlatsMm)
      expect(entry.heightMm, name).toBeGreaterThan(0)
      expect(entry.threadDiameterMm, name).toBeGreaterThan(0)
    }
  })

  it('does not pretend to have sizes jscad-hardware never shipped', () => {
    // MetricNuts and ImperialNuts each ever held exactly one entry — see
    // tables/nut-specs.js's own module doc for the citation.
    expect(Object.keys(nutSpecs).sort()).toEqual(['1/4 hex', 'm4'])
  })

  it('carries the shared fit-clearance table with all three V1 fit classes', () => {
    expect(Object.keys(FIT_CLEARANCE_MM).sort()).toEqual(['close', 'loose', 'tap'])
    // V1: util.inch(-0.049) — the only negative delta, shrinking (not growing) a tap fit.
    expect(FIT_CLEARANCE_MM.tap).toBeLessThan(0)
    expect(FIT_CLEARANCE_MM.close).toBeGreaterThan(0)
    expect(FIT_CLEARANCE_MM.loose).toBeGreaterThan(FIT_CLEARANCE_MM.close)
  })
})

describe('part colour: V1 never coloured a nut (TODO/core-026)', () => {
  // V1, `jscad-hardware.jscad:81-83` (re-read for core-026):
  //   Nut: function Nut(nut, fit) {
  //     return Parts.Hexagon(nut[1] + Hardware.Clearances[fit], nut[2]);
  //   }
  // No `.color(...)` call, so nothing was dropped here. The fixture's `color: null` is
  // measured, not assumed: V1's real `.color()` was loaded and the nut came back bare.

  it.each(v1Reference.cases.map((testCase) => [`${testCase.params.spec} ${testCase.params.fit}`, testCase]))(
    '%s: V1 left no colour and the record carries none',
    (_label, testCase) => {
      expect(testCase.color).toBeNull()
      const { spec, fit } = testCase.params
      for (const record of nut({ spec, fit }, tables)) {
        expect(record).not.toHaveProperty('color')
        expect(record).not.toHaveProperty('colorAlpha')
      }
    }
  )
})
