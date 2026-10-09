// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Measuring a body's geometry — the one implementation, on either side of the worker
 * (`TODO/core-029`).
 *
 * The UI reads two measurements off every body after every mutation: its world-axis
 * box (`BodySummary.center`/`bounds` — the Objects list, viewport framing, the scene
 * list's `data-body-*` attributes) and its volume (`data-body-volume`, the one signal
 * that proves a rim fillet removed material, `TODO/ui-027`). `core-029` measured that
 * reading them was the single largest piece of kernel work on the main thread: both
 * went through `toGeom3`, which for a composite body is a `booleans.union` of every
 * part — 97-144 ms per mutation on `perf-001`'s 24-body scene, even for a drag-place of
 * one Cube, because every *unchanged* body was re-unioned on every refresh.
 *
 * Two fixes, because the two measurements are different kinds of question:
 *
 * - **A box needs no union** — see `boundsOf` in `./group.js`, which now measures a
 *   hole-free group's visible parts directly. Cheap enough to stay synchronous.
 * - **A volume does**: overlapping parts are counted once only after a union. So
 *   {@link measureGeometry} is what the evaluation worker runs
 *   (`./evaluationJob.js`), and it is also exactly what the no-worker fallback runs on
 *   the main thread — one function, so the worker's answer and the fallback's cannot
 *   drift apart (the failure `io-004`/`io-005` were about, for export).
 *
 * The cache is keyed by the **geometry object**. Every kernel value in this project is
 * immutable — a move, an edit or a re-fold produces a new object — so identity is
 * exactly "this body has not changed", and an unchanged body is never measured twice.
 * A `WeakMap`, so a body that leaves the document takes its entry with it.
 *
 * ## What the assistant measures (`TODO/ai-007`)
 *
 * The AI's `measure`, `check_printability` and `check_clearance` tools read the same body
 * geometry, through the functions below, so the model's numbers and the UI's never come from
 * two implementations:
 *
 * - {@link analyseGeometry} adds surface area and centre of mass to {@link measureGeometry}'s
 *   bounds and volume (the same union, so a group's overlapping parts count once).
 * - {@link wallThickness} samples the surface and casts each sample's ray inward along its
 *   normal; the distance to where the ray leaves the solid is the local wall. Sampling, so it
 *   is a heuristic: a feature narrower than the sample spacing can be missed, and the tools say
 *   so. The ray work stands on `./meshQuery.js`'s hierarchy.
 * - {@link minimumDistance} and {@link overlapVolume} answer "do these two bodies clear each
 *   other, and by how much". The overlap is an exact kernel intersection; the gap is
 *   vertex-to-surface both ways, which is exact whenever the closest approach touches a
 *   vertex (faces, corners, every pair of faceted curves) and can over-read by up to an
 *   edge's sagitta when two edges cross at the closest point.
 *
 * These run synchronously, where the tool registry calls them (its header says why). Their
 * cost on a 100-slice wing is measured in `bench/results/2026-10-09-ai-007.md`.
 *
 * Framework-free and DOM-free (CLAUDE.md, Project Structure).
 *
 * @module core/kernel/measure
 */

import modeling from '@jscad/modeling'

import { boundsOf, toGeom3, volumeOf } from './group.js'
import { TriangleTree, triangleSoup } from './meshQuery.js'

const { booleans, measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('./group.js').Group} Group */
/** @typedef {import('./group.js').BoundsMm} BoundsMm */

/**
 * @typedef {object} Measurement
 * @property {BoundsMm} bounds World-axis-aligned `[min, max]`, millimetres.
 * @property {number} volumeMm3 Cubic millimetres; overlapping parts counted once.
 */

/** @type {WeakMap<object, Measurement>} */
const cache = new WeakMap()

/**
 * Measure one body's geometry. Runs a kernel union for a composite (its volume needs
 * one), so on the main thread it is the *fallback*, not the normal path.
 *
 * @param {Geom3 | Group} geometry
 * @returns {Measurement}
 */
export function measureGeometry(geometry) {
  return { bounds: boundsOf(geometry), volumeMm3: volumeOf(geometry) }
}

/**
 * @param {Geom3 | Group} geometry
 * @returns {Measurement | undefined} What this exact geometry object measured, if known.
 */
export function cachedMeasurementOf(geometry) {
  return cache.get(geometry)
}

/**
 * Record a measurement for a geometry object — from the worker, or from the fallback.
 *
 * @param {Geom3 | Group} geometry
 * @param {Measurement} measurement
 */
export function rememberMeasurement(geometry, measurement) {
  cache.set(geometry, measurement)
}

/** @typedef {[number, number, number]} Vec3Mm */

/**
 * @typedef {Measurement & { surfaceAreaMm2: number, centerOfMassMm: Vec3Mm }} Analysis
 */

/**
 * Everything the assistant's `measure` tool reports for one body.
 *
 * @param {Geom3 | Group} geometry
 * @returns {Analysis}
 */
export function analyseGeometry(geometry) {
  const solid = toGeom3(geometry)
  const volumeMm3 = measurements.measureVolume(solid)
  const surfaceAreaMm2 = measurements.measureArea(solid)
  const center = volumeMm3 > 0 ? measurements.measureCenterOfMass(solid) : [0, 0, 0]
  return {
    bounds: boundsOf(geometry),
    volumeMm3,
    surfaceAreaMm2,
    centerOfMassMm: [finite(center[0]), finite(center[1]), finite(center[2])],
  }
}

/**
 * Several bodies measured as one solid: their union, so where they overlap is counted once.
 *
 * @param {readonly (Geom3 | Group)[]} geometries At least one.
 * @returns {Analysis}
 */
export function analyseTogether(geometries) {
  if (geometries.length === 1) return analyseGeometry(geometries[0])
  return analyseGeometry(booleans.union(geometries.map(toGeom3)))
}

/** @param {number} value @returns {number} */
function finite(value) {
  return Number.isFinite(value) ? value + 0 : 0
}

/**
 * One thin spot.
 *
 * @typedef {object} ThinSpot
 * @property {number} thicknessMm
 * @property {Vec3Mm} atMm The surface point the ray started from.
 * @property {Vec3Mm} normal Its outward normal.
 */

/**
 * @typedef {object} WallThickness
 * @property {number | null} minMm The thinnest wall any sample found; `null` with no samples.
 * @property {Vec3Mm | null} minAtMm Where.
 * @property {number} samples How many rays were cast.
 * @property {ThinSpot[]} thin Spots under `belowMm`, thinnest first, one per neighbourhood.
 */

/** The R2 low-discrepancy sequence's two constants (1/φ₂, 1/φ₂²). */
const R2_A = 0.7548776662466927
const R2_B = 0.5698402909980532

/**
 * The thinnest wall, by sampling: each sample casts a ray from the surface inward along the
 * reversed normal, and the distance to the face where it leaves the solid is the wall there.
 *
 * Samples are spread by area — every triangle gets its centroid, and the rest of the budget is
 * shared in proportion to area on an R2 low-discrepancy pattern — so a small sliver is sampled
 * as well as a large face, and the answer is deterministic.
 *
 * @param {Geom3 | Group} geometry
 * @param {object} [options]
 * @param {number} [options.maxSamples] Ray budget; default 4000.
 * @param {number} [options.belowMm] Report spots thinner than this in `thin`.
 * @param {number} [options.limit] At most this many spots in `thin`; default 5.
 * @returns {WallThickness}
 */
export function wallThickness(geometry, options = {}) {
  const maxSamples = options.maxSamples ?? 4000
  const belowMm = options.belowMm ?? 0
  const limit = options.limit ?? 5
  const soup = triangleSoup(toGeom3(geometry))
  if (soup.count === 0) return { minMm: null, minAtMm: null, samples: 0, thin: [] }
  const tree = new TriangleTree(soup)
  const { positions: p, normals: n, areas } = soup

  let totalArea = 0
  for (let index = 0; index < soup.count; index += 1) totalArea += areas[index]
  // A hair inside the surface, relative to the part's size, so a ray never re-hits its own face.
  const [bmin, bmax] = boundsOf(geometry)
  const diagonal = Math.hypot(bmax[0] - bmin[0], bmax[1] - bmin[1], bmax[2] - bmin[2])
  const tMin = Math.max(1e-9, diagonal * 1e-9)

  /** @type {{ t: number, x: number, y: number, z: number, triangle: number }[]} */
  const found = []
  let samples = 0
  let k = 0
  const perTriangleFloor = soup.count <= maxSamples ? 1 : 0
  const extraBudget = Math.max(0, maxSamples - perTriangleFloor * soup.count)
  let carry = 0
  for (let triangle = 0; triangle < soup.count; triangle += 1) {
    const share = extraBudget * (areas[triangle] / totalArea) + carry
    const extra = Math.floor(share)
    carry = share - extra
    const count = perTriangleFloor + extra
    const o = triangle * 9
    const nx = n[triangle * 3]
    const ny = n[triangle * 3 + 1]
    const nz = n[triangle * 3 + 2]
    for (let sample = 0; sample < count; sample += 1) {
      let u
      let v
      if (sample === 0 && perTriangleFloor === 1) {
        u = 1 / 3
        v = 1 / 3
      } else {
        k += 1
        u = (k * R2_A) % 1
        v = (k * R2_B) % 1
        if (u + v > 1) {
          u = 1 - u
          v = 1 - v
        }
      }
      const w = 1 - u - v
      const x = p[o] * w + p[o + 3] * u + p[o + 6] * v
      const y = p[o + 1] * w + p[o + 4] * u + p[o + 7] * v
      const z = p[o + 2] * w + p[o + 5] * u + p[o + 8] * v
      samples += 1
      const hit = tree.raycast(x, y, z, -nx, -ny, -nz, tMin, Infinity, triangle)
      if (hit.triangle === -1) continue
      // The first face crossed from inside must be one the ray leaves through; an entering
      // face means the surface is inconsistent here (open, or inverted), and says nothing
      // about a wall.
      const exits = -(nx * n[hit.triangle * 3] + ny * n[hit.triangle * 3 + 1] + nz * n[hit.triangle * 3 + 2]) > 0
      if (!exits) continue
      found.push({ t: hit.t, x, y, z, triangle })
    }
  }
  if (found.length === 0) return { minMm: null, minAtMm: null, samples, thin: [] }
  found.sort((left, right) => left.t - right.t)
  const thinnest = found[0]

  /** @type {ThinSpot[]} */
  const thin = []
  // One report per neighbourhood: a thin trailing edge is one problem, not two hundred.
  const separation = Math.max(belowMm * 4, diagonal * 0.05)
  for (const spot of found) {
    if (spot.t >= belowMm || thin.length >= limit) break
    if (thin.some((other) => Math.hypot(other.atMm[0] - spot.x, other.atMm[1] - spot.y, other.atMm[2] - spot.z) < separation)) continue
    thin.push({
      thicknessMm: spot.t,
      atMm: [spot.x, spot.y, spot.z],
      normal: [n[spot.triangle * 3], n[spot.triangle * 3 + 1], n[spot.triangle * 3 + 2]],
    })
  }
  return { minMm: thinnest.t, minAtMm: [thinnest.x, thinnest.y, thinnest.z], samples, thin }
}

/**
 * @typedef {object} Clearance
 * @property {number | null} distanceMm The smallest gap found; `null` when either is empty.
 * @property {Vec3Mm} onAMm The closest point on the first body.
 * @property {Vec3Mm} onBMm The closest point on the second.
 */

/**
 * The smallest gap between two bodies' surfaces: every vertex of each against the other's
 * surface. See the module comment for when that is exact. Bodies that interpenetrate are
 * {@link overlapVolume}'s question; this one assumes they do not.
 *
 * @param {Geom3 | Group} a
 * @param {Geom3 | Group} b
 * @returns {Clearance}
 */
export function minimumDistance(a, b) {
  const soupA = triangleSoup(toGeom3(a))
  const soupB = triangleSoup(toGeom3(b))
  /** @type {Clearance} */
  const result = { distanceMm: null, onAMm: [0, 0, 0], onBMm: [0, 0, 0] }
  if (soupA.count === 0 || soupB.count === 0) return result
  const treeA = new TriangleTree(soupA)
  const treeB = new TriangleTree(soupB)
  let best = Infinity
  const point = new Float64Array(3)
  /**
   * @param {TriangleSoup} from
   * @param {TriangleTree} against
   * @param {boolean} fromIsA
   */
  const sweep = (from, against, fromIsA) => {
    const p = from.positions
    for (let index = 0; index < p.length; index += 3) {
      const d = against.closestPoint(p[index], p[index + 1], p[index + 2], best, point)
      if (d < best) {
        best = d
        const vertex = /** @type {Vec3Mm} */ ([p[index], p[index + 1], p[index + 2]])
        const on = /** @type {Vec3Mm} */ ([point[0], point[1], point[2]])
        result.onAMm = fromIsA ? vertex : on
        result.onBMm = fromIsA ? on : vertex
      }
    }
  }
  sweep(soupA, treeB, true)
  sweep(soupB, treeA, false)
  result.distanceMm = best
  return result
}

/** @typedef {import('./meshQuery.js').TriangleSoup} TriangleSoup */

/**
 * The volume two bodies share, mm³: an exact kernel intersection, skipped when their boxes do
 * not even touch.
 *
 * @param {Geom3 | Group} a
 * @param {Geom3 | Group} b
 * @returns {number}
 */
export function overlapVolume(a, b) {
  const [aMin, aMax] = boundsOf(a)
  const [bMin, bMax] = boundsOf(b)
  for (let axis = 0; axis < 3; axis += 1) {
    if (aMin[axis] >= bMax[axis] || bMin[axis] >= aMax[axis]) return 0
  }
  const shared = booleans.intersect(toGeom3(a), toGeom3(b))
  return Math.max(0, measurements.measureVolume(shared))
}
