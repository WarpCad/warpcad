// SPDX-License-Identifier: AGPL-3.0-or-later
// `gear.wormPair` (TODO/core-047): a worm and its non-throated wheel, placed by
// `src/core/gear/mesh.js` — the crossed-axis rules core-046 wrote for helical gears, with the
// worm as a gear kind of its own. The interference proof turns the pair through 12 worm
// positions and asserts the overlap stays small and stable: it is point contact, so not zero.
import { describe, expect, it, vi } from 'vitest'
import modeling from '@jscad/modeling'

import { GearAliasError } from '../../gear/aliases.js'
import { meshPlacement } from '../../gear/mesh.js'
import { wormDimensions, wormWheelGearParams } from '../../gear/worm.js'
import { GearLimitError } from '../../gear/limits.js'
import { isGroup } from '../group.js'
import { evaluateOp } from '../index.js'
import { policyFor } from '../tessellation.js'
import { WORM_PAIR_PARAMS, wormPair } from './gear.wormPair.js'

// Heavy kernel/library work: slow-but-correct under full-suite load, so a file-level budget (TODO/testing-004).
vi.setConfig({ testTimeout: 30_000 })

const { booleans, maths, measurements, transforms } = modeling
const DEG = Math.PI / 180

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('../group.js').Group} Group */
/** @typedef {[number, number, number]} Vec3 */

/** A 30-tooth wheel on a module-2, Ø20 worm, 30 mm long; the wheel 10 mm across its face. */
const BASE = Object.freeze({ starts: 1, moduleMm: 2, wormPitchDiameterMm: 20, wormLengthMm: 30, wheelTeeth: 30, faceWidthMm: 10 })

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
  return /** @type {Geom3} */ (part)
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
 * A turn of `rad` about `axis` through `pointMm`.
 *
 * @param {readonly number[]} axis
 * @param {readonly number[]} pointMm
 * @param {number} rad
 * @param {Geom3} solid
 * @returns {Geom3}
 */
function turnAbout(axis, pointMm, rad, solid) {
  if (rad === 0) return solid
  const { mat4 } = maths
  const there = mat4.fromTranslation(mat4.create(), /** @type {Vec3} */ ([...pointMm]))
  const back = mat4.fromTranslation(mat4.create(), /** @type {Vec3} */ (pointMm.map((c) => -c)))
  const turn = mat4.fromRotation(mat4.create(), rad, /** @type {Vec3} */ ([...axis]))
  return transforms.transform(mat4.multiply(mat4.create(), there, mat4.multiply(mat4.create(), turn, back)), solid)
}

/** The worm and wheel `mesh.js` sees for pair params `p`. */
const meshGearsOf = (/** @type {Record<string, any>} */ p) => {
  const { boreMm: _bore, ...wheel } = wormWheelGearParams({
    teeth: p.wheelTeeth,
    starts: p.starts,
    moduleMm: p.moduleMm,
    wormPitchDiameterMm: p.wormPitchDiameterMm,
    faceWidthMm: p.faceWidthMm,
    ...(p.handedness ? { handedness: p.handedness } : {}),
  })
  const worm = { kind: /** @type {const} */ ('worm'), starts: p.starts, moduleMm: p.moduleMm, pitchDiameterMm: p.wormPitchDiameterMm, lengthMm: p.wormLengthMm, ...(p.handedness ? { handedness: p.handedness } : {}) }
  return { wheel: /** @type {any} */ (wheel), worm: /** @type {any} */ (worm) }
}

describe('gear.wormPair — the expansion', () => {
  it('is the wheel on the origin and the worm turned, stood up and moved by mesh.js’s placement', () => {
    const { wheel, worm } = meshGearsOf(BASE)
    const placed = meshPlacement(wheel, worm)
    const records = wormPair(BASE)
    expect(records.map((r) => [r.id, r.op, r.name])).toEqual([
      ['wheel', 'gear.wormWheel', 'wheel'],
      ['wormGear', 'gear.worm', undefined],
      ['wormTurned', 'transform.rotate', undefined],
      ['wormStood', 'transform.rotate', undefined],
      ['worm', 'transform.translate', 'worm'],
    ])
    expect(records[0].params).toEqual({ teeth: 30, starts: 1, moduleMm: 2, wormPitchDiameterMm: 20, faceWidthMm: 10 })
    expect(records[1].params).toEqual({ starts: 1, moduleMm: 2, pitchDiameterMm: 20, lengthMm: 30 })
    expect(records[2].params).toEqual({ angles: [0, 0, placed.phaseDeg] })
    expect(records[3].params).toEqual({ angles: placed.orientationDeg })
    expect(records[4].params).toEqual({ vector: placed.centerMm })
  })

  for (const starts of [1, 2, 4]) {
    it(`${starts}-start: the worm sits (d_worm + d_wheel) / 2 out along +X, its axis along Y, square to the wheel’s`, () => {
      const records = wormPair({ ...BASE, starts })
      expect(records[4].params?.vector).toEqual([expect.closeTo(40, 9), expect.closeTo(0, 12), 0])
      const group = asGroup(evaluateOp('gear.wormPair', { ...BASE, starts }, { policy: policyFor('draft') }))
      const [[minX, minY, minZ], [maxX, maxY, maxZ]] = measurements.measureBoundingBox(partOf(group, 'worm'))
      const tip = wormDimensions({ starts, moduleMm: 2, pitchDiameterMm: 20 }).tipRadiusMm
      expect((minX + maxX) / 2).toBeCloseTo(40, 1)
      expect(maxY - minY).toBeCloseTo(30, 6)
      expect(maxZ - minZ).toBeLessThanOrEqual(2 * tip + 1e-6)
    })
  }

  it('shares the hand and the section params, and bores each part by its own name', () => {
    const records = wormPair({ ...BASE, handedness: 'left', pressureAngleDeg: 25, backlashMm: 0.1, clearanceMm: 0.4, wormBoreMm: 5, wheelBoreMm: 8 })
    expect(records[0].params).toMatchObject({ handedness: 'left', pressureAngleDeg: 25, backlashMm: 0.1, clearanceMm: 0.4, boreMm: 8 })
    expect(records[1].params).toMatchObject({ handedness: 'left', pressureAngleDeg: 25, backlashMm: 0.1, clearanceMm: 0.4, boreMm: 5 })
  })

  it('refuses a plain teeth, boreMm, pitchDiameterMm or lengthMm by name — a pair would not say which part it means', () => {
    for (const stray of [{ teeth: 30 }, { boreMm: 5 }, { pitchDiameterMm: 20 }, { lengthMm: 30 }]) {
      expect(errorOf(() => wormPair({ ...BASE, ...stray })), JSON.stringify(stray)).toBeInstanceOf(GearAliasError)
    }
    expect(WORM_PAIR_PARAMS).toContain('wheelTeeth')
  })

  it('refuses 0 and 5 starts, and a worm whose root vanishes, before a record exists', () => {
    for (const starts of [0, 5]) expect(errorOf(() => wormPair({ ...BASE, starts }))).toBeInstanceOf(GearLimitError)
    const error = errorOf(() => wormPair({ ...BASE, wormPitchDiameterMm: 4 }))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/^gear\.wormPair: /)
  })

  it('refuses a lead angle the wheel cannot be cut at (helix past 45°), as a limit error', () => {
    expect(errorOf(() => wormPair({ ...BASE, starts: 4, wormPitchDiameterMm: 6 }))).toBeInstanceOf(GearLimitError)
  })
})

describe('interference proof: the worm and its non-throated wheel as they turn', () => {
  // Why a bound and not zero. With no backlash the flanks *touch*: the wheel is a helical
  // gear, not throated round the worm, so the two meet at a point on the worm's axial plane
  // through the wheel — where the wheel's transverse section is exactly the involute that
  // meshes the worm's straight-sided axial rack — and part company either side of it. Two
  // touching solids, each faceted to the design's tolerance (0.05 mm chord sag at Normal),
  // can cross by a facet's sliver at the contact; and off the axial plane the ZA flank is not
  // conjugate to the straight helical tooth, so for other proportions (a wider face, a steeper
  // lead) the flanks could part slightly *inward* there too. Measured (2026-10-16, Normal,
  // 12 positions across one worm tooth): 1-start and 2-start right hand 0.000 mm³ everywhere,
  // 1-start left hand 0.014 mm³ at one position. A mesh error is four orders larger: the
  // half-tooth control overlaps 227-243 mm³, the wheel turned the wrong way up to 240 mm³.
  const policy = policyFor('normal')
  const OVERLAP_BOUND_MM3 = 0.1
  const OVERLAP_SPREAD_MM3 = 0.1

  /**
   * @param {Record<string, unknown>} params gear.wormPair params
   * @param {{ extraWormDeg?: number, wheelSign?: number }} [options] A deliberate phase error on
   *   the worm, or the wheel turned the wrong way (`wheelSign: -1`).
   * @returns {number[]} intersect volume, mm³, at 12 worm positions across one tooth
   */
  function overlapVolumesMm3(params, { extraWormDeg = 0, wheelSign = 1 } = {}) {
    const { wheel: wheelGear, worm: wormGear } = meshGearsOf(params)
    const placed = meshPlacement(wheelGear, wormGear)
    const group = asGroup(evaluateOp('gear.wormPair', params, { policy }))
    const wheel = partOf(group, 'wheel')
    const worm = partOf(group, 'worm')
    const starts = /** @type {number} */ (params.starts)
    /** @type {number[]} */
    const volumes = []
    for (let k = 0; k < 12; k++) {
      const wormRad = ((2 * Math.PI) / starts) * (k / 12)
      // `ratio` is turns of gear 1 (the wheel) per turn of gear 2 (the worm), each about its own
      // axis — the wheel's +Z, the worm's `placed.axis`. Its sign is part of what this proves.
      const wheelRad = wheelSign * wormRad * /** @type {number} */ (placed.ratio)
      const turnedWorm = turnAbout(placed.axis, placed.centerMm, wormRad + extraWormDeg * DEG, worm)
      volumes.push(measurements.measureVolume(booleans.intersect(transforms.rotateZ(wheelRad, wheel), turnedWorm)))
    }
    return volumes
  }

  it.each([
    ['1-start, right hand', { ...BASE }],
    ['2-start, right hand', { ...BASE, starts: 2 }],
    ['1-start, left hand', { ...BASE, handedness: 'left' }],
  ])(`%s, 30T wheel: overlap below ${OVERLAP_BOUND_MM3} mm³ at each of 12 positions, and stable`, (_label, params) => {
    const volumes = overlapVolumesMm3(params)
    for (const [k, v] of volumes.entries()) expect(v, `position ${k}`).toBeLessThan(OVERLAP_BOUND_MM3)
    expect(Math.max(...volumes) - Math.min(...volumes)).toBeLessThan(OVERLAP_SPREAD_MM3)
  }, 120_000)

  it('negative control: the worm half a tooth out of phase digs into the wheel at every position', () => {
    const volumes = overlapVolumesMm3(BASE, { extraWormDeg: 180 })
    expect(Math.min(...volumes)).toBeGreaterThan(1000 * OVERLAP_BOUND_MM3)
  }, 120_000)

  it('negative control: the wheel turned the wrong way round breaks the mesh as the worm turns', () => {
    const volumes = overlapVolumesMm3(BASE, { wheelSign: -1 })
    expect(volumes[0]).toBeLessThan(OVERLAP_BOUND_MM3)
    expect(Math.max(...volumes)).toBeGreaterThan(1000 * OVERLAP_BOUND_MM3)
  }, 120_000)
})
