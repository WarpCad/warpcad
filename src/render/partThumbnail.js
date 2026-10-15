// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A My parts row's thumbnail (`TODO/ui-055`): the part's **real geometry**, drawn small, so a
 * row says what it will drop before it is dragged. It is not three.js and not a second
 * renderer — a flat-shaded painter's-algorithm picture of the solid's faces from one fixed
 * three-quarter view, onto a 2D canvas, once, at save time. The result is a small PNG data
 * URL stored beside the definition (`storage/userLibrary.js`), so a row costs nothing to draw
 * afterwards and no kernel work runs when the Library opens.
 *
 * {@link projectThumbnail} is pure (testable in Node); only {@link renderPartThumbnail}
 * touches a canvas, and it returns `null` rather than throwing where there is none — a row
 * without a thumbnail falls back to the generic swatch.
 *
 * @module render/partThumbnail
 */

import modeling from '@jscad/modeling'

import { isGroup } from '../core/kernel/group.js'
import { THUMBNAIL_PNG_PATTERN, isThumbnailUrl } from '../core/userPartFile.js'

export { THUMBNAIL_PNG_PATTERN }

const { geom3 } = modeling.geometries

/** @typedef {readonly (readonly number[])[]} PolygonVertices One face: `[x, y, z]` per vertex. */
/**
 * @typedef {object} ThumbnailFace
 * @property {number[]} points `x0, y0, x1, y1, …` in picture pixels.
 * @property {number} shade 0..1, how lit the face is.
 * @property {number} depth Larger is nearer the viewer.
 */

/** Faces beyond this are drawn every n-th: a thumbnail is 96 px wide, not a render. */
const MAX_FACES = 40_000
/** Direction from the part toward the viewer, Z up: front-right and above. */
const TO_VIEWER = normalize([1, -1, 0.8])
const LIGHT = normalize([0.45, -0.6, 1])
const MARGIN_RATIO = 0.07

/**
 * @param {readonly number[]} v
 * @returns {[number, number, number]}
 */
function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

/**
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {[number, number, number]}
 */
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** @param {readonly number[]} a @param {readonly number[]} b */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const RIGHT = normalize(cross([0, 0, 1], TO_VIEWER))
const UP = normalize(cross(TO_VIEWER, RIGHT))

/**
 * Every face of a kernel value: a bare solid's, or all the **visible** parts' of a group.
 *
 * @param {any} geometry
 * @returns {PolygonVertices[]}
 */
export function partPolygons(geometry) {
  /** @type {PolygonVertices[]} */
  const faces = []
  /** @param {any} solid */
  const addSolid = (solid) => {
    if (solid === null || typeof solid !== 'object' || !Array.isArray(solid.polygons)) return
    for (const polygon of geom3.toPolygons(solid)) faces.push(polygon.vertices)
  }
  if (isGroup(geometry)) {
    for (const name of geometry.names) addSolid(geometry.parts[name])
  } else {
    addSolid(geometry)
  }
  return faces
}

/**
 * Project faces into a `size`×`size` picture, back faces dropped, far faces first. Scaled and
 * centred to fill the picture, so a 2 mm washer and a 200 mm bracket are equally legible.
 *
 * @param {readonly PolygonVertices[]} polygons
 * @param {number} size Picture width and height, pixels.
 * @param {number} [maxFaces] Draw every n-th face beyond this many (default {@link MAX_FACES}).
 * @returns {ThumbnailFace[]}
 */
export function projectThumbnail(polygons, size, maxFaces = MAX_FACES) {
  const stride = Math.max(1, Math.ceil(polygons.length / maxFaces))
  /** @type {{ xy: number[], shade: number, depth: number }[]} */
  const faces = []
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let index = 0; index < polygons.length; index += stride) {
    const vertices = polygons[index]
    if (vertices.length < 3) continue
    // Newell's method: robust for any planar polygon, including a concave one.
    let nx = 0
    let ny = 0
    let nz = 0
    for (let i = 0; i < vertices.length; i += 1) {
      const a = vertices[i]
      const b = vertices[(i + 1) % vertices.length]
      nx += (a[1] - b[1]) * (a[2] + b[2])
      ny += (a[2] - b[2]) * (a[0] + b[0])
      nz += (a[0] - b[0]) * (a[1] + b[1])
    }
    const normal = normalize([nx, ny, nz])
    if (dot(normal, TO_VIEWER) <= 0) continue
    const xy = []
    let depth = 0
    for (const vertex of vertices) {
      const x = dot(vertex, RIGHT)
      const y = dot(vertex, UP)
      xy.push(x, y)
      depth += dot(vertex, TO_VIEWER)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    faces.push({ xy, shade: 0.3 + 0.7 * Math.max(0, dot(normal, LIGHT)), depth: depth / vertices.length })
  }
  if (faces.length === 0) return []

  const margin = size * MARGIN_RATIO
  const extent = Math.max(maxX - minX, maxY - minY) || 1
  const scale = (size - 2 * margin) / extent
  const offsetX = (size - (maxX - minX) * scale) / 2 - minX * scale
  const offsetY = (size - (maxY - minY) * scale) / 2 + maxY * scale
  faces.sort((a, b) => a.depth - b.depth)
  return faces.map((face) => {
    const points = new Array(face.xy.length)
    for (let i = 0; i < face.xy.length; i += 2) {
      points[i] = face.xy[i] * scale + offsetX
      points[i + 1] = offsetY - face.xy[i + 1] * scale
    }
    return { points, shade: face.shade, depth: face.depth }
  })
}

/**
 * Draw a kernel value as a PNG data URL, or `null` when there is nothing to draw or nothing
 * to draw on (no DOM, a canvas without a 2D context, an unexpectedly large result).
 *
 * @param {any} geometry A body's evaluated geometry.
 * @param {{ size?: number, maxFaces?: number, document?: Pick<Document, 'createElement'> | null }} [options]
 *   `maxFaces` lowers the face budget for a part that is a dense mesh (an imported scan), so
 *   drawing it does not hold the main thread for a frame.
 * @returns {string | null}
 */
export function renderPartThumbnail(geometry, { size = 96, maxFaces = MAX_FACES, document: doc = globalThis.document ?? null } = {}) {
  try {
    if (doc === null || doc === undefined) return null
    const faces = projectThumbnail(partPolygons(geometry), size, maxFaces)
    if (faces.length === 0) return null
    const canvas = /** @type {HTMLCanvasElement} */ (doc.createElement('canvas'))
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) return null
    context.clearRect(0, 0, size, size)
    context.lineJoin = 'round'
    context.lineWidth = 0.7
    for (const face of faces) {
      const level = Math.round(70 + 150 * face.shade)
      const fill = `rgb(${Math.round(level * 0.78)}, ${Math.round(level * 0.9)}, ${level})`
      context.fillStyle = fill
      context.strokeStyle = fill
      context.beginPath()
      context.moveTo(face.points[0], face.points[1])
      for (let i = 2; i < face.points.length; i += 2) context.lineTo(face.points[i], face.points[i + 1])
      context.closePath()
      context.fill()
      context.stroke()
    }
    const url = canvas.toDataURL('image/png')
    return isThumbnailUrl(url) ? url : null
  } catch {
    return null
  }
}
