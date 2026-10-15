// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The speed-sensitive step shared by every gizmo drag: the rotate dial
 * (`TODO/ui-064`) and the translate ruler (`TODO/ui-065`).
 *
 * A drag's step size follows how fast the pointer is moving: fast is coarse,
 * slow is fine. Three pieces make that work, and they live here, once, so a ring
 * and an arm cannot drift apart:
 *
 * - a **rate tracker** that smooths the speed of whatever the drag measures
 *   (travel around a hub, travel along an arm) and lets it decay when the
 *   pointer stops;
 * - a **band picker** that turns a speed into a step from a caller's band table,
 *   with hysteresis so a speed hovering on an edge does not flicker;
 * - {@link snapToStep}, which rounds the drag's absolute value to that step.
 *
 * Each caller keeps its own band table, in its own unit (degrees for a ring,
 * millimetres for an arm). `ui-065` moved these out of `rotateSnap.js`, which
 * re-exports the constants and wraps the rest, so the rotate dial's results are
 * unchanged; `dragSteps.spec.js` pins that against a golden run.
 *
 * Framework-free like the rest of `src/render/`: no DOM, no Vue, no timers. The
 * tracker takes its clock as an argument, so a unit test describes "80 ms of
 * silence" as a number instead of waiting for it.
 *
 * @module render/dragSteps
 */

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
 * a pointer stops, so the last sample goes stale. Without a decay, a drag that
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
 * Float dust on a snapped value is rounded off at this many decimal places, so
 * `3 × 0.1` is `0.3` in the document, not `0.30000000000000004`.
 */
const CLEAN_DECIMALS = 1e9

/**
 * Round a signed value to the nearest multiple of `step`.
 *
 * Halves round **away from zero** (`2.5 → 5`, `-2.5 → -5`), unlike
 * `Math.round`, which sends `-2.5` to `-2`. So a drag mirrored through the
 * start lands on the mirrored step.
 *
 * @param {number} value Degrees or millimetres; the unit is the caller's.
 * @param {number} step `0` (or anything not positive) means continuous: the
 *   value passes through, only `-0` normalised.
 * @returns {number} Never `-0`.
 */
export function snapToStep(value, step) {
  if (!(step > 0)) return value === 0 ? 0 : value
  const steps = Math.round(Math.abs(value) / step)
  const magnitude = Math.round(steps * step * CLEAN_DECIMALS) / CLEAN_DECIMALS
  const snapped = value < 0 ? -magnitude : magnitude
  return snapped === 0 ? 0 : snapped
}

/**
 * @typedef {object} StepBand
 * @property {number} minPxPerS Pointer speed, px/s, at which the band begins.
 * @property {number} step The step a drag this fast snaps to, in the caller's unit.
 */

/**
 * The band index whose step is `step`, or `-1`.
 *
 * @param {readonly StepBand[]} bands
 * @param {number} step
 * @returns {number}
 */
function bandOf(bands, step) {
  for (let index = 0; index < bands.length; index += 1) {
    if (bands[index].step === step) return index
  }
  return -1
}

/**
 * The step for a pointer moving at `speedPxPerS`, with hysteresis against the
 * step it was already in.
 *
 * @param {readonly StepBand[]} bands Slowest first; the first band's
 *   `minPxPerS` is `0`.
 * @param {number} speedPxPerS Smoothed speed. Non-finite or negative is read as
 *   stopped.
 * @param {number} previousStep The step the drag is in now, or `0` (or any
 *   value not in `bands`) on a cold start, which picks the band outright.
 * @returns {number} One of the `bands` steps.
 */
export function stepForSpeedIn(bands, speedPxPerS, previousStep) {
  const speed = Number.isFinite(speedPxPerS) && speedPxPerS > 0 ? speedPxPerS : 0
  let band = bandOf(bands, previousStep)
  if (band < 0) {
    band = 0
    while (band + 1 < bands.length && speed >= bands[band + 1].minPxPerS) band += 1
    return bands[band].step
  }
  // Leave upward only once clearly past the next edge…
  while (band + 1 < bands.length && speed >= bands[band + 1].minPxPerS * (1 + BAND_HYSTERESIS)) {
    band += 1
  }
  // …and downward only once clearly below this band's own edge.
  while (band > 0 && speed < bands[band].minPxPerS * (1 - BAND_HYSTERESIS)) band -= 1
  return bands[band].step
}

/**
 * @typedef {object} RateTracker
 * @property {() => void} begin Reset for a new drag, at the clock's current time.
 * @property {(travelPx: number) => boolean} record Record one `pointermove` that
 *   covered `travelPx` (non-negative) since the last *recorded* one. Returns
 *   `false`, recording nothing, when no time has passed: the caller then keeps
 *   measuring travel from its previous reference, so it accrues into the next
 *   sample instead of dividing by zero.
 * @property {() => number} speed The smoothed speed now, px/s, decayed by the
 *   time since the last recorded event.
 */

/**
 * The smoothing and stall decay every drag's speed shares.
 *
 * An exponential average with time constant {@link SPEED_SMOOTHING_MS},
 * weighted by each event's real interval, so uneven event timing doesn't skew
 * it. After {@link SPEED_HOLD_MS} of silence the stored value decays linearly,
 * reaching zero at {@link SPEED_STALL_MS}, both when it is read and before the
 * next sample is blended in. So a pointer that stops reads as slow at once, and
 * a move after a long pause is measured on its own.
 *
 * What counts as travel is the caller's: the rotate dial feeds travel *around*
 * the hub, the ruler travel *along* the arm. Allocated once and reused across
 * drags: `record` and `speed` allocate nothing.
 *
 * @param {() => number} now Monotonic clock, ms (`() => performance.now()` in the app).
 * @returns {RateTracker}
 */
export function createRateTracker(now) {
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
    begin() {
      lastT = now()
      smoothed = 0
    },
    record(travelPx) {
      const t = now()
      const dt = t - lastT
      if (!(dt > 0)) return false
      const instant = (travelPx * 1000) / dt
      const alpha = 1 - Math.exp(-dt / SPEED_SMOOTHING_MS)
      const base = decayed(t)
      smoothed = base + alpha * (instant - base)
      lastT = t
      return true
    },
    speed() {
      return decayed(now())
    },
  }
}

/**
 * @typedef {object} ScalarSpeedTracker
 * @property {(valuePx: number) => void} begin Reset for a new drag, with the
 *   measured value at `valuePx`, at the clock's current time.
 * @property {(valuePx: number) => void} sample Record one `pointermove`: the
 *   measured value now.
 * @property {() => number} speed How fast the value is changing, px/s, either
 *   way, smoothed and stall-decayed.
 */

/**
 * The speed of a scalar the caller supplies: for the translate ruler, the
 * pointer's projection on the arm, in px from the drag's start. Only that
 * projection counts, so a pointer moving fast *across* the arm has no speed,
 * and the ruler, which doesn't move either, agrees.
 *
 * @param {() => number} now Monotonic clock, ms.
 * @returns {ScalarSpeedTracker}
 */
export function createScalarSpeedTracker(now) {
  const rate = createRateTracker(now)
  let last = 0
  return {
    begin(valuePx) {
      last = valuePx
      rate.begin()
    },
    sample(valuePx) {
      if (rate.record(Math.abs(valuePx - last))) last = valuePx
    },
    speed() {
      return rate.speed()
    },
  }
}
