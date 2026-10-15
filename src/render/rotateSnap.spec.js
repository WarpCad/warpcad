// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  SHIFT_STEP_DEG,
  SPEED_BANDS,
  SPEED_STALL_MS,
  accumulateTurnDeg,
  createSpeedTracker,
  formatTurnDeg,
  isFingerPointer,
  rotateStepDeg,
  snapDeg,
  stepForSpeed,
  stepLabel,
} from './rotateSnap.js'

/**
 * The rotate dial's step maths (`TODO/ui-064`).
 *
 * Plain Node, no DOM and no timers: the speed tracker takes an injected clock,
 * so a "stall of 80 ms" is a number this spec writes, not a wait it sits through.
 * Every numerical assertion carries an explicit tolerance, per CLAUDE.md.
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

/**
 * Feed a tracker a pointer moving tangentially around a hub at a steady speed.
 *
 * The hub is at the origin and the pointer starts on the +X axis at `radiusPx`;
 * each step moves it `pxPerEvent` straight up (screen −Y), which is purely
 * tangential at the start and close to it for small steps.
 *
 * @param {ReturnType<typeof createSpeedTracker>} tracker
 * @param {ReturnType<typeof manualClock>} clock
 * @param {{ pxPerS: number, events: number, intervalMs?: number, radiusPx?: number }} options
 * @returns {number} The tracker's speed after the last event.
 */
function steadyDrag(tracker, clock, { pxPerS, events, intervalMs = 16, radiusPx = 400 }) {
  const pxPerEvent = (pxPerS * intervalMs) / 1000
  // Walk round the circle so every step is genuinely tangential, however many.
  let angle = 0
  tracker.begin(radiusPx, 0)
  for (let index = 0; index < events; index += 1) {
    clock.advance(intervalMs)
    angle -= pxPerEvent / radiusPx
    tracker.sample(Math.cos(angle) * radiusPx, Math.sin(angle) * radiusPx, 0, 0)
  }
  return tracker.speed()
}

describe('snapDeg', () => {
  it('rounds to the nearest 5° step', () => {
    expect(snapDeg(0, 5)).toBe(0)
    expect(snapDeg(3, 5)).toBeCloseTo(5, 9)
    expect(snapDeg(7.4, 5)).toBeCloseTo(5, 9)
    expect(snapDeg(7.6, 5)).toBeCloseTo(10, 9)
    expect(snapDeg(44.7, 5)).toBeCloseTo(45, 9)
    expect(snapDeg(45.3, 5)).toBeCloseTo(45, 9)
  })

  it('treats negatives as the mirror image of positives', () => {
    expect(snapDeg(-3, 5)).toBeCloseTo(-5, 9)
    expect(snapDeg(-7.4, 5)).toBeCloseTo(-5, 9)
    expect(snapDeg(-44.7, 5)).toBeCloseTo(-45, 9)
  })

  it('rounds an exact half-step away from zero, symmetrically', () => {
    // `Math.round` alone sends 2.5 to 3 and -2.5 to -2: a drag that crosses the
    // start in one direction would land on a different step from the same drag
    // the other way.
    expect(snapDeg(2.5, 5)).toBeCloseTo(5, 9)
    expect(snapDeg(-2.5, 5)).toBeCloseTo(-5, 9)
    expect(snapDeg(7.5, 5)).toBeCloseTo(10, 9)
    expect(snapDeg(-7.5, 5)).toBeCloseTo(-10, 9)
  })

  it('never returns negative zero', () => {
    // The `rotateDeltaDeg` lesson: -0 is not a different angle, but it prints
    // as "-0.0°" in a readout someone is reading.
    expect(Object.is(snapDeg(-0.4, 5), 0)).toBe(true)
    expect(Object.is(snapDeg(-0, 5), 0)).toBe(true)
    expect(Object.is(snapDeg(-0.04, 0.1), 0)).toBe(true)
    expect(Object.is(snapDeg(-0, 0), 0)).toBe(true)
  })

  it('handles ±180 and beyond: the turned angle is unwrapped', () => {
    expect(snapDeg(180, 5)).toBeCloseTo(180, 9)
    expect(snapDeg(-180, 5)).toBeCloseTo(-180, 9)
    expect(snapDeg(178, 5)).toBeCloseTo(180, 9)
    expect(snapDeg(268.9, 5)).toBeCloseTo(270, 9)
    expect(snapDeg(-271, 5)).toBeCloseTo(-270, 9)
  })

  it('passes the angle through unchanged when there is no step (continuous mouse drag)', () => {
    expect(snapDeg(44.73, 0)).toBeCloseTo(44.73, 12)
    expect(snapDeg(-12.345, 0)).toBeCloseTo(-12.345, 12)
  })

  it('lands 0.1° steps on clean decimals across a long sweep, with no float drift', () => {
    // 3 × 0.1 is 0.30000000000000004 in binary floating point. A readout that
    // shows "+0.3°" while committing 0.30000000000000004 is harmless; one that
    // drifts to 359.90000000000003 after a long sweep ends up in the document.
    for (let tenths = -3600; tenths <= 3600; tenths += 7) {
      const value = snapDeg(tenths / 10 + 0.031, 0.1)
      expect(value).toBeCloseTo(tenths / 10, 9)
      // The snapped value is exactly what its own one-decimal text says.
      expect(value).toBe(Number(value.toFixed(1)))
    }
  })

  it('works at the 1° and 15° bands too', () => {
    expect(snapDeg(12.6, 1)).toBeCloseTo(13, 9)
    expect(snapDeg(22, 15)).toBeCloseTo(15, 9)
    expect(snapDeg(23, 15)).toBeCloseTo(30, 9)
    expect(snapDeg(-23, 15)).toBeCloseTo(-30, 9)
  })
})

describe('stepForSpeed', () => {
  it('the band table runs fine to coarse, with the spec\'s 0.1° / 1° / 5° / 15° steps', () => {
    expect(SPEED_BANDS.map((band) => band.stepDeg)).toEqual([0.1, 1, 5, 15])
    expect(SPEED_BANDS[0].minPxPerS).toBe(0)
    for (let index = 1; index < SPEED_BANDS.length; index += 1) {
      expect(SPEED_BANDS[index].minPxPerS).toBeGreaterThan(SPEED_BANDS[index - 1].minPxPerS)
    }
  })

  it('picks each band from a cold start (no previous step)', () => {
    for (let index = 0; index < SPEED_BANDS.length; index += 1) {
      const low = SPEED_BANDS[index].minPxPerS
      const high = SPEED_BANDS[index + 1]?.minPxPerS ?? low * 4 + 100
      const middle = (low + high) / 2
      expect(stepForSpeed(middle, 0)).toBe(SPEED_BANDS[index].stepDeg)
    }
    expect(stepForSpeed(0, 0)).toBe(0.1)
    expect(stepForSpeed(1e6, 0)).toBe(15)
  })

  it('stays put while the speed oscillates ±10% around a band edge (hysteresis)', () => {
    for (let index = 1; index < SPEED_BANDS.length; index += 1) {
      const edge = SPEED_BANDS[index].minPxPerS
      const below = SPEED_BANDS[index - 1].stepDeg
      const above = SPEED_BANDS[index].stepDeg

      // Coming from below: wobbling either side of the edge never promotes.
      let step = below
      for (const factor of [0.9, 1.1, 0.95, 1.08, 0.9, 1.1]) {
        step = stepForSpeed(edge * factor, step)
        expect(step).toBe(below)
      }
      // Coming from above: the same wobble never demotes.
      step = above
      for (const factor of [1.1, 0.9, 1.05, 0.92, 1.1, 0.9]) {
        step = stepForSpeed(edge * factor, step)
        expect(step).toBe(above)
      }
    }
  })

  it('does leave a band once the edge is cleared by the hysteresis margin', () => {
    const edge = SPEED_BANDS[2].minPxPerS
    expect(stepForSpeed(edge * 1.2, SPEED_BANDS[1].stepDeg)).toBe(SPEED_BANDS[2].stepDeg)
    expect(stepForSpeed(edge * 0.8, SPEED_BANDS[2].stepDeg)).toBe(SPEED_BANDS[1].stepDeg)
  })

  it('can jump several bands at once, both ways', () => {
    expect(stepForSpeed(1e6, 0.1)).toBe(15)
    expect(stepForSpeed(0, 15)).toBe(0.1)
  })

  it('treats a non-finite or negative speed as stopped', () => {
    expect(stepForSpeed(Number.NaN, 5)).toBe(0.1)
    expect(stepForSpeed(-50, 5)).toBe(0.1)
  })
})

describe('createSpeedTracker', () => {
  it('reads zero before anything has moved', () => {
    const clock = manualClock()
    const tracker = createSpeedTracker(clock.now)
    tracker.begin(100, 0)
    expect(tracker.speed()).toBe(0)
  })

  it('converges on a steady tangential speed', () => {
    const clock = manualClock()
    const tracker = createSpeedTracker(clock.now)
    const speed = steadyDrag(tracker, clock, { pxPerS: 600, events: 40 })
    expect(speed).toBeGreaterThan(540)
    expect(speed).toBeLessThan(660)
  })

  it('ignores radial travel: pulling straight away from the hub is not turning', () => {
    const clock = manualClock()
    const tracker = createSpeedTracker(clock.now)
    tracker.begin(100, 0)
    for (let index = 1; index <= 20; index += 1) {
      clock.advance(16)
      tracker.sample(100 + index * 20, 0, 0, 0)
    }
    expect(tracker.speed()).toBeCloseTo(0, 6)
  })

  it('smooths: one jittery event does not swing the speed to its own value', () => {
    const clock = manualClock()
    const tracker = createSpeedTracker(clock.now)
    steadyDrag(tracker, clock, { pxPerS: 100, events: 30 })
    // A single 1 ms event that covers 3 px is 3000 px/s on its own.
    clock.advance(1)
    tracker.sample(400 * Math.cos(-0.1), 400 * Math.sin(-0.1) - 3, 0, 0)
    expect(tracker.speed()).toBeLessThan(1000)
  })

  it('decays to zero after a stall, with no further events (stalling counts as slow)', () => {
    const clock = manualClock()
    const tracker = createSpeedTracker(clock.now)
    const moving = steadyDrag(tracker, clock, { pxPerS: 2000, events: 20 })
    expect(moving).toBeGreaterThan(1500)

    clock.advance(SPEED_STALL_MS / 2)
    const half = tracker.speed()
    expect(half).toBeLessThan(moving)
    expect(half).toBeGreaterThan(0)

    clock.advance(SPEED_STALL_MS / 2)
    expect(tracker.speed()).toBe(0)
    clock.advance(500)
    expect(tracker.speed()).toBe(0)
  })

  it('a stall of 80 ms is zero — and the step falls to fine because of it', () => {
    expect(SPEED_STALL_MS).toBeLessThanOrEqual(80)
    const clock = manualClock()
    const tracker = createSpeedTracker(clock.now)
    const speed = steadyDrag(tracker, clock, { pxPerS: 3000, events: 20 })
    let step = stepForSpeed(speed, 0)
    expect(step).toBe(15)
    clock.advance(80)
    step = stepForSpeed(tracker.speed(), step)
    expect(step).toBe(0.1)
  })

  it('a move after a long stall reads its own (slow) speed, not the old fast one', () => {
    const clock = manualClock()
    const tracker = createSpeedTracker(clock.now)
    steadyDrag(tracker, clock, { pxPerS: 3000, events: 20 })
    // Where `steadyDrag` left the pointer: 20 events × 48 px round a 400 px circle.
    const endAngle = -(20 * 48) / 400
    clock.advance(400)
    // 2 px further round, 400 ms later: 5 px/s.
    const nudged = endAngle - 2 / 400
    tracker.sample(400 * Math.cos(nudged), 400 * Math.sin(nudged), 0, 0)
    expect(tracker.speed()).toBeLessThan(40)
  })

  it('absorbs two events with the same timestamp instead of dividing by zero', () => {
    const clock = manualClock()
    const tracker = createSpeedTracker(clock.now)
    tracker.begin(100, 0)
    tracker.sample(100, -5, 0, 0)
    expect(Number.isFinite(tracker.speed())).toBe(true)
    clock.advance(10)
    tracker.sample(100, -10, 0, 0)
    // 10 px in 10 ms, counted once — not 5 px in 0 ms.
    expect(Number.isFinite(tracker.speed())).toBe(true)
    expect(tracker.speed()).toBeGreaterThan(0)
  })

  it('begin() resets a tracker for the next drag', () => {
    const clock = manualClock()
    const tracker = createSpeedTracker(clock.now)
    steadyDrag(tracker, clock, { pxPerS: 2000, events: 20 })
    tracker.begin(50, 50)
    expect(tracker.speed()).toBe(0)
  })
})

describe('accumulateTurnDeg — the unwrapped turned angle', () => {
  // Hub at (0, 0), drag starting on +X at radius 100. Screen Y grows down, so a
  // counter-clockwise sweep on screen goes through −Y, and about an axis facing
  // the viewer that is a positive turn (`rotateDeltaDeg`'s convention).
  /**
   * @param {number} deg Screen CCW angle from +X.
   * @returns {[number, number]}
   */
  const at = (deg) => [100 * Math.cos((deg * Math.PI) / 180), -100 * Math.sin((deg * Math.PI) / 180)]

  /**
   * @param {number[]} path Screen CCW angles, degrees, one per pointermove.
   * @param {1 | -1} [facing]
   */
  function sweep(path, facing = 1) {
    let turned = 0
    for (const deg of path) {
      const [x, y] = at(deg)
      turned = accumulateTurnDeg(turned, 0, 0, 100, 0, x, y, facing)
    }
    return turned
  }

  it('matches rotateDeltaDeg below a half turn', () => {
    expect(sweep([10, 20, 30, 37.5])).toBeCloseTo(37.5, 9)
    expect(sweep([-10, -20, -45])).toBeCloseTo(-45, 9)
    expect(sweep([10, 20, 30], -1)).toBeCloseTo(-30, 9)
  })

  it('keeps counting past 180°: a three-quarter turn reads +270, not -90', () => {
    const path = []
    for (let deg = 10; deg <= 270; deg += 10) path.push(deg)
    expect(sweep(path)).toBeCloseTo(270, 9)
  })

  it('and past a full turn, both ways', () => {
    const forward = []
    for (let deg = 15; deg <= 400; deg += 15) forward.push(deg)
    expect(sweep(forward)).toBeCloseTo(390, 9)
    const back = []
    for (let deg = -15; deg >= -400; deg -= 15) back.push(deg)
    expect(sweep(back)).toBeCloseTo(-390, 9)
  })

  it('winds back down through the seam it crossed', () => {
    expect(sweep([90, 170, 190, 260, 190, 170, 90, 30])).toBeCloseTo(30, 9)
  })

  it('holds the last value while the pointer sits on the hub (no angle to measure)', () => {
    let turned = accumulateTurnDeg(0, 0, 0, 100, 0, ...at(60), 1)
    expect(turned).toBeCloseTo(60, 9)
    turned = accumulateTurnDeg(turned, 0, 0, 100, 0, 0, 0, 1)
    expect(turned).toBeCloseTo(60, 9)
    turned = accumulateTurnDeg(turned, 0, 0, 100, 0, 0.5, -0.5, 1)
    expect(turned).toBeCloseTo(60, 9)
    // And resumes from the real pointer once it leaves the hub.
    turned = accumulateTurnDeg(turned, 0, 0, 100, 0, ...at(70), 1)
    expect(turned).toBeCloseTo(70, 9)
  })

  it('reads a single event that jumps more than 180° the short way round, and stays finite', () => {
    // There is no way to tell a 200° jump from a −160° one from two samples; the
    // short way is `rotateDeltaDeg`'s own reading, so the two never disagree.
    const turned = sweep([10, 210])
    expect(turned).toBeCloseTo(-150, 9)
    expect(Number.isFinite(turned)).toBe(true)
  })

  it('a zero sweep is +0, never -0', () => {
    expect(Object.is(accumulateTurnDeg(0, 0, 0, 100, 0, 100, 0, -1), 0)).toBe(true)
    expect(Object.is(accumulateTurnDeg(-0, 0, 0, 100, 0, 100, 0, 1), 0)).toBe(true)
  })
})

describe('rotateStepDeg — which step a drag is in', () => {
  it('Shift is 5° steps, whatever the speed — Shift wins over speed', () => {
    expect(SHIFT_STEP_DEG).toBe(5)
    expect(rotateStepDeg(true, 0.1)).toBe(5)
    expect(rotateStepDeg(true, 1)).toBe(5)
    expect(rotateStepDeg(true, 15)).toBe(5)
  })

  it('without Shift the speed step is used, with no pointer type in the signature (TODO/ui-066)', () => {
    // A mouse used to be continuous (0); it now gets the same band as touch and pen.
    expect(rotateStepDeg(false, 0.1)).toBe(0.1)
    expect(rotateStepDeg(false, 1)).toBe(1)
    expect(rotateStepDeg(false, 5)).toBe(5)
    expect(rotateStepDeg(false, 15)).toBe(15)
    expect(rotateStepDeg.length).toBe(2)
  })

  it('a cold start (no speed step yet) is the finest band, never continuous', () => {
    expect(rotateStepDeg(false, 0)).toBe(0.1)
  })

  it('a slow mouse drag lands on 0.1° and a fast one on a coarse step, through the real bands', () => {
    // The step a drag at this speed picks, from a cold start, fed straight in.
    expect(rotateStepDeg(false, stepForSpeed(10, 0))).toBe(0.1)
    expect(rotateStepDeg(false, stepForSpeed(1500, 0))).toBe(15)
    expect(rotateStepDeg(true, stepForSpeed(1500, 0))).toBe(5)
  })

  it('the readout dodges a finger or pen, and nothing else', () => {
    expect(isFingerPointer('touch')).toBe(true)
    expect(isFingerPointer('pen')).toBe(true)
    expect(isFingerPointer('mouse')).toBe(false)
    expect(isFingerPointer('')).toBe(false)
  })
})

describe('the readout text', () => {
  it('formats the signed turned angle to 0.1°', () => {
    expect(formatTurnDeg(37.5)).toBe('+37.5°')
    expect(formatTurnDeg(-12.34)).toBe('-12.3°')
    expect(formatTurnDeg(270)).toBe('+270.0°')
    expect(formatTurnDeg(89.96)).toBe('+90.0°')
  })

  it('zero is +0.0°, never -0.0° — including a tiny negative that rounds to zero', () => {
    expect(formatTurnDeg(0)).toBe('+0.0°')
    expect(formatTurnDeg(-0)).toBe('+0.0°')
    expect(formatTurnDeg(-0.04)).toBe('+0.0°')
  })

  it('names the active step, or nothing when continuous', () => {
    expect(stepLabel(5)).toBe('5° steps')
    expect(stepLabel(15)).toBe('15° steps')
    expect(stepLabel(1)).toBe('1° steps')
    expect(stepLabel(0.1)).toBe('fine 0.1°')
    expect(stepLabel(0)).toBe('')
  })
})
