// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { GearAliasError } from '../../gear/aliases.js'
import { GearParameterError } from '../../gear/dimensions.js'
import { GearMeshError, ringGearDimensions } from '../../gear/internal.js'
import { GearLimitError } from '../../gear/limits.js'
import { boundsOf, isGroup } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { registry } from '../registry.js'
import { policyFor } from '../tessellation.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { ring } from './gear.ring.js'
import ringSource from './gear.ring.js?raw'

const { booleans, geometries, measurements, transforms } = modeling

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
    return /** @type {Error} */ (error)
  }
  throw new Error('expected an error, nothing was thrown')
}

describe('the gear.ring recipe expands into records, it builds nothing', () => {
  it('expands to profile.gear (internal) → extrude → centre, plus the bore and pitch references', () => {
    const dims = ringGearDimensions({ teeth: 64, moduleMm: 2 })
    expect(ring({ teeth: 64, moduleMm: 2, thicknessMm: 8 })).toEqual([
      { id: 'profile', op: 'profile.gear', params: { kind: 'internal', teeth: 64, moduleMm: 2 } },
      { id: 'blank', op: 'profile.extrudeLinear', target: 'profile', params: { height: 8 } },
      { id: 'gear', op: 'transform.translate', target: 'blank', params: { vector: [0, 0, -4] }, name: 'gear' },
      { id: 'bore', op: 'primitive.cylinder', params: { diameter: 2 * dims.tipRadiusMm, height: 8 }, name: 'bore', hidden: true },
      { id: 'pitch', op: 'primitive.cylinder', params: { diameter: 128, height: 8 }, name: 'pitch', hidden: true },
    ])
  })

  it('carries every profile param onto the profile record, and none placement- or resolution-shaped', () => {
    const [profile] = ring({
      teeth: 64,
      moduleMm: 1.5,
      pressureAngleDeg: 25,
      clearanceMm: 0.2,
      backlashMm: 0.1,
      rimThicknessMm: 3,
      thicknessMm: 6,
    })
    expect(profile.params).toEqual({ kind: 'internal', teeth: 64, moduleMm: 1.5, pressureAngleDeg: 25, clearanceMm: 0.2, backlashMm: 0.1, rimThicknessMm: 3 })
  })

  it('makes a helical ring from the transverse section plus a twist, both hands, nothing at β = 0', () => {
    const right = ring({ teeth: 64, moduleMm: 2, thicknessMm: 10, helixAngleDeg: 15 })
    const left = ring({ teeth: 64, moduleMm: 2, thicknessMm: 10, helixAngleDeg: 15, handedness: 'left' })
    expect(right[0].params?.helixAngleDeg).toBe(15)
    const r = ringGearDimensions({ teeth: 64, moduleMm: 2, helixAngleDeg: 15 }).pitchRadiusMm
    const twistDeg = ((10 * Math.tan((15 * Math.PI) / 180)) / r) * (180 / Math.PI)
    expect(right[1].params?.twistDeg).toBeCloseTo(twistDeg, 12)
    expect(left[1].params?.twistDeg).toBeCloseTo(-twistDeg, 12)
    expect(ring({ teeth: 64, moduleMm: 2, thicknessMm: 10, helixAngleDeg: 0, handedness: 'left' })).toEqual(ring({ teeth: 64, moduleMm: 2, thicknessMm: 10 }))
  })

  it('takes V1 vocabulary: a negative toothCount is the ring (Decision 5 defect 3)', () => {
    const [profile] = ring({ toothCount: -96, circularPitch: (Math.PI * 50) / 96, thicknessMm: 3 })
    expect(profile.params?.teeth).toBe(96)
    expect(profile.params?.moduleMm).toBeCloseTo(50 / 96, 12)
    expect(profile.params?.clearanceMm).toBe(0)
  })

  it('refuses V1’s connectedGear by name: a ring is defined by its own parameters', () => {
    const error = errorOf(() => ring({ toothCount: -96, circularPitch: 1.6, thicknessMm: 3, connectedGear: { toothCount: 14 } }))
    expect(error).toBeInstanceOf(GearAliasError)
    expect(error.code).toBe('connected-gear')
  })

  it('refuses a positive or zero V1 toothCount: those were V1’s external gear and rack', () => {
    expect(errorOf(() => ring({ toothCount: 96, circularPitch: 1.6, thicknessMm: 3 })).code).toBe('external-gear')
    expect(errorOf(() => ring({ toothCount: 0, circularPitch: 1.6, thicknessMm: 3 })).code).toBe('rack')
  })

  it('is a 0-operand composite with no ui yet (ui-057 makes it a Library row)', () => {
    expect(registry['gear.ring']).toMatchObject({ kind: 'composite', operandCount: 0 })
    expect(registry['gear.ring'].ui).toBeUndefined()
    expect(expand('gear.ring', { teeth: 64, moduleMm: 2, thicknessMm: 8 })).toEqual(ring({ teeth: 64, moduleMm: 2, thicknessMm: 8 }))
  })

  it('emits only ops the registry knows, as JSON, and never imports @jscad/modeling', () => {
    for (const record of ring({ teeth: 64, moduleMm: 2, thicknessMm: 8, helixAngleDeg: 20 })) {
      expect(registry[record.op], record.op).toBeDefined()
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
    expect(ringSource).not.toMatch(/from\s+['"]@jscad\/modeling/)
  })
})

describe('folding gear.ring gives the ring its dimensions describe', () => {
  const params = { teeth: 64, moduleMm: 2, thicknessMm: 8, backlashMm: 0.1 }
  const dims = ringGearDimensions(params)
  const group = asGroup(evaluateOp('gear.ring', params))
  const gear = partOf(group, 'gear')

  it('names gear, bore and pitch, with only the toothed ring visible', () => {
    expect(Object.keys(group.parts).sort()).toEqual(['bore', 'gear', 'pitch'])
    expect(group.names).toEqual(['gear'])
  })

  it('sits centred on the origin, axis Z, mid-thickness at Z = 0, rim OD = root + rim', () => {
    const [min, max] = boundsOf(gear)
    expect(min[2]).toBeCloseTo(-4, 9)
    expect(max[2]).toBeCloseTo(4, 9)
    expect(max[0]).toBeCloseTo(dims.rimOuterRadiusMm, 6)
    expect(-min[0]).toBeLessThanOrEqual(dims.rimOuterRadiusMm + 1e-6)
  })

  it('has ring tooth 0 on +X: a vertex at (tip radius, 0)', () => {
    const onPlusX = geometries.geom3
      .toPolygons(gear)
      .flatMap((polygon) => polygon.vertices)
      .some(([x, y]) => Math.abs(x - dims.tipRadiusMm) < 1e-6 && Math.abs(y) < 1e-6)
    expect(onPlusX).toBe(true)
  })

  it('has a volume between the tip-circle and root-circle annuli', () => {
    const volumeMm3 = measurements.measureVolume(gear)
    const annulus = (/** @type {number} */ innerMm) => 8 * Math.PI * (dims.rimOuterRadiusMm ** 2 - innerMm ** 2)
    expect(volumeMm3).toBeLessThan(annulus(dims.tipRadiusMm))
    expect(volumeMm3).toBeGreaterThan(annulus(dims.rootRadiusMm))
  })

  it('makes the bore the clear space inside the tips and the pitch part the pitch cylinder', () => {
    const [bMin, bMax] = boundsOf(partOf(group, 'bore'))
    expect(bMax[0] - bMin[0]).toBeCloseTo(2 * dims.tipRadiusMm, 6)
    const [pMin, pMax] = boundsOf(partOf(group, 'pitch'))
    expect(pMax[0] - pMin[0]).toBeCloseTo(dims.pitchDiameterMm, 6)
    // The bore never touches the teeth.
    expect(measurements.measureVolume(booleans.intersect(partOf(group, 'bore'), gear))).toBeLessThan(1e-6)
  })
})

describe('watertight on every ring the task names', () => {
  /** @type {[string, Record<string, unknown>][]} */
  const cases = [
    ['96T, the gear-set example', { toothCount: -96, circularPitch: (Math.PI * 50) / 96, thicknessMm: 3 }],
    ['64T, the drive-wheel', { toothCount: -64, circularPitch: (Math.PI * 82.5) / 64, clearance: 0.05, backlash: 0.05, thicknessMm: 15 }],
    ['30T, tip truncated at the base circle', { teeth: 30, moduleMm: 1, thicknessMm: 4 }],
    ['7T, the smallest that meshes at 20°', { teeth: 7, moduleMm: 2, thicknessMm: 4 }],
    ['200T', { teeth: 200, moduleMm: 1, thicknessMm: 4 }],
    ['40T at 5°', { teeth: 40, moduleMm: 1, pressureAngleDeg: 5, thicknessMm: 4 }],
    ['64T at 35°', { teeth: 64, moduleMm: 1, pressureAngleDeg: 35, thicknessMm: 4 }],
    ['64T helical 20°', { teeth: 64, moduleMm: 1, thicknessMm: 6, helixAngleDeg: 20 }],
    ['64T herringbone', { teeth: 64, moduleMm: 1, thicknessMm: 6, helixAngleDeg: 20, herringbone: true }],
    ['64T, a 0.3 mm rim', { teeth: 64, moduleMm: 1, thicknessMm: 4, rimThicknessMm: 0.3 }],
  ]
  it.each(cases)('%s', (_label, params) => {
    const gear = partOf(asGroup(evaluateOp('gear.ring', params)), 'gear')
    expect(openEdgesOf(makeWatertight(gear)).openEdges).toBe(0)
    expect(measurements.measureVolume(gear)).toBeGreaterThan(0)
  })
})

describe('meshing proof: a ring and a gear.spur pinion never interpenetrate', () => {
  // Centre distance m·(Zring − Zpinion)/2; the pinion is turned half a tooth so a space of
  // it faces ring tooth 0 on +X (core-044's phase), and the pair turns together, the ring by
  // Zp/Zr of the pinion's angle, same sense (an internal pair does not reverse). Twelve
  // angles across one pinion tooth cover every relative position, since the pair repeats
  // each tooth. Sampled at Fine so chord sag (≤ 0.02 mm) stays inside the backlash.
  const policy = policyFor('fine')

  /**
   * @param {{ ringTeeth: number, pinionTeeth: number, moduleMm: number, backlashMm: number, clearanceMm?: number, phaseTeeth?: number }} pair
   * @returns {number[]} intersect volume, mm³, at each angle
   */
  function overlapVolumesMm3({ ringTeeth, pinionTeeth, moduleMm, backlashMm, clearanceMm, phaseTeeth = 0.5 }) {
    const shared = { moduleMm, backlashMm, thicknessMm: 2, ...(clearanceMm === undefined ? {} : { clearanceMm }) }
    const ringGear = partOf(asGroup(evaluateOp('gear.ring', { ...shared, teeth: ringTeeth }, { policy })), 'gear')
    const pinion = partOf(asGroup(evaluateOp('gear.spur', { ...shared, teeth: pinionTeeth }, { policy })), 'gear')
    const centreMm = (moduleMm * (ringTeeth - pinionTeeth)) / 2
    /** @type {number[]} */
    const volumes = []
    for (let k = 0; k < 12; k++) {
      const pinionRad = ((2 * Math.PI) / pinionTeeth) * (k / 12)
      const ringRad = (pinionRad * pinionTeeth) / ringTeeth
      const placed = transforms.translate([centreMm, 0, 0], transforms.rotateZ((phaseTeeth * 2 * Math.PI) / pinionTeeth + pinionRad, pinion))
      volumes.push(measurements.measureVolume(booleans.intersect(transforms.rotateZ(ringRad, ringGear), placed)))
    }
    return volumes
  }

  it('drive-wheel: 64T ring, 14T pinion, clearance 0.05, V1 backlash 0.05 — zero overlap at 12 angles', () => {
    const backlashMm = (2 * 0.05) / Math.cos((20 * Math.PI) / 180)
    const volumes = overlapVolumesMm3({ ringTeeth: 64, pinionTeeth: 14, moduleMm: 82.5 / 64, clearanceMm: 0.05, backlashMm })
    for (const [k, v] of volumes.entries()) expect(v, `angle ${k}`).toBeLessThan(1e-4)
  })

  it('gear-set: 96T ring, 14T pinion at 0.05 mm backlash — zero overlap at 12 angles', () => {
    const volumes = overlapVolumesMm3({ ringTeeth: 96, pinionTeeth: 14, moduleMm: 50 / 96, backlashMm: 0.05 })
    for (const [k, v] of volumes.entries()) expect(v, `angle ${k}`).toBeLessThan(1e-4)
  })

  it('negative control: a pinion the readout flags (60T in a 64T ring) does interpenetrate', () => {
    expect(Math.max(...overlapVolumesMm3({ ringTeeth: 64, pinionTeeth: 60, moduleMm: 1, backlashMm: 0.1 }))).toBeGreaterThan(0.01)
  })

  it('negative control: the same 64T/14T pair without the half-tooth phase does interpenetrate', () => {
    expect(Math.max(...overlapVolumesMm3({ ringTeeth: 64, pinionTeeth: 14, moduleMm: 1, backlashMm: 0.1, phaseTeeth: 0 }))).toBeGreaterThan(0.1)
  })
})

describe('hostile input: a named error, checked before the profile is built', () => {
  /** @type {[string, Record<string, unknown>][]} */
  const hostile = [
    ['NaN teeth', { teeth: Number.NaN, moduleMm: 2, thicknessMm: 6 }],
    ['10⁶ teeth', { teeth: 1e6, moduleMm: 2, thicknessMm: 6 }],
    ['Infinity module', { teeth: 64, moduleMm: Number.POSITIVE_INFINITY, thicknessMm: 6 }],
    ['zero thickness', { teeth: 64, moduleMm: 2, thicknessMm: 0 }],
    ['missing thickness', { teeth: 64, moduleMm: 2 }],
    ['0 mm rim', { teeth: 64, moduleMm: 2, thicknessMm: 6, rimThicknessMm: 0 }],
    ['negative rim', { teeth: 64, moduleMm: 2, thicknessMm: 6, rimThicknessMm: -2 }],
    ['Infinity rim', { teeth: 64, moduleMm: 2, thicknessMm: 6, rimThicknessMm: Number.POSITIVE_INFINITY }],
    ['string backlash', { teeth: 64, moduleMm: 2, thicknessMm: 6, backlashMm: '0.1' }],
    ['negative helix', { teeth: 64, moduleMm: 2, thicknessMm: 6, helixAngleDeg: -10 }],
  ]

  it.each(hostile)('%s is a GearLimitError from the recipe', (_label, params) => {
    const error = errorOf(() => ring(params))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/^gear\.ring: /)
  })

  it('refuses 10⁶ teeth on profile.gear (internal) too, before any outline is sampled', () => {
    const started = performance.now()
    const error = errorOf(() => evaluateOp('profile.gear', { kind: 'internal', teeth: 1e6, moduleMm: 2 }))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(performance.now() - started).toBeLessThan(50)
  })

  it('refuses a ring too small to mesh with any pinion by its named code, with the op in front', () => {
    const error = errorOf(() => ring({ teeth: 6, moduleMm: 2, thicknessMm: 6 }))
    expect(error).toBeInstanceOf(GearMeshError)
    expect(error.code).toBe('no-pinion-fits')
    expect(error.message).toMatch(/^gear\.ring: /)
  })

  it('refuses a param a ring has no use for — profileShift, boreMm, center — by name', () => {
    for (const extra of [{ profileShift: 0.2 }, { boreMm: 5 }, { center: [0, 0, 0] }]) {
      expect(() => ring({ teeth: 64, moduleMm: 2, thicknessMm: 6, ...extra }), JSON.stringify(extra)).toThrow(GearParameterError)
    }
  })

  it('refuses an unknown kind on profile.gear', () => {
    expect(() => evaluateOp('profile.gear', { kind: 'bevel', teeth: 20, moduleMm: 2 })).toThrow(/kind/)
  })
})
