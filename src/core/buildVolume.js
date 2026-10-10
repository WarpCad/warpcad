// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The printer's build volume, and whether a part fits in it (`TODO/io-007`).
 *
 * The build volume is **project state**: `{ widthMm, depthMm, heightMm }`, X × Y × Z of the
 * printer's bed and height, kept on the document (`WarpDocument.buildVolume`), written to the
 * project file's state line only when it differs from the default (`src/core/project.js`), and
 * edited in File ▾ → Project settings…. It lives in its own tiny module so the document can
 * depend on it without pulling the exporter in.
 *
 * ## The fit verdict
 *
 * {@link fitVerdict} answers the question the Inspector's badge and the Split sheet ask: does
 * a part of this size fit as placed, fit after turning it onto another face, or not fit at all
 * — and then by how much, in the orientation it is closest to fitting. Only the six
 * axis-aligned orientations are tried (the same six `check_printability` tries): a diagonal
 * placement can fit a part none of them does, and the verdict does not claim otherwise.
 *
 * Framework-free: plain numbers in, plain data out.
 *
 * @module core/buildVolume
 */

/** @typedef {[number, number, number]} Vec3Mm */

/**
 * @typedef {object} BuildVolume
 * @property {number} widthMm Along X.
 * @property {number} depthMm Along Y.
 * @property {number} heightMm Along Z.
 */

/**
 * 220 × 220 × 250 mm — the common hobby-printer size, and the volume the AI's system prompt
 * already assumed before this setting existed (`src/ai/prompt.js`).
 *
 * @type {Readonly<BuildVolume>}
 */
export const DEFAULT_BUILD_VOLUME = Object.freeze({ widthMm: 220, depthMm: 220, heightMm: 250 })

/**
 * The largest edge accepted, mm. Anything above is a typo (or a hostile file), not a printer.
 */
export const MAX_BUILD_EDGE_MM = 10_000

/** @type {ReadonlyArray<keyof BuildVolume>} */
const KEYS = Object.freeze(/** @type {(keyof BuildVolume)[]} */ (['widthMm', 'depthMm', 'heightMm']))

/**
 * Validate a build volume, returning a fresh plain copy. Refuses rather than repairs: a
 * volume of zero or a word where a number belongs is not something to guess at.
 *
 * @param {unknown} value
 * @returns {BuildVolume}
 * @throws {Error} naming the offending field.
 */
export function normalizeBuildVolume(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('build volume must be { widthMm, depthMm, heightMm }, in millimetres')
  }
  const record = /** @type {Record<string, unknown>} */ (value)
  /** @type {Record<string, number>} */
  const out = {}
  for (const key of KEYS) {
    const mm = record[key]
    if (typeof mm !== 'number' || !Number.isFinite(mm) || mm <= 0 || mm > MAX_BUILD_EDGE_MM) {
      throw new Error(
        `build volume ${key} must be a positive number of millimetres up to ${MAX_BUILD_EDGE_MM}, got ${JSON.stringify(mm)}`
      )
    }
    out[key] = mm
  }
  return /** @type {BuildVolume} */ (/** @type {unknown} */ (out))
}

/**
 * @param {BuildVolume} a
 * @param {BuildVolume} b
 * @returns {boolean}
 */
export function sameBuildVolume(a, b) {
  return KEYS.every((key) => a[key] === b[key])
}

/**
 * The volume as an `[x, y, z]` vector — the shape `check_printability` takes.
 *
 * @param {BuildVolume} volume
 * @returns {Vec3Mm}
 */
export function buildVolumeVector(volume) {
  return [volume.widthMm, volume.depthMm, volume.heightMm]
}

const AXES = ['X', 'Y', 'Z']

/** The six axis-aligned ways to stand a box, as placed first — the same table as `check_printability`. */
const ORIENTATIONS = /** @type {const} */ ([
  [0, 1, 2],
  [1, 0, 2],
  [0, 2, 1],
  [2, 0, 1],
  [1, 2, 0],
  [2, 1, 0],
])

/**
 * A length for a label: whole millimetres when it is one, else one decimal.
 *
 * @param {number} mm
 * @returns {string}
 */
function mmLabel(mm) {
  const rounded = Math.round(mm * 10) / 10
  return String(Number.isInteger(rounded) ? rounded : rounded.toFixed(1))
}

/**
 * @typedef {object} FitVerdict
 * @property {'fits' | 'fits-rotated' | 'too-large'} verdict
 * @property {number} overByMm `0` unless `too-large`; then the least any orientation is over by.
 * @property {string} orientation `as placed`, how to turn it, or the closest orientation.
 * @property {string} label The badge's words: `fits`, `fits on its side`, `too large by 84 mm`.
 */

/**
 * Does a part of `sizeMm` fit `volume`?
 *
 * @param {readonly number[]} sizeMm The part's `[x, y, z]` extent, mm.
 * @param {BuildVolume} volume
 * @returns {FitVerdict}
 */
export function fitVerdict(sizeMm, volume) {
  const bed = buildVolumeVector(volume)
  let bestOver = Infinity
  let bestIndex = 0
  for (const [index, order] of ORIENTATIONS.entries()) {
    let over = 0
    for (let axis = 0; axis < 3; axis += 1) over = Math.max(over, sizeMm[order[axis]] - bed[axis])
    if (over <= 1e-9) {
      if (index === 0) return { verdict: 'fits', overByMm: 0, orientation: 'as placed', label: 'fits' }
      const orientation =
        order[2] === 2 ? 'turned 90° on the bed' : `laid on its side, with its ${AXES[order[2]]} axis vertical`
      return {
        verdict: 'fits-rotated',
        overByMm: 0,
        orientation,
        label: order[2] === 2 ? 'fits turned 90°' : `fits with its ${AXES[order[2]]} axis vertical`,
      }
    }
    if (over < bestOver) {
      bestOver = over
      bestIndex = index
    }
  }
  const order = ORIENTATIONS[bestIndex]
  return {
    verdict: 'too-large',
    overByMm: bestOver,
    orientation: bestIndex === 0 ? 'as placed' : `closest with its ${AXES[order[2]]} axis vertical`,
    label: `too large by ${mmLabel(bestOver)} mm`,
  }
}
