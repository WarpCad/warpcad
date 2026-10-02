// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Grid line generation — framework-free, no three.js.
 *
 * CLAUDE.md's grid rule: "minor lines at the base grid spacing, major lines at a
 * multiple of it (typically every 5th or 10th), plus enough labeling ... that a
 * user can read real-world size off the grid without opening the inspector."
 * This module owns the line math; the labeling half lives in the scale readout
 * (`chooseScaleBar` in ./camera.js) rendered by `Grid.vue`.
 *
 * The grid lies on the Z = 0 plane, per CLAUDE.md's Z-up convention.
 */

/** Base (minor) spacing in millimetres. */
export const GRID_MINOR_MM = 10
/** Every Nth minor line is drawn as a major line — 5 × 10mm = 50mm. */
export const GRID_MAJOR_EVERY = 5
/** Half-width of the grid, in millimetres (so the grid spans 2× this). */
export const GRID_EXTENT_MM = 500

/**
 * @typedef {object} GridLines
 * @property {Float32Array} minor xyz triples, 2 vertices per line segment
 * @property {Float32Array} major xyz triples, 2 vertices per line segment
 * @property {Float32Array} axisX the Y = 0 line (runs along X)
 * @property {Float32Array} axisY the X = 0 line (runs along Y)
 * @property {number} minorMm
 * @property {number} majorMm
 * @property {number} extentMm
 */

/**
 * Build the grid's line segments.
 *
 * @param {object} [options]
 * @param {number} [options.minorMm] base spacing
 * @param {number} [options.majorEvery] draw every Nth line as major
 * @param {number} [options.extentMm] half-width of the grid
 * @returns {GridLines}
 */
export function buildGridLines(options = {}) {
  const minorMm = options.minorMm ?? GRID_MINOR_MM
  const majorEvery = options.majorEvery ?? GRID_MAJOR_EVERY
  const extentMm = options.extentMm ?? GRID_EXTENT_MM

  if (!(minorMm > 0)) throw new Error(`grid minorMm must be > 0, got ${minorMm}`)
  if (!Number.isInteger(majorEvery) || majorEvery < 1) {
    throw new Error(`grid majorEvery must be a positive integer, got ${majorEvery}`)
  }
  if (!(extentMm > 0)) throw new Error(`grid extentMm must be > 0, got ${extentMm}`)

  const steps = Math.floor(extentMm / minorMm)
  const span = steps * minorMm

  /** @type {number[]} */
  const minor = []
  /** @type {number[]} */
  const major = []

  for (let i = -steps; i <= steps; i += 1) {
    const at = i * minorMm
    // i === 0 is the axis line, drawn separately in its own colour.
    if (i === 0) continue
    const bucket = i % majorEvery === 0 ? major : minor
    // Line parallel to X, at y = at.
    bucket.push(-span, at, 0, span, at, 0)
    // Line parallel to Y, at x = at.
    bucket.push(at, -span, 0, at, span, 0)
  }

  return {
    minor: new Float32Array(minor),
    major: new Float32Array(major),
    axisX: new Float32Array([-span, 0, 0, span, 0, 0]),
    axisY: new Float32Array([0, -span, 0, 0, span, 0]),
    minorMm,
    majorMm: minorMm * majorEvery,
    extentMm: span,
  }
}
