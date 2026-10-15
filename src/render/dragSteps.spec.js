// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  BAND_HYSTERESIS,
  SPEED_HOLD_MS,
  SPEED_SMOOTHING_MS,
  SPEED_STALL_MS,
  createRateTracker,
  createScalarSpeedTracker,
  snapToStep,
  stepForSpeedIn,
} from './dragSteps.js'
import * as rotateSnap from './rotateSnap.js'

/**
 * The speed-sensitive step shared by the rotate dial (`TODO/ui-064`) and the
 * translate ruler (`TODO/ui-065`).
 *
 * `ui-065` moved the tracker, the band picker and the hysteresis out of
 * `rotateSnap.js` so the ring and the arm share one implementation. These cases
 * are the ones `rotateSnap.spec.js` already pins, restated for a scalar input,
 * plus a golden run proving the rotate exports return what they returned before
 * the move. Plain Node, injected clock, explicit tolerances (CLAUDE.md).
 */

/**
 * A clock the spec drives by hand.
 *
 * @returns {{ now: () => number, advance: (ms: number) => void }}
 */
function manualClock() {
  let t = 1000
  return {
    now: () => t,
    advance(ms) {
      t += ms
    },
  }
}

/** A band table in no particular unit, so nothing here leans on the rotate or translate tables. */
const BANDS = Object.freeze([
  Object.freeze({ minPxPerS: 0, step: 0.1 }),
  Object.freeze({ minPxPerS: 50, step: 1 }),
  Object.freeze({ minPxPerS: 300, step: 5 }),
  Object.freeze({ minPxPerS: 1000, step: 10 }),
])

/**
 * Feed a scalar tracker a value changing at a steady rate.
 *
 * @param {ReturnType<typeof createScalarSpeedTracker>} tracker
 * @param {ReturnType<typeof manualClock>} clock
 * @param {{ pxPerS: number, events: number, intervalMs?: number, from?: number }} options
 * @returns {number} The value after the last event.
 */
function steadyScalar(tracker, clock, { pxPerS, events, intervalMs = 16, from = 0 }) {
  let value = from
  tracker.begin(value)
  for (let index = 0; index < events; index += 1) {
    clock.advance(intervalMs)
    value += (pxPerS * intervalMs) / 1000
    tracker.sample(value)
  }
  return value
}

describe('the shared constants', () => {
  it('keeps ui-064\'s tuning: 15% hysteresis, ~100 ms smoothing, 30 ms hold, 80 ms stall', () => {
    expect(BAND_HYSTERESIS).toBeCloseTo(0.15, 9)
    expect(SPEED_SMOOTHING_MS).toBe(100)
    expect(SPEED_HOLD_MS).toBe(30)
    expect(SPEED_STALL_MS).toBe(80)
    expect(SPEED_HOLD_MS).toBeLessThan(SPEED_STALL_MS)
  })

  it('rotateSnap.js re-exports the moved constants, so ui-064\'s callers do not change', () => {
    expect(rotateSnap.BAND_HYSTERESIS).toBe(BAND_HYSTERESIS)
    expect(rotateSnap.SPEED_SMOOTHING_MS).toBe(SPEED_SMOOTHING_MS)
    expect(rotateSnap.SPEED_STALL_MS).toBe(SPEED_STALL_MS)
    expect(rotateSnap.SPEED_HOLD_MS).toBe(SPEED_HOLD_MS)
  })
})

describe('snapToStep', () => {
  it('rounds to the nearest step, halves away from zero, never -0', () => {
    expect(snapToStep(7.4, 5)).toBeCloseTo(5, 9)
    expect(snapToStep(7.6, 5)).toBeCloseTo(10, 9)
    expect(snapToStep(2.5, 5)).toBeCloseTo(5, 9)
    expect(snapToStep(-2.5, 5)).toBeCloseTo(-5, 9)
    expect(Object.is(snapToStep(-0.4, 5), 0)).toBe(true)
    expect(Object.is(snapToStep(-0, 0), 0)).toBe(true)
    expect(snapToStep(12.345, 0)).toBeCloseTo(12.345, 12)
  })

  it('is exactly what rotateSnap.snapDeg returns, across a sweep of values and steps', () => {
    for (const step of [0, 0.1, 1, 5, 15]) {
      for (let value = -400; value <= 400; value += 3.37) {
        expect(rotateSnap.snapDeg(value, step)).toBe(snapToStep(value, step))
      }
    }
  })
})

describe('stepForSpeedIn', () => {
  it('picks each band from a cold start (no previous step)', () => {
    for (let index = 0; index < BANDS.length; index += 1) {
      const low = BANDS[index].minPxPerS
      const high = BANDS[index + 1]?.minPxPerS ?? low * 4 + 100
      expect(stepForSpeedIn(BANDS, (low + high) / 2, 0)).toBe(BANDS[index].step)
    }
    expect(stepForSpeedIn(BANDS, 0, 0)).toBe(0.1)
    expect(stepForSpeedIn(BANDS, 1e6, 0)).toBe(10)
  })

  it('stays put while the speed oscillates ±10% around a band edge (hysteresis)', () => {
    for (let index = 1; index < BANDS.length; index += 1) {
      const edge = BANDS[index].minPxPerS
      const below = BANDS[index - 1].step
      const above = BANDS[index].step
      /** @type {number} */
      let step = below
      for (const factor of [0.9, 1.1, 0.95, 1.08, 0.9, 1.1]) {
        step = stepForSpeedIn(BANDS, edge * factor, step)
        expect(step).toBe(below)
      }
      step = above
      for (const factor of [1.1, 0.9, 1.05, 0.92, 1.1, 0.9]) {
        step = stepForSpeedIn(BANDS, edge * factor, step)
        expect(step).toBe(above)
      }
    }
  })

  it('leaves a band once the edge is cleared by the hysteresis margin', () => {
    const edge = BANDS[2].minPxPerS
    expect(stepForSpeedIn(BANDS, edge * 1.2, BANDS[1].step)).toBe(BANDS[2].step)
    expect(stepForSpeedIn(BANDS, edge * 0.8, BANDS[2].step)).toBe(BANDS[1].step)
  })

  it('can jump several bands at once, both ways', () => {
    expect(stepForSpeedIn(BANDS, 1e6, 0.1)).toBe(10)
    expect(stepForSpeedIn(BANDS, 0, 10)).toBe(0.1)
  })

  it('treats a non-finite or negative speed as stopped, and an unknown previous step as a cold start', () => {
    expect(stepForSpeedIn(BANDS, Number.NaN, 5)).toBe(0.1)
    expect(stepForSpeedIn(BANDS, -50, 5)).toBe(0.1)
    expect(stepForSpeedIn(BANDS, 400, 7)).toBe(5)
  })

  it('is exactly what rotateSnap.stepForSpeed returns for the angular table', () => {
    const angular = rotateSnap.SPEED_BANDS.map((band) => ({ minPxPerS: band.minPxPerS, step: band.stepDeg }))
    for (const previous of [0, 0.1, 1, 5, 15]) {
      for (let speed = 0; speed < 1500; speed += 7) {
        expect(rotateSnap.stepForSpeed(speed, previous)).toBe(stepForSpeedIn(angular, speed, previous))
      }
    }
  })
})

describe('createScalarSpeedTracker — speed of a caller-supplied scalar', () => {
  it('reads zero before anything has moved', () => {
    const clock = manualClock()
    const tracker = createScalarSpeedTracker(clock.now)
    tracker.begin(42)
    expect(tracker.speed()).toBe(0)
  })

  it('converges on a steady rate, whichever way the value runs', () => {
    for (const pxPerS of [600, -600]) {
      const clock = manualClock()
      const tracker = createScalarSpeedTracker(clock.now)
      steadyScalar(tracker, clock, { pxPerS, events: 40 })
      expect(tracker.speed()).toBeGreaterThan(540)
      expect(tracker.speed()).toBeLessThan(660)
    }
  })

  it('a value that does not change has no speed, however long the drag goes on', () => {
    const clock = manualClock()
    const tracker = createScalarSpeedTracker(clock.now)
    steadyScalar(tracker, clock, { pxPerS: 0, events: 30, from: 17 })
    expect(tracker.speed()).toBeCloseTo(0, 9)
  })

  it('smooths: one jittery event does not swing the speed to its own value', () => {
    const clock = manualClock()
    const tracker = createScalarSpeedTracker(clock.now)
    const value = steadyScalar(tracker, clock, { pxPerS: 100, events: 30 })
    clock.advance(1)
    tracker.sample(value + 3) // 3000 px/s on its own
    expect(tracker.speed()).toBeLessThan(1000)
  })

  it('holds for 30 ms, then decays linearly to zero at 80 ms (stalling counts as slow)', () => {
    const clock = manualClock()
    const tracker = createScalarSpeedTracker(clock.now)
    steadyScalar(tracker, clock, { pxPerS: 2000, events: 20 })
    const moving = tracker.speed()
    expect(moving).toBeGreaterThan(1500)

    clock.advance(SPEED_HOLD_MS)
    expect(tracker.speed()).toBeCloseTo(moving, 9)
    clock.advance((SPEED_STALL_MS - SPEED_HOLD_MS) / 2)
    expect(tracker.speed()).toBeCloseTo(moving / 2, 6)
    clock.advance((SPEED_STALL_MS - SPEED_HOLD_MS) / 2)
    expect(tracker.speed()).toBe(0)
    clock.advance(500)
    expect(tracker.speed()).toBe(0)
  })

  it('a stall drops the band to the finest step', () => {
    const clock = manualClock()
    const tracker = createScalarSpeedTracker(clock.now)
    steadyScalar(tracker, clock, { pxPerS: 3000, events: 20 })
    let step = stepForSpeedIn(BANDS, tracker.speed(), 0)
    expect(step).toBe(10)
    clock.advance(SPEED_STALL_MS)
    step = stepForSpeedIn(BANDS, tracker.speed(), step)
    expect(step).toBe(0.1)
  })

  it('a move after a long stall reads its own (slow) speed, not the old fast one', () => {
    const clock = manualClock()
    const tracker = createScalarSpeedTracker(clock.now)
    const value = steadyScalar(tracker, clock, { pxPerS: 3000, events: 20 })
    clock.advance(400)
    tracker.sample(value + 2) // 2 px in 400 ms: 5 px/s
    expect(tracker.speed()).toBeLessThan(40)
  })

  it('absorbs two events with one timestamp: the travel accrues into the next sample', () => {
    const clock = manualClock()
    const tracker = createScalarSpeedTracker(clock.now)
    tracker.begin(0)
    tracker.sample(5) // same instant as begin: absorbed
    expect(tracker.speed()).toBe(0)
    clock.advance(10)
    tracker.sample(10)
    // 10 px in 10 ms counted once (1000 px/s × alpha), not 5 px in 10 ms.
    const alpha = 1 - Math.exp(-10 / SPEED_SMOOTHING_MS)
    expect(tracker.speed()).toBeCloseTo(1000 * alpha, 6)
  })

  it('begin() resets a tracker for the next drag', () => {
    const clock = manualClock()
    const tracker = createScalarSpeedTracker(clock.now)
    steadyScalar(tracker, clock, { pxPerS: 2000, events: 20 })
    tracker.begin(5)
    expect(tracker.speed()).toBe(0)
  })

  it('a single event that jumps far is a large speed, finite, and the next stall still clears it', () => {
    const clock = manualClock()
    const tracker = createScalarSpeedTracker(clock.now)
    tracker.begin(0)
    clock.advance(16)
    tracker.sample(400)
    expect(Number.isFinite(tracker.speed())).toBe(true)
    expect(tracker.speed()).toBeGreaterThan(1000)
    clock.advance(SPEED_STALL_MS)
    expect(tracker.speed()).toBe(0)
  })
})

describe('createRateTracker — the core both trackers share', () => {
  it('reports whether a sample was taken, refusing a zero interval', () => {
    const clock = manualClock()
    const rate = createRateTracker(clock.now)
    rate.begin()
    expect(rate.record(5)).toBe(false)
    clock.advance(10)
    expect(rate.record(5)).toBe(true)
    expect(rate.speed()).toBeGreaterThan(0)
  })
})

describe('the rotate exports are unchanged by the extraction (ui-064 regression)', () => {
  /**
   * Captured from `rotateSnap.js` *before* the tracker moved to `dragSteps.js`
   * (commit 5add6fc): a ring drag about the hub (10, −5) with uneven intervals,
   * one zero interval and one long pause, read after every event and once more
   * 40 ms after the last. Each entry is `[speed px/s, step °]`.
   */
  const GOLDEN = [
    [0, 0.1],
    [274.2566809922055, 1],
    [274.2566809922055, 1],
    [412.25335206528325, 5],
    [432.02724738046106, 5],
    [228.63207058267574, 5],
    [825.0664509503532, 5],
    [12.811439448276294, 0.1],
    [94.46885644151189, 1],
    [42.107299531680624, 1],
    [33.6858396253445, 0.1],
  ]
  const PATH = [
    [0, 121, -12],
    [16, 118, -30],
    [0, 117, -33],
    [9, 110, -45],
    [33, 100, -60],
    [45, 95, -62],
    [8, 40, -100],
    [120, 38, -101],
    [5, 30, -104],
    [50, 29, -104],
  ]

  it('createSpeedTracker + stepForSpeed give the same speeds and steps as before', () => {
    const clock = manualClock()
    const tracker = rotateSnap.createSpeedTracker(clock.now)
    tracker.begin(120, 0)
    let step = 0
    /** @type {number[][]} */
    const seen = []
    for (const [dt, x, y] of PATH) {
      clock.advance(dt)
      tracker.sample(x, y, 10, -5)
      step = rotateSnap.stepForSpeed(tracker.speed(), step)
      seen.push([tracker.speed(), step])
    }
    clock.advance(40)
    seen.push([tracker.speed(), rotateSnap.stepForSpeed(tracker.speed(), step)])

    expect(seen).toHaveLength(GOLDEN.length)
    seen.forEach(([speed, stepDeg], index) => {
      expect(speed).toBeCloseTo(GOLDEN[index][0], 9)
      expect(stepDeg).toBe(GOLDEN[index][1])
    })
  })
})
