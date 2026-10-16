// SPDX-License-Identifier: AGPL-3.0-or-later
// The worm and its wheel (TODO/core-047): derived dimensions, the transverse section the
// kernel twists, the wheel's helical-gear params, and the degenerate inputs refused or
// warned about by name. Geometry (watertight, budget, interference) is the recipes' specs.
import { describe, expect, it } from 'vitest'

import { GearParameterError, GearToothVanishedError, gearDimensions } from './dimensions.js'
import { GearLimitError } from './limits.js'
import {
  DEFAULT_WORM_FRICTION_COEFFICIENT,
  MAX_LEAD_ANGLE_DEG,
  WORM_MAX_STARTS,
  wormDimensions,
  wormSection,
  wormWheelDimensions,
  wormWheelGearParams,
} from './worm.js'
import wormSource from './worm.js?raw'

const DEG = Math.PI / 180

/** A module-2 worm on a 20 mm pitch circle, 30 mm long. */
const WORM = Object.freeze({ starts: 1, moduleMm: 2, pitchDiameterMm: 20, lengthMm: 30 })

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

describe('worm numerics — lead, lead angle and pitch for 1-, 2- and 4-start worms', () => {
  for (const starts of [1, 2, 4]) {
    it(`${starts}-start: axial pitch π·m, lead starts·π·m, tan γ = lead / (π·d)`, () => {
      const dims = wormDimensions({ ...WORM, starts })
      expect(dims.starts).toBe(starts)
      expect(dims.axialPitchMm).toBeCloseTo(Math.PI * 2, 12)
      expect(dims.leadMm).toBeCloseTo(starts * Math.PI * 2, 12)
      expect(Math.tan(dims.leadAngleDeg * DEG)).toBeCloseTo(dims.leadMm / (Math.PI * 20), 12)
      // The worm is a helical gear of `starts` teeth whose helix is the complement of γ.
      expect(dims.helixAngleDeg + dims.leadAngleDeg).toBeCloseTo(90, 12)
      expect(dims.pitchRadiusMm).toBe(10)
    })
  }

  it('reads the module and pressure angle as axial, and derives the normal values the wheel is cut with', () => {
    const dims = wormDimensions({ ...WORM, starts: 2, pressureAngleDeg: 20 })
    const gamma = dims.leadAngleDeg * DEG
    expect(dims.moduleMm).toBe(2)
    expect(dims.pressureAngleDeg).toBe(20)
    expect(dims.normalModuleMm).toBeCloseTo(2 * Math.cos(gamma), 12)
    expect(Math.tan(dims.normalPressureAngleDeg * DEG)).toBeCloseTo(Math.tan(20 * DEG) * Math.cos(gamma), 12)
  })

  it('cuts tooth depth in the normal module, so worm tip and wheel root clear by clearanceMm each way', () => {
    const dims = wormDimensions(WORM)
    expect(dims.addendumMm).toBeCloseTo(dims.normalModuleMm, 12)
    expect(dims.clearanceMm).toBeCloseTo(0.25 * dims.normalModuleMm, 12)
    expect(dims.dedendumMm).toBeCloseTo(dims.normalModuleMm + dims.clearanceMm, 12)
    expect(dims.tipRadiusMm).toBeCloseTo(10 + dims.addendumMm, 12)
    expect(dims.rootRadiusMm).toBeCloseTo(10 - dims.dedendumMm, 12)
    expect(dims.axialToothThicknessMm).toBeCloseTo(Math.PI, 12)
  })

  it('thins the axial tooth by half the backlash, like the rack and the gear (call 4)', () => {
    expect(wormDimensions({ ...WORM, backlashMm: 0.2 }).axialToothThicknessMm).toBeCloseTo(Math.PI - 0.1, 12)
  })

  it('records the length in leads (turns) when a length is given', () => {
    const dims = wormDimensions({ ...WORM, lengthMm: 4 * Math.PI })
    expect(dims.turns).toBeCloseTo(2, 12)
    expect(wormDimensions({ starts: 1, moduleMm: 2, pitchDiameterMm: 20 }).turns).toBeUndefined()
  })
})

describe('self-locking readout — information, not a guarantee', () => {
  it('is tan γ < μ, with an assumed μ as the default', () => {
    expect(DEFAULT_WORM_FRICTION_COEFFICIENT).toBe(0.1)
    const single = wormDimensions(WORM) // tan γ = 2/20 = 0.1, exactly on the line: not locking
    expect(single.frictionCoefficient).toBe(DEFAULT_WORM_FRICTION_COEFFICIENT)
    expect(Math.tan(single.leadAngleDeg * DEG)).toBeCloseTo(0.1, 12)
    expect(wormDimensions({ ...WORM, pitchDiameterMm: 24 }).selfLocking).toBe(true)
    expect(wormDimensions({ ...WORM, starts: 2 }).selfLocking).toBe(false)
    expect(wormDimensions({ ...WORM, starts: 2, frictionCoefficient: 0.25 }).selfLocking).toBe(true)
  })

  it('says, in the readout itself, that it is not a guarantee', () => {
    expect(wormDimensions(WORM).selfLockingNote).toMatch(/not a guarantee/i)
  })

  it('refuses a friction coefficient outside 0…1 by name', () => {
    for (const frictionCoefficient of [-0.1, 1.5, Number.NaN]) {
      const error = errorOf(() => wormDimensions({ ...WORM, frictionCoefficient }))
      expect(error).toBeInstanceOf(GearLimitError)
      expect(error.param).toBe('frictionCoefficient')
    }
  })
})

describe('worm wheel — a helical gear whose helix is the worm’s lead angle, same hand', () => {
  const WHEEL = Object.freeze({ teeth: 30, starts: 1, moduleMm: 2, wormPitchDiameterMm: 20, faceWidthMm: 10 })

  for (const starts of [1, 2, 4]) {
    it(`${starts}-start: helix = γ within 1e-9, ratio = wheelTeeth / starts, pitch diameter z·m (axial)`, () => {
      const worm = wormDimensions({ ...WORM, starts })
      const wheel = wormWheelDimensions({ ...WHEEL, starts })
      expect(Math.abs(wheel.helixAngleDeg - worm.leadAngleDeg)).toBeLessThan(1e-9)
      expect(wheel.ratio).toBe(30 / starts)
      expect(wheel.pitchDiameterMm).toBeCloseTo(30 * 2, 12)
      expect(wheel.centerDistanceMm).toBeCloseTo((20 + 60) / 2, 12)
    })
  }

  it('takes the worm’s hand', () => {
    expect(wormWheelDimensions(WHEEL).handedness).toBe('right')
    expect(wormWheelDimensions({ ...WHEEL, handedness: 'left' }).handedness).toBe('left')
  })

  it('emits gear.spur params whose transverse section is the spur gear meshing the worm’s axial rack', () => {
    const params = wormWheelGearParams({ ...WHEEL, starts: 2, boreMm: 8, backlashMm: 0.1 })
    const worm = wormDimensions({ ...WORM, starts: 2 })
    expect(params).toEqual({
      teeth: 30,
      moduleMm: worm.normalModuleMm,
      pressureAngleDeg: worm.normalPressureAngleDeg,
      helixAngleDeg: worm.leadAngleDeg,
      handedness: 'right',
      thicknessMm: 10,
      boreMm: 8,
      backlashMm: 0.1,
    })
    const dims = gearDimensions(/** @type {any} */ (params))
    expect(dims.pitchDiameterMm).toBeCloseTo(60, 9)
    expect(dims.transversePressureAngleDeg).toBeCloseTo(20, 9)
  })

  it('warns by name below the undercut limit (17 teeth at 20°), and not at or above it', () => {
    expect(wormWheelDimensions({ ...WHEEL, teeth: 16 }).warnings).toContain('wheel-undercut')
    expect(wormWheelDimensions({ ...WHEEL, teeth: 17 }).warnings).not.toContain('wheel-undercut')
    expect(wormWheelDimensions({ ...WHEEL, teeth: 17 }).minTeethWithoutUndercut).toBe(17)
    expect(wormWheelDimensions({ ...WHEEL, teeth: 40 }).warnings).toEqual([])
  })

  it('needs the worm’s module, starts, pitch diameter and its own teeth', () => {
    for (const missing of ['teeth', 'starts', 'moduleMm', 'wormPitchDiameterMm']) {
      const { [missing]: _gone, ...rest } = /** @type {Record<string, unknown>} */ ({ ...WHEEL })
      const error = errorOf(() => wormWheelDimensions(/** @type {any} */ (rest)))
      expect(error, missing).toBeInstanceOf(GearLimitError)
      expect(error.param).toBe(missing)
    }
  })
})

describe('the transverse section the kernel twists', () => {
  /** @param {Record<string, unknown>} [over] */
  const sectionOf = (over = {}) => wormSection({ ...WORM, pointsPerTurn: 64, ...over })

  it('is a CCW outline between the root and tip circles, `starts`-fold symmetric, tooth 0 centred on +X', () => {
    for (const starts of [1, 2, 4]) {
      const { outline, tipRadiusMm, rootRadiusMm } = sectionOf({ starts })
      expect(shoelaceAreaMm2(outline)).toBeGreaterThan(0)
      for (const [x, y] of outline) {
        const r = Math.hypot(x, y)
        expect(r).toBeGreaterThanOrEqual(rootRadiusMm - 1e-9)
        expect(r).toBeLessThanOrEqual(tipRadiusMm + 1e-9)
      }
      // Tooth 0's tip land straddles +X: the vertex nearest +X is on the tip circle.
      const nearest = outline.reduce((best, p) => (Math.abs(Math.atan2(p[1], p[0])) < Math.abs(Math.atan2(best[1], best[0])) ? p : best))
      expect(Math.hypot(nearest[0], nearest[1])).toBeCloseTo(tipRadiusMm, 9)
      expect(outline.length % starts).toBe(0)
    }
  })

  it('has the area of the axial rack swept round once: π·(r_root² ) + the thread’s share of the annulus', () => {
    // At every radius r the thread covers the fraction 2·w(r) / p of the circle (w the axial
    // half-width), the same in every transverse plane — so the area is ∫ 2πr · 2w(r)/p dr.
    const dims = wormDimensions(WORM)
    const tanA = Math.tan(20 * DEG)
    const w = (/** @type {number} */ r) => dims.axialToothThicknessMm / 2 - (r - dims.pitchRadiusMm) * tanA
    const n = 20000
    const dr = (dims.tipRadiusMm - dims.rootRadiusMm) / n
    let thread = 0
    for (let i = 0; i < n; i++) {
      const r = dims.rootRadiusMm + (i + 0.5) * dr
      thread += 2 * Math.PI * r * ((2 * w(r)) / dims.axialPitchMm) * dr
    }
    const expected = Math.PI * dims.rootRadiusMm ** 2 + thread
    expect(shoelaceAreaMm2(wormSection({ ...WORM, pointsPerTurn: 2048 }).outline)).toBeCloseTo(expected, 1)
  })

  it('places a flank vertex where the Archimedean flank says: r = r_p + (s/2 − θ·lead/2π) / tan α', () => {
    const { outline, leadMm, pitchRadiusMm, axialToothThicknessMm } = sectionOf({ pointsPerTurn: 256 })
    const tanA = Math.tan(20 * DEG)
    let checked = 0
    for (const [x, y] of outline) {
      const r = Math.hypot(x, y)
      const theta = Math.abs(Math.atan2(y, x))
      const rFlank = pitchRadiusMm + (axialToothThicknessMm / 2 - (theta * leadMm) / (2 * Math.PI)) / tanA
      if (r > wormDimensions(WORM).rootRadiusMm + 1e-6 && r < wormDimensions(WORM).tipRadiusMm - 1e-6) {
        expect(r).toBeCloseTo(rFlank, 9)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(4)
  })

  it('takes more points per turn for a finer resolution', () => {
    expect(sectionOf({ pointsPerTurn: 128 }).outline.length).toBeGreaterThan(sectionOf({ pointsPerTurn: 32 }).outline.length)
  })

  it('is the same section for both hands — the hand is the twist’s', () => {
    expect(sectionOf({ handedness: 'left' }).outline).toEqual(sectionOf().outline)
  })

  it('comes to a point, with a named warning, when the flanks meet below the tip', () => {
    const dims = wormDimensions({ ...WORM, pressureAngleDeg: 35, backlashMm: 1.2 })
    expect(dims.pointedTip).toBe(true)
    expect(dims.warnings).toContain('pointed-tip')
    expect(wormDimensions(WORM).pointedTip).toBe(false)
  })
})

describe('degenerate worms — refused or warned about by name', () => {
  it('refuses 0 starts and 5 starts (1…4), and a fractional start count', () => {
    expect(WORM_MAX_STARTS).toBe(4)
    for (const starts of [0, 5, 1.5, -1]) {
      const error = errorOf(() => wormDimensions({ ...WORM, starts }))
      expect(error, String(starts)).toBeInstanceOf(GearLimitError)
      expect(error.param).toBe('starts')
    }
  })

  it('refuses a pitch diameter below the root-diameter limit, naming the smallest it takes', () => {
    // Dedendum ≈ 1.25 · m_n ≈ 2.5 mm, so the root circle vanishes below d ≈ 5 mm.
    const error = errorOf(() => wormDimensions({ ...WORM, pitchDiameterMm: 4 }))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.param).toBe('pitchDiameterMm')
    expect(error.message).toMatch(/root/)
    expect(error.message).toMatch(/pitchDiameterMm/)
  })

  it('refuses a lead angle past 45° — the wheel’s helix cap — naming it', () => {
    expect(MAX_LEAD_ANGLE_DEG).toBe(45)
    const error = errorOf(() => wormDimensions({ ...WORM, starts: 4, pitchDiameterMm: 6 }))
    expect(error).toBeInstanceOf(GearLimitError)
    expect(error.message).toMatch(/lead angle/)
  })

  it('builds a worm shorter than one lead, with a named warning — the drive would lose contact once a turn', () => {
    const dims = wormDimensions({ ...WORM, lengthMm: 4 })
    expect(dims.leadMm).toBeGreaterThan(4)
    expect(dims.warnings).toContain('shorter-than-lead')
    expect(wormDimensions(WORM).warnings).toEqual([])
  })

  it('refuses a backlash that leaves no tooth', () => {
    expect(() => wormDimensions({ ...WORM, backlashMm: 2 * Math.PI })).toThrow(GearToothVanishedError)
  })

  it('refuses hostile and missing values before any arithmetic', () => {
    for (const bad of [{ moduleMm: Infinity }, { pitchDiameterMm: -3 }, { lengthMm: 0 }, { pressureAngleDeg: 60 }, { handedness: 'up' }]) {
      expect(() => wormDimensions(/** @type {any} */ ({ ...WORM, ...bad })), JSON.stringify(bad)).toThrow(GearParameterError)
    }
    expect(() => wormDimensions(/** @type {any} */ ({ starts: 1, moduleMm: 2 }))).toThrow(/pitchDiameterMm is required/)
  })
})

describe('worm.js is framework-free and kernel-free', () => {
  it('imports no @jscad/modeling, Vue or three.js', () => {
    expect(wormSource).not.toMatch(/from\s+['"](@jscad\/modeling|vue|three)/)
    expect(wormSource).not.toMatch(/\bdocument\.|\bwindow\./)
  })
})
