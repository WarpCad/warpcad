// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/v1-gears.json'
import {
  GearParameterError,
  GearToothVanishedError,
  circularPitchMmToModuleMm,
  gearDimensions,
  v1BacklashToBacklashMm,
} from './dimensions.js'
import { involuteProfile, toothHalfAngleRadAt } from './involute.js'

const DEG = Math.PI / 180

// --- measurement helpers (the same measures scripts/generate-v1-gear-fixture.cjs takes) ---

/** @param {[number, number][]} pts */
function signedAreaMm2(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    a += x0 * y1 - x1 * y0
  }
  return a / 2
}

/** @param {[number, number][]} pts @param {number} px @param {number} py */
function inside(pts, px, py) {
  let w = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    const cross = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)
    if (y0 <= py) {
      if (y1 > py && cross > 0) w++
    } else if (y1 <= py && cross < 0) w--
  }
  return w !== 0
}

/**
 * Mean tooth thickness (arc, mm) along the circle of radius `rMm`, and the tooth count.
 *
 * @param {[number, number][]} pts
 * @param {number} rMm
 */
function thicknessAt(pts, rMm) {
  const angles = []
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[(i + 1) % pts.length]
    const dx = x1 - x0
    const dy = y1 - y0
    const a = dx * dx + dy * dy
    const b = 2 * (x0 * dx + y0 * dy)
    const c = x0 * x0 + y0 * y0 - rMm * rMm
    const disc = b * b - 4 * a * c
    if (disc < 0 || a === 0) continue
    for (const sign of [-1, 1]) {
      const t = (-b + sign * Math.sqrt(disc)) / (2 * a)
      if (t >= 0 && t < 1) angles.push(Math.atan2(y0 + t * dy, x0 + t * dx))
    }
  }
  angles.sort((p, q) => p - q)
  const arcs = []
  for (let i = 0; i < angles.length; i++) {
    const a0 = angles[i]
    const a1 = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI
    if (a1 - a0 < 1e-12) continue
    const mid = (a0 + a1) / 2
    if (inside(pts, rMm * Math.cos(mid), rMm * Math.sin(mid))) arcs.push(rMm * (a1 - a0))
  }
  return { teeth: arcs.length, arcMm: arcs.reduce((s, x) => s + x, 0) / arcs.length }
}

/**
 * True when two non-adjacent edges of the closed outline cross or touch.
 *
 * @param {[number, number][]} pts
 */
function selfIntersects(pts) {
  const n = pts.length
  /** @param {[number, number]} a @param {[number, number]} b @param {[number, number]} c */
  const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  for (let i = 0; i < n; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % n]
    const minX = Math.min(a[0], b[0])
    const maxX = Math.max(a[0], b[0])
    const minY = Math.min(a[1], b[1])
    const maxY = Math.max(a[1], b[1])
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const c = pts[j]
      const d = pts[(j + 1) % n]
      if (Math.max(c[0], d[0]) < minX || Math.min(c[0], d[0]) > maxX) continue
      if (Math.max(c[1], d[1]) < minY || Math.min(c[1], d[1]) > maxY) continue
      const o1 = orient(a, b, c)
      const o2 = orient(a, b, d)
      const o3 = orient(c, d, a)
      const o4 = orient(c, d, b)
      if (o1 * o2 <= 0 && o3 * o4 <= 0) return true
    }
  }
  return false
}

/**
 * Structural checks every valid outline must pass.
 *
 * @param {import('./involute.js').InvoluteProfile} profile
 * @param {{ tolMm?: number }} [options]
 */
function expectValidOutline(profile, { tolMm = 1e-9 } = {}) {
  const { outline, rootRadiusMm, tipRadiusMm } = profile
  for (const [x, y] of outline) {
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
    const r = Math.hypot(x, y)
    expect(r).toBeGreaterThanOrEqual(rootRadiusMm - tolMm)
    expect(r).toBeLessThanOrEqual(tipRadiusMm + tolMm)
  }
  expect(signedAreaMm2(outline)).toBeGreaterThan(0) // CCW
  expect(selfIntersects(outline)).toBe(false)
}

/**
 * V1's cutter flank rises `sin α` per unit of depth where the textbook rack rises `tan α`,
 * so the involute V1 generates is the one for `atan(sin α)` — measured: converged V1
 * matches that involute to < 0.001 mm at every sampled radius, and misses the nominal-α
 * one by up to 0.05 mm (20°) and 0.19 mm (35°). Not in docs/decisions/gears.md's defect
 * list; a V1 importer that wants printed geometry unchanged needs this conversion, the same
 * way it needs `v1BacklashToBacklashMm`. Kept test-local until that call is made.
 *
 * @param {number} v1PressureAngleDeg
 */
const v1EffectivePressureAngleDeg = (v1PressureAngleDeg) =>
  Math.atan(Math.sin(v1PressureAngleDeg * DEG)) / DEG

/**
 * @param {string} id
 * @returns {(typeof fixture.cases)[number]}
 */
function fixtureCase(id) {
  const found = fixture.cases.find((c) => c.id === id)
  if (!found) throw new Error(`no fixture case ${id}`)
  return found
}

/**
 * @typedef {{ toothCount: number, circularPitch: number, pressureAngle: number,
 *   clearance?: number, backlash?: number, profileShift?: number }} V1GearParams
 */

/**
 * The WarpCad parameters that reproduce a V1 `Gear` (the importer's mapping).
 *
 * @param {V1GearParams} v1
 * @param {{ literalPressureAngle?: boolean }} [options]
 */
function fromV1(v1, { literalPressureAngle = false } = {}) {
  return {
    teeth: v1.toothCount,
    moduleMm: circularPitchMmToModuleMm(v1.circularPitch),
    pressureAngleDeg: literalPressureAngle ? v1.pressureAngle : v1EffectivePressureAngleDeg(v1.pressureAngle),
    profileShift: v1.profileShift ?? 0,
    clearanceMm: v1.clearance ?? 0, // call 5: 0 when V1 omitted it
    backlashMm: v1BacklashToBacklashMm(v1.backlash ?? 0, v1.pressureAngle),
  }
}

const PARITY_RESOLUTION = { pointsPerFlank: 48, tipSegments: 8, rootSegments: 8 }

// Tolerances from docs/decisions/gears.md "Tolerances core-040 should use".
/** @type {Record<string, { areaRel: number, radiusMm: number, pitchFlankMm: number }>} */
const TOLERANCE = {
  converged: { areaRel: 0.001, radiusMm: 0.005, pitchFlankMm: 0.002 },
  default: { areaRel: 0.01, radiusMm: 0.03, pitchFlankMm: 0.01 },
}

/**
 * `bf-gear`'s 8T pinion is the one reference gear the decision doc did not measure, and
 * its printed (default) shape falls outside the default-density band: V1 swept a 45°
 * tooth in 15° steps, which leaves material in the undercut — measured +1.46 % area, a
 * root 0.124 mm high and a pitch flank 0.011 mm thick against this generator, while the
 * converged shape matches within the converged band. So for it the default check is
 * one-sided (V1 printed *more* material, never less) within these measured bounds.
 */
/** @type {Record<string, { areaRel: number, radiusMm: number, pitchFlankMm: number }>} */
const DEFAULT_EXTRA_MATERIAL = { 'bf-gear-8T': { areaRel: 0.016, radiusMm: 0.13, pitchFlankMm: 0.013 } }

describe('involuteProfile — parity with the measured V1 reference gears', () => {
  it('fixture covers the six gears core-040 names', () => {
    expect(fixture.cases.map((c) => c.id)).toEqual([
      'window-motor-36T',
      'window-motor-12T',
      'window-motor-centre-12T-pa35',
      'drive-wheel-32T',
      'bf-gear-30T',
      'bf-gear-8T',
    ])
  })

  describe.each(fixture.cases.map((c) => [c.id, c]))('%s', (_id, gear) => {
    const profile = involuteProfile({ ...fromV1(gear.v1Params), ...PARITY_RESOLUTION })
    const areaMm2 = signedAreaMm2(profile.outline)

    it('is a valid outline with one tooth per V1 tooth', () => {
      expectValidOutline(profile)
      expect(thicknessAt(profile.outline, gear.pitchRadiusMm).teeth).toBe(gear.v1Params.toothCount)
    })

    it.each(['converged', 'default'])('matches V1 %s within the decision-doc tolerance', (density) => {
      const v1 = density === 'default' ? gear.default : gear.converged
      const extra = density === 'default' ? DEFAULT_EXTRA_MATERIAL[gear.id] : undefined
      if (extra) {
        const pitch = v1.thicknessAt[0]
        const flankMm = thicknessAt(profile.outline, pitch.radiusMm).arcMm
        expect(v1.areaMm2).toBeGreaterThan(areaMm2)
        expect((v1.areaMm2 - areaMm2) / v1.areaMm2).toBeLessThan(extra.areaRel)
        expect(v1.rootRadiusMm).toBeGreaterThan(profile.rootRadiusMm)
        expect(v1.rootRadiusMm - profile.rootRadiusMm).toBeLessThan(extra.radiusMm)
        expect(Math.abs(profile.tipRadiusMm - v1.outerRadiusMm)).toBeLessThan(TOLERANCE.default.radiusMm)
        expect(pitch.arcMm).toBeGreaterThan(flankMm)
        expect(pitch.arcMm - flankMm).toBeLessThan(extra.pitchFlankMm)
        return
      }
      const tol = TOLERANCE[density]
      expect(Math.abs(areaMm2 - v1.areaMm2) / v1.areaMm2).toBeLessThan(tol.areaRel)
      expect(Math.abs(profile.tipRadiusMm - v1.outerRadiusMm)).toBeLessThan(tol.radiusMm)
      expect(Math.abs(profile.rootRadiusMm - v1.rootRadiusMm)).toBeLessThan(tol.radiusMm)
      const pitch = v1.thicknessAt[0]
      expect(pitch.radiusMm).toBeCloseTo(gear.pitchRadiusMm, 9)
      expect(Math.abs(thicknessAt(profile.outline, pitch.radiusMm).arcMm - pitch.arcMm)).toBeLessThan(
        tol.pitchFlankMm
      )
    })

    it('matches converged V1 tooth thickness at every sampled radius within 0.01 mm', () => {
      for (const sample of gear.converged.thicknessAt) {
        const ours = thicknessAt(profile.outline, sample.radiusMm)
        expect(ours.teeth).toBe(sample.teeth)
        expect(Math.abs(ours.arcMm - sample.arcMm)).toBeLessThan(0.01)
      }
    })

    it('reports undercut exactly when the pinion needs it', () => {
      const expectUndercut = gearDimensions(fromV1(gear.v1Params)).undercut
      expect(profile.warnings.includes('undercut')).toBe(expectUndercut)
    })
  })

  it('undercuts the 12T and 8T pinions and the 30T at 14.5°, not the 36T or 32T wheels', () => {
    const byId = Object.fromEntries(
      fixture.cases.map((c) => [c.id, involuteProfile({ ...fromV1(c.v1Params) }).warnings])
    )
    expect(byId['window-motor-12T']).toContain('undercut')
    expect(byId['bf-gear-8T']).toContain('undercut')
    expect(byId['bf-gear-30T']).toContain('undercut')
    expect(byId['window-motor-36T']).not.toContain('undercut')
    expect(byId['drive-wheel-32T']).not.toContain('undercut')
  })

  it('needs the V1 pressure-angle conversion: at the nominal α the flanks miss V1 by > 0.02 mm', () => {
    const gear = fixtureCase('window-motor-36T')
    const literal = involuteProfile({ ...fromV1(gear.v1Params, { literalPressureAngle: true }), ...PARITY_RESOLUTION })
    const nearTip = gear.converged.thicknessAt[gear.converged.thicknessAt.length - 1]
    expect(Math.abs(thicknessAt(literal.outline, nearTip.radiusMm).arcMm - nearTip.arcMm)).toBeGreaterThan(0.02)
  })

  it('the 35° centre gear at its true 35° is pointed, clipped where the flanks meet', () => {
    const gear = fixtureCase('window-motor-centre-12T-pa35')
    const profile = involuteProfile({ ...fromV1(gear.v1Params, { literalPressureAngle: true }), ...PARITY_RESOLUTION })
    expect(profile.warnings).toContain('pointed-tip')
    // docs/decisions/gears.md: "the analytic flanks meet at r ≈ 5.451 mm, 0.008 mm short".
    expect(profile.tipRadiusMm).toBeCloseTo(5.451, 3)
    expect(profile.tipRadiusMm).toBeLessThan(gearDimensions(fromV1(gear.v1Params)).outsideRadiusMm)
    expectValidOutline(profile)
  })
})

describe('involuteProfile — numerics', () => {
  const params = { teeth: 20, moduleMm: 2, pressureAngleDeg: 20, clearanceMm: 0.5, backlashMm: 0.1, pointsPerFlank: 16 }
  const profile = involuteProfile(params)
  const R = 20
  const m = 2

  it('returns the closed-form radii', () => {
    expect(profile.pitchRadiusMm).toBeCloseTo(R, 12)
    expect(profile.baseRadiusMm).toBeCloseTo(R * Math.cos(20 * DEG), 12)
    expect(profile.tipRadiusMm).toBeCloseTo(R + m, 12)
    expect(profile.rootRadiusMm).toBeCloseTo(R - m - 0.5, 12)
    expect(profile.toothAngleDeg).toBeCloseTo(18, 12)
    const radii = profile.outline.map(([x, y]) => Math.hypot(x, y))
    expect(Math.max(...radii)).toBeCloseTo(R + m, 9)
    expect(Math.min(...radii)).toBeCloseTo(R - m - 0.5, 9)
  })

  it('makes the pitch-circle tooth thickness circularPitch/2 − backlash/2 (call 4)', () => {
    const expected = (Math.PI * m) / 2 - 0.1 / 2
    // Exactly, from the half-angle the outline is sampled from…
    expect(2 * R * toothHalfAngleRadAt(profile, R)).toBeCloseTo(expected, 12)
    // …and measured off a finely sampled polygon (chord sag thins a coarse one).
    const fine = involuteProfile({ ...params, pointsPerFlank: 64 })
    expect(thicknessAt(fine.outline, R).arcMm).toBeCloseTo(expected, 3)
  })

  it('keeps every vertex between root and tip, CCW, with no self-intersection', () => {
    expectValidOutline(profile)
  })

  it('has teeth · (4·pointsPerFlank + 2·rootSegments + 2·tipSegments) vertices', () => {
    const p = involuteProfile({ ...params, pointsPerFlank: 10, tipSegments: 3, rootSegments: 5 })
    expect(p.outline.length).toBe(20 * (4 * 10 + 2 * 5 + 2 * 3))
    expect(p.verticesPerTooth).toBe(4 * 10 + 2 * 5 + 2 * 3)
  })

  it('starts on the root circle at the gap centre before tooth 0, with tooth 0 centred on +X', () => {
    const [x0, y0] = profile.outline[0]
    expect(Math.hypot(x0, y0)).toBeCloseTo(profile.rootRadiusMm, 12)
    expect(Math.atan2(y0, x0)).toBeCloseTo(-Math.PI / 20, 12)
    const centre = profile.outline[profile.verticesPerTooth / 2]
    expect(centre[0]).toBeCloseTo(R + m, 12)
    expect(centre[1]).toBeCloseTo(0, 12)
  })

  it('tooth 0 is mirror-symmetric about +X', () => {
    const n = profile.verticesPerTooth
    for (let i = 1; i < n / 2; i++) {
      const a = profile.outline[n / 2 - i]
      const b = profile.outline[n / 2 + i]
      expect(a[0]).toBeCloseTo(b[0], 12)
      expect(a[1]).toBeCloseTo(-b[1], 12)
    }
  })

  it('maps onto itself under a rotation of 360/teeth', () => {
    const { outline, verticesPerTooth: n } = profile
    const c = Math.cos((2 * Math.PI) / 20)
    const s = Math.sin((2 * Math.PI) / 20)
    for (let i = 0; i < outline.length; i++) {
      const [x, y] = outline[i]
      const [tx, ty] = outline[(i + n) % outline.length]
      expect(c * x - s * y).toBeCloseTo(tx, 10)
      expect(s * x + c * y).toBeCloseTo(ty, 10)
    }
  })

  it('joins the fillet to the involute without a step (no undercut)', () => {
    const p = involuteProfile({ teeth: 40, moduleMm: 1, clearanceMm: 0.25 })
    expect(p.warnings).not.toContain('undercut')
    const r = p.involuteStartRadiusMm
    const below = toothHalfAngleRadAt(p, r - 1e-7)
    const above = toothHalfAngleRadAt(p, r + 1e-7)
    expect(below - above).toBeCloseTo(0, 6)
  })

  it('converges in area as pointsPerFlank grows', () => {
    const coarse = signedAreaMm2(involuteProfile({ ...params, pointsPerFlank: 8 }).outline)
    const fine = signedAreaMm2(involuteProfile({ ...params, pointsPerFlank: 64 }).outline)
    const finer = signedAreaMm2(involuteProfile({ ...params, pointsPerFlank: 128 }).outline)
    expect(Math.abs(finer - fine)).toBeLessThan(Math.abs(fine - coarse))
    expect(Math.abs(finer - fine) / finer).toBeLessThan(1e-4)
  })

  it('scales exactly with module when clearance and backlash scale with it', () => {
    const unit = involuteProfile({ teeth: 15, moduleMm: 1, clearanceMm: 0.25, backlashMm: 0.05 })
    for (const k of [1e-3, 1e3]) {
      const scaled = involuteProfile({ teeth: 15, moduleMm: k, clearanceMm: 0.25 * k, backlashMm: 0.05 * k })
      expect(scaled.outline.length).toBe(unit.outline.length)
      for (let i = 0; i < unit.outline.length; i += 7) {
        expect(scaled.outline[i][0] / k).toBeCloseTo(unit.outline[i][0], 9)
        expect(scaled.outline[i][1] / k).toBeCloseTo(unit.outline[i][1], 9)
      }
      expectValidOutline(scaled, { tolMm: 1e-9 * k })
    }
  })
})

describe('involuteProfile — degenerate cases', () => {
  it.each([3, 4, 6, 200])('%i teeth gives a valid outline', (teeth) => {
    const p = involuteProfile({ teeth, moduleMm: 1 })
    expectValidOutline(p)
    expect(thicknessAt(p.outline, p.pitchRadiusMm).teeth).toBe(teeth)
    if (teeth < 17) expect(p.warnings).toContain('undercut')
    if (teeth === 200) expect(p.warnings).toEqual([])
  })

  it('pressure angle 0° gives a valid, undercut outline', () => {
    const p = involuteProfile({ teeth: 20, moduleMm: 1, pressureAngleDeg: 0 })
    expectValidOutline(p)
    expect(p.baseRadiusMm).toBeCloseTo(p.pitchRadiusMm, 12)
    expect(p.warnings).toContain('undercut')
  })

  it('pressure angle 45° gives a valid outline, the over-wide rack clipped to a pointed root', () => {
    const p = involuteProfile({ teeth: 20, moduleMm: 1, pressureAngleDeg: 45 })
    expectValidOutline(p)
    expect(p.warnings).toContain('pointed-root')
    // The rack's flanks meet above its nominal tip line, so the root is shallower.
    expect(p.rootRadiusMm).toBeGreaterThan(gearDimensions({ teeth: 20, moduleMm: 1, pressureAngleDeg: 45 }).pitchRadiusMm - 1.25)
    expect(p.outline.length).toBe(20 * p.verticesPerTooth)
  })

  it('negative profile shift deepens the undercut but stays valid', () => {
    const p = involuteProfile({ teeth: 12, moduleMm: 1, profileShift: -0.5 })
    expectValidOutline(p)
    expect(p.warnings).toContain('undercut')
    expect(p.tipRadiusMm).toBeCloseTo(6 + 0.5, 12)
  })

  it('large positive profile shift points the tip and says so', () => {
    const p = involuteProfile({ teeth: 12, moduleMm: 1, profileShift: 1.5 })
    expectValidOutline(p)
    expect(p.warnings).toContain('pointed-tip')
    expect(p.warnings).not.toContain('undercut')
    expect(p.tipRadiusMm).toBeLessThan(6 + 2.5)
    // A pointed tooth has no tip land: its apex is the single tooth-centre vertex.
    expect(p.verticesPerTooth).toBe(4 * p.pointsPerFlank + 2 * p.rootSegments)
    const apex = p.outline[p.verticesPerTooth / 2]
    expect(apex[1]).toBeCloseTo(0, 12)
    expect(apex[0]).toBeCloseTo(p.tipRadiusMm, 12)
  })

  it('a backlash so large the tooth vanishes throws a named error, not NaN', () => {
    expect(() => involuteProfile({ teeth: 20, moduleMm: 1, backlashMm: 4 })).toThrow(GearToothVanishedError)
  })

  it.each([
    ['non-integer teeth', { teeth: 12.5 }],
    ['zero teeth', { teeth: 0 }],
    ['negative teeth', { teeth: -20 }],
    ['pointsPerFlank 0', { pointsPerFlank: 0 }],
    ['fractional pointsPerFlank', { pointsPerFlank: 2.5 }],
    ['tipSegments 0', { tipSegments: 0 }],
    ['rootSegments -1', { rootSegments: -1 }],
  ])('rejects %s', (_label, patch) => {
    expect(() => involuteProfile({ teeth: 20, moduleMm: 1, ...patch })).toThrow(GearParameterError)
  })
})

describe('involuteProfile — speed', () => {
  it('builds a 64-tooth gear in under 20 ms (V1 converged: hundreds of ms)', () => {
    const params = { teeth: 64, moduleMm: 1.5, clearanceMm: 0.375, backlashMm: 0.1, pointsPerFlank: 16 }
    involuteProfile(params) // warm the JIT
    const runs = []
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      involuteProfile(params)
      runs.push(performance.now() - t0)
    }
    runs.sort((a, b) => a - b)
    expect(runs[5]).toBeLessThan(20)
  })
})
