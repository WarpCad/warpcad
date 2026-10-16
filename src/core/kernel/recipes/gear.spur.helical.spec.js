// SPDX-License-Identifier: AGPL-3.0-or-later
// Helical and herringbone `gear.spur` (TODO/core-042): a helix angle on the same recipe,
// driven by `profile.extrudeLinear`'s twist. The plain spur gear's own specs are
// `gear.spur.spec.js`; this file re-runs the regression that matters here — that a gear
// at helix angle 0 is that plain gear, record for record and vertex for vertex.
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { GearAliasError } from '../../gear/aliases.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { helixTwistRad } from '../../gear/helix.js'
import { involuteProfile } from '../../gear/involute.js'
import { GearLimitError } from '../../gear/limits.js'
import { isGroup } from '../group.js'
import { evaluate, evaluateOp } from '../index.js'
import { minTwistSteps, policyFor } from '../tessellation.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { GEAR_SPUR_UI, spur } from './gear.spur.js'

const { geometries, measurements } = modeling
const DEG = Math.PI / 180

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../registry.js').OpRecord} OpRecord */

/**
 * @param {Record<string, unknown>} params
 * @param {import('../index.js').EvaluateOptions} [options]
 * @returns {Geom3}
 */
function gearOf(params, options) {
  const value = evaluateOp('gear.spur', params, options)
  if (!isGroup(value)) throw new Error('expected a Group')
  const gear = value.parts.gear
  if (!gear) throw new Error('missing gear part')
  return gear
}

/**
 * @param {() => unknown} fn
 * @returns {Error}
 */
function errorOf(fn) {
  try {
    fn()
  } catch (error) {
    return /** @type {Error} */ (error)
  }
  throw new Error('expected an error, nothing was thrown')
}

/** @param {readonly (readonly number[])[]} points */
function shoelaceAreaMm2(points) {
  let twice = 0
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    twice += x0 * y1 - x1 * y0
  }
  return twice / 2
}

/** @param {number} rad */
const wrap = (rad) => Math.atan2(Math.sin(rad), Math.cos(rad))

/**
 * The smallest angular distance from `expectedRad` to any vertex at height `zMm` lying on
 * the circle of `radiusMm` — 0 when the slice there is rotated by exactly `expectedRad`.
 *
 * @param {Geom3} solid
 * @param {number} zMm
 * @param {number} radiusMm
 * @param {number} expectedRad
 */
function angularMissRad(solid, zMm, radiusMm, expectedRad) {
  let best = Number.POSITIVE_INFINITY
  for (const polygon of geometries.geom3.toPolygons(solid)) {
    for (const [x, y, z] of polygon.vertices) {
      if (Math.abs(z - zMm) > 1e-9 || Math.abs(Math.hypot(x, y) - radiusMm) > 1e-6) continue
      best = Math.min(best, Math.abs(wrap(Math.atan2(y, x) - expectedRad)))
    }
  }
  return best
}

/**
 * Horizontal faces strictly between the caps — the coincident-face seam a herringbone
 * built from two unioned halves would leave.
 *
 * @param {Geom3} solid
 * @param {number} halfThicknessMm
 */
function innerHorizontalFaces(solid, halfThicknessMm) {
  let count = 0
  for (const polygon of geometries.geom3.toPolygons(solid)) {
    const zs = polygon.vertices.map((vertex) => vertex[2])
    const flat = Math.max(...zs) - Math.min(...zs) < 1e-9
    if (flat && Math.abs(Math.abs(zs[0]) - halfThicknessMm) > 1e-9) count++
  }
  return count
}

/** @param {Record<string, unknown>} params */
const extrudeOf = (params) => {
  const record = spur(params).find((r) => r.op === 'profile.extrudeLinear')
  if (!record) throw new Error('no extrude record')
  return record
}

/** A 20T module-2 gear, 10 mm thick — small enough to fold quickly at every β. */
const BASE = Object.freeze({ teeth: 20, moduleMm: 2, thicknessMm: 10 })

describe('regression: at helix angle 0 the gear is the plain spur gear, byte for byte', () => {
  it('expands to exactly the plain records, whatever hand is given', () => {
    for (const params of [GEAR_SPUR_UI.defaults, BASE]) {
      const plain = spur(params)
      expect(spur({ ...params, helixAngleDeg: 0 })).toEqual(plain)
      expect(spur({ ...params, helixAngleDeg: 0, handedness: 'left' })).toEqual(plain)
      expect(spur({ ...params, helixAngleDeg: 0, handedness: 'right', herringbone: false })).toEqual(plain)
      expect(JSON.stringify(spur({ ...params, helixAngleDeg: 0 }))).toBe(JSON.stringify(plain))
    }
  })

  it('folds to the same polygons, vertex for vertex', () => {
    const plain = geometries.geom3.toPolygons(gearOf(BASE)).map((polygon) => polygon.vertices)
    const zero = geometries.geom3.toPolygons(gearOf({ ...BASE, helixAngleDeg: 0 })).map((polygon) => polygon.vertices)
    expect(JSON.stringify(zero)).toBe(JSON.stringify(plain))
  })

  it('leaves profile.extrudeLinear unchanged when no twist is asked for', () => {
    const records = (/** @type {Record<string, unknown>} */ extra) => [
      { id: 'p', op: 'profile.roundedRectangle', params: { size: [20, 10], roundRadius: 2 } },
      { id: 'e', op: 'profile.extrudeLinear', target: 'p', params: { height: 3, ...extra } },
    ]
    const plain = JSON.stringify(geometries.geom3.toPolygons(/** @type {Geom3} */ (evaluate(records({})).byId.get('e'))))
    expect(JSON.stringify(geometries.geom3.toPolygons(/** @type {Geom3} */ (evaluate(records({ twistDeg: 0 })).byId.get('e'))))).toBe(plain)
  })
})

describe('a helix angle expands to a transverse profile and a computed twist', () => {
  const beta = 30
  const pitchRadiusMm = (BASE.teeth * BASE.moduleMm) / Math.cos(beta * DEG) / 2

  it('hands profile.gear the helix angle (for the transverse section) and the extrude the twist, in degrees', () => {
    const records = spur({ ...BASE, helixAngleDeg: beta })
    expect(records[0]).toEqual({ id: 'profile', op: 'profile.gear', params: { teeth: 20, moduleMm: 2, helixAngleDeg: 30 } })
    const twistRad = helixTwistRad({ thicknessMm: 10, pitchRadiusMm, helixAngleDeg: beta })
    const extrude = extrudeOf({ ...BASE, helixAngleDeg: beta })
    expect(extrude.params?.height).toBe(10)
    expect(extrude.params?.twistDeg).toBeCloseTo(twistRad / DEG, 12)
    expect(extrude.params).not.toHaveProperty('twistSteps')
  })

  it('makes the pitch reference the transverse pitch circle, z · mₙ / cos β', () => {
    const pitch = spur({ ...BASE, helixAngleDeg: beta }).find((r) => r.id === 'pitch')
    expect(pitch?.params?.diameter).toBeCloseTo(2 * pitchRadiusMm, 12)
  })

  it('flips the twist for a left hand and keeps the hand off the profile, which is the same for both', () => {
    const right = extrudeOf({ ...BASE, helixAngleDeg: beta, handedness: 'right' })
    const left = extrudeOf({ ...BASE, helixAngleDeg: beta, handedness: 'left' })
    expect(/** @type {number} */ (left.params?.twistDeg)).toBeCloseTo(-(/** @type {number} */ (right.params?.twistDeg)), 12)
    const [profile] = spur({ ...BASE, helixAngleDeg: beta, handedness: 'left' })
    expect(profile.params).not.toHaveProperty('handedness')
  })

  it('expands a herringbone to one chevron extrude: each half twists by the half-thickness twist', () => {
    const extrude = extrudeOf({ ...BASE, helixAngleDeg: beta, herringbone: true })
    const halfRad = helixTwistRad({ thicknessMm: 5, pitchRadiusMm, helixAngleDeg: beta })
    expect(extrude.params).toMatchObject({ height: 10, herringbone: true })
    expect(extrude.params?.twistDeg).toBeCloseTo(halfRad / DEG, 12)
    expect(spur({ ...BASE, helixAngleDeg: beta, herringbone: true }).filter((r) => r.op === 'profile.extrudeLinear')).toHaveLength(1)
    expect(spur({ ...BASE, helixAngleDeg: beta, herringbone: true }).some((r) => r.op.startsWith('boolean.union'))).toBe(false)
  })

  it('keeps a β = 0 herringbone as a seamed spur gear: a chevron with no twist', () => {
    expect(extrudeOf({ ...BASE, herringbone: true }).params).toEqual({ height: 10, twistDeg: 0, herringbone: true })
  })

  it('names both modules: normalModuleMm is moduleMm, transverseModuleMm is converted through cos β', () => {
    expect(spur({ teeth: 20, normalModuleMm: 2, thicknessMm: 10, helixAngleDeg: beta })).toEqual(spur({ ...BASE, helixAngleDeg: beta }))
    const [profile] = spur({ teeth: 20, transverseModuleMm: 2 / Math.cos(beta * DEG), thicknessMm: 10, helixAngleDeg: beta })
    expect(profile.params?.moduleMm).toBeCloseTo(2, 12)
    const conflict = errorOf(() => spur({ ...BASE, transverseModuleMm: 2.3, helixAngleDeg: beta }))
    expect(conflict).toBeInstanceOf(GearAliasError)
    expect(/** @type {GearAliasError} */ (conflict).code).toBe('conflict')
  })
})

describe('the twisted solid: the top slice turns by exactly the computed twist', () => {
  /** @param {number} beta @param {'right' | 'left'} [handedness] */
  const check = (beta, handedness = 'right') => {
    const params = { ...BASE, helixAngleDeg: beta, handedness }
    const profile = involuteProfile({ teeth: 20, moduleMm: 2, helixAngleDeg: beta })
    const twistRad = helixTwistRad({ thicknessMm: 10, pitchRadiusMm: profile.pitchRadiusMm, helixAngleDeg: beta, handedness })
    const gear = gearOf(params)
    // Tooth 0's tip centre is on +X at the bottom face and turned by the twist at the top.
    expect(angularMissRad(gear, -5, profile.tipRadiusMm, 0)).toBeLessThan(1e-6)
    expect(angularMissRad(gear, 5, profile.tipRadiusMm, twistRad)).toBeLessThan(1e-6)
    // …so the tooth crosses the pitch cylinder at the requested helix angle.
    expect(Math.atan((profile.pitchRadiusMm * Math.abs(twistRad)) / 10) / DEG).toBeCloseTo(beta, 6)
    return twistRad
  }

  it.each([15, 30, 45])('β = %i°, right hand', (beta) => {
    expect(check(beta)).toBeGreaterThan(0)
  })

  it('β = 30°, left hand (the negative twist)', () => {
    expect(check(30, 'left')).toBeLessThan(0)
  })

  it('a herringbone turns by the half twist at mid-thickness and comes back at the top', () => {
    const profile = involuteProfile({ teeth: 20, moduleMm: 2, helixAngleDeg: 30 })
    const halfRad = helixTwistRad({ thicknessMm: 5, pitchRadiusMm: profile.pitchRadiusMm, helixAngleDeg: 30 })
    const gear = gearOf({ ...BASE, helixAngleDeg: 30, herringbone: true })
    expect(angularMissRad(gear, -5, profile.tipRadiusMm, 0)).toBeLessThan(1e-6)
    expect(angularMissRad(gear, 0, profile.tipRadiusMm, halfRad)).toBeLessThan(1e-6)
    expect(angularMissRad(gear, 5, profile.tipRadiusMm, 0)).toBeLessThan(1e-6)
  })
})

describe('watertight, with the volume the transverse profile predicts', () => {
  /** @param {number} beta */
  const profileAreaMm2 = (beta) =>
    shoelaceAreaMm2(involuteProfile({ teeth: 20, moduleMm: 2, helixAngleDeg: beta, pointsPerFlank: 64, tipSegments: 32, rootSegments: 32 }).outline)

  /** @type {[string, Record<string, unknown>, number][]} */
  const cases = [
    ['β 0°', { ...BASE }, 0],
    ['β 15°', { ...BASE, helixAngleDeg: 15 }, 15],
    ['β 30°', { ...BASE, helixAngleDeg: 30 }, 30],
    ['β 45°', { ...BASE, helixAngleDeg: 45 }, 45],
    ['β 30° left hand', { ...BASE, helixAngleDeg: 30, handedness: 'left' }, 30],
    ['herringbone β 30°', { ...BASE, helixAngleDeg: 30, herringbone: true }, 30],
    ['herringbone β 45°', { ...BASE, helixAngleDeg: 45, herringbone: true }, 45],
    ['herringbone β 0° (a seamed spur gear)', { ...BASE, herringbone: true }, 0],
  ]

  it.each(cases)('%s', (_label, params, beta) => {
    const gear = gearOf(params)
    expect(openEdgesOf(makeWatertight(gear)).openEdges).toBe(0)
    expect(innerHorizontalFaces(gear, 5)).toBe(0)
    const expectedMm3 = 10 * profileAreaMm2(beta)
    expect(Math.abs(measurements.measureVolume(gear) - expectedMm3) / expectedMm3).toBeLessThan(0.005)
  })

  it('bored, helical and many-toothed: 120 teeth at 30°, bored', () => {
    const rootDiameterMm = 2 * involuteProfile({ teeth: 120, moduleMm: 1, helixAngleDeg: 30 }).rootRadiusMm
    const gear = gearOf({ teeth: 120, moduleMm: 1, thicknessMm: 6, helixAngleDeg: 30, boreMm: 0.4 * rootDiameterMm })
    expect(openEdgesOf(makeWatertight(gear)).openEdges).toBe(0)
    expect(measurements.measureVolume(gear)).toBeGreaterThan(0)
  })

  it('a herringbone is two mirrored halves: a right-hand half and a left-hand half, and ≈ twice either', () => {
    const whole = measurements.measureVolume(gearOf({ ...BASE, helixAngleDeg: 30, herringbone: true }))
    const right = measurements.measureVolume(gearOf({ ...BASE, thicknessMm: 5, helixAngleDeg: 30 }))
    const left = measurements.measureVolume(gearOf({ ...BASE, thicknessMm: 5, helixAngleDeg: 30, handedness: 'left' }))
    // Exactly: the upper half turns back, which is a left-hand half on top of a right-hand one.
    expect(Math.abs(whole - (right + left)) / whole).toBeLessThan(1e-9)
    // Twice one hand only to the facet sag: each twisted wall quad is split along one
    // diagonal, which bulges a right-hand half's flanks one way and a left-hand half's the
    // other (measured 0.03–0.19 % across the presets, shrinking toward Print).
    expect(Math.abs(whole - 2 * right) / whole).toBeLessThan(0.005)
  })

  it('samples the twist finer for Print than for Draft', () => {
    const count = (/** @type {string} */ id) =>
      geometries.geom3.toPolygons(gearOf({ ...BASE, helixAngleDeg: 30 }, { policy: policyFor(id) })).length
    expect(count('print')).toBeGreaterThan(count('draft'))
  })
})

describe('profile.extrudeLinear twist: a quality setting with a floor', () => {
  // 36T module 2 at 30°, 20 mm thick: a 15.9° twist at a 43.6 mm tip — Draft needs 3 steps.
  const gearProfile = { id: 'p', op: 'profile.gear', params: { teeth: 36, moduleMm: 2, helixAngleDeg: 30 } }
  const twistDeg = helixTwistRad({ thicknessMm: 20, pitchRadiusMm: 36 / Math.cos(30 * DEG), helixAngleDeg: 30 }) / DEG
  /** @param {Record<string, unknown>} params */
  const extrude = (params) =>
    /** @type {Geom3} */ (evaluate([gearProfile, { id: 'e', op: 'profile.extrudeLinear', target: 'p', params: { height: 20, ...params } }]).byId.get('e'))

  it('rejects twistSteps = 1 below the minimum for a non-zero twist, naming the minimum', () => {
    const minimum = minTwistSteps(twistDeg * DEG, 36 / Math.cos(30 * DEG) + 2)
    expect(minimum).toBeGreaterThan(1)
    const error = errorOf(() => extrude({ twistDeg, twistSteps: 1 }))
    expect(error.message).toMatch(/^profile\.extrudeLinear: twistSteps/)
    expect(error.message).toContain(String(minimum))
    expect(() => extrude({ twistDeg, twistSteps: minimum })).not.toThrow()
  })

  it.each([
    ['NaN twistDeg', { twistDeg: Number.NaN }, /twistDeg/],
    ['a string twistDeg', { twistDeg: '10' }, /twistDeg/],
    ['more than a full turn', { twistDeg: 361 }, /twistDeg/],
    ['fractional twistSteps', { twistDeg: 10, twistSteps: 2.5 }, /twistSteps/],
    ['zero twistSteps', { twistDeg: 10, twistSteps: 0 }, /twistSteps/],
    ['a string herringbone', { twistDeg: 10, herringbone: 'yes' }, /herringbone/],
  ])('refuses %s by name', (_label, params, pattern) => {
    expect(() => extrude(params)).toThrow(pattern)
  })

  it('refuses a twist whose minimum steps would blow the vertex budget, before extruding', () => {
    const started = performance.now()
    const error = errorOf(() =>
      evaluate([
        { id: 'p', op: 'profile.gear', params: { teeth: 500, moduleMm: 2 } },
        { id: 'e', op: 'profile.extrudeLinear', target: 'p', params: { height: 20, twistDeg: 360 } },
      ])
    )
    expect(error.message).toMatch(/^profile\.extrudeLinear: .*vertices/)
    expect(performance.now() - started).toBeLessThan(2000)
  })
})

describe('hostile input: a named error from the recipe, before anything is built', () => {
  /** @type {[string, Record<string, unknown>, RegExp][]} */
  const hostile = [
    ['NaN helix angle', { ...BASE, helixAngleDeg: Number.NaN }, /helixAngleDeg/],
    ['Infinity helix angle', { ...BASE, helixAngleDeg: Number.POSITIVE_INFINITY }, /helixAngleDeg/],
    ['a string helix angle', { ...BASE, helixAngleDeg: '30' }, /helixAngleDeg/],
    ['a helix angle past 45°', { ...BASE, helixAngleDeg: 46 }, /helixAngleDeg/],
    ['a negative helix angle', { ...BASE, helixAngleDeg: -20 }, /handedness/],
    ['an unknown hand', { ...BASE, helixAngleDeg: 20, handedness: 'up' }, /handedness/],
    ['a numeric hand', { ...BASE, helixAngleDeg: 20, handedness: 1 }, /handedness/],
    ['a string herringbone', { ...BASE, helixAngleDeg: 20, herringbone: 'yes' }, /herringbone/],
    ['a numeric herringbone', { ...BASE, helixAngleDeg: 20, herringbone: 1 }, /herringbone/],
  ]

  it.each(hostile)('%s is a GearLimitError', (_label, params, pattern) => {
    const error = errorOf(() => spur(params))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error).toBeInstanceOf(GearParameterError)
    expect(error.message).toMatch(/^gear\.spur: /)
    expect(error.message).toMatch(pattern)
  })

  it('refuses a twist past one full turn — a worm, not a gear — in microseconds', () => {
    const started = performance.now()
    const error = errorOf(() => spur({ teeth: 12, moduleMm: 0.5, thicknessMm: 1000, helixAngleDeg: 45 }))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/turn/)
    expect(performance.now() - started).toBeLessThan(50)
  })

  it('refuses a relief groove rather than silently ignoring it (not built yet)', () => {
    expect(() => spur({ ...BASE, helixAngleDeg: 30, herringbone: true, grooveMm: 2 })).toThrow(/grooveMm/)
  })

  it('refuses handedness or herringbone on profile.gear — the profile is the transverse section only', () => {
    expect(() => evaluateOp('profile.gear', { teeth: 20, moduleMm: 2, handedness: 'left' })).toThrow(/handedness/)
    expect(() => evaluateOp('profile.gear', { teeth: 20, moduleMm: 2, herringbone: true })).toThrow(/herringbone/)
  })
})
