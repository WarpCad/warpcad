// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import {
  DEDENDUM_COEFFICIENT,
  GearParameterError,
  GearToothVanishedError,
  circularPitchMmToModuleMm,
  defaultClearanceMm,
  diametralPitchPerInchToModuleMm,
  gearDimensions,
  moduleMmToCircularPitchMm,
  v1BacklashToBacklashMm,
  v1DiametralPitchToModuleMm,
} from './dimensions.js'

const DEG = Math.PI / 180

describe('gear unit conversions (docs/decisions/gears.md Decision 2)', () => {
  it('converts circular pitch ↔ module through π', () => {
    expect(circularPitchMmToModuleMm(Math.PI * 2)).toBeCloseTo(2, 12)
    expect(moduleMmToCircularPitchMm(1.5)).toBeCloseTo(1.5 * Math.PI, 12)
    expect(circularPitchMmToModuleMm(moduleMmToCircularPitchMm(0.7))).toBeCloseTo(0.7, 12)
  })

  it('reads a standard inch diametral pitch as teeth per inch (25.4 / DP)', () => {
    expect(diametralPitchPerInchToModuleMm(25.4)).toBeCloseTo(1, 12)
    expect(diametralPitchPerInchToModuleMm(32)).toBeCloseTo(0.79375, 12)
  })

  it("reads V1's diametralPitch as 1/module in 1/mm, not teeth per inch", () => {
    // V1 sets diametralPitch = π / circularPitch with circularPitch in mm.
    const cpMm = (Math.PI * 50) / 36
    expect(v1DiametralPitchToModuleMm(Math.PI / cpMm)).toBeCloseTo(50 / 36, 12)
  })

  it("converts V1's backlash (tooth thinned by b/cos α) to the standard pair play", () => {
    // Call 4: backlashMm = 2 · backlashV1 / cos α, so each gear thins by backlashMm / 2.
    expect(v1BacklashToBacklashMm(0.1, 20)).toBeCloseTo(0.2 / Math.cos(20 * DEG), 12)
    expect(v1BacklashToBacklashMm(0, 35)).toBe(0)
  })

  it('defaults clearance to 0.25 · module (ISO 53, dedendum 1.25 m)', () => {
    expect(DEDENDUM_COEFFICIENT).toBe(1.25)
    expect(defaultClearanceMm(2)).toBeCloseTo(0.5, 12)
  })
})

describe('gearDimensions', () => {
  it('derives the standard closed-form values', () => {
    const d = gearDimensions({ teeth: 36, moduleMm: 50 / 36, pressureAngleDeg: 20, clearanceMm: 0.5 })
    const m = 50 / 36
    expect(d.pitchDiameterMm).toBeCloseTo(50, 12)
    expect(d.pitchRadiusMm).toBeCloseTo(25, 12)
    expect(d.baseDiameterMm).toBeCloseTo(50 * Math.cos(20 * DEG), 12)
    expect(d.baseRadiusMm).toBeCloseTo(25 * Math.cos(20 * DEG), 12)
    expect(d.circularPitchMm).toBeCloseTo(Math.PI * m, 12)
    expect(d.addendumMm).toBeCloseTo(m, 12)
    expect(d.dedendumMm).toBeCloseTo(m + 0.5, 12)
    expect(d.outsideRadiusMm).toBeCloseTo(25 + m, 12)
    expect(d.rootRadiusMm).toBeCloseTo(25 - m - 0.5, 12)
    expect(d.toothAngleDeg).toBeCloseTo(10, 12)
    expect(d.toothThicknessAtPitchMm).toBeCloseTo((Math.PI * m) / 2, 12)
    // The decision doc's measured V1 values (converged) for the same gear.
    expect(d.outsideRadiusMm).toBeCloseTo(26.3889, 4)
    expect(d.rootRadiusMm).toBeCloseTo(23.1111, 4)
    expect(d.baseRadiusMm).toBeCloseTo(23.4923, 4)
  })

  it('uses 1.25 m as the dedendum when clearance is omitted', () => {
    const d = gearDimensions({ teeth: 20, moduleMm: 2 })
    expect(d.pressureAngleDeg).toBe(20)
    expect(d.clearanceMm).toBeCloseTo(0.5, 12)
    expect(d.dedendumMm).toBeCloseTo(DEDENDUM_COEFFICIENT * 2, 12)
    expect(d.rootRadiusMm).toBeCloseTo(20 - 2.5, 12)
  })

  it('lets an explicit clearance of 0 override the 1.25 constant (V1-imported gears)', () => {
    const d = gearDimensions({ teeth: 12, moduleMm: 1, clearanceMm: 0 })
    expect(d.dedendumMm).toBeCloseTo(1, 12)
  })

  it('applies profile shift to addendum, dedendum and pitch thickness', () => {
    const x = 0.4
    const d = gearDimensions({ teeth: 12, moduleMm: 2, profileShift: x, clearanceMm: 0.5 })
    expect(d.addendumMm).toBeCloseTo(2 * (1 + x), 12)
    expect(d.dedendumMm).toBeCloseTo(2 * 1.25 - x * 2, 12)
    expect(d.outsideRadiusMm).toBeCloseTo(12 + 2 * (1 + x), 12)
    expect(d.rootRadiusMm).toBeCloseTo(12 + x * 2 - 2 - 0.5, 12)
    expect(d.toothThicknessAtPitchMm).toBeCloseTo(Math.PI + 2 * x * 2 * Math.tan(20 * DEG), 12)
  })

  it('thins each tooth by half the backlash at the pitch circle (call 4)', () => {
    const d = gearDimensions({ teeth: 30, moduleMm: 1, backlashMm: 0.2 })
    expect(d.toothThicknessAtPitchMm).toBeCloseTo(Math.PI / 2 - 0.1, 12)
  })

  it('flags undercut below 2(1 − x + c/m) / sin²α teeth (the sharp rack corner, clearance included)', () => {
    expect(gearDimensions({ teeth: 12, moduleMm: 1, clearanceMm: 0 }).undercut).toBe(true)
    expect(gearDimensions({ teeth: 18, moduleMm: 1, clearanceMm: 0 }).undercut).toBe(false)
    expect(gearDimensions({ teeth: 30, moduleMm: 1, pressureAngleDeg: 14.5, clearanceMm: 0 }).undercut).toBe(true)
    expect(gearDimensions({ teeth: 12, moduleMm: 1, profileShift: 0.5, clearanceMm: 0 }).undercut).toBe(false)
    expect(gearDimensions({ teeth: 20, moduleMm: 1, clearanceMm: 0 }).minTeethWithoutUndercut).toBeCloseTo(
      2 / Math.sin(20 * DEG) ** 2,
      9
    )
    // The default 0.25 m clearance deepens the corner, so 18 teeth now undercut slightly.
    expect(gearDimensions({ teeth: 20, moduleMm: 1 }).minTeethWithoutUndercut).toBeCloseTo(
      2.5 / Math.sin(20 * DEG) ** 2,
      9
    )
    expect(gearDimensions({ teeth: 18, moduleMm: 1 }).undercut).toBe(true)
  })

  it('starts the involute at the base circle when undercut, above it otherwise', () => {
    const under = gearDimensions({ teeth: 12, moduleMm: 1, clearanceMm: 0.5 })
    expect(under.involuteStartRadiusMm).toBeCloseTo(under.baseRadiusMm, 12)
    const clean = gearDimensions({ teeth: 40, moduleMm: 1, clearanceMm: 0.25 })
    // The form circle: where the rack's tip line crosses the line of action.
    const R = 20
    const a = 20 * DEG
    const depth = 1.25 // the rack corner's depth below the rolling line: m + c
    expect(clean.involuteStartRadiusMm).toBeCloseTo(Math.hypot(R - depth, depth / Math.tan(a)), 9)
    expect(clean.involuteStartRadiusMm).toBeGreaterThan(clean.baseRadiusMm)
  })

  describe('rejects bad parameters with a named error, never a NaN', () => {
    const base = { teeth: 20, moduleMm: 1 }
    it.each([
      ['non-integer teeth', { teeth: 12.5 }],
      ['zero teeth', { teeth: 0 }],
      ['negative teeth', { teeth: -12 }],
      ['fewer than 3 teeth', { teeth: 2 }],
      ['NaN teeth', { teeth: Number.NaN }],
      ['zero module', { moduleMm: 0 }],
      ['negative module', { moduleMm: -1 }],
      ['infinite module', { moduleMm: Number.POSITIVE_INFINITY }],
      ['pressure angle below 0', { pressureAngleDeg: -1 }],
      ['pressure angle above 45', { pressureAngleDeg: 46 }],
      ['non-finite profile shift', { profileShift: Number.NaN }],
      ['non-finite clearance', { clearanceMm: Number.NaN }],
      ['non-finite backlash', { backlashMm: Number.POSITIVE_INFINITY }],
    ])('%s', (_label, patch) => {
      expect(() => gearDimensions({ ...base, ...patch })).toThrow(GearParameterError)
    })

    it('a root circle at or below the centre', () => {
      expect(() => gearDimensions({ teeth: 4, moduleMm: 1, profileShift: -2 })).toThrow(GearParameterError)
    })

    it('a backlash so large the tooth vanishes at the pitch circle', () => {
      const err = (() => {
        try {
          gearDimensions({ teeth: 20, moduleMm: 1, backlashMm: Math.PI + 0.01 })
        } catch (e) {
          return e
        }
        return null
      })()
      expect(err).toBeInstanceOf(GearToothVanishedError)
      expect(err).toBeInstanceOf(GearParameterError)
      expect(/** @type {Error} */ (err).name).toBe('GearToothVanishedError')
    })
  })
})
