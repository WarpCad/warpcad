// SPDX-License-Identifier: AGPL-3.0-or-later
// TODO/ai-049 — an offset that moves every face of a solid along its own normal by one
// distance, exact for any polyhedron whose corners meet at most three face planes.
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

import { offset, offsetSolid } from './offset.js'
import { add, addHole, boundsOf, createGroup, enlarge, isGroup, volumeOf } from './group.js'
import { openEdgesOf } from './watertight.js'

const { booleans, geometries, measurements, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/**
 * An axis-aligned box from its min and max corners.
 *
 * @param {[number, number, number]} min
 * @param {[number, number, number]} max
 * @returns {Geom3}
 */
function box(min, max) {
  return primitives.cuboid({
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
  })
}

/**
 * The L used throughout: a 30 × 10 × 10 bar with a 10 × 10 × 20 upright on its left end.
 * Its reflex edge runs along y at x = 10, z = 10.
 *
 * @param {number} [d] Grow (or shrink) both boxes by `d` per side, which is exactly what an
 *   offset of the L must be, since both boxes are convex and axis-aligned.
 * @returns {Geom3}
 */
function lShape(d = 0) {
  return booleans.union(box([-d, -d, -d], [30 + d, 10 + d, 10 + d]), box([-d, -d, -d], [10 + d, 10 + d, 30 + d]))
}

/**
 * Volume of the symmetric difference: zero exactly when two solids occupy the same space.
 *
 * @param {Geom3} a
 * @param {Geom3} b
 * @returns {number}
 */
function mismatch(a, b) {
  return measurements.measureVolume(booleans.subtract(a, b)) + measurements.measureVolume(booleans.subtract(b, a))
}

/**
 * The perpendicular distance from the z axis to each side facet of a solid of revolution
 * about z: one value per facet whose normal is horizontal.
 *
 * @param {Geom3} solid
 * @returns {number[]}
 */
function sideApothems(solid) {
  const out = []
  for (const polygon of geometries.geom3.toPolygons(solid)) {
    const [nx, ny, nz, w] = geometries.poly3.plane(polygon)
    if (Math.abs(nz) > 1e-9 || Math.hypot(nx, ny) < 0.5) continue
    out.push(w)
  }
  return out
}

describe('offset — matches enlarge where enlarge is exact', () => {
  it('a box grows by the distance on every face, the same solid enlarge(2d) gives', () => {
    const brick = box([0, 0, 0], [10, 20, 30])
    const grown = offsetSolid(brick, 0.5)
    const reference = /** @type {Geom3} */ (enlarge(brick, [1, 1, 1]))
    const bounds = boundsOf(grown)
    expect(bounds[0][0]).toBeCloseTo(-0.5, 9)
    expect(bounds[1][0]).toBeCloseTo(10.5, 9)
    expect(bounds[0][1]).toBeCloseTo(-0.5, 9)
    expect(bounds[1][1]).toBeCloseTo(20.5, 9)
    expect(bounds[0][2]).toBeCloseTo(-0.5, 9)
    expect(bounds[1][2]).toBeCloseTo(30.5, 9)
    expect(measurements.measureVolume(grown)).toBeCloseTo(11 * 21 * 31, 6)
    expect(mismatch(grown, reference)).toBeCloseTo(0, 6)
  })

  it('a cylinder matches enlarge(2d) to within its tessellation, and each facet moves exactly d', () => {
    const segments = 32
    const radius = 5
    const d = 0.2
    const rod = primitives.cylinder({ radius, height: 10, segments })
    const grown = offsetSolid(rod, d)
    const reference = /** @type {Geom3} */ (enlarge(rod, [2 * d, 2 * d, 2 * d]))
    const grownBounds = boundsOf(grown)
    const referenceBounds = boundsOf(reference)
    // Z is two flat caps: exact.
    expect(grownBounds[0][2]).toBeCloseTo(-5 - d, 9)
    expect(grownBounds[1][2]).toBeCloseTo(5 + d, 9)
    // Radially the offset moves the *facets* by d, so the facet corners move by
    // d / cos(π/n); enlarge scales the corners by exactly d. The two differ by that much
    // and no more: 0.001 mm at 32 segments.
    const facetSlack = d * (1 / Math.cos(Math.PI / segments) - 1)
    for (let axis = 0; axis < 2; axis += 1) {
      expect(Math.abs(grownBounds[1][axis] - referenceBounds[1][axis])).toBeLessThanOrEqual(facetSlack + 1e-9)
      expect(Math.abs(grownBounds[0][axis] - referenceBounds[0][axis])).toBeLessThanOrEqual(facetSlack + 1e-9)
    }
    expect(measurements.measureVolume(grown) / measurements.measureVolume(reference)).toBeCloseTo(1, 2)
    // And the gap the offset leaves is the full d on every facet, where enlarge leaves
    // d·cos(π/n) (the 0.198 the add-clearances skill used to warn about).
    const before = sideApothems(rod)
    const after = sideApothems(grown)
    expect(after.length).toBe(segments)
    for (const apothem of after) expect(apothem).toBeCloseTo(before[0] + d, 9)
  })

  it('a zero distance hands the solid back unchanged', () => {
    const brick = box([0, 0, 0], [10, 20, 30])
    expect(offsetSolid(brick, 0)).toBe(brick)
  })
})

describe('offset — exact where enlarge is not', () => {
  it('an L-shaped part grows by the distance on every face, the reflex corner included', () => {
    const grown = offsetSolid(lShape(), 1)
    // (30+2)(10+2)² for the bar, plus the 12 × 12 × 20 upright above it.
    expect(measurements.measureVolume(grown)).toBeCloseTo(32 * 12 * 12 + 12 * 12 * 20, 6)
    expect(mismatch(grown, lShape(1))).toBeCloseTo(0, 6)
    // Enlarge, by contrast, scales about the bounds centre and misplaces the inner faces.
    const scaled = /** @type {Geom3} */ (enlarge(lShape(), [2, 2, 2]))
    expect(mismatch(scaled, lShape(1))).toBeGreaterThan(10)
  })

  it('a negative offset shrinks every face, the reflex corner included', () => {
    const shrunk = offsetSolid(lShape(), -1)
    expect(measurements.measureVolume(shrunk)).toBeCloseTo(28 * 8 * 8 + 8 * 8 * 20, 6)
    expect(mismatch(shrunk, lShape(-1))).toBeCloseTo(0, 6)
  })

  it('a hole through a part shrinks by the distance as the outside grows', () => {
    const segments = 32
    const plate = booleans.subtract(box([-10, -10, 0], [10, 10, 5]), primitives.cylinder({ radius: 3, height: 7, center: [0, 0, 2.5], segments }))
    const grown = offsetSolid(plate, 0.5)
    const bounds = boundsOf(grown)
    expect(bounds[1][0]).toBeCloseTo(10.5, 9)
    expect(bounds[1][2]).toBeCloseTo(5.5, 9)
    // The bore's facets (normals pointing at the axis) are half a millimetre nearer it.
    const apothem = 3 * Math.cos(Math.PI / segments)
    const bore = sideApothems(grown).filter((w) => w < 0).map((w) => -w)
    expect(bore.length).toBeGreaterThan(0)
    for (const value of bore) expect(value).toBeCloseTo(apothem - 0.5, 6)
  })

  it('a boolean result with T-junctions comes back closed, with no open edge', () => {
    // From watertight.js's table: a placement that leaves T-junctions on the seam.
    const part = transforms.translate(
      [-100.89, 66.93, 25],
      booleans.union(primitives.cylinder({ radius: 20, height: 50, segments: 32 }), primitives.cuboid({ size: [40, 40, 40] }))
    )
    const grown = offsetSolid(part, 0.2)
    expect(openEdgesOf(grown).openEdges).toBe(0)
    const before = boundsOf(part)
    const after = boundsOf(grown)
    expect(after[1][2] - before[1][2]).toBeCloseTo(0.2, 6)
    expect(after[0][2] - before[0][2]).toBeCloseTo(-0.2, 6)
  })

  it('every face it returns is convex, as poly3 requires', () => {
    // The L's front face is split along a chord from a T-junction (on the upright's outer
    // edge) to the reflex corner. Moved, that chord tilts and the bar's piece would be
    // non-convex; it must come back re-triangulated.
    const shapes = [offsetSolid(lShape(), 1), offsetSolid(lShape(), -1), offsetSolid(lShape(), -4.9)]
    for (const solid of shapes) {
      for (const polygon of geometries.geom3.toPolygons(solid)) {
        const [nx, ny, nz] = geometries.poly3.plane(polygon)
        const v = polygon.vertices
        for (let i = 0; i < v.length; i += 1) {
          const a = v[(i + v.length - 1) % v.length]
          const b = v[i]
          const c = v[(i + 1) % v.length]
          const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
          const e2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
          const turn = (e1[1] * e2[2] - e1[2] * e2[1]) * nx + (e1[2] * e2[0] - e1[0] * e2[2]) * ny + (e1[0] * e2[1] - e1[1] * e2[0]) * nz
          expect(turn).toBeGreaterThan(-1e-9)
        }
      }
      expect(openEdgesOf(solid).openEdges).toBe(0)
    }
  })

  it('a sphere, whose corners meet many planes, is approximate but close', () => {
    const ball = primitives.sphere({ radius: 5, segments: 32 })
    const bounds = boundsOf(offsetSolid(ball, 1))
    for (let axis = 0; axis < 3; axis += 1) {
      expect(bounds[1][axis]).toBeGreaterThan(5.9)
      expect(bounds[1][axis]).toBeLessThan(6.1)
    }
  })
})

describe('offset — refusals', () => {
  it('refuses a shrink larger than half the thinnest wall, naming the distance', () => {
    // The bar and the upright are both 10 mm thick, so −5 collapses them and −6 inverts.
    expect(() => offsetSolid(lShape(), -5)).toThrow(/offset: -5 mm .*thinner/)
    expect(() => offsetSolid(lShape(), -6)).toThrow(/offset: -6 mm .*thinner/)
    // Just under half still works.
    expect(measurements.measureVolume(offsetSolid(lShape(), -4.9))).toBeGreaterThan(0)
  })

  it('refuses a growth that closes a slot narrower than twice the distance', () => {
    // A 1 mm slot down into a block: its floor spans the gap, so it turns inside out.
    const slotted = booleans.subtract(box([0, 0, 0], [20, 10, 10]), box([9.5, -1, 2], [10.5, 11, 11]))
    expect(offsetSolid(slotted, 0.4)).toBeDefined()
    expect(() => offsetSolid(slotted, 0.6)).toThrow(/offset: 0\.6 mm .*gap/)
  })

  it('refuses a growth that closes a slit with nothing spanning it', () => {
    // A square ring cut clean through one wall: the two cut faces meet only each other.
    const ring = booleans.subtract(box([0, 0, 0], [20, 20, 5]), box([4, 4, -1], [16, 16, 6]))
    const split = booleans.subtract(ring, box([9.5, -1, -1], [10.5, 5, 6]))
    expect(offsetSolid(split, 0.4)).toBeDefined()
    expect(() => offsetSolid(split, 0.6)).toThrow(/offset: 0\.6 mm .*gap/)
  })

  it('refuses, by name, a corner where two faces facing opposite ways meet', () => {
    // A barrel flush with a block's front face that hangs below the block (the Pi's AV
    // jack): the barrel's back cap faces +y, the block's front faces −y, in one plane, and
    // they meet at a corner that would have to move both ways at once.
    const block = box([0, 0, 1], [10, 10, 6])
    // Axis along y, y ∈ [−3, 0], z ∈ [0.75, 5.75]: 0.25 mm below the block's bottom.
    const lying = transforms.rotateX(Math.PI / 2, primitives.cylinder({ radius: 2.5, height: 3, segments: 32 }))
    const jack = booleans.union(block, transforms.translate([5, -1.5, 3.25], lying))
    expect(() => offsetSolid(jack, 0.1)).toThrow(/offset: .*face opposite ways/)
    expect(() => offsetSolid(jack, -0.1)).toThrow(/offset: .*face opposite ways/)
  })

  it('refuses an empty solid by name instead of returning nothing', () => {
    expect(() => offsetSolid(geometries.geom3.create(), 0.2)).toThrow(/offset: .*empty/)
  })

  it('refuses a distance that is not a finite number', () => {
    const brick = box([0, 0, 0], [10, 10, 10])
    expect(() => offsetSolid(brick, /** @type {any} */ ('0.2'))).toThrow(/finite/)
    expect(() => offsetSolid(brick, Number.NaN)).toThrow(/finite/)
    expect(() => offsetSolid(brick, /** @type {any} */ ([0.2, 0.2, 0.2]))).toThrow(/finite/)
  })
})

describe('offset — groups', () => {
  it('grows every part and shrinks every hole, keeping names and colours', () => {
    let group = createGroup('pin')
    group = add(group, box([0, 0, 0], [10, 10, 2]), 'head')
    group = add(group, box([3, 3, 2], [7, 7, 12]), 'shaft')
    group = addHole(group, primitives.cylinder({ radius: 1, height: 20, segments: 16, center: [5, 5, 5] }))
    const grown = offset(group, 0.25)
    expect(isGroup(grown)).toBe(true)
    if (!isGroup(grown)) return
    expect(grown.names).toEqual(['head', 'shaft'])
    const shaft = boundsOf(grown.parts.shaft)
    expect(shaft[0][0]).toBeCloseTo(2.75, 9)
    expect(shaft[1][2]).toBeCloseTo(12.25, 9)
    const hole = boundsOf(grown.holes[0])
    expect(hole[1][2]).toBeCloseTo(15 - 0.25, 9)
    expect(volumeOf(grown)).toBeGreaterThan(volumeOf(group))
  })

  it('names the part a refusal comes from', () => {
    let group = createGroup('pin')
    group = add(group, box([0, 0, 0], [10, 10, 10]), 'head')
    group = add(group, box([0, 0, 10], [10, 10, 11]), 'flange')
    expect(() => offset(group, -0.6)).toThrow(/part "flange"/)
  })
})
