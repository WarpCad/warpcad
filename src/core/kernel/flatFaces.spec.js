// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The flat-face sliver pass (`TODO/FIND-io-032`) on small, hand-built cases. The dense-scan
 * reproductions, measured against CuraEngine's own load check, are in `watertightDense.spec.js`.
 */
import { describe, expect, it } from 'vitest'

import { SLIVER_RADIUS, cleanFlatFaces, triangulateFace } from './flatFaces.js'

/** @typedef {[number, number, number]} Vec3 */

/** @param {Vec3[]} points @param {number[][]} triangles @returns {number} Total area seen from +z. */
function areaFromAbove(points, triangles) {
  let total = 0
  for (const [a, b, c] of triangles) {
    total += ((points[b][0] - points[a][0]) * (points[c][1] - points[a][1]) - (points[b][1] - points[a][1]) * (points[c][0] - points[a][0])) / 2
  }
  return total
}

describe('triangulateFace', () => {
  const up = /** @type {Vec3} */ ([0, 0, 1])

  it('keeps a corner that sits on a straight side, since a neighbour still uses it', () => {
    /** @type {Vec3[]} */
    const points = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 5, 0],
      [10, 10, 0],
      [0, 10, 0],
    ]
    const triangles = /** @type {number[][]} */ (triangulateFace([[0, 1, 2, 3, 4]], points, up))
    expect(triangles).toHaveLength(3)
    expect(new Set(triangles.flat())).toEqual(new Set([0, 1, 2, 3, 4]))
    for (const triangle of triangles) expect(areaFromAbove(points, [triangle])).toBeGreaterThan(0)
    expect(areaFromAbove(points, triangles)).toBeCloseTo(100, 12)
  })

  it('bridges a hole into the outer loop', () => {
    /** @type {Vec3[]} */
    const points = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
      [4, 4, 0],
      [4, 6, 0],
      [6, 6, 0],
      [6, 4, 0],
    ]
    // The hole is walked clockwise seen from +z.
    const triangles = /** @type {number[][]} */ (triangulateFace([[0, 1, 2, 3], [4, 5, 6, 7]], points, up))
    expect(triangles).toHaveLength(8)
    for (const triangle of triangles) expect(areaFromAbove(points, [triangle])).toBeGreaterThan(0)
    expect(areaFromAbove(points, triangles)).toBeCloseTo(96, 12)
  })

  it('never joins two corners a polygon outside the face already joins', () => {
    /** @type {Vec3[]} */
    const points = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
    ]
    const count = points.length
    // Forbid the diagonal 0–2 and the triangulation must use 1–3.
    const triangles = /** @type {number[][]} */ (triangulateFace([[0, 1, 2, 3]], points, up, new Set([0 * count + 2])))
    expect(triangles).toHaveLength(2)
    for (const triangle of triangles) expect(triangle.includes(0) && triangle.includes(2)).toBe(false)
  })

  it('triangulates a face pinched at a corner as two outer loops', () => {
    /** @type {Vec3[]} */
    const points = [
      [0, 0, 0],
      [5, 5, 0],
      [0, 10, 0],
      [10, 0, 0],
      [10, 10, 0],
    ]
    const triangles = /** @type {number[][]} */ (
      triangulateFace(
        [
          [0, 1, 2],
          [1, 3, 4],
        ],
        points,
        up
      )
    )
    expect(triangles).toHaveLength(2)
    expect(areaFromAbove(points, triangles)).toBeCloseTo(50, 12)
  })

  it('works on a face seen from below: winding follows the normal', () => {
    /** @type {Vec3[]} */
    const points = [
      [0, 0, 0],
      [0, 10, 0],
      [10, 10, 0],
      [10, 0, 0],
    ]
    const triangles = /** @type {number[][]} */ (triangulateFace([[0, 1, 2, 3]], points, [0, 0, -1]))
    expect(triangles).toHaveLength(2)
    expect(areaFromAbove(points, triangles)).toBeCloseTo(-100, 12)
  })
})

/**
 * A closed tent: a 10 mm square base at z = 0, facing up, over an apex 5 mm below it. The base is
 * cut into strips as `@jscad/modeling`'s sweep would cut it, at y = 5 and y = `5 + gap`, and the
 * two sides along x = 0 and x = 10 carry those strip corners, as `watertight.js` leaves them after
 * repairing the T-junctions.
 *
 * @param {number} gap
 * @returns {{ polygons: { vertices: Vec3[] }[], ids: number[][], cornerCount: number }}
 */
function tent(gap) {
  const y1 = 5 + gap
  /** @type {Vec3} */
  const apex = [5, 5, -5]
  /** @type {Vec3[][]} */
  const faces = [
    [
      [0, 0, 0],
      [10, 0, 0],
      [10, 5, 0],
      [0, 5, 0],
    ],
    [
      [0, 5, 0],
      [10, 5, 0],
      [10, y1, 0],
      [0, y1, 0],
    ],
    [
      [0, y1, 0],
      [10, y1, 0],
      [10, 10, 0],
      [0, 10, 0],
    ],
    [[10, 0, 0], [0, 0, 0], apex],
    [[10, 10, 0], [10, y1, 0], [10, 5, 0], [10, 0, 0], apex],
    [[0, 10, 0], [10, 10, 0], apex],
    [[0, 0, 0], [0, 5, 0], [0, y1, 0], [0, 10, 0], apex],
  ]
  /** @type {Map<string, number>} */
  const idOf = new Map()
  const ids = faces.map((vertices) =>
    vertices.map((vertex) => {
      const key = vertex.join(',')
      if (!idOf.has(key)) idOf.set(key, idOf.size)
      return /** @type {number} */ (idOf.get(key))
    })
  )
  return { polygons: faces.map((vertices) => ({ vertices })), ids, cornerCount: idOf.size }
}

/** @param {{ vertices: Vec3[] }[]} polygons @returns {number} */
function volumeOf(polygons) {
  let volume = 0
  for (const { vertices } of polygons) {
    for (let at = 1; at + 1 < vertices.length; at += 1) {
      const [a, b, c] = [vertices[0], vertices[at], vertices[at + 1]]
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
    }
  }
  return volume
}

/** @param {number[][]} ids @returns {number} Directed sides not walked back exactly once. */
function unmatchedSides(ids) {
  /** @type {Map<string, number>} */
  const sides = new Map()
  for (const polygon of ids) {
    for (let at = 0; at < polygon.length; at += 1) {
      const key = `${polygon[at]}>${polygon[(at + 1) % polygon.length]}`
      sides.set(key, (sides.get(key) ?? 0) + 1)
    }
  }
  let unmatched = 0
  for (const [key, walks] of sides) {
    const [from, to] = key.split('>')
    if (walks !== 1 || sides.get(`${to}>${from}`) !== 1) unmatched += 1
  }
  return unmatched
}

describe('cleanFlatFaces', () => {
  it('re-triangulates a face the sweep cut a 10 µm strip into, and takes the strip corners out of its neighbours', () => {
    const { polygons, ids, cornerCount } = tent(0.01)
    expect(unmatchedSides(ids)).toBe(0)
    const volume = volumeOf(polygons)
    const changed = cleanFlatFaces(polygons, ids, cornerCount, new Uint8Array(cornerCount), 1e-4)
    expect(changed).toBeGreaterThan(0)

    // Closed, the same volume, and no corner left on the base at the strip's heights.
    expect(unmatchedSides(ids)).toBe(0)
    expect(volumeOf(polygons)).toBeCloseTo(volume, 12)
    for (const { vertices } of polygons) {
      for (const vertex of vertices) expect(vertex[2] === 0 && (vertex[1] === 5 || vertex[1] === 5.01)).toBe(false)
    }
    // The base is now two triangles over the square, none of them a sliver.
    const base = polygons.filter(({ vertices }) => vertices.every((vertex) => vertex[2] === 0))
    expect(base).toHaveLength(2)
    for (const { vertices } of base) {
      const [a, b, c] = vertices
      const doubled = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      const longest = Math.max(...[0, 1, 2].map((at) => Math.hypot(vertices[(at + 1) % 3][0] - vertices[at][0], vertices[(at + 1) % 3][1] - vertices[at][1])))
      expect(doubled / longest).toBeGreaterThan(SLIVER_RADIUS)
    }
    // The sides lost their strip corners: back to a triangle each.
    expect(polygons.filter(({ vertices }) => vertices.length === 3)).toHaveLength(polygons.length)
  })

  it('leaves a flat face with no sliver in it exactly as it was', () => {
    // A 1 mm strip is no sliver: nothing to do, and nothing is rebuilt.
    const { polygons, ids, cornerCount } = tent(1)
    const before = polygons.slice()
    expect(cleanFlatFaces(polygons, ids, cornerCount, new Uint8Array(cornerCount), 1e-4)).toBe(0)
    expect(polygons).toEqual(before)
    for (let at = 0; at < polygons.length; at += 1) expect(polygons[at]).toBe(before[at])
  })

  it('never takes out a corner on the bounding box', () => {
    // Every corner of the tent's base is on its bounding box (x = 0 or 10, z = 0).
    const { polygons, ids, cornerCount } = tent(0.01)
    cleanFlatFaces(polygons, ids, cornerCount, new Uint8Array(cornerCount).fill(1), 1e-4)
    expect(unmatchedSides(ids)).toBe(0)
    const corners = new Set(polygons.flatMap(({ vertices }) => vertices.map((vertex) => vertex.join(','))))
    for (const corner of ['0,5,0', '0,5.01,0', '10,5,0', '10,5.01,0']) expect(corners.has(corner)).toBe(true)
  })
})
