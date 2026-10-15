// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { SPEED_BANDS } from './rotateSnap.js'
import {
  SHIFT_STEP_MM,
  TRANSLATE_SPEED_BANDS,
  formatDistanceMm,
  snapMm,
  stepLabelMm,
  translateSpeedStepMm,
  translateStepMm,
} from './translateSnap.js'

/**
 * The translate ruler's step maths (`TODO/ui-065`): Shift snaps to 1 mm on any
 * pointer, drag speed picks the step otherwise — on a mouse as much as on touch
 * — and the distance is the pointer's absolute projection, quantised once.
 *
 * Plain Node, explicit tolerances (CLAUDE.md). The speed tracker itself is
 * shared with the rotate dial and pinned in `dragSteps.spec.js`.
 */

describe('snapMm', () => {
  it('snaps to 1 mm with ±0.5 boundaries rounding away from zero, symmetrically', () => {
    expect(snapMm(0.49, 1)).toBe(0)
    expect(snapMm(0.5, 1)).toBeCloseTo(1, 9)
    expect(snapMm(-0.5, 1)).toBeCloseTo(-1, 9)
    expect(snapMm(1.5, 1)).toBeCloseTo(2, 9)
    expect(snapMm(-1.5, 1)).toBeCloseTo(-2, 9)
    expect(snapMm(12.49, 1)).toBeCloseTo(12, 9)
    expect(snapMm(12.51, 1)).toBeCloseTo(13, 9)
    expect(snapMm(-12.51, 1)).toBeCloseTo(-13, 9)
  })

  it('lands 0.1 mm steps on clean decimals over a long drag, with no float drift', () => {
    for (let tenths = -20000; tenths <= 20000; tenths += 13) {
      const value = snapMm(tenths / 10 + 0.031, 0.1)
      expect(value).toBeCloseTo(tenths / 10, 9)
      expect(value).toBe(Number(value.toFixed(1)))
    }
  })

  it('a step larger than the distance snaps to zero, and zero is +0', () => {
    expect(Object.is(snapMm(3, 10), 0)).toBe(true)
    expect(Object.is(snapMm(-3, 10), 0)).toBe(true)
    expect(Object.is(snapMm(-4.9, 10), 0)).toBe(true)
    expect(Object.is(snapMm(0, 1), 0)).toBe(true)
    expect(Object.is(snapMm(-0, 0.1), 0)).toBe(true)
  })

  it('works at the 5 mm and 10 mm bands, and a step of 0 passes through', () => {
    expect(snapMm(12.4, 5)).toBeCloseTo(10, 9)
    expect(snapMm(12.6, 5)).toBeCloseTo(15, 9)
    expect(snapMm(-27, 10)).toBeCloseTo(-30, 9)
    expect(snapMm(12.345, 0)).toBeCloseTo(12.345, 12)
  })
})

describe('the translate speed bands', () => {
  it('run fine to coarse with the spec\'s 0.1 / 1 / 5 / 10 mm steps', () => {
    expect(TRANSLATE_SPEED_BANDS.map((band) => band.stepMm)).toEqual([0.1, 1, 5, 10])
    expect(TRANSLATE_SPEED_BANDS[0].minPxPerS).toBe(0)
    for (let index = 1; index < TRANSLATE_SPEED_BANDS.length; index += 1) {
      expect(TRANSLATE_SPEED_BANDS[index].minPxPerS).toBeGreaterThan(TRANSLATE_SPEED_BANDS[index - 1].minPxPerS)
    }
  })

  it('are their own table, separate from the rotate dial\'s angular one', () => {
    expect(TRANSLATE_SPEED_BANDS).not.toBe(SPEED_BANDS)
  })

  it('pick a band per speed, with hysteresis', () => {
    expect(translateSpeedStepMm(0, 0)).toBe(0.1)
    expect(translateSpeedStepMm(1e6, 0)).toBe(10)
    const edge = TRANSLATE_SPEED_BANDS[2].minPxPerS
    // Hovering just over an edge from below keeps the lower step…
    expect(translateSpeedStepMm(edge * 1.05, 1)).toBe(1)
    // …and clearing it by the margin promotes.
    expect(translateSpeedStepMm(edge * 1.2, 1)).toBe(5)
  })
})

describe('translateStepMm — which step an arm drag is in', () => {
  it('Shift is 1 mm, and wins over any speed step', () => {
    expect(SHIFT_STEP_MM).toBe(1)
    expect(translateStepMm(true, 10)).toBe(1)
    expect(translateStepMm(true, 0.1)).toBe(1)
    expect(translateStepMm(true, 0)).toBe(1)
  })

  it('without Shift it is the speed step, whatever the pointer', () => {
    expect(translateStepMm(false, 10)).toBe(10)
    expect(translateStepMm(false, 0.1)).toBe(0.1)
  })

  it('before any speed sample (step 0) it is the finest step, never continuous', () => {
    expect(translateStepMm(false, 0)).toBe(0.1)
  })
})

describe('the readout text', () => {
  it('formats the signed distance to 0.1 mm', () => {
    expect(formatDistanceMm(12.5)).toBe('+12.5 mm')
    expect(formatDistanceMm(-12.34)).toBe('-12.3 mm')
    expect(formatDistanceMm(1234.5)).toBe('+1234.5 mm')
    expect(formatDistanceMm(9.96)).toBe('+10.0 mm')
  })

  it('zero is +0.0 mm, never -0.0 mm — including a tiny negative that rounds to it', () => {
    expect(formatDistanceMm(0)).toBe('+0.0 mm')
    expect(formatDistanceMm(-0)).toBe('+0.0 mm')
    expect(formatDistanceMm(-0.04)).toBe('+0.0 mm')
  })

  it('names the active step', () => {
    expect(stepLabelMm(0.1)).toBe('fine 0.1 mm')
    expect(stepLabelMm(1)).toBe('1 mm steps')
    expect(stepLabelMm(5)).toBe('5 mm steps')
    expect(stepLabelMm(10)).toBe('10 mm steps')
    expect(stepLabelMm(0)).toBe('')
  })
})
