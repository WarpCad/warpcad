// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/v1-internal-rack.json'
import { GearParameterError, GearToothVanishedError, circularPitchMmToModuleMm } from './dimensions.js'
import { rackHalfWidthMmAt } from './involute.js'
import { DEFAULT_RACK_HEIGHT_MODULES, DEFAULT_RACK_TEETH, rackDimensions, rackProfile } from './rack.js'
import rackSource from './rack.js?raw'

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
 * Tooth widths along X on the horizontal line `y = yMm` — the measure the fixture
 * generator takes on V1's rack along its own vertical lines.
 *
 * @param {readonly (readonly number[])[]} points
 * @param {number} yMm
 */
function widthsAt(points, yMm) {
  /** @type {number[]} */
  const xs = []
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    if (y0 === y1) continue
    const t = (yMm - y0) / (y1 - y0)
    if (t >= 0 && t < 1) xs.push(x0 + t * (x1 - x0))
  }
  xs.sort((a, b) => a - b)
  /** @type {number[]} */
  const widths = []
  for (let i = 0; i + 1 < xs.length; i += 2) widths.push(xs[i + 1] - xs[i])
  return widths
}

describe('rackDimensions: the straight-line limit of the spur profile', () => {
  const dims = rackDimensions({ teeth: 12, moduleMm: 2 })

  it('sets the pitch line at y = 0, the tip one module above it and the root one dedendum below', () => {
    expect(dims.kind).toBe('rack')
    expect(dims.tipYMm).toBeCloseTo(2, 12)
    expect(dims.rootYMm).toBeCloseTo(-2.5, 12)
    expect(dims.clearanceMm).toBeCloseTo(0.5, 12)
  })

  it('is a true-length bar: teeth · circular pitch long, backed by 4 modules unless told otherwise', () => {
    expect(dims.lengthMm).toBeCloseTo(12 * 2 * Math.PI, 12)
    expect(DEFAULT_RACK_HEIGHT_MODULES).toBe(4)
    expect(dims.heightMm).toBeCloseTo(8, 12)
    expect(dims.backYMm).toBeCloseTo(-2.5 - 8, 12)
    expect(rackDimensions({ teeth: 12, moduleMm: 2, heightMm: 3 }).backYMm).toBeCloseTo(-5.5, 12)
  })

  it('defaults to 10 teeth (V1 hard-coded 41 — Decision 5 defect 2)', () => {
    expect(DEFAULT_RACK_TEETH).toBe(10)
    expect(rackDimensions({ moduleMm: 1 }).teeth).toBe(10)
  })

  it('thins the tooth by half the backlash on the pitch line, as for a gear (call 4)', () => {
    const play = rackDimensions({ teeth: 12, moduleMm: 2, backlashMm: 0.2 })
    expect(play.toothThicknessAtPitchMm).toBeCloseTo(Math.PI - 0.1, 12)
    expect(2 * rackHalfWidthMmAt(play, 0)).toBeCloseTo(Math.PI - 0.1, 12)
  })

  it('takes its flank from involute.js: half width falls by tan α per mm of height', () => {
    const half = (/** @type {number} */ y) => rackHalfWidthMmAt(dims, y)
    expect(half(1) - half(0)).toBeCloseTo(-Math.tan((20 * Math.PI) / 180), 12)
    expect(dims.tipHalfWidthMm).toBeCloseTo(half(2), 12)
  })

  it('never imports @jscad/modeling, Vue or the DOM — core stays framework-free', () => {
    expect(rackSource).not.toMatch(/from\s+['"](@jscad\/modeling|vue|three)/)
  })
})

describe('rackProfile: teeth along +X pointing +Y, centred on the origin', () => {
  const profile = rackProfile({ teeth: 12, moduleMm: 2, backlashMm: 0.1 })

  it('is one CCW outline spanning ±length/2 in X, from the back to the tip in Y', () => {
    const xs = profile.outline.map(([x]) => x)
    const ys = profile.outline.map(([, y]) => y)
    expect(shoelaceAreaMm2(profile.outline)).toBeGreaterThan(0)
    expect(Math.min(...xs)).toBeCloseTo(-profile.lengthMm / 2, 12)
    expect(Math.max(...xs)).toBeCloseTo(profile.lengthMm / 2, 12)
    expect(Math.max(...ys)).toBeCloseTo(profile.tipYMm, 12)
    expect(Math.min(...ys)).toBeCloseTo(profile.backYMm, 12)
  })

  it('has exactly the teeth asked for, each the pitch-line thickness wide on y = 0', () => {
    const widths = widthsAt(profile.outline, 0)
    expect(widths).toHaveLength(12)
    for (const w of widths) expect(w).toBeCloseTo(profile.toothThicknessAtPitchMm, 9)
  })

  it('has the area the trapezoids and the bar add up to', () => {
    const { lengthMm, heightMm, tipHalfWidthMm, rootYMm, tipYMm, teeth } = profile
    const rootHalfWidthMm = rackHalfWidthMmAt(profile, rootYMm)
    const toothMm2 = (tipHalfWidthMm + rootHalfWidthMm) * (tipYMm - rootYMm)
    expect(shoelaceAreaMm2(profile.outline)).toBeCloseTo(lengthMm * heightMm + teeth * toothMm2, 9)
  })

  it('never emits NaN or a repeated vertex', () => {
    expect(profile.outline.flat().every(Number.isFinite)).toBe(true)
    for (let i = 0; i < profile.outline.length; i++) {
      const [x0, y0] = profile.outline[i]
      const [x1, y1] = profile.outline[(i + 1) % profile.outline.length]
      expect(Math.hypot(x1 - x0, y1 - y0), `vertex ${i}`).toBeGreaterThan(1e-9)
    }
  })
})

describe('parity with V1’s rack', () => {
  // V1's rack runs along Y with teeth pointing +X and its pitch line on x = 0, so V1's x is
  // WarpCad's y. Its flank rises sin α per unit of depth (the core-040 addendum), so the
  // generator is given atan(sin α); its backlash thins the rack by b / (2 cos α) — half of
  // what a V1 gear's does (Decision 5 defect 8) — which is backlashMm = b / cos α here.
  for (const c of fixture.racks) {
    it(`${c.id}: tip, root, back, length and tooth width at every sampled height`, () => {
      const v1 = /** @type {Record<string, number>} */ (c.v1Params)
      const moduleMm = circularPitchMmToModuleMm(v1.circularPitch)
      const alphaRad = (v1.pressureAngle * Math.PI) / 180
      const dims = rackProfile({
        teeth: 41,
        moduleMm,
        pressureAngleDeg: (Math.atan(Math.sin(alphaRad)) * 180) / Math.PI,
        clearanceMm: v1.clearance,
        backlashMm: v1.backlash / Math.cos(alphaRad),
        heightMm: 4 * moduleMm,
      })
      expect(dims.tipYMm).toBeCloseTo(c.tipXMm, 6)
      expect(dims.rootYMm).toBeCloseTo(c.rootXMm, 6)
      expect(dims.backYMm).toBeCloseTo(c.backXMm, 6)
      expect(dims.lengthMm).toBeCloseTo(c.lengthMm, 6)
      for (const sample of c.widthAt) {
        const widths = widthsAt(dims.outline, sample.xMm)
        expect(widths, `y ${sample.xMm}`).toHaveLength(sample.teeth)
        for (const w of widths) expect(w).toBeCloseTo(/** @type {number} */ (sample.widthMm), 6)
      }
      expect(shoelaceAreaMm2(dims.outline)).toBeCloseTo(c.areaMm2, 4)
    })
  }
})

describe('degenerate racks', () => {
  it('builds a one-tooth rack: one pitch long, one tooth', () => {
    const one = rackProfile({ teeth: 1, moduleMm: 2 })
    expect(one.lengthMm).toBeCloseTo(2 * Math.PI, 12)
    expect(widthsAt(one.outline, 0)).toHaveLength(1)
    expect(shoelaceAreaMm2(one.outline)).toBeGreaterThan(0)
  })

  it('points the tip where the flanks meet below the addendum line, and says so', () => {
    const sharp = rackProfile({ teeth: 4, moduleMm: 1, pressureAngleDeg: 35, backlashMm: 0.4 })
    expect(sharp.warnings).toContain('pointed-tip')
    expect(sharp.tipYMm).toBeLessThan(1)
    expect(sharp.tipHalfWidthMm).toBe(0)
    expect(rackHalfWidthMmAt(sharp, sharp.tipYMm)).toBeCloseTo(0, 12)
    expect(widthsAt(sharp.outline, 0)).toHaveLength(4)
  })

  it('points the space where the flanks meet above the root line, and says so', () => {
    const deep = rackProfile({ teeth: 4, moduleMm: 1, pressureAngleDeg: 35, clearanceMm: 0.5 })
    expect(deep.warnings).toContain('pointed-root')
    expect(deep.rootYMm).toBeGreaterThan(-1.5)
    expect(rackHalfWidthMmAt(deep, deep.rootYMm)).toBeCloseTo(Math.PI / 2, 9)
    expect(shoelaceAreaMm2(deep.outline)).toBeGreaterThan(0)
  })

  it('builds at the pressure-angle extremes, including the straight-sided 0°', () => {
    for (const pressureAngleDeg of [0, 5, 35, 45]) {
      const p = rackProfile({ teeth: 6, moduleMm: 1, pressureAngleDeg })
      expect(p.outline.flat().every(Number.isFinite), String(pressureAngleDeg)).toBe(true)
      expect(widthsAt(p.outline, 0)).toHaveLength(6)
    }
  })

  it('refuses a backlash that leaves no tooth, with the gear’s named error', () => {
    expect(() => rackDimensions({ teeth: 4, moduleMm: 1, backlashMm: 2 * Math.PI })).toThrow(GearToothVanishedError)
  })

  it('refuses parameters that cannot make a rack', () => {
    for (const params of [
      { teeth: 0, moduleMm: 1 },
      { teeth: 2.5, moduleMm: 1 },
      { teeth: 4, moduleMm: 0 },
      { teeth: 4, moduleMm: Number.NaN },
      { teeth: 4, moduleMm: 1, pressureAngleDeg: 46 },
      { teeth: 4, moduleMm: 1, heightMm: 0 },
      { teeth: 4, moduleMm: 1, clearanceMm: Number.POSITIVE_INFINITY },
    ]) {
      expect(() => rackDimensions(params), JSON.stringify(params)).toThrow(GearParameterError)
    }
  })
})
