// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  BevelGearError,
  DEFAULT_FACE_WIDTH_MODULES,
  MAX_FACE_CONE_ANGLE_DEG,
  MIN_VERTEX_SPACING_FRACTION,
  bevelConeDimensions,
  bevelGearDimensions,
  bevelProfile,
  pitchConeAngleDeg,
} from './bevel.js'
import { GearParameterError, gearDimensions, virtualGearDimensions } from './dimensions.js'
import { involuteProfile } from './involute.js'
import bevelSource from './bevel.js?raw'

const DEG = Math.PI / 180

/**
 * @param {() => unknown} fn
 * @returns {Error & { code?: string }}
 */
function errorOf(fn) {
  try {
    fn()
  } catch (error) {
    return /** @type {Error & { code?: string }} */ (error)
  }
  throw new Error('expected an error, nothing was thrown')
}

/**
 * Teeth counted off an outline: runs of vertices outside the pitch circle.
 *
 * @param {readonly (readonly number[])[]} points
 * @param {number} pitchRadiusMm
 */
function teethIn(points, pitchRadiusMm) {
  const outside = points.map(([x, y]) => Math.hypot(x, y) > pitchRadiusMm)
  let runs = 0
  for (let i = 0; i < outside.length; i++) {
    if (outside[i] && !outside[(i - 1 + outside.length) % outside.length]) runs++
  }
  return runs
}

/**
 * Angles (radians, −π…π) where the closed outline crosses the circle of `radiusMm`.
 *
 * @param {readonly (readonly number[])[]} points
 * @param {number} radiusMm
 */
function crossingsAt(points, radiusMm) {
  /** @type {number[]} */
  const angles = []
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[(i + 1) % points.length]
    const r0 = Math.hypot(x0, y0) - radiusMm
    const r1 = Math.hypot(x1, y1) - radiusMm
    if (r0 === 0 || r0 * r1 < 0) {
      // Solve |p0 + t (p1 − p0)| = R for t in [0, 1].
      const dx = x1 - x0
      const dy = y1 - y0
      const a = dx * dx + dy * dy
      const b = 2 * (x0 * dx + y0 * dy)
      const c = x0 * x0 + y0 * y0 - radiusMm * radiusMm
      const disc = Math.sqrt(Math.max(0, b * b - 4 * a * c))
      const roots = [(-b - disc) / (2 * a), (-b + disc) / (2 * a)].filter((t) => t >= -1e-12 && t <= 1 + 1e-12)
      const t = roots[0]
      angles.push(Math.atan2(y0 + t * dy, x0 + t * dx))
    }
  }
  return angles.sort((p, q) => p - q)
}

describe('pitch cone angle: tan δ₁ = sin Σ / (z₂/z₁ + cos Σ)', () => {
  it('is 45° for equal tooth counts on 90° shafts — the miter gear drive-wheel was approximating', () => {
    expect(pitchConeAngleDeg({ teeth: 32, mateTeeth: 32 })).toBeCloseTo(45, 12)
    expect(pitchConeAngleDeg({ teeth: 32, mateTeeth: 32, shaftAngleDeg: 90 })).toBeCloseTo(45, 12)
  })

  it('is atan(z₁/z₂) on 90° shafts: 26.565° at 1:2, 63.435° at 2:1', () => {
    expect(pitchConeAngleDeg({ teeth: 15, mateTeeth: 30 })).toBeCloseTo(26.56505117707799, 10)
    expect(pitchConeAngleDeg({ teeth: 30, mateTeeth: 15 })).toBeCloseTo(63.43494882292201, 10)
  })

  it('tends to 0 as the mate grows without bound (1/∞)', () => {
    expect(pitchConeAngleDeg({ teeth: 20, mateTeeth: 2e3 })).toBeCloseTo(0.5729, 3)
    expect(pitchConeAngleDeg({ teeth: 20, mateTeeth: 2e12 })).toBeLessThan(1e-9)
    expect(pitchConeAngleDeg({ teeth: 20, mateTeeth: 2e12 })).toBeGreaterThan(0)
  })

  it('follows the general formula at Σ = 60° and 120°, and the pair’s two angles sum to Σ', () => {
    // Equal counts split Σ evenly.
    expect(pitchConeAngleDeg({ teeth: 20, mateTeeth: 20, shaftAngleDeg: 60 })).toBeCloseTo(30, 10)
    expect(pitchConeAngleDeg({ teeth: 20, mateTeeth: 20, shaftAngleDeg: 120 })).toBeCloseTo(60, 10)
    // 20:40 — tan δ = sin Σ / (2 + cos Σ).
    expect(pitchConeAngleDeg({ teeth: 20, mateTeeth: 40, shaftAngleDeg: 60 })).toBeCloseTo(Math.atan(Math.sin(60 * DEG) / 2.5) / DEG, 10)
    expect(pitchConeAngleDeg({ teeth: 20, mateTeeth: 40, shaftAngleDeg: 120 })).toBeCloseTo(30, 10)
    for (const shaftAngleDeg of [30, 60, 90, 120, 150]) {
      const a = pitchConeAngleDeg({ teeth: 17, mateTeeth: 43, shaftAngleDeg })
      const b = pitchConeAngleDeg({ teeth: 43, mateTeeth: 17, shaftAngleDeg })
      expect(a + b, String(shaftAngleDeg)).toBeCloseTo(shaftAngleDeg, 10)
    }
  })

  it('does not divide by zero at the crown-gear limit: z₂/z₁ = −cos Σ gives exactly 90°', () => {
    // Σ = 120°, z₂/z₁ = 0.5: the denominator is 0, the cone is a flat disc.
    expect(pitchConeAngleDeg({ teeth: 20, mateTeeth: 10, shaftAngleDeg: 120 })).toBeCloseTo(90, 12)
  })

  it.each([0, 180, -10, 200, Number.NaN, Number.POSITIVE_INFINITY])('refuses shaft angle %s by name', (shaftAngleDeg) => {
    const error = errorOf(() => pitchConeAngleDeg({ teeth: 20, mateTeeth: 20, shaftAngleDeg }))
    expect(error).toBeInstanceOf(BevelGearError)
    expect(error).toBeInstanceOf(GearParameterError)
    expect(error.code).toBe('shaft-angle')
  })

  it('refuses a non-number shaft angle rather than coercing it', () => {
    expect(errorOf(() => pitchConeAngleDeg({ teeth: 20, mateTeeth: 20, shaftAngleDeg: /** @type {any} */ ('90') })).code).toBe('shaft-angle')
  })
})

describe('the back-cone virtual gear has fractional teeth (z / cos δ)', () => {
  it('virtualGearDimensions accepts the real-valued count gearDimensions refuses', () => {
    expect(() => gearDimensions({ teeth: 45.2548, moduleMm: 1 })).toThrow(GearParameterError)
    const virt = virtualGearDimensions({ teeth: 45.2548, moduleMm: 1 })
    expect(virt.teeth).toBe(45.2548)
    expect(virt.pitchRadiusMm).toBeCloseTo(45.2548 / 2, 12)
  })

  it('gives the same dimensions as gearDimensions at a whole count', () => {
    expect(virtualGearDimensions({ teeth: 36, moduleMm: 1.39, backlashMm: 0.1 })).toEqual(gearDimensions({ teeth: 36, moduleMm: 1.39, backlashMm: 0.1 }))
  })

  it.each([2.9, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])('still refuses %s virtual teeth', (teeth) => {
    expect(() => virtualGearDimensions({ teeth, moduleMm: 1 })).toThrow(GearParameterError)
  })
})

describe('cone dimensions at the large end', () => {
  const cone = bevelConeDimensions({ teeth: 30, moduleMm: 2, pitchConeAngleDeg: 63.43494882292201 })

  it('puts the pitch circle at m·z/2 and the cone distance at R / sin δ', () => {
    expect(cone.pitchRadiusMm).toBeCloseTo(30, 12)
    expect(cone.pitchDiameterMm).toBeCloseTo(60, 12)
    expect(cone.coneDistanceMm).toBeCloseTo(30 / Math.sin(63.43494882292201 * DEG), 10)
    expect(cone.apexDistanceMm).toBeCloseTo(30 / Math.tan(63.43494882292201 * DEG), 10)
  })

  it('derives the virtual gear: z / cos δ teeth of the same module, pitch radius R / cos δ', () => {
    const cosDelta = Math.cos(63.43494882292201 * DEG)
    expect(cone.virtualTeeth).toBeCloseTo(30 / cosDelta, 10)
    expect(cone.virtual.moduleMm).toBe(2)
    expect(cone.virtual.pitchRadiusMm).toBeCloseTo(30 / cosDelta, 10)
  })

  it('opens the face cone by the addendum angle and closes the root cone by the dedendum angle', () => {
    const L = cone.coneDistanceMm
    expect(cone.addendumAngleDeg).toBeCloseTo(Math.atan(2 / L) / DEG, 10)
    expect(cone.dedendumAngleDeg).toBeCloseTo(Math.atan(2.5 / L) / DEG, 10)
    expect(cone.faceConeAngleDeg).toBeCloseTo(63.43494882292201 + cone.addendumAngleDeg, 10)
    expect(cone.rootConeAngleDeg).toBeCloseTo(63.43494882292201 - cone.dedendumAngleDeg, 10)
    // The large end is the plane through the pitch circle, so the tip and root there are
    // where the face and root cones cross it.
    expect(cone.outsideRadiusMm).toBeCloseTo(cone.apexDistanceMm * Math.tan(cone.faceConeAngleDeg * DEG), 9)
    expect(cone.rootRadiusMm).toBeCloseTo(cone.apexDistanceMm * Math.tan(cone.rootConeAngleDeg * DEG), 9)
  })

  it.each([0, -1, 90, 120, Number.NaN])('refuses a pitch cone angle of %s by name', (pitchConeAngleDeg) => {
    const error = errorOf(() => bevelConeDimensions({ teeth: 30, moduleMm: 2, pitchConeAngleDeg }))
    expect(error).toBeInstanceOf(BevelGearError)
    expect(['pitch-cone-angle', 'crown-gear']).toContain(error.code)
  })

  it('refuses a face cone at or past the cap as a crown gear, instead of building tips that run to infinity', () => {
    // δ = 89°: the tips' cone passes 90°, so the large-end plane never meets it.
    const error = errorOf(() => bevelConeDimensions({ teeth: 120, moduleMm: 1, pitchConeAngleDeg: 89 }))
    expect(error.code).toBe('crown-gear')
    expect(error.message).toMatch(/crown/)
    // Just under the cap it builds.
    const steep = bevelConeDimensions({ teeth: 200, moduleMm: 1, pitchConeAngleDeg: 84 })
    expect(steep.faceConeAngleDeg).toBeLessThan(MAX_FACE_CONE_ANGLE_DEG)
  })
})

describe('bevel gear dimensions from the pair', () => {
  it('reads δ from the mate and shaft angle, and the mate’s δ is Σ − δ', () => {
    const dims = bevelGearDimensions({ teeth: 15, mateTeeth: 30, moduleMm: 1 })
    expect(dims.pitchConeAngleDeg).toBeCloseTo(26.56505117707799, 10)
    expect(dims.mateConeAngleDeg).toBeCloseTo(63.43494882292201, 10)
    expect(dims.shaftAngleDeg).toBe(90)
  })

  it('accepts mateTeeth = teeth (the miter)', () => {
    expect(bevelGearDimensions({ teeth: 24, mateTeeth: 24, moduleMm: 1 }).pitchConeAngleDeg).toBeCloseTo(45, 12)
  })

  it('defaults the face width to the smaller of L/3 and 10 modules', () => {
    const small = bevelGearDimensions({ teeth: 12, mateTeeth: 12, moduleMm: 1 })
    expect(small.faceWidthMm).toBeCloseTo(small.coneDistanceMm / 3, 12)
    const big = bevelGearDimensions({ teeth: 80, mateTeeth: 80, moduleMm: 1 })
    expect(big.faceWidthMm).toBe(DEFAULT_FACE_WIDTH_MODULES)
    expect(big.warnings).toEqual([])
  })

  it('scales the small end by (L − F) / L and spans F·cos δ along the axis', () => {
    const dims = bevelGearDimensions({ teeth: 20, mateTeeth: 40, moduleMm: 2, faceWidthMm: 8 })
    const L = dims.coneDistanceMm
    expect(dims.smallEndScale).toBeCloseTo((L - 8) / L, 12)
    expect(dims.axialLengthMm).toBeCloseTo(8 * Math.cos(dims.pitchConeAngleDeg * DEG), 12)
    expect(dims.smallEndApexDistanceMm).toBeCloseTo(dims.apexDistanceMm - dims.axialLengthMm, 10)
    expect(dims.smallEndRootRadiusMm).toBeCloseTo(dims.rootRadiusMm * dims.smallEndScale, 10)
  })

  it('warns, but builds, past the L/3 face-width rule', () => {
    const dims = bevelGearDimensions({ teeth: 32, mateTeeth: 32, moduleMm: 50 / 32, faceWidthMm: 15 / Math.cos(45 * DEG) })
    expect(dims.faceWidthMm).toBeCloseTo(21.2132, 4)
    expect(dims.maxFaceWidthMm).toBeCloseTo(dims.coneDistanceMm / 3, 12)
    expect(dims.warnings).toEqual(['face-width-over-third'])
  })

  it.each([
    ['equal to the cone distance', 1],
    ['past the cone distance', 1.5],
  ])('refuses a face width %s by name', (_label, factor) => {
    const L = bevelGearDimensions({ teeth: 20, mateTeeth: 20, moduleMm: 1 }).coneDistanceMm
    const error = errorOf(() => bevelGearDimensions({ teeth: 20, mateTeeth: 20, moduleMm: 1, faceWidthMm: L * factor }))
    expect(error).toBeInstanceOf(BevelGearError)
    expect(error.code).toBe('face-width')
  })

  it.each([0, -3, Number.NaN])('refuses a face width of %s', (faceWidthMm) => {
    expect(() => bevelGearDimensions({ teeth: 20, mateTeeth: 20, moduleMm: 1, faceWidthMm })).toThrow(GearParameterError)
  })

  it('refuses 2 teeth, and 2 mate teeth', () => {
    expect(() => bevelGearDimensions({ teeth: 2, mateTeeth: 20, moduleMm: 1 })).toThrow(GearParameterError)
    expect(() => bevelGearDimensions({ teeth: 20, mateTeeth: 2, moduleMm: 1 })).toThrow(GearParameterError)
  })

  it('refuses the crown-gear limit (δ = 90°) by name', () => {
    const error = errorOf(() => bevelGearDimensions({ teeth: 20, mateTeeth: 10, shaftAngleDeg: 120, moduleMm: 1 }))
    expect(error.code).toBe('crown-gear')
  })
})

describe('the large-end section: Tredgold’s virtual-gear tooth on the bevel’s own pitch circle', () => {
  const params = { teeth: 20, moduleMm: 2, pitchConeAngleDeg: 30, backlashMm: 0.1 }
  const profile = bevelProfile(params)

  it('has the tooth count asked for, not the virtual gear’s', () => {
    expect(teethIn(profile.outline, profile.pitchRadiusMm)).toBe(20)
    expect(profile.outline.length).toBe(20 * profile.verticesPerTooth)
  })

  it('keeps the involute layout: vertex 0 on the root mid-gap at −180°/z, tooth 0 centred on +X', () => {
    const [x0, y0] = profile.outline[0]
    expect(Math.atan2(y0, x0)).toBeCloseTo(-Math.PI / 20, 12)
    expect(Math.hypot(x0, y0)).toBeCloseTo(profile.rootRadiusMm, 9)
    const [xt, yt] = profile.outline[profile.verticesPerTooth / 2]
    expect(yt).toBeCloseTo(0, 12)
    expect(xt).toBeCloseTo(profile.tipRadiusMm, 9)
    expect(profile.tipRadiusMm).toBeCloseTo(profile.outsideRadiusMm, 9)
  })

  it('is CCW and its teeth repeat every 360°/z, vertex for vertex', () => {
    let twice = 0
    for (let i = 0; i < profile.outline.length; i++) {
      const [ax, ay] = profile.outline[i]
      const [bx, by] = profile.outline[(i + 1) % profile.outline.length]
      twice += ax * by - bx * ay
    }
    expect(twice).toBeGreaterThan(0)
    const n = profile.verticesPerTooth
    const c = Math.cos((2 * Math.PI) / 20)
    const s = Math.sin((2 * Math.PI) / 20)
    for (let i = 0; i < n; i++) {
      const [x, y] = profile.outline[i]
      const [x1, y1] = profile.outline[n + i]
      expect(x1).toBeCloseTo(c * x - s * y, 9)
      expect(y1).toBeCloseTo(s * x + c * y, 9)
    }
  })

  it('keeps the virtual tooth’s pitch-circle thickness: πm/2 − backlash/2 along the bevel’s pitch circle', () => {
    const fine = bevelProfile({ ...params, pointsPerFlank: 64, tipSegments: 16, rootSegments: 16 })
    const crossings = crossingsAt(fine.outline, fine.pitchRadiusMm)
    const below = Math.max(...crossings.filter((a) => a < 0))
    const above = Math.min(...crossings.filter((a) => a > 0))
    expect(fine.pitchRadiusMm * (above - below)).toBeCloseTo(Math.PI - 0.05, 3)
  })

  it('reduces to the spur outline, vertex for vertex, as δ → 0', () => {
    const flat = bevelProfile({ teeth: 17, moduleMm: 1.5, pitchConeAngleDeg: 1e-6 })
    const spur = involuteProfile({ teeth: 17, moduleMm: 1.5 })
    expect(flat.outline.length).toBe(spur.outline.length)
    for (let i = 0; i < spur.outline.length; i++) {
      expect(Math.hypot(flat.outline[i][0] - spur.outline[i][0], flat.outline[i][1] - spur.outline[i][1])).toBeLessThan(1e-6)
    }
  })

  it('is less undercut than the spur gear of the same count — the virtual gear has more teeth', () => {
    expect(involuteProfile({ teeth: 12, moduleMm: 1 }).warnings).toContain('undercut')
    // 12 / cos 60° = 24 virtual teeth: no undercut at 20°.
    expect(bevelProfile({ teeth: 12, moduleMm: 1, pitchConeAngleDeg: 60 }).warnings).not.toContain('undercut')
  })

  it('keeps no two vertices closer than the export weld can tell apart, even on a near-rack virtual gear', () => {
    // δ ≈ 84°, 200T: ~1915 virtual teeth, whose trochoid fillet samples at under a micron.
    const steep = bevelProfile({ teeth: 200, moduleMm: 1, pitchConeAngleDeg: 84.00590705089154 })
    const minimumMm = MIN_VERTEX_SPACING_FRACTION * steep.outsideRadiusMm
    for (let i = 0; i < steep.verticesPerTooth; i++) {
      const [ax, ay] = steep.outline[i]
      const [bx, by] = steep.outline[i + 1]
      expect(Math.hypot(ax - bx, ay - by), String(i)).toBeGreaterThanOrEqual(minimumMm)
    }
    // Thinned symmetrically: still mid-gap at vertex 0, tip centre at the middle index.
    expect(Math.atan2(steep.outline[0][1], steep.outline[0][0])).toBeCloseTo(-Math.PI / 200, 12)
    expect(steep.outline[steep.verticesPerTooth / 2][1]).toBeCloseTo(0, 12)
    expect(steep.outline.length).toBe(200 * steep.verticesPerTooth)
  })

  it('samples finer when asked, like the spur profile', () => {
    expect(bevelProfile({ ...params, pointsPerFlank: 16 }).outline.length).toBeGreaterThan(profile.outline.length)
  })
})

describe('bevel.js is framework-free', () => {
  it('imports neither @jscad/modeling, Vue nor three.js', () => {
    expect(bevelSource).not.toMatch(/from\s+['"](@jscad\/modeling|vue|three)/)
  })
})
