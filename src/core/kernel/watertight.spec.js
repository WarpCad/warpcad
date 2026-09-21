import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { makeWatertight } from './watertight.js'

const { primitives, geometries, transforms, measurements, booleans } = modeling

/**
 * Open sides, counted straight off the polygons — no serializer involved, so this spec
 * says something about the repair itself rather than about what `@jscad/stl-serializer`
 * does with it afterwards (`export.spec.js` covers the bytes).
 *
 * @param {any} solid
 * @returns {number}
 */
function openSides(solid) {
  /** @param {number[]} vertex */
  const key = (vertex) => vertex.map((/** @type {number} */ value) => Math.round(value * 1e6)).join(',')
  /** @type {Map<string, number>} */
  const directed = new Map()
  for (const polygon of geometries.geom3.toPolygons(solid)) {
    const { vertices } = polygon
    for (let index = 0; index < vertices.length; index += 1) {
      const edge = `${key(vertices[index])}/${key(vertices[(index + 1) % vertices.length])}`
      directed.set(edge, (directed.get(edge) ?? 0) + 1)
    }
  }
  let open = 0
  for (const [edge, uses] of directed) {
    const [from, to] = edge.split('/')
    if (uses !== (directed.get(`${to}/${from}`) ?? 0)) open += 1
  }
  return open
}

/**
 * A 10 mm cube whose **top face alone** has been split in two along y = 0. Nothing has
 * moved and the solid still encloses exactly 1000 mm³ — but the two side faces now each
 * meet a corner in the middle of their top edge, which is a T-junction, by hand, with no
 * boolean involved.
 *
 * @returns {any}
 */
function cubeWithSplitTop() {
  const polygons = geometries.geom3.toPolygons(primitives.cuboid({ size: [10, 10, 10] })).map((polygon) => polygon)
  const topIndex = polygons.findIndex((polygon) => polygon.vertices.every((vertex) => vertex[2] === 5))
  expect(topIndex).toBeGreaterThanOrEqual(0)
  const top = polygons[topIndex]
  // Walk the top face's corners and cut it along y = 0, keeping its winding.
  const corners = top.vertices.map((vertex) => [...vertex])
  const near = corners.filter((vertex) => vertex[1] < 0)
  const far = corners.filter((vertex) => vertex[1] > 0)
  expect(near).toHaveLength(2)
  expect(far).toHaveLength(2)
  /** @param {number} x */
  const midOf = (x) => [x, 0, 5]
  /** @param {number[][]} pair */
  const half = (pair) => [pair[0], pair[1], midOf(pair[1][0]), midOf(pair[0][0])]
  const rebuilt = polygons.filter((_, index) => index !== topIndex)
  const poly = (/** @type {number[][]} */ vertices) => geometries.poly3.create(/** @type {any} */ (vertices))
  rebuilt.push(poly(half(near)), poly(half(far)))
  return geometries.geom3.create(rebuilt)
}

describe('makeWatertight', () => {
  it('inserts the corner a neighbour left in the middle of an edge', () => {
    const split = cubeWithSplitTop()
    // The fixture really is a 10 mm cube — the split face kept its outward winding —
    // and it really does have the defect io-004 is about.
    expect(measurements.measureVolume(split)).toBeCloseTo(1000, 6)
    // Six directed sides: on each of the two side faces, the long top edge plus the two
    // short edges of the split face that together cover it.
    expect(openSides(split)).toBe(6)

    const repaired = makeWatertight(split)
    expect(openSides(repaired)).toBe(0)
    // The two side faces gained the corner at y = 0; nothing else changed.
    expect(geometries.geom3.toPolygons(repaired)).toHaveLength(geometries.geom3.toPolygons(split).length)
    expect(measurements.measureVolume(repaired)).toBeCloseTo(measurements.measureVolume(split), 6)
    const [min, max] = measurements.measureBoundingBox(repaired)
    expect(min).toEqual([-5, -5, -5])
    expect(max).toEqual([5, 5, 5])
  })

  it('moves no coordinate: every original vertex survives exactly', () => {
    const split = cubeWithSplitTop()
    const before = new Set(
      geometries.geom3.toPolygons(split).flatMap((polygon) => polygon.vertices.map((vertex) => vertex.join(',')))
    )
    const after = new Set(
      geometries.geom3
        .toPolygons(makeWatertight(split))
        .flatMap((polygon) => polygon.vertices.map((vertex) => vertex.join(',')))
    )
    for (const vertex of before) expect(after.has(vertex), `vertex ${vertex} was moved or dropped`).toBe(true)
  })

  it('hands back a solid with nothing wrong with it untouched, not a rebuilt copy', () => {
    const cube = primitives.cuboid({ size: [10, 10, 10] })
    // Same object: no polygons rebuilt, so an already-closed export costs nothing.
    expect(makeWatertight(cube)).toBe(cube)
  })

  it('applies a solid\'s pending transforms once, not twice and not never', () => {
    // Kernel geometry carries translate/rotate lazily in `transforms`. A repair that
    // rebuilt from `solid.polygons` would export the solid back at the origin; one that
    // copied `transforms` onto the rebuilt solid would move it 20 mm again.
    const moved = /** @type {any} */ (
      transforms.translate([20, 0, 0], booleans.union(cubeWithSplitTop(), primitives.cuboid({ size: [2, 2, 12] })))
    )
    const [beforeMin, beforeMax] = measurements.measureBoundingBox(moved)
    const repaired = makeWatertight(moved)
    const [afterMin, afterMax] = measurements.measureBoundingBox(repaired)
    expect(afterMin).toEqual(beforeMin)
    expect(afterMax).toEqual(beforeMax)
    expect(measurements.measureVolume(repaired)).toBeCloseTo(measurements.measureVolume(moved), 6)
    expect(openSides(repaired)).toBe(0)
  })

  it('leaves an empty geometry alone rather than throwing', () => {
    const empty = geometries.geom3.create()
    expect(makeWatertight(empty)).toBe(empty)
  })

  it('closes a real boolean that the serializer\'s own repair leaves open', () => {
    // io-004's reproduction 1, at the geometry level: the same union, placed off-origin.
    const union = booleans.union(
      primitives.cylinder({ radius: 20, height: 50, center: [-100.89, 66.93, 25] }),
      primitives.cuboid({ size: [40, 40, 40], center: [-95, 75, 20] })
    )
    const repaired = makeWatertight(union)
    expect(openSides(repaired)).toBe(0)
    expect(measurements.measureVolume(repaired)).toBeCloseTo(measurements.measureVolume(union), 4)
  })

  it('closes a body far bigger than the spatial hash\'s cell size (perf-001)', () => {
    // `perf-001` replaced "test every open edge against every corner in the solid" with a
    // uniform spatial hash. That is only equivalent if the hash's neighbourhood is wide
    // enough: a grid that looked at one cell instead of the 3x3x3 block around each
    // sample would miss junctions whose two sides fall either side of a cell boundary,
    // and would do it only on bodies large enough to have many cells — which is exactly
    // the size no other test in this file reaches.
    const big = booleans.union(
      primitives.sphere({ radius: 40, segments: 96 }),
      primitives.cuboid({ size: [60, 60, 60], center: [30, 30, 30] })
    )
    expect(geometries.geom3.toPolygons(big).length).toBeGreaterThan(3000)

    const repaired = makeWatertight(big)
    expect(openSides(repaired)).toBe(0)
    expect(measurements.measureVolume(repaired)).toBeCloseTo(measurements.measureVolume(big), 3)
    expect(measurements.measureBoundingBox(repaired)).toEqual(measurements.measureBoundingBox(big))
  })

  it('is stable: repairing an already-repaired solid inserts nothing more', () => {
    // The repair runs on both export paths (`io-004`, `io-005`) and, since `perf-001`,
    // possibly on either side of a worker boundary. Running it twice must be a no-op,
    // or a `.glb` built from worker-prepared solids would differ from a direct one.
    const union = booleans.union(
      primitives.cylinder({ radius: 20, height: 50, center: [-100.89, 66.93, 25] }),
      primitives.cuboid({ size: [40, 40, 40], center: [-95, 75, 20] })
    )
    const once = makeWatertight(union)
    const twice = makeWatertight(once)
    expect(twice).toBe(once) // same object: the second pass found nothing to do
  })
})
