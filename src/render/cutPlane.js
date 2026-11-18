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
 * @property {number} centreU The plane's centre along the face's `u` axis, document mm.
 * @property {number} centreV
 * @property {number} uX The face's `u` axis's screen image at the centre, px per mm.
 * @property {number} uY
 * @property {number} vX The face's `v` axis's screen image at the centre, px per mm.
 * @property {number} vY
 * @property {number[]} homography Eight coefficients `[a b c d e f g h]` of the exact face-to-screen
 *   perspective map (`x = (a·du + b·dv + c) / (g·du + h·dv + 1)`, `y = (d·du + e·dv + f) / (same)`),
 *   `du`/`dv` being millimetres from the face centre. Fitted to the four projected plane corners, so it
 *   is the pinhole projection itself, not the affine tangent at the centre (`TODO/ui-137`).
 * @property {boolean} hasHomography `false` when a corner was behind the camera or the fit was singular.
 */

/** @returns {CutPlaneAnnotation} */
export function createCutPlaneAnnotation() {
  return {
    visible: false,
    points: '',
    handleX: 0,
    handleY: 0,
    axisX: 0,
    axisY: 0,
    centreU: 0,
    centreV: 0,
    uX: 0,
    uY: 0,
    vX: 0,
    vY: 0,
    homography: [1, 0, 0, 0, 1, 0, 0, 0],
    hasHomography: false,
  }
}

const fitRows = Array.from({ length: 8 }, () => new Array(9).fill(0))

/**
 * Solve for the perspective map taking four `(du, dv)` points to four screen points, in place.
 *
 * @param {number[][]} from Four `[du, dv]` pairs.
 * @param {number[][]} to Four `[x, y]` pairs.
 * @param {number[]} out Eight coefficients, mutated.
 * @returns {boolean} `false` when the system is singular (a degenerate quadrilateral).
 */
function fitHomography(from, to, out) {
  for (let i = 0; i < 4; i++) {
    const [du, dv] = from[i]
    const [x, y] = to[i]
    const r1 = fitRows[2 * i]
    const r2 = fitRows[2 * i + 1]
    r1[0] = du; r1[1] = dv; r1[2] = 1; r1[3] = 0; r1[4] = 0; r1[5] = 0; r1[6] = -du * x; r1[7] = -dv * x; r1[8] = x
    r2[0] = 0; r2[1] = 0; r2[2] = 0; r2[3] = du; r2[4] = dv; r2[5] = 1; r2[6] = -du * y; r2[7] = -dv * y; r2[8] = y
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let r = col + 1; r < 8; r++) if (Math.abs(fitRows[r][col]) > Math.abs(fitRows[pivot][col])) pivot = r
    if (!(Math.abs(fitRows[pivot][col]) > 1e-12)) return false
    const swap = fitRows[col]
    fitRows[col] = fitRows[pivot]
    fitRows[pivot] = swap
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const k = fitRows[r][col] / fitRows[col][col]
      if (k !== 0) for (let c = col; c < 9; c++) fitRows[r][c] -= k * fitRows[col][c]
    }
  }
  for (let i = 0; i < 8; i++) out[i] = fitRows[i][8] / fitRows[i][i]
  return true
}

const fitFrom = [[0, 0], [0, 0], [0, 0], [0, 0]]
const fitTo = [[0, 0], [0, 0], [0, 0], [0, 0]]

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
  const cu0 = (min[u] + max[u]) / 2
  const cv0 = (min[v] + max[v]) / 2
  let cornerIndex = 0
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
    fitFrom[cornerIndex][0] = cu - cu0
    fitFrom[cornerIndex][1] = cv - cv0
    fitTo[cornerIndex][0] = corner.x
    fitTo[cornerIndex][1] = corner.y
    cornerIndex++
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
  // The face's own two axes, for the Place connectors markers (`TODO/ui-067`): the same
  // two-points-1-mm-apart measure, so a marker sits where the plane's own centre says it does.
  out.centreU = (min[u] + max[u]) / 2
  out.centreV = (min[v] + max[v]) / 2
  scratch[axisIndex] = cutMm
  scratch[u] = out.centreU + 1
  scratch[v] = out.centreV
  worldToScreen(orbit, scratch[0], scratch[1], scratch[2], widthPx, heightPx, ahead)
  out.uX = ahead.visible ? ahead.x - centre.x : 0
  out.uY = ahead.visible ? ahead.y - centre.y : 0
  scratch[u] = out.centreU
  scratch[v] = out.centreV + 1
  worldToScreen(orbit, scratch[0], scratch[1], scratch[2], widthPx, heightPx, ahead)
  out.vX = ahead.visible ? ahead.x - centre.x : 0
  out.vY = ahead.visible ? ahead.y - centre.y : 0
  out.hasHomography = fitHomography(fitFrom, fitTo, out.homography)
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

/**
 * The least `|sin|` between the face's two screen axes for markers to be placed: below it the
 * camera is looking along the face and a pixel is many millimetres.
 */
export const FACE_VIEW_MIN_SIN = 0.2

/**
 * The determinant of the face's screen basis (px² per mm²), signed.
 *
 * @param {CutPlaneAnnotation} a
 */
function faceDeterminant(a) {
  return a.uX * a.vY - a.uY * a.vX
}

/**
 * Whether the camera sees the cut face well enough to place or drag a connector on it.
 *
 * @param {CutPlaneAnnotation} annotation
 * @returns {boolean}
 */
export function faceViewIsUsable(annotation) {
  const lengths = Math.hypot(annotation.uX, annotation.uY) * Math.hypot(annotation.vX, annotation.vY)
  return lengths > 1e-9 && Math.abs(faceDeterminant(annotation)) / lengths >= FACE_VIEW_MIN_SIN
}

/**
 * A face position as a point on screen: the exact perspective map when the plane's four corners
 * were all in front of the camera, otherwise the affine map at the plane's centre.
 *
 * @param {CutPlaneAnnotation} annotation
 * @param {number} uMm
 * @param {number} vMm
 * @param {{ x: number, y: number }} out Mutated in place.
 * @returns {{ x: number, y: number }} `out`.
 */
export function faceToScreen(annotation, uMm, vMm, out) {
  const du = uMm - annotation.centreU
  const dv = vMm - annotation.centreV
  if (annotation.hasHomography) {
    const [a, b, c, d, e, f, g, h] = annotation.homography
    const w = g * du + h * dv + 1
    if (w > 1e-9) {
      out.x = (a * du + b * dv + c) / w
      out.y = (d * du + e * dv + f) / w
      return out
    }
  }
  out.x = annotation.handleX + du * annotation.uX + dv * annotation.vX
  out.y = annotation.handleY + du * annotation.uY + dv * annotation.vY
  return out
}

/**
 * A screen point as a face position — the inverse of {@link faceToScreen}.
 *
 * @param {CutPlaneAnnotation} annotation
 * @param {number} x CSS px in the overlay's own frame.
 * @param {number} y
 * @param {{ uMm: number, vMm: number }} out Mutated in place.
 * @returns {{ uMm: number, vMm: number } | null} `out`, or `null` when the face is seen edge-on.
 */
export function screenToFace(annotation, x, y, out) {
  if (annotation.hasHomography) {
    // Invert x(g du + h dv + 1) = a du + b dv + c and the same for y: a 2x2 linear system in (du, dv).
    const [a, b, c, d, e, f, g, h] = annotation.homography
    const m00 = a - g * x
    const m01 = b - h * x
    const m10 = d - g * y
    const m11 = e - h * y
    const det = m00 * m11 - m01 * m10
    if (!(Math.abs(det) > 1e-12)) return null
    const r0 = x - c
    const r1 = y - f
    out.uMm = annotation.centreU + (r0 * m11 - r1 * m01) / det
    out.vMm = annotation.centreV + (m00 * r1 - m10 * r0) / det
    return out
  }
  const det = faceDeterminant(annotation)
  if (!(Math.abs(det) > 1e-9)) return null
  const dx = x - annotation.handleX
  const dy = y - annotation.handleY
  out.uMm = annotation.centreU + (dx * annotation.vY - dy * annotation.vX) / det
  out.vMm = annotation.centreV + (dy * annotation.uX - dx * annotation.uY) / det
  return out
}
