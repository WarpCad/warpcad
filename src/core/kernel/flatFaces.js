// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Sliver cleanup inside the flat faces of a solid, for export (`TODO/FIND-io-032`).
 *
 * ## The defect this exists for
 *
 * `@jscad/modeling` re-tessellates every flat face a boolean produces with a **sweep line**: it
 * cuts the face into strips at the height of corners on it. A cutter face that a dense scan clips
 * has hundreds of corners, and two of them a few micrometres apart in that direction make a strip
 * that thin across the face. Measured on `FIND-io-031`'s 32,320-triangle scan with a cube cut
 * through it: the cutter's top face had corners at y 13.1936, 13.1945, 13.2058 and 13.2128 mm,
 * four strips within 19 micrometres, each 16 mm long; 381 corners, 311 pairs closer than 30.
 *
 * The file is closed (`watertight.js` makes it so at the serializer's own weld), but CuraEngine
 * melds every corner within 30 micrometres of an earlier one **in the same hash cell**
 * (`src/mesh.cpp`), so unevenly, and drops what collapses. The strip triangles that survive fold
 * onto their neighbours; on an axis-aligned face every corner rounds to the same integer height,
 * so an edge ends up with a third face lying exactly in the plane of another, and Cura prints
 * *Mesh has overlapping faces*. `__fixtures__/curaMesh.js` is that check, for the specs.
 *
 * ## What this does instead
 *
 * Only a flat face with a sliver in it is touched: two or more coplanar polygons joined edge to
 * edge, one of them thinner than {@link SLIVER_RADIUS} or with a side that short. For each:
 *
 * 1. **Its outline is read off**: the sides walked once and not walked back inside the face,
 *    as loops. A fault (a side walked twice, two loops through one corner, a corner inside the
 *    face that something else uses — at 96,600 triangles, the `FIND-io-033` four-face edge) leaves
 *    the polygons at it out, and the pass runs again on the rest.
 * 2. **The sweep's own corners are taken out again.** A corner on the outline that exactly one
 *    other face or polygon passes straight through (to {@link STRAIGHT}) is dropped from both.
 *    This moves nothing.
 * 3. **Outline sides shorter than the radius are collapsed**, and two corners of one loop that
 *    close are joined (a zero-width spike goes; a neck splits into two loops). These corners are
 *    real — where the scan's skin grazes the cutter's plane, neighbouring scan edges cross it
 *    micrometres apart — and no triangulation of such a cluster survives Cura's uneven meld. This
 *    **does move geometry**, by less than {@link MOVE_CAP}, onto a corner that already exists; a
 *    corner on the bounding box never moves; and a collapse is refused if it would fold anything:
 *    turn a neighbouring triangle over, lay one flat on another face, or make two polygons the
 *    same corners. The volume moves by far less than the 1e-5 the export specs allow.
 * 4. **The face is triangulated afresh** from what is left — holes bridged in, ear clipping that
 *    takes the fattest ear first, then Delaunay flips — never using as a diagonal a side that a
 *    polygon outside the face already has between two outline corners.
 *
 * A face whose new triangles do not add up to its area is left as it was, and the pass runs again
 * without it, so a corner is never dropped from a neighbour for a face that kept its polygons.
 *
 * A **global** 30 micrometre fuse was rejected in principle (`FIND-io-032`): a dense scan has real
 * detail that fine — the 240,960-triangle scan's pole rings are 7 micrometres apart — and Cura
 * accepts it. This pass changes nothing outside a sliver's flat face and the polygons that meet
 * its outline; an uncut scan comes back untouched.
 *
 * @module core/kernel/flatFaces
 */

/** @typedef {import('@jscad/modeling').maths.vec3.Vec3} Vec3 */

/**
 * The size below which a polygon of a flat face counts as a sliver, in mm. CuraEngine melds
 * corners within 30 micrometres (`vertex_meld_distance = MM2INT(0.03)` in its `src/mesh.cpp`)
 * after rounding each coordinate to a micrometre; 35 covers that rounding with room to spare.
 */
export const SLIVER_RADIUS = 0.035

/**
 * How far off a straight side a corner may sit and still be dropped from it, in mm. The corners
 * the sweep adds are computed on the side, so they sit on it to float noise (about 1e-12 mm at
 * these sizes); anything farther off is a real corner. Dropping one this far off moves the
 * face's area by at most this times the side's length, far inside the 1e-5 volume budget.
 */
const STRAIGHT = 1e-6

/**
 * The farthest a collapse may carry any corner, in mm: twice {@link SLIVER_RADIUS}, so two
 * neighbouring clusters a slicer would meld into each other can still become one corner.
 */
const MOVE_CAP = 2 * SLIVER_RADIUS

/** A face left out after a failure can split the rest; a hard stop for a pathological solid. */
const MAX_ATTEMPTS = 6

/** Relative slack on a face's area when checking its new triangles against its old polygons. */
const AREA_SLACK = 1e-7

/**
 * Re-triangulate every flat face that has a sliver in it. Mutates `polygons` and `ids` in place.
 *
 * @param {{ vertices: Vec3[] }[]} polygons
 * @param {number[][]} ids Per polygon, its vertices' corner ids, as `watertight.js` keys them.
 * @param {number} cornerCount
 * @param {Uint8Array} pinned 1 for a corner that must not be removed (on the bounding box).
 * @param {number} tolerance The serializer's weld radius, in mm: two polygons whose planes are this
 *   far apart over a thousand count as one flat face.
 * @returns {number} How many polygons were replaced or changed (0 when nothing was touched).
 */
export function cleanFlatFaces(polygons, ids, cornerCount, pinned, tolerance) {
  // A face that cannot be triangulated cleanly is left as it was, and the pass runs again
  // without it, so a corner is never dropped from a neighbour for a face that kept its polygons.
  const excluded = new Uint8Array(polygons.length)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const outcome = cleanOnce(polygons, ids, cornerCount, pinned, tolerance, excluded)
    if (outcome.failed.length === 0) return outcome.changed
    for (const index of outcome.failed) excluded[index] = 1
  }
  return 0
}

/**
 * One go at {@link cleanFlatFaces}, leaving `excluded` polygons out of every face. Changes
 * nothing when any face fails, and says which polygons it was made of.
 *
 * @param {{ vertices: Vec3[] }[]} polygons
 * @param {number[][]} ids
 * @param {number} cornerCount
 * @param {Uint8Array} pinned
 * @param {number} tolerance
 * @param {Uint8Array} excluded
 * @returns {{ changed: number, failed: number[] }}
 */
function cleanOnce(polygons, ids, cornerCount, pinned, tolerance, excluded) {
  const count = polygons.length
  // Per polygon: unit normal and offset (Newell), and whether it is a sliver.
  const nx = new Float64Array(count)
  const ny = new Float64Array(count)
  const nz = new Float64Array(count)
  const nw = new Float64Array(count)
  /** @type {number[]} */
  const seeds = []
  for (let index = 0; index < count; index += 1) {
    const { vertices } = polygons[index]
    let x = 0
    let y = 0
    let z = 0
    for (let corner = 0; corner < vertices.length; corner += 1) {
      const a = vertices[corner]
      const b = vertices[(corner + 1) % vertices.length]
      x += (a[1] - b[1]) * (a[2] + b[2])
      y += (a[2] - b[2]) * (a[0] + b[0])
      z += (a[0] - b[0]) * (a[1] + b[1])
    }
    const length = Math.hypot(x, y, z)
    if (!(length > 0)) continue
    nx[index] = x / length
    ny[index] = y / length
    nz[index] = z / length
    const first = vertices[0]
    nw[index] = nx[index] * first[0] + ny[index] * first[1] + nz[index] * first[2]
    if (excluded[index] === 0 && isSliver(vertices, ids[index], length / 2)) seeds.push(index)
  }
  if (seeds.length === 0) return { changed: 0, failed: [] }

  // Which polygons use each corner, as flat arrays (a corner → polygons index).
  const start = new Int32Array(cornerCount + 1)
  for (let index = 0; index < count; index += 1) for (const id of ids[index]) start[id + 1] += 1
  for (let id = 0; id < cornerCount; id += 1) start[id + 1] += start[id]
  const users = new Int32Array(start[cornerCount])
  const cursor = start.slice(0, cornerCount)
  for (let index = 0; index < count; index += 1) for (const id of ids[index]) users[cursor[id]++] = index

  /**
   * The polygon on the other side of the side `from → to` of polygon `index`, or -1.
   *
   * @param {number} index @param {number} from @param {number} to
   */
  const across = (index, from, to) => {
    for (let slot = start[to]; slot < start[to + 1]; slot += 1) {
      const other = users[slot]
      if (other === index) continue
      const otherIds = ids[other]
      for (let corner = 0; corner < otherIds.length; corner += 1) {
        if (otherIds[corner] === to && otherIds[(corner + 1) % otherIds.length] === from) return other
      }
    }
    return -1
  }
  /** @param {number} a @param {number} b */
  const coplanar = (a, b) => {
    const cx = ny[a] * nz[b] - nz[a] * ny[b]
    const cy = nz[a] * nx[b] - nx[a] * nz[b]
    const cz = nx[a] * ny[b] - ny[a] * nx[b]
    const dot = nx[a] * nx[b] + ny[a] * ny[b] + nz[a] * nz[b]
    return dot > 0 && cx * cx + cy * cy + cz * cz < 1e-18 && Math.abs(nw[a] - nw[b]) < tolerance * 1e-3
  }

  /**
   * A face's plane: the area-weighted normal of its polygons, through their first corners.
   *
   * @param {number[]} members
   * @returns {[number, number, number, number]}
   */
  const planeOf = (members) => {
    let x = 0
    let y = 0
    let z = 0
    let w = 0
    let weight = 0
    for (const index of members) {
      const area = polygonArea(polygons[index].vertices)
      x += nx[index] * area
      y += ny[index] * area
      z += nz[index] * area
      w += nw[index] * area
      weight += area
    }
    const length = Math.hypot(x, y, z)
    return [x / length, y / length, z / length, w / weight]
  }

  // Flood each sliver's flat face across coplanar neighbours.
  const faceOf = new Int32Array(count).fill(-1)
  /** @type {number[][]} */
  const faces = []
  /** @type {Map<number, [number, number, number, number]>} face → its plane (unit normal, offset) */
  const planes = new Map()
  for (const seed of seeds) {
    if (faceOf[seed] !== -1) continue
    const face = faces.length
    const members = [seed]
    faceOf[seed] = face
    for (let at = 0; at < members.length; at += 1) {
      const index = members[at]
      const polygonIds = ids[index]
      for (let corner = 0; corner < polygonIds.length; corner += 1) {
        const other = across(index, polygonIds[corner], polygonIds[(corner + 1) % polygonIds.length])
        if (other === -1 || faceOf[other] !== -1 || excluded[other] === 1 || !coplanar(index, other)) continue
        faceOf[other] = face
        members.push(other)
      }
    }
    // Then take in every neighbour that lies in the face's own plane to within the weld, however
    // its normal reads. A small polygon whose corners sit the weld apart from the face's (the
    // serializer fuses them; the kernel kept both) has a normal off by 1e-3 and fails the test
    // above, but left outside it is a flat sliver a collapse below would fold (measured at 96,600
    // triangles). The plane is the face's, fixed, so this cannot creep across a curved surface.
    if (members.length > 1) {
      const plane = planeOf(members)
      planes.set(face, plane)
      for (let at = 0; at < members.length; at += 1) {
        const index = members[at]
        const polygonIds = ids[index]
        for (let corner = 0; corner < polygonIds.length; corner += 1) {
          const other = across(index, polygonIds[corner], polygonIds[(corner + 1) % polygonIds.length])
          if (other === -1 || faceOf[other] !== -1 || excluded[other] === 1) continue
          if (nx[other] * plane[0] + ny[other] * plane[1] + nz[other] * plane[2] <= 0) continue
          if (!polygons[other].vertices.every((v) => Math.abs(plane[0] * v[0] + plane[1] * v[1] + plane[2] * v[2] - plane[3]) <= tolerance)) continue
          faceOf[other] = face
          members.push(other)
        }
      }
    }
    faces.push(members)
  }

  // One coordinate per corner id: the first walked, unless another vertex of that id touches the
  // bounding box. Vertices that share an id can differ by up to the weld, and a new triangle
  // given the one just inside the box would shrink it (measured: the pole of the scan, 6e-13 mm).
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const { vertices } of polygons) {
    for (const vertex of vertices) {
      for (let axis = 0; axis < 3; axis += 1) {
        if (vertex[axis] < min[axis]) min[axis] = vertex[axis]
        if (vertex[axis] > max[axis]) max[axis] = vertex[axis]
      }
    }
  }
  /** @param {Vec3} vertex */
  const onBox = (vertex) => [0, 1, 2].some((axis) => vertex[axis] === min[axis] || vertex[axis] === max[axis])
  /** @type {Vec3[]} */
  const coordinates = new Array(cornerCount)
  for (let index = 0; index < count; index += 1) {
    const { vertices } = polygons[index]
    const polygonIds = ids[index]
    for (let corner = 0; corner < vertices.length; corner += 1) {
      const id = polygonIds[corner]
      if (coordinates[id] === undefined || (pinned[id] === 1 && !onBox(coordinates[id]) && onBox(vertices[corner]))) coordinates[id] = vertices[corner]
    }
  }

  /** @type {Map<number, Outline>} face → its outline, for faces of two or more polygons. */
  const outlines = new Map()
  /** @type {number[]} Polygons to leave out of every face on the next go. */
  const failed = []
  for (let face = 0; face < faces.length; face += 1) {
    const members = faces[face]
    if (members.length < 2) {
      faceOf[members[0]] = -1
      continue
    }
    const outline = outlineOf(members, { polygons, ids, cornerCount, start, users, faceOf, coordinates, pinned }, face, [nx[members[0]], ny[members[0]], nz[members[0]]], tolerance)
    if ('bad' in outline) {
      // Leave out the polygons at the fault, and only them: the rest of the face is still a
      // face, and the polygons left out sit on its outline like any other neighbour.
      const bad = new Set(outline.bad)
      for (const index of members) if (bad.size === 0 || ids[index].some((id) => bad.has(id))) failed.push(index)
      continue
    }
    outlines.set(face, outline)
  }
  if (failed.length > 0) return { changed: 0, failed }
  if (outlines.size === 0) return { changed: 0, failed: [] }

  // Drop the corners on an outline that one other face, or one polygon, passes straight through.
  /** @type {Map<number, number[]>} polygon outside any face → its new corner ids */
  const trimmed = new Map()
  for (const [face, outline] of outlines) {
    for (const loop of outline.loops) {
      let at = 0
      let guard = loop.length * 2
      while (loop.length > 3 && guard > 0) {
        guard -= 1
        if (at >= loop.length) at = 0
        const id = loop[at]
        const previous = loop[(at - 1 + loop.length) % loop.length]
        const next = loop[(at + 1) % loop.length]
        if (removable(id, previous, next, face)) {
          loop.splice(at, 1)
          guard = loop.length * 2
          continue
        }
        at += 1
      }
    }
  }

  /**
   * Whether corner `id`, walked `previous → id → next` on `face`'s outline, can go: not pinned,
   * straight, and used by exactly one other thing that walks `next → id → previous` straight
   * through — either another sliver face's outline or a single polygon outside every face.
   *
   * @param {number} id @param {number} previous @param {number} next @param {number} face
   */
  function removable(id, previous, next, face) {
    if (pinned[id] === 1) return false
    if (!straight(coordinates[id], coordinates[previous], coordinates[next], STRAIGHT)) return false
    let otherFace = -1
    let outside = -1
    for (let slot = start[id]; slot < start[id + 1]; slot += 1) {
      const index = users[slot]
      const owner = faceOf[index]
      if (owner === face) continue
      if (owner !== -1) {
        if (otherFace !== -1 && otherFace !== owner) return false
        otherFace = owner
      } else {
        if (outside !== -1 && outside !== index) return false
        outside = index
      }
    }
    if ((otherFace === -1) === (outside === -1)) return false
    if (otherFace !== -1) {
      const other = /** @type {Outline} */ (outlines.get(otherFace))
      const loop = other.loops.find((candidate) => candidate.includes(id))
      if (!loop || loop.length <= 3 || !passesThrough(loop, id, next, previous)) return false
      loop.splice(loop.indexOf(id), 1)
      return true
    }
    const current = trimmed.get(outside) ?? ids[outside].slice()
    if (current.length <= 3 || !passesThrough(current, id, next, previous)) return false
    current.splice(current.indexOf(id), 1)
    trimmed.set(outside, current)
    return true
  }

  // Collapse every outline side shorter than a slicer's weld, and join two corners of one loop
  // that close (step 3 of the module comment). Repeated until nothing changes, because a collapse
  // can bring two other corners together.
  /** @type {Map<number, number>} corner collapsed → the corner it now is */
  const mergedInto = new Map()
  /** @type {Map<number, number[]>} corner → the corners collapsed onto it */
  const absorbed = new Map()
  for (const [face, outline] of outlines) {
    for (let sweep = 0; sweep < 8; sweep += 1) {
      let collapsed = 0
      for (const loop of outline.loops) collapsed += collapseShortSides(loop, face)
      collapsed += pinchNearCorners(outline, face)
      if (collapsed === 0) break
    }
  }

  /**
   * Collapse every side of `loop` shorter than the radius, once round. Mutates `loop`.
   *
   * @param {number[]} loop @param {number} face
   * @returns {number} How many corners went.
   */
  function collapseShortSides(loop, face) {
    let collapsed = 0
    let at = 0
    while (loop.length > 3 && at < loop.length) {
      const a = loop[at]
      const b = loop[(at + 1) % loop.length]
      if (distance(coordinates[a], coordinates[b]) >= SLIVER_RADIUS) {
        at += 1
        continue
      }
      // The later corner goes by default; the earlier one if only it can.
      let keep = a
      let drop = b
      let alongside = collapsible(drop, keep, face)
      if (alongside === null) {
        keep = b
        drop = a
        alongside = collapsible(drop, keep, face)
      }
      if (alongside === null) {
        at += 1
        continue
      }
      for (const other of alongside) other.splice(other.indexOf(drop), 1)
      const where = loop.indexOf(drop)
      loop.splice(where, 1)
      if (where < at) at -= 1
      absorb(drop, keep)
      collapsed += 1
    }
    return collapsed
  }

  /**
   * Two corners of one loop within the radius that are not neighbours on it: the face narrows
   * to a spike or a neck there. The later corner becomes the earlier, which splits the loop in
   * two at that corner; a part left with fewer than three corners was a zero-width spike and
   * goes. Only a corner that no other face uses can go this way. Mutates `outline.loops`.
   *
   * @param {Outline} outline @param {number} face
   * @returns {number} How many corners went.
   */
  function pinchNearCorners(outline, face) {
    let collapsed = 0
    for (let which = 0; which < outline.loops.length; which += 1) {
      const loop = outline.loops[which]
      const size = loop.length
      if (size < 5) continue
      let found = false
      for (let i = 0; i < size && !found; i += 1) {
        for (let j = i + 2; j < size && !found; j += 1) {
          if (i === 0 && j === size - 1) continue
          if (distance(coordinates[loop[i]], coordinates[loop[j]]) >= SLIVER_RADIUS) continue
          const keep = loop[i]
          const drop = loop[j]
          // `keep` is not beside `drop`, so this is `[]` only when no other face uses `drop`.
          if (collapsible(drop, keep, face)?.length !== 0) continue
          const inner = loop.slice(i, j)
          const outer = [...loop.slice(j + 1), ...loop.slice(0, i + 1)]
          const parts = [inner, outer].filter((part) => part.length >= 3)
          outline.loops.splice(which, 1, ...parts)
          absorb(drop, keep)
          collapsed += 1
          found = true
        }
      }
      if (found) which -= 1
    }
    return collapsed
  }

  /** @param {number} drop @param {number} keep */
  function absorb(drop, keep) {
    const taken = absorbed.get(drop) ?? []
    absorbed.delete(drop)
    for (const id of [drop, ...taken]) mergedInto.set(id, keep)
    absorbed.set(keep, [...(absorbed.get(keep) ?? []), drop, ...taken])
  }

  /**
   * {@link sharedSide}, after the corner-level rules: `drop` is not on the bounding box, is on
   * one loop of `face` only, every corner already collapsed onto it stays within
   * {@link MOVE_CAP} of `keep`, and the move folds nothing.
   *
   * @param {number} drop @param {number} keep @param {number} face
   * @returns {number[][] | null}
   */
  function collapsible(drop, keep, face) {
    if (pinned[drop] === 1) return null
    // A pinch leaves its corner on two loops of the face; it stays, or one loop would keep it.
    if (/** @type {Outline} */ (outlines.get(face)).loops.filter((loop) => loop.includes(drop)).length > 1) return null
    const there = coordinates[keep]
    for (const id of absorbed.get(drop) ?? []) {
      const here = coordinates[id]
      if (Math.hypot(here[0] - there[0], here[1] - there[1], here[2] - there[2]) >= MOVE_CAP) return null
    }
    const alongside = sharedSide(drop, keep, face)
    if (alongside === null || foldsNeighbour(drop, keep, face)) return null
    // The face's own loop, and the others losing `drop`, must not end up flat on another face.
    const own = /** @type {Outline} */ (outlines.get(face)).loops.find((loop) => loop.includes(drop))
    for (const loop of own ? [own, ...alongside] : alongside) {
      if (liesFlatOnAnother(loop.filter((id) => id !== drop), keep, face)) return null
    }
    return alongside
  }

  /**
   * Whether every corner of `loop` lies, to within the weld, on the plane of a face other than
   * `face` that uses `keep`: what was a thin wedge under that face would become a lid on it.
   *
   * @param {number[]} loop @param {number} keep @param {number} face
   */
  function liesFlatOnAnother(loop, keep, face) {
    for (const owner of facesUsing(keep)) {
      if (owner === face) continue
      const plane = /** @type {[number, number, number, number]} */ (planes.get(owner))
      if (loop.every((id) => Math.abs(plane[0] * coordinates[id][0] + plane[1] * coordinates[id][1] + plane[2] * coordinates[id][2] - plane[3]) <= tolerance)) return true
    }
    return false
  }

  /**
   * The faces whose polygons use `id`, or a corner collapsed onto it.
   *
   * @param {number} id
   * @returns {Set<number>}
   */
  function facesUsing(id) {
    /** @type {Set<number>} */
    const owners = new Set()
    for (const source of [id, ...(absorbed.get(id) ?? [])]) {
      for (let slot = start[source]; slot < start[source + 1]; slot += 1) {
        const owner = faceOf[users[slot]]
        if (owner !== -1 && outlines.has(owner)) owners.add(owner)
      }
    }
    return owners
  }

  /**
   * Whether moving `drop` onto `keep` would fold a polygon that is not being re-triangulated:
   * make it the same corners as another, walked the same way, turn one of the triangles the
   * serializer will cut it into over, or lay one flat on a face that uses `keep`. Measured at 96,600 triangles: a scan corner 21 micrometres below the
   * cutter's face, on the outline of a small sliver face of its own, collapsed onto a corner of
   * the cutter's face; the scan quad it belonged to kept a corner 85 micrometres off the face,
   * but the serializer's split of that quad laid one triangle flat on the face, wound the
   * other way.
   *
   * @param {number} drop @param {number} keep @param {number} face
   */
  function foldsNeighbour(drop, keep, face) {
    const facesAtKeep = facesUsing(keep)
    // Two polygons that would share every corner after the move: one is the other folded back
    // (measured on the tilted-cutter cut: the two scan triangles under a zero-width spike).
    const move = new Map([[drop, keep]])
    /** @type {Map<string, number[]>} */
    const shapes = new Map()
    /** @type {Set<number>} */
    const seen = new Set()
    for (const source of [drop, keep, ...(absorbed.get(drop) ?? []), ...(absorbed.get(keep) ?? [])]) {
      for (let slot = start[source]; slot < start[source + 1]; slot += 1) {
        const index = users[slot]
        if (faceOf[index] !== -1 || seen.has(index)) continue
        seen.add(index)
        const after = collapse(collapse(trimmed.get(index) ?? ids[index], mergedInto), move)
        if (after.length < 3) continue
        const shape = after.slice().sort((left, right) => left - right).join(',')
        const twin = shapes.get(shape)
        // The same corners walked the other way is a zero-volume fold the move closes, which
        // the commit removes, both polygons; the same way round is a fold it would make.
        if (twin !== undefined && !reverses(twin, after)) return true
        shapes.set(shape, after)
      }
    }
    for (const source of [drop, ...(absorbed.get(drop) ?? [])]) {
      for (let slot = start[source]; slot < start[source + 1]; slot += 1) {
        const index = users[slot]
        if (faceOf[index] !== -1) continue
        const before = collapse(trimmed.get(index) ?? ids[index], mergedInto)
        if (before.length < 3) continue
        const after = collapse(before, new Map([[drop, keep]]))
        if (after.length < 3) continue
        const from = newell(before.map((id) => coordinates[id]))
        // Judge it as the serializer will write it: triangle by triangle.
        for (const triangle of serializerTriangles(after.map((id) => coordinates[id]))) {
          const to = newell(triangle)
          if (from[0] * to[0] + from[1] * to[1] + from[2] * to[2] <= 0) return true
          for (const owner of facesAtKeep) {
            const plane = /** @type {[number, number, number, number]} */ (planes.get(owner))
            if (triangle.every((v) => Math.abs(plane[0] * v[0] + plane[1] * v[1] + plane[2] * v[2] - plane[3]) <= tolerance)) return true
          }
        }
      }
    }
    return false
  }

  /**
   * The other outlines that `drop` must also leave for the side `drop`–`keep` of `face` to
   * collapse, or `null` if it cannot: every polygon using `drop` must be in `face`, outside every
   * face (and not left out of one), or in a face whose outline also has the side `drop`–`keep`
   * (so it collapses there too).
   *
   * @param {number} drop @param {number} keep @param {number} face
   * @returns {number[][] | null}
   */
  function sharedSide(drop, keep, face) {
    /** @type {Set<number>} */
    const others = new Set()
    for (let slot = start[drop]; slot < start[drop + 1]; slot += 1) {
      // A polygon left out of its face after a fault is a flat sliver itself: moving its
      // corner would fold it, which is the very thing this pass is for.
      if (excluded[users[slot]] === 1) return null
      const owner = faceOf[users[slot]]
      if (owner !== face && owner !== -1) others.add(owner)
    }
    /** @type {number[][]} */
    const loops = []
    for (const owner of others) {
      const outline = /** @type {Outline} */ (outlines.get(owner))
      const loop = outline.loops.find((candidate) => candidate.includes(drop))
      if (!loop || loop.length <= 3) return null
      const at = loop.indexOf(drop)
      if (loop[(at + 1) % loop.length] !== keep && loop[(at - 1 + loop.length) % loop.length] !== keep) return null
      loops.push(loop)
    }
    return loops
  }

  /**
   * Sides of polygons outside `face` that join two corners of its outline: a fin standing on
   * the face (measured at 96,600 triangles, next to the `FIND-io-033` four-face edge). The new
   * triangles must not use one as a diagonal, or that side would carry four faces.
   *
   * @param {Outline} outline @param {number} face
   * @returns {Set<number>} Keyed `min(a, b) * cornerCount + max(a, b)`, in corner ids.
   */
  function chordsOf(outline, face) {
    const onOutline = new Set(outline.loops.flat())
    /** @type {Set<number>} */
    const chords = new Set()
    for (const id of onOutline) {
      for (const source of [id, ...(absorbed.get(id) ?? [])]) {
        for (let slot = start[source]; slot < start[source + 1]; slot += 1) {
          const index = users[slot]
          if (faceOf[index] === face) continue
          const polygonIds = trimmed.get(index) ?? ids[index]
          const at = polygonIds.indexOf(source)
          if (at === -1) continue
          for (const other of [polygonIds[(at + 1) % polygonIds.length], polygonIds[(at - 1 + polygonIds.length) % polygonIds.length]]) {
            const now = mergedInto.get(other) ?? other
            if (now !== id && onOutline.has(now)) chords.add(Math.min(id, now) * cornerCount + Math.max(id, now))
          }
        }
      }
    }
    return chords
  }

  // Triangulate each face from what is left.
  /** @type {Map<number, number[][]>} face → triangles as corner ids */
  const triangulated = new Map()
  for (const [face, outline] of outlines) {
    const members = faces[face]
    const reference = members[0]
    const chordSet = chordsOf(outline, face)
    const triangles = triangulateFace(outline.loops, coordinates, [nx[reference], ny[reference], nz[reference]], chordSet)
    if (triangles !== null) triangulated.set(face, triangles)
    else failed.push(...members)
  }
  if (failed.length > 0) return { changed: 0, failed }

  let changed = 0
  /** @type {number[]} Where in `keptPolygons` the polygons a collapse touched landed. */
  const collapsedAt = []
  /** @type {{ vertices: Vec3[] }[]} */
  const keptPolygons = []
  /** @type {number[][]} */
  const keptIds = []
  for (let index = 0; index < count; index += 1) {
    if (faceOf[index] !== -1) {
      changed += 1
      continue
    }
    let trim = trimmed.get(index)
    const collapsedHere = mergedInto.size > 0 && ids[index].some((id) => mergedInto.has(id))
    if (collapsedHere) trim = collapse(trim ?? ids[index], mergedInto)
    // Either of a pair the collapse folded shut uses the corner it kept.
    const atSurvivor = collapsedHere || (absorbed.size > 0 && ids[index].some((id) => absorbed.has(id)))
    if (trim) {
      changed += 1
      if (trim.length < 3) continue
      if (atSurvivor) collapsedAt.push(keptPolygons.length)
      // A corner it keeps keeps its own vertex; only a collapsed one takes its new corner's.
      const own = polygons[index].vertices
      const polygonIds = ids[index]
      keptPolygons.push({ vertices: trim.map((id) => (polygonIds.includes(id) ? own[polygonIds.indexOf(id)] : /** @type {Vec3} */ (coordinates[id]))) })
      keptIds.push(trim)
      continue
    }
    if (atSurvivor) collapsedAt.push(keptPolygons.length)
    keptPolygons.push(polygons[index])
    keptIds.push(ids[index])
  }
  // Two polygons a collapse made the same corners, walked opposite ways (the scan's two
  // triangles under a zero-width spike): a fold of no volume. Both go; every side they had is
  // still walked once each way by what is left.
  /** @type {Map<string, number>} */
  const collapsedShapes = new Map()
  const gone = new Uint8Array(keptPolygons.length)
  for (const at of collapsedAt) {
    const shape = keptIds[at].slice().sort((left, right) => left - right).join(',')
    const twin = collapsedShapes.get(shape)
    if (twin !== undefined && gone[twin] === 0 && reverses(keptIds[twin], keptIds[at])) {
      gone[twin] = 1
      gone[at] = 1
      changed += 2
      collapsedShapes.delete(shape)
    } else {
      collapsedShapes.set(shape, at)
    }
  }
  if (gone.includes(1)) {
    let write = 0
    for (let at = 0; at < keptPolygons.length; at += 1) {
      if (gone[at] === 1) continue
      keptPolygons[write] = keptPolygons[at]
      keptIds[write] = keptIds[at]
      write += 1
    }
    keptPolygons.length = write
    keptIds.length = write
  }
  for (const triangles of triangulated.values()) {
    for (const triangle of triangles) {
      keptPolygons.push({ vertices: triangle.map((id) => /** @type {Vec3} */ (coordinates[id])) })
      keptIds.push(triangle)
    }
  }
  polygons.length = 0
  ids.length = 0
  for (let at = 0; at < keptPolygons.length; at += 1) {
    polygons.push(keptPolygons[at])
    ids.push(keptIds[at])
  }
  return { changed, failed: [] }
}

/**
 * Whether two corner lists are the same loop walked opposite ways.
 *
 * @param {number[]} first @param {number[]} second
 */
function reverses(first, second) {
  if (first.length !== second.length) return false
  const start = second.indexOf(first[0])
  if (start === -1) return false
  for (let at = 0; at < first.length; at += 1) {
    if (first[at] !== second[(start - at + second.length) % second.length]) return false
  }
  return true
}

/**
 * A polygon's corner ids with collapsed corners replaced by the ones they became, and the
 * sides that shrank to nothing dropped. It can come back with fewer than three corners (the
 * polygon was a sliver along a collapsed side) or visiting a corner twice (left to
 * `watertight.js`'s loop split).
 *
 * @param {number[]} polygonIds @param {Map<number, number>} mergedInto
 * @returns {number[]}
 */
function collapse(polygonIds, mergedInto) {
  /** @type {number[]} */
  const kept = []
  for (const id of polygonIds) {
    const now = mergedInto.get(id) ?? id
    if (kept.length > 0 && kept[kept.length - 1] === now) continue
    kept.push(now)
  }
  while (kept.length > 1 && kept[kept.length - 1] === kept[0]) kept.pop()
  return kept
}

/**
 * @typedef {object} Outline
 * @property {number[][]} loops Corner ids, each loop walked the way the face's sides are.
 * @property {number} area The face's signed area, summed over its polygons, in mm².
 */

/**
 * Whether a polygon is thinner than {@link SLIVER_RADIUS} anywhere: two of its corners that
 * close, or a corner that close to a side it is not on.
 *
 * @param {Vec3[]} vertices
 * @param {number[]} polygonIds
 * @param {number} area
 * @returns {boolean}
 */
function isSliver(vertices, polygonIds, area) {
  let longest = 0
  for (let corner = 0; corner < vertices.length; corner += 1) {
    const a = vertices[corner]
    const b = vertices[(corner + 1) % vertices.length]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    if (length < SLIVER_RADIUS && polygonIds[corner] !== polygonIds[(corner + 1) % vertices.length]) return true
    if (length > longest) longest = length
  }
  // Every polygon here is convex or nearly so; its narrowest width is at most 2·area / longest side.
  return (2 * area) / longest < SLIVER_RADIUS
}

/**
 * The outline of one flat face: the sides its polygons walk that no other polygon of the face
 * walks back, chained into loops. When that is not a clean set of simple loops — a side walked
 * twice, two loops touching at a corner — or a corner inside the face (on no loop) is also used
 * outside it, the corners at fault come back as `bad` instead (empty: the whole face).
 *
 * The last one is measured, not hypothetical: at 96,600 triangles `FIND-io-031`'s cut has a scan
 * polygon lying along a crease inside the cutter's top face (the `FIND-io-033` four-face edge).
 *
 * Polygons that share a corner id may hold coordinates up to the weld radius apart, so the
 * outline's area (read at one coordinate per id) may differ from the polygons' own by up to that
 * times its length. Anything more means the outline is not this face's, and the whole face is bad.
 *
 * @param {number[]} members
 * @param {{ polygons: { vertices: Vec3[] }[], ids: number[][], cornerCount: number, start: Int32Array, users: Int32Array, faceOf: Int32Array, coordinates: Vec3[], pinned: Uint8Array }} mesh
 * @param {number} face
 * @param {Vec3} normal The face's unit normal; a polygon wound against it counts negative.
 * @param {number} weld The radius inside which two corners share an id, in mm.
 * @returns {Outline | { bad: number[] }}
 */
function outlineOf(members, mesh, face, normal, weld) {
  const { polygons, ids, cornerCount, start, users, faceOf, coordinates, pinned } = mesh
  /** @type {Map<number, number>} directed side → net walks */
  const sides = new Map()
  let area = 0
  for (const index of members) {
    const polygonIds = ids[index]
    for (let corner = 0; corner < polygonIds.length; corner += 1) {
      const from = polygonIds[corner]
      const to = polygonIds[(corner + 1) % polygonIds.length]
      const reverse = to * cornerCount + from
      const back = sides.get(reverse)
      if (back !== undefined) {
        if (back === 1) sides.delete(reverse)
        else sides.set(reverse, back - 1)
        continue
      }
      const key = from * cornerCount + to
      sides.set(key, (sides.get(key) ?? 0) + 1)
    }
    area += signedArea(polygons[index].vertices, normal)
  }
  /** @type {Map<number, number>} corner → the corner after it on the outline */
  const nextOf = new Map()
  for (const [key, walks] of sides) {
    const from = Math.floor(key / cornerCount)
    if (walks !== 1) return { bad: [from, key - from * cornerCount] }
    if (nextOf.has(from)) return { bad: [from] }
    nextOf.set(from, key - from * cornerCount)
  }
  /** @type {number[][]} */
  const loops = []
  const visited = new Set()
  for (const first of nextOf.keys()) {
    if (visited.has(first)) continue
    /** @type {number[]} */
    const loop = []
    let id = first
    while (!visited.has(id)) {
      visited.add(id)
      loop.push(id)
      const next = nextOf.get(id)
      if (next === undefined) return { bad: [id] }
      id = next
    }
    if (id !== first || loop.length < 3) return { bad: loop }
    loops.push(loop)
  }
  // A corner inside the face must belong to the face alone, and must not be on the bounding
  // box: it is about to disappear.
  for (const index of members) {
    for (const id of ids[index]) {
      if (visited.has(id)) continue
      if (pinned[id] === 1) return { bad: [id] }
      for (let slot = start[id]; slot < start[id + 1]; slot += 1) if (faceOf[users[slot]] !== face) return { bad: [id] }
    }
  }
  let outlineArea = 0
  let perimeter = 0
  for (const loop of loops) {
    const points = loop.map((id) => coordinates[id])
    outlineArea += signedArea(points, normal)
    for (let at = 0; at < points.length; at += 1) {
      const a = points[at]
      const b = points[(at + 1) % points.length]
      perimeter += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    }
  }
  if (Math.abs(outlineArea - area) > 2 * weld * perimeter + AREA_SLACK * Math.max(1, Math.abs(area))) return { bad: [] }
  return { loops, area }
}

/** @param {Vec3} a @param {Vec3} b @returns {number} */
function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
}

/**
 * The triangles `@jscad/stl-serializer` will cut a polygon into (its `generalize` →
 * `triangulatePolygons`): a triangle as it is, a quad along its first diagonal, anything larger
 * as a fan around its centroid.
 *
 * @param {Vec3[]} points
 * @returns {Vec3[][]}
 */
function serializerTriangles(points) {
  if (points.length === 3) return [points]
  if (points.length === 4) return [[points[0], points[1], points[2]], [points[0], points[2], points[3]]]
  /** @type {Vec3} */
  const middle = [0, 0, 0]
  for (const point of points) for (let axis = 0; axis < 3; axis += 1) middle[axis] += point[axis] / points.length
  return points.map((point, at) => [middle, point, points[(at + 1) % points.length]])
}

/**
 * A polygon's Newell vector: its normal, twice its area long.
 *
 * @param {Vec3[]} vertices @returns {Vec3}
 */
function newell(vertices) {
  let x = 0
  let y = 0
  let z = 0
  for (let corner = 0; corner < vertices.length; corner += 1) {
    const a = vertices[corner]
    const b = vertices[(corner + 1) % vertices.length]
    x += (a[1] - b[1]) * (a[2] + b[2])
    y += (a[2] - b[2]) * (a[0] + b[0])
    z += (a[0] - b[0]) * (a[1] + b[1])
  }
  return [x, y, z]
}

/** @param {Vec3[]} vertices @returns {number} Unsigned area. */
function polygonArea(vertices) {
  const [x, y, z] = newell(vertices)
  return Math.hypot(x, y, z) / 2
}

/**
 * A polygon's area as seen along `normal`: negative when it is wound the other way. Summed over
 * a face, a fold cancels the strip it lies on, exactly as its sides cancel in the outline.
 *
 * @param {Vec3[]} vertices @param {Vec3} normal @returns {number}
 */
function signedArea(vertices, normal) {
  let x = 0
  let y = 0
  let z = 0
  for (let corner = 0; corner < vertices.length; corner += 1) {
    const a = vertices[corner]
    const b = vertices[(corner + 1) % vertices.length]
    x += (a[1] - b[1]) * (a[2] + b[2])
    y += (a[2] - b[2]) * (a[0] + b[0])
    z += (a[0] - b[0]) * (a[1] + b[1])
  }
  return (x * normal[0] + y * normal[1] + z * normal[2]) / 2
}

/**
 * Whether `point` lies within `tolerance` of the segment `from`–`to`, strictly between its ends.
 *
 * @param {Vec3} point @param {Vec3} from @param {Vec3} to @param {number} tolerance
 */
function straight(point, from, to, tolerance) {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const dz = to[2] - from[2]
  const lengthSquared = dx * dx + dy * dy + dz * dz
  if (!(lengthSquared > 0)) return false
  const along = ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy + (point[2] - from[2]) * dz) / lengthSquared
  if (!(along > 0 && along < 1)) return false
  const ox = from[0] + dx * along - point[0]
  const oy = from[1] + dy * along - point[1]
  const oz = from[2] + dz * along - point[2]
  return ox * ox + oy * oy + oz * oz <= tolerance * tolerance
}

/**
 * Whether `loop` walks `before → id → after` consecutively.
 *
 * @param {number[]} loop @param {number} id @param {number} before @param {number} after
 */
function passesThrough(loop, id, before, after) {
  const at = loop.indexOf(id)
  if (at === -1 || loop.indexOf(id, at + 1) !== -1) return false
  return loop[(at - 1 + loop.length) % loop.length] === before && loop[(at + 1) % loop.length] === after
}

/**
 * Triangulate one flat face from its loops: each hole bridged into the outer loop around it,
 * ear clipping that always cuts the fattest ear left, then Delaunay flips. Every corner of every
 * loop is used and none is added. `null` if it cannot be done cleanly. There can be several
 * outer loops: a face pinched at a corner is two.
 *
 * @param {number[][]} loops Corner ids; outer loops counter-clockwise seen from `normal`, holes clockwise.
 * @param {Vec3[]} coordinates Per corner id.
 * @param {Vec3} normal The face's unit normal.
 * @param {Set<number>} [chords] Corner pairs (`min * count + max`, `count` the length of
 *   `coordinates`) the triangles must not join with a new side.
 * @returns {number[][] | null} Triangles as corner ids, wound like the face. They add up to the
 *   loops' area and are each wound the face's way, or the result is `null`.
 */
export function triangulateFace(loops, coordinates, normal, chords = new Set()) {
  // Project onto the plane's dominant axis, mirrored so the face stays counter-clockwise.
  const axis = Math.abs(normal[0]) >= Math.abs(normal[1]) && Math.abs(normal[0]) >= Math.abs(normal[2]) ? 0 : Math.abs(normal[1]) >= Math.abs(normal[2]) ? 1 : 2
  const uAxis = (axis + 1) % 3
  const vAxis = (axis + 2) % 3
  const flip = normal[axis] < 0
  const origin = coordinates[loops[0][0]]
  /** @type {number[]} */
  const pointIds = []
  /** @type {number[]} */
  const us = []
  /** @type {number[]} */
  const vs = []
  const rings = loops.map((loop) =>
    loop.map((id) => {
      const point = coordinates[id]
      pointIds.push(id)
      us.push(point[uAxis] - origin[uAxis])
      vs.push(flip ? -(point[vAxis] - origin[vAxis]) : point[vAxis] - origin[vAxis])
      return pointIds.length - 1
    })
  )
  const count = coordinates.length
  /** Whether a new side between two points would lie on a forbidden chord. @param {number} a @param {number} b */
  const forbidden = (a, b) => chords.size > 0 && chords.has(Math.min(pointIds[a], pointIds[b]) * count + Math.max(pointIds[a], pointIds[b]))
  // How much a projected area is worth in the plane.
  const scale = 1 / Math.abs(normal[axis])
  const signed = rings.map((ring) => ringArea(ring, us, vs))
  const expected = signed.reduce((sum, value) => sum + value, 0) * scale
  const outers = rings.filter((_, at) => signed[at] > 0)
  if (outers.length === 0) return null
  /** @type {number[][][]} Per outer loop, the holes inside it. */
  const holesOf = outers.map(() => [])
  for (let at = 0; at < rings.length; at += 1) {
    if (!(signed[at] < 0)) continue
    const hole = rings[at]
    // The smallest outer loop that holds a corner of the hole no outer loop shares.
    let home = -1
    let homeArea = Infinity
    for (let which = 0; which < outers.length; which += 1) {
      const outer = outers[which]
      const ids = new Set(outer.map((point) => pointIds[point]))
      const probe = hole.find((point) => !ids.has(pointIds[point]))
      if (probe === undefined || !insideRing(probe, outer, us, vs)) continue
      const area = ringArea(outer, us, vs)
      if (area < homeArea) {
        home = which
        homeArea = area
      }
    }
    if (home === -1) return null
    holesOf[home].push(hole)
  }
  /** @type {number[][]} */
  const triangles = []
  for (let which = 0; which < outers.length; which += 1) {
    const ring = bridgeHoles(outers[which], holesOf[which], us, vs, forbidden)
    if (ring === null) return null
    const part = clipEars(ring, us, vs, forbidden)
    if (part === null) return null
    triangles.push(...part)
  }
  flipToDelaunay(triangles, us, vs, forbidden)

  let total = 0
  for (const [a, b, c] of triangles) {
    const doubled = (us[b] - us[a]) * (vs[c] - vs[a]) - (vs[b] - vs[a]) * (us[c] - us[a])
    if (!(doubled > 0)) return null
    if (pointIds[a] === pointIds[b] || pointIds[b] === pointIds[c] || pointIds[c] === pointIds[a]) return null
    total += (doubled / 2) * scale
  }
  if (Math.abs(total - expected) > AREA_SLACK * Math.max(1, Math.abs(expected))) return null
  return triangles.map((triangle) => triangle.map((point) => pointIds[point]))
}

/**
 * Even-odd point in polygon.
 *
 * @param {number} point @param {number[]} ring @param {number[]} us @param {number[]} vs
 */
function insideRing(point, ring, us, vs) {
  const u = us[point]
  const v = vs[point]
  let inside = false
  for (let at = 0, before = ring.length - 1; at < ring.length; before = at, at += 1) {
    const a = ring[at]
    const b = ring[before]
    if (vs[a] > v !== vs[b] > v && u < ((us[b] - us[a]) * (v - vs[a])) / (vs[b] - vs[a]) + us[a]) inside = !inside
  }
  return inside
}

/** @param {number[]} ring @param {number[]} us @param {number[]} vs @returns {number} */
function ringArea(ring, us, vs) {
  let sum = 0
  for (let at = 0; at < ring.length; at += 1) {
    const a = ring[at]
    const b = ring[(at + 1) % ring.length]
    sum += us[a] * vs[b] - us[b] * vs[a]
  }
  return sum / 2
}

/** @param {number} a @param {number} b @param {number} c @param {number[]} us @param {number[]} vs */
function orient(a, b, c, us, vs) {
  return (us[b] - us[a]) * (vs[c] - vs[a]) - (vs[b] - vs[a]) * (us[c] - us[a])
}

/**
 * Whether segments `ab` and `cd` touch anywhere (collinear overlap included).
 *
 * @param {number} a @param {number} b @param {number} c @param {number} d
 * @param {number[]} us @param {number[]} vs
 */
function segmentsTouch(a, b, c, d, us, vs) {
  const d1 = orient(c, d, a, us, vs)
  const d2 = orient(c, d, b, us, vs)
  const d3 = orient(a, b, c, us, vs)
  const d4 = orient(a, b, d, us, vs)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  /** @param {number} p @param {number} q @param {number} r */
  const onSegment = (p, q, r) =>
    Math.min(us[p], us[q]) <= us[r] && us[r] <= Math.max(us[p], us[q]) && Math.min(vs[p], vs[q]) <= vs[r] && vs[r] <= Math.max(vs[p], vs[q])
  return (d1 === 0 && onSegment(c, d, a)) || (d2 === 0 && onSegment(c, d, b)) || (d3 === 0 && onSegment(a, b, c)) || (d4 === 0 && onSegment(a, b, d))
}

/**
 * Join every hole to the outer loop with a two-way cut, earcut style: the hole's rightmost
 * corner to the nearest outer corner it can see.
 *
 * @param {number[]} outer @param {number[][]} holes @param {number[]} us @param {number[]} vs
 * @param {(a: number, b: number) => boolean} forbidden
 * @returns {number[] | null}
 */
function bridgeHoles(outer, holes, us, vs, forbidden) {
  let ring = outer.slice()
  const pending = holes.map((hole) => {
    let best = 0
    for (let at = 1; at < hole.length; at += 1) if (us[hole[at]] > us[hole[best]]) best = at
    return { hole, at: best }
  })
  pending.sort((left, right) => us[right.hole[right.at]] - us[left.hole[left.at]])
  for (let which = 0; which < pending.length; which += 1) {
    const { hole, at } = pending[which]
    const m = hole[at]
    const order = ring.map((_, index) => index)
    order.sort((left, right) => Math.hypot(us[ring[left]] - us[m], vs[ring[left]] - vs[m]) - Math.hypot(us[ring[right]] - us[m], vs[ring[right]] - vs[m]))
    let chosen = -1
    for (const index of order) {
      const p = ring[index]
      if (forbidden(p, m)) continue
      if (!insideWedge(ring[(index - 1 + ring.length) % ring.length], p, ring[(index + 1) % ring.length], m, us, vs)) continue
      if (!clearOf(p, m, ring, us, vs)) continue
      let blocked = false
      for (let other = which; other < pending.length && !blocked; other += 1) blocked = !clearOf(p, m, pending[other].hole, us, vs)
      if (blocked) continue
      chosen = index
      break
    }
    if (chosen === -1) return null
    const walk = [...hole.slice(at), ...hole.slice(0, at), m]
    ring = [...ring.slice(0, chosen + 1), ...walk, ring[chosen], ...ring.slice(chosen + 1)]
  }
  return ring
}

/**
 * Whether direction `p → m` leaves `p` into the polygon, between its sides `a → p → b`.
 *
 * @param {number} a @param {number} p @param {number} b @param {number} m @param {number[]} us @param {number[]} vs
 */
function insideWedge(a, p, b, m, us, vs) {
  if (orient(a, p, b, us, vs) > 0) return orient(a, p, m, us, vs) > 0 && orient(p, b, m, us, vs) > 0
  return orient(a, p, m, us, vs) > 0 || orient(p, b, m, us, vs) > 0
}

/**
 * Whether segment `p`–`m` crosses or touches no side of `ring` except at `p` or `m` themselves.
 *
 * @param {number} p @param {number} m @param {number[]} ring @param {number[]} us @param {number[]} vs
 */
function clearOf(p, m, ring, us, vs) {
  for (let at = 0; at < ring.length; at += 1) {
    const a = ring[at]
    const b = ring[(at + 1) % ring.length]
    if (a === p || b === p || a === m || b === m) continue
    if (samePoint(a, p, us, vs) || samePoint(b, p, us, vs) || samePoint(a, m, us, vs) || samePoint(b, m, us, vs)) continue
    if (segmentsTouch(p, m, a, b, us, vs)) return false
  }
  return true
}

/** @param {number} a @param {number} b @param {number[]} us @param {number[]} vs */
function samePoint(a, b, us, vs) {
  return us[a] === us[b] && vs[a] === vs[b]
}

/**
 * Ear clipping over a counter-clockwise ring (bridges allowed: a point may appear twice),
 * always cutting the ear whose narrowest height is greatest.
 *
 * @param {number[]} ring Point indices.
 * @param {number[]} us @param {number[]} vs
 * @param {(a: number, b: number) => boolean} forbidden A closing side the ear must not have.
 * @returns {number[][] | null} Triangles as point indices.
 */
function clipEars(ring, us, vs, forbidden) {
  const size = ring.length
  const point = Int32Array.from(ring)
  const prev = new Int32Array(size)
  const next = new Int32Array(size)
  for (let node = 0; node < size; node += 1) {
    prev[node] = (node - 1 + size) % size
    next[node] = (node + 1) % size
  }
  const removed = new Uint8Array(size)
  const version = new Int32Array(size)
  let remaining = size
  /** @type {number[][]} */
  const triangles = []
  const heap = new EarHeap()

  /** @param {number} node @returns {number} The ear's narrowest height, or -1 if it is no ear. */
  const earQuality = (node) => {
    const a = point[prev[node]]
    const b = point[node]
    const c = point[next[node]]
    const doubled = orient(a, b, c, us, vs)
    if (!(doubled > 0)) return -1
    // The last triangle closes nothing new; any other ear adds the side a–c.
    if (remaining > 3 && forbidden(a, c)) return -1
    for (let other = next[next[node]]; other !== prev[node]; other = next[other]) {
      const p = point[other]
      if (p === a || p === b || p === c || samePoint(p, a, us, vs) || samePoint(p, b, us, vs) || samePoint(p, c, us, vs)) continue
      if (orient(point[prev[other]], p, point[next[other]], us, vs) > 0) continue
      if (orient(a, b, p, us, vs) >= 0 && orient(b, c, p, us, vs) >= 0 && orient(c, a, p, us, vs) >= 0) return -1
    }
    const longest = Math.max(Math.hypot(us[b] - us[a], vs[b] - vs[a]), Math.hypot(us[c] - us[b], vs[c] - vs[b]), Math.hypot(us[a] - us[c], vs[a] - vs[c]))
    return doubled / longest
  }
  const consider = (/** @type {number} */ node) => {
    version[node] += 1
    const quality = earQuality(node)
    if (quality >= 0) heap.push(quality, node, version[node])
  }
  for (let node = 0; node < size; node += 1) consider(node)

  while (remaining > 3) {
    const entry = heap.pop()
    if (entry === undefined) {
      // Clipping can turn a non-ear into an ear without touching it; look again once.
      let found = false
      for (let node = 0; node < size; node += 1) {
        if (removed[node]) continue
        consider(node)
        found = true
      }
      if (!found || heap.size === 0) return null
      continue
    }
    const [, node, stamp] = entry
    if (removed[node] || stamp !== version[node]) continue
    triangles.push([point[prev[node]], point[node], point[next[node]]])
    removed[node] = 1
    next[prev[node]] = next[node]
    prev[next[node]] = prev[node]
    remaining -= 1
    consider(prev[node])
    consider(next[node])
  }
  let last = 0
  while (removed[last]) last += 1
  triangles.push([point[prev[last]], point[last], point[next[last]]])
  return triangles
}

/**
 * Lawson flips: while two triangles that share a side have the far corner of one inside the
 * other's circumcircle, swap that side for the other diagonal. The outline's sides are walked by
 * one triangle only and never move. What comes out is the constrained Delaunay triangulation of
 * the face's corners, the one with the largest smallest angle — ear clipping alone still cuts a
 * slim ear where three outline corners are nearly in line (0.56 micrometres high, measured on
 * the 32,320-triangle cut). Mutates `triangles` (point indices, counter-clockwise).
 *
 * @param {number[][]} triangles @param {number[]} us @param {number[]} vs
 * @param {(a: number, b: number) => boolean} forbidden A side a flip must not create.
 */
function flipToDelaunay(triangles, us, vs, forbidden) {
  /** @type {Map<string, number>} directed side `a,b` → the triangle walking it */
  const owner = new Map()
  const key = (/** @type {number} */ a, /** @type {number} */ b) => `${a},${b}`
  const own = (/** @type {number} */ index) => {
    const [a, b, c] = triangles[index]
    owner.set(key(a, b), index)
    owner.set(key(b, c), index)
    owner.set(key(c, a), index)
  }
  for (let index = 0; index < triangles.length; index += 1) own(index)
  /** @type {[number, number][]} */
  const queue = []
  for (const triangle of triangles) for (let at = 0; at < 3; at += 1) queue.push([triangle[at], triangle[(at + 1) % 3]])
  let budget = 20 * triangles.length + 100
  while (queue.length > 0 && budget > 0) {
    const [a, b] = /** @type {[number, number]} */ (queue.pop())
    const first = owner.get(key(a, b))
    const second = owner.get(key(b, a))
    if (first === undefined || second === undefined) continue
    const c = /** @type {number} */ (triangles[first].find((point) => point !== a && point !== b))
    const d = /** @type {number} */ (triangles[second].find((point) => point !== a && point !== b))
    if (c === d) continue
    // Only a convex quad can flip, and only when it is clearly better: d inside the circle.
    if (!(orient(c, a, d, us, vs) > 0 && orient(d, b, c, us, vs) > 0)) continue
    if (forbidden(c, d) || !inCircle(a, b, c, d, us, vs)) continue
    budget -= 1
    for (const side of [key(a, b), key(b, a), key(b, c), key(c, a), key(a, d), key(d, b)]) owner.delete(side)
    triangles[first] = [c, a, d]
    triangles[second] = [d, b, c]
    own(first)
    own(second)
    queue.push([c, a], [a, d], [d, b], [b, c])
  }
}

/**
 * Whether `d` lies clearly inside the circle through the counter-clockwise triangle `a, b, c`,
 * with a relative margin so that four corners on one circle never flip back and forth.
 *
 * @param {number} a @param {number} b @param {number} c @param {number} d
 * @param {number[]} us @param {number[]} vs
 */
function inCircle(a, b, c, d, us, vs) {
  const ax = us[a] - us[d]
  const ay = vs[a] - vs[d]
  const bx = us[b] - us[d]
  const by = vs[b] - vs[d]
  const cx = us[c] - us[d]
  const cy = vs[c] - vs[d]
  const a2 = ax * ax + ay * ay
  const b2 = bx * bx + by * by
  const c2 = cx * cx + cy * cy
  const determinant = ax * (by * c2 - b2 * cy) - ay * (bx * c2 - b2 * cx) + a2 * (bx * cy - by * cx)
  const scale = Math.max(a2, b2, c2)
  return determinant > 1e-12 * scale * scale
}

/** A max-heap of `[quality, node, version]` for {@link clipEars}. */
class EarHeap {
  constructor() {
    /** @type {[number, number, number][]} */
    this.items = []
  }

  get size() {
    return this.items.length
  }

  /** @param {number} quality @param {number} node @param {number} stamp */
  push(quality, node, stamp) {
    const { items } = this
    items.push([quality, node, stamp])
    let at = items.length - 1
    while (at > 0) {
      const parent = (at - 1) >> 1
      if (items[parent][0] > items[at][0] || (items[parent][0] === items[at][0] && items[parent][1] <= items[at][1])) break
      ;[items[parent], items[at]] = [items[at], items[parent]]
      at = parent
    }
  }

  /** @returns {[number, number, number] | undefined} */
  pop() {
    const { items } = this
    if (items.length === 0) return undefined
    const top = items[0]
    const last = /** @type {[number, number, number]} */ (items.pop())
    if (items.length > 0) {
      items[0] = last
      let at = 0
      for (;;) {
        const left = 2 * at + 1
        const right = left + 1
        let best = at
        if (left < items.length && better(items[left], items[best])) best = left
        if (right < items.length && better(items[right], items[best])) best = right
        if (best === at) break
        ;[items[best], items[at]] = [items[at], items[best]]
        at = best
      }
    }
    return top
  }
}

/** @param {[number, number, number]} a @param {[number, number, number]} b */
function better(a, b) {
  return a[0] > b[0] || (a[0] === b[0] && a[1] < b[1])
}
