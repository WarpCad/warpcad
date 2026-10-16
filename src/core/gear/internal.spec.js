// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/v1-internal-rack.json'
import { GearParameterError, GearToothVanishedError, circularPitchMmToModuleMm, v1BacklashToBacklashMm } from './dimensions.js'
import {
  DEFAULT_RIM_MODULES,
  GearMeshError,
  checkRingPinion,
  internalProfile,
  ringGearDimensions,
  ringToothHalfAngleRadAt,
} from './internal.js'
import { involuteHalfAngleRadAt } from './involute.js'
import internalSource from './internal.js?raw'

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

/** @param {string} id */
function v1Case(id) {
  const found = fixture.internal.find((c) => c.id === id)
  if (!found) throw new Error(`no fixture ${id}`)
  return found
}

/**
 * A V1 ring's params in WarpCad vocabulary: module from circular pitch, V1's backlash
 * converted per call 4, clearance 0 when V1 omitted it (call 5).
 *
 * @param {ReturnType<typeof v1Case>} c
 */
function warpcadParamsFor(c) {
  const v1 = /** @type {Record<string, number>} */ (c.v1Params)
  const pa = v1.pressureAngle ?? 20
  return {
    teeth: -v1.toothCount,
    moduleMm: circularPitchMmToModuleMm(v1.circularPitch),
    pressureAngleDeg: pa,
    clearanceMm: v1.clearance ?? 0,
    backlashMm: v1BacklashToBacklashMm(v1.backlash ?? 0, pa),
  }
}

describe('ringGearDimensions: an internal gear is the external involute with tip and root swapped', () => {
  const dims = ringGearDimensions({ teeth: 64, moduleMm: 2 })

  it('puts the tip (inner) circle one module inside the pitch circle and the root one dedendum outside it', () => {
    expect(dims.kind).toBe('internal')
    expect(dims.pitchRadiusMm).toBeCloseTo(64, 12)
    expect(dims.tipRadiusMm).toBeCloseTo(64 - 2, 12)
    // Standard +clearance (call 5): 0.25 m by default, at the ring's root.
    expect(dims.clearanceMm).toBeCloseTo(0.5, 12)
    expect(dims.rootRadiusMm).toBeCloseTo(64 + 2 + 0.5, 12)
    expect(dims.addendumMm).toBeCloseTo(2, 12)
    expect(dims.dedendumMm).toBeCloseTo(2.5, 12)
  })

  it('makes the rim 4 modules by default (V1’s hard-wired 4·addendum, Decision 5 defect 11) and OD = root + rim', () => {
    expect(DEFAULT_RIM_MODULES).toBe(4)
    expect(dims.rimThicknessMm).toBeCloseTo(8, 12)
    expect(dims.rimOuterRadiusMm).toBeCloseTo(dims.rootRadiusMm + 8, 12)
    const thin = ringGearDimensions({ teeth: 64, moduleMm: 2, rimThicknessMm: 1.5 })
    expect(thin.rimOuterRadiusMm).toBeCloseTo(thin.rootRadiusMm + 1.5, 12)
  })

  it('thins the ring tooth by half the backlash along the pitch circle, as for an external gear (call 4)', () => {
    const play = ringGearDimensions({ teeth: 64, moduleMm: 2, backlashMm: 0.2 })
    expect(play.toothThicknessAtPitchMm).toBeCloseTo(Math.PI - 0.1, 12)
    expect(play.spaceWidthAtPitchMm).toBeCloseTo(Math.PI + 0.1, 12)
    // The boundary the outline is sampled from agrees with the number.
    expect(2 * play.pitchRadiusMm * ringToothHalfAngleRadAt(play, play.pitchRadiusMm)).toBeCloseTo(Math.PI - 0.1, 9)
  })

  it('shares the flank equation with the external gear: the space is an external tooth of the space width', () => {
    const r = dims.pitchRadiusMm + 1.1
    const spaceHalf = involuteHalfAngleRadAt({ ...dims, toothThicknessAtPitchMm: dims.spaceWidthAtPitchMm }, r)
    expect(ringToothHalfAngleRadAt(dims, r)).toBeCloseTo(Math.PI / 64 - spaceHalf, 14)
  })

  it('reads a helical ring’s pitch from the transverse module and its depth from the normal one (core-042)', () => {
    const helical = ringGearDimensions({ teeth: 64, moduleMm: 2, helixAngleDeg: 20 })
    const mt = 2 / Math.cos((20 * Math.PI) / 180)
    expect(helical.pitchRadiusMm).toBeCloseTo((64 * mt) / 2, 9)
    expect(helical.tipRadiusMm).toBeCloseTo(helical.pitchRadiusMm - 2, 9)
    expect(helical.rootRadiusMm).toBeCloseTo(helical.pitchRadiusMm + 2.5, 9)
  })

  it('never imports @jscad/modeling, Vue or the DOM — core stays framework-free', () => {
    expect(internalSource).not.toMatch(/from\s+['"](@jscad\/modeling|vue|three)/)
    expect(internalSource).not.toMatch(/\bdocument\.|\bwindow\./)
  })
})

describe('parity with V1 for the two ring gears the user’s projects use', () => {
  // V1 places its clearance at the ring's *tip* (its cutter is the pinion with clearance
  // negated, so the pinion's raised root trims the ring tip by c, and its unchanged tip
  // leaves the ring root at R + m): tip R − m + c, root R + m. WarpCad's ring is the
  // standard complement — tip R − m, root R + m + c — so the two differ by exactly the
  // clearance, in opposite directions, and agree to the band when that is accounted for.
  // With V1's default clearance 0 (the 96T example) they are the same circles.
  for (const id of ['gear-set-96T-ring', 'drive-wheel-64T-ring']) {
    describe(id, () => {
      const c = v1Case(id)
      const params = warpcadParamsFor(c)
      const dims = ringGearDimensions(params)
      const clearanceMm = params.clearanceMm
      const converged = /** @type {NonNullable<typeof c.converged>} */ (c.converged)

      it('tip (inner) radius within 0.005 mm of converged V1 and 0.03 mm of what was printed, after V1’s tip clearance', () => {
        expect(Math.abs(dims.tipRadiusMm + clearanceMm - converged.tipRadiusMm)).toBeLessThan(0.005)
        expect(Math.abs(dims.tipRadiusMm + clearanceMm - c.default.tipRadiusMm)).toBeLessThan(0.03)
      })

      it('root radius within 0.005 mm of converged V1 and 0.03 mm of what was printed, after V1’s missing root clearance', () => {
        expect(Math.abs(dims.rootRadiusMm - clearanceMm - converged.rootRadiusMm)).toBeLessThan(0.005)
        expect(Math.abs(dims.rootRadiusMm - clearanceMm - c.default.rootRadiusMm)).toBeLessThan(0.03)
      })

      it('rim OD within 0.005 mm of V1 at the default 4-module rim', () => {
        expect(Math.abs(dims.rimOuterRadiusMm - converged.rimOuterRadiusMm)).toBeLessThan(0.005)
        expect(Math.abs(dims.rimOuterRadiusMm - c.default.rimOuterRadiusMm)).toBeLessThan(0.005)
      })

      it('ring-tooth thickness on the pitch circle within 0.002 mm of converged V1', () => {
        const pitch = converged.thicknessAt[0]
        expect(pitch.teeth).toBe(params.teeth)
        expect(Math.abs(dims.toothThicknessAtPitchMm - /** @type {number} */ (pitch.arcMm))).toBeLessThan(0.002)
      })

      it('meshes with V1’s 14-tooth pinion by the interference readout', () => {
        expect(checkRingPinion(dims, 14).warnings).toEqual([])
      })
    })
  }
})

describe('the interference condition: which pinions a ring can mesh with', () => {
  // KHK's trochoid-interference condition for an internal pair, θ₁·z₁/z₂ + inv α − inv α_a2 ≥ θ₂,
  // measured against boolean overlap in core-043's scratch sweep: wherever it holds, the
  // built pair never interpenetrated. At 20° it puts the limit at 8 teeth of difference.
  it('reports the largest pinion that clears the ring’s tips: 55 for a 64T ring and 88 for 96T, at 20°', () => {
    expect(ringGearDimensions({ teeth: 64, moduleMm: 1 }).maxPinionTeeth).toBe(55)
    expect(ringGearDimensions({ teeth: 96, moduleMm: 50 / 96 }).maxPinionTeeth).toBe(88)
    expect(ringGearDimensions({ teeth: 64, moduleMm: 1 }).minToothDifference).toBe(9)
  })

  it('is scale-free: the module does not change which pinions fit', () => {
    for (const moduleMm of [0.5, 1, 3]) {
      expect(ringGearDimensions({ teeth: 40, moduleMm }).maxPinionTeeth).toBe(ringGearDimensions({ teeth: 40, moduleMm: 2 }).maxPinionTeeth)
    }
  })

  it('warns, not refuses, on a pinion too large for the ring', () => {
    const ring = ringGearDimensions({ teeth: 64, moduleMm: 1 })
    expect(checkRingPinion(ring, 55).warnings).toEqual([])
    expect(checkRingPinion(ring, 60).warnings).toEqual(['tip-interference'])
    expect(checkRingPinion(ring, 60).clearanceRad).toBeLessThan(0)
  })

  it('refuses a ring no larger than its pinion with a named error', () => {
    const ring = ringGearDimensions({ teeth: 64, moduleMm: 1 })
    for (const pinionTeeth of [64, 65, 100]) {
      const error = errorOf(() => checkRingPinion(ring, pinionTeeth))
      expect(error, String(pinionTeeth)).toBeInstanceOf(GearMeshError)
      expect(error.code).toBe('ring-not-larger')
    }
  })

  it('refuses a malformed pinion tooth count', () => {
    const ring = ringGearDimensions({ teeth: 64, moduleMm: 1 })
    for (const pinionTeeth of [Number.NaN, 2, 12.5, Number.POSITIVE_INFINITY]) {
      expect(() => checkRingPinion(ring, pinionTeeth), String(pinionTeeth)).toThrow(GearParameterError)
    }
  })

  it('refuses a ring that cannot mesh with any pinion: below 7 teeth at 20°, below 18 at 5°', () => {
    for (const [teeth, pressureAngleDeg] of [[6, 20], [17, 5]]) {
      const error = errorOf(() => ringGearDimensions({ teeth, moduleMm: 1, pressureAngleDeg }))
      expect(error, `${teeth}T ${pressureAngleDeg}°`).toBeInstanceOf(GearMeshError)
      expect(error.code).toBe('no-pinion-fits')
    }
    expect(ringGearDimensions({ teeth: 7, moduleMm: 1 }).maxPinionTeeth).toBeGreaterThanOrEqual(3)
    expect(ringGearDimensions({ teeth: 18, moduleMm: 1, pressureAngleDeg: 5 }).maxPinionTeeth).toBeGreaterThanOrEqual(3)
  })
})

describe('internalProfile: the toothed inner boundary', () => {
  const profile = internalProfile({ teeth: 64, moduleMm: 2, backlashMm: 0.1 })
  const n = profile.verticesPerTooth

  it('is the hole’s outline, CCW, one template per tooth, every tooth the previous one turned 360°/teeth', () => {
    expect(profile.outline).toHaveLength(64 * n)
    expect(shoelaceAreaMm2(profile.outline)).toBeGreaterThan(0)
    const step = (2 * Math.PI) / 64
    for (const i of [0, 3, n - 1]) {
      const [x, y] = profile.outline[i]
      const [x2, y2] = profile.outline[i + n]
      expect(x2).toBeCloseTo(x * Math.cos(step) - y * Math.sin(step), 9)
      expect(y2).toBeCloseTo(x * Math.sin(step) + y * Math.cos(step), 9)
    }
  })

  it('puts ring tooth 0 on +X: its tip centre is vertex verticesPerTooth / 2, at (tip radius, 0)', () => {
    const [x, y] = profile.outline[n / 2]
    expect(x).toBeCloseTo(profile.tipRadiusMm, 12)
    expect(y).toBeCloseTo(0, 12)
    const [x0, y0] = profile.outline[0]
    expect(Math.atan2(y0, x0)).toBeCloseTo(-Math.PI / 64, 12)
    expect(Math.hypot(x0, y0)).toBeCloseTo(profile.rootRadiusMm, 12)
  })

  it('spans exactly tip to root radius, and its polar angle only ever increases (a simple, star-shaped outline)', () => {
    const radii = profile.outline.map(([x, y]) => Math.hypot(x, y))
    expect(Math.min(...radii)).toBeCloseTo(profile.tipRadiusMm, 9)
    expect(Math.max(...radii)).toBeCloseTo(profile.rootRadiusMm, 9)
    let previous = Math.atan2(profile.outline[0][1], profile.outline[0][0])
    let turned = 0
    for (let i = 1; i <= profile.outline.length; i++) {
      const [x, y] = profile.outline[i % profile.outline.length]
      let step = Math.atan2(y, x) - previous
      if (step < -Math.PI) step += 2 * Math.PI
      expect(step, `vertex ${i}`).toBeGreaterThan(0)
      turned += step
      previous = Math.atan2(y, x)
    }
    expect(turned).toBeCloseTo(2 * Math.PI, 9)
  })

  it('every vertex lies on the analytic boundary: tip land, root land or the involute flank', () => {
    for (const [x, y] of profile.outline.slice(0, n)) {
      const r = Math.hypot(x, y)
      const angle = Math.abs(Math.atan2(y, x))
      const onTip = Math.abs(r - profile.tipRadiusMm) < 1e-9 && angle <= ringToothHalfAngleRadAt(profile, r) + 1e-9
      const onRoot = Math.abs(r - profile.rootRadiusMm) < 1e-9 && angle >= ringToothHalfAngleRadAt(profile, r) - 1e-9
      const onFlank = Math.abs(angle - ringToothHalfAngleRadAt(profile, r)) < 1e-9
      expect(onTip || onRoot || onFlank, `(${x}, ${y})`).toBe(true)
    }
  })

  it('samples finer with more points per flank, and never emits NaN', () => {
    const fine = internalProfile({ teeth: 64, moduleMm: 2, pointsPerFlank: 32 })
    expect(fine.verticesPerTooth).toBeGreaterThan(profile.verticesPerTooth)
    for (const p of [profile, fine]) expect(p.outline.flat().every(Number.isFinite)).toBe(true)
  })

  it('has no warnings for the two V1 rings', () => {
    for (const id of ['gear-set-96T-ring', 'drive-wheel-64T-ring']) {
      expect(internalProfile(warpcadParamsFor(v1Case(id))).warnings, id).toEqual([])
    }
  })
})

describe('degenerate rings', () => {
  it('truncates a tip that would fall inside the base circle at the base circle, and says so', () => {
    // 30T at 20°: R − m = 14 mm, base circle 14.095 mm — the involute does not exist below it.
    const profile = internalProfile({ teeth: 30, moduleMm: 1 })
    expect(profile.tipRadiusMm).toBeCloseTo(profile.baseRadiusMm, 12)
    expect(profile.warnings).toContain('tip-truncated')
  })

  it('builds at both pressure-angle extremes the registry accepts', () => {
    for (const [teeth, pressureAngleDeg] of [[40, 5], [64, 5], [7, 20], [12, 35], [64, 35]]) {
      const profile = internalProfile({ teeth, moduleMm: 1, pressureAngleDeg })
      expect(profile.outline.flat().every(Number.isFinite), `${teeth}T ${pressureAngleDeg}°`).toBe(true)
      expect(shoelaceAreaMm2(profile.outline)).toBeGreaterThan(0)
      expect(profile.tipRadiusMm).toBeLessThan(profile.rootRadiusMm)
    }
  })

  it('refuses a 0 mm or negative rim, and a non-number', () => {
    for (const rimThicknessMm of [0, -1, Number.NaN]) {
      expect(() => ringGearDimensions({ teeth: 64, moduleMm: 1, rimThicknessMm }), String(rimThicknessMm)).toThrow(GearParameterError)
    }
  })

  it('reports a ring tooth with no material at the pitch circle as the external gear’s named error', () => {
    expect(() => ringGearDimensions({ teeth: 64, moduleMm: 1, backlashMm: 10 })).toThrow(GearToothVanishedError)
  })

  it('refuses what the external gear refuses: too few teeth, a zero module, an out-of-range pressure angle', () => {
    for (const params of [{ teeth: 2, moduleMm: 1 }, { teeth: 64, moduleMm: 0 }, { teeth: 64, moduleMm: 1, pressureAngleDeg: 50 }]) {
      expect(() => ringGearDimensions(params), JSON.stringify(params)).toThrow(GearParameterError)
    }
  })
})
