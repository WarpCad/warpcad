// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { GearParameterError } from '../../gear/dimensions.js'
import { GearLimitError, RACK_LIMITS } from '../../gear/limits.js'
import { rackDimensions } from '../../gear/rack.js'
import { boundsOf, isGroup } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { registry } from '../registry.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { rack } from './gear.rack.js'
import rackSource from './gear.rack.js?raw'

const { geometries, measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */

/**
 * @param {unknown} value
 * @returns {Group}
 */
function asGroup(value) {
  if (!isGroup(value)) throw new Error('expected a Group, got bare geometry')
  return value
}

/**
 * @param {Group} group
 * @param {string} name
 * @returns {Geom3}
 */
function partOf(group, name) {
  const part = group.parts[name]
  if (!part) throw new Error(`missing part ${name}`)
  return part
}

/**
 * @param {() => unknown} fn
 * @returns {Error & { code?: string }}
 */
function errorOf(fn) {
  try {
    fn()
  } catch (error) {
    return /** @type {Error} */ (error)
  }
  throw new Error('expected an error, nothing was thrown')
}

describe('the gear.rack recipe expands into records, it builds nothing', () => {
  it('expands to profile.gear (rack) → extrude → centre, plus the pitch reference whose +Y face is the pitch line', () => {
    const dims = rackDimensions({ teeth: 12, moduleMm: 2 })
    expect(rack({ teeth: 12, moduleMm: 2, thicknessMm: 6 })).toEqual([
      { id: 'profile', op: 'profile.gear', params: { kind: 'rack', teeth: 12, moduleMm: 2 } },
      { id: 'blank', op: 'profile.extrudeLinear', target: 'profile', params: { height: 6 } },
      { id: 'gear', op: 'transform.translate', target: 'blank', params: { vector: [0, 0, -3] }, name: 'gear' },
      {
        id: 'pitch',
        op: 'primitive.cuboid',
        params: { size: [dims.lengthMm, -dims.backYMm, 6], center: [0, dims.backYMm / 2, 0] },
        name: 'pitch',
        hidden: true,
      },
    ])
  })

  it('defaults to 10 teeth when none is given', () => {
    expect(rack({ moduleMm: 1, thicknessMm: 4 })[0].params?.teeth).toBe(10)
  })

  it('carries every profile param onto the profile record', () => {
    const [profile] = rack({ teeth: 8, moduleMm: 1.5, pressureAngleDeg: 25, clearanceMm: 0.2, backlashMm: 0.1, heightMm: 5, thicknessMm: 6 })
    expect(profile.params).toEqual({ kind: 'rack', teeth: 8, moduleMm: 1.5, pressureAngleDeg: 25, clearanceMm: 0.2, backlashMm: 0.1, heightMm: 5 })
  })

  it('takes V1 vocabulary: toothCount 0 is V1’s rack, which always had 41 teeth', () => {
    const [profile] = rack({ toothCount: 0, circularPitch: (Math.PI * 50) / 32, clearance: 0.05, backlash: 0.05, thicknessMm: 4 })
    expect(profile.params?.teeth).toBe(41)
    expect(profile.params?.moduleMm).toBeCloseTo(50 / 32, 12)
    // V1's rack thins by b / (2 cos α), half what a V1 gear does (Decision 5 defect 8).
    expect(profile.params?.backlashMm).toBeCloseTo(0.05 / Math.cos((20 * Math.PI) / 180), 12)
  })

  it('refuses a non-zero V1 toothCount: those were V1’s external and internal gears', () => {
    expect(errorOf(() => rack({ toothCount: 20, circularPitch: 4, thicknessMm: 4 })).code).toBe('external-gear')
    expect(errorOf(() => rack({ toothCount: -20, circularPitch: 4, thicknessMm: 4 })).code).toBe('internal-gear')
  })

  it('is a 0-operand composite with no ui yet (ui-057 makes it a Library row)', () => {
    expect(registry['gear.rack']).toMatchObject({ kind: 'composite', operandCount: 0 })
    expect(registry['gear.rack'].ui).toBeUndefined()
    expect(expand('gear.rack', { teeth: 12, moduleMm: 2, thicknessMm: 6 })).toEqual(rack({ teeth: 12, moduleMm: 2, thicknessMm: 6 }))
  })

  it('emits only ops the registry knows, as JSON, and never imports @jscad/modeling', () => {
    for (const record of rack({ teeth: 12, moduleMm: 2, thicknessMm: 6 })) {
      expect(registry[record.op], record.op).toBeDefined()
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
    expect(rackSource).not.toMatch(/from\s+['"]@jscad\/modeling/)
  })
})

describe('folding gear.rack: teeth along +X pointing +Y, extruded along Z', () => {
  const params = { teeth: 12, moduleMm: 2, thicknessMm: 6, backlashMm: 0.1 }
  const dims = rackDimensions(params)
  const group = asGroup(evaluateOp('gear.rack', params))
  const gear = partOf(group, 'gear')

  it('names gear and pitch, with only the toothed bar visible', () => {
    expect(Object.keys(group.parts).sort()).toEqual(['gear', 'pitch'])
    expect(group.names).toEqual(['gear'])
  })

  it('spans ±length/2 in X, back to tip in Y, ±thickness/2 in Z', () => {
    const [min, max] = boundsOf(gear)
    expect(min[0]).toBeCloseTo(-dims.lengthMm / 2, 9)
    expect(max[0]).toBeCloseTo(dims.lengthMm / 2, 9)
    expect(min[1]).toBeCloseTo(dims.backYMm, 9)
    expect(max[1]).toBeCloseTo(dims.tipYMm, 9)
    expect(min[2]).toBeCloseTo(-3, 9)
    expect(max[2]).toBeCloseTo(3, 9)
  })

  it('puts the pitch part’s +Y face on the pitch line, y = 0, the full length of the rack', () => {
    const [min, max] = boundsOf(partOf(group, 'pitch'))
    expect(max[1]).toBeCloseTo(0, 9)
    expect(min[1]).toBeCloseTo(dims.backYMm, 9)
    expect(max[0] - min[0]).toBeCloseTo(dims.lengthMm, 9)
  })

  it('has volume = thickness · outline area', () => {
    const outline = geometries.geom2.toPoints(
      /** @type {any} */ (evaluateOp('profile.gear', { kind: 'rack', teeth: 12, moduleMm: 2, backlashMm: 0.1 }))
    )
    let twice = 0
    for (let i = 0; i < outline.length; i++) {
      const [x0, y0] = outline[i]
      const [x1, y1] = outline[(i + 1) % outline.length]
      twice += x0 * y1 - x1 * y0
    }
    expect(measurements.measureVolume(gear)).toBeCloseTo((6 * twice) / 2, 6)
  })
})

describe('watertight on 1 tooth, the cap, and the pressure-angle extremes', () => {
  /** @type {[string, Record<string, unknown>][]} */
  const cases = [
    ['1 tooth', { teeth: 1, moduleMm: 2, thicknessMm: 4 }],
    ['10 teeth', { teeth: 10, moduleMm: 2, thicknessMm: 4 }],
    ['V1’s 41', { toothCount: 0, circularPitch: (Math.PI * 50) / 36, clearance: 0.5, backlash: 0.1, thicknessMm: 4 }],
    ['the 200-tooth cap', { teeth: RACK_LIMITS.teeth.max, moduleMm: 1, thicknessMm: 4 }],
    ['5°', { teeth: 6, moduleMm: 1, pressureAngleDeg: 5, thicknessMm: 4 }],
    ['35°, pointed spaces', { teeth: 6, moduleMm: 1, pressureAngleDeg: 35, clearanceMm: 0.5, thicknessMm: 4 }],
    ['35°, pointed tips', { teeth: 6, moduleMm: 1, pressureAngleDeg: 35, backlashMm: 0.4, thicknessMm: 4 }],
  ]
  it.each(cases)('%s', (_label, params) => {
    const gear = partOf(asGroup(evaluateOp('gear.rack', params)), 'gear')
    expect(openEdgesOf(makeWatertight(gear)).openEdges).toBe(0)
    expect(measurements.measureVolume(gear)).toBeGreaterThan(0)
  })
})

describe('hostile input: a named error, checked before the profile is built', () => {
  /** @type {[string, Record<string, unknown>][]} */
  const hostile = [
    ['the cap + 1', { teeth: RACK_LIMITS.teeth.max + 1, moduleMm: 1, thicknessMm: 4 }],
    ['0 teeth', { teeth: 0, moduleMm: 1, thicknessMm: 4 }],
    ['fractional teeth', { teeth: 2.5, moduleMm: 1, thicknessMm: 4 }],
    ['10⁶ teeth', { teeth: 1e6, moduleMm: 1, thicknessMm: 4 }],
    ['NaN module', { teeth: 4, moduleMm: Number.NaN, thicknessMm: 4 }],
    ['pressure angle past the cap', { teeth: 4, moduleMm: 1, pressureAngleDeg: 40, thicknessMm: 4 }],
    ['0 mm height', { teeth: 4, moduleMm: 1, heightMm: 0, thicknessMm: 4 }],
    ['Infinity height', { teeth: 4, moduleMm: 1, heightMm: Number.POSITIVE_INFINITY, thicknessMm: 4 }],
    ['missing thickness', { teeth: 4, moduleMm: 1 }],
  ]

  it.each(hostile)('%s is a GearLimitError from the recipe', (_label, params) => {
    const error = errorOf(() => rack(params))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/^gear\.rack: /)
  })

  it('refuses 10⁶ teeth on profile.gear (rack) too, in microseconds', () => {
    const started = performance.now()
    expect(() => evaluateOp('profile.gear', { kind: 'rack', teeth: 1e6, moduleMm: 1 })).toThrow(GearLimitError)
    expect(performance.now() - started).toBeLessThan(50)
  })

  it('refuses a param a rack has no use for — helixAngleDeg, rimThicknessMm, boreMm — by name', () => {
    for (const extra of [{ helixAngleDeg: 10 }, { rimThicknessMm: 3 }, { boreMm: 3 }]) {
      expect(() => rack({ teeth: 4, moduleMm: 1, thicknessMm: 4, ...extra }), JSON.stringify(extra)).toThrow(GearParameterError)
    }
  })

  it('refuses a rack param on profile.gear without kind: rack — the external vocabulary is unchanged', () => {
    expect(() => evaluateOp('profile.gear', { teeth: 20, moduleMm: 2, heightMm: 4 })).toThrow(/heightMm/)
  })
})
