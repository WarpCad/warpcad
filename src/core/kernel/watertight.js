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
  let inserted = 0

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const keys = polygons.map((polygon) => polygon.vertices.map((vertex) => vertexKey(vertex, epsilon)))

    // How often each directed edge is walked. A closed surface walks every edge once
    // each way, so an edge whose reverse is walked fewer times is an open side.
    /** @type {Map<string, number>} */
    const directed = new Map()
    /** @type {Map<string, Vec3>} One representative coordinate per welded corner. */
    const corners = new Map()
    for (let index = 0; index < polygons.length; index += 1) {
      const { vertices } = polygons[index]
      const polygonKeys = keys[index]
      for (let corner = 0; corner < vertices.length; corner += 1) {
        const from = polygonKeys[corner]
        const to = polygonKeys[(corner + 1) % vertices.length]
        if (!corners.has(from)) corners.set(from, vertices[corner])
        const edge = `${from}/${to}`
        directed.set(edge, (directed.get(edge) ?? 0) + 1)
      }
    }
    const cornerList = [...corners.entries()]

    let insertedThisPass = 0
    for (let index = 0; index < polygons.length; index += 1) {
      const { vertices } = polygons[index]
      const polygonKeys = keys[index]
      /** @type {Map<number, Vec3[]>} Edge start index → vertices to insert after it. */
      const insertions = new Map()
      for (let corner = 0; corner < vertices.length; corner += 1) {
        const from = polygonKeys[corner]
        const to = polygonKeys[(corner + 1) % vertices.length]
        if ((directed.get(`${to}/${from}`) ?? 0) >= (directed.get(`${from}/${to}`) ?? 0)) continue
        const found = cornersOnEdge(vertices[corner], vertices[(corner + 1) % vertices.length], from, to, cornerList, tolerance)
        if (found.length > 0) insertions.set(corner, found)
      }
      if (insertions.size === 0) continue

      /** @type {Vec3[]} */
      const repaired = []
      for (let corner = 0; corner < vertices.length; corner += 1) {
        repaired.push(vertices[corner])
        const extra = insertions.get(corner)
        if (!extra) continue
        for (const vertex of extra) repaired.push(vertex)
        insertedThisPass += extra.length
      }
      polygons[index] = { vertices: repaired }
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
 * A vertex's welded identity: which cell of the serializer's own snap grid it lands in.
 * Coordinates are not modified — this is a key, not a rounding of the geometry.
 *
 * @param {Vec3} vertex
 * @param {number} epsilon
 * @returns {string}
 */
function vertexKey(vertex, epsilon) {
  return `${Math.round(vertex[0] / epsilon)},${Math.round(vertex[1] / epsilon)},${Math.round(vertex[2] / epsilon)}`
}

/**
 * Corners that lie in the interior of the segment `from`→`to`, nearest first.
 *
 * A corner has to be `tolerance` clear of *both* endpoints as well as within
 * `tolerance` of the line, so the repair can never split an edge into a piece shorter
 * than the distance the serializer welds over — which would produce the zero-area
 * triangle this is supposed to avoid.
 *
 * @param {Vec3} start
 * @param {Vec3} end
 * @param {string} startKey
 * @param {string} endKey
 * @param {[string, Vec3][]} corners Every welded corner in the solid.
 * @param {number} tolerance
 * @returns {Vec3[]}
 */
function cornersOnEdge(start, end, startKey, endKey, corners, tolerance) {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const dz = end[2] - start[2]
  const lengthSquared = dx * dx + dy * dy + dz * dz
  if (lengthSquared === 0) return []
  const margin = tolerance / Math.sqrt(lengthSquared)
  if (margin >= 0.5) return []

  /** @type {[number, Vec3][]} */
  const hits = []
  for (const [key, vertex] of corners) {
    if (key === startKey || key === endKey) continue
    const along = ((vertex[0] - start[0]) * dx + (vertex[1] - start[1]) * dy + (vertex[2] - start[2]) * dz) / lengthSquared
    if (along <= margin || along >= 1 - margin) continue
    const offX = start[0] + dx * along - vertex[0]
    const offY = start[1] + dy * along - vertex[1]
    const offZ = start[2] + dz * along - vertex[2]
    if (offX * offX + offY * offY + offZ * offZ > tolerance * tolerance) continue
    hits.push([along, vertex])
  }
  hits.sort((left, right) => left[0] - right[0])
  return hits.map(([, vertex]) => vertex)
}
