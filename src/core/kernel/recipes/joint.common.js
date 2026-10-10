// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the two joint recipes (`joint.pins.js`, `joint.tongueGroove.js`) share
 * (`TODO/io-007`): building an axis-aligned prism on a cut face, asking whether one solid
 * contains another, and — the expensive part — a **clearance field** over the cut face that
 * says, for each point on a grid, how much solid surrounds it on each side of the cut.
 *
 * ## Why a field, and not "try a pin and boolean it"
 *
 * A pin is only good where it sits in material with a wall of plastic around its socket.
 * Asking that with booleans (intersect a probe cylinder with the half, compare volumes) is
 * exact but costs a full boolean per candidate position, and finding a home for a pin on a
 * face with a hole through it — two 6 mm strips either side of an 8 mm hole — needs a fine
 * search, hundreds of candidates. So the search runs on this field instead: one ray cast
 * (inside or out) and one closest-point query per sample, against a bounding volume hierarchy
 * (`meshQuery.js`), sampled along the cut axis at every grid point, once per split. A
 * candidate passes when every sample along its axis is inside the solid and at least its
 * radius-plus-wall from the surface. Only the winners are then checked with an exact boolean
 * containment ({@link contains}), so the field may be conservative but can never be wrong in
 * the direction that matters.
 *
 * The field is measured on the **uncut** solid. That is deliberate: the cut face itself is a
 * surface of each half, so every sample near it would read "0 mm from the surface" on a half;
 * on the whole solid there is no surface there, and the distance is the real lateral wall.
 *
 * Millimetres, document frame, Z-up. Framework-free.
 *
 * @module core/kernel/recipes/joint.common
 */

import modeling from '@jscad/modeling'

import { TriangleTree, triangleSoup } from '../meshQuery.js'
import { boundsOf, volumeOf } from '../group.js'

const { booleans, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {[number, number, number]} Vec3Mm */

/** Wall of plastic left around a socket or groove, mm — three 0.4 mm perimeters. */
export const JOINT_WALL_MM = 1.2

/** How far a pin or tongue is sunk into its own half, so the union fuses rather than touches. */
export const JOINT_EMBED_MM = 0.5

/** How deep under the face the base of a pin must be solid, mm. */
export const JOINT_BASE_DEPTH_MM = 1

/** Segments for every joint cylinder: fixed, so a joint does not change with the design resolution. */
export const JOINT_SEGMENTS = 32

/** Relative tolerance on a boolean containment check. */
const CONTAIN_TOLERANCE = 1e-4

/**
 * The two axes lying in the cut face, in a fixed order.
 *
 * @param {number} axisIndex
 * @returns {[number, number]}
 */
export function faceAxes(axisIndex) {
  return [(axisIndex + 1) % 3, (axisIndex + 2) % 3]
}

/**
 * A prism along `axisIndex` from `fromMm` to `toMm`, centred at `(uMm, vMm)` on the face:
 * a cylinder of `radiusMm`, or a box of `uSizeMm × vSizeMm`.
 *
 * @param {number} axisIndex
 * @param {number} fromMm
 * @param {number} toMm
 * @param {number} uMm
 * @param {number} vMm
 * @param {{ radiusMm: number } | { uSizeMm: number, vSizeMm: number }} section
 * @returns {Geom3}
 */
export function prismAlong(axisIndex, fromMm, toMm, uMm, vMm, section) {
  const [u, v] = faceAxes(axisIndex)
  /** @type {Vec3Mm} */
  const centre = [0, 0, 0]
  centre[axisIndex] = (fromMm + toMm) / 2
  centre[u] = uMm
  centre[v] = vMm
  const length = toMm - fromMm
  if ('radiusMm' in section) {
    const cylinder = primitives.cylinder({ radius: section.radiusMm, height: length, segments: JOINT_SEGMENTS })
    // `primitives.cylinder` stands along Z; turn it onto the cut axis, then move it.
    const turned =
      axisIndex === 2
        ? cylinder
        : transforms.rotate(axisIndex === 0 ? [0, Math.PI / 2, 0] : [-Math.PI / 2, 0, 0], cylinder)
    return transforms.translate(centre, turned)
  }
  /** @type {Vec3Mm} */
  const size = [0, 0, 0]
  size[axisIndex] = length
  size[u] = section.uSizeMm
  size[v] = section.vSizeMm
  return primitives.cuboid({ size, center: centre })
}

/**
 * Whether `container` wholly contains `probe`, by volume — exact up to the boolean's noise.
 *
 * @param {Geom3} container
 * @param {Geom3} probe
 * @returns {boolean}
 */
export function contains(container, probe) {
  const want = volumeOf(probe)
  if (!(want > 0)) return false
  const got = volumeOf(booleans.intersect(container, probe))
  return got >= want * (1 - CONTAIN_TOLERANCE)
}

/**
 * A slightly skewed ray direction, so an inside test never runs exactly along an edge or a
 * face of an axis-aligned part.
 */
const RAY = (() => {
  const x = 0.5773
  const y = 0.5779
  const z = 0.5768
  const length = Math.hypot(x, y, z)
  return /** @type {Vec3Mm} */ ([x / length, y / length, z / length])
})()

/**
 * @typedef {object} FacePoint
 * @property {number} uMm
 * @property {number} vMm
 * @property {number} baseClearMm Least distance to the surface over the base samples (under
 *   the face, in the first half), `-1` if any is outside the solid.
 * @property {Float64Array} depthClearMm Running least distance beyond the face: entry `k` is
 *   the minimum over every sample from the face to `k` steps past it, `-1` once one is outside.
 */

/**
 * @typedef {object} ClearanceField
 * @property {number} axisIndex
 * @property {number} cutMm
 * @property {number} u
 * @property {number} v
 * @property {[number, number]} uRange The face's extent along `u`, mm.
 * @property {[number, number]} vRange
 * @property {number} stepMm Grid spacing on the face.
 * @property {number} depthStepMm Sample spacing along the axis.
 * @property {number} columns
 * @property {number} rows
 * @property {FacePoint[]} points Row-major, `rows × columns`.
 */

/**
 * Sample how much solid surrounds each point of the cut face.
 *
 * @param {Geom3} solid The **uncut** solid.
 * @param {number} axisIndex
 * @param {number} cutMm
 * @param {{ maxDepthMm: number, maxClearMm: number, maxPoints?: number }} options
 *   `maxDepthMm`: how far past the face to sample; `maxClearMm`: the largest clearance any
 *   caller will ask about (a closest-point query stops looking beyond it).
 * @returns {ClearanceField}
 */
export function clearanceField(solid, axisIndex, cutMm, options) {
  const [u, v] = faceAxes(axisIndex)
  const [min, max] = boundsOf(solid)
  const uRange = /** @type {[number, number]} */ ([min[u], max[u]])
  const vRange = /** @type {[number, number]} */ ([min[v], max[v]])
  const spanU = uRange[1] - uRange[0]
  const spanV = vRange[1] - vRange[0]
  const maxPoints = options.maxPoints ?? 1600
  const stepMm = Math.max(Math.min(spanU, spanV) / 24, Math.sqrt((spanU * spanV) / maxPoints), 0.25)
  const columns = Math.max(1, Math.floor(spanU / stepMm))
  const rows = Math.max(1, Math.floor(spanV / stepMm))
  const depthStepMm = 0.5
  const depthSamples = Math.ceil(options.maxDepthMm / depthStepMm) + 1
  const baseSamples = Math.ceil(JOINT_BASE_DEPTH_MM / depthStepMm) + 1

  const soup = triangleSoup(solid)
  const tree = new TriangleTree(soup)
  const closest = new Float64Array(3)
  const limit = options.maxClearMm + 1

  /** @type {Vec3Mm} */
  const point = [0, 0, 0]
  /** Distance to the surface, or -1 when the point is outside. */
  const clearAt = () => {
    const hit = tree.raycast(point[0], point[1], point[2], RAY[0], RAY[1], RAY[2], 0, Infinity, -1)
    if (hit.triangle < 0) return -1
    const n = hit.triangle * 3
    const facing = soup.normals[n] * RAY[0] + soup.normals[n + 1] * RAY[1] + soup.normals[n + 2] * RAY[2]
    if (!(facing > 0)) return -1
    return tree.closestPoint(point[0], point[1], point[2], limit, closest)
  }

  /** @type {FacePoint[]} */
  const points = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const uMm = uRange[0] + (column + 0.5) * (spanU / columns)
      const vMm = vRange[0] + (row + 0.5) * (spanV / rows)
      point[u] = uMm
      point[v] = vMm
      let baseClearMm = Infinity
      for (let k = 1; k < baseSamples; k += 1) {
        point[axisIndex] = cutMm - Math.min(k * depthStepMm, JOINT_BASE_DEPTH_MM)
        const clear = clearAt()
        if (clear < 0) {
          baseClearMm = -1
          break
        }
        baseClearMm = Math.min(baseClearMm, clear)
      }
      const depthClearMm = new Float64Array(depthSamples)
      let running = Infinity
      for (let k = 0; k < depthSamples; k += 1) {
        if (running >= 0) {
          point[axisIndex] = cutMm + Math.max(k * depthStepMm, 0.05)
          const clear = clearAt()
          running = clear < 0 ? -1 : Math.min(running, clear)
        }
        depthClearMm[k] = running
      }
      points.push({ uMm, vMm, baseClearMm, depthClearMm })
    }
  }
  return { axisIndex, cutMm, u, v, uRange, vRange, stepMm, depthStepMm, columns, rows, points }
}

/**
 * The least clearance from the face to `depthMm` past it at one field point, `-1` if outside.
 *
 * @param {ClearanceField} field
 * @param {FacePoint} point
 * @param {number} depthMm
 * @returns {number}
 */
export function clearanceTo(field, point, depthMm) {
  const k = Math.min(point.depthClearMm.length - 1, Math.ceil(depthMm / field.depthStepMm))
  return point.depthClearMm[k]
}
