// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { GearAliasError } from '../../gear/aliases.js'
import { GearMeshError } from '../../gear/internal.js'
import { GearBoreError, GearLimitError } from '../../gear/limits.js'
import { PITCH_PLANE_BASIS, centerDistanceMm, meshPhaseDeg } from '../../gear/mesh.js'
import { boundsOf, isGroup } from '../group.js'
import { evaluateOp, expand } from '../index.js'
import { registry } from '../registry.js'
import { policyFor } from '../tessellation.js'
import { pair } from './gear.pair.js'
import pairSource from './gear.pair.js?raw'

const { booleans, measurements, transforms } = modeling

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

describe('the gear.pair recipe expands into records, it builds nothing', () => {
  it('is two gear.spur records, and a turn then a move for the pinion — no measuring of built geometry', () => {
    const phase = meshPhaseDeg({ teeth: 36, moduleMm: 2 }, { teeth: 12, moduleMm: 2 })
    expect(pair({ driveTeeth: 36, pinionTeeth: 12, moduleMm: 2, thicknessMm: 6 })).toEqual([
      { id: 'driveGear', op: 'gear.spur', params: { teeth: 36, moduleMm: 2, thicknessMm: 6 }, name: 'drive' },
      { id: 'pinionGear', op: 'gear.spur', params: { teeth: 12, moduleMm: 2, thicknessMm: 6 } },
      { id: 'pinionTurned', op: 'transform.rotate', target: 'pinionGear', params: { angles: [0, 0, phase] } },
      { id: 'pinion', op: 'transform.translate', target: 'pinionTurned', params: { vector: [48, 0, 0] }, name: 'pinion' },
    ])
  })

  it('puts the pinion at mesh.js’s centre distance and phase, profile shift and all', () => {
    const records = pair({ driveTeeth: 30, pinionTeeth: 11, moduleMm: 1.25, thicknessMm: 5, driveProfileShift: 0.1, pinionProfileShift: 0.35 })
    const drive = { teeth: 30, moduleMm: 1.25, profileShift: 0.1 }
    const pinion = { teeth: 11, moduleMm: 1.25, profileShift: 0.35 }
    expect(records[3].params?.vector).toEqual([centerDistanceMm(drive, pinion), 0, 0])
    expect(records[2].params?.angles).toEqual([0, 0, meshPhaseDeg(drive, pinion)])
    expect(records[0].params).toMatchObject({ profileShift: 0.1 })
    expect(records[1].params).toMatchObject({ profileShift: 0.35 })
  })

  it('shares every tooth-shaping param, gives the pinion the opposite hand, and keeps each bore its own', () => {
    const [drive, pinion] = pair({
      driveTeeth: 24,
      pinionTeeth: 12,
      moduleMm: 1.5,
      pressureAngleDeg: 25,
      clearanceMm: 0.3,
      backlashMm: 0.1,
      thicknessMm: 6,
      helixAngleDeg: 20,
      handedness: 'left',
      herringbone: true,
      driveBoreMm: 8,
      pinionBoreMm: 5,
    })
    const shared = { moduleMm: 1.5, pressureAngleDeg: 25, clearanceMm: 0.3, backlashMm: 0.1, thicknessMm: 6, helixAngleDeg: 20, herringbone: true }
    expect(drive.params).toEqual({ ...shared, teeth: 24, handedness: 'left', boreMm: 8 })
    expect(pinion.params).toEqual({ ...shared, teeth: 12, handedness: 'right', boreMm: 5 })
  })

  it('a helical pair with no hand given is right-hand drive, left-hand pinion', () => {
    const [drive, pinion] = pair({ driveTeeth: 24, pinionTeeth: 12, moduleMm: 1.5, thicknessMm: 6, helixAngleDeg: 15 })
    expect(drive.params?.handedness).toBe('right')
    expect(pinion.params?.handedness).toBe('left')
  })

  it('accepts the TODO’s `module` spelling through the gear alias table', () => {
    expect(pair({ driveTeeth: 20, pinionTeeth: 10, module: 2, thicknessMm: 4 })[0].params?.moduleMm).toBe(2)
  })

  it('turns both gears into the asked pitch plane, after the mesh is made in XY', () => {
    for (const plane of /** @type {const} */ (['xz', 'yz'])) {
      const records = pair({ driveTeeth: 36, pinionTeeth: 12, moduleMm: 2, thicknessMm: 6, pitchPlane: plane })
      const angles = PITCH_PLANE_BASIS[plane].rotateDeg
      expect(records.map((r) => [r.id, r.op, r.name])).toEqual([
        ['driveGear', 'gear.spur', undefined],
        ['drive', 'transform.rotate', 'drive'],
        ['pinionGear', 'gear.spur', undefined],
        ['pinionTurned', 'transform.rotate', undefined],
        ['pinionPlaced', 'transform.translate', undefined],
        ['pinion', 'transform.rotate', 'pinion'],
      ])
      expect(records[1].params).toEqual({ angles })
      expect(records[5].params).toEqual({ angles })
    }
  })

  it('is what expand() returns for a gear.pair line', () => {
    const params = { driveTeeth: 20, pinionTeeth: 10, moduleMm: 2, thicknessMm: 4 }
    expect(expand('gear.pair', params)).toEqual(pair(params))
  })

  it('imports no @jscad/modeling — a recipe only emits records', () => {
    expect(pairSource).not.toMatch(/from\s+['"]@jscad\/modeling/)
  })
})

describe('registered as a composite with no Library row yet (ui-057 wires it)', () => {
  it('is a 0-operand composite with no ui', () => {
    expect(registry['gear.pair']?.kind).toBe('composite')
    expect(registry['gear.pair']?.operandCount).toBe(0)
    expect(registry['gear.pair']?.ui).toBeUndefined()
  })
})

describe('built: two named parts, drive and pinion, where the pitch plane says', () => {
  const policy = policyFor('draft')

  it('builds drive and pinion as visible parts, the pinion one centre distance along +X', () => {
    const group = asGroup(evaluateOp('gear.pair', { driveTeeth: 36, pinionTeeth: 12, moduleMm: 2, thicknessMm: 6 }, { policy }))
    expect(group.names).toEqual(['drive', 'pinion'])
    const [min, max] = boundsOf(partOf(group, 'pinion'))
    expect((min[0] + max[0]) / 2).toBeCloseTo(48, 1)
    expect(min[2]).toBeCloseTo(-3, 9)
    expect(max[2]).toBeCloseTo(3, 9)
  })

  it.each([
    ['xz', 1, 0],
    ['yz', 0, 1],
  ])('in %s: the faces are normal to the axis and the pinion lies along u', (plane, axisIndex, uIndex) => {
    const group = asGroup(evaluateOp('gear.pair', { driveTeeth: 36, pinionTeeth: 12, moduleMm: 2, thicknessMm: 6, pitchPlane: plane }, { policy }))
    const [dMin, dMax] = boundsOf(partOf(group, 'drive'))
    expect(dMax[axisIndex] - dMin[axisIndex]).toBeCloseTo(6, 9)
    const [pMin, pMax] = boundsOf(partOf(group, 'pinion'))
    expect((pMin[uIndex] + pMax[uIndex]) / 2).toBeCloseTo(48, 1)
  })
})

describe('interference proof: a gear.pair never interpenetrates as it turns', () => {
  // Sampled at Fine so chord sag (≤ 0.02 mm) stays inside the backlash. The drive turns
  // across one of its teeth in 12 steps (the pair repeats every drive tooth), the pinion
  // turns back by z_drive / z_pinion of each step about its own centre, and the bodies are
  // intersected at every step.
  const policy = policyFor('fine')

  /**
   * @param {Record<string, unknown>} params gear.pair params
   * @param {{ extraPinionDeg?: number }} [options] A deliberate phase error.
   * @returns {number[]} intersect volume, mm³, at each of 12 drive angles
   */
  function overlapVolumesMm3(params, { extraPinionDeg = 0 } = {}) {
    const records = pair(params)
    const centreMm = /** @type {number[]} */ (records[3].params?.vector)[0]
    const zDrive = /** @type {number} */ (params.driveTeeth)
    const zPinion = /** @type {number} */ (params.pinionTeeth)
    const group = asGroup(evaluateOp('gear.pair', params, { policy }))
    const drive = partOf(group, 'drive')
    const pinionAtOrigin = transforms.translate([-centreMm, 0, 0], partOf(group, 'pinion'))
    /** @type {number[]} */
    const volumes = []
    for (let k = 0; k < 12; k++) {
      const driveRad = ((2 * Math.PI) / zDrive) * (k / 12)
      const pinionRad = (-driveRad * zDrive) / zPinion + (extraPinionDeg * Math.PI) / 180
      const turnedPinion = transforms.translate([centreMm, 0, 0], transforms.rotateZ(pinionRad, pinionAtOrigin))
      volumes.push(measurements.measureVolume(booleans.intersect(transforms.rotateZ(driveRad, drive), turnedPinion)))
    }
    return volumes
  }

  // window-motor's own numbers: circularPitch π·50/36, clearance 0.5, V1 backlash 0.1.
  const WINDOW_MOTOR = {
    driveTeeth: 36,
    pinionTeeth: 12,
    moduleMm: 50 / 36,
    clearanceMm: 0.5,
    backlashMm: (2 * 0.1) / Math.cos((20 * Math.PI) / 180),
    thicknessMm: 2,
  }

  it('window-motor 36T/12T — zero overlap at 12 angles', () => {
    for (const [k, v] of overlapVolumesMm3(WINDOW_MOTOR).entries()) expect(v, `angle ${k}`).toBeLessThan(1e-4)
  })

  it('bf-gear 30T/8T at 14.5° — zero overlap at 12 angles, undercut pinion and all', () => {
    const volumes = overlapVolumesMm3({
      driveTeeth: 30,
      pinionTeeth: 8,
      moduleMm: 8 / Math.PI,
      pressureAngleDeg: 14.5,
      clearanceMm: 0.05,
      backlashMm: (2 * 0.05) / Math.cos((14.5 * Math.PI) / 180),
      thicknessMm: 2,
    })
    for (const [k, v] of volumes.entries()) expect(v, `angle ${k}`).toBeLessThan(1e-4)
  })

  it('a helical 20T/12T at 20°, opposite hands — zero overlap at 12 angles through its whole face width', () => {
    const volumes = overlapVolumesMm3({ driveTeeth: 20, pinionTeeth: 12, moduleMm: 1.5, backlashMm: 0.1, thicknessMm: 4, helixAngleDeg: 20 })
    for (const [k, v] of volumes.entries()) expect(v, `angle ${k}`).toBeLessThan(1e-3)
  })

  it('negative control: the same window-motor pair half a pinion tooth out of phase does interpenetrate', () => {
    expect(Math.max(...overlapVolumesMm3(WINDOW_MOTOR, { extraPinionDeg: 180 / 12 }))).toBeGreaterThan(0.1)
  })

  it('negative control: the helical pair a quarter tooth out of phase does interpenetrate', () => {
    const volumes = overlapVolumesMm3(
      { driveTeeth: 20, pinionTeeth: 12, moduleMm: 1.5, backlashMm: 0.1, thicknessMm: 4, helixAngleDeg: 20 },
      { extraPinionDeg: 90 / 12 }
    )
    expect(Math.max(...volumes)).toBeGreaterThan(0.1)
  })
})

describe('hostile and ill-formed params: a named error before any record is emitted', () => {
  const BASE = { driveTeeth: 36, pinionTeeth: 12, moduleMm: 2, thicknessMm: 6 }

  /** @type {[string, Record<string, unknown>][]} */
  const limits = [
    ['10⁶ drive teeth', { ...BASE, driveTeeth: 1e6 }],
    ['NaN pinion teeth', { ...BASE, pinionTeeth: Number.NaN }],
    ['missing pinion teeth', { driveTeeth: 36, moduleMm: 2, thicknessMm: 6 }],
    ['missing thickness', { driveTeeth: 36, pinionTeeth: 12, moduleMm: 2 }],
    ['zero thickness', { ...BASE, thicknessMm: 0 }],
    ['Infinity module', { ...BASE, moduleMm: Number.POSITIVE_INFINITY }],
    ['an unknown pitch plane', { ...BASE, pitchPlane: 'ab' }],
    ['a string pinion shift', { ...BASE, pinionProfileShift: '0.2' }],
    ['a negative bore', { ...BASE, driveBoreMm: -3 }],
    ['a sideways hand', { ...BASE, helixAngleDeg: 10, handedness: 'up' }],
  ]

  it.each(limits)('%s is a GearLimitError named for gear.pair, fast', (_label, params) => {
    const started = performance.now()
    const error = errorOf(() => pair(params))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/^gear\.pair: /)
    expect(performance.now() - started).toBeLessThan(50)
  })

  it.each([
    ['teeth', 'unknown-param'],
    ['profileShift', 'unknown-param'],
    ['boreMm', 'unknown-param'],
    ['center', 'center'],
  ])('refuses %s by name (%s) — a pair has a teeth count and a shift per gear', (key, code) => {
    const error = errorOf(() => pair({ ...BASE, [key]: key === 'center' ? [0, 0, 0] : 1 }))
    expect(error).toBeInstanceOf(GearAliasError)
    expect(error.code).toBe(code)
    expect(error.message).toMatch(/^gear\.pair: /)
  })

  it('refuses a bore that cuts the pinion’s teeth, naming the pair and the gear', () => {
    const error = errorOf(() => pair({ ...BASE, pinionBoreMm: 40 }))
    expect(error).toBeInstanceOf(GearBoreError)
    expect(error.message).toMatch(/^gear\.pair: pinion /)
  })

  it('refuses a pair whose tips would strike roots, with mesh.js’s code', () => {
    const error = errorOf(() => pair({ driveTeeth: 12, pinionTeeth: 12, moduleMm: 2, thicknessMm: 4, driveProfileShift: 1.5, pinionProfileShift: 1.5 }))
    expect(error).toBeInstanceOf(GearMeshError)
    expect(error.code).toBe('tip-clearance')
    expect(error.message).toMatch(/^gear\.pair: /)
  })

  it('degenerate: equal tooth counts make a 1:1 pair at one pitch diameter apart', () => {
    const records = pair({ driveTeeth: 20, pinionTeeth: 20, moduleMm: 2, thicknessMm: 4 })
    expect(records[3].params?.vector).toEqual([expect.closeTo(40, 12), 0, 0])
  })
})
