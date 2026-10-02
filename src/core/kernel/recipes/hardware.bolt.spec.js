// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { calcSnap, combine, isGroup } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
import { boltSpecs, FIT_CLASSES } from '../tables/bolt-specs.js'
import { hexToUnitRgb } from '../colors.js'
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

  it('names the same parts jscad-utils Group did, minus `tap` (TODO/render-004 divergence)', () => {
    // V1's own `Hardware.Bolt` leaves `tap` visible (`hidden: false`), which is what
    // `v1Reference.cases[0].names` records — see this file's colour describe block's
    // header comment for the re-read source line. TODO/render-004 (user decision,
    // 2026-09-26) hides `tap` in V3 instead, the same explicit override
    // `hardware.washer.js`'s module doc applies to its own `clearance` part, so the
    // comparison here is deliberately *not* a straight `toEqual` against the V1
    // fixture's `names` — that would either lie about V1 or fail forever.
    const group = asGroup(evaluateOp('hardware.bolt', expansionFixture.params))
    expect(v1Reference.cases[0].names).toEqual(['head', 'thread', 'tap']) // V1 truth, unchanged
    expect(group.names).toEqual(['head', 'thread']) // V3's deliberate divergence
    expect(Object.keys(group.parts).sort()).toEqual(
      Object.keys(v1Reference.cases[0].parts).sort()
    )
  })

  it('marks the `tap` record hidden, like `hardware.washer`\'s `clearance` (TODO/render-004)', () => {
    const records = bolt(expansionFixture.params, { boltSpecs })
    const tapRecord = records.find((record) => record.name === 'tap')
    expect(tapRecord).toBeDefined()
    expect(tapRecord?.hidden).toBe(true)
    // the tap-* children were already hidden before this task (TODO/core-026)
    for (const name of ['tap-head', 'tap-thread', 'tap-headClearSpace']) {
      expect(records.find((record) => record.name === name)?.hidden).toBe(true)
    }
  })

  it("the evaluated group's visible names exclude tap, but tap stays addressable as a boolean operand", () => {
    const group = asGroup(evaluateOp('hardware.bolt', expansionFixture.params))
    expect(group.names).toEqual(['head', 'thread'])
    expect(Object.keys(group.parts)).toContain('tap')

    // A subtract using the hidden `tap` piece as the operand still works, and still
    // cuts the clearance envelope, not the visible head/thread metal — exactly what
    // ACCEPTANCE.md scenario 5 depends on, the same as washer's hidden `clearance`.
    const block = { id: 'block', op: 'primitive.cuboid', params: { size: [40, 40, 30], center: [0, 0, 15] } }
    const { group: cutGroup } = evaluate([
      block,
      { id: 'bolt1', op: 'hardware.bolt', params: expansionFixture.params },
      {
        id: 'r',
        op: 'boolean.subtract',
        target: 'block',
        operands: [{ id: 'bolt1', pieces: 'tap' }],
        name: 'r',
      },
    ])
    const cutVolume = measurements.measureVolume(cutGroup.parts.r)
    const blockVolume = 40 * 40 * 30
    expect(cutVolume).toBeLessThan(blockVolume)
    expect(cutVolume).toBeGreaterThan(0)
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
    "%s: V3's default combine() is head+thread only, diverging from V1's tap-inclusive one (TODO/render-004)",
    (_spec, testCase) => {
      // V1's own `Hardware.Bolt` leaves `tap` visible, so `testCase.combined` (measured
      // from V1's real `.combine()`, above in `describe('dimensional diff...')`'s first
      // `it.each`) is the head+thread+tap envelope — left untouched here, so this
      // fixture keeps telling the truth about what V1 actually does. V3 hides `tap` by
      // default instead (this recipe's own module doc; user decision 2026-09-26), so
      // its default `combine()` is head+thread only — checked here against the union
      // of V1's own measured per-part head/thread bounds and volumes (`testCase.parts`,
      // still real V1 numbers) rather than against `testCase.combined`, which is the one
      // fixture field this task deliberately no longer reproduces. Head and thread don't
      // overlap (thread is snapped `outside-` onto the head), so an AABB union and a
      // volume sum are both exact, not approximations.
      const { spec, length, fit, segments } = testCase.params
      const combined = combine(
        asGroup(evaluateOp('hardware.bolt', { spec, length, fit, segments }))
      )
      const bounds = boundsOf(combined)
      const headBounds = testCase.parts.head.bounds
      const threadBounds = testCase.parts.thread.bounds
      for (let axis = 0; axis < 3; axis++) {
        expect(bounds[0][axis]).toBeCloseTo(
          Math.min(headBounds[0][axis], threadBounds[0][axis]),
          MM_TOLERANCE
        )
        expect(bounds[1][axis]).toBeCloseTo(
          Math.max(headBounds[1][axis], threadBounds[1][axis]),
          MM_TOLERANCE
        )
      }
      expect(measurements.measureVolume(combined)).toBeCloseTo(
        testCase.parts.head.volume + testCase.parts.thread.volume,
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

describe('part colours, diffed against measured V1 output (TODO/core-026)', () => {
  // V1 (re-read for core-026). `jscad-utils@3.2.0`'s `Parts.Hardware.Screw`, which
  // `HexHeadScrew`/`PanHeadScrew` both return through (`dist/index.js:1927-1946`):
  //   head: head.color('gray'),
  //   thread: thread.snap(head, 'z', orientation.head).color('silver')
  //   ...headClearSpace ... .color('red')
  // and `jscad-hardware.jscad:33-46` recolours the whole clearance screw:
  //   b.add(Parts.Hardware[bolt.type](...).map(part => part.color('red')), 'tap', false, 'tap-');
  // The fixture's per-part `color` is what V1's real `.color()` left on each part.

  it('emits gray head, silver thread, and red tap parts', () => {
    const records = bolt(expansionFixture.params, { boltSpecs })
    /** @param {string} name */
    const colorOf = (name) => records.find((record) => record.name === name)?.color
    expect(colorOf('head')).toBe(0x808080)
    expect(colorOf('thread')).toBe(0xc0c0c0)
    for (const name of ['tap', 'tap-head', 'tap-thread', 'tap-headClearSpace']) {
      expect(colorOf(name), name).toBe(0xff0000)
    }
    // Colour sits on the named record only, never on an intermediate.
    for (const record of records) {
      if (!record.name) expect(record).not.toHaveProperty('color')
    }
  })

  it.each(v1Reference.cases.map((testCase) => [testCase.params.spec, testCase]))(
    '%s: every record colour equals the colour V1 left on that part',
    (_spec, testCase) => {
      const { spec, length, fit, segments } = testCase.params
      const records = bolt({ spec, length, fit, segments }, { boltSpecs })
      for (const [partName, expected] of Object.entries(testCase.parts)) {
        const record = records.find((candidate) => candidate.name === partName)
        expect(record?.color, partName).toBeTypeOf('number')
        const actual = [...hexToUnitRgb(/** @type {number} */ (record?.color)), record?.colorAlpha ?? 1]
        expect(actual, partName).toEqual(expected.color)
      }
    }
  )

  it('the evaluated group carries the same colours', () => {
    const group = asGroup(evaluateOp('hardware.bolt', expansionFixture.params))
    expect(group.colors).toEqual({
      head: { color: 0x808080, alpha: 1 },
      thread: { color: 0xc0c0c0, alpha: 1 },
      tap: { color: 0xff0000, alpha: 1 },
      'tap-head': { color: 0xff0000, alpha: 1 },
      'tap-thread': { color: 0xff0000, alpha: 1 },
      'tap-headClearSpace': { color: 0xff0000, alpha: 1 },
    })
  })
})
