// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Where a slice's reference photo sits, and how big it is (`TODO/sketch-003`).
 *
 * This is the **one** place image space meets sketch space:
 *
 * - **image px**: origin at the photo's top-left corner, +x right, **+y down**;
 * - **sketch mm**: the slice's own 2D frame, origin at the sketch origin, **+y up**.
 *
 * A slice's `image` placement says how one maps onto the other: the photo's centre sits
 * at `offsetMm`, turned by `rotationDeg` about it, with each pixel `mmPerPx` millimetres
 * across. A brand-new image is centred on the sketch origin at a provisional
 * 1 px = 0.1 mm, until **Set scale** measures a real length off a ruler in the photo.
 *
 * The placement lives on the slice (`slices[i].image`), which comes from a project file
 * — so {@link placementOf} reads it defensively and answers `null` for anything malformed.
 * A bad placement means "no image on this slice", never a refused sketch: the geometry
 * does not depend on the photo at all.
 *
 * Framework-free and pure.
 *
 * @module sketch/calibration
 */

/** @typedef {[number, number]} Vec2 */
/** @typedef {'mm' | 'cm' | 'in'} LengthUnit */

/** The units **Set scale** offers, in millimetres each. An inch is exactly 25.4 mm. */
export const LENGTH_UNITS = Object.freeze(/** @type {Record<LengthUnit, number>} */ ({ mm: 1, cm: 10, in: 25.4 }))

/** The provisional scale of a photo nobody has calibrated yet. */
export const DEFAULT_MM_PER_PX = 0.1

/** A new image's opacity. */
export const DEFAULT_OPACITY = 0.5

/** A calibration line shorter than this, in image pixels, has no direction to measure. */
const MIN_LINE_PX = 1e-6

/**
 * @typedef {object} Calibration The user's own Set scale input, kept so it can be re-opened.
 * @property {Vec2} aPx The line's first point, in image px.
 * @property {Vec2} bPx Its second point.
 * @property {number} length As typed.
 * @property {LengthUnit} unit As picked.
 */

/**
 * @typedef {object} ImagePlacement A slice's `image` field.
 * @property {string} assetId The `asset.image` record holding the bytes.
 * @property {Vec2} offsetMm Where the photo's centre sits on the slice.
 * @property {number} rotationDeg Counter-clockwise, about the centre.
 * @property {number} opacity 0..1.
 * @property {number} mmPerPx Derived from `calibration` when there is one; stored so a
 *   reader needs no unit logic.
 * @property {Calibration} [calibration] Absent until Set scale has been applied.
 */

/** @typedef {{ widthPx: number, heightPx: number }} ImageSize */

/**
 * A new image's placement: centred on the origin, provisional scale, half opacity.
 *
 * @param {string} assetId
 * @returns {ImagePlacement}
 */
export function defaultPlacement(assetId) {
  return { assetId, offsetMm: [0, 0], rotationDeg: 0, opacity: DEFAULT_OPACITY, mmPerPx: DEFAULT_MM_PER_PX }
}

/**
 * A length in millimetres.
 *
 * @param {number} length
 * @param {LengthUnit} unit
 * @returns {number}
 */
export function lengthToMm(length, unit) {
  return length * LENGTH_UNITS[unit]
}

/**
 * Why a calibration cannot be applied, or `''`.
 *
 * @param {Vec2} aPx
 * @param {Vec2} bPx
 * @param {number} length
 * @param {LengthUnit} unit
 * @returns {string}
 */
export function calibrationProblem(aPx, bPx, length, unit) {
  if (![...aPx, ...bPx].every(Number.isFinite)) return 'Both points must be on the photo'
  if (Math.hypot(bPx[0] - aPx[0], bPx[1] - aPx[1]) <= MIN_LINE_PX) return 'Pick two different points on the ruler'
  if (!(Number.isFinite(length) && length > 0)) return 'The length must be greater than 0'
  if (!Object.hasOwn(LENGTH_UNITS, unit)) return 'Pick a unit: mm, cm or in'
  return ''
}

/**
 * Millimetres per image pixel, from a line of known length. Assumes
 * {@link calibrationProblem} found nothing.
 *
 * @param {Vec2} aPx
 * @param {Vec2} bPx
 * @param {number} length
 * @param {LengthUnit} unit
 * @returns {number}
 */
export function mmPerPxFrom(aPx, bPx, length, unit) {
  return lengthToMm(length, unit) / Math.hypot(bPx[0] - aPx[0], bPx[1] - aPx[1])
}

/**
 * An image pixel's position on the slice, in sketch mm.
 *
 * @param {Pick<ImagePlacement, 'offsetMm' | 'rotationDeg' | 'mmPerPx'>} placement
 * @param {ImageSize} image
 * @param {readonly number[]} px
 * @param {number[]} [out]
 * @returns {number[]}
 */
export function imagePxToSketchMm(placement, image, px, out = [0, 0]) {
  const m = placement.mmPerPx
  // Centre the image, scale, and flip y (px +y is down, mm +y is up).
  const localX = (px[0] - image.widthPx / 2) * m
  const localY = -(px[1] - image.heightPx / 2) * m
  const turn = (placement.rotationDeg * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  out[0] = placement.offsetMm[0] + localX * cos - localY * sin
  out[1] = placement.offsetMm[1] + localX * sin + localY * cos
  return out
}

/**
 * The inverse of {@link imagePxToSketchMm}: a sketch point in image pixels.
 *
 * @param {Pick<ImagePlacement, 'offsetMm' | 'rotationDeg' | 'mmPerPx'>} placement
 * @param {ImageSize} image
 * @param {readonly number[]} pointMm
 * @param {number[]} [out]
 * @returns {number[]}
 */
export function sketchMmToImagePx(placement, image, pointMm, out = [0, 0]) {
  const dx = pointMm[0] - placement.offsetMm[0]
  const dy = pointMm[1] - placement.offsetMm[1]
  const turn = (placement.rotationDeg * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  out[0] = localX / placement.mmPerPx + image.widthPx / 2
  out[1] = -localY / placement.mmPerPx + image.heightPx / 2
  return out
}

/**
 * The placement at a new scale, moved so that `anchorPx` stays exactly where it was on the
 * slice — the ruler stays where the user was looking (the calibration line's first point).
 *
 * @param {ImagePlacement} placement
 * @param {ImageSize} image
 * @param {number} mmPerPx
 * @param {readonly number[]} anchorPx
 * @returns {ImagePlacement}
 */
export function rescaleAbout(placement, image, mmPerPx, anchorPx) {
  const before = imagePxToSketchMm(placement, image, anchorPx)
  const scaled = { ...placement, mmPerPx }
  const drifted = imagePxToSketchMm(scaled, image, anchorPx)
  return { ...scaled, offsetMm: [placement.offsetMm[0] + before[0] - drifted[0], placement.offsetMm[1] + before[1] - drifted[1]] }
}

/**
 * The badge text: `1 px = 0.199 mm`. Three significant figures.
 *
 * @param {number} mmPerPx
 * @returns {string}
 */
export function formatScale(mmPerPx) {
  return `1 px = ${Number(mmPerPx.toPrecision(3))} mm`
}

/**
 * The calibration line's label, as the user typed it: `5 in`.
 *
 * @param {Calibration} calibration
 * @returns {string}
 */
export function formatCalibration(calibration) {
  return `${Number(calibration.length.toPrecision(6))} ${calibration.unit}`
}

// --- reading an untrusted placement ---------------------------------------------------

const ASSET_ID = /^img-[0-9a-f]{16,64}$/

/** @param {unknown} value @returns {value is Vec2} */
function isVec2(value) {
  return Array.isArray(value) && value.length === 2 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

/** @param {unknown} value @returns {value is number} */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * A slice's `image` field, read defensively: a clean copy holding only known fields, or
 * `null` when it is not a usable placement. Never throws.
 *
 * A malformed `calibration` alone is dropped (the image keeps its stored scale) rather than
 * losing the image — the scale is what matters, and it is checked on its own.
 *
 * @param {unknown} value
 * @returns {ImagePlacement | null}
 */
export function placementOf(value) {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    const raw = /** @type {Record<string, unknown>} */ (value)
    if (typeof raw.assetId !== 'string' || !ASSET_ID.test(raw.assetId)) return null
    if (!isVec2(raw.offsetMm) || !isFiniteNumber(raw.rotationDeg)) return null
    if (!isFiniteNumber(raw.opacity) || raw.opacity < 0 || raw.opacity > 1) return null
    if (!isFiniteNumber(raw.mmPerPx) || !(raw.mmPerPx > 0)) return null
    /** @type {ImagePlacement} */
    const placement = {
      assetId: raw.assetId,
      offsetMm: [raw.offsetMm[0], raw.offsetMm[1]],
      rotationDeg: raw.rotationDeg,
      opacity: raw.opacity,
      mmPerPx: raw.mmPerPx,
    }
    const calibration = calibrationOf(raw.calibration)
    if (calibration) placement.calibration = calibration
    return placement
  } catch {
    return null
  }
}

/**
 * @param {unknown} value
 * @returns {Calibration | null}
 */
function calibrationOf(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = /** @type {Record<string, unknown>} */ (value)
  if (!isVec2(raw.aPx) || !isVec2(raw.bPx) || !isFiniteNumber(raw.length)) return null
  const unit = /** @type {LengthUnit} */ (raw.unit)
  if (calibrationProblem(raw.aPx, raw.bPx, raw.length, unit)) return null
  return { aPx: [raw.aPx[0], raw.aPx[1]], bPx: [raw.bPx[0], raw.bPx[1]], length: raw.length, unit }
}
