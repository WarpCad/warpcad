import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { calcSnap, combine, isGroup } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
import { boltSpecs, FIT_CLASSES } from '../tables/bolt-specs.js'
import { bolt } from './hardware.bolt.js'

import expansionFixture from './__fixtures__/hardware.bolt.m10-hex-20-loose.json'
import v1Reference from './__fixtures__/hardware.bolt.v1-reference.json'

const { measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

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

/**
 * Narrow an evaluated value to bare geometry.
 *
 * @param {Geom3 | Group | undefined} value
 * @returns {Geom3}
 */
function asGeometry(value) {
  if (value === undefined || isGroup(value)) throw new Error('expected bare geometry')
  return value
}

/**
 * Millimetre tolerance for the V1↔V3 diff. The reference fixture stores V1's own
 * numbers rounded to 1e-9, and both kernels build the same prism from the same
 * trigonometry, so anything looser than this would be hiding a real disagreement.
 */
const MM_TOLERANCE = 6
/** Cubic-millimetre volumes are ~10^3, so 6 decimal places is ~1e-9 relative. */
const MM3_TOLERANCE = 6

/** @param {Geom3} geometry */
const boundsOf = (geometry) => measurements.measureBoundingBox(geometry)

describe('the bolt recipe expands into op records, it does not build a mesh', () => {
  it('matches the checked-in expansion fixture exactly', () => {
    expect(bolt(expansionFixture.params, { boltSpecs })).toEqual(expansionFixture.records)
  })

  it('is reachable through the registry as a composite op', () => {
    expect(expand('hardware.bolt', expansionFixture.params)).toEqual(expansionFixture.records)
  })

  it('emits only ops the registry already knows, and only JSON values', () => {
    const records = bolt(expansionFixture.params, { boltSpecs })
    for (const record of records) {
      expect(record.op).toMatch(/^(primitive|transform|boolean)\./)
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
  })

  it('names the same three visible parts jscad-utils Group did', () => {
    const group = asGroup(evaluateOp('hardware.bolt', expansionFixture.params))
    expect(group.names).toEqual(v1Reference.cases[0].names)
    expect(Object.keys(group.parts).sort()).toEqual(
      Object.keys(v1Reference.cases[0].parts).sort()
    )
  })

  it('bakes the same z offset group.calcSnap would compute for the thread', () => {
    // §4: `group.snap` never appears as a line in a recipe's expansion — its *result*
    // does, as a resolved `transform.translate` vector. This asserts the recipe's
    // analytic shortcut agrees with the general bounding-box path.
    const records = bolt(expansionFixture.params, { boltSpecs })
    const { byId } = evaluate(records)
    const head = asGeometry(byId.get('head'))
    const threadSolid = asGeometry(byId.get('thread.solid'))
    const threadRecord = records.find((record) => record.id === 'thread')
    expect(threadRecord).toBeDefined()
    const emitted = threadRecord?.params?.vector
    const computed = calcSnap(threadSolid, head, 'z', 'outside-')
    expect(emitted[2]).toBeCloseTo(computed[2], MM_TOLERANCE)
  })
})

describe('dimensional diff against real jscad-hardware V1 output', () => {
  it.each(v1Reference.cases.map((testCase) => [testCase.params.spec, testCase]))(
    '%s reproduces every V1 part bounding box and volume',
    (_spec, testCase) => {
      const { spec, length, fit, segments } = testCase.params
      const group = asGroup(evaluateOp('hardware.bolt', { spec, length, fit, segments }))

      for (const [partName, expected] of Object.entries(testCase.parts)) {
        const actual = group.parts[partName]
        expect(actual, `missing part ${partName}`).toBeDefined()
        const bounds = boundsOf(actual)
        for (let corner = 0; corner < 2; corner++) {
          for (let axis = 0; axis < 3; axis++) {
            expect(
              bounds[corner][axis],
              `${partName} bounds[${corner}][${axis}]`
            ).toBeCloseTo(expected.bounds[corner][axis], MM_TOLERANCE)
          }
        }
        expect(measurements.measureVolume(actual), `${partName} volume`).toBeCloseTo(
          expected.volume,
          MM3_TOLERANCE
        )
      }
    }
  )

  it.each(v1Reference.cases.map((testCase) => [testCase.params.spec, testCase]))(
    '%s reproduces the V1 default combine()',
    (_spec, testCase) => {
      const { spec, length, fit, segments } = testCase.params
      const combined = combine(
        asGroup(evaluateOp('hardware.bolt', { spec, length, fit, segments }))
      )
      const bounds = boundsOf(combined)
      for (let corner = 0; corner < 2; corner++) {
        for (let axis = 0; axis < 3; axis++) {
          expect(bounds[corner][axis]).toBeCloseTo(
            testCase.combined.bounds[corner][axis],
            MM_TOLERANCE
          )
        }
      }
      expect(measurements.measureVolume(combined)).toBeCloseTo(
        testCase.combined.volume,
        MM3_TOLERANCE
      )
    }
  )
})

describe('degenerate params', () => {
  it('rejects a zero-length bolt with a message naming the parameter', () => {
    expect(() => bolt({ spec: 'm10 hex', length: 0, fit: 'loose' }, { boltSpecs })).toThrow(
      /length/
    )
    expect(() => evaluateOp('hardware.bolt', { spec: 'm10 hex', length: 0, fit: 'loose' })).toThrow(
      /length/
    )
  })

  it('rejects a negative length', () => {
    expect(() => bolt({ spec: 'm10 hex', length: -5, fit: 'loose' }, { boltSpecs })).toThrow(
      /length/
    )
  })

  it('rejects an unknown spec key and lists the ones that exist', () => {
    /** @type {Error | undefined} */
    let thrown
    try {
      bolt({ spec: 'm2.5 socket', length: 20, fit: 'loose' }, { boltSpecs })
    } catch (error) {
      thrown = /** @type {Error} */ (error)
    }
    expect(thrown).toBeDefined()
    expect(thrown?.message).toMatch(/m2\.5 socket/)
    expect(thrown?.message).toMatch(/m10 hex/)
  })

  it('rejects an unknown fit, which would otherwise silently produce NaN clearance', () => {
    expect(() => bolt({ spec: 'm10 hex', length: 20, fit: 'snug' }, { boltSpecs })).toThrow(/snug/)
  })

  it('defaults fit to loose, like V1 Hardware.Bolt', () => {
    expect(bolt({ spec: 'm10 hex', length: 20 }, { boltSpecs })).toEqual(
      bolt({ spec: 'm10 hex', length: 20, fit: 'loose' }, { boltSpecs })
    )
  })
})

describe('bolt spec table', () => {
  it('carries every V1 field the recipe reads, in millimetres', () => {
    for (const [name, entry] of Object.entries(boltSpecs)) {
      expect(entry.type, name).toMatch(/^(HexHeadScrew|PanHeadScrew)$/)
      expect(entry.bodyDiameterMm, name).toBeGreaterThan(0)
      expect(entry.headDiameterMm, name).toBeGreaterThan(entry.bodyDiameterMm)
      expect(entry.headHeightMm, name).toBeGreaterThan(0)
      for (const fit of FIT_CLASSES) {
        expect(typeof entry.fitDiameterMm[fit], `${name}.${fit}`).toBe('number')
      }
    }
  })

  it('does not pretend to have specs jscad-hardware never shipped', () => {
    // `Initial design.md` uses "m2.5 socket" as its running example; the real V1
    // MetricBolts table only ever had 'm10 hex' and 'm12 hex'.
    expect(boltSpecs['m2.5 socket']).toBeUndefined()
    expect(Object.keys(boltSpecs)).toContain('m10 hex')
  })
})
