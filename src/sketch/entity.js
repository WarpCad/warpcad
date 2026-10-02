/**
 * Segment helpers the sketch editor's drawing gestures share (`TODO/ui-020`, kept by
 * `TODO/sketch-001`).
 *
 * ui-020's loose `LineEntity` and its `sketch.line` record are gone — a sketch is now a
 * `primitive.sketch` body whose outlines live in `./profile.js`. What survives here is
 * the measurement every drag-to-draw tool still needs: how long a drag was, and whether
 * it moved far enough to count. Framework-free, pure functions over plain values.
 *
 * Millimetres in the sketch plane, X then Y; the `Mm` suffix is CLAUDE.md's "a raw
 * number never crosses a module edge without its space being obvious from the name".
 *
 * @module sketch/entity
 */

/** @typedef {[number, number]} Vec2Mm Millimetres in the sketch plane, X then Y. */

/**
 * A segment's length, in millimetres.
 *
 * Deliberately tolerant of the degenerate case rather than guarding against it:
 * a zero-length segment measures `0`, and *refusing to commit* one is the
 * interaction layer's job (see {@link isDegenerate}). A measurement function
 * that threw would push that decision into every caller.
 *
 * @param {readonly number[]} startMm
 * @param {readonly number[]} endMm
 * @returns {number} Millimetres, always ≥ 0.
 */
export function lengthOf(startMm, endMm) {
  return Math.hypot(endMm[0] - startMm[0], endMm[1] - startMm[1])
}

/**
 * Whether a drag never really moved — "a zero-length release commits nothing".
 *
 * Takes an explicit tolerance rather than testing for exact equality, because
 * the caller's two points come from a *pointer*, and a tap on a touch screen
 * always wanders a fraction of a millimetre. The same reasoning, and the same
 * shape, as `Viewport.vue`'s existing `CLICK_SLOP_PX`.
 *
 * @param {readonly number[]} startMm
 * @param {readonly number[]} endMm
 * @param {number} toleranceMm
 * @returns {boolean}
 */
export function isDegenerate(startMm, endMm, toleranceMm) {
  return lengthOf(startMm, endMm) <= toleranceMm
}
