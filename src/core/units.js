/**
 * Formatting numbers for display, with their unit attached.
 *
 * CLAUDE.md: "Units and coordinate spaces are explicit. Name every conversion at
 * its boundary ... A raw number never crosses a module edge without its space
 * being obvious from the name." This is the display end of that rule — the one
 * place a millimetre or a degree becomes a string a user reads, so the Inspector
 * panel and the viewport's dimension lines cannot drift into formatting the same
 * quantity two different ways.
 *
 * The rounding is not cosmetic. Every dimension in this app comes out of
 * floating-point geometry, so a 0.3 mm gap really does arrive as
 * `0.30000000000000004`, and printing that next to a solid reads as a bug in the
 * kernel rather than a bug in the formatter.
 *
 * Framework-free, per CLAUDE.md's Project Structure: no Vue, no DOM.
 *
 * @module core/units
 */

/**
 * Decimals kept before a value is considered exact enough to read.
 *
 * Two, not three. A hundredth of a millimetre is already far finer than anything
 * this UI can produce by dragging, and the third decimal cost real legibility:
 * `ui-011`'s acceptance drive found the Inspector's Position fields visibly
 * clipping `-47.788` at phone width, which is worse than useless — a truncated
 * number reads as a *different* number. The stored value is untouched; this is a
 * display width, not a precision decision.
 */
const MM_DECIMALS = 2

/**
 * Round to a fixed number of decimals and drop the trailing zeros, so `40`
 * prints as `40` rather than `40.000` and `12.5` keeps its half.
 *
 * @param {number} value
 * @param {number} decimals
 * @returns {string}
 */
function trim(value, decimals) {
  if (!Number.isFinite(value)) return '—'
  // `Number()` of the fixed string is what removes the trailing zeros; doing it
  // with a regex would mangle an exponent-formatted value.
  const rounded = Number(value.toFixed(decimals))
  // Normalise a rounded-to-nothing negative so no field ever shows "-0".
  return String(rounded === 0 ? 0 : rounded)
}

/**
 * A millimetre length, as a user reads it.
 *
 * @param {number} valueMm
 * @returns {string} e.g. `"40 mm"`, `"12.5 mm"`
 */
export function formatMm(valueMm) {
  return `${trim(valueMm, MM_DECIMALS)} mm`
}

/**
 * A millimetre length with no unit suffix — for a numeric field that already
 * carries its unit in an adjacent label.
 *
 * @param {number} valueMm
 * @returns {string}
 */
export function formatMmValue(valueMm) {
  return trim(valueMm, MM_DECIMALS)
}

/**
 * An angle in degrees. Degrees, not radians, everywhere a human can see it —
 * `src/core/kernel/registry.js` is the single place the conversion happens.
 *
 * @param {number} valueDeg
 * @returns {string} e.g. `"0°"`, `"-90°"`
 */
export function formatDeg(valueDeg) {
  return `${trim(valueDeg, 2)}°`
}
