// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { GearParameterError, gearDimensions, v1BacklashToBacklashMm } from './dimensions.js'
import { GearAliasError, SHORTHAND_GEAR_ALIASES, V1_GEAR_ALIASES, resolveGearAliases } from './aliases.js'

const OP = 'gear.spur'
const CANONICAL = Object.freeze([
  'teeth',
  'moduleMm',
  'pressureAngleDeg',
  'profileShift',
  'clearanceMm',
  'backlashMm',
  'thicknessMm',
  'boreMm',
])

/**
 * @param {Record<string, unknown>} params
 */
const resolve = (params) => resolveGearAliases(params, { op: OP, canonical: CANONICAL })

/**
 * @param {() => unknown} fn
 * @returns {GearAliasError}
 */
function aliasErrorOf(fn) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(GearAliasError)
    expect(error).toBeInstanceOf(GearParameterError)
    return /** @type {GearAliasError} */ (error)
  }
  throw new Error('expected a GearAliasError, nothing was thrown')
}

describe('the V1 alias table (docs/decisions/gears.md Decision 2, TODO/core-041)', () => {
  it('documents all six V1 names the TODO lists, each with the WarpCad param it becomes', () => {
    expect(V1_GEAR_ALIASES.toothCount.to).toBe('teeth')
    expect(V1_GEAR_ALIASES.circularPitch.to).toBe('moduleMm')
    expect(V1_GEAR_ALIASES.centerHoleDiameter.to).toBe('boreMm')
    expect(V1_GEAR_ALIASES.clearance.to).toBe('clearanceMm')
    expect(V1_GEAR_ALIASES.backlash.to).toBe('backlashMm')
    expect(V1_GEAR_ALIASES.profileShift.to).toBe('profileShift')
    for (const [name, alias] of Object.entries(V1_GEAR_ALIASES)) {
      expect(alias.note, name).toMatch(/\S/)
    }
    expect(Object.isFrozen(V1_GEAR_ALIASES)).toBe(true)
  })

  it('maps each of the six, converting the two whose meaning differs', () => {
    const { params } = resolve({
      toothCount: 36,
      circularPitch: (Math.PI * 50) / 36,
      centerHoleDiameter: 5,
      clearance: 0.5,
      backlash: 0.1,
      profileShift: 0.2,
      thicknessMm: 8,
    })
    expect(params.teeth).toBe(36)
    expect(params.moduleMm).toBeCloseTo(50 / 36, 12)
    expect(params.boreMm).toBe(5)
    expect(params.clearanceMm).toBe(0.5)
    // Call 4: V1 thins each tooth by backlash / cos α; WarpCad's pair backlash thins by half.
    expect(params.backlashMm).toBeCloseTo(v1BacklashToBacklashMm(0.1, 20), 12)
    expect(params.profileShift).toBe(0.2)
    expect(params.thicknessMm).toBe(8)
  })

  it('reproduces the window-motor drive gear the user printed (core-040 fixture row) without renaming anything', () => {
    const { params } = resolve({ toothCount: 36, circularPitch: (Math.PI * 50) / 36, clearance: 0.5, backlash: 0.1, thicknessMm: 8 })
    const dims = gearDimensions(/** @type {any} */ (params))
    expect(dims.pitchRadiusMm).toBeCloseTo(25, 9)
    expect(dims.outsideRadiusMm).toBeCloseTo(26.3889, 4)
    expect(dims.rootRadiusMm).toBeCloseTo(23.1111, 4)
    // Flank width at the pitch circle: cp/2 − backlashV1 / cos α (gears.md, "What the formulas predict").
    expect(dims.toothThicknessAtPitchMm).toBeCloseTo(2.0752, 4)
  })

  it('converts V1 diametralPitch as 1/module in 1/mm, never as teeth per inch (Decision 5, defect 7)', () => {
    const { params } = resolve({ toothCount: 36, diametralPitch: 0.72, thicknessMm: 8 })
    expect(params.moduleMm).toBeCloseTo(1 / 0.72, 12)
  })

  it('gives a V1-vocabulary gear that omits clearance V1’s own 0, not the ISO 0.25 module (call 5)', () => {
    const { params, notes } = resolve({ toothCount: 12, circularPitch: 2.45, thicknessMm: 4 })
    expect(params.clearanceMm).toBe(0)
    expect(notes.join(' ')).toMatch(/clearance/)
  })

  it('leaves clearance unset for a WarpCad-vocabulary gear, so the ISO default applies downstream', () => {
    const { params } = resolve({ teeth: 12, moduleMm: 1, thicknessMm: 4 })
    expect(params).not.toHaveProperty('clearanceMm')
  })

  it('accepts `module` as shorthand for moduleMm (the TODO’s own example spells it that way)', () => {
    expect(SHORTHAND_GEAR_ALIASES.module.to).toBe('moduleMm')
    const { params } = resolve({ teeth: 36, module: 1.39, pressureAngleDeg: 20, thicknessMm: 8, boreMm: 4 })
    expect(params).toEqual({ teeth: 36, moduleMm: 1.39, pressureAngleDeg: 20, thicknessMm: 8, boreMm: 4 })
  })

  it('passes canonical params through untouched and never mutates its input', () => {
    const input = Object.freeze({ teeth: 20, moduleMm: 2, thicknessMm: 6 })
    const { params, notes } = resolve(input)
    expect(params).toEqual(input)
    expect(params).not.toBe(input)
    expect(notes).toEqual([])
  })

  it('drops V1 qualitySettings with a note — resolution belongs to the document (Decision 4)', () => {
    const { params, notes } = resolve({ teeth: 20, moduleMm: 2, thicknessMm: 6, qualitySettings: { resolution: 32, stepsPerToothAngle: 3 } })
    expect(params).not.toHaveProperty('qualitySettings')
    expect(notes.join(' ')).toMatch(/qualitySettings/)
  })
})

describe('what the alias table refuses, each by name', () => {
  it('refuses an unknown param, naming it and listing what is accepted', () => {
    const error = aliasErrorOf(() => resolve({ teeth: 20, moduleMm: 2, thicknessMm: 6, toothWidth: 3 }))
    expect(error.name).toBe('GearAliasError')
    expect(error.code).toBe('unknown-param')
    expect(error.param).toBe('toothWidth')
    expect(error.message).toMatch(/gear\.spur/)
    expect(error.message).toMatch(/toothWidth/)
    expect(error.message).toMatch(/moduleMm/)
  })

  it('refuses a prototype-polluting key as an unknown param rather than assigning it', () => {
    const hostile = JSON.parse('{"teeth": 20, "moduleMm": 2, "thicknessMm": 6, "__proto__": {"polluted": true}}')
    const error = aliasErrorOf(() => resolve(hostile))
    expect(error.code).toBe('unknown-param')
    expect(/** @type {any} */ ({}).polluted).toBeUndefined()
  })

  it('refuses `center`: a composite is placed by the Library’s trailing transform.translate', () => {
    const error = aliasErrorOf(() => resolve({ teeth: 20, moduleMm: 2, thicknessMm: 6, center: [0, 0, 0] }))
    expect(error.code).toBe('center')
    expect(error.message).toMatch(/transform\.translate/)
  })

  it('refuses V1 pressureAngle until the importer decides nominal vs as-cut (gears.md core-040 addendum)', () => {
    const error = aliasErrorOf(() => resolve({ toothCount: 36, circularPitch: 4.36, pressureAngle: 20, thicknessMm: 8 }))
    expect(error.code).toBe('pressure-angle-undecided')
    expect(error.message).toMatch(/pressureAngleDeg/)
  })

  it('refuses two names for the same param rather than picking one', () => {
    expect(aliasErrorOf(() => resolve({ teeth: 20, moduleMm: 2, module: 2, thicknessMm: 6 })).code).toBe('conflict')
    expect(aliasErrorOf(() => resolve({ teeth: 20, moduleMm: 2, circularPitch: 6, thicknessMm: 6 })).code).toBe('conflict')
    expect(aliasErrorOf(() => resolve({ toothCount: 20, teeth: 20, moduleMm: 2, thicknessMm: 6 })).code).toBe('conflict')
  })

  it('refuses V1’s sign-encoded gear kinds — a spur gear is external (Decision 5, defect 3)', () => {
    expect(aliasErrorOf(() => resolve({ toothCount: -36, circularPitch: 4, thicknessMm: 6 })).code).toBe('internal-gear')
    expect(aliasErrorOf(() => resolve({ toothCount: 0, circularPitch: 4, thicknessMm: 6 })).code).toBe('rack')
  })

  it('names the op that takes each V1 kind when gear.spur refuses it', () => {
    expect(aliasErrorOf(() => resolve({ toothCount: -36, circularPitch: 4, thicknessMm: 6 })).message).toMatch(/gear\.ring/)
    expect(aliasErrorOf(() => resolve({ toothCount: 0, circularPitch: 4, thicknessMm: 6 })).message).toMatch(/gear\.rack/)
  })

  it('refuses V1’s connectedGear by name on every kind: a gear never needs its mate to exist (defect 10)', () => {
    for (const kind of /** @type {const} */ (['external', 'internal', 'rack'])) {
      const error = aliasErrorOf(() =>
        resolveGearAliases({ toothCount: -36, circularPitch: 4, connectedGear: {} }, { op: OP, canonical: CANONICAL, kind })
      )
      expect(error.code, kind).toBe('connected-gear')
    }
  })

  it('refuses a non-finite V1 value under the name the user actually typed', () => {
    const error = aliasErrorOf(() => resolve({ toothCount: 20, circularPitch: Number.NaN, thicknessMm: 6 }))
    expect(error.code).toBe('not-finite')
    expect(error.param).toBe('circularPitch')
    expect(error.message).toMatch(/circularPitch/)
  })

  it('refuses params that are not a plain object', () => {
    expect(aliasErrorOf(() => resolve(/** @type {any} */ (null))).code).toBe('not-an-object')
    expect(aliasErrorOf(() => resolve(/** @type {any} */ ([20, 2]))).code).toBe('not-an-object')
  })
})

describe('V1’s sign-encoded kinds on the ring and the rack (TODO/core-043)', () => {
  const RING_CANONICAL = Object.freeze(['teeth', 'moduleMm', 'pressureAngleDeg', 'clearanceMm', 'backlashMm', 'thicknessMm', 'rimThicknessMm'])
  const RACK_CANONICAL = Object.freeze(['teeth', 'moduleMm', 'pressureAngleDeg', 'clearanceMm', 'backlashMm', 'thicknessMm', 'heightMm'])
  /** @param {Record<string, unknown>} params */
  const asRing = (params) => resolveGearAliases(params, { op: 'gear.ring', canonical: RING_CANONICAL, kind: 'internal' })
  /** @param {Record<string, unknown>} params */
  const asRack = (params) => resolveGearAliases(params, { op: 'gear.rack', canonical: RACK_CANONICAL, kind: 'rack' })

  it('reads a negative toothCount as the ring’s tooth count', () => {
    const { params } = asRing({ toothCount: -96, circularPitch: (Math.PI * 50) / 96, thicknessMm: 3 })
    expect(params.teeth).toBe(96)
    expect(params.moduleMm).toBeCloseTo(50 / 96, 12)
    expect(params.clearanceMm).toBe(0)
  })

  it('converts a ring’s V1 backlash as a gear’s: V1 cut the ring with a pinion thickened by b / cos α', () => {
    const { params } = asRing({ toothCount: -64, circularPitch: 4, backlash: 0.05, thicknessMm: 3 })
    expect(params.backlashMm).toBeCloseTo(v1BacklashToBacklashMm(0.05, 20), 12)
  })

  it('reads toothCount 0 as V1’s rack, which always had 41 teeth, and says so', () => {
    const { params, notes } = asRack({ toothCount: 0, circularPitch: 4, thicknessMm: 3 })
    expect(params.teeth).toBe(41)
    expect(notes.join(' ')).toMatch(/41/)
  })

  it('converts a rack’s V1 backlash at half a gear’s rate: V1’s rack thinned by b / (2 cos α) (defect 8)', () => {
    const { params } = asRack({ toothCount: 0, circularPitch: 4, backlash: 0.1, pressureAngleDeg: 25, thicknessMm: 3 })
    expect(params.backlashMm).toBeCloseTo(0.1 / Math.cos((25 * Math.PI) / 180), 12)
  })

  it('refuses the other kinds’ sign by name', () => {
    expect(aliasErrorOf(() => asRing({ toothCount: 64, circularPitch: 4, thicknessMm: 3 })).code).toBe('external-gear')
    expect(aliasErrorOf(() => asRing({ toothCount: 0, circularPitch: 4, thicknessMm: 3 })).code).toBe('rack')
    expect(aliasErrorOf(() => asRack({ toothCount: 64, circularPitch: 4, thicknessMm: 3 })).code).toBe('external-gear')
    expect(aliasErrorOf(() => asRack({ toothCount: -64, circularPitch: 4, thicknessMm: 3 })).code).toBe('internal-gear')
  })

  it('refuses a rack’s toothCount 0 beside an explicit teeth, rather than picking one', () => {
    expect(aliasErrorOf(() => asRack({ toothCount: 0, teeth: 12, circularPitch: 4, thicknessMm: 3 })).code).toBe('conflict')
  })

  it('keeps V1’s centerHoleDiameter off both: neither takes a bore', () => {
    expect(aliasErrorOf(() => asRing({ toothCount: -64, circularPitch: 4, centerHoleDiameter: 5, thicknessMm: 3 })).code).toBe('unknown-param')
    expect(aliasErrorOf(() => asRack({ toothCount: 0, circularPitch: 4, centerHoleDiameter: 5, thicknessMm: 3 })).code).toBe('unknown-param')
  })
})
