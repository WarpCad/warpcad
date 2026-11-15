// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Generated dense meshes for the export-repair specs (`TODO/FIND-io-031`): closed,
 * outward-wound, welded triangle meshes in the shape `asset.mesh` decodes to
 * (`Float32Array` positions, `Uint32Array` indices), so a spec can hand them straight to
 * `solidFromMesh` exactly as an imported file reaches the kernel.
 *
 * They are generated rather than downloaded: `FIND-testing-023` found the defect with a
 * generated scan-like blob, and a generator keeps the case on every engine with no file
 * or licence to carry.
 *
 * @module core/kernel/__fixtures__/denseMeshes
 */

/**
 * @typedef {object} IndexedMesh
 * @property {Float32Array} positions xyz per vertex, in file units.
 * @property {Uint32Array} indices Three vertex indices per triangle, outward-wound.
 * @property {number} triangleCount
 */

/**
 * A lumpy, scan-like UV sphere: the blob `FIND-testing-023` generated (a 3 in blob with
 * four bumps and two ripples), authored in **inches**, its pole axis along Z. Each
 * pole is one shared vertex, so the mesh is closed with no weld needed.
 *
 * Triangle count is `lon × (2 × lat − 2)`: `lon 160, lat 102` is the 32,320-triangle
 * row of the finding's table, `lon 60, lat 42` the 4,920 one.
 *
 * @param {{ lon: number, lat: number }} size Segments around and pole to pole (`lat ≥ 2`).
 * @returns {IndexedMesh}
 */
export function lumpyScan({ lon, lat }) {
  const bumps = [
    [0.3, 0.2, 0.35, 0.18],
    [2.0, 0.9, 0.25, 0.12],
    [4.0, 1.8, 0.2, 0.1],
    [5.2, 0.6, 0.15, 0.15],
  ]
  let seed = 12345
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
  const phase = Array.from({ length: 8 }, () => random() * 6.283)
  /** Radius in inches at polar angle `theta` and azimuth `phi`. */
  const radius = (/** @type {number} */ theta, /** @type {number} */ phi) => {
    let value = 1.5
    value *= 1 + 0.25 * Math.sin(2 * phi + phase[0]) * Math.sin(theta) + 0.12 * Math.cos(3 * theta + phase[1])
    for (const [bumpPhi, bumpTheta, width, amplitude] of bumps) {
      const dPhi = Math.atan2(Math.sin(phi - bumpPhi), Math.cos(phi - bumpPhi))
      const dTheta = theta - bumpTheta
      value *= 1 + amplitude * Math.exp(-(dPhi * dPhi + dTheta * dTheta) / (width * width))
    }
    value *= 1 + 0.004 * Math.sin(61 * theta + 3 * phase[2]) * Math.sin(47 * phi + phase[3]) + 0.003 * Math.sin(113 * theta + 89 * phi)
    return value
  }

  // Vertex 0 is the north pole, then (lat − 1) rings of `lon`, then the south pole.
  const vertexCount = 2 + (lat - 1) * lon
  const positions = new Float32Array(vertexCount * 3)
  /** @param {number} index @param {number} theta @param {number} phi @param {boolean} pole */
  const put = (index, theta, phi, pole) => {
    const r = radius(theta, pole ? 0 : phi)
    const s = pole ? 0 : Math.sin(theta)
    positions[index * 3] = r * s * Math.cos(phi)
    positions[index * 3 + 1] = r * s * Math.sin(phi)
    positions[index * 3 + 2] = r * Math.cos(theta) + 1.8
  }
  put(0, 0, 0, true)
  for (let ring = 1; ring < lat; ring += 1) {
    for (let step = 0; step < lon; step += 1) put(1 + (ring - 1) * lon + step, (Math.PI * ring) / lat, (2 * Math.PI * step) / lon, false)
  }
  const south = vertexCount - 1
  put(south, Math.PI, 0, true)

  /** @param {number} ring 0 … lat @param {number} step */
  const at = (ring, step) => (ring === 0 ? 0 : ring === lat ? south : 1 + (ring - 1) * lon + (step % lon))
  /** @type {number[]} */
  const indices = []
  // a → b runs east and c is south-east of it, so a, b, c would face inward: every
  // triangle is written a, c, b instead, the order the generated STL used.
  for (let ring = 0; ring < lat; ring += 1) {
    for (let step = 0; step < lon; step += 1) {
      const a = at(ring, step)
      const b = at(ring, step + 1)
      const c = at(ring + 1, step + 1)
      const d = at(ring + 1, step)
      if (ring === 0) indices.push(a, d, c)
      else if (ring === lat - 1) indices.push(a, d, b)
      else indices.push(a, c, b, a, d, c)
    }
  }
  return { positions, indices: Uint32Array.from(indices), triangleCount: indices.length / 3 }
}

/**
 * A box tessellated as a scan of one would be: every face an `n × n` grid of quads, each
 * split into two triangles, with shared vertices along the edges. Axis-aligned from
 * `[0, 0, 0]` to `size`, in file units, so a cutter can be laid exactly coplanar with a face.
 *
 * Triangle count is `12 × n²`.
 *
 * @param {{ n: number, size: [number, number, number] }} options
 * @returns {IndexedMesh}
 */
export function denseBox({ n, size }) {
  /** @type {Map<string, number>} */
  const ids = new Map()
  /** @type {number[]} */
  const coords = []
  /** @param {number} i @param {number} j @param {number} k grid steps along x, y, z */
  const vertex = (i, j, k) => {
    const key = `${i},${j},${k}`
    let id = ids.get(key)
    if (id === undefined) {
      id = coords.length / 3
      ids.set(key, id)
      coords.push((size[0] * i) / n, (size[1] * j) / n, (size[2] * k) / n)
    }
    return id
  }
  /** @type {number[]} */
  const indices = []
  // Each face: a fixed axis at 0 or n, and two running axes ordered so u × v points out.
  /** @type {[number, number, number, number][]} [fixed axis, fixed value, u axis, v axis] */
  const faces = [
    [2, n, 0, 1],
    [2, 0, 1, 0],
    [0, n, 1, 2],
    [0, 0, 2, 1],
    [1, n, 2, 0],
    [1, 0, 0, 2],
  ]
  for (const [fixed, value, u, v] of faces) {
    /** @param {number} a @param {number} b */
    const corner = (a, b) => {
      const step = [0, 0, 0]
      step[fixed] = value
      step[u] = a
      step[v] = b
      return vertex(step[0], step[1], step[2])
    }
    for (let a = 0; a < n; a += 1) {
      for (let b = 0; b < n; b += 1) {
        const p = corner(a, b)
        const q = corner(a + 1, b)
        const r = corner(a + 1, b + 1)
        const s = corner(a, b + 1)
        indices.push(p, q, r, p, r, s)
      }
    }
  }
  return { positions: Float32Array.from(coords), indices: Uint32Array.from(indices), triangleCount: indices.length / 3 }
}
