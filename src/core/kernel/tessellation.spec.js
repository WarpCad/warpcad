// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_RESOLUTION,
  LEGACY_SEGMENTS,
  MAX_SEGMENTS,
  RESOLUTION_IDS,
  RESOLUTION_PRESETS,
  chordDeviationMm,
  isResolution,
  policyFor,
  MAX_TWIST_STEPS,
  minTwistSteps,
  rimSlicesFor,
  segmentsFor,
  twistStepsFor,
} from './tessellation.js'

/**
 * Max distance from the true circle to a flat of an n-gon inscribed in it.
 *
 * @param {number} radiusMm
 * @param {number} n
 */
const deviation = (radiusMm, n) => radiusMm * (1 - Math.cos(Math.PI / n))

/** @type {Record<string, { toleranceMm: number, minSegments: number }>} */
const PRESETS = RESOLUTION_PRESETS

describe('segmentsFor — the preset table (TODO/core-035)', () => {
  // The Goal's table, with Step 2's one tuning: n is rounded **up** to a multiple of 4,
  // so every preset keeps a vertex on each axis and a cylinder's bounding box (what the
  // dimension lines, Snap and Align read) stays exactly its nominal diameter.
  const table = {
    draft: { 3: 12, 20: 24, 50: 36 },
    normal: { 3: 16, 20: 32, 50: 52 },
    fine: { 3: 24, 20: 52, 50: 80 },
    print: { 3: 32, 20: 72, 50: 112 },
  }
  for (const [preset, rows] of Object.entries(table)) {
    for (const [diameter, expected] of Object.entries(rows)) {
      it(`${preset} at Ø${diameter} → ${expected} segments`, () => {
        expect(segmentsFor(Number(diameter) / 2, policyFor(preset))).toBe(expected)
      })
    }
  }

  it('Normal gives the same count as the old fixed 32 at Ø20, as the spec notes', () => {
    expect(segmentsFor(10, policyFor('normal'))).toBe(LEGACY_SEGMENTS)
  })

  it('every count is a multiple of 4 and within [min, max]', () => {
    for (const preset of ['draft', 'normal', 'fine', 'print']) {
      const policy = policyFor(preset)
      for (const radius of [0.01, 0.5, 1.5, 3, 7.3, 10, 11, 25, 50, 150, 1e4]) {
        const n = segmentsFor(radius, policy)
        expect(n % 4).toBe(0)
        expect(n).toBeGreaterThanOrEqual(PRESETS[preset].minSegments)
        expect(n).toBeLessThanOrEqual(MAX_SEGMENTS)
      }
    }
  })
})

describe('segmentsFor — max chord deviation stays within the tolerance', () => {
  for (const preset of ['draft', 'normal', 'fine', 'print']) {
    for (const diameter of [1, 3, 20, 50, 300]) {
      it(`${preset} at Ø${diameter}`, () => {
        const policy = policyFor(preset)
        const radius = diameter / 2
        const n = segmentsFor(radius, policy)
        const off = deviation(radius, n)
        if (n === MAX_SEGMENTS) {
          // The ceiling applies: a Ø300 disc at Print would want 273 sides. The error is
          // then whatever 256 gives, which is still tiny — and the spec's point of the
          // ceiling is that it stops the worker being handed a runaway triangle count.
          expect(off).toBeCloseTo(deviation(radius, MAX_SEGMENTS), 12)
        } else {
          expect(off).toBeLessThanOrEqual(PRESETS[preset].toleranceMm + 1e-12)
        }
        expect(chordDeviationMm(radius, n)).toBeCloseTo(off, 12)
      })
    }
  }
})

describe('segmentsFor — degenerate radii never yield NaN', () => {
  const policy = policyFor('normal')
  const floor = RESOLUTION_PRESETS.normal.minSegments

  it('r → 0 takes the floor', () => {
    expect(segmentsFor(0, policy)).toBe(floor)
    expect(segmentsFor(1e-12, policy)).toBe(floor)
  })

  it('r < tol (acos argument would be ≤ 0) takes the floor', () => {
    expect(segmentsFor(0.04, policy)).toBe(floor)
  })

  it('r = tol / 2 (acos argument exactly -1) takes the floor', () => {
    expect(segmentsFor(0.025, policy)).toBe(floor)
  })

  it('r < tol / 2 (acos argument below -1, NaN territory) takes the floor', () => {
    expect(segmentsFor(0.001, policy)).toBe(floor)
  })

  it('a negative, NaN or infinite radius takes the floor rather than throwing', () => {
    expect(segmentsFor(-5, policy)).toBe(floor)
    expect(segmentsFor(Number.NaN, policy)).toBe(floor)
    expect(segmentsFor(Number.POSITIVE_INFINITY, policy)).toBe(MAX_SEGMENTS)
  })

  it('a huge radius takes the ceiling', () => {
    expect(segmentsFor(1e6, policyFor('print'))).toBe(MAX_SEGMENTS)
    expect(segmentsFor(1e6, policyFor('draft'))).toBe(MAX_SEGMENTS)
  })
})

describe('legacy — fixed 32, exactly as before', () => {
  it('is 32 at every radius, including degenerate ones', () => {
    const legacy = policyFor('legacy')
    for (const radius of [0, 0.001, 1.5, 10, 25, 150, 1e6]) {
      expect(segmentsFor(radius, legacy)).toBe(32)
    }
    expect(LEGACY_SEGMENTS).toBe(32)
  })

  it('a missing policy means legacy — every pre-core-035 caller keeps its geometry', () => {
    expect(segmentsFor(25, undefined)).toBe(32)
    expect(rimSlicesFor(5, undefined)).toBe(32)
  })

  it('rim slices under legacy stay at the old DEFAULT_RIM_SEGMENTS (32)', () => {
    expect(rimSlicesFor(5, policyFor('legacy'))).toBe(32)
  })
})

describe('rimSlicesFor — a quarter-circle profile at the same tolerance', () => {
  it('is a quarter of the full-circle count, never below 2', () => {
    for (const preset of ['draft', 'normal', 'fine', 'print']) {
      const policy = policyFor(preset)
      for (const radius of [0.5, 2, 5, 12]) {
        expect(rimSlicesFor(radius, policy)).toBe(Math.max(2, segmentsFor(radius, policy) / 4))
      }
    }
  })

  it('reads the radius unsigned — a negative fillet flares outward over the same arc', () => {
    expect(rimSlicesFor(-5, policyFor('fine'))).toBe(rimSlicesFor(5, policyFor('fine')))
  })
})

describe('policyFor / isResolution', () => {
  it('returns one frozen object per preset, so a fold cache can compare by identity', () => {
    for (const id of RESOLUTION_IDS) {
      expect(policyFor(id)).toBe(policyFor(id))
      expect(Object.isFrozen(policyFor(id))).toBe(true)
      expect(policyFor(id).id).toBe(id)
    }
  })

  it('knows legacy and the four presets, and nothing else', () => {
    expect([...RESOLUTION_IDS].sort()).toEqual(['draft', 'fine', 'legacy', 'normal', 'print'])
    expect(isResolution('fine')).toBe(true)
    expect(isResolution('ultra')).toBe(false)
    expect(isResolution(undefined)).toBe(false)
    expect(() => policyFor('ultra')).toThrow(/ultra/)
  })

  it('new documents default to Normal', () => {
    expect(DEFAULT_RESOLUTION).toBe('normal')
  })
})

describe('twistStepsFor — a twisted extrude meets the tolerance along the twist (TODO/core-042)', () => {
  /** Sag of the chord a point at `radiusMm` cuts across one step of `stepRad`. */
  const sagMm = (/** @type {number} */ radiusMm, /** @type {number} */ stepRad) => radiusMm * (1 - Math.cos(stepRad / 2))

  it('needs one step for no twist, under every policy', () => {
    for (const id of RESOLUTION_IDS) expect(twistStepsFor(0, 30, policyFor(id)), id).toBe(1)
    expect(twistStepsFor(0, 30, undefined)).toBe(1)
  })

  it.each(['draft', 'normal', 'fine', 'print'])('%s keeps every step’s chord within its tolerance', (id) => {
    const policy = policyFor(id)
    for (const radiusMm of [2, 10, 38, 250]) {
      for (const twistRad of [0.05, 0.3, 1, Math.PI]) {
        const steps = twistStepsFor(twistRad, radiusMm, policy)
        if (steps < MAX_TWIST_STEPS) {
          expect(sagMm(radiusMm, twistRad / steps), `${id} r=${radiusMm} θ=${twistRad}`).toBeLessThanOrEqual(
            /** @type {number} */ (policy.toleranceMm) + 1e-12
          )
        }
      }
    }
  })

  it('takes more steps for Print than for Draft, and reads the twist unsigned', () => {
    expect(twistStepsFor(1, 38, policyFor('print'))).toBeGreaterThan(twistStepsFor(1, 38, policyFor('draft')))
    expect(twistStepsFor(-1, 38, policyFor('normal'))).toBe(twistStepsFor(1, 38, policyFor('normal')))
  })

  it('is deterministic under legacy, and never fewer than the minimum', () => {
    expect(twistStepsFor(1, 38, undefined)).toBe(twistStepsFor(1, 38, policyFor('legacy')))
    for (const radiusMm of [1, 38, 400]) {
      expect(twistStepsFor(1, radiusMm, undefined)).toBeGreaterThanOrEqual(minTwistSteps(1, radiusMm))
    }
  })

  it('takes its minimum from the coarsest preset, so a document is never refused at one resolution and built at another', () => {
    expect(minTwistSteps(1, 38)).toBe(twistStepsFor(1, 38, policyFor('draft')))
    expect(minTwistSteps(0, 38)).toBe(1)
  })

  it('is capped, and a degenerate radius never yields NaN or 0', () => {
    expect(twistStepsFor(2 * Math.PI, 1e6, policyFor('print'))).toBe(MAX_TWIST_STEPS)
    for (const radiusMm of [0, -3, Number.NaN, 1e-9]) {
      const steps = twistStepsFor(1, radiusMm, policyFor('print'))
      expect(Number.isInteger(steps), String(radiusMm)).toBe(true)
      expect(steps, String(radiusMm)).toBeGreaterThanOrEqual(1)
    }
  })
})
