// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Step sizes for a translate-arm drag (`TODO/ui-065`): which step the distance
 * moved is quantised to — 1 mm with Shift held, otherwise a speed-dependent step
 * on **every** pointer type, mouse included — and the readout's text.
 *
 * The rotate dial's counterpart is `rotateSnap.js`. The speed tracker, the band
 * picker and the hysteresis are shared with it through `dragSteps.js`; only the
 * band table and the unit are the arm's own.
 *
 * ## One number, quantised once
 *
 * `Viewport.vue` computes the raw distance with `translateDeltaMm`, picks a step,
 * snaps it here, and feeds *that* to the preview. The ruler, the readout, the
 * preview mesh, the Inspector's Position field and the committed record all read
 * that one value, so what you see on release is exactly what gets committed.
 *
 * ## Quantise the absolute distance, never accumulate steps
 *
 * The distance is always the pointer's own projection from the start, rounded to
 * the current step, never a running sum of per-event steps: slowing down at the
 * end of a drag ("now let me land on it") converges on the pointer with no extra
 * code. The same reasoning as `ui-064`.
 *
 * Framework-free like the rest of `src/render/`.
 *
 * @module render/translateSnap
 */

import { snapToStep, stepForSpeedIn } from './dragSteps.js'

/**
 * Shift-held step, millimetres, on any pointer. Fixed rather than the grid's
 * spacing (open question (b)): the grid's spacing changes with zoom, and a step
 * that moves is harder to predict.
 */
export const SHIFT_STEP_MM = 1

/**
 * @typedef {object} TranslateSpeedBand
 * @property {number} minPxPerS Speed of the pointer's projection on the arm,
 *   px/s, at which the band begins.
 * @property {number} stepMm The step a drag this fast snaps to.
 */

/**
 * Speed bands for an arm drag, slowest first, on every pointer type. Separate
 * from the rotate dial's angular table because the units differ. The *shape* is
 * fixed by the spec (fine at a crawl, coarse when flung); the edges are
 * tunables, untuned until a real finger and a real mouse have tried them.
 *
 * Measured along the arm only. 40 px/s is a deliberate creep, 300 px/s an
 * ordinary mouse drag, 1000 px/s a fling.
 *
 * @type {readonly TranslateSpeedBand[]}
 */
export const TRANSLATE_SPEED_BANDS = Object.freeze([
  Object.freeze({ minPxPerS: 0, stepMm: 0.1 }),
  Object.freeze({ minPxPerS: 40, stepMm: 1 }),
  Object.freeze({ minPxPerS: 300, stepMm: 5 }),
  Object.freeze({ minPxPerS: 1000, stepMm: 10 }),
])

/** {@link TRANSLATE_SPEED_BANDS} in the shared `dragSteps.js` band shape. */
const BANDS = Object.freeze(
  TRANSLATE_SPEED_BANDS.map((band) => Object.freeze({ minPxPerS: band.minPxPerS, step: band.stepMm })),
)

/** The finest step: what a drag is in before its first speed sample. */
const FINEST_STEP_MM = TRANSLATE_SPEED_BANDS[0].stepMm

/**
 * Round a signed distance to the nearest multiple of `stepMm`. Halves round away
 * from zero, symmetrically; float dust is cleaned off; never `-0`.
 *
 * @param {number} mm
 * @param {number} stepMm `0` (or anything not positive) passes the distance through.
 * @returns {number} Millimetres.
 */
export function snapMm(mm, stepMm) {
  return snapToStep(mm, stepMm)
}

/**
 * The speed band's step for an arm drag moving at `speedPxPerS`, with
 * hysteresis against the step it was already in.
 *
 * @param {number} speedPxPerS Smoothed speed along the arm.
 * @param {number} previousStepMm The current band's step, or `0` on a cold start.
 * @returns {number} One of the {@link TRANSLATE_SPEED_BANDS} steps.
 */
export function translateSpeedStepMm(speedPxPerS, previousStepMm) {
  return stepForSpeedIn(BANDS, speedPxPerS, previousStepMm)
}

/**
 * Which step an arm drag is in right now. Shift always wins, so a fast Shift
 * drag is 1 mm, not 10. Otherwise the speed step, whatever the pointer: unlike
 * the rotate rings, a plain mouse gets it too (open question (a)), which is how
 * a mouse lands on 0.1 mm without a modifier.
 *
 * @param {boolean} shift
 * @param {number} speedStepMm The speed band's step ({@link translateSpeedStepMm}),
 *   or `0` before the first sample.
 * @returns {number} Millimetres, always positive.
 */
export function translateStepMm(shift, speedStepMm) {
  if (shift) return SHIFT_STEP_MM
  return speedStepMm > 0 ? speedStepMm : FINEST_STEP_MM
}

/**
 * The readout's main line: the signed distance to 0.1 mm, e.g. `+12.5 mm`.
 *
 * Zero is `+0.0 mm`, including a tiny negative that rounds to it. ASCII `-`, so
 * the readout parses as a number (the e2e spec reads it back).
 *
 * @param {number} mm
 * @returns {string}
 */
export function formatDistanceMm(mm) {
  const text = mm.toFixed(1)
  if (text === '-0.0' || text === '0.0') return '+0.0 mm'
  return mm > 0 ? `+${text} mm` : `${text} mm`
}

/**
 * The readout's second line: which step is active, or `''` for none.
 *
 * @param {number} stepMm
 * @returns {string}
 */
export function stepLabelMm(stepMm) {
  if (!(stepMm > 0)) return ''
  if (stepMm < 1) return `fine ${stepMm} mm`
  return `${stepMm} mm steps`
}
