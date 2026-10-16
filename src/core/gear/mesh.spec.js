// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { GearParameterError, gearDimensions } from './dimensions.js'
import { helixTwistRad } from './helix.js'
import { GearMeshError, internalProfile, ringGearDimensions } from './internal.js'
import { involuteProfile } from './involute.js'
import { GearLimitError } from './limits.js'
import {
  PITCH_PLANES,
  PITCH_PLANE_BASIS,
  centerDistanceMm,
  compatibility,
  gearRatio,
  meshPhaseDeg,
  meshPlacement,
} from './mesh.js'
import meshSource from './mesh.js?raw'

const DEG = Math.PI / 180
/** @param {number} a radians */
const inv = (a) => Math.tan(a) - a

/** `window-motor`'s pair: circularPitch π·50/36, so module 50/36. */
const WM_MODULE_MM = 50 / 36
/** @type {import('./mesh.js').MeshGear} */
const WM_DRIVE = { teeth: 36, moduleMm: WM_MODULE_MM, clearanceMm: 0.5, backlashMm: 0.2 }
/** @type {import('./mesh.js').MeshGear} */
const WM_PINION = { teeth: 12, moduleMm: WM_MODULE_MM, clearanceMm: 0.5, backlashMm: 0.2 }

/**
 * `x` reduced into `[0, period)`, so two phases that differ by a whole number of teeth compare equal.
 *
 * @param {number} x
 * @param {number} period
 */
function modulo(x, period) {
  const r = ((x % period) + period) % period
  return Math.abs(r - period) < 1e-9 ? 0 : r
}

/**
 * Assert two angles are the same modulo `period`, degrees.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} period
 */
function expectSamePhase(actual, expected, period) {
  const d = modulo(actual - expected, period)
  expect(Math.min(d, period - d)).toBeCloseTo(0, 9)
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

/** @param {import('./mesh.js').MeshReason[]} reasons */
const codesOf = (reasons) => reasons.map((reason) => reason.code)

describe('centerDistanceMm', () => {
  it('is (36 + 12)/2 · (cp/π) for window-motor’s 36T/12T, in either order', () => {
    const cp = (Math.PI * 50) / 36
    const expected = ((36 + 12) / 2) * (cp / Math.PI)
    expect(centerDistanceMm(WM_DRIVE, WM_PINION)).toBeCloseTo(expected, 12)
    expect(centerDistanceMm(WM_PINION, WM_DRIVE)).toBeCloseTo(expected, 12)
  })

  it('is not moved by backlash or clearance — backlash thins the teeth, it does not spread the shafts', () => {
    const bare = centerDistanceMm({ teeth: 36, moduleMm: 2 }, { teeth: 12, moduleMm: 2 })
    expect(bare).toBeCloseTo(48, 12)
    expect(centerDistanceMm({ teeth: 36, moduleMm: 2, backlashMm: 0.3, clearanceMm: 0.6 }, { teeth: 12, moduleMm: 2, backlashMm: 0.3 })).toBeCloseTo(48, 12)
  })

  it('spreads by j / (2 tan α) for an extra backlash option', () => {
    const a = centerDistanceMm({ teeth: 36, moduleMm: 2 }, { teeth: 12, moduleMm: 2 }, { extraBacklashMm: 0.1 })
    expect(a).toBeCloseTo(48 + 0.1 / (2 * Math.tan(20 * DEG)), 12)
  })

  it('uses the transverse module on a helical pair: (z₁ + z₂) · mₙ / (2 cos β)', () => {
    const a = centerDistanceMm(
      { teeth: 20, moduleMm: 1.5, helixAngleDeg: 20, handedness: 'right' },
      { teeth: 12, moduleMm: 1.5, helixAngleDeg: 20, handedness: 'left' }
    )
    expect(a).toBeCloseTo((32 * 1.5) / (2 * Math.cos(20 * DEG)), 12)
  })

  it('with profile shift, is the working distance at which the shifted teeth mesh with no play', () => {
    const A = { teeth: 12, moduleMm: 2, profileShift: 0.4 }
    const B = { teeth: 30, moduleMm: 2, profileShift: 0.1 }
    const a = centerDistanceMm(A, B)
    expect(a).toBeGreaterThan(42) // spread apart by a positive shift sum
    expect(a).toBeLessThan(42 + 0.5 * 2) // …but by less than (x₁ + x₂)·m: the y-factor
    // Independent check: on the working pitch circles (cos αw = (rb₁ + rb₂) / a) the two
    // tooth thicknesses sum to exactly one working circular pitch.
    const dA = gearDimensions(A)
    const dB = gearDimensions(B)
    const alphaW = Math.acos((dA.baseRadiusMm + dB.baseRadiusMm) / a)
    const alpha = 20 * DEG
    /** @param {import('./dimensions.js').GearDimensions} d */
    const thicknessOnWorking = (d) => {
      const rw = d.baseRadiusMm / Math.cos(alphaW)
      return rw * (d.toothThicknessAtPitchMm / d.pitchRadiusMm + 2 * inv(alpha) - 2 * inv(alphaW))
    }
    const rwA = dA.baseRadiusMm / Math.cos(alphaW)
    expect(thicknessOnWorking(dA) + thicknessOnWorking(dB)).toBeCloseTo((2 * Math.PI * rwA) / 12, 9)
  })

  it('is R_ring − R_pinion for a ring pair, and the working distance with a shifted pinion', () => {
    const ring = { kind: /** @type {const} */ ('internal'), teeth: 64, moduleMm: 1 }
    expect(centerDistanceMm(ring, { teeth: 14, moduleMm: 1 })).toBeCloseTo(25, 12)
    expect(centerDistanceMm({ teeth: 14, moduleMm: 1 }, ring)).toBeCloseTo(25, 12)

    const pinion = { teeth: 14, moduleMm: 1, profileShift: 0.3 }
    const a = centerDistanceMm(ring, pinion)
    const dR = ringGearDimensions(ring)
    const dP = gearDimensions(pinion)
    const alphaW = Math.acos((dR.baseRadiusMm - dP.baseRadiusMm) / a)
    const alpha = 20 * DEG
    const rwP = dP.baseRadiusMm / Math.cos(alphaW)
    const rwR = dR.baseRadiusMm / Math.cos(alphaW)
    // The pinion's tooth fills the ring's space on the working circles exactly.
    const pinionTooth = rwP * (dP.toothThicknessAtPitchMm / dP.pitchRadiusMm + 2 * inv(alpha) - 2 * inv(alphaW))
    const ringSpace = rwR * (dR.spaceWidthAtPitchMm / dR.pitchRadiusMm + 2 * inv(alpha) - 2 * inv(alphaW))
    expect(pinionTooth).toBeCloseTo(ringSpace, 9)
  })

  it('is the pinion pitch radius plus x·m for a rack pair', () => {
    const rack = { kind: /** @type {const} */ ('rack'), moduleMm: 2 }
    expect(centerDistanceMm(rack, { teeth: 12, moduleMm: 2 })).toBeCloseTo(12, 12)
    expect(centerDistanceMm({ teeth: 12, moduleMm: 2, profileShift: 0.25 }, rack)).toBeCloseTo(12.5, 12)
  })

  it('refuses gears that cannot mesh with a named GearMeshError, not a meaningless number', () => {
    const error = errorOf(() => centerDistanceMm({ teeth: 20, moduleMm: 2 }, { teeth: 20, moduleMm: 1.5 }))
    expect(error).toBeInstanceOf(GearMeshError)
    expect(error.code).toBe('module-mismatch')
  })
})

describe('gearRatio — signed, from both gears (V1’s gear1/gear1 was always 1)', () => {
  it('is exactly −3 driving the 36T from the 12T, and −12/36 the other way', () => {
    expect(gearRatio(WM_PINION, WM_DRIVE)).toBe(-3)
    expect(gearRatio(WM_DRIVE, WM_PINION)).toBe(-12 / 36)
  })

  it('is positive for a ring pair — an internal pair does not reverse', () => {
    expect(gearRatio({ teeth: 14, moduleMm: 1 }, { kind: 'internal', teeth: 64, moduleMm: 1 })).toBe(64 / 14)
  })

  it('degenerate: equal tooth counts are ratio magnitude 1, reversed', () => {
    expect(gearRatio({ teeth: 20, moduleMm: 1 }, { teeth: 20, moduleMm: 1 })).toBe(-1)
  })

  it('a rack pair has no turns ratio — refused by name', () => {
    const error = errorOf(() => gearRatio({ kind: 'rack', moduleMm: 1 }, { teeth: 12, moduleMm: 1 }))
    expect(error).toBeInstanceOf(GearMeshError)
    expect(error.code).toBe('rack-pair')
  })
})

describe('meshPhaseDeg — the half-tooth rule, generalised', () => {
  it('precondition: an external gear’s tooth 0 is centred on +X (core-040’s layout)', () => {
    const profile = involuteProfile({ teeth: 13, moduleMm: 2 })
    const [x, y] = profile.outline[profile.verticesPerTooth / 2]
    expect(y).toBeCloseTo(0, 12)
    expect(x).toBeCloseTo(profile.tipRadiusMm, 12)
  })

  it('precondition: a ring’s tooth 0 is centred on +X, pointing inward', () => {
    const profile = internalProfile({ teeth: 64, moduleMm: 1 })
    const [x, y] = profile.outline[profile.verticesPerTooth / 2]
    expect(y).toBeCloseTo(0, 12)
    expect(x).toBeCloseTo(profile.tipRadiusMm, 12)
  })

  it.each([12, 13, 8, 9, 36])('matches V1’s 180 + 180/z₂ (mod one tooth) with gear 1 at rest, z₂ = %i', (z2) => {
    const phase = meshPhaseDeg({ teeth: 30, moduleMm: 1 }, { teeth: z2, moduleMm: 1 })
    expectSamePhase(phase, 180 + 180 / z2, 360 / z2)
  })

  it('is half a tooth for an even tooth count and zero for an odd one, reduced to within ±½ tooth', () => {
    expect(Math.abs(meshPhaseDeg({ teeth: 30, moduleMm: 1 }, { teeth: 12, moduleMm: 1 }))).toBeCloseTo(15, 9)
    expect(meshPhaseDeg({ teeth: 30, moduleMm: 1 }, { teeth: 13, moduleMm: 1 })).toBeCloseTo(0, 9)
  })

  it('does not change with profile shift (a shifted tooth is still symmetric about its centre line)', () => {
    for (const z2 of [12, 13]) {
      const plain = meshPhaseDeg({ teeth: 30, moduleMm: 1 }, { teeth: z2, moduleMm: 1 })
      const shifted = meshPhaseDeg({ teeth: 30, moduleMm: 1, profileShift: 0.2 }, { teeth: z2, moduleMm: 1, profileShift: 0.4 })
      expectSamePhase(shifted, plain, 360 / z2)
    }
  })

  it('generalises to gear 1 turned: gear 2 turns back by z₁/z₂ of it (the gears roll)', () => {
    const drive = { teeth: 36, moduleMm: 1, frame: { centerMm: /** @type {[number, number, number]} */ ([0, 0, 0]), phaseDeg: 7 } }
    const phase = meshPhaseDeg(drive, { teeth: 12, moduleMm: 1 })
    expectSamePhase(phase, 180 + 180 / 12 - (36 / 12) * 7, 30)
  })

  it('generalises to gear 2 on any bearing from gear 1: the whole layout turned by that bearing', () => {
    const drive = { teeth: 36, moduleMm: 1, frame: { centerMm: /** @type {[number, number, number]} */ ([0, 0, 0]) } }
    const pinion = { teeth: 12, moduleMm: 1, frame: { centerMm: /** @type {[number, number, number]} */ ([0, 40, 0]) } }
    const phase = meshPhaseDeg(drive, pinion)
    // Bearing 90°: φ₂ = θ + 180 + 180/z₂ − (z₁/z₂)(φ₁ − θ) with φ₁ = 0.
    expectSamePhase(phase, 90 + 180 + 15 + 3 * 90, 30)
  })

  it('ring first: the pinion turns half a tooth so a space faces ring tooth 0 (the ring spec’s phase)', () => {
    const phase = meshPhaseDeg({ kind: 'internal', teeth: 64, moduleMm: 1 }, { teeth: 14, moduleMm: 1 })
    expectSamePhase(phase, 180 / 14, 360 / 14)
  })

  it('pinion first: the ring’s phase is the same physical mesh seen from the other gear', () => {
    const ring = { kind: /** @type {const} */ ('internal'), teeth: 64, moduleMm: 1 }
    const pinion = { teeth: 14, moduleMm: 1 }
    const placed = meshPlacement(pinion, ring)
    // The ring lands at +X of the pinion. Turn the whole layout 180° about the ring's new
    // centre and it is the ring-first layout: ring at rest with phase φ_R + 180, pinion on
    // +X with phase 180 — which must satisfy the ring-first rule.
    expect(placed.centerMm[0]).toBeCloseTo(25, 12)
    const back = meshPhaseDeg({ ...ring, frame: { centerMm: [0, 0, 0], phaseDeg: placed.phaseDeg + 180 } }, pinion)
    expectSamePhase(back, 180, 360 / 14)
  })

  it('rack first: a pinion tooth points straight down into a space (even rack) or a space straddles a tooth (odd)', () => {
    const even = meshPlacement({ kind: 'rack', teeth: 10, moduleMm: 2 }, { teeth: 13, moduleMm: 2 })
    expect(even.centerMm[0]).toBeCloseTo(0, 12)
    expect(even.centerMm[1]).toBeCloseTo(13, 12)
    expectSamePhase(even.phaseDeg, -90, 360 / 13)
    const odd = meshPlacement({ kind: 'rack', teeth: 11, moduleMm: 2 }, { teeth: 13, moduleMm: 2 })
    expectSamePhase(odd.phaseDeg, -90 + 180 / 13, 360 / 13)
  })

  it('pinion first: the rack slides along itself to mesh, it does not turn', () => {
    const pinion = { teeth: 12, moduleMm: 2 }
    const rack = { kind: /** @type {const} */ ('rack'), teeth: 10, moduleMm: 2, frame: { centerMm: /** @type {[number, number, number]} */ ([0.7, -20, 0]) } }
    const placed = meshPlacement(pinion, rack)
    expect(placed.rotateDeg).toBe(0)
    expect(placed.centerMm[1]).toBeCloseTo(-12, 12)
    // Seen from the rack, the pinion at rest must then satisfy the rack-first rule.
    const back = meshPlacement({ ...rack, frame: { centerMm: placed.centerMm } }, { ...pinion, frame: { centerMm: [0, 0, 0] } })
    expectSamePhase(back.phaseDeg, 0, 30)
    expect(back.translateMm[0]).toBeCloseTo(0, 9)
    expect(back.translateMm[1]).toBeCloseTo(0, 9)
  })

  it('helical: moving gear 2 up its axis by Δ turns it by Δ·tan β / r₂ (its section at the mesh moved)', () => {
    const drive = { teeth: 20, moduleMm: 1.5, helixAngleDeg: 20, handedness: /** @type {const} */ ('right'), thicknessMm: 8 }
    /** @param {number} zMm */
    const pinionAt = (zMm) => ({
      teeth: 12,
      moduleMm: 1.5,
      helixAngleDeg: 20,
      handedness: /** @type {const} */ ('left'),
      thicknessMm: 8,
      frame: { centerMm: /** @type {[number, number, number]} */ ([30, 0, zMm]) },
    })
    const level = meshPhaseDeg(drive, pinionAt(0))
    const raised = meshPhaseDeg(drive, pinionAt(1.5))
    const rP = gearDimensions({ teeth: 12, moduleMm: 1.5, helixAngleDeg: 20 }).pitchRadiusMm
    const kDeg = helixTwistRad({ thicknessMm: 1.5, pitchRadiusMm: rP, helixAngleDeg: 20, handedness: 'left' }) / DEG
    expectSamePhase(raised - level, kDeg, 30)
  })
})

describe('meshPlacement — a frame per gear in, the delta for gear 2 out', () => {
  it('moves gear 2 along its current bearing to the centre distance and turns it the smallest way', () => {
    const drive = { teeth: 36, moduleMm: 1, frame: { centerMm: /** @type {[number, number, number]} */ ([10, 5, 3]) } }
    const pinion = { teeth: 12, moduleMm: 1, frame: { centerMm: /** @type {[number, number, number]} */ ([10, 105, 7]), phaseDeg: 2 } }
    const placed = meshPlacement(drive, pinion)
    expect(placed.centerDistanceMm).toBeCloseTo(24, 12)
    expect(placed.centerMm[0]).toBeCloseTo(10, 12)
    expect(placed.centerMm[1]).toBeCloseTo(29, 12)
    expect(placed.centerMm[2]).toBe(7) // the axial position is the caller's, not the mesh's
    expect(placed.translateMm).toEqual([expect.closeTo(0, 12), expect.closeTo(-76, 12), 0])
    expect(Math.abs(placed.rotateDeg)).toBeLessThanOrEqual(15 + 1e-9)
    expect(placed.phaseDeg).toBeCloseTo(2 + placed.rotateDeg, 12)
    expect(placed.ratio).toBe(-12 / 36)
  })

  it('places gear 2 on +u of the pitch plane when it sits on gear 1’s axis', () => {
    for (const plane of PITCH_PLANES) {
      const placed = meshPlacement(
        { teeth: 36, moduleMm: 1, frame: { centerMm: [0, 0, 0], pitchPlane: plane } },
        { teeth: 12, moduleMm: 1, frame: { centerMm: [0, 0, 0], pitchPlane: plane } }
      )
      const u = PITCH_PLANE_BASIS[plane].u
      expect(placed.centerMm).toEqual(u.map((c) => expect.closeTo(24 * c, 12)))
      expect(placed.pitchPlane).toBe(plane)
    }
  })

  it('names a right-handed basis for each pitch plane (u × v = n), whose rotation maps local X, Y, Z onto it', () => {
    for (const plane of PITCH_PLANES) {
      const { u, v, n } = PITCH_PLANE_BASIS[plane]
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      expect(cross).toEqual(n.map((c) => expect.closeTo(c, 12)))
    }
  })

  it('refuses gears on crossed axes by name (no crossed-axis placement yet)', () => {
    const error = errorOf(() =>
      meshPlacement(
        { teeth: 20, moduleMm: 1, helixAngleDeg: 45, frame: { centerMm: [0, 0, 0], pitchPlane: 'xy' } },
        { teeth: 20, moduleMm: 1, helixAngleDeg: 45, frame: { centerMm: [0, 0, 0], pitchPlane: 'xz' } }
      )
    )
    expect(error).toBeInstanceOf(GearMeshError)
    expect(error.code).toBe('axes-not-parallel')
  })
})

describe('compatibility — the reasons a pair will not mesh, each a code and a sentence', () => {
  it('a matched pair has no reasons', () => {
    expect(compatibility(WM_DRIVE, WM_PINION)).toEqual([])
    expect(
      compatibility(
        { teeth: 20, moduleMm: 1.5, helixAngleDeg: 20, handedness: 'right' },
        { teeth: 12, moduleMm: 1.5, helixAngleDeg: 20, handedness: 'left' }
      )
    ).toEqual([])
  })

  /** @type {[string, import('./mesh.js').MeshGear, import('./mesh.js').MeshGear, string][]} */
  const cases = [
    ['mismatched module', { teeth: 20, moduleMm: 2 }, { teeth: 12, moduleMm: 1.5 }, 'module-mismatch'],
    ['mismatched pressure angle', { teeth: 20, moduleMm: 2 }, { teeth: 12, moduleMm: 2, pressureAngleDeg: 14.5 }, 'pressure-angle-mismatch'],
    [
      'same-hand helical on parallel axes',
      { teeth: 20, moduleMm: 2, helixAngleDeg: 20, handedness: 'right' },
      { teeth: 12, moduleMm: 2, helixAngleDeg: 20, handedness: 'right' },
      'helix-hand-same',
    ],
    ['mismatched helix angle', { teeth: 20, moduleMm: 2, helixAngleDeg: 20 }, { teeth: 12, moduleMm: 2, helixAngleDeg: 15, handedness: 'left' }, 'helix-angle-mismatch'],
    ['a helical pinion on a spur gear', { teeth: 20, moduleMm: 2 }, { teeth: 12, moduleMm: 2, helixAngleDeg: 15 }, 'helix-angle-mismatch'],
    [
      'a ring and pinion of opposite hands',
      { kind: 'internal', teeth: 64, moduleMm: 1, helixAngleDeg: 15, handedness: 'right' },
      { teeth: 14, moduleMm: 1, helixAngleDeg: 15, handedness: 'left' },
      'helix-hand-opposite',
    ],
    ['a ring with fewer teeth than its pinion', { kind: 'internal', teeth: 40, moduleMm: 1 }, { teeth: 48, moduleMm: 1 }, 'ring-not-larger'],
    ['a herringbone on a single helical', { teeth: 20, moduleMm: 2, helixAngleDeg: 20, herringbone: true }, { teeth: 12, moduleMm: 2, helixAngleDeg: 20, handedness: 'left' }, 'herringbone-mismatch'],
    ['two rings', { kind: 'internal', teeth: 64, moduleMm: 1 }, { kind: 'internal', teeth: 48, moduleMm: 1 }, 'two-rings'],
    ['two racks', { kind: 'rack', moduleMm: 1 }, { kind: 'rack', moduleMm: 1 }, 'two-racks'],
    ['a ring and a rack', { kind: 'internal', teeth: 64, moduleMm: 1 }, { kind: 'rack', moduleMm: 1 }, 'ring-and-rack'],
    ['a helical pinion on a rack', { kind: 'rack', moduleMm: 1 }, { teeth: 12, moduleMm: 1, helixAngleDeg: 10 }, 'helix-angle-mismatch'],
    ['tips striking roots after a large profile shift', { teeth: 12, moduleMm: 2, profileShift: 1.5 }, { teeth: 12, moduleMm: 2, profileShift: 1.5 }, 'tip-clearance'],
  ]

  it.each(cases)('%s → its code, as an error, with a one-sentence message', (_label, a, b, code) => {
    const reasons = compatibility(a, b)
    expect(codesOf(reasons)).toContain(code)
    const reason = reasons.find((r) => r.code === code)
    expect(reason?.severity).toBe('error')
    expect(typeof reason?.message).toBe('string')
    expect(reason?.message.length).toBeGreaterThan(20)
    expect(reason?.message).not.toMatch(/\n/)
  })

  it('names both modules in the mismatch message, so the UI can show it verbatim', () => {
    const [reason] = compatibility({ teeth: 20, moduleMm: 2 }, { teeth: 12, moduleMm: 1.5 })
    expect(reason.message).toMatch(/2 mm/)
    expect(reason.message).toMatch(/1\.5 mm/)
  })

  it('a ring and pinion of the same hand mesh (an internal pair keeps its hand)', () => {
    expect(
      compatibility(
        { kind: 'internal', teeth: 64, moduleMm: 1, helixAngleDeg: 15, handedness: 'left' },
        { teeth: 14, moduleMm: 1, helixAngleDeg: 15, handedness: 'left' }
      )
    ).toEqual([])
  })

  it('crossed axes want the same hand and helix angles that add up to the shaft angle', () => {
    const right45 = { teeth: 20, moduleMm: 1, helixAngleDeg: 45, handedness: /** @type {const} */ ('right') }
    expect(compatibility(right45, { ...right45, teeth: 12 }, { axes: 'crossed' })).toEqual([])
    expect(codesOf(compatibility(right45, { ...right45, teeth: 12, handedness: 'left' }, { axes: 'crossed' }))).toContain('helix-hand-opposite')
    expect(codesOf(compatibility({ teeth: 20, moduleMm: 1 }, { teeth: 12, moduleMm: 1 }, { axes: 'crossed' }))).toContain('helix-angle-mismatch')
  })

  it('reads crossed axes from frames in different pitch planes', () => {
    const reasons = compatibility(
      { teeth: 20, moduleMm: 1, helixAngleDeg: 20, handedness: 'right', frame: { centerMm: [0, 0, 0], pitchPlane: 'xy' } },
      { teeth: 12, moduleMm: 1, helixAngleDeg: 20, handedness: 'left', frame: { centerMm: [0, 0, 0], pitchPlane: 'yz' } }
    )
    expect(codesOf(reasons)).toEqual(expect.arrayContaining(['helix-hand-opposite', 'helix-angle-mismatch']))
  })

  it('face widths that do not overlap along the axis cannot mesh', () => {
    const reasons = compatibility(
      { teeth: 20, moduleMm: 1, thicknessMm: 4, frame: { centerMm: [0, 0, 0] } },
      { teeth: 12, moduleMm: 1, thicknessMm: 4, frame: { centerMm: [16, 0, 5] } }
    )
    expect(codesOf(reasons)).toEqual(['no-face-overlap'])
    expect(
      compatibility(
        { teeth: 20, moduleMm: 1, thicknessMm: 4, frame: { centerMm: [0, 0, 0] } },
        { teeth: 12, moduleMm: 1, thicknessMm: 4, frame: { centerMm: [16, 0, 3] } }
      )
    ).toEqual([])
  })

  it('herringbones must have their apexes level', () => {
    const reasons = compatibility(
      { teeth: 20, moduleMm: 1, helixAngleDeg: 20, herringbone: true, thicknessMm: 8, frame: { centerMm: [0, 0, 0] } },
      { teeth: 12, moduleMm: 1, helixAngleDeg: 20, handedness: 'left', herringbone: true, thicknessMm: 8, frame: { centerMm: [16, 0, 1] } }
    )
    expect(codesOf(reasons)).toEqual(['herringbone-apex-offset'])
  })

  it('degenerate: a one-tooth-difference ring pair is reported as tip interference (a warning, as core-043 set out)', () => {
    const ring = { kind: /** @type {const} */ ('internal'), teeth: 40, moduleMm: 1 }
    const pinion = { teeth: 39, moduleMm: 1 }
    const reasons = compatibility(ring, pinion)
    expect(reasons.map((r) => [r.code, r.severity])).toEqual([['tip-interference', 'warning']])
    expect(gearRatio(pinion, ring)).toBe(40 / 39)
    expect(centerDistanceMm(ring, pinion)).toBeCloseTo(0.5, 12)
  })

  it('reuses core-043’s ring readout: a pinion the ring allows has no warning', () => {
    const ring = { kind: /** @type {const} */ ('internal'), teeth: 64, moduleMm: 1 }
    const { maxPinionTeeth } = ringGearDimensions(ring)
    expect(compatibility(ring, { teeth: maxPinionTeeth, moduleMm: 1 })).toEqual([])
    expect(codesOf(compatibility(ring, { teeth: maxPinionTeeth + 1, moduleMm: 1 }))).toEqual(['tip-interference'])
  })
})

describe('hostile and malformed input — a named error before any arithmetic', () => {
  /** @type {[string, unknown][]} */
  const hostile = [
    ['not an object', 42],
    ['null', null],
    ['NaN teeth', { teeth: Number.NaN, moduleMm: 1 }],
    ['10⁶ teeth', { teeth: 1e6, moduleMm: 1 }],
    ['Infinity module', { teeth: 20, moduleMm: Number.POSITIVE_INFINITY }],
    ['zero thickness', { teeth: 20, moduleMm: 1, thicknessMm: 0 }],
    ['negative helix', { teeth: 20, moduleMm: 1, helixAngleDeg: -10 }],
    ['an unknown kind', { kind: 'bevel', teeth: 20, moduleMm: 1 }],
    ['a NaN frame centre', { teeth: 20, moduleMm: 1, frame: { centerMm: [0, Number.NaN, 0] } }],
    ['a frame centre of two numbers', { teeth: 20, moduleMm: 1, frame: { centerMm: [0, 0] } }],
    ['an unknown pitch plane', { teeth: 20, moduleMm: 1, frame: { centerMm: [0, 0, 0], pitchPlane: 'xx' } }],
    ['an Infinity phase', { teeth: 20, moduleMm: 1, frame: { centerMm: [0, 0, 0], phaseDeg: Number.POSITIVE_INFINITY } }],
    ['a shifted ring', { kind: 'internal', teeth: 64, moduleMm: 1, profileShift: 0.2 }],
    ['a helical rack', { kind: 'rack', moduleMm: 1, helixAngleDeg: 10 }],
  ]

  it.each(hostile)('%s is a GearParameterError from every entry point', (_label, gear) => {
    const good = { teeth: 20, moduleMm: 1 }
    for (const fn of [centerDistanceMm, meshPhaseDeg, meshPlacement, gearRatio, compatibility]) {
      const started = performance.now()
      const error = errorOf(() => fn(/** @type {any} */ (gear), good))
      expect(error).toBeInstanceOf(GearParameterError)
      expect(error).not.toBeInstanceOf(GearMeshError)
      expect(performance.now() - started).toBeLessThan(50)
    }
  })

  it('names the limit for 10⁶ teeth (GearLimitError)', () => {
    expect(errorOf(() => compatibility({ teeth: 1e6, moduleMm: 1 }, { teeth: 20, moduleMm: 1 }))).toBeInstanceOf(GearLimitError)
  })

  it('refuses a non-finite or negative extra backlash', () => {
    for (const extraBacklashMm of [Number.NaN, -0.1]) {
      expect(() => centerDistanceMm({ teeth: 20, moduleMm: 1 }, { teeth: 20, moduleMm: 1 }, { extraBacklashMm })).toThrow(GearParameterError)
    }
  })

  it('helical phase needs thickness to know where the mesh is along the axis only when the faces are offset', () => {
    const a = { teeth: 20, moduleMm: 1, helixAngleDeg: 20 }
    const b = { teeth: 12, moduleMm: 1, helixAngleDeg: 20, handedness: /** @type {const} */ ('left') }
    expect(() => meshPhaseDeg(a, b)).not.toThrow()
    expect(() => meshPhaseDeg(a, { ...b, frame: { centerMm: [16, 0, 2] } })).toThrow(GearParameterError)
  })
})

describe('mesh.js is framework- and kernel-free', () => {
  it('imports no @jscad/modeling, Vue, DOM or three.js', () => {
    expect(meshSource).not.toMatch(/from\s+['"](@jscad\/modeling|vue|three)/)
    expect(meshSource).not.toMatch(/\bdocument\.|\bwindow\./)
  })
})
