// SPDX-License-Identifier: AGPL-3.0-or-later
// `gear.wormWheel` (TODO/core-047): the non-throated wheel — a helical `gear.spur` whose
// helix is the worm's lead angle, same hand, cut in the worm's normal module. One expansion
// (gear.spur's), not a copy of it.
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { GearAliasError } from '../../gear/aliases.js'
import { wormDimensions, wormWheelGearParams } from '../../gear/worm.js'
import { GearLimitError } from '../../gear/limits.js'
import { isGroup } from '../group.js'
import { evaluateOp } from '../index.js'
import { policyFor } from '../tessellation.js'
import { makeWatertight, openEdgesOf } from '../watertight.js'
import { spur } from './gear.spur.js'
import { WORM_WHEEL_PARAMS, wormWheel } from './gear.wormWheel.js'

const { measurements } = modeling

/** The wheel for a module-2 worm on a 20 mm pitch circle. */
const BASE = Object.freeze({ teeth: 30, starts: 1, moduleMm: 2, wormPitchDiameterMm: 20, faceWidthMm: 10 })

/**
 * @param {() => unknown} fn
 * @returns {Error & { param?: string }}
 */
function errorOf(fn) {
  try {
    fn()
  } catch (error) {
    return /** @type {Error} */ (error)
  }
  throw new Error('expected an error, nothing was thrown')
}

describe('gear.wormWheel — the expansion is gear.spur’s, at the worm’s lead angle', () => {
  it('is exactly gear.spur’s records for the derived helical params', () => {
    expect(wormWheel(BASE)).toEqual(spur(wormWheelGearParams(BASE)))
    expect(wormWheel({ ...BASE, boreMm: 8, handedness: 'left' })).toEqual(spur(wormWheelGearParams({ ...BASE, boreMm: 8, handedness: 'left' })))
  })

  for (const starts of [1, 2, 4]) {
    it(`${starts}-start: the profile’s helix equals the worm’s lead angle within 1e-9, and the twist follows the worm’s hand`, () => {
      const records = wormWheel({ ...BASE, starts })
      const profile = records.find((r) => r.op === 'profile.gear')
      const extrude = records.find((r) => r.op === 'profile.extrudeLinear')
      const lead = wormDimensions({ starts, moduleMm: 2, pitchDiameterMm: 20 }).leadAngleDeg
      expect(Math.abs(/** @type {number} */ (profile?.params?.helixAngleDeg) - lead)).toBeLessThan(1e-9)
      expect(extrude?.params?.twistDeg).toBeGreaterThan(0)
      const left = wormWheel({ ...BASE, starts, handedness: 'left' }).find((r) => r.op === 'profile.extrudeLinear')
      expect(left?.params?.twistDeg).toBeCloseTo(-(/** @type {number} */ (extrude?.params?.twistDeg)), 12)
    })
  }

  it('builds a watertight wheel whose pitch cylinder is z · m (axial)', () => {
    const value = evaluateOp('gear.wormWheel', BASE, { policy: policyFor('draft') })
    if (!isGroup(value)) throw new Error('expected a Group')
    expect(openEdgesOf(makeWatertight(/** @type {any} */ (value.parts.gear))).openEdges).toBe(0)
    const [[minX], [maxX]] = measurements.measureBoundingBox(/** @type {any} */ (value.parts.pitch))
    expect(maxX - minX).toBeCloseTo(60, 1)
  })

  it('builds a wheel of fewer than 17 teeth (the warning is wormWheelDimensions’ to give, not the recipe’s)', () => {
    expect(() => wormWheel({ ...BASE, teeth: 12 })).not.toThrow()
  })

  it('needs teeth, the worm’s starts / module / pitch diameter, and a face width; refuses a stray param', () => {
    for (const missing of ['teeth', 'starts', 'moduleMm', 'wormPitchDiameterMm', 'faceWidthMm']) {
      const { [missing]: _gone, ...rest } = /** @type {Record<string, unknown>} */ ({ ...BASE })
      const error = errorOf(() => wormWheel(rest))
      expect(error, missing).toBeInstanceOf(GearLimitError)
      expect(error.message).toMatch(/^gear\.wormWheel: /)
    }
    expect(errorOf(() => wormWheel({ ...BASE, helixAngleDeg: 10 }))).toBeInstanceOf(GearAliasError)
    expect(WORM_WHEEL_PARAMS).not.toContain('helixAngleDeg')
  })
})
