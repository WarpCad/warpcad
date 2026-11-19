// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Offset a solid: move every face along its own outward normal by one distance
 * (`TODO/ai-049`). Positive grows the part, negative shrinks it, and a hole through it
 * goes the other way, because a hole's faces point into the hole.
 *
 * ## Why not `@jscad/modeling`'s `expand`
 *
 * Measured on 2.13.0 (`docs/decisions/geometry-kernel.md`, "Offsetting a solid"):
 *
 * - **It cannot shrink.** `expand({ delta: -δ })` on a solid throws "radius must be
 *   positive"; there is no solid erosion in V3 at all.
 * - **It rounds every convex edge.** `expandGeom3` unions the solid with a shell of a
 *   cylinder per edge and a sphere per corner, so a grown box is not a box, and the result
 *   does not match `modify.enlarge` even where enlarge is exact.
 * - **It is slow.** 2.6 s for a 20 mm block with one 32-segment bore (104 polygons in,
 *   930 out), 0.3 s for a bare cylinder: a union of hundreds of pieces per call.
 *
 * ## What this does instead: a mitred vertex offset
 *
 * A face that moves by `d` along its normal stays a plane, so every corner of the offset
 * solid is where the moved planes of the faces around it meet. For a corner touched by
 * the planes `nᵢ · p = wᵢ`, the new corner `p + x` solves `nᵢ · x = d` for every `i`:
 *
 * - one plane (a corner in the middle of a face): `x = d·n`;
 * - two (a corner on a straight edge): the point on the moved edge line;
 * - three (an ordinary corner of a box, an L, a faceted cylinder's rim): the one point
 *   where the three moved planes meet. **Exact.**
 * - four or more distinct planes (a cone tip, a sphere's facets): the least-squares
 *   point, which is exact when the moved planes still meet in one point (a regular
 *   pyramid's tip) and **approximate** when they do not (a sphere).
 *
 * Solved as the minimum-norm least-squares solution through the eigenvectors of
 * `G = Σ nᵢnᵢᵀ`, so one routine covers every rank without a special case per count. A
 * corner on exactly two faces (a T-junction in the middle of a straight edge) is then
 * re-placed between the two ends of its straight run, so the pieces of an edge keep their
 * order when an end slides along it.
 *
 * ## Faces, not polygons
 *
 * `geom3` is a polygon soup. A boolean leaves T-junctions (a corner of one face in the
 * middle of its neighbour's edge, which would see only one of its edge's two planes and
 * tear the surface open when moved), and it cuts one flat face into convex pieces along
 * chords that are not edges of the solid. {@link makeWatertight} inserts the T-junction
 * corners without moving anything; {@link CornerIdentity} welds corners on the grid the
 * STL export uses. Then the pieces are grouped back into faces (one plane, sharing a
 * corner), the chords cancelled, and each face rebuilt from its boundary loops: kept whole
 * if it is one loop and still convex, otherwise re-triangulated in its plane from every
 * corner, none added, so it matches its neighbours edge for edge. Moving the pieces instead
 * goes wrong in two measured ways: a chord from a T-junction to a reflex corner tilts and
 * leaves a piece non-convex (the L's front face), and a sliver piece between a chord and a
 * hole's facet turns over though the face is fine (the Raspberry Pi board's top).
 *
 * ## What it refuses
 *
 * Edges stay parallel to themselves, so a face keeps its shape and the solid keeps its
 * topology, **until the distance reaches half of the thinnest feature**: a wall or pin (on
 * a shrink) or a gap or slot (on a growth). Past that the true offset changes topology (a
 * wall vanishes, two faces merge), which a corner-moving offset cannot do, so it refuses,
 * naming the distance and where:
 *
 * 1. **Locally**: an edge of the solid that reverses, or a face that no longer
 *    triangulates (it folded over).
 * 2. **Clearance**: a sampled point of the new surface nearer than |d| to the old one. A
 *    valid offset region holds every point within |d| of the solid, so its boundary cannot
 *    be nearer; a nearer point is two moved faces meeting, such as the two cut faces of a
 *    slit closing flat against each other.
 * 3. **Crossing**: two faces with no corner in common that now cross.
 *
 * Also refused: a corner where two faces in one plane face opposite ways (a part flush with
 * another's face and running past it, like the Pi's AV jack barrel under its block). Any
 * distance at all would have to move that corner both ways.
 *
 * Measured: the Housing fixture's parts in under 5 ms; the Pi board (436 corners) in 27 ms;
 * a plate with six 64-segment holes and a 128-segment boss (1,812 corners) in 155 ms.
 *
 * Millimetres throughout, world frame (lazy transforms applied). Framework-free.
 *
 * @module core/kernel/offset
 */

import modeling from '@jscad/modeling'

import { UserFacingError } from '../userError.js'
import { triangulateFace } from './flatFaces.js'
import { isGroup } from './group.js'
import { TriangleTree, triangleSoup } from './meshQuery.js'
import { CornerIdentity, makeWatertight } from './watertight.js'

const { geometries, measurements } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('@jscad/modeling').maths.vec3.Vec3} Vec3 */
/** @typedef {import('./group.js').Group} Group */

/**
 * Two face normals closer than this (as `1 − cos θ`, about 0.008°) are one plane: the
 * pieces a boolean split one face into. A 256-segment cylinder's facets are 1.4° apart.
 */
const SAME_PLANE = 1e-8

/** An eigenvalue below this fraction of the largest is a direction no plane constrains. */
const RANK_TOLERANCE = 1e-9

/**
 * The result of {@link offsetSolidWithReport}.
 *
 * @typedef {object} OffsetReport
 * @property {Geom3} solid The offset solid.
 * @property {number} corners Welded corners moved.
 * @property {number} approximateCorners Corners where four or more face planes meet and the
 *   moved planes do not share a point, placed by least squares instead.
 */

/**
 * Offset one solid: every face moves `distanceMm` along its outward normal.
 *
 * @param {Geom3} solid
 * @param {number} distanceMm Positive grows, negative shrinks; 0 returns `solid` itself.
 * @returns {Geom3}
 * @throws {UserFacingError} For a non-finite distance, an empty solid, or a distance that
 *   would collapse a wall or close a gap (see the module comment).
 */
export function offsetSolid(solid, distanceMm) {
  return offsetSolidWithReport(solid, distanceMm).solid
}

/**
 * {@link offsetSolid}, also saying how many corners were placed exactly.
 *
 * @param {Geom3} solid
 * @param {number} distanceMm
 * @returns {OffsetReport}
 */
export function offsetSolidWithReport(solid, distanceMm) {
  const d = requireDistance(distanceMm)
  if (geometries.geom3.toPolygons(solid).length === 0) {
    throw new UserFacingError('offset/empty-solid', 'offset: the solid is empty, so it has no face to move')
  }
  if (d === 0) return { solid, corners: 0, approximateCorners: 0 }

  const repaired = makeWatertight(solid)
  const polygons = geometries.geom3.toPolygons(repaired)
  const identity = new CornerIdentity(measurements.measureEpsilon(repaired))
  const ids = polygons.map((polygon) => polygon.vertices.map((vertex) => identity.idOf(vertex)))
  const cornerCount = identity.size

  /** @type {Vec3[]} */
  const original = new Array(cornerCount)
  /** @type {(Vec3 | null)[]} Each polygon's unit normal, null for a zero-area one. */
  const normals = []
  /** @type {number[][]} The polygons (with an area) at each corner. */
  const around = Array.from({ length: cornerCount }, () => [])
  polygons.forEach((polygon, index) => {
    const n = newell(polygon.vertices)
    const length = Math.hypot(n[0], n[1], n[2])
    normals.push(length > 0 ? [n[0] / length, n[1] / length, n[2] / length] : null)
    polygon.vertices.forEach((vertex, corner) => {
      const id = ids[index][corner]
      if (original[id] === undefined) original[id] = vertex
      if (length > 0 && around[id].at(-1) !== index) around[id].push(index)
    })
  })

  const { faceOf, faceNormals, facesAt } = groupFaces(polygons.length, normals, around)
  const { moved, approximate, approximateCorners } = moveCorners(original, facesAt, faceNormals, ids, d)

  // Each face as its boundary loops: the pieces' edges with the chords between pieces
  // cancelled, so what is left are edges of the solid.
  const loopsOf = faceLoops(faceNormals, faceOf, ids, original)

  // 1. Local: no edge of the solid reverses. Its moved line is parallel to the old one, so
  // a reversed edge is a feature that has shrunk through zero.
  for (const loops of loopsOf) {
    for (const loop of loops) {
      for (let corner = 0; corner < loop.length; corner += 1) {
        const from = loop[corner]
        const to = loop[(corner + 1) % loop.length]
        const a = original[from]
        const b = original[to]
        const before = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        const now = [moved[to][0] - moved[from][0], moved[to][1] - moved[from][1], moved[to][2] - moved[from][2]]
        if (before[0] * now[0] + before[1] * now[1] + before[2] * now[2] <= 0) throw collapse(d, [a, b])
      }
    }
  }

  // Every output polygon must be convex (`poly3`'s contract, which the BSP booleans rely
  // on). A face that is one loop and still convex is kept whole. Anything else (holes,
  // a non-convex outline, a least-squares corner that may have left it bent) is triangulated
  // in its plane from its loops, using every corner and adding none, so it still matches
  // its neighbours edge for edge. A face that cannot be triangulated has folded: a collapse.
  /** @type {number[][]} */
  const outIds = []
  /** @type {boolean[]} */
  const outApproximate = []
  loopsOf.forEach((loops, face) => {
    if (loops.length === 0) return
    const unit = faceNormals[face]
    const loose = loops.some((loop) => loop.some((id) => approximate[id] === 1))
    if (!loose && loops.length === 1 && isConvex(loops[0].map((id) => moved[id]), unit)) {
      outIds.push(loops[0])
      outApproximate.push(false)
      return
    }
    const triangles = triangulateFace(loops, moved, unit)
    if (triangles === null) throw collapse(d, loops.flat().map((id) => original[id]))
    for (const triangle of triangles) {
      outIds.push(triangle)
      outApproximate.push(loose)
    }
  })

  // 2. Clearance: every point of a valid offset surface is at least |d| from the original
  // surface (the offset region contains every point within |d| of the solid, so nothing on
  // its boundary can be nearer). A point nearer than that sits where two moved faces have
  // met: a gap closing face to face, which crosses nothing strictly.
  const near = nearestTooClose(outIds, outApproximate, moved, repaired, Math.abs(d))
  if (near !== null) throw collapse(d, [near])

  // 3. Crossing: no two faces that share no corner cross each other.
  const crossing = firstCrossing(outIds, moved)
  if (crossing !== null) {
    const before = firstCrossing(ids.filter((_corners, index) => normals[index] !== null), original)
    if (before !== null) {
      throw new UserFacingError(
        'offset/solid-crosses-itself',
        `offset: the solid already crosses itself near ${where([before])}, so it has no single outside to offset`
      )
    }
    throw collapse(d, [crossing])
  }

  const result = geometries.geom3.create(
    outIds.map((corners) => geometries.poly3.create(corners.map((id) => moved[id])))
  )
  return { solid: result, corners: cornerCount, approximateCorners }
}

/**
 * Group the polygons into faces: pieces that share a corner and lie in one plane. The
 * kernel splits a flat face into convex pieces wherever a boolean cut across it; the
 * offset moves the face, not the pieces.
 *
 * @param {number} count Polygons.
 * @param {(Vec3 | null)[]} normals Per polygon.
 * @param {number[][]} around Polygons at each corner.
 * @returns {{ faceOf: Int32Array, faceNormals: Vec3[], facesAt: number[][] }} `faceOf` is
 *   −1 for a zero-area polygon; `facesAt` lists the distinct faces at each corner.
 */
function groupFaces(count, normals, around) {
  const parent = Int32Array.from({ length: count }, (_value, index) => index)
  /** @param {number} p @returns {number} */
  const find = (p) => {
    while (parent[p] !== p) {
      parent[p] = parent[parent[p]]
      p = parent[p]
    }
    return p
  }
  for (const list of around) {
    for (let i = 1; i < list.length; i += 1) {
      const n = /** @type {Vec3} */ (normals[list[i]])
      for (let j = 0; j < i; j += 1) {
        const m = /** @type {Vec3} */ (normals[list[j]])
        if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] > 1 - SAME_PLANE) {
          parent[find(list[i])] = find(list[j])
          break
        }
      }
    }
  }
  const faceOf = new Int32Array(count).fill(-1)
  /** @type {Map<number, number>} */
  const compact = new Map()
  /** @type {Vec3[]} */
  const faceNormals = []
  for (let p = 0; p < count; p += 1) {
    const n = normals[p]
    if (n === null) continue
    const root = find(p)
    let face = compact.get(root)
    if (face === undefined) {
      face = faceNormals.length
      compact.set(root, face)
      faceNormals.push(n)
    }
    faceOf[p] = face
  }
  const facesAt = around.map((list) => [...new Set(list.map((p) => faceOf[p]))])
  return { faceOf, faceNormals, facesAt }
}

/**
 * Move every corner onto the moved planes of the faces around it ({@link solveCorner}),
 * then re-place each corner in the middle of a straight edge (a T-junction, on exactly two
 * faces) between the two ends of its run, at the same fraction of the way along. The
 * minimum-norm move leaves such a corner where it was along the edge, while the end of the
 * edge slides along it on a shrink, so a short piece next to an end would turn round
 * (measured on the Pi's AV jack, whose block edge carries the barrel's facet heights).
 *
 * @param {Vec3[]} original
 * @param {number[][]} facesAt
 * @param {Vec3[]} faceNormals
 * @param {number[][]} ids Corner ids per polygon, for the edges between corners.
 * @param {number} d
 * @returns {{ moved: Vec3[], approximate: Uint8Array, approximateCorners: number }}
 */
function moveCorners(original, facesAt, faceNormals, ids, d) {
  const count = original.length
  /** @type {Vec3[]} */
  const moved = new Array(count)
  const approximate = new Uint8Array(count)
  let approximateCorners = 0
  for (let id = 0; id < count; id += 1) {
    const p = original[id]
    const normals = facesAt[id].map((face) => faceNormals[face])
    // Two faces at one corner, in one plane, facing opposite ways: a part flush with
    // another's face and hanging past it (the Pi's AV jack barrel under its block). The
    // corner would have to move +d along one and −d along the other; the true offset
    // splits it in two, which moving corners cannot do.
    for (let i = 1; i < normals.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        const n = normals[i]
        const m = normals[j]
        if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < -1 + SAME_PLANE) {
          throw new UserFacingError(
            'offset/opposed-faces',
            `offset: two faces that face opposite ways meet near ${where([p])} (one part sits flush with ` +
              `another's face and runs past it), so that corner cannot move both ways at once. Offset the ` +
              'parts before they are joined, or use modify.enlarge'
          )
        }
      }
    }
    const { x, exact } = solveCorner(normals.flat(), d)
    moved[id] = [p[0] + x[0], p[1] + x[1], p[2] + x[2]]
    if (!exact) {
      approximate[id] = 1
      approximateCorners += 1
    }
  }

  /** @type {Set<number>[]} */
  const neighbours = Array.from({ length: count }, () => new Set())
  for (const corners of ids) {
    for (let corner = 0; corner < corners.length; corner += 1) {
      const a = corners[corner]
      const b = corners[(corner + 1) % corners.length]
      if (a === b) continue
      neighbours[a].add(b)
      neighbours[b].add(a)
    }
  }
  /** @param {number} id @param {number[]} pair @returns {boolean} */
  const onBoth = (id, pair) => facesAt[id].includes(pair[0]) && facesAt[id].includes(pair[1])
  /** @param {number} id @param {number[]} pair @returns {number[]} */
  const along = (id, pair) => [...neighbours[id]].filter((other) => onBoth(other, pair))

  /** @type {Vec3[]} */
  const placed = moved.map((point) => point)
  for (let id = 0; id < count; id += 1) {
    const pair = facesAt[id]
    if (pair.length !== 2) continue
    const ways = along(id, pair)
    if (ways.length !== 2) continue
    /** @type {{ end: number, length: number }[]} */
    const ends = []
    for (const first of ways) {
      let previous = id
      let current = first
      let length = dist(original[id], original[first])
      let steps = 0
      while (facesAt[current].length === 2 && steps < count) {
        const next = along(current, pair).filter((other) => other !== previous)
        if (next.length !== 1) break
        length += dist(original[current], original[next[0]])
        previous = current
        current = next[0]
        steps += 1
      }
      if (facesAt[current].length < 3) break
      ends.push({ end: current, length })
    }
    if (ends.length !== 2) continue
    const t = ends[0].length / (ends[0].length + ends[1].length)
    const a = moved[ends[0].end]
    const b = moved[ends[1].end]
    placed[id] = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]
  }
  return { moved: placed, approximate, approximateCorners }
}

/**
 * Each face's boundary loops, as corner ids, wound like the face: every piece's directed
 * edges, with each edge that a neighbouring piece of the same face walks the other way
 * cancelled (a chord, not an edge of the solid).
 *
 * Where two regions of one face touch at a single corner (a cylinder tangent to a box's
 * side pinches the box's bottom face into four), that corner has two ways out. The walk
 * takes the sharpest left turn, which keeps the face on its left and each region in its
 * own loop.
 *
 * @param {Vec3[]} faceNormals
 * @param {Int32Array} faceOf
 * @param {number[][]} ids
 * @param {Vec3[]} points Position per corner id.
 * @returns {number[][][]}
 */
function faceLoops(faceNormals, faceOf, ids, points) {
  /** @type {Map<string, number>[]} Directed edge "a,b" → how many times, per face. */
  const edges = faceNormals.map(() => new Map())
  ids.forEach((corners, polygon) => {
    const face = faceOf[polygon]
    if (face < 0) return
    const map = edges[face]
    for (let corner = 0; corner < corners.length; corner += 1) {
      const a = corners[corner]
      const b = corners[(corner + 1) % corners.length]
      if (a === b) continue
      const back = `${b},${a}`
      const reverse = map.get(back)
      if (reverse !== undefined) {
        if (reverse === 1) map.delete(back)
        else map.set(back, reverse - 1)
        continue
      }
      const key = `${a},${b}`
      map.set(key, (map.get(key) ?? 0) + 1)
    }
  })
  return edges.map((map, face) => {
    const unit = faceNormals[face]
    /**
     * Which of `out` leaves `current` (reached from `previous`) at the sharpest left turn.
     *
     * @param {number} previous @param {number} current @param {number[]} out
     * @returns {number} An index into `out`.
     */
    const leftmost = (previous, current, out) => {
      if (out.length === 1) return 0
      const p = points[previous]
      const c = points[current]
      const din = [c[0] - p[0], c[1] - p[1], c[2] - p[2]]
      let best = 0
      let bestAngle = -Infinity
      out.forEach((candidate, index) => {
        const q = points[candidate]
        const dout = [q[0] - c[0], q[1] - c[1], q[2] - c[2]]
        const cross = [din[1] * dout[2] - din[2] * dout[1], din[2] * dout[0] - din[0] * dout[2], din[0] * dout[1] - din[1] * dout[0]]
        const angle = Math.atan2(cross[0] * unit[0] + cross[1] * unit[1] + cross[2] * unit[2], din[0] * dout[0] + din[1] * dout[1] + din[2] * dout[2])
        if (angle > bestAngle) {
          bestAngle = angle
          best = index
        }
      })
      return best
    }
    /** @type {Map<number, number[]>} */
    const next = new Map()
    for (const [key, times] of map) {
      const [a, b] = key.split(',').map(Number)
      for (let k = 0; k < times; k += 1) {
        const list = next.get(a)
        if (list === undefined) next.set(a, [b])
        else list.push(b)
      }
    }
    /** @type {number[][]} */
    const loops = []
    for (const start of [...next.keys()]) {
      while ((next.get(start)?.length ?? 0) > 0) {
        const loop = [start]
        let previous = start
        let current = /** @type {number} */ (next.get(start)?.pop())
        let guard = 0
        while (current !== start && guard < map.size + 1) {
          loop.push(current)
          const out = next.get(current)
          if (out === undefined || out.length === 0) break
          const [chosen] = out.splice(leftmost(previous, current, out), 1)
          previous = current
          current = chosen
          guard += 1
        }
        if (current !== start) {
          throw new UserFacingError(
            'offset/open-surface',
            'offset: the solid\'s surface is not closed, so it has no single outside to offset'
          )
        }
        if (loop.length >= 3) loops.push(loop)
      }
    }
    return loops
  })
}

/**
 * Offset a solid or a group. A group keeps its parts, names and colours: each part (hidden
 * ones too) moves by `distanceMm`, and each of the group's holes by `−distanceMm`, since a
 * hole is cut away and growing the part shrinks what is cut. An empty part or hole is left
 * as it is. Part `meta` is dropped, as `enlarge` drops it: a resized key no longer fits the
 * socket its label names.
 *
 * Touching parts are offset one by one, so where two parts meet each grows into the other.
 * The combined solid is the union of the grown parts, which is the offset of the whole
 * wherever the parts are convex or meet at right angles.
 *
 * @param {Geom3 | Group} value
 * @param {number} distanceMm Positive grows, negative shrinks.
 * @returns {Geom3 | Group} A group in, a group out.
 */
export function offset(value, distanceMm) {
  const d = requireDistance(distanceMm)
  if (!isGroup(value)) return offsetSolid(value, d)
  if (d === 0) return value

  /**
   * @param {Geom3} geometry
   * @param {number} by
   * @param {string} label
   * @returns {Geom3}
   */
  const move = (geometry, by, label) => {
    if (geometries.geom3.toPolygons(geometry).length === 0) return geometry
    try {
      return offsetSolid(geometry, by)
    } catch (error) {
      if (!(error instanceof UserFacingError)) throw error
      throw new UserFacingError(error.code, `offset: ${label}: ${error.message.replace(/^offset: /, '')}`)
    }
  }

  /** @type {Record<string, Geom3>} */
  const parts = {}
  for (const [name, geometry] of Object.entries(value.parts)) parts[name] = move(geometry, d, `part "${name}"`)
  return Object.freeze({
    name: value.name,
    names: value.names,
    parts: Object.freeze(parts),
    holes: Object.freeze(value.holes.map((hole, index) => move(hole, -d, `hole ${index + 1}`))),
    colors: value.colors ?? Object.freeze({}),
  })
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function requireDistance(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UserFacingError(
      'offset/distance-not-finite',
      `offset: expected one finite distance in millimetres, got ${JSON.stringify(value)}`
    )
  }
  return value
}

/**
 * The refusal for a distance past half the thinnest feature, worded by direction.
 *
 * @param {number} d
 * @param {Vec3[]} near Points to locate it by.
 * @returns {UserFacingError}
 */
function collapse(d, near) {
  const span = `${Number((2 * Math.abs(d)).toFixed(6))} mm`
  const what = d < 0 ? `collapses a wall or pin thinner than ${span}` : `closes a gap or slot narrower than ${span}`
  return new UserFacingError(
    d < 0 ? 'offset/collapses-a-wall' : 'offset/closes-a-gap',
    `offset: ${d} mm ${what} near ${where(near)}. Use a smaller distance`
  )
}

/**
 * @param {Vec3[]} points
 * @returns {string} Their centre, to 0.01 mm.
 */
function where(points) {
  return `[${centreOf(points).map((value) => Number(value.toFixed(2))).join(', ')}]`
}

/**
 * @param {Vec3[]} points
 * @returns {Vec3} Their average.
 */
function centreOf(points) {
  /** @type {Vec3} */
  const centre = [0, 0, 0]
  for (const point of points) for (let axis = 0; axis < 3; axis += 1) centre[axis] += point[axis] / points.length
  return centre
}

/** Most samples per triangle edge for the clearance test: up to 15 points a triangle. */
const MAX_SAMPLES_PER_EDGE = 4

/**
 * A sampled point of the offset surface nearer than `distance` to the original surface,
 * or null. Each triangle is sampled on a barycentric grid, finer for a triangle long
 * against the distance. A triangle with a least-squares corner gets 10% slack, since that
 * corner can sit a little short of every one of its planes.
 *
 * @param {number[][]} faces Corner ids per output face.
 * @param {boolean[]} loose Per face: has a least-squares corner.
 * @param {Vec3[]} corners Moved position per corner id.
 * @param {Geom3} original The repaired solid before the offset.
 * @param {number} distance |d|, > 0.
 * @returns {Vec3 | null}
 */
function nearestTooClose(faces, loose, corners, original, distance) {
  const tree = new TriangleTree(triangleSoup(original))
  const out = new Float64Array(3)
  for (let index = 0; index < faces.length; index += 1) {
    const face = faces[index]
    const limit = distance * (loose[index] ? 0.9 : 1 - 1e-6)
    for (let corner = 1; corner + 1 < face.length; corner += 1) {
      const a = corners[face[0]]
      const b = corners[face[corner]]
      const c = corners[face[corner + 1]]
      const longest = Math.max(dist(a, b), dist(b, c), dist(c, a))
      const steps = Math.min(MAX_SAMPLES_PER_EDGE, Math.max(1, Math.ceil(longest / distance)))
      for (let i = 0; i <= steps; i += 1) {
        for (let j = 0; i + j <= steps; j += 1) {
          const u = i / steps
          const v = j / steps
          const w = 1 - u - v
          const x = a[0] * w + b[0] * u + c[0] * v
          const y = a[1] * w + b[1] * u + c[1] * v
          const z = a[2] * w + b[2] * u + c[2] * v
          if (tree.closestPoint(x, y, z, limit, out) < limit) return [x, y, z]
        }
      }
    }
  }
  return null
}

/**
 * @param {Vec3} a
 * @param {Vec3} b
 * @returns {number}
 */
function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
}

/**
 * The move `x` with `nᵢ · x = d` for each distinct plane at a corner, as the minimum-norm
 * least-squares solution: `x = G⁺ b`, `G = Σ nᵢnᵢᵀ`, `b = d Σ nᵢ`.
 *
 * @param {number[]} list Flattened unit normals.
 * @param {number} d
 * @returns {{ x: Vec3, exact: boolean }} `exact` when every plane is met to 1e-9 mm.
 */
function solveCorner(list, d) {
  const g = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  const b = [0, 0, 0]
  for (let at = 0; at < list.length; at += 3) {
    const n = [list[at], list[at + 1], list[at + 2]]
    for (let row = 0; row < 3; row += 1) {
      b[row] += d * n[row]
      for (let column = 0; column < 3; column += 1) g[row * 3 + column] += n[row] * n[column]
    }
  }
  const { values, vectors } = symmetricEigen(g)
  const largest = Math.max(...values)
  /** @type {Vec3} */
  const x = [0, 0, 0]
  for (let k = 0; k < 3; k += 1) {
    if (!(values[k] > RANK_TOLERANCE * largest)) continue
    const v = [vectors[k], vectors[3 + k], vectors[6 + k]]
    const scale = (v[0] * b[0] + v[1] * b[1] + v[2] * b[2]) / values[k]
    x[0] += scale * v[0]
    x[1] += scale * v[1]
    x[2] += scale * v[2]
  }
  let residual = 0
  for (let at = 0; at < list.length; at += 3) {
    residual = Math.max(residual, Math.abs(list[at] * x[0] + list[at + 1] * x[1] + list[at + 2] * x[2] - d))
  }
  return { x, exact: residual <= 1e-9 + 1e-9 * Math.abs(d) }
}

/**
 * Eigen-decomposition of a symmetric 3 × 3 matrix by cyclic Jacobi rotations.
 *
 * @param {number[]} m Row-major, symmetric.
 * @returns {{ values: number[], vectors: number[] }} `vectors` row-major, column `k` is the
 *   eigenvector of `values[k]`.
 */
function symmetricEigen(m) {
  const a = m.slice()
  const v = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  for (let sweep = 0; sweep < 32; sweep += 1) {
    const off = a[1] * a[1] + a[2] * a[2] + a[5] * a[5]
    if (off < 1e-30) break
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[p * 3 + q]
      if (Math.abs(apq) < 1e-300) continue
      const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq)
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1)
      const s = t * c
      for (let k = 0; k < 3; k += 1) {
        const akp = a[k * 3 + p]
        const akq = a[k * 3 + q]
        a[k * 3 + p] = c * akp - s * akq
        a[k * 3 + q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k += 1) {
        const apk = a[p * 3 + k]
        const aqk = a[q * 3 + k]
        a[p * 3 + k] = c * apk - s * aqk
        a[q * 3 + k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k += 1) {
        const vkp = v[k * 3 + p]
        const vkq = v[k * 3 + q]
        v[k * 3 + p] = c * vkp - s * vkq
        v[k * 3 + q] = s * vkp + c * vkq
      }
    }
  }
  return { values: [a[0], a[4], a[8]], vectors: v }
}

/**
 * Whether a flat polygon turns the same way at every corner, seen from `unit`. A straight
 * run (a T-junction corner) counts as convex.
 *
 * @param {Vec3[]} points
 * @param {Vec3} unit
 * @returns {boolean}
 */
function isConvex(points, unit) {
  const count = points.length
  for (let index = 0; index < count; index += 1) {
    const a = points[(index + count - 1) % count]
    const b = points[index]
    const c = points[(index + 1) % count]
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
    const turn =
      (e1[1] * e2[2] - e1[2] * e2[1]) * unit[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * unit[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * unit[2]
    if (turn < -1e-9 * Math.hypot(e1[0], e1[1], e1[2]) * Math.hypot(e2[0], e2[1], e2[2])) return false
  }
  return true
}

/**
 * Newell's normal: twice the area along the polygon's normal, robust to collinear corners.
 *
 * @param {readonly Vec3[]} vertices
 * @returns {Vec3}
 */
function newell(vertices) {
  let x = 0
  let y = 0
  let z = 0
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index]
    const b = vertices[(index + 1) % vertices.length]
    x += (a[1] - b[1]) * (a[2] + b[2])
    y += (a[2] - b[2]) * (a[0] + b[0])
    z += (a[0] - b[0]) * (a[1] + b[1])
  }
  return [x, y, z]
}

/**
 * The first point where two faces sharing no corner cross, or null. Faces are fanned into
 * triangles, swept along the longest axis of the whole surface, and each overlapping pair
 * is tested edge against triangle with a strict interior test, so faces that only touch
 * do not count.
 *
 * @param {number[][]} faces Corner ids per (convex, possibly non-planar) face.
 * @param {Vec3[]} corners Position per corner id.
 * @returns {Vec3 | null}
 */
function firstCrossing(faces, corners) {
  /** @type {number[][]} */
  const triangles = []
  for (const face of faces) {
    for (let corner = 1; corner + 1 < face.length; corner += 1) triangles.push([face[0], face[corner], face[corner + 1]])
  }
  const count = triangles.length
  const boxes = new Float64Array(count * 6)
  const low = [Infinity, Infinity, Infinity]
  const high = [-Infinity, -Infinity, -Infinity]
  triangles.forEach((triangle, index) => {
    for (let axis = 0; axis < 3; axis += 1) {
      let min = Infinity
      let max = -Infinity
      for (const id of triangle) {
        min = Math.min(min, corners[id][axis])
        max = Math.max(max, corners[id][axis])
      }
      boxes[index * 6 + axis] = min
      boxes[index * 6 + 3 + axis] = max
      low[axis] = Math.min(low[axis], min)
      high[axis] = Math.max(high[axis], max)
    }
  })
  const extent = [high[0] - low[0], high[1] - low[1], high[2] - low[2]]
  const axis = extent.indexOf(Math.max(...extent))
  const scale = Math.max(...extent, 1e-9)
  const slack = scale * 1e-9
  const order = Array.from({ length: count }, (_value, index) => index).sort((p, q) => boxes[p * 6 + axis] - boxes[q * 6 + axis])

  /** @type {number[]} */
  let active = []
  for (const current of order) {
    const start = boxes[current * 6 + axis]
    active = active.filter((other) => boxes[other * 6 + 3 + axis] >= start - slack)
    for (const other of active) {
      if (!boxesOverlap(boxes, current, other, slack)) continue
      const t = triangles[current]
      const u = triangles[other]
      if (t.some((id) => u.includes(id))) continue
      const hit = trianglesCross(t, u, corners, scale) ?? trianglesCross(u, t, corners, scale)
      if (hit !== null) return hit
    }
    active.push(current)
  }
  return null
}

/**
 * @param {Float64Array} boxes
 * @param {number} p
 * @param {number} q
 * @param {number} slack
 * @returns {boolean}
 */
function boxesOverlap(boxes, p, q, slack) {
  for (let axis = 0; axis < 3; axis += 1) {
    if (boxes[p * 6 + axis] > boxes[q * 6 + 3 + axis] + slack) return false
    if (boxes[q * 6 + axis] > boxes[p * 6 + 3 + axis] + slack) return false
  }
  return true
}

/**
 * Where an edge of triangle `t` passes strictly through the inside of triangle `u`, or null.
 *
 * @param {number[]} t
 * @param {number[]} u
 * @param {Vec3[]} corners
 * @param {number} scale The surface's size, for the tolerances.
 * @returns {Vec3 | null}
 */
function trianglesCross(t, u, corners, scale) {
  const a = corners[u[0]]
  const b = corners[u[1]]
  const c = corners[u[2]]
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
  const length = Math.hypot(n[0], n[1], n[2])
  if (!(length > 0)) return null
  const unit = [n[0] / length, n[1] / length, n[2] / length]
  const tolerance = scale * 1e-9
  for (let edge = 0; edge < 3; edge += 1) {
    const p = corners[t[edge]]
    const q = corners[t[(edge + 1) % 3]]
    const sp = unit[0] * (p[0] - a[0]) + unit[1] * (p[1] - a[1]) + unit[2] * (p[2] - a[2])
    const sq = unit[0] * (q[0] - a[0]) + unit[1] * (q[1] - a[1]) + unit[2] * (q[2] - a[2])
    if (Math.abs(sp) <= tolerance || Math.abs(sq) <= tolerance || sp > 0 === sq > 0) continue
    const f = sp / (sp - sq)
    /** @type {Vec3} */
    const x = [p[0] + f * (q[0] - p[0]), p[1] + f * (q[1] - p[1]), p[2] + f * (q[2] - p[2])]
    if (strictlyInside(x, a, b, c, unit, tolerance)) return x
  }
  return null
}

/**
 * @param {Vec3} x A point on the triangle's plane.
 * @param {Vec3} a
 * @param {Vec3} b
 * @param {Vec3} c
 * @param {number[]} unit The triangle's unit normal.
 * @param {number} tolerance Distance inside each edge required.
 * @returns {boolean}
 */
function strictlyInside(x, a, b, c, unit, tolerance) {
  for (const [from, to] of [[a, b], [b, c], [c, a]]) {
    const e = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
    const w = [x[0] - from[0], x[1] - from[1], x[2] - from[2]]
    const cross = [e[1] * w[2] - e[2] * w[1], e[2] * w[0] - e[0] * w[2], e[0] * w[1] - e[1] * w[0]]
    const side = cross[0] * unit[0] + cross[1] * unit[1] + cross[2] * unit[2]
    if (side <= tolerance * Math.hypot(e[0], e[1], e[2])) return false
  }
  return true
}
