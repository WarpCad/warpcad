// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Draft edits for a slice's reference photo (`TODO/sketch-003`) — pure, like
 * `./profile.js`'s: each returns a new params object and never mutates its input, so the
 * editor's Cancel still throws everything away and Done is still one undo step.
 *
 * @module sketch/referenceImage
 */

import { calibrationProblem, imagePxToSketchMm, mmPerPxFrom, placementOf, rescaleAbout } from './calibration.js'

/** @typedef {import('./profile.js').SketchParams} SketchParams */
/** @typedef {import('./profile.js').Slice} Slice */
/** @typedef {import('./profile.js').Profile} Profile */
/** @typedef {import('./calibration.js').ImagePlacement} ImagePlacement */
/** @typedef {import('./calibration.js').Calibration} Calibration */
/** @typedef {import('./calibration.js').ImageSize} ImageSize */

/**
 * A slice's image placement, read defensively (`null` when it has none, or a malformed one).
 *
 * @param {Slice | undefined} slice
 * @returns {ImagePlacement | null}
 */
export function sliceImageOf(slice) {
  return slice?.image === undefined ? null : placementOf(slice.image)
}

/**
 * Set (or, with `null`, remove) one slice's image placement.
 *
 * @param {SketchParams} params
 * @param {number} sliceIndex
 * @param {ImagePlacement | null} placement
 * @returns {SketchParams}
 */
export function withSliceImage(params, sliceIndex, placement) {
  if (!params.slices[sliceIndex]) throw new Error(`sketch: there is no slice ${sliceIndex + 1}`)
  return {
    ...params,
    slices: params.slices.map((slice, index) => {
      if (index !== sliceIndex) return slice
      const { image: _old, ...rest } = slice
      return placement === null ? rest : { ...rest, image: JSON.parse(JSON.stringify(placement)) }
    }),
  }
}

/**
 * Scale an outline uniformly about a point — what a Set scale applied after tracing does
 * to the outlines already on the slice.
 *
 * @param {Profile} profile
 * @param {number} factor
 * @param {readonly number[]} anchorMm
 * @returns {Profile}
 */
export function scaleProfileAbout(profile, factor, anchorMm) {
  /** @param {readonly number[]} point @returns {[number, number]} */
  const move = (point) => [anchorMm[0] + (point[0] - anchorMm[0]) * factor, anchorMm[1] + (point[1] - anchorMm[1]) * factor]
  if (profile.kind === 'polyline') return { ...profile, pointsMm: profile.pointsMm.map(move) }
  if (profile.kind === 'rect') {
    return { ...profile, centerMm: move(profile.centerMm), widthMm: profile.widthMm * factor, heightMm: profile.heightMm * factor }
  }
  return { ...profile, centerMm: move(profile.centerMm), radiusMm: profile.radiusMm * factor }
}

/**
 * **Set scale → Apply**: the slice's image takes the scale the line measures, rescaled
 * about the line's first point (the ruler stays where the user was looking), with the
 * user's own points, length and unit kept so Set scale can be reopened. With
 * `rescaleOutlines`, the slice's outlines scale about the same point by the same ratio —
 * the user traced first and calibrated second.
 *
 * @param {SketchParams} params
 * @param {number} sliceIndex
 * @param {ImageSize} size The image's pixel size.
 * @param {Calibration} calibration
 * @param {boolean} rescaleOutlines
 * @returns {SketchParams}
 * @throws {Error} With the sentence to show, when the slice has no image or the line or
 *   length is unusable.
 */
export function applyCalibration(params, sliceIndex, size, calibration, rescaleOutlines) {
  const slice = params.slices[sliceIndex]
  const placement = sliceImageOf(slice)
  if (!placement) throw new Error('Add an image to this slice first')
  const problem = calibrationProblem(calibration.aPx, calibration.bPx, calibration.length, calibration.unit)
  if (problem) throw new Error(problem)
  const mmPerPx = mmPerPxFrom(calibration.aPx, calibration.bPx, calibration.length, calibration.unit)
  const next = { ...rescaleAbout(placement, size, mmPerPx, calibration.aPx), calibration: JSON.parse(JSON.stringify(calibration)) }
  const withImage = withSliceImage(params, sliceIndex, next)
  if (!rescaleOutlines || slice.profiles.length === 0) return withImage
  const anchorMm = imagePxToSketchMm(placement, size, calibration.aPx)
  const factor = mmPerPx / placement.mmPerPx
  return {
    ...withImage,
    slices: withImage.slices.map((entry, index) =>
      index === sliceIndex ? { ...entry, profiles: entry.profiles.map((profile) => scaleProfileAbout(profile, factor, anchorMm)) } : entry,
    ),
  }
}
