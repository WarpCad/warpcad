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

const { booleans, geometries, primitives, transforms } = modeling

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
 * A prism along `axisIndex` from `fromMm` to `toMm` whose section is a convex `outline`,
 * given as `(du, dv)` offsets from `(uMm, vMm)`, counter-clockwise seen from the axis's
 * positive end (`TODO/core-059`: the wedge's trapezoid). `(u, v, axis)` is always a
 * right-handed frame ({@link faceAxes} is a cyclic shift), so counter-clockwise in `(u, v)`
 * gives outward faces on every axis. Built from its polygons, so a trapezoid keeps its exact
 * area — nothing is faceted.
 *
 * @param {number} axisIndex
 * @param {number} fromMm
 * @param {number} toMm
 * @param {number} uMm
 * @param {number} vMm
 * @param {[number, number][]} outline
 * @param {number[][]} [pieces] For a **non-convex** outline (`TODO/core-075`: the butterfly's
 *   bowtie), the outline's corner indices split into convex pieces, each counter-clockwise; the
 *   caps are built from them, the sides from the outline. Left out, the outline is one convex cap.
 * @returns {Geom3}
 */
export function outlinePrismAlong(axisIndex, fromMm, toMm, uMm, vMm, outline, pieces) {
  if (outline.length < 3) throw new Error(`a prism outline needs at least three corners, got ${outline.length}`)
  if (!(toMm > fromMm)) throw new Error(`a prism needs a positive length along its axis, got ${fromMm} to ${toMm} mm`)
  const [u, v] = faceAxes(axisIndex)
  /** @param {[number, number]} corner @param {number} alongMm @returns {Vec3Mm} */
  const at = ([du, dv], alongMm) => {
    /** @type {Vec3Mm} */
    const point = [0, 0, 0]
    point[u] = uMm + du
    point[v] = vMm + dv
    point[axisIndex] = alongMm
    return point
  }
  const bottom = outline.map((corner) => at(corner, fromMm))
  const top = outline.map((corner) => at(corner, toMm))
  /** @type {Vec3Mm[][]} */
  const faces =
    pieces === undefined
      ? [[...bottom].reverse(), top]
      : pieces.flatMap((piece) => [piece.map((i) => bottom[i]).reverse(), piece.map((i) => top[i])])
  for (let i = 0; i < outline.length; i += 1) {
    const j = (i + 1) % outline.length
    faces.push([bottom[i], bottom[j], top[j], top[i]])
  }
  return geometries.geom3.create(faces.map((vertices) => geometries.poly3.create(vertices)))
}

/**
 * A trapezoid on the face: `wideMm` across at one end, `narrowMm` at the other, `lengthMm`
 * between them (`TODO/core-059`'s wedge; `TODO/core-075`'s butterfly wings).
 *
 * @typedef {{ wideMm: number, narrowMm: number, lengthMm: number }} Trapezoid
 */

/**
 * A trapezoid grown by `byMm` square to every side (a mitred offset), which is again a
 * trapezoid with the same slope: its ends move out by `byMm`, its slanted sides by `byMm`
 * along their own normals. Lifted out of `joint.wedge.js` unchanged (`TODO/core-075`), which
 * re-exports it.
 *
 * @param {Trapezoid} trapezoid
 * @param {number} byMm
 * @returns {Trapezoid}
 */
export function offsetTrapezoid({ wideMm, narrowMm, lengthMm }, byMm) {
  if (!(byMm >= 0)) throw new Error(`a trapezoid offset must be zero or more, got ${byMm}`)
  if (!(lengthMm > 0)) throw new Error(`a trapezoid needs a positive length, got ${lengthMm}`)
  // Half-width change per millimetre along, from the wide end to the narrow.
  const slope = (narrowMm - wideMm) / (2 * lengthMm)
  const sideGrowth = byMm * Math.hypot(1, slope)
  return {
    wideMm: wideMm + 2 * (sideGrowth - slope * byMm),
    narrowMm: narrowMm + 2 * (sideGrowth + slope * byMm),
    lengthMm: lengthMm + 2 * byMm,
  }
}

/**
 * A trapezoid's outline about its centre, counter-clockwise in `(u, v)`, running along `u` or
 * `v` with its wide end at the low end.
 *
 * @param {Trapezoid} trapezoid
 * @param {boolean} alongU
 * @returns {[number, number][]}
 */
export function trapezoidOutline({ wideMm, narrowMm, lengthMm }, alongU) {
  const half = lengthMm / 2
  /** @type {[number, number][]} along, across */
  const corners = [
    [-half, -wideMm / 2],
    [half, -narrowMm / 2],
    [half, narrowMm / 2],
    [-half, wideMm / 2],
  ]
  // Along v is a quarter turn, which keeps the winding.
  return alongU ? corners : corners.map(([along, across]) => [-across, along])
}

/**
 * The **grown pocket** outline (`TODO/core-075`): a counter-clockwise polygon — convex or
 * not — grown by `byMm` square to every side, a mitred offset. Each side's line moves out by
 * `byMm` along its own outward normal and consecutive lines are intersected, so the gap
 * between a key and its pocket is `byMm` everywhere, on a slanted side as on a square one,
 * and a reflex corner (a butterfly's waist) moves out by the same rule. On a trapezoid it is
 * exactly {@link offsetTrapezoid}.
 *
 * @param {[number, number][]} outline Counter-clockwise, no two consecutive sides parallel.
 * @param {number} byMm
 * @returns {[number, number][]}
 */
export function offsetOutline(outline, byMm) {
  if (!(byMm >= 0)) throw new Error(`an outline offset must be zero or more, got ${byMm}`)
  const n = outline.length
  if (byMm === 0) return outline.map(([u, v]) => /** @type {[number, number]} */ ([u, v]))
  const lines = outline.map(([pu, pv], i) => {
    const [qu, qv] = outline[(i + 1) % n]
    const du = qu - pu
    const dv = qv - pv
    const length = Math.hypot(du, dv)
    // Counter-clockwise: outward is to the right of the direction of travel.
    return { pu: pu + (dv / length) * byMm, pv: pv - (du / length) * byMm, du, dv }
  })
  return outline.map((_, i) => {
    const a = lines[(i + n - 1) % n]
    const b = lines[i]
    const det = a.du * b.dv - a.dv * b.du
    if (Math.abs(det) < 1e-12) return /** @type {[number, number]} */ ([b.pu, b.pv])
    const t = ((b.pu - a.pu) * b.dv - (b.pv - a.pv) * b.du) / det
    return /** @type {[number, number]} */ ([a.pu + a.du * t, a.pv + a.dv * t])
  })
}

/**
 * **Clip to the uncut solid** (`TODO/core-075`): a joint feature that deliberately reaches the
 * outer surface — a butterfly key — is its nominal shape intersected with the solid, so on a
 * curved surface its top follows the surface exactly. Containment ({@link contains}) cannot be
 * its check; only the part meant to be enclosed (a pocket's floor) still needs a wall.
 *
 * @param {Geom3} solid The **uncut** solid.
 * @param {Geom3} nominal
 * @returns {Geom3}
 */
export function clipToSolid(solid, nominal) {
  return booleans.intersect(solid, nominal)
}

/**
 * One edge of the cut face's outline, in face millimetres `(u, v)` (`TODO/core-075`).
 *
 * @typedef {object} OutlineSegment
 * @property {[number, number]} a
 * @property {[number, number]} b
 * @property {[number, number]} normal Unit, in the face, pointing out of the solid.
 */

/** Distance from the plane under which a vertex counts as on it, mm. */
const ON_PLANE_MM = 1e-7

/**
 * The cut face's outline: where the solid's surface crosses the plane `axis = cutMm`, as edges
 * in the face's `(u, v)` frame with their outward normals (`TODO/core-075`) — what a butterfly
 * tap snaps to and what the butterfly search walks along. A polygon that crosses the plane gives
 * one edge; one that touches it along an edge gives that edge only from the side below the
 * plane, so an edge is never counted twice.
 *
 * @param {Geom3} solid
 * @param {number} axisIndex
 * @param {number} cutMm
 * @returns {{ u: number, v: number, segments: OutlineSegment[] }}
 */
export function sectionOutline(solid, axisIndex, cutMm) {
  const [u, v] = faceAxes(axisIndex)
  /** @type {OutlineSegment[]} */
  const segments = []
  for (const polygon of geometries.geom3.toPolygons(solid)) {
    const { vertices } = polygon
    const d = vertices.map((vertex) => vertex[axisIndex] - cutMm)
    const above = d.some((value) => value > ON_PLANE_MM)
    const below = d.some((value) => value < -ON_PLANE_MM)
    if (!below || (!above && d.filter((value) => Math.abs(value) <= ON_PLANE_MM).length < 2)) continue
    /** @type {[number, number][]} */
    const points = []
    for (let i = 0; i < vertices.length; i += 1) {
      const j = (i + 1) % vertices.length
      const p = vertices[i]
      const q = vertices[j]
      if (Math.abs(d[i]) <= ON_PLANE_MM) points.push([p[u], p[v]])
      else if (Math.abs(d[j]) > ON_PLANE_MM && d[i] * d[j] < 0) {
        const t = d[i] / (d[i] - d[j])
        points.push([p[u] + (q[u] - p[u]) * t, p[v] + (q[v] - p[v]) * t])
      }
    }
    if (points.length < 2) continue
    const [a, b] = points
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) continue
    const plane = geometries.poly3.plane(polygon)
    const length = Math.hypot(plane[u], plane[v])
    if (!(length > 1e-9)) continue
    segments.push({ a, b, normal: [plane[u] / length, plane[v] / length] })
  }
  return { u, v, segments }
}

/**
 * Where one connector's socket-plus-wall sits on the cut face (`TODO/core-059`), for telling
 * whether two connectors would share a wall. A circle for a pin or a screw boss; the bounding
 * rectangle of a tongue's or a wedge's outline, which for a wedge is conservative (it can only
 * call two connectors overlapping that are a little apart, never the other way).
 *
 * @typedef {{ shape: 'circle', uMm: number, vMm: number, radiusMm: number }
 *   | { shape: 'rect', uMm: number, vMm: number, halfUMm: number, halfVMm: number }} Footprint
 */

/** Slack on a footprint comparison, mm: walls exactly touching are apart, as the search's own pairs are. */
const FOOTPRINT_SLACK_MM = 1e-9

/**
 * Whether two footprints overlap. Touching is not overlapping.
 *
 * @param {Footprint} a
 * @param {Footprint} b
 * @returns {boolean}
 */
export function footprintsOverlap(a, b) {
  if (a.shape === 'circle' && b.shape === 'circle') {
    if (a.uMm === b.uMm && a.vMm === b.vMm) return true
    return Math.hypot(a.uMm - b.uMm, a.vMm - b.vMm) < a.radiusMm + b.radiusMm - FOOTPRINT_SLACK_MM
  }
  if (a.shape === 'rect' && b.shape === 'rect') {
    return (
      Math.abs(a.uMm - b.uMm) < a.halfUMm + b.halfUMm - FOOTPRINT_SLACK_MM &&
      Math.abs(a.vMm - b.vMm) < a.halfVMm + b.halfVMm - FOOTPRINT_SLACK_MM
    )
  }
  const circle = a.shape === 'circle' ? a : /** @type {Extract<Footprint, { shape: 'circle' }>} */ (b)
  const rect = a.shape === 'rect' ? a : /** @type {Extract<Footprint, { shape: 'rect' }>} */ (b)
  // The rectangle's nearest point to the circle's centre.
  const du = Math.max(Math.abs(circle.uMm - rect.uMm) - rect.halfUMm, 0)
  const dv = Math.max(Math.abs(circle.vMm - rect.vMm) - rect.halfVMm, 0)
  if (du === 0 && dv === 0) return true
  return Math.hypot(du, dv) < circle.radiusMm - FOOTPRINT_SLACK_MM
}

/**
 * The field point nearest `(uMm, vMm)` on the face — `null` off the field's grid.
 *
 * @param {ClearanceField} field
 * @param {number} uMm
 * @param {number} vMm
 * @returns {FacePoint | null}
 */
export function nearestFieldPoint(field, uMm, vMm) {
  const { uRange, vRange, columns, rows, points } = field
  if (uMm < uRange[0] || uMm > uRange[1] || vMm < vRange[0] || vMm > vRange[1]) return null
  const column = Math.min(columns - 1, Math.max(0, Math.floor(((uMm - uRange[0]) / (uRange[1] - uRange[0])) * columns)))
  const row = Math.min(rows - 1, Math.max(0, Math.floor(((vMm - vRange[0]) / (vRange[1] - vRange[0])) * rows)))
  return points[row * columns + column] ?? null
}

/**
 * Whether the field says the face is solid at `(uMm, vMm)` on both sides of the cut — the
 * same samples the joint searches filter on, read at the nearest grid point. Used to explain
 * a hand placement {@link contains} has already refused: "there is no material there" reads
 * better than "its wall would break out" when the placement sits on a hole.
 *
 * @param {ClearanceField} field
 * @param {number} uMm
 * @param {number} vMm
 * @returns {boolean}
 */
export function solidAt(field, uMm, vMm) {
  const point = nearestFieldPoint(field, uMm, vMm)
  return point !== null && point.baseClearMm >= 0 && clearanceTo(field, point, 0) >= 0
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
 * @property {Float64Array} [belowClearMm] The same running least distance, sampled **under**
 *   the face into piece A (`TODO/core-075`: a loose dowel's socket needs a wall in both
 *   pieces). Present only when the field was built with `maxBelowMm`.
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
 * @param {{ maxDepthMm: number, maxClearMm: number, maxPoints?: number, maxBelowMm?: number }} options
 *   `maxDepthMm`: how far past the face to sample; `maxClearMm`: the largest clearance any
 *   caller will ask about (a closest-point query stops looking beyond it); `maxBelowMm`: how
 *   far under the face to sample as well (`TODO/core-075`), left out for none — the field
 *   every search before it used, unchanged.
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
  const belowSamples = options.maxBelowMm === undefined ? 0 : Math.ceil(options.maxBelowMm / depthStepMm) + 1

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
      /** @type {FacePoint} */
      const sampled = { uMm, vMm, baseClearMm, depthClearMm }
      if (belowSamples > 0) {
        const belowClearMm = new Float64Array(belowSamples)
        let below = Infinity
        for (let k = 0; k < belowSamples; k += 1) {
          if (below >= 0) {
            point[axisIndex] = cutMm - Math.max(k * depthStepMm, 0.05)
            const clear = clearAt()
            below = clear < 0 ? -1 : Math.min(below, clear)
          }
          belowClearMm[k] = below
        }
        sampled.belowClearMm = belowClearMm
      }
      points.push(sampled)
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

/**
 * The least clearance from the face to `depthMm` **under** it at one field point
 * (`TODO/core-075`), `-1` if outside — or `-1` when the field was not sampled below the face.
 *
 * @param {ClearanceField} field
 * @param {FacePoint} point
 * @param {number} depthMm
 * @returns {number}
 */
export function clearanceBelow(field, point, depthMm) {
  const below = point.belowClearMm
  if (below === undefined) return -1
  const k = Math.min(below.length - 1, Math.ceil(depthMm / field.depthStepMm))
  return below[k]
}
