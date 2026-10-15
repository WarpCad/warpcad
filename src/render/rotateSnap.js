// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Step sizes for a rotate-ring drag (`TODO/ui-064`): how far the body has
 * turned, unwrapped past ±180°, and which step that turn is quantised to — 5°
 * with Shift held, a speed-dependent step on touch and pen, continuous with a
 * plain mouse.
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

/** Shift-held step, degrees (mouse and keyboard; also wins over speed on touch/pen). */
export const SHIFT_STEP_DEG = 5

/**
 * @typedef {object} SpeedBand
 * @property {number} minPxPerS Tangential pointer speed, px/s, at which the band begins.
 * @property {number} stepDeg The step a drag this fast snaps to.
 */

/**
 * Speed bands for touch and pen, slowest first. The *shape* is fixed by the spec
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

/**
 * How far past a band edge a speed must go before it leaves its current band,
 * as a fraction of that edge. Without this, a speed hovering on an edge flips
 * between two steps on every event and the value jitters.
 */
export const BAND_HYSTERESIS = 0.15

/** Time constant of the speed's exponential average, ms (roughly "the last 100 ms"). */
export const SPEED_SMOOTHING_MS = 100

/**
 * Silence after which the speed reads zero, ms. `pointermove` stops firing when
 * a finger stops, so the last sample goes stale. Without a decay, a drag that
 * ends with a pause would commit at whatever coarse step it was in half a
 * second earlier.
 */
export const SPEED_STALL_MS = 80

/**
 * Silence the speed rides out untouched, ms, before it starts decaying toward
 * {@link SPEED_STALL_MS}. Longer than any ordinary gap between `pointermove`s
 * (8–33 ms from 120 Hz down to 30 Hz), so a steady drag is never mistaken
 * for a slowing one; shorter than the stall, so a real stop still reads zero by 80 ms.
 */
export const SPEED_HOLD_MS = 30

/**
 * Within this many pixels of the hub, the pointer has no usable angle, so the
 * turn holds its last value instead of jumping on sub-pixel noise.
 */
export const HUB_DEAD_PX = 2

/**
 * Float dust on a snapped value is rounded off at this many decimal places, so
 * `3 × 0.1` is `0.3` in the document, not `0.30000000000000004`.
 */
const CLEAN_DECIMALS = 1e9

/**
 * Round a signed angle to the nearest multiple of `stepDeg`.
 *
 * Halves round **away from zero** (`2.5 → 5`, `-2.5 → -5`), unlike
 * `Math.round`, which sends `-2.5` to `-2`. So a drag mirrored through the
 * start lands on the mirrored step.
 *
 * @param {number} deg
 * @param {number} stepDeg `0` (or anything not positive) means continuous: the
 *   angle passes through, only `-0` normalised.
 * @returns {number} Degrees, never `-0`.
 */
export function snapDeg(deg, stepDeg) {
  if (!(stepDeg > 0)) return deg === 0 ? 0 : deg
  const steps = Math.round(Math.abs(deg) / stepDeg)
  const magnitude = Math.round(steps * stepDeg * CLEAN_DECIMALS) / CLEAN_DECIMALS
  const value = deg < 0 ? -magnitude : magnitude
  return value === 0 ? 0 : value
}

/**
 * The band index whose step is `stepDeg`, or `-1`.
 *
 * @param {number} stepDeg
 * @returns {number}
 */
function bandOf(stepDeg) {
  for (let index = 0; index < SPEED_BANDS.length; index += 1) {
    if (SPEED_BANDS[index].stepDeg === stepDeg) return index
  }
  return -1
}

/**
 * The touch/pen step for a pointer moving at `speedPxPerS`, with hysteresis
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
  const speed = Number.isFinite(speedPxPerS) && speedPxPerS > 0 ? speedPxPerS : 0
  let band = bandOf(previousStep)
  if (band < 0) {
    band = 0
    while (band + 1 < SPEED_BANDS.length && speed >= SPEED_BANDS[band + 1].minPxPerS) band += 1
    return SPEED_BANDS[band].stepDeg
  }
  // Leave upward only once clearly past the next edge…
  while (band + 1 < SPEED_BANDS.length && speed >= SPEED_BANDS[band + 1].minPxPerS * (1 + BAND_HYSTERESIS)) {
    band += 1
  }
  // …and downward only once clearly below this band's own edge.
  while (band > 0 && speed < SPEED_BANDS[band].minPxPerS * (1 - BAND_HYSTERESIS)) band -= 1
  return SPEED_BANDS[band].stepDeg
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
 * turning anything, so it doesn't make the step coarser.
 *
 * The smoothing is an exponential average with time constant
 * {@link SPEED_SMOOTHING_MS}, weighted by each event's real interval, so uneven
 * event timing doesn't skew it. After {@link SPEED_HOLD_MS} of silence the stored
 * value decays linearly, reaching zero at {@link SPEED_STALL_MS}. That applies
 * both when it is read and before the next sample is blended in. So a finger that stops reads as slow at once, and a move after
 * a long pause is measured on its own.
 *
 * Allocated once per viewport and reused across drags: `sample` and `speed`
 * allocate nothing.
 *
 * @param {() => number} now Monotonic clock, ms (`() => performance.now()` in the app).
 * @returns {SpeedTracker}
 */
export function createSpeedTracker(now) {
  let lastX = 0
  let lastY = 0
  let lastT = 0
  let smoothed = 0

  /** @param {number} t */
  function decayed(t) {
    const idle = t - lastT
    if (!(idle < SPEED_STALL_MS)) return 0
    if (idle <= SPEED_HOLD_MS) return smoothed
    return smoothed * ((SPEED_STALL_MS - idle) / (SPEED_STALL_MS - SPEED_HOLD_MS))
  }

  return {
    begin(xPx, yPx) {
      lastX = xPx
      lastY = yPx
      lastT = now()
      smoothed = 0
    },
    sample(xPx, yPx, originXPx, originYPx) {
      const t = now()
      const dt = t - lastT
      // Two events with one timestamp: let this travel accrue into the next
      // sample rather than divide by zero.
      if (!(dt > 0)) return
      const rx = xPx - originXPx
      const ry = yPx - originYPx
      const radius = Math.hypot(rx, ry)
      const dx = xPx - lastX
      const dy = yPx - lastY
      // The displacement's component across the radius: |r̂ × d|.
      const tangentialPx = radius > HUB_DEAD_PX ? Math.abs(rx * dy - ry * dx) / radius : 0
      const instant = (tangentialPx * 1000) / dt
      const alpha = 1 - Math.exp(-dt / SPEED_SMOOTHING_MS)
      const base = decayed(t)
      smoothed = base + alpha * (instant - base)
      lastX = xPx
      lastY = yPx
      lastT = t
    },
    speed() {
      return decayed(now())
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
 * Shift wins on any pointer (a pen on a laptop can reach it). Touch and pen use
 * the speed step. A mouse without Shift is continuous, exactly as before this
 * task, so nothing changes for existing users.
 *
 * @param {boolean} shift
 * @param {string} pointerType `PointerEvent.pointerType`.
 * @param {number} speedStepDeg The touch/pen speed step ({@link stepForSpeed}).
 * @returns {number} Degrees, or `0` for continuous.
 */
export function rotateStepDeg(shift, pointerType, speedStepDeg) {
  if (shift) return SHIFT_STEP_DEG
  if (usesSpeedStep(pointerType)) return speedStepDeg
  return 0
}

/**
 * Whether a pointer type gets the speed-sensitive step: touch and pen, which have
 * no Shift to reach for (open question (c), settled as "pen is like touch").
 *
 * @param {string} pointerType `PointerEvent.pointerType`.
 * @returns {boolean}
 */
export function usesSpeedStep(pointerType) {
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
