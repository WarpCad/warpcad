// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { GearAliasError } from '../../gear/aliases.js'
import { BevelGearError, bevelGearDimensions } from '../../gear/bevel.js'
import { GearBoreError, GearLimitError } from '../../gear/limits.js'
import { bevelMeshPlacement } from '../../gear/mesh.js'
import { boundsOf, isGroup } from '../group.js'
import { evaluate, evaluateOp, expand } from '../index.js'
import { registry } from '../registry.js'
import { policyFor } from '../tessellation.js'
import { BEVEL_PAIR_PARAMS, bevelPair } from './gear.bevelPair.js'
import bevelPairSource from './gear.bevelPair.js?raw'
import train from './__fixtures__/gear.bevelPair.drive-wheel-train.json'

const { booleans, geometries, maths, measurements, transforms } = modeling
const DEG = Math.PI / 180

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */
/** @typedef {[number, number, number]} Vec3 */

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
 * @returns {Error & { code?: string, param?: string }}
 */
function errorOf(fn) {
  try {
    fn()
  } catch (error) {
    return /** @type {Error} */ (error)
  }
  throw new Error('expected an error, nothing was thrown')
}

/**
 * A turn of `rad` about `axis` through the origin — where every gear here has its apex.
 *
 * @param {readonly number[]} axis
 * @param {number} rad
 * @param {Geom3} solid
 * @returns {Geom3}
 */
function turnAbout(axis, rad, solid) {
  if (rad === 0) return solid
  return transforms.transform(maths.mat4.fromRotation(maths.mat4.create(), rad, /** @type {Vec3} */ ([...axis])), solid)
}

/** @param {Geom3} solid */
function centreOf(solid) {
  const [min, max] = boundsOf(solid)
  return [0, 1, 2].map((i) => (min[i] + max[i]) / 2)
}

/**
 * How far the furthest flank, tip or root face of a bevel body passes from `pointMm`, and how
 * many such faces there are. An end cap (normal along `axis`) does not pass through the apex.
 *
 * @param {Geom3} solid
 * @param {readonly number[]} axis
 * @param {readonly number[]} pointMm
 */
function wallsThrough(solid, axis, pointMm) {
  let walls = 0
  let worstMm = 0
  for (const polygon of geometries.geom3.toPolygons(solid)) {
    const [nx, ny, nz, w] = geometries.poly3.plane(polygon)
    if (Math.abs(Math.abs(nx * axis[0] + ny * axis[1] + nz * axis[2]) - 1) < 1e-9) continue
    walls++
    worstMm = Math.max(worstMm, Math.abs(nx * pointMm[0] + ny * pointMm[1] + nz * pointMm[2] - w))
  }
  return { walls, worstMm }
}

/**
 * `transform.rotate`'s matrix for `angles` (degrees) applied to a point: X first, then Y,
 * then Z, the Tait-Bryan order `@jscad/modeling`'s `rotate` uses.
 *
 * @param {readonly number[]} angles
 * @param {readonly number[]} p
 * @returns {number[]}
 */
function rotateByDeg(angles, p) {
  const [a, b, c] = angles.map((x) => x * DEG)
  let [x, y, z] = p
  ;[y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]
  ;[x, z] = [x * Math.cos(b) + z * Math.sin(b), -x * Math.sin(b) + z * Math.cos(b)]
  ;[x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)]
  return [x, y, z]
}

/** @param {number} shaftAngleDeg */
const pinionAxisFor = (shaftAngleDeg) => [Math.sin(shaftAngleDeg * DEG), 0, Math.cos(shaftAngleDeg * DEG)]

describe('the gear.bevelPair recipe expands into records, it builds nothing', () => {
  it('is two gear.bevel records, and a turn about its own axis then a stand-up turn for the pinion — both from mesh.js', () => {
    const placed = bevelMeshPlacement({ teeth: 32, mateTeeth: 16, moduleMm: 2 }, { teeth: 16, mateTeeth: 32, moduleMm: 2 })
    expect(bevelPair({ driveTeeth: 32, pinionTeeth: 16, moduleMm: 2 })).toEqual([
      { id: 'driveGear', op: 'gear.bevel', params: { teeth: 32, mateTeeth: 16, moduleMm: 2 }, name: 'drive' },
      { id: 'pinionGear', op: 'gear.bevel', params: { teeth: 16, mateTeeth: 32, moduleMm: 2 } },
      { id: 'pinionTurned', op: 'transform.rotate', target: 'pinionGear', params: { angles: [0, 0, placed.phaseDeg] } },
      { id: 'pinion', op: 'transform.rotate', target: 'pinionTurned', params: { angles: [...placed.rotateDeg] }, name: 'pinion' },
    ])
  })

  it('stands the pinion up by Σ about +Y — no translate, so both apexes stay on the origin', () => {
    for (const shaftAngleDeg of [60, 90, 120]) {
      const records = bevelPair({ driveTeeth: 24, pinionTeeth: 32, moduleMm: 1, shaftAngleDeg })
      expect(records.map((r) => r.op)).not.toContain('transform.translate')
      const angles = /** @type {number[]} */ (records[3].params?.angles)
      expect(angles).toEqual([expect.closeTo(0, 9), expect.closeTo(shaftAngleDeg, 9), expect.closeTo(0, 9)])
    }
  })

  it('shares module, shaft angle, face width and tooth form; keeps each bore and hub its own', () => {
    const [drive, pinion] = bevelPair({
      driveTeeth: 30,
      pinionTeeth: 15,
      moduleMm: 2,
      shaftAngleDeg: 80,
      faceWidthMm: 8,
      pressureAngleDeg: 25,
      clearanceMm: 0.3,
      backlashMm: 0.1,
      driveBoreMm: 8,
      pinionBoreMm: 4,
      driveHubLengthMm: 5,
      pinionHubLengthMm: 3,
    })
    const shared = { moduleMm: 2, shaftAngleDeg: 80, faceWidthMm: 8, pressureAngleDeg: 25, clearanceMm: 0.3, backlashMm: 0.1 }
    expect(drive.params).toEqual({ ...shared, teeth: 30, mateTeeth: 15, boreMm: 8, hubLengthMm: 5 })
    expect(pinion.params).toEqual({ ...shared, teeth: 15, mateTeeth: 30, boreMm: 4, hubLengthMm: 3 })
  })

  it('accepts the TODO’s `module` spelling through the gear alias table', () => {
    expect(bevelPair({ driveTeeth: 20, pinionTeeth: 10, module: 2 })[0].params?.moduleMm).toBe(2)
  })

  it('lists its params, canonical spelling', () => {
    expect([...BEVEL_PAIR_PARAMS].sort()).toEqual(
      [
        'driveTeeth',
        'pinionTeeth',
        'moduleMm',
        'shaftAngleDeg',
        'faceWidthMm',
        'pressureAngleDeg',
        'clearanceMm',
        'backlashMm',
        'driveBoreMm',
        'pinionBoreMm',
        'driveHubLengthMm',
        'pinionHubLengthMm',
      ].sort()
    )
  })

  it('is what expand() returns, emits only registered ops and JSON values, and imports no @jscad/modeling', () => {
    const params = { driveTeeth: 20, pinionTeeth: 10, moduleMm: 2 }
    expect(expand('gear.bevelPair', params)).toEqual(bevelPair(params))
    for (const record of bevelPair({ ...params, driveBoreMm: 3 })) {
      expect(registry[record.op], record.op).toBeDefined()
      expect(JSON.parse(JSON.stringify(record))).toEqual(record)
    }
    expect(bevelPairSource).not.toMatch(/from\s+['"]@jscad\/modeling/)
  })

  it('is a 0-operand composite with no ui — ui-057 gives it its Library row', () => {
    expect(registry['gear.bevelPair']).toMatchObject({ kind: 'composite', operandCount: 0 })
    expect(registry['gear.bevelPair'].ui).toBeUndefined()
  })
})

describe('built: the two apexes coincide, the cone angles sum to Σ', () => {
  const policy = policyFor('draft')

  it.each([60, 90, 120])('Σ = %s°: each gear’s own apex part sits on the origin within 1e-6 mm', (shaftAngleDeg) => {
    const params = { driveTeeth: 24, pinionTeeth: 32, moduleMm: 1, shaftAngleDeg }
    const { byId } = evaluate(bevelPair(params), { policy })
    for (const id of ['driveGear', 'pinion']) {
      const apex = partOf(asGroup(byId.get(id)), 'apex')
      for (const c of centreOf(apex)) expect(Math.abs(c), id).toBeLessThan(1e-6)
    }
  })

  it.each([60, 90, 120])('Σ = %s°: δ_drive + δ_pinion = Σ within 1e-9, from the records the recipe wrote', (shaftAngleDeg) => {
    const [drive, pinion] = bevelPair({ driveTeeth: 24, pinionTeeth: 32, moduleMm: 1, shaftAngleDeg })
    const sum =
      bevelGearDimensions(/** @type {any} */ (drive.params)).pitchConeAngleDeg + bevelGearDimensions(/** @type {any} */ (pinion.params)).pitchConeAngleDeg
    expect(Math.abs(sum - shaftAngleDeg)).toBeLessThan(1e-9)
  })

  it('every flank of both built gears is a plane through the shared apex (within 1e-6 mm), the pinion’s axis Σ from the drive’s', () => {
    const group = asGroup(evaluateOp('gear.bevelPair', { driveTeeth: 16, pinionTeeth: 32, moduleMm: 2, shaftAngleDeg: 60 }, { policy }))
    expect(group.names).toEqual(['drive', 'pinion'])
    for (const [name, axis, teeth] of /** @type {const} */ ([
      ['drive', [0, 0, 1], 16],
      ['pinion', pinionAxisFor(60), 32],
    ])) {
      const { walls, worstMm } = wallsThrough(partOf(group, name), axis, [0, 0, 0])
      expect(walls, name).toBeGreaterThan(teeth * 8)
      expect(worstMm, name).toBeLessThan(1e-6)
      const centre = centreOf(partOf(group, name))
      const along = (centre[0] * axis[0] + centre[1] * axis[1] + centre[2] * axis[2]) / Math.hypot(...centre)
      expect(along, name).toBeGreaterThan(0.99)
    }
  })
})

describe('interference proof: a gear.bevelPair never interpenetrates as it turns', () => {
  // Fine sampling keeps chord sag (≤ 0.02 mm) inside the 0.1 mm backlash. The drive turns
  // across one of its teeth in 12 steps, the pinion turns back by z_drive / z_pinion of each
  // step about its own axis (through the shared apex), and the two bodies are intersected.
  const policy = policyFor('fine')

  /**
   * @param {Record<string, unknown>} params gear.bevelPair params
   * @param {{ extraPinionDeg?: number }} [options] A deliberate phase error.
   * @returns {number[]} intersect volume, mm³, at each of 12 drive angles
   */
  function overlapVolumesMm3(params, { extraPinionDeg = 0 } = {}) {
    const zDrive = /** @type {number} */ (params.driveTeeth)
    const zPinion = /** @type {number} */ (params.pinionTeeth)
    const pinionAxis = pinionAxisFor(/** @type {number} */ (params.shaftAngleDeg ?? 90))
    const group = asGroup(evaluateOp('gear.bevelPair', params, { policy }))
    const drive = partOf(group, 'drive')
    const pinion = partOf(group, 'pinion')
    /** @type {number[]} */
    const volumes = []
    for (let k = 0; k < 12; k++) {
      const driveRad = ((2 * Math.PI) / zDrive) * (k / 12)
      const pinionRad = (-driveRad * zDrive) / zPinion + extraPinionDeg * DEG
      volumes.push(measurements.measureVolume(booleans.intersect(transforms.rotateZ(driveRad, drive), turnAbout(pinionAxis, pinionRad, pinion))))
    }
    return volumes
  }

  const PAIR_90 = { driveTeeth: 16, pinionTeeth: 32, moduleMm: 2, backlashMm: 0.1 }

  it('16T/32T on 90° shafts — zero overlap at 12 angles', () => {
    for (const [k, v] of overlapVolumesMm3(PAIR_90).entries()) expect(v, `angle ${k}`).toBeLessThan(1e-4)
  })

  it('16T/32T on 60° shafts — zero overlap at 12 angles', () => {
    for (const [k, v] of overlapVolumesMm3({ ...PAIR_90, shaftAngleDeg: 60 }).entries()) expect(v, `angle ${k}`).toBeLessThan(1e-4)
  })

  it('24T/32T on 120° shafts — zero overlap at 12 angles (16T/32T is exactly the crown limit at 120°, refused below)', () => {
    const volumes = overlapVolumesMm3({ driveTeeth: 24, pinionTeeth: 32, moduleMm: 2, backlashMm: 0.1, shaftAngleDeg: 120 })
    for (const [k, v] of volumes.entries()) expect(v, `angle ${k}`).toBeLessThan(1e-4)
  })

  it.each([
    ['16T/32T at 90°', PAIR_90],
    ['16T/32T at 60°', { ...PAIR_90, shaftAngleDeg: 60 }],
    ['24T/32T at 120°', { driveTeeth: 24, pinionTeeth: 32, moduleMm: 2, backlashMm: 0.1, shaftAngleDeg: 120 }],
  ])('negative control: %s half a pinion tooth out of phase does interpenetrate', (_label, params) => {
    const volumes = overlapVolumesMm3(params, { extraPinionDeg: 180 / /** @type {number} */ (params.pinionTeeth) })
    expect(Math.min(...volumes)).toBeGreaterThan(1)
  })
})

describe('integration: drive-wheel’s four-bevel train from two pairs and one turn — no fudge offsets', () => {
  // V1 placed these four 32T bevels with rotateY(±90/180) and snap(..., ±addendum); here the
  // document is two gear.bevelPair lines and a 180° turn (the fixture). Every gear's apex is
  // on the origin, the four mesh pairs never interpenetrate as the train rolls, and the two
  // opposed pairs never touch.
  const policy = policyFor('fine')
  const { byId } = evaluate(/** @type {any} */ (train.records), { policy })
  /** @typedef {keyof typeof train.gears} GearName */
  /** @param {GearName} name */
  const solidOf = (name) => partOf(asGroup(byId.get(train.gears[name].record)), train.gears[name].part)
  /** @param {GearName} name */
  const axisOf = (name) => train.gears[name].axis
  // Every 32T gear turns ±θ about its own axis (apex → large end) as the train rolls:
  // base +, drive −, antidrive −, top + (each mesh reverses the sense, ratio −1).
  /** @type {Record<GearName, number>} */
  const sense = { base: 1, drive: -1, antidrive: -1, top: 1 }
  /** @param {GearName} name @param {number} rad */
  const rolled = (name, rad) => turnAbout(axisOf(name), sense[name] * rad, solidOf(name))

  it('puts all four apexes on the expected point: every flank of every gear passes through it within 1e-6 mm', () => {
    for (const name of /** @type {GearName[]} */ (Object.keys(train.gears))) {
      const { walls, worstMm } = wallsThrough(solidOf(name), axisOf(name), train.apexMm)
      expect(walls, name).toBeGreaterThan(32 * 8)
      expect(worstMm, name).toBeLessThan(1e-6)
      const centre = centreOf(solidOf(name))
      const axis = axisOf(name)
      expect((centre[0] * axis[0] + centre[1] * axis[1] + centre[2] * axis[2]) / Math.hypot(...centre), name).toBeGreaterThan(0.99)
    }
  })

  it('has no meshing pair with non-zero intersection volume, at 12 angles across one tooth', () => {
    for (let k = 0; k < 12; k++) {
      const rad = ((2 * Math.PI) / 32) * (k / 12)
      for (const [a, b] of /** @type {[GearName, GearName][]} */ (train.meshes)) {
        expect(measurements.measureVolume(booleans.intersect(rolled(a, rad), rolled(b, rad))), `${a}/${b} at step ${k}`).toBeLessThan(1e-4)
      }
    }
  })

  it('keeps the opposed gears (base/top, drive/antidrive) apart', () => {
    for (const [a, b] of /** @type {[GearName, GearName][]} */ (train.opposed)) {
      expect(measurements.measureVolume(booleans.intersect(solidOf(a), solidOf(b))), `${a}/${b}`).toBe(0)
    }
  })

  it('negative control: the top gear half a tooth out of phase strikes both side gears', () => {
    const wrongTop = turnAbout(axisOf('top'), (180 / 32) * DEG, solidOf('top'))
    for (const side of /** @type {GearName[]} */ (['drive', 'antidrive'])) {
      expect(measurements.measureVolume(booleans.intersect(wrongTop, solidOf(side))), side).toBeGreaterThan(1)
    }
  })

  it('composes: meshing the top gear to the drive with mesh.js lands it exactly where the 180° turn put it (modulo a tooth)', () => {
    const [first] = train.records
    const records = bevelPair(/** @type {Record<string, unknown>} */ (first.params))
    const pinionFrame = {
      apexMm: /** @type {Vec3} */ ([0, 0, 0]),
      rotateDeg: /** @type {Vec3} */ (records[3].params?.angles),
      phaseDeg: /** @type {number[]} */ (records[2].params?.angles)[2],
    }
    const gear = { teeth: 32, mateTeeth: 32, moduleMm: 1.5625 }
    const top = bevelMeshPlacement({ ...gear, frame: pinionFrame }, gear)
    expect(top.axis).toEqual([expect.closeTo(0, 12), expect.closeTo(0, 12), expect.closeTo(-1, 12)])
    // The document's top is the second pair's drive (phase 0) turned 180° about Y: tooth 0 on −X.
    // mesh.js's top must put tooth 0 there too, or on another tooth: a whole number of pitches round.
    const x = rotateByDeg(top.rotateDeg, rotateByDeg([0, 0, top.phaseDeg], [1, 0, 0]))
    expect(x[2]).toBeCloseTo(0, 12)
    const pitch = 360 / 32
    const offset = ((((Math.atan2(x[1], x[0]) / DEG - 180) % pitch) + pitch) % pitch)
    expect(Math.min(offset, pitch - offset)).toBeLessThan(1e-9)
  })
})

describe('degenerate and hostile params: a named error before any record is emitted', () => {
  const BASE = { driveTeeth: 32, pinionTeeth: 16, moduleMm: 2 }

  it('equal teeth on 90° shafts: a miter pair, δ = 45° each', () => {
    const [drive, pinion] = bevelPair({ driveTeeth: 20, pinionTeeth: 20, moduleMm: 1 })
    expect(bevelGearDimensions(/** @type {any} */ (drive.params)).pitchConeAngleDeg).toBeCloseTo(45, 12)
    expect(bevelGearDimensions(/** @type {any} */ (pinion.params)).pitchConeAngleDeg).toBeCloseTo(45, 12)
  })

  it.each([
    ['z₁ ≫ z₂ on 90° shafts (the drive’s face cone past 85°)', { driveTeeth: 200, pinionTeeth: 10, moduleMm: 1 }, /drive/],
    ['16T/32T on 120° shafts (the 32T at exactly δ = 90°)', { driveTeeth: 16, pinionTeeth: 32, moduleMm: 1, shaftAngleDeg: 120 }, /pinion/],
  ])('a crown limit is refused by name: %s', (_label, params, which) => {
    const error = errorOf(() => bevelPair(params))
    expect(error).toBeInstanceOf(BevelGearError)
    expect(error.code).toBe('crown-gear')
    expect(error.message).toMatch(/^gear\.bevelPair: /)
    expect(error.message).toMatch(which)
  })

  /** @type {[string, Record<string, unknown>][]} */
  const limits = [
    ['10⁶ drive teeth', { ...BASE, driveTeeth: 1e6 }],
    ['NaN pinion teeth', { ...BASE, pinionTeeth: Number.NaN }],
    ['missing pinion teeth', { driveTeeth: 32, moduleMm: 2 }],
    ['missing module', { driveTeeth: 32, pinionTeeth: 16 }],
    ['Infinity module', { ...BASE, moduleMm: Number.POSITIVE_INFINITY }],
    ['zero face width', { ...BASE, faceWidthMm: 0 }],
    ['a string backlash', { ...BASE, backlashMm: '0.1' }],
    ['a negative drive bore', { ...BASE, driveBoreMm: -3 }],
    ['a NaN pinion hub', { ...BASE, pinionHubLengthMm: Number.NaN }],
  ]

  it.each(limits)('%s is a GearLimitError named for gear.bevelPair, fast', (_label, params) => {
    const started = performance.now()
    const error = errorOf(() => bevelPair(params))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/^gear\.bevelPair: /)
    expect(performance.now() - started).toBeLessThan(50)
  })

  it.each([
    ['teeth', 'unknown-param'],
    ['mateTeeth', 'unknown-param'],
    ['boreMm', 'unknown-param'],
    ['hubLengthMm', 'unknown-param'],
    ['center', 'center'],
  ])('refuses %s by name (%s) — a pair has one of each per gear', (key, code) => {
    const error = errorOf(() => bevelPair({ ...BASE, [key]: key === 'center' ? [0, 0, 0] : 1 }))
    expect(error).toBeInstanceOf(GearAliasError)
    expect(error.code).toBe(code)
    expect(error.message).toMatch(/^gear\.bevelPair: /)
  })

  it.each([0, 180, -5])('refuses a %s° shaft angle by name', (shaftAngleDeg) => {
    const error = errorOf(() => bevelPair({ ...BASE, shaftAngleDeg }))
    expect(error).toBeInstanceOf(BevelGearError)
    expect(error.code).toBe('shaft-angle')
    expect(error.message).toMatch(/^gear\.bevelPair: /)
  })

  it('refuses a bore that cuts the pinion’s small end, naming the pair and the gear', () => {
    const error = errorOf(() => bevelPair({ ...BASE, pinionBoreMm: 40 }))
    expect(error).toBeInstanceOf(GearBoreError)
    expect(error.message).toMatch(/^gear\.bevelPair: pinion /)
  })

  it('refuses a face width reaching the apex by name', () => {
    const error = errorOf(() => bevelPair({ ...BASE, faceWidthMm: 1000 }))
    expect(error).toBeInstanceOf(BevelGearError)
    expect(error.code).toBe('face-width')
  })
})
