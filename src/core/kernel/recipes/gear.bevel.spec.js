// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { BevelGearError, bevelGearDimensions } from '../../gear/bevel.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { GearBoreError, GearLimitError } from '../../gear/limits.js'
import { boundsOf, isGroup } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
import { registry } from '../registry.js'
import { policyFor } from '../tessellation.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { APEX_MARKER_MM, BEVEL_PARAMS, bevel } from './gear.bevel.js'
import bevelRecipeSource from './gear.bevel.js?raw'
import v1Gears from '../../gear/__fixtures__/v1-gears.json'

const { booleans, geometries, measurements, primitives } = modeling
const DEG = Math.PI / 180

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('@jscad/modeling').geometries.geom2.Geom2} Geom2 */
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
    return /** @type {Error & { code?: string }} */ (error)
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

/** @param {Geom3} solid */
const verticesOf = (solid) => geometries.geom3.toPolygons(solid).flatMap((polygon) => polygon.vertices)

/**
 * Largest distance from the Z axis among the vertices within 1e-9 mm of height `z`.
 *
 * @param {Geom3} solid
 * @param {number} zMm
 */
function maxRadiusAt(solid, zMm) {
  let best = 0
  for (const [x, y, z] of verticesOf(solid)) if (Math.abs(z - zMm) < 1e-9) best = Math.max(best, Math.hypot(x, y))
  return best
}

/**
 * The cross-section area at height `zMm`, from a 0.002 mm slab intersected with the solid.
 *
 * @param {Geom3} solid
 * @param {number} zMm
 */
function sectionAreaMm2(solid, zMm) {
  const slabMm = 0.002
  const slab = primitives.cuboid({ size: [1000, 1000, slabMm], center: [0, 0, zMm] })
  return measurements.measureVolume(booleans.intersect(solid, slab)) / slabMm
}

/** The large-end section, as the registry builds it for these params. */
/** @param {Record<string, unknown>} params */
function largeEndOutline(params) {
  const [profileRecord] = bevel(params)
  return geometries.geom2.toPoints(/** @type {Geom2} */ (/** @type {unknown} */ (evaluateOp('profile.gear', profileRecord.params ?? {}))))
}

/** A 2:1 reduction on 90° shafts: the pinion's δ is atan(1/2). */
const PINION = Object.freeze({ teeth: 15, mateTeeth: 30, moduleMm: 2, faceWidthMm: 8 })

describe('the gear.bevel recipe expands into records, it builds nothing', () => {
  it('expands to the large-end section → a loft to the apex, plus hidden pitchCone and apex references', () => {
    const dims = bevelGearDimensions(PINION)
    const records = bevel(PINION)
    expect(records.map((r) => [r.id, r.op, r.name ?? null, r.hidden ?? false])).toEqual([
      ['profile', 'profile.gear', null, false],
      ['gear', 'profile.extrudeToApex', 'gear', false],
      ['pitchCone', 'primitive.cone', 'pitchCone', true],
      ['apex', 'primitive.cuboid', 'apex', true],
    ])
    expect(records[0].params).toEqual({ kind: 'bevel', teeth: 15, moduleMm: 2, pitchConeAngleDeg: dims.pitchConeAngleDeg })
    expect(records[1]).toMatchObject({ target: 'profile', params: { apexDistanceMm: dims.apexDistanceMm, lengthMm: dims.axialLengthMm } })
    expect(records[3].params).toEqual({ size: [APEX_MARKER_MM, APEX_MARKER_MM, APEX_MARKER_MM], center: [0, 0, 0] })
  })

  it('adds a hidden bore, and carries bore and hub onto the loft (never a 3D boolean)', () => {
    const records = bevel({ ...PINION, boreMm: 5, hubLengthMm: 6 })
    expect(records.map((r) => r.op)).not.toContain('boolean.subtract')
    expect(records.map((r) => r.op)).not.toContain('boolean.union')
    const loft = records.find((r) => r.id === 'gear')
    expect(loft?.params).toMatchObject({ boreMm: 5, hubLengthMm: 6 })
    expect(loft?.params?.hubDiameterMm).toBeCloseTo(2 * bevelGearDimensions(PINION).smallEndRootRadiusMm, 12)
    expect(records.find((r) => r.id === 'bore')).toMatchObject({ op: 'primitive.cylinder', name: 'bore', hidden: true })
  })

  it('carries clearance, backlash and pressure angle onto the section, and nothing placement-shaped', () => {
    const [profile] = bevel({ ...PINION, pressureAngleDeg: 25, clearanceMm: 0.2, backlashMm: 0.1 })
    expect(Object.keys(profile.params ?? {}).sort()).toEqual(['backlashMm', 'clearanceMm', 'kind', 'moduleMm', 'pitchConeAngleDeg', 'pressureAngleDeg', 'teeth'])
  })

  it('takes the V1 vocabulary through the same alias table as gear.spur', () => {
    const [profile] = bevel({ toothCount: 32, mateTeeth: 32, circularPitch: (Math.PI * 50) / 32, clearance: 0.05, backlash: 0.05 })
    expect(profile.params?.teeth).toBe(32)
    expect(profile.params?.moduleMm).toBeCloseTo(50 / 32, 12)
    expect(profile.params?.clearanceMm).toBe(0.05)
    expect(bevel({ teeth: 20, mateTeeth: 20, module: 1 })[0].params?.moduleMm).toBe(1)
  })

  it('is a 0-operand composite with no ui (ui-057 wires the Library), beside native profile.extrudeToApex', () => {
    expect(registry['gear.bevel']).toMatchObject({ kind: 'composite', operandCount: 0 })
    expect(registry['gear.bevel'].ui).toBeUndefined()
    expect(registry['profile.extrudeToApex']).toMatchObject({ kind: 'native', operandCount: 1 })
    expect(registry['profile.extrudeToApex'].ui).toBeUndefined()
    expect(expand('gear.bevel', PINION)).toEqual(bevel(PINION))
  })

  it('emits only ops the registry knows, and only JSON values', () => {
    for (const record of bevel({ ...PINION, boreMm: 4, hubLengthMm: 3 })) {
      expect(registry[record.op], record.op).toBeDefined()
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
  })

  it('lists its params, canonical spelling (moduleMm per docs/decisions/gears.md, not the TODO’s module)', () => {
    expect([...BEVEL_PARAMS].sort()).toEqual(
      ['backlashMm', 'boreMm', 'clearanceMm', 'faceWidthMm', 'hubLengthMm', 'mateTeeth', 'moduleMm', 'pressureAngleDeg', 'shaftAngleDeg', 'teeth'].sort()
    )
  })

  it('never imports @jscad/modeling — a recipe is records, not geometry', () => {
    expect(bevelRecipeSource).not.toMatch(/from\s+['"]@jscad\/modeling/)
  })
})

describe('folding gear.bevel: axis Z, apex at the origin, +Z toward the large end', () => {
  const dims = bevelGearDimensions(PINION)
  const group = asGroup(evaluateOp('gear.bevel', PINION))
  const gear = partOf(group, 'gear')

  it('names gear, pitchCone and apex, with only the toothed body visible', () => {
    expect(Object.keys(group.parts).sort()).toEqual(['apex', 'gear', 'pitchCone'])
    expect(group.names).toEqual(['gear'])
  })

  it('puts the apex part on the origin, and the whole gear in front of it', () => {
    const [aMin, aMax] = boundsOf(partOf(group, 'apex'))
    for (let i = 0; i < 3; i++) expect((aMin[i] + aMax[i]) / 2).toBeCloseTo(0, 12)
    const [min, max] = boundsOf(gear)
    expect(min[2]).toBeCloseTo(dims.smallEndApexDistanceMm, 9)
    expect(max[2]).toBeCloseTo(dims.apexDistanceMm, 9)
    expect(min[2]).toBeGreaterThan(0)
  })

  it('has its pitch circle, m·z/2, on the large-end plane', () => {
    const pitch = partOf(group, 'pitchCone')
    expect(maxRadiusAt(pitch, dims.apexDistanceMm)).toBeCloseTo(15, 9)
    expect(dims.pitchRadiusMm).toBe(15)
  })

  it('has a pitch cone whose half-angle is δ within 0.01°, at both ends', () => {
    const delta = Math.atan(15 / 30) / DEG
    for (const [x, y, z] of verticesOf(partOf(group, 'pitchCone'))) {
      if (Math.hypot(x, y) < 1e-9) continue // a cap's centre, on the axis
      expect(Math.abs(Math.atan2(Math.hypot(x, y), z) / DEG - delta)).toBeLessThan(0.01)
    }
  })

  it('puts every flank, tip and root face on a plane through the apex (within 1e-6 mm)', () => {
    let walls = 0
    for (const polygon of geometries.geom3.toPolygons(gear)) {
      const [nx, ny, nz, w] = geometries.poly3.plane(polygon)
      if (Math.abs(Math.abs(nz) - 1) < 1e-9 && Math.abs(nx) + Math.abs(ny) < 1e-9) continue // an end cap
      walls++
      expect(Math.abs(w)).toBeLessThan(1e-6)
    }
    expect(walls).toBeGreaterThan(15 * 8)
  })

  it('shrinks the teeth toward the apex: the small end is (L − F)/L of the large end', () => {
    const large = maxRadiusAt(gear, dims.apexDistanceMm)
    const small = maxRadiusAt(gear, dims.smallEndApexDistanceMm)
    expect(large).toBeCloseTo(dims.outsideRadiusMm, 9)
    expect(small / large).toBeCloseTo(dims.smallEndScale, 9)
  })

  it('has a section at 50 % depth of (s_mid / s_large)² the large end’s area (a regression guard, V1 scaled too)', () => {
    const largeAreaMm2 = shoelaceAreaMm2(largeEndOutline(PINION))
    const zMid = (dims.apexDistanceMm + dims.smallEndApexDistanceMm) / 2
    const ratio = zMid / dims.apexDistanceMm
    // s along the pitch line is proportional to z, so (s_mid / s_large) = z_mid / z_large.
    const L = dims.coneDistanceMm
    expect(ratio).toBeCloseTo((L - PINION.faceWidthMm / 2) / L, 12)
    expect(sectionAreaMm2(gear, zMid) / (largeAreaMm2 * ratio * ratio)).toBeCloseTo(1, 3)
  })

  it('has the volume of a frustum of its large-end section: A·Z·(1 − k³)/3', () => {
    const k = dims.smallEndScale
    const expectedMm3 = (shoelaceAreaMm2(largeEndOutline(PINION)) * dims.apexDistanceMm * (1 - k ** 3)) / 3
    expect(measurements.measureVolume(gear) / expectedMm3).toBeCloseTo(1, 9)
  })
})

describe('bore and hub: built into the loft, so the gear stays one watertight solid', () => {
  const params = { ...PINION, boreMm: 5, hubLengthMm: 6 }
  const dims = bevelGearDimensions(PINION)
  const group = asGroup(evaluateOp('gear.bevel', params))
  const gear = partOf(group, 'gear')

  it('names the bore part, and keeps the bore the same size through gear and hub', () => {
    expect(Object.keys(group.parts).sort()).toEqual(['apex', 'bore', 'gear', 'pitchCone'])
    const [bMin, bMax] = boundsOf(partOf(group, 'bore'))
    expect(bMax[0] - bMin[0]).toBeCloseTo(5, 9)
    expect(bMin[2]).toBeCloseTo(dims.smallEndApexDistanceMm, 9)
    expect(bMax[2]).toBeCloseTo(dims.apexDistanceMm + 6, 9)
  })

  it('puts the hub behind the large end, and no wider than the small end’s root circle', () => {
    const [, max] = boundsOf(gear)
    expect(max[2]).toBeCloseTo(dims.apexDistanceMm + 6, 9)
    expect(maxRadiusAt(gear, dims.apexDistanceMm + 6)).toBeLessThanOrEqual(dims.smallEndRootRadiusMm + 1e-9)
  })

  it('has the volume of the frustum, less the bore, plus the hub annulus', () => {
    const k = dims.smallEndScale
    const frustumMm3 = (shoelaceAreaMm2(largeEndOutline(PINION)) * dims.apexDistanceMm * (1 - k ** 3)) / 3
    const boreLengthMm = dims.axialLengthMm + 6
    const boreAreaMm2 = measurements.measureVolume(partOf(group, 'bore')) / boreLengthMm
    const hubAreaMm2 =
      measurements.measureVolume(evaluateOp('primitive.cylinder', { diameter: 2 * dims.smallEndRootRadiusMm, height: 6 })) / 6
    const expectedMm3 = frustumMm3 - boreAreaMm2 * dims.axialLengthMm + (hubAreaMm2 - boreAreaMm2) * 6
    expect(measurements.measureVolume(gear) / expectedMm3).toBeCloseTo(1, 9)
  })

  it('is watertight', () => {
    expect(openEdgesOf(gear).openEdges).toBe(0)
  })

  it('refuses a bore at or past the small end’s root diameter by name', () => {
    for (const boreMm of [2 * dims.smallEndRootRadiusMm, 2 * dims.smallEndRootRadiusMm + 0.5, 1000]) {
      const error = errorOf(() => bevel({ ...PINION, boreMm }))
      expect(error, String(boreMm)).toBeInstanceOf(GearBoreError)
      expect(error.message).toMatch(/small end/)
    }
  })
})

describe('watertight for 8…80 teeth, and for δ near 0° and at the steep end', () => {
  /** @type {[string, Record<string, unknown>][]} */
  const cases = []
  for (const teeth of [8, 20, 40, 80]) {
    cases.push([`${teeth}T / 20T, solid`, { teeth, mateTeeth: 20, moduleMm: 1 }])
    cases.push([`${teeth}T / 20T, bored with a hub`, { teeth, mateTeeth: 20, moduleMm: 1, boreMm: 1.5, hubLengthMm: 3 }])
  }
  // δ = 1°: two equal gears on shafts 2° apart.
  cases.push(['δ ≈ 1°', { teeth: 20, mateTeeth: 20, shaftAngleDeg: 2, moduleMm: 1 }])
  // δ ≈ 84°, the steepest the face-cone cap leaves buildable at this count (89° is refused, below).
  cases.push(['δ ≈ 84°', { teeth: 200, mateTeeth: 21, moduleMm: 1 }])

  it.each(cases)('%s', (_label, params) => {
    const gear = partOf(asGroup(evaluateOp('gear.bevel', params)), 'gear')
    expect(openEdgesOf(makeWatertight(gear)).openEdges).toBe(0)
    expect(openEdgesOf(gear).openEdges).toBe(0)
    expect(measurements.measureVolume(gear)).toBeGreaterThan(0)
  })

  it('is watertight at Print resolution too', () => {
    const gear = partOf(asGroup(evaluateOp('gear.bevel', { teeth: 40, mateTeeth: 20, moduleMm: 1, boreMm: 3, hubLengthMm: 4 }, { policy: policyFor('print') })), 'gear')
    expect(openEdgesOf(gear).openEdges).toBe(0)
  })

  it('refuses δ ≈ 89° by name: its tips’ cone passes the large-end plane, a crown gear (out of scope)', () => {
    // Σ = 120°, 33:17 gives δ ≈ 89.0°.
    const error = errorOf(() => bevel({ teeth: 33, mateTeeth: 17, shaftAngleDeg: 120, moduleMm: 1 }))
    expect(error).toBeInstanceOf(BevelGearError)
    expect(error.code).toBe('crown-gear')
  })
})

describe('V1 parity as a sanity bound, not a match', () => {
  // drive-wheel's `Bevel()` scaled its 32T spur outline (tip Ø = V1's outer R × 2, from the
  // core-040 fixture) down over 15 mm with a hard-wired 45° triangle. The new gear is a
  // *different shape* — a real pitch cone, the virtual gear's tooth — so only its bounds
  // are compared, within 5 %, with the face width chosen to give the same 15 mm height.
  const v1 = /** @type {{ id: string, default: { outerRadiusMm: number } }[]} */ (/** @type {any} */ (v1Gears).cases).find(
    (gear) => gear.id === 'drive-wheel-32T'
  )

  it('lands within 5 % of V1’s bounding box', () => {
    if (!v1) throw new Error('drive-wheel-32T fixture missing')
    const v1SizeMm = [2 * v1.default.outerRadiusMm, 2 * v1.default.outerRadiusMm, 15]
    const params = {
      toothCount: 32,
      mateTeeth: 32,
      circularPitch: (Math.PI * 50) / 32,
      clearance: 0.05,
      backlash: 0.05,
      faceWidthMm: 15 / Math.cos(45 * DEG),
    }
    const [min, max] = boundsOf(partOf(asGroup(evaluateOp('gear.bevel', params)), 'gear'))
    for (let i = 0; i < 3; i++) {
      expect(Math.abs((max[i] - min[i]) / v1SizeMm[i] - 1), `axis ${i}`).toBeLessThan(0.05)
    }
  })
})

describe('hostile input: a named error, before anything is built', () => {
  /** @type {[string, Record<string, unknown>][]} */
  const hostile = [
    ['NaN teeth', { teeth: Number.NaN, mateTeeth: 20, moduleMm: 1 }],
    ['10⁶ teeth', { teeth: 1e6, mateTeeth: 20, moduleMm: 1 }],
    ['2 teeth', { teeth: 2, mateTeeth: 20, moduleMm: 1 }],
    ['2 mate teeth', { teeth: 20, mateTeeth: 2, moduleMm: 1 }],
    ['10⁶ mate teeth', { teeth: 20, mateTeeth: 1e6, moduleMm: 1 }],
    ['missing mateTeeth', { teeth: 20, moduleMm: 1 }],
    ['missing module', { teeth: 20, mateTeeth: 20 }],
    ['Infinity module', { teeth: 20, mateTeeth: 20, moduleMm: Number.POSITIVE_INFINITY }],
    ['pressure angle past the cap', { teeth: 20, mateTeeth: 20, moduleMm: 1, pressureAngleDeg: 40 }],
    ['zero face width', { teeth: 20, mateTeeth: 20, moduleMm: 1, faceWidthMm: 0 }],
    ['NaN hub length', { teeth: 20, mateTeeth: 20, moduleMm: 1, hubLengthMm: Number.NaN }],
    ['negative bore', { teeth: 20, mateTeeth: 20, moduleMm: 1, boreMm: -1 }],
    ['string backlash', { teeth: 20, mateTeeth: 20, moduleMm: 1, backlashMm: '0.1' }],
  ]

  it.each(hostile)('%s is a GearLimitError from the recipe', (_label, params) => {
    const error = errorOf(() => bevel(params))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/^gear\.bevel: /)
  })

  it.each([0, 180, -5, 400])('refuses a %s° shaft angle by name', (shaftAngleDeg) => {
    const error = errorOf(() => bevel({ teeth: 20, mateTeeth: 20, moduleMm: 1, shaftAngleDeg }))
    expect(error).toBeInstanceOf(GearParameterError)
    expect(error.code).toBe('shaft-angle')
    expect(error.message).toMatch(/^gear\.bevel: /)
  })

  it('refuses a face width past the cone distance by name, with the op in front', () => {
    const error = errorOf(() => bevel({ teeth: 20, mateTeeth: 20, moduleMm: 1, faceWidthMm: 100 }))
    expect(error).toBeInstanceOf(BevelGearError)
    expect(error.code).toBe('face-width')
    expect(error.message).toMatch(/^gear\.bevel: /)
  })

  it('refuses V1 profileShift and a center by name (neither is a bevel param)', () => {
    expect(() => bevel({ teeth: 20, mateTeeth: 20, moduleMm: 1, profileShift: 0.2 })).toThrow(/profileShift/)
    expect(() => bevel({ teeth: 20, mateTeeth: 20, moduleMm: 1, center: [0, 0, 0] })).toThrow(/transform\.translate/)
  })

  it('refuses 10⁶ teeth on the native profile.gear bevel section too, in microseconds', () => {
    const started = performance.now()
    const error = errorOf(() => evaluateOp('profile.gear', { kind: 'bevel', teeth: 1e6, moduleMm: 1, pitchConeAngleDeg: 45 }))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/^profile\.gear: /)
    expect(performance.now() - started).toBeLessThan(50)
  })

  it('refuses a bevel section with no pitch cone angle, or an unknown param', () => {
    expect(() => evaluateOp('profile.gear', { kind: 'bevel', teeth: 20, moduleMm: 1 })).toThrow(/pitchConeAngleDeg/)
    expect(() => evaluateOp('profile.gear', { kind: 'bevel', teeth: 20, moduleMm: 1, pitchConeAngleDeg: 45, mateTeeth: 20 })).toThrow(/mateTeeth/)
  })
})

describe('profile.extrudeToApex: the loft every ray of which runs through the apex', () => {
  const square = { id: 'sq', op: 'profile.roundedRectangle', params: { size: [20, 20] } }
  /** @param {Record<string, unknown>} params */
  const loft = (params) => evaluate([square, { id: 'it', op: 'profile.extrudeToApex', target: 'sq', params }]).byId.get('it')

  it('tapers a profile toward the origin: a 20 mm square 10 mm from the apex, lofted 5 mm, is a frustum', () => {
    const solid = /** @type {Geom3} */ (loft({ apexDistanceMm: 10, lengthMm: 5 }))
    const [min, max] = boundsOf(solid)
    expect(min[2]).toBeCloseTo(5, 12)
    expect(max[2]).toBeCloseTo(10, 12)
    expect(maxRadiusAt(solid, 5)).toBeCloseTo(Math.hypot(5, 5), 12)
    expect(measurements.measureVolume(solid)).toBeCloseTo((400 * 10 * (1 - 0.125)) / 3, 9)
    expect(openEdgesOf(solid).openEdges).toBe(0)
  })

  it.each([
    ['a solid operand', [{ id: 'sq', op: 'primitive.cuboid', params: { size: [5, 5, 5] } }], { apexDistanceMm: 10, lengthMm: 5 }, /2D profile/],
    ['a length reaching the apex', [square], { apexDistanceMm: 10, lengthMm: 10 }, /lengthMm/],
    ['a zero apex distance', [square], { apexDistanceMm: 0, lengthMm: 1 }, /apexDistanceMm/],
    ['a bore wider than the small end', [square], { apexDistanceMm: 10, lengthMm: 5, boreMm: 12 }, /boreMm/],
    ['a hub with no diameter', [square], { apexDistanceMm: 10, lengthMm: 5, hubLengthMm: 2 }, /hubDiameterMm/],
    ['a hub narrower than its bore', [square], { apexDistanceMm: 10, lengthMm: 5, boreMm: 4, hubLengthMm: 2, hubDiameterMm: 3 }, /hubDiameterMm/],
  ])('refuses %s', (_label, before, params, message) => {
    const records = [...before, { id: 'it', op: 'profile.extrudeToApex', target: 'sq', params }]
    expect(() => evaluate(records).byId.get('it')).toThrow(message)
  })

  it('refuses a bore when the apex axis is not inside the profile', () => {
    const offset = { id: 'sq', op: 'profile.roundedRectangle', params: { size: [4, 4], center: [20, 0] } }
    expect(() =>
      evaluate([offset, { id: 'it', op: 'profile.extrudeToApex', target: 'sq', params: { apexDistanceMm: 10, lengthMm: 2, boreMm: 1 } }]).byId.get('it')
    ).toThrow(/axis/)
  })
})
