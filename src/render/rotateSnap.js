// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Step sizes for a rotate-ring drag (`TODO/ui-064`): how far the body has
 * turned, unwrapped past ±180°, and which step that turn is quantised to — 5°
 * with Shift held, otherwise a speed-dependent step on every pointer type.
 *
 * Framework-free like the rest of `src/render/`: no DOM, no Vue, no timers. The
 * speed tracker takes its clock as an argument, so a unit test describes "80 ms
 * of silence" as a number instead of waiting for it.
 *
 * ## One number, quantised once
 *
 * `Viewport.vue` computes the raw unwrapped turn, picks a step, snaps it here,
 * and feeds *that* to the preview. The dial, the readout, the preview mesh, the
 * Inspector's Rotation field and the committed record all read that one value,
 * so what you see on release is exactly what gets committed.
 *
 * ## Quantise the absolute angle, never accumulate steps
 *
 * The turned angle is always the pointer's own angle from the start, rounded to
 * the current step, never a running sum of per-event steps. A sum drifts away
 * from the finger and can't be reasoned about. The rounded absolute angle
 * converges back on the finger as soon as it slows down, so slowing down at the
 * end of a drag ("now let me land on it") works with no extra code.
 *
 * @module render/rotateSnap
 */

import { rotateDeltaDeg } from './annotate.js'
import {
  BAND_HYSTERESIS,
  SPEED_HOLD_MS,
  SPEED_SMOOTHING_MS,
  SPEED_STALL_MS,
  createRateTracker,
  snapToStep,
  stepForSpeedIn,
} from './dragSteps.js'

// The tracker's tuning moved to `dragSteps.js` with `TODO/ui-065`, shared with
// the translate ruler. Re-exported so `ui-064`'s callers do not change.
export { BAND_HYSTERESIS, SPEED_HOLD_MS, SPEED_SMOOTHING_MS, SPEED_STALL_MS }

/** Shift-held step, degrees (wins over speed on any pointer). */
export const SHIFT_STEP_DEG = 5

/**
 * @typedef {object} SpeedBand
 * @property {number} minPxPerS Tangential pointer speed, px/s, at which the band begins.
 * @property {number} stepDeg The step a drag this fast snaps to.
 */

/**
 * Speed bands for every pointer type, slowest first. The *shape* is fixed by the spec
 * (fine at a crawl, coarse when flung); the edges are tunables, to be settled
 * against a real finger on a real device.
 *
 * At a typical 60–120 px ring radius, 40 px/s is a deliberate creep, 250 px/s an
 * ordinary drag and 900 px/s a flick.
 *
 * @type {readonly SpeedBand[]}
 */
export const SPEED_BANDS = Object.freeze([
  Object.freeze({ minPxPerS: 0, stepDeg: 0.1 }),
  Object.freeze({ minPxPerS: 40, stepDeg: 1 }),
  Object.freeze({ minPxPerS: 250, stepDeg: 5 }),
  Object.freeze({ minPxPerS: 900, stepDeg: 15 }),
])

/** {@link SPEED_BANDS} in the shared `dragSteps.js` band shape. */
const ROTATE_BANDS = Object.freeze(
  SPEED_BANDS.map((band) => Object.freeze({ minPxPerS: band.minPxPerS, step: band.stepDeg })),
)

/**
 * Within this many pixels of the hub, the pointer has no usable angle, so the
 * turn holds its last value instead of jumping on sub-pixel noise.
 */
export const HUB_DEAD_PX = 2

/**
 * Round a signed angle to the nearest multiple of `stepDeg`.
 *
 * Halves round **away from zero** (`2.5 → 5`, `-2.5 → -5`), unlike
 * `Math.round`, which sends `-2.5` to `-2`. So a drag mirrored through the
 * start lands on the mirrored step. (`dragSteps.js`'s `snapToStep`, in degrees.)
 *
 * @param {number} deg
 * @param {number} stepDeg `0` (or anything not positive) means continuous: the
 *   angle passes through, only `-0` normalised.
 * @returns {number} Degrees, never `-0`.
 */
export function snapDeg(deg, stepDeg) {
  return snapToStep(deg, stepDeg)
}

/**
 * The speed step for a pointer moving at `speedPxPerS`, with hysteresis
 * against the step it was already in.
 *
 * @param {number} speedPxPerS Smoothed tangential speed. Non-finite or negative
 *   is read as stopped.
 * @param {number} previousStep The step the drag is in now, or `0` (or any
 *   value not in {@link SPEED_BANDS}) on a cold start, which picks the band
 *   outright.
 * @returns {number} One of the {@link SPEED_BANDS} steps.
 */
export function stepForSpeed(speedPxPerS, previousStep) {
  return stepForSpeedIn(ROTATE_BANDS, speedPxPerS, previousStep)
}

/**
 * @typedef {object} SpeedTracker
 * @property {(xPx: number, yPx: number) => void} begin Reset for a new drag,
 *   with the pointer at this screen position, at the clock's current time.
 * @property {(xPx: number, yPx: number, originXPx: number, originYPx: number) => void} sample
 *   Record one `pointermove`: the pointer's position and the hub it turns about.
 * @property {() => number} speed The smoothed tangential speed now, px/s,
 *   decayed by the time since the last event.
 */

/**
 * A tangential-speed tracker for one pointer, smoothed and stall-aware.
 *
 * Only motion *around* the hub counts. Pulling straight out from the hub isn't
 * turning anything, so it doesn't make the step coarser. The smoothing and the
 * stall decay are `dragSteps.js`'s `createRateTracker`, shared with the
 * translate ruler; this adds only what "travel" means for a ring.
 *
 * Allocated once per viewport and reused across drags: `sample` and `speed`
 * allocate nothing.
 *
 * @param {() => number} now Monotonic clock, ms (`() => performance.now()` in the app).
 * @returns {SpeedTracker}
 */
export function createSpeedTracker(now) {
  const rate = createRateTracker(now)
  let lastX = 0
  let lastY = 0

  return {
    begin(xPx, yPx) {
      lastX = xPx
      lastY = yPx
      rate.begin()
    },
    sample(xPx, yPx, originXPx, originYPx) {
      const rx = xPx - originXPx
      const ry = yPx - originYPx
      const radius = Math.hypot(rx, ry)
      const dx = xPx - lastX
      const dy = yPx - lastY
      // The displacement's component across the radius: |r̂ × d|.
      const tangentialPx = radius > HUB_DEAD_PX ? Math.abs(rx * dy - ry * dx) / radius : 0
      // Two events with one timestamp: the rate tracker refuses the sample, and
      // the reference point stays put so this travel accrues into the next one.
      if (rate.record(tangentialPx)) {
        lastX = xPx
        lastY = yPx
      }
    },
    speed() {
      return rate.speed()
    },
  }
}

/**
 * Wrap an angle to (-180°, 180°].
 *
 * @param {number} deg
 * @returns {number}
 */
function wrap180(deg) {
  let wrapped = deg % 360
  if (wrapped > 180) wrapped -= 360
  else if (wrapped <= -180) wrapped += 360
  return wrapped
}

/**
 * The unwrapped angle a ring drag has turned, updated by one pointer event.
 *
 * `rotateDeltaDeg` wraps to (-180°, 180°], so a nudge across the seam doesn't
 * read as a 350° spin, but a sector and a readout can't work that way: a drag
 * past a half turn would flip `+179°` to `-179°`. This keeps counting: the
 * new wrapped reading is taken as the step *nearest* the previous unwrapped
 * value, so a three-quarter turn reads `+270°`. The committed rotation is
 * the same either way (`core-004`'s composition treats 270 and -90 alike).
 *
 * A single event that jumps more than half a turn is read the short way round.
 * Two samples can't tell +200° from -160°, and this way it agrees with
 * `rotateDeltaDeg`.
 *
 * @param {number} previousTurnedDeg The unwrapped turn before this event (`0` at `pointerdown`).
 * @param {number} originXPx Gizmo hub.
 * @param {number} originYPx
 * @param {number} startXPx Where the drag began.
 * @param {number} startYPx
 * @param {number} toXPx Where the pointer is now.
 * @param {number} toYPx
 * @param {number} facing `+1` when the ring's axis points toward the camera, `-1` away.
 * @returns {number} Degrees, unwrapped, never `-0`. Unchanged while the pointer is on the hub.
 */
export function accumulateTurnDeg(previousTurnedDeg, originXPx, originYPx, startXPx, startYPx, toXPx, toYPx, facing) {
  if (!(Math.hypot(toXPx - originXPx, toYPx - originYPx) > HUB_DEAD_PX)) return previousTurnedDeg
  const wrapped = rotateDeltaDeg(originXPx, originYPx, startXPx, startYPx, toXPx, toYPx, facing)
  const turned = previousTurnedDeg + wrap180(wrapped - previousTurnedDeg)
  return turned === 0 ? 0 : turned
}

/**
 * Which step a ring drag is in right now.
 *
 * Shift wins (5°); otherwise the speed step, on every pointer type — a mouse, a
 * pen and a finger alike, and the same rule `translateStepMm` gives an arm
 * (`TODO/ui-066`). The speed tracker always has a band, so there is no
 * continuous case any more.
 *
 * @param {boolean} shift
 * @param {number} speedStepDeg The speed step ({@link stepForSpeed}).
 * @returns {number} Degrees, always positive.
 */
export function rotateStepDeg(shift, speedStepDeg) {
  if (shift) return SHIFT_STEP_DEG
  return speedStepDeg > 0 ? speedStepDeg : SPEED_BANDS[0].stepDeg
}

/**
 * Whether a pointer type is a finger or pen, which the readout dodges
 * ({@link placeDialReadout}'s `touch` flag). Not about steps: every pointer type
 * gets the speed step.
 *
 * @param {string} pointerType `PointerEvent.pointerType`.
 * @returns {boolean}
 */
export function isFingerPointer(pointerType) {
  return pointerType === 'touch' || pointerType === 'pen'
}

/**
 * The readout's main line: the signed turned angle to 0.1°, e.g. `+37.5°`.
 *
 * Zero is `+0.0°`, including a tiny negative that rounds to it. ASCII `-` rather
 * than a typographic minus, so the readout parses as a number (the e2e spec reads
 * it back).
 *
 * @param {number} deg
 * @returns {string}
 */
export function formatTurnDeg(deg) {
  const text = deg.toFixed(1)
  if (text === '-0.0' || text === '0.0') return '+0.0°'
  return deg > 0 ? `+${text}°` : `${text}°`
}

/**
 * The readout's second line: which step is active, or `''` when continuous.
 *
 * @param {number} stepDeg
 * @returns {string}
 */
export function stepLabel(stepDeg) {
  if (!(stepDeg > 0)) return ''
  if (stepDeg < 1) return `fine ${stepDeg}°`
  return `${stepDeg}° steps`
}
