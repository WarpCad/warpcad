// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * T-junction repair for export (`TODO/io-004`).
 *
 * ## The defect this exists for
 *
 * `docs/decisions/persistence-export.md` (sub-decision 4) chose kernel-side STL over
 * three.js's `STLExporter` **because** `@jscad/stl-serializer` runs
 * `modifiers.generalize({ snap: true, triangulate: true })` first, and `generalize`'s
 * triangulate step calls `insertTjunctions` — "so a slicer gets a closed manifold".
 * `TODO/io-003` measured 0 unmatched edges on two shapes and read that as general. It
 * is not. Driving `TODO/ui-034` against the running app found ordinary shapes where
 * that repair silently gives up:
 *
 * | shape | undirected edges with no matching second face |
 * |---|---|
 * | a Ø40×50 cylinder ∪ a 40 mm cube, placed at (-100.89, 66.93, 25) | **6 of 303** |
 * | a placed `hardware.bolt` (m10 hex, 30 long) | **40 of 302**, all on the hex head's rim |
 * | `raspberrypi.bplus` | **24 of 1179** |
 * | `io-003`'s own two shapes | 0 — which is why it looked fine |
 *
 * The volume is right in every case and every open edge is used exactly once, which is
 * the signature of a T-junction: one face's long edge is met by two shorter edges of
 * its neighbour, so the two sides never share an endpoint.
 *
 * ## Why the serializer's own repair misses them (measured, not guessed)
 *
 * `generalize` **snaps before it repairs**. It snaps every vertex to
 * `measureEpsilon(geometry)` — a grid derived from the bounding box, so **4.8e-4 mm**
 * for the union above and 2.4e-4 mm for the bolt. `insertTjunctions` then decides
 * whether a vertex lies on an edge by comparing the distance to `maths.constants.EPS`,
 * a **fixed 1e-5 mm**, regardless of the geometry's size or the grid it was just
 * snapped to. Snapping displaces a genuinely collinear vertex by up to
 * `√3/2 × ε ≈ 4.2e-4 mm` — some 40× that tolerance — so the vertex is no longer
 * recognised as being on the edge and the junction is left open.
 *
 * That is why the failure looks arbitrary from the outside. A T-junction whose edge is
 * axis-aligned survives snapping exactly (the two coordinates that define the line do
 * not change), which is every T-junction in `io-003`'s two shapes and none of the ones
 * on a hex head's diagonal rim or in a solid placed at 66.93 mm.
 *
 * ## What this module does instead
 *
 * It inserts the missing vertices **before** the serializer sees the solid, and it does
 * so **without moving anything**:
 *
 * - The snap grid is used only as an **identity key** — the same weld
 *   (`Math.round(x / ε) × ε`, same ε, same coordinates) the serializer is about to
 *   apply — so two vertices count as "the same corner" here exactly when the serializer
 *   will fuse them.
 * - Coordinates themselves are never rounded. The collinearity test therefore runs on
 *   the kernel's own doubles, where a T-junction vertex is on the line to within float
 *   noise rather than within a snap grid, and the exported bounding box comes out
 *   **bit-identical** to what it was before this module existed.
 * - Once the vertex is inserted it is *shared*, and sharing is snap-invariant: whatever
 *   the serializer's own snap does next, two identical coordinates snap identically. It
 *   cannot undo the repair.
 *
 * Measured across eight shapes, every one reaches 0 open edges (both the parity reading
 * and the stricter "exactly two faces, opposite ways"), with no zero-area triangle
 * introduced, no bounding-box change, and volume drift unchanged from before. The
 * on-edge tolerance is not knife-edge either: a sweep from 0.05 ε to 50 ε produces
 * identical output, so `ε` is chosen as the principled value (the radius inside which
 * the serializer is about to weld anyway), not a tuned one.
 *
 * ### Rejected, with the measurement that rejected them
 *
 * - **`modifiers.generalize({ snap, simplify, triangulate })` before serializing**
 *   (`TODO/io-004`'s first proposal) — no change at all (6 / 40 / 24), because it is
 *   the very pass the serializer already runs, snapping included.
 * - **`modifiers.retessellate`, alone or with `generalize`** — no change either
 *   (6 / 40 / 24); it merges coplanar fragments, which is not what is broken here.
 * - **Snapping first, then repairing** (`generalize`'s own order, with a tolerance
 *   scaled to ε) — does reach 0, but it moves coordinates onto the grid, which shifted
 *   one measured bounding box by 2.3e-4 mm for no benefit, and ran roughly twice as
 *   slow (75 ms vs 39 ms over a 24-body export).
 *
 * The result of this pass is for **serialization only**. Inserting a vertex into an
 * edge can leave a polygon a hair non-convex, so it must not be fed back into a boolean
 * — the same caveat `@jscad/modeling`'s own `insertTjunctions` carries.
 *
 * ## What it costs, and what `TODO/perf-001` changed (measured)
 *
 * `io-004` shipped this deliberately unoptimised — every open edge tested against every
 * welded corner in the solid, and a fresh `` `${ix},${iy},${iz}` `` string per vertex per
 * pass — and said so, because the sizes reachable then did not justify the code.
 * `perf-001` revisited it with numbers (`bench/results/2026-09-21-perf-001.md`), on an
 * Apple M4 Pro under Node 24, median of 20 runs:
 *
 * | solid | polygons | before | after |
 * |---|---|---|---|
 * | a `raspberrypi.bplus` | 217 | 1.71 ms | **0.39 ms** |
 * | 24 bodies (12 boards + 12 bolts) | 3,492 | 27.01 ms | **4.82 ms** |
 * | a sphere `segments: 96` ∪ a cube | 4,107 | 20.18 ms | **3.79 ms** |
 * | a sphere `segments: 192` ∪ a cube | 16,275 | 89.92 ms | **20.78 ms** |
 *
 * Two changes, both of which leave the **output identical** — proven vertex for vertex
 * and byte for byte across all ten shapes the two findings' specs cover, by
 * `bench/watertight-equivalence.mjs`:
 *
 * - **Corner identity is an integer, not a string.** {@link CornerIdentity} hashes the
 *   three rounded coordinates and compares them exactly on collision, so two vertices
 *   share an id precisely when the old string key would have matched. That turns the
 *   per-pass bookkeeping into array indexing; on the huge solid it was 15 ms a pass by
 *   itself.
 * - **A uniform spatial hash over the corners** ({@link CornerGrid}), walked along each
 *   open edge, instead of a scan over all of them. The old quadratic term reached 2.38 M
 *   candidate tests per pass on the huge solid.
 *
 * Ordering is preserved on purpose: hits are sorted by distance along the edge and then
 * by the order the corner was first walked, which is exactly what a stable sort over the
 * old insertion-ordered corner list produced. Two corners at the same distance therefore
 * still come out the same way round, and the written file does not shift by a byte.
 *
 * @module core/kernel/watertight
 */

import modeling from '@jscad/modeling'

const { geometries, measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('@jscad/modeling').maths.vec3.Vec3} Vec3 */

/**
 * Enough passes for an inserted vertex to open up a junction that was hidden behind it,
 * and a hard stop so a pathological solid cannot spin here. Every shape measured so far
 * settles in two.
 */
const MAX_PASSES = 8

/**
 * Make a solid watertight for export: insert a vertex wherever one face's corner sits
 * in the middle of another face's edge.
 *
 * Returns a **new** solid; the input is never modified. A solid with nothing to repair
 * comes back with the same polygons, vertex for vertex.
 *
 * @param {Geom3} solid Evaluated kernel solid, in document millimetres.
 * @returns {Geom3} The same surface, with T-junction vertices inserted.
 */
export function makeWatertight(solid) {
  const sourcePolygons = geometries.geom3.toPolygons(solid)
  if (sourcePolygons.length === 0) return solid

  const epsilon = measurements.measureEpsilon(solid)
  if (!(epsilon > 0)) return solid
  // The radius inside which the serializer's own snap will fuse two corners; a vertex
  // that close to an edge is a corner of it as far as the written file is concerned.
  const tolerance = epsilon

  /** @type {{ vertices: Vec3[] }[]} */
  const polygons = sourcePolygons.map((polygon) => ({ vertices: polygon.vertices.slice() }))

  // Every vertex's welded identity, resolved ONCE for the whole repair. Inserting a
  // vertex only ever re-uses a corner that already exists, so no pass can invent a new
  // identity — which is what lets the per-pass work below be array indexing instead of
  // string building (`TODO/perf-001`; see the module comment's Performance section).
  const identity = new CornerIdentity(epsilon)
  /** @type {number[][]} Per polygon, its vertices' corner ids — spliced alongside `vertices`. */
  const ids = polygons.map((polygon) => polygon.vertices.map((vertex) => identity.idOf(vertex)))
  const cornerCount = identity.size
  const grid = new CornerGrid(cornerCount, tolerance)

  let inserted = 0

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    // One representative coordinate per welded corner, and the order it was first
    // walked in — the same first-seen-wins rule, and the same ordering, the previous
    // `Map`-based pass had, because both are still read in polygon-then-corner order.
    /** @type {(Vec3 | undefined)[]} */
    const representative = new Array(cornerCount)
    const order = new Int32Array(cornerCount).fill(-1)
    let seen = 0
    // How often each directed edge is walked. A closed surface walks every edge once
    // each way, so an edge whose reverse is walked fewer times is an open side.
    /** @type {Map<number, number>} Keyed by `from * cornerCount + to`. */
    const directed = new Map()
    for (let index = 0; index < polygons.length; index += 1) {
      const { vertices } = polygons[index]
      const polygonIds = ids[index]
      for (let corner = 0; corner < vertices.length; corner += 1) {
        const from = polygonIds[corner]
        const to = polygonIds[(corner + 1) % vertices.length]
        if (order[from] === -1) {
          representative[from] = vertices[corner]
          order[from] = seen
          seen += 1
        }
        const edge = from * cornerCount + to
        directed.set(edge, (directed.get(edge) ?? 0) + 1)
      }
    }
    grid.rebuild(representative)

    let insertedThisPass = 0
    for (let index = 0; index < polygons.length; index += 1) {
      const { vertices } = polygons[index]
      const polygonIds = ids[index]
      /** @type {Map<number, Vec3[]>} Edge start index → vertices to insert after it. */
      const insertions = new Map()
      for (let corner = 0; corner < vertices.length; corner += 1) {
        const next = (corner + 1) % vertices.length
        const from = polygonIds[corner]
        const to = polygonIds[next]
        if ((directed.get(to * cornerCount + from) ?? 0) >= (directed.get(from * cornerCount + to) ?? 0)) continue
        const found = cornersOnEdge(vertices[corner], vertices[next], from, to, representative, order, grid, tolerance)
        if (found.length > 0) insertions.set(corner, found)
      }
      if (insertions.size === 0) continue

      /** @type {Vec3[]} */
      const repaired = []
      /** @type {number[]} */
      const repairedIds = []
      for (let corner = 0; corner < vertices.length; corner += 1) {
        repaired.push(vertices[corner])
        repairedIds.push(polygonIds[corner])
        const extra = insertions.get(corner)
        if (!extra) continue
        for (const vertex of extra) {
          repaired.push(vertex)
          repairedIds.push(identity.idOf(vertex))
        }
        insertedThisPass += extra.length
      }
      polygons[index] = { vertices: repaired }
      ids[index] = repairedIds
    }

    inserted += insertedThisPass
    if (insertedThisPass === 0) break
  }

  if (inserted === 0) return solid
  // `toPolygons` above already applied the solid's lazy transforms, so the rebuilt
  // solid starts from an identity transform. Copying `solid.transforms` onto it would
  // apply the user's move, rotation or scale a second time.
  return geometries.geom3.create(polygons)
}

/**
 * A vertex's welded identity as a small integer: which cell of the serializer's own
 * snap grid it lands in. Coordinates are never modified — this is an identity, not a
 * rounding of the geometry, exactly as the string key it replaces was.
 *
 * The three rounded coordinates are hashed into a bucket and then compared exactly, so
 * a hash collision costs a comparison rather than a wrong answer. Two vertices get the
 * same id precisely when `` `${ix},${iy},${iz}` `` would have matched.
 */
class CornerIdentity {
  /** @param {number} epsilon */
  constructor(epsilon) {
    this.epsilon = epsilon
    /** @type {Map<number, number | number[]>} Hash → id, or ids sharing that hash. */
    this.buckets = new Map()
    /** @type {number[]} */
    this.x = []
    /** @type {number[]} */
    this.y = []
    /** @type {number[]} */
    this.z = []
  }

  /** @returns {number} How many distinct corners have been seen. */
  get size() {
    return this.x.length
  }

  /**
   * @param {Vec3} vertex
   * @returns {number} Its corner id, assigning a new one the first time.
   */
  idOf(vertex) {
    const ix = Math.round(vertex[0] / this.epsilon)
    const iy = Math.round(vertex[1] / this.epsilon)
    const iz = Math.round(vertex[2] / this.epsilon)
    const hash = (Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ Math.imul(iz, 83492791)) >>> 0
    const bucket = this.buckets.get(hash)
    if (bucket !== undefined) {
      if (typeof bucket === 'number') {
        if (this.x[bucket] === ix && this.y[bucket] === iy && this.z[bucket] === iz) return bucket
      } else {
        for (const id of bucket) {
          if (this.x[id] === ix && this.y[id] === iy && this.z[id] === iz) return id
        }
      }
    }
    const id = this.x.length
    this.x.push(ix)
    this.y.push(iy)
    this.z.push(iz)
    if (bucket === undefined) this.buckets.set(hash, id)
    else if (typeof bucket === 'number') this.buckets.set(hash, [bucket, id])
    else bucket.push(id)
    return id
  }
}

/**
 * A uniform spatial hash over the solid's welded corners, so walking an open edge asks
 * only the corners near it instead of every corner in the solid (`TODO/perf-001`; the
 * previous pass compared every open edge against the whole corner list, which is the
 * term that grows with a *single body's* polygon count).
 *
 * The cell size is held at or above `4 × tolerance`, which is what makes the query
 * below exhaustive: sampling the segment every half-cell puts any point of it within a
 * quarter-cell of a sample, so a corner within `tolerance` of the segment is at most
 * half a cell from some sample and therefore inside that sample's 3×3×3 block.
 */
class CornerGrid {
  /**
   * @param {number} cornerCount
   * @param {number} tolerance
   */
  constructor(cornerCount, tolerance) {
    this.tolerance = tolerance
    this.cornerCount = cornerCount
    /** Per-corner "already answered this query" marks, so a corner is tested once per edge. */
    this.stamp = new Int32Array(cornerCount)
    this.query = 0
    this.cells = 1
    this.counts = new Int32Array(1)
    this.items = new Int32Array(cornerCount)
    this.min = [0, 0, 0]
    this.size = [1, 1, 1]
    this.step = 1
  }

  /**
   * Rebuild from this pass's representative coordinates. Cheap enough to redo every
   * pass (a counting sort over the corners) and simpler than proving the
   * representatives cannot move.
   *
   * @param {(Vec3 | undefined)[]} representative
   */
  rebuild(representative) {
    const count = this.cornerCount
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (let id = 0; id < count; id += 1) {
      const vertex = representative[id]
      if (vertex === undefined) continue
      if (vertex[0] < minX) minX = vertex[0]
      if (vertex[1] < minY) minY = vertex[1]
      if (vertex[2] < minZ) minZ = vertex[2]
      if (vertex[0] > maxX) maxX = vertex[0]
      if (vertex[1] > maxY) maxY = vertex[1]
      if (vertex[2] > maxZ) maxZ = vertex[2]
    }
    if (!(minX <= maxX)) {
      // No corners at all: leave a single cell, which degrades to a linear scan.
      minX = minY = minZ = 0
      maxX = maxY = maxZ = 0
    }
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, this.tolerance)
    // Corners sit on a surface, so aiming at roughly one corner per occupied cell means
    // about `count` occupied cells out of `(extent / step)³` — the cube root of the
    // corner count per axis is the usual choice and keeps the arrays small.
    const perAxis = Math.max(1, Math.min(256, Math.ceil(Math.cbrt(Math.max(count, 1))) * 2))
    this.step = Math.max(extent / perAxis, this.tolerance * 4)
    this.min = [minX, minY, minZ]
    this.size = [
      Math.max(1, Math.min(256, Math.floor((maxX - minX) / this.step) + 1)),
      Math.max(1, Math.min(256, Math.floor((maxY - minY) / this.step) + 1)),
      Math.max(1, Math.min(256, Math.floor((maxZ - minZ) / this.step) + 1)),
    ]
    const cells = this.size[0] * this.size[1] * this.size[2]
    if (cells !== this.cells || this.counts.length !== cells + 1) {
      this.cells = cells
      this.counts = new Int32Array(cells + 1)
    } else {
      this.counts.fill(0)
    }
    if (this.items.length !== count) this.items = new Int32Array(count)

    // Counting sort: tally per cell, prefix-sum, then place.
    for (let id = 0; id < count; id += 1) {
      const vertex = representative[id]
      if (vertex === undefined) continue
      this.counts[this.cellOf(vertex) + 1] += 1
    }
    for (let cell = 0; cell < cells; cell += 1) this.counts[cell + 1] += this.counts[cell]
    const cursor = this.counts.slice(0, cells)
    for (let id = 0; id < count; id += 1) {
      const vertex = representative[id]
      if (vertex === undefined) continue
      const cell = this.cellOf(vertex)
      this.items[cursor[cell]] = id
      cursor[cell] += 1
    }
  }

  /**
   * @param {Vec3} vertex
   * @returns {number} Flat cell index.
   */
  cellOf(vertex) {
    const ix = this.axisCell(vertex[0], 0)
    const iy = this.axisCell(vertex[1], 1)
    const iz = this.axisCell(vertex[2], 2)
    return (iz * this.size[1] + iy) * this.size[0] + ix
  }

  /**
   * @param {number} value
   * @param {0 | 1 | 2} axis
   * @returns {number}
   */
  axisCell(value, axis) {
    const cell = Math.floor((value - this.min[axis]) / this.step)
    return cell < 0 ? 0 : cell >= this.size[axis] ? this.size[axis] - 1 : cell
  }
}

/**
 * Corners that lie in the interior of the segment `start`→`end`, nearest first.
 *
 * A corner has to be `tolerance` clear of *both* endpoints as well as within
 * `tolerance` of the line, so the repair can never split an edge into a piece shorter
 * than the distance the serializer welds over — which would produce the zero-area
 * triangle this is supposed to avoid.
 *
 * Candidates come from the spatial hash rather than from the whole corner list, and
 * the result is ordered by distance along the edge and then by the order the corner was
 * first walked in — which is exactly the order a stable sort over the old corner list
 * produced, so two corners at the same distance still come out the same way round.
 *
 * @param {Vec3} start
 * @param {Vec3} end
 * @param {number} startId
 * @param {number} endId
 * @param {(Vec3 | undefined)[]} representative
 * @param {Int32Array} order
 * @param {CornerGrid} grid
 * @param {number} tolerance
 * @returns {Vec3[]}
 */
function cornersOnEdge(start, end, startId, endId, representative, order, grid, tolerance) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const dz = end[2] - start[2]
  const lengthSquared = dx * dx + dy * dy + dz * dz
  if (lengthSquared === 0) return []
  const length = Math.sqrt(lengthSquared)
  const margin = tolerance / length
  if (margin >= 0.5) return []

  grid.query += 1
  const mark = grid.query
  const { stamp, items, counts, size, step } = grid
  /** @type {[number, number, Vec3][]} `[along, first-walked order, coordinate]`. */
  const hits = []

  const samples = Math.max(1, Math.ceil((2 * length) / step))
  for (let sample = 0; sample <= samples; sample += 1) {
    const t = sample / samples
    const cx = grid.axisCell(start[0] + dx * t, 0)
    const cy = grid.axisCell(start[1] + dy * t, 1)
    const cz = grid.axisCell(start[2] + dz * t, 2)
    for (let oz = -1; oz <= 1; oz += 1) {
      const z = cz + oz
      if (z < 0 || z >= size[2]) continue
      for (let oy = -1; oy <= 1; oy += 1) {
        const y = cy + oy
        if (y < 0 || y >= size[1]) continue
        for (let ox = -1; ox <= 1; ox += 1) {
          const x = cx + ox
          if (x < 0 || x >= size[0]) continue
          const cell = (z * size[1] + y) * size[0] + x
          for (let slot = counts[cell]; slot < counts[cell + 1]; slot += 1) {
            const id = items[slot]
            if (stamp[id] === mark) continue
            stamp[id] = mark
            if (id === startId || id === endId) continue
            const vertex = representative[id]
            if (vertex === undefined) continue
            const along =
              ((vertex[0] - start[0]) * dx + (vertex[1] - start[1]) * dy + (vertex[2] - start[2]) * dz) / lengthSquared
            if (along <= margin || along >= 1 - margin) continue
            const offX = start[0] + dx * along - vertex[0]
            const offY = start[1] + dy * along - vertex[1]
            const offZ = start[2] + dz * along - vertex[2]
            if (offX * offX + offY * offY + offZ * offZ > tolerance * tolerance) continue
            hits.push([along, order[id], vertex])
          }
        }
      }
    }
  }

  if (hits.length === 0) return []
  hits.sort((left, right) => left[0] - right[0] || left[1] - right[1])
  return hits.map(([, , vertex]) => vertex)
}
