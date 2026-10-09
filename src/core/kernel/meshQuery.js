// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Spatial queries over a solid's surface (`TODO/ai-007`): the triangle soup and bounding
 * volume hierarchy that wall-thickness sampling and body-to-body clearance both stand on.
 *
 * Neither question has an answer in `@jscad/modeling`: it measures volume, area, bounds and
 * centre of mass, but it cannot say how far a ray travels inside a solid or how close two
 * surfaces come. Both reduce to "which triangle is nearest along this ray / to this point",
 * which a flat scan answers in O(triangles) per query. A 100-slice lofted wing is about 8,000
 * triangles and the thickness check asks a few thousand rays, so the scan would be tens of
 * millions of triangle tests on the main thread; the hierarchy below makes each query
 * logarithmic. Measured in `bench/results/2026-10-09-ai-007.md`.
 *
 * Everything is held in flat typed arrays, built once per query batch and dropped after it:
 * nothing here is cached against a body, because the analysis tools run once per model call,
 * not once per frame.
 *
 * Millimetres throughout, in the solid's world frame (its lazy transforms applied, as
 * `geom3.toPolygons` returns them). Framework-free and DOM-free.
 *
 * @module core/kernel/meshQuery
 */

import modeling from '@jscad/modeling'

const { geometries } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {[number, number, number]} Vec3Mm */

/** Triangles per leaf. Small enough that a leaf test is cheap, large enough to keep the tree shallow. */
const LEAF_SIZE = 4

/**
 * A solid's surface as triangles, with one outward unit normal per triangle.
 *
 * @typedef {object} TriangleSoup
 * @property {number} count
 * @property {Float64Array} positions `count × 9`: three corners per triangle.
 * @property {Float64Array} normals `count × 3`, outward, unit length.
 * @property {Float64Array} areas `count`, mm².
 */

/**
 * Fan-triangulate a solid's polygons. `@jscad/modeling` polygons are convex and planar, so a
 * fan from the first corner is exact. Zero-area triangles are dropped: they have no normal and
 * would only ever be hit edge-on.
 *
 * @param {Geom3} solid
 * @returns {TriangleSoup}
 */
export function triangleSoup(solid) {
  const polygons = geometries.geom3.toPolygons(solid)
  let capacity = 0
  for (const polygon of polygons) capacity += Math.max(0, polygon.vertices.length - 2)
  const positions = new Float64Array(capacity * 9)
  const normals = new Float64Array(capacity * 3)
  const areas = new Float64Array(capacity)
  let count = 0
  for (const polygon of polygons) {
    const vertices = polygon.vertices
    const a = vertices[0]
    for (let corner = 1; corner + 1 < vertices.length; corner += 1) {
      const b = vertices[corner]
      const c = vertices[corner + 1]
      const ux = b[0] - a[0]
      const uy = b[1] - a[1]
      const uz = b[2] - a[2]
      const vx = c[0] - a[0]
      const vy = c[1] - a[1]
      const vz = c[2] - a[2]
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      const twiceArea = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (!(twiceArea > 1e-12)) continue
      const p = count * 9
      positions[p] = a[0]
      positions[p + 1] = a[1]
      positions[p + 2] = a[2]
      positions[p + 3] = b[0]
      positions[p + 4] = b[1]
      positions[p + 5] = b[2]
      positions[p + 6] = c[0]
      positions[p + 7] = c[1]
      positions[p + 8] = c[2]
      normals[count * 3] = nx / twiceArea
      normals[count * 3 + 1] = ny / twiceArea
      normals[count * 3 + 2] = nz / twiceArea
      areas[count] = twiceArea / 2
      count += 1
    }
  }
  return {
    count,
    positions: positions.subarray(0, count * 9),
    normals: normals.subarray(0, count * 3),
    areas: areas.subarray(0, count),
  }
}

/**
 * A bounding volume hierarchy over a {@link TriangleSoup}: median split on the longest axis
 * of the centroids' box, flat arrays, no recursion at query time.
 */
export class TriangleTree {
  /** @param {TriangleSoup} soup */
  constructor(soup) {
    this.soup = soup
    const count = soup.count
    /** Triangle indices, reordered so every node owns a contiguous run. */
    this.order = new Int32Array(count)
    for (let index = 0; index < count; index += 1) this.order[index] = index
    const centroids = new Float64Array(count * 3)
    const p = soup.positions
    for (let index = 0; index < count; index += 1) {
      const o = index * 9
      centroids[index * 3] = (p[o] + p[o + 3] + p[o + 6]) / 3
      centroids[index * 3 + 1] = (p[o + 1] + p[o + 4] + p[o + 7]) / 3
      centroids[index * 3 + 2] = (p[o + 2] + p[o + 5] + p[o + 8]) / 3
    }
    // A median split can leave leaves of two, so a binary tree over `count` triangles has at
    // most `2 × count - 1` nodes; never fewer slots than that.
    const maxNodes = Math.max(1, 2 * count)
    /** Per node: minX, minY, minZ, maxX, maxY, maxZ. */
    this.boxes = new Float64Array(maxNodes * 6)
    /** Per node: first triangle (in `order`), or -1 for an inner node. */
    this.start = new Int32Array(maxNodes)
    /** Per node: triangle count for a leaf; the right child's index for an inner node (left is node + 1). */
    this.extent = new Int32Array(maxNodes)
    this.nodes = 0
    if (count > 0) this.build(0, count, centroids)
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {Float64Array} centroids
   * @returns {number} The node built.
   */
  build(from, to, centroids) {
    const node = this.nodes
    this.nodes += 1
    const p = this.soup.positions
    const box = this.boxes
    const b = node * 6
    box[b] = box[b + 1] = box[b + 2] = Infinity
    box[b + 3] = box[b + 4] = box[b + 5] = -Infinity
    let cMinX = Infinity
    let cMinY = Infinity
    let cMinZ = Infinity
    let cMaxX = -Infinity
    let cMaxY = -Infinity
    let cMaxZ = -Infinity
    for (let slot = from; slot < to; slot += 1) {
      const triangle = this.order[slot]
      const o = triangle * 9
      for (let corner = 0; corner < 9; corner += 3) {
        for (let axis = 0; axis < 3; axis += 1) {
          const value = p[o + corner + axis]
          if (value < box[b + axis]) box[b + axis] = value
          if (value > box[b + 3 + axis]) box[b + 3 + axis] = value
        }
      }
      const cx = centroids[triangle * 3]
      const cy = centroids[triangle * 3 + 1]
      const cz = centroids[triangle * 3 + 2]
      if (cx < cMinX) cMinX = cx
      if (cy < cMinY) cMinY = cy
      if (cz < cMinZ) cMinZ = cz
      if (cx > cMaxX) cMaxX = cx
      if (cy > cMaxY) cMaxY = cy
      if (cz > cMaxZ) cMaxZ = cz
    }
    if (to - from <= LEAF_SIZE) {
      this.start[node] = from
      this.extent[node] = to - from
      return node
    }
    const spanX = cMaxX - cMinX
    const spanY = cMaxY - cMinY
    const spanZ = cMaxZ - cMinZ
    const axis = spanX >= spanY && spanX >= spanZ ? 0 : spanY >= spanZ ? 1 : 2
    // Sort this run by centroid on the chosen axis and split at the median. A full sort of a
    // subarray is O(n log n) per level, which is fine at the sizes this sees.
    const run = Array.from(this.order.subarray(from, to))
    run.sort((left, right) => centroids[left * 3 + axis] - centroids[right * 3 + axis])
    this.order.set(run, from)
    const middle = (from + to) >> 1
    this.start[node] = -1
    this.build(from, middle, centroids)
    this.extent[node] = this.build(middle, to, centroids)
    return node
  }

  /**
   * The nearest triangle a ray crosses at a distance in `(tMin, tMax)`.
   *
   * @param {number} ox
   * @param {number} oy
   * @param {number} oz
   * @param {number} dx Unit direction.
   * @param {number} dy
   * @param {number} dz
   * @param {number} tMin
   * @param {number} tMax
   * @param {number} skip A triangle never to report (the one the ray starts on), or -1.
   * @returns {{ t: number, triangle: number }} `triangle: -1` when nothing is hit.
   */
  raycast(ox, oy, oz, dx, dy, dz, tMin, tMax, skip) {
    let bestT = tMax
    let best = -1
    if (this.nodes === 0) return { t: Infinity, triangle: -1 }
    const ix = 1 / dx
    const iy = 1 / dy
    const iz = 1 / dz
    const stack = [0]
    const p = this.soup.positions
    while (stack.length > 0) {
      const node = /** @type {number} */ (stack.pop())
      const b = node * 6
      if (!rayHitsBox(this.boxes, b, ox, oy, oz, ix, iy, iz, tMin, bestT)) continue
      if (this.start[node] >= 0) {
        const end = this.start[node] + this.extent[node]
        for (let slot = this.start[node]; slot < end; slot += 1) {
          const triangle = this.order[slot]
          if (triangle === skip) continue
          const t = rayTriangle(p, triangle * 9, ox, oy, oz, dx, dy, dz)
          if (t > tMin && t < bestT) {
            bestT = t
            best = triangle
          }
        }
      } else {
        stack.push(this.extent[node], node + 1)
      }
    }
    return { t: best === -1 ? Infinity : bestT, triangle: best }
  }

  /**
   * The closest point on the surface to a point, if it is nearer than `limit`.
   *
   * @param {number} px
   * @param {number} py
   * @param {number} pz
   * @param {number} limit
   * @param {Float64Array} out Written with the closest point when one is found.
   * @returns {number} The distance, or `limit` when nothing is nearer.
   */
  closestPoint(px, py, pz, limit, out) {
    let best = limit
    if (this.nodes === 0) return best
    const stack = [0]
    const p = this.soup.positions
    const scratch = new Float64Array(3)
    while (stack.length > 0) {
      const node = /** @type {number} */ (stack.pop())
      if (boxDistance(this.boxes, node * 6, px, py, pz) >= best) continue
      if (this.start[node] >= 0) {
        const end = this.start[node] + this.extent[node]
        for (let slot = this.start[node]; slot < end; slot += 1) {
          const d = closestOnTriangle(p, this.order[slot] * 9, px, py, pz, scratch)
          if (d < best) {
            best = d
            out[0] = scratch[0]
            out[1] = scratch[1]
            out[2] = scratch[2]
          }
        }
      } else {
        // Nearer child last, so it is popped first and tightens `best` sooner.
        const left = node + 1
        const right = this.extent[node]
        const dl = boxDistance(this.boxes, left * 6, px, py, pz)
        const dr = boxDistance(this.boxes, right * 6, px, py, pz)
        if (dl < dr) stack.push(right, left)
        else stack.push(left, right)
      }
    }
    return best
  }
}

/**
 * Slab test.
 *
 * @param {Float64Array} boxes
 * @param {number} b
 * @param {number} ox
 * @param {number} oy
 * @param {number} oz
 * @param {number} ix Reciprocal direction.
 * @param {number} iy
 * @param {number} iz
 * @param {number} tMin
 * @param {number} tMax
 * @returns {boolean}
 */
function rayHitsBox(boxes, b, ox, oy, oz, ix, iy, iz, tMin, tMax) {
  let t0 = tMin
  let t1 = tMax
  let near = (boxes[b] - ox) * ix
  let far = (boxes[b + 3] - ox) * ix
  if (near > far) [near, far] = [far, near]
  // NaN (a zero direction component with the origin on a slab plane) must not reject.
  if (near > t0) t0 = near
  if (far < t1) t1 = far
  if (t0 > t1) return false
  near = (boxes[b + 1] - oy) * iy
  far = (boxes[b + 4] - oy) * iy
  if (near > far) [near, far] = [far, near]
  if (near > t0) t0 = near
  if (far < t1) t1 = far
  if (t0 > t1) return false
  near = (boxes[b + 2] - oz) * iz
  far = (boxes[b + 5] - oz) * iz
  if (near > far) [near, far] = [far, near]
  if (near > t0) t0 = near
  if (far < t1) t1 = far
  return t0 <= t1
}

/**
 * Möller–Trumbore, double-sided.
 *
 * @param {Float64Array} p
 * @param {number} o
 * @param {number} ox
 * @param {number} oy
 * @param {number} oz
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @returns {number} Distance along the ray, or `Infinity` for a miss.
 */
function rayTriangle(p, o, ox, oy, oz, dx, dy, dz) {
  const e1x = p[o + 3] - p[o]
  const e1y = p[o + 4] - p[o + 1]
  const e1z = p[o + 5] - p[o + 2]
  const e2x = p[o + 6] - p[o]
  const e2y = p[o + 7] - p[o + 1]
  const e2z = p[o + 8] - p[o + 2]
  const hx = dy * e2z - dz * e2y
  const hy = dz * e2x - dx * e2z
  const hz = dx * e2y - dy * e2x
  const det = e1x * hx + e1y * hy + e1z * hz
  if (det > -1e-14 && det < 1e-14) return Infinity
  const inv = 1 / det
  const sx = ox - p[o]
  const sy = oy - p[o + 1]
  const sz = oz - p[o + 2]
  const u = (sx * hx + sy * hy + sz * hz) * inv
  if (u < -1e-9 || u > 1 + 1e-9) return Infinity
  const qx = sy * e1z - sz * e1y
  const qy = sz * e1x - sx * e1z
  const qz = sx * e1y - sy * e1x
  const v = (dx * qx + dy * qy + dz * qz) * inv
  if (v < -1e-9 || u + v > 1 + 1e-9) return Infinity
  return (e2x * qx + e2y * qy + e2z * qz) * inv
}

/**
 * @param {Float64Array} boxes
 * @param {number} b
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @returns {number} Distance from the point to the box (0 inside).
 */
function boxDistance(boxes, b, px, py, pz) {
  const dx = px < boxes[b] ? boxes[b] - px : px > boxes[b + 3] ? px - boxes[b + 3] : 0
  const dy = py < boxes[b + 1] ? boxes[b + 1] - py : py > boxes[b + 4] ? py - boxes[b + 4] : 0
  const dz = pz < boxes[b + 2] ? boxes[b + 2] - pz : pz > boxes[b + 5] ? pz - boxes[b + 5] : 0
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Closest point on a triangle to a point (Ericson, *Real-Time Collision Detection*, 5.1.5).
 *
 * @param {Float64Array} p
 * @param {number} o
 * @param {number} px
 * @param {number} py
 * @param {number} pz
 * @param {Float64Array} out
 * @returns {number} The distance.
 */
function closestOnTriangle(p, o, px, py, pz, out) {
  const ax = p[o]
  const ay = p[o + 1]
  const az = p[o + 2]
  const abx = p[o + 3] - ax
  const aby = p[o + 4] - ay
  const abz = p[o + 5] - az
  const acx = p[o + 6] - ax
  const acy = p[o + 7] - ay
  const acz = p[o + 8] - az
  const apx = px - ax
  const apy = py - ay
  const apz = pz - az
  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  /** @param {number} u @param {number} v */
  const at = (u, v) => {
    out[0] = ax + abx * u + acx * v
    out[1] = ay + aby * u + acy * v
    out[2] = az + abz * u + acz * v
    const ex = px - out[0]
    const ey = py - out[1]
    const ez = pz - out[2]
    return Math.sqrt(ex * ex + ey * ey + ez * ez)
  }
  if (d1 <= 0 && d2 <= 0) return at(0, 0)
  const bpx = px - p[o + 3]
  const bpy = py - p[o + 4]
  const bpz = pz - p[o + 5]
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) return at(1, 0)
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return at(d1 / (d1 - d3), 0)
  const cpx = px - p[o + 6]
  const cpy = py - p[o + 7]
  const cpz = pz - p[o + 8]
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) return at(0, 1)
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return at(0, d2 / (d2 - d6))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6))
    return at(1 - w, w)
  }
  const denom = 1 / (va + vb + vc)
  return at(vb * denom, vc * denom)
}
