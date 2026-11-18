// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * CuraEngine's mesh-loading check, re-implemented for the export specs (`TODO/FIND-io-032`).
 *
 * This is the logic of CuraEngine 5.x `src/mesh.cpp` (`Mesh::addFace`, `findIndexOfVertex`,
 * `getFaceIdxWithPoints`), written out in JavaScript so a spec can ask what Cura will say about a
 * file without the Cura binary. Checked against the real `CuraEngine slice` on the
 * `FIND-io-031` table: it names the same overlapping face pairs, by Cura's own face index.
 *
 * What Cura does on load, and so what this does:
 *
 * - Every coordinate becomes an integer number of micrometres (`MM2INT`, rounding half away
 *   from zero).
 * - A corner joins the first earlier corner **in the same hash cell** within 30 micrometres
 *   (`vertex_meld_distance`). Cells are 30 micrometres wide with a half-cell offset, so two
 *   corners closer than that but on either side of a cell boundary are not joined: the meld is
 *   uneven, which is why a thin strip folds rather than vanishing.
 * - A triangle left with two corners on one is dropped.
 * - For each side of each triangle, the other triangles on it are found. None is a
 *   *disconnected* face. With two or more, the angle to each is measured, and an angle of exactly
 *   0 — a neighbour lying flat in the same plane — is *overlapping faces*.
 *
 * @module core/kernel/__fixtures__/curaMesh
 */

/** `vertex_meld_distance = MM2INT(0.03)`, in micrometres. */
const MELD = 30

/**
 * What CuraEngine would report about a binary STL as it loads it.
 *
 * @param {Uint8Array} bytes
 * @returns {{ faces: number, dropped: number, overlapping: number, disconnected: number }}
 *   `overlapping` and `disconnected` count Cura's debug lines (a pair is reported from both sides).
 */
export function curaMeshCheck(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(80, true)
  /** @param {number} n */
  const mm2int = (n) => Math.trunc(n * 1000 + 0.5 * (Number(n > 0) - Number(n < 0)))
  /** @param {number} v */
  const cell = (v) => BigInt(Math.trunc((v + MELD / 2) / MELD))
  /** @param {number[]} p */
  const hashOf = (p) => Number(BigInt.asUintN(32, cell(p[0]) ^ (cell(p[1]) << 10n) ^ (cell(p[2]) << 20n)))
  /** @type {number[][]} */
  const vertices = []
  /** @type {number[][]} */
  const connected = []
  /** @type {Map<number, number[]>} */
  const buckets = new Map()
  /** @param {number[]} p */
  const indexOf = (p) => {
    const hash = hashOf(p)
    let bucket = buckets.get(hash)
    if (bucket) {
      for (const index of bucket) {
        const q = vertices[index]
        const dx = q[0] - p[0]
        const dy = q[1] - p[1]
        const dz = q[2] - p[2]
        if (Math.abs(dx) <= MELD && Math.abs(dy) <= MELD && Math.abs(dz) <= MELD && dx * dx + dy * dy + dz * dz <= MELD * MELD) return index
      }
    } else {
      bucket = []
      buckets.set(hash, bucket)
    }
    bucket.push(vertices.length)
    vertices.push(p)
    connected.push([])
    return vertices.length - 1
  }
  /** @type {number[][]} */
  const faces = []
  for (let triangle = 0; triangle < count; triangle += 1) {
    const base = 84 + 50 * triangle + 12
    /** @type {number[]} */
    const corners = []
    for (let corner = 0; corner < 3; corner += 1) {
      corners.push(indexOf([0, 1, 2].map((axis) => mm2int(view.getFloat32(base + 12 * corner + 4 * axis, true)))))
    }
    if (corners[0] === corners[1] || corners[1] === corners[2] || corners[0] === corners[2]) continue
    for (const index of corners) connected[index].push(faces.length)
    faces.push(corners)
  }

  /** @param {number[]} a @param {number[]} b */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
  /** @param {number[]} a @param {number[]} b */
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  /** @param {number[]} a @param {number[]} b */
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  let overlapping = 0
  let disconnected = 0
  /** @param {number} i0 @param {number} i1 @param {number} self @param {number} third */
  const side = (i0, i1, self, third) => {
    const candidates = connected[i0].filter((face) => face !== self && faces[face].includes(i1))
    if (candidates.length === 0) {
      disconnected += 1
      return
    }
    if (candidates.length === 1) return
    if (candidates.length % 2 === 0) disconnected += 1
    const v0 = sub(vertices[i1], vertices[i0])
    const length = Math.hypot(v0[0], v0[1], v0[2])
    const n = v0.map((x) => x / length)
    const n0 = cross(sub(vertices[third], vertices[i0]), v0)
    for (const face of candidates) {
      const other = /** @type {number} */ (faces[face].find((index) => index !== i0 && index !== i1))
      const n1 = cross(v0, sub(vertices[other], vertices[i0]))
      let angle = Math.atan2(dot(n, cross(n0, n1)), dot(n0, n1))
      if (angle < 0) angle += 2 * Math.PI
      if (angle === 0) overlapping += 1
    }
  }
  for (let face = 0; face < faces.length; face += 1) {
    const [a, b, c] = faces[face]
    side(a, b, face, c)
    side(b, c, face, a)
    side(c, a, face, b)
  }
  return { faces: faces.length, dropped: count - faces.length, overlapping, disconnected }
}
