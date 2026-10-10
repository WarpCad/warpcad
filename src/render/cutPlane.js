// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Split sheet's cut-plane preview, in screen space (`TODO/io-007`).
 *
 * The plane is drawn as a translucent SVG quadrilateral over the canvas, not as a WebGL mesh:
 * it is a screen-constant overlay that has to track the camera every frame and carry a
 * draggable handle, which is exactly what `annotate.js`'s gizmo and dimension lines already do
 * this way. Its four corners are the body's bounding box cross-section at the cut, padded by
 * a tenth so the plane reads as larger than the body it slices, projected with the same
 * {@link worldToScreen} the gizmo uses.
 *
 * The handle sits at the plane's centre. Dragging it moves the plane along the cut axis by the
 * pointer travel projected onto the axis's own screen image — `axisX`/`axisY` are that image
 * in **pixels per millimetre**, measured at the plane's centre (two projected points 1 mm
 * apart), so perspective is honoured and a drag across the axis moves nothing.
 *
 * Allocation: {@link createCutPlaneAnnotation} allocates once; {@link updateCutPlaneAnnotation}
 * writes into it and builds one short `points` string per frame while a sheet is open, which
 * is the same budget the dimension lines spend.
 *
 * @module render/cutPlane
 */

import { createScreenPoint, worldToScreen } from './annotate.js'

/** @typedef {import('./camera.js').OrbitCamera} OrbitCamera */
/** @typedef {[[number, number, number], [number, number, number]]} BoundsMm */

/**
 * @typedef {object} CutPlaneAnnotation
 * @property {boolean} visible
 * @property {string} points SVG `points` for the quadrilateral, `"x,y x,y x,y x,y"`.
 * @property {number} handleX The plane's centre on screen, CSS px.
 * @property {number} handleY
 * @property {number} axisX The cut axis's screen image at the centre, px per mm.
 * @property {number} axisY
 */

/** @returns {CutPlaneAnnotation} */
export function createCutPlaneAnnotation() {
  return { visible: false, points: '', handleX: 0, handleY: 0, axisX: 0, axisY: 0 }
}

/** How far past the body the plane extends, as a fraction of the body's size. */
const PAD = 0.1

const corner = createScreenPoint()
const centre = createScreenPoint()
const ahead = createScreenPoint()
/** @type {[number, number, number]} */
const scratch = [0, 0, 0]

/**
 * Project the cut plane for this frame.
 *
 * @param {OrbitCamera} orbit
 * @param {BoundsMm | null} boundsMm The body's world bounding box; `null` hides the plane.
 * @param {number} axisIndex 0, 1 or 2.
 * @param {number} cutMm The plane's position along that axis, world mm.
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {CutPlaneAnnotation} out Mutated in place.
 * @returns {CutPlaneAnnotation} `out`.
 */
export function updateCutPlaneAnnotation(orbit, boundsMm, axisIndex, cutMm, widthPx, heightPx, out) {
  if (!boundsMm || !Number.isFinite(cutMm)) {
    out.visible = false
    return out
  }
  const [min, max] = boundsMm
  const u = (axisIndex + 1) % 3
  const v = (axisIndex + 2) % 3
  const padU = (max[u] - min[u]) * PAD
  const padV = (max[v] - min[v]) * PAD
  const corners = [
    [min[u] - padU, min[v] - padV],
    [max[u] + padU, min[v] - padV],
    [max[u] + padU, max[v] + padV],
    [min[u] - padU, max[v] + padV],
  ]
  let points = ''
  for (const [cu, cv] of corners) {
    scratch[axisIndex] = cutMm
    scratch[u] = cu
    scratch[v] = cv
    worldToScreen(orbit, scratch[0], scratch[1], scratch[2], widthPx, heightPx, corner)
    if (!corner.visible) {
      out.visible = false
      return out
    }
    points += `${points === '' ? '' : ' '}${corner.x.toFixed(1)},${corner.y.toFixed(1)}`
  }
  scratch[axisIndex] = cutMm
  scratch[u] = (min[u] + max[u]) / 2
  scratch[v] = (min[v] + max[v]) / 2
  worldToScreen(orbit, scratch[0], scratch[1], scratch[2], widthPx, heightPx, centre)
  scratch[axisIndex] = cutMm + 1
  worldToScreen(orbit, scratch[0], scratch[1], scratch[2], widthPx, heightPx, ahead)
  out.visible = centre.visible
  out.points = points
  out.handleX = centre.x
  out.handleY = centre.y
  out.axisX = ahead.visible ? ahead.x - centre.x : 0
  out.axisY = ahead.visible ? ahead.y - centre.y : 0
  return out
}

/**
 * Millimetres along the cut axis for a handle drag of `(dxPx, dyPx)`.
 *
 * @param {CutPlaneAnnotation} annotation As last updated.
 * @param {number} dxPx Pointer travel since the drag began.
 * @param {number} dyPx
 * @returns {number} Signed mm; `0` when the axis points at the camera.
 */
export function cutPlaneDragDeltaMm(annotation, dxPx, dyPx) {
  const squared = annotation.axisX * annotation.axisX + annotation.axisY * annotation.axisY
  if (!(squared > 1e-6)) return 0
  return (dxPx * annotation.axisX + dyPx * annotation.axisY) / squared
}
