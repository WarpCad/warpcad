// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { GearParameterError, gearDimensions } from './dimensions.js'
import {
  HANDEDNESS,
  MAX_HELIX_ANGLE_DEG,
  MAX_TWIST_DEG,
  helixTwistRad,
  normalModuleMm,
  transverseModuleMm,
  transversePressureAngleDeg,
} from './helix.js'
import { involuteProfile, toothHalfAngleRadAt } from './involute.js'
import helixSource from './helix.js?raw'

const DEG = Math.PI / 180

describe('twist from helix angle: twist = t · tan β / r (TODO/core-042)', () => {
  const t = 10
  const r = 24

  it.each([0, 15, 30, 45])('β = %i° twists a right-hand gear by t · tan β / r', (beta) => {
    const twist = helixTwistRad({ thicknessMm: t, pitchRadiusMm: r, helixAngleDeg: beta })
    expect(twist).toBeCloseTo((t * Math.tan(beta * DEG)) / r, 14)
    // The definition read backwards: the tooth on the pitch cylinder leans at β.
    expect(Math.atan((r * twist) / t) / DEG).toBeCloseTo(beta, 10)
  })

  it('β = 0 is no twist at all — exactly 0, never −0, whichever hand', () => {
    for (const handedness of HANDEDNESS) {
      expect(Object.is(helixTwistRad({ thicknessMm: t, pitchRadiusMm: r, helixAngleDeg: 0, handedness }), 0)).toBe(true)
    }
  })

  it('a right hand twists CCW about +Z going up (positive), a left hand the other way', () => {
    const right = helixTwistRad({ thicknessMm: t, pitchRadiusMm: r, helixAngleDeg: 20, handedness: 'right' })
    const left = helixTwistRad({ thicknessMm: t, pitchRadiusMm: r, helixAngleDeg: 20, handedness: 'left' })
    expect(right).toBeGreaterThan(0)
    expect(left).toBeCloseTo(-right, 15)
    expect(helixTwistRad({ thicknessMm: t, pitchRadiusMm: r, helixAngleDeg: 20 })).toBe(right)
  })

  it('a negative helix angle is the other hand: −β right-hand twists as β left-hand', () => {
    const negative = helixTwistRad({ thicknessMm: t, pitchRadiusMm: r, helixAngleDeg: -20 })
    const left = helixTwistRad({ thicknessMm: t, pitchRadiusMm: r, helixAngleDeg: 20, handedness: 'left' })
    expect(negative).toBeLessThan(0)
    expect(negative).toBeCloseTo(left, 15)
  })

  it('scales linearly with thickness and inversely with pitch radius', () => {
    const base = helixTwistRad({ thicknessMm: t, pitchRadiusMm: r, helixAngleDeg: 30 })
    expect(helixTwistRad({ thicknessMm: 2 * t, pitchRadiusMm: r, helixAngleDeg: 30 })).toBeCloseTo(2 * base, 14)
    expect(helixTwistRad({ thicknessMm: t, pitchRadiusMm: 2 * r, helixAngleDeg: 30 })).toBeCloseTo(base / 2, 14)
  })

  it('caps the helix angle at 45° and a twisted run at one full turn', () => {
    expect(MAX_HELIX_ANGLE_DEG).toBe(45)
    expect(MAX_TWIST_DEG).toBe(360)
  })

  it('is framework-free and kernel-free', () => {
    expect(helixSource).not.toMatch(/from\s+['"](@jscad\/modeling|vue|three)/)
  })
})

describe('normal vs transverse module and pressure angle', () => {
  it('transverse module is mₙ / cos β, and back', () => {
    expect(transverseModuleMm(2, 30)).toBeCloseTo(2 / Math.cos(30 * DEG), 14)
    expect(normalModuleMm(transverseModuleMm(1.25, 17), 17)).toBeCloseTo(1.25, 14)
    expect(transverseModuleMm(2, 0)).toBe(2)
  })

  it('transverse pressure angle is atan(tan αₙ / cos β), and exactly αₙ at β = 0', () => {
    expect(transversePressureAngleDeg(20, 30)).toBeCloseTo(Math.atan(Math.tan(20 * DEG) / Math.cos(30 * DEG)) / DEG, 12)
    expect(transversePressureAngleDeg(20, 30)).toBeCloseTo(22.7959, 4)
    expect(transversePressureAngleDeg(20, 0)).toBe(20)
    expect(transversePressureAngleDeg(14.5, 0)).toBe(14.5)
  })
})

describe('gearDimensions with a helix angle: moduleMm and pressureAngleDeg are the normal values', () => {
  const beta = 30
  const mn = 2
  const z = 20
  const mt = mn / Math.cos(beta * DEG)
  const alphaT = Math.atan(Math.tan(20 * DEG) / Math.cos(beta * DEG))
  const d = gearDimensions({ teeth: z, moduleMm: mn, pressureAngleDeg: 20, helixAngleDeg: beta })

  it('reports both modules and both pressure angles by name', () => {
    expect(d.helixAngleDeg).toBe(beta)
    expect(d.moduleMm).toBe(mn)
    expect(d.transverseModuleMm).toBeCloseTo(mt, 12)
    expect(d.pressureAngleDeg).toBe(20)
    expect(d.transversePressureAngleDeg).toBeCloseTo(alphaT / DEG, 12)
  })

  it('puts the pitch circle at z · mₙ / cos β — what a store-bought helical gear of module mₙ has', () => {
    expect(d.pitchDiameterMm).toBeCloseTo(z * mt, 12)
    expect(d.baseRadiusMm).toBeCloseTo(((z * mt) / 2) * Math.cos(alphaT), 12)
    expect(d.circularPitchMm).toBeCloseTo(Math.PI * mt, 12)
  })

  it('keeps tooth depth in the normal module: tip = pitch R + mₙ, root = pitch R − 1.25 mₙ', () => {
    expect(d.addendumMm).toBeCloseTo(mn, 12)
    expect(d.outsideRadiusMm).toBeCloseTo((z * mt) / 2 + mn, 12)
    expect(d.clearanceMm).toBeCloseTo(0.25 * mn, 12)
    expect(d.rootRadiusMm).toBeCloseTo((z * mt) / 2 - 1.25 * mn, 12)
  })

  it('makes the normal tooth thickness π mₙ / 2 — the transverse one is that / cos β', () => {
    expect(d.toothThicknessAtPitchMm).toBeCloseTo((Math.PI * mt) / 2, 12)
    expect(d.toothThicknessAtPitchMm * Math.cos(beta * DEG)).toBeCloseTo((Math.PI * mn) / 2, 12)
    // The outline the generator samples agrees with the number.
    const half = toothHalfAngleRadAt(d, d.pitchRadiusMm)
    expect(2 * half * d.pitchRadiusMm).toBeCloseTo(d.toothThicknessAtPitchMm, 9)
  })

  it('shifts the profile by x · mₙ, in the normal module', () => {
    const shifted = gearDimensions({ teeth: z, moduleMm: mn, helixAngleDeg: beta, profileShift: 0.5 })
    expect(shifted.outsideRadiusMm).toBeCloseTo((z * mt) / 2 + 1.5 * mn, 12)
    expect(shifted.toothThicknessAtPitchMm).toBeCloseTo((Math.PI * mt) / 2 + 2 * 0.5 * mn * Math.tan(alphaT), 12)
  })

  it('builds an outline whose tip and root are those circles', () => {
    const profile = involuteProfile({ teeth: z, moduleMm: mn, helixAngleDeg: beta })
    const radii = profile.outline.map(([x, y]) => Math.hypot(x, y))
    expect(Math.max(...radii)).toBeCloseTo(d.outsideRadiusMm, 9)
    expect(Math.min(...radii)).toBeCloseTo(d.rootRadiusMm, 9)
  })

  it('judges undercut in the transverse plane: a 12T pinion at 30° undercuts less than at 0°', () => {
    const spur = gearDimensions({ teeth: 12, moduleMm: 1 })
    const helical = gearDimensions({ teeth: 12, moduleMm: 1, helixAngleDeg: 30 })
    expect(helical.minTeethWithoutUndercut).toBeLessThan(spur.minTeethWithoutUndercut)
  })

  it('at β = 0 is the plain spur gear exactly, field for field', () => {
    for (const params of [
      { teeth: 36, moduleMm: 50 / 36, clearanceMm: 0.5, backlashMm: 0.2 },
      { teeth: 12, moduleMm: 0.78, pressureAngleDeg: 29.84, clearanceMm: 0 },
      { teeth: 17, moduleMm: 2, profileShift: 0.3 },
    ]) {
      const plain = gearDimensions(params)
      expect(gearDimensions({ ...params, helixAngleDeg: 0 })).toEqual(plain)
      expect(plain.helixAngleDeg).toBe(0)
      expect(plain.transverseModuleMm).toBe(plain.moduleMm)
      expect(plain.transversePressureAngleDeg).toBe(plain.pressureAngleDeg)
      expect(involuteProfile({ ...params, helixAngleDeg: 0 }).outline).toEqual(involuteProfile(params).outline)
    }
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '30'],
    ['negative', -10],
    ['90°', 90],
  ])('rejects a helix angle that is %s with a named error, never a NaN', (_label, helixAngleDeg) => {
    expect(() => gearDimensions({ teeth: 20, moduleMm: 2, helixAngleDeg: /** @type {any} */ (helixAngleDeg) })).toThrow(
      GearParameterError
    )
  })
})

