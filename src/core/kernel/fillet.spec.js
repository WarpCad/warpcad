// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import modeling from '@jscad/modeling'

// The user's saved project from the TODO/core-051 report, as text.
import chamferErrorProject from '../../../examples/chamfer error.ndjson?raw'

import { alignInsetContours, chamferRim, filletRim, RIM_ORIENTATIONS } from './fillet.js'

const { booleans, expansions, geometries, measurements, minkowski, modifiers, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

/**
 * `@jscad/modeling` 2.13.0 mis-types this one: `operations/modifiers/index.d.ts`
 * re-exports the `default` of `generalize.js`, which only has named exports, so the
 * property types as a module namespace and `tsc` calls it uncallable. The runtime
 * export is a normal function. Cast once here rather than at the call site.
 *
 * @type {(options: { snap?: boolean, triangulate?: boolean }, geometry: Geom3) => Geom3}
 */
const generalize = /** @type {any} */ (modifiers).generalize

/**
 * Volume removed from a rim by a quarter-circle profile, derived rather than measured.
 *
 * Sweeping the cross-section inward by `δ(z) = r(1 − √(1 − (z/r)²))` removes
 * `∫₀ʳ [P·δ(z) − C·δ(z)²] dz`, where `P` is the footprint perimeter and `C` is the
 * footprint's Steiner corner constant — `Σ cot(θᵢ/2)` over the interior angles, which
 * is `+1` for each 90° convex corner and `−1` for each 270° reflex one. Substituting
 * `z = r·sin t` and integrating gives the two constants below:
 * `∫₀¹(1 − √(1 − p²))dp = 1 − π/4` and `∫₀¹(1 − √(1 − p²))²dp = 1 + 2/3 − π/2`.
 *
 * `C = 4` for both fixtures here is not assumed — it was measured against
 * `offset({delta: -δ})` at four deltas on both footprints and came back 3.9977–4.0182.
 *
 * @param {number} perimeterMm Footprint perimeter.
 * @param {number} corners Steiner corner constant.
 * @param {number} radiusMm
 * @returns {number} Cubic millimetres.
 */
function filletRemoved(perimeterMm, corners, radiusMm) {
  const linear = 1 - Math.PI / 4
  const corner = 1 + 2 / 3 - Math.PI / 2
  return perimeterMm * radiusMm ** 2 * linear - corners * radiusMm ** 3 * corner
}

/**
 * The same integral for a straight 45° profile, `δ(z) = z`. Exact in two slices, so a
 * chamfer has no discretisation error to allow for.
 *
 * @param {number} perimeterMm
 * @param {number} corners
 * @param {number} radiusMm
 * @returns {number} Cubic millimetres.
 */
function chamferRemoved(perimeterMm, corners, radiusMm) {
  return (perimeterMm * radiusMm ** 2) / 2 - (corners * radiusMm ** 3) / 3
}

/** A 20mm cube: perimeter 80mm, four convex corners. */
const cube20 = () => primitives.cuboid({ size: [20, 20, 20] })

/**
 * A 35×20×20 bar built as a *boolean union* of two overlapping cubes — the
 * "representative non-primitive mesh" `TODO/core-003` asks the sweep to be tried on,
 * rather than a raw primitive edge. Perimeter 110mm, four convex corners.
 *
 * @returns {Geom3}
 */
const unionBar = () =>
  booleans.union(cube20(), primitives.cuboid({ size: [20, 20, 20], center: [15, 0, 0] }))

/**
 * An L-shaped extrusion whose footprint has a **reflex** corner, so the rim sweep has
 * to round a concave turn as well as convex ones. Perimeter 120mm; five convex corners
 * and one reflex, so `C = 5 − 1 = 4`.
 *
 * @returns {Geom3}
 */
const reflexL = () =>
  booleans.union(
    primitives.cuboid({ size: [30, 10, 20] }),
    primitives.cuboid({ size: [10, 30, 20], center: [-10, 10, 0] })
  )

/** @param {Geom3} geometry */
const volumeOf = (geometry) => measurements.measureVolume(geometry)

describe('filletRim', () => {
  it('removes the hand-computed volume from a cube rim', () => {
    // 512 slices, not 128 (TODO/io-006): 128 only ever matched to 2 places because the
    // projected section was ~6e-5 mm too wide on every side, which kept back ~0.013 mm³
    // and happened to cancel the chorded profile's own error. With the section snapped
    // onto the solid's real corners the sweep converges onto the hand value from below
    // (128: −0.013, 512: −0.0008, 1024: −0.0002 mm³), so it needs the finer profile.
    const filleted = filletRim({ radius: 3, segments: 512 }, cube20())
    // 8000 − 144.159 = 7855.841mm³
    expect(volumeOf(filleted)).toBeCloseTo(8000 - filletRemoved(80, 4, 3), 2)
  })

  it('leaves the bounding box alone — it removes rim material, it does not shrink the solid', () => {
    const before = measurements.measureBoundingBox(cube20())
    const after = measurements.measureBoundingBox(filletRim({ radius: 3, segments: 32 }, cube20()))
    for (const corner of [0, 1]) {
      for (const axis of [0, 1, 2]) {
        expect(after[corner][axis]).toBeCloseTo(before[corner][axis], 3)
      }
    }
  })

  it('works on a boolean-union result, not just a primitive edge', () => {
    // 512 slices for the same reason as the cube above (TODO/io-006).
    const filleted = filletRim({ radius: 3, segments: 512 }, unionBar())
    // 14000 − 202.102 = 13797.898mm³
    expect(volumeOf(filleted)).toBeCloseTo(14000 - filletRemoved(110, 4, 3), 2)
  })

  it('rounds a reflex footprint corner as well as convex ones', () => {
    const filleted = filletRim({ radius: 2, segments: 256 }, reflexL())
    const expected = 10000 - filletRemoved(120, 4, 2)
    // Looser than the cases above on purpose: this fixture uses a 2mm radius, so the
    // volume actually at stake is ~100mm³ and the chorded profile's residual error is
    // a larger share of it. 4e-5 relative is ~0.4mm³ — see the convergence test below.
    expect(Math.abs(volumeOf(filleted) - expected) / expected).toBeLessThan(5e-5)
  })

  it('converges on the analytic profile as segments rise, from below', () => {
    const expected = 8000 - filletRemoved(80, 4, 3)
    const coarse = volumeOf(filletRim({ radius: 3, segments: 8 }, cube20()))
    const fine = volumeOf(filletRim({ radius: 3, segments: 64 }, cube20()))
    // Chords cut inside the arc, so a coarse sweep always removes too much.
    expect(coarse).toBeLessThan(fine)
    expect(fine).toBeLessThan(expected + 1e-3)
    expect(Math.abs(fine - expected)).toBeLessThan(Math.abs(coarse - expected))
  })

  it('gives the same result on every face of a symmetric solid', () => {
    const volumes = RIM_ORIENTATIONS.map((orientation) =>
      volumeOf(filletRim({ radius: 3, orientation, segments: 64 }, cube20()))
    )
    for (const volume of volumes) expect(volume).toBeCloseTo(volumes[0], 6)
  })
})

describe('chamferRim', () => {
  it('removes the hand-computed volume from a cube rim, exactly', () => {
    // A straight profile needs no discretisation, so this matches to 0.02mm³.
    expect(volumeOf(chamferRim({ radius: 3 }, cube20()))).toBeCloseTo(8000 - chamferRemoved(80, 4, 3), 1)
  })

  it('works on a boolean-union result', () => {
    expect(volumeOf(chamferRim({ radius: 3 }, unionBar()))).toBeCloseTo(
      14000 - chamferRemoved(110, 4, 3),
      1
    )
  })

  it('removes more material than a fillet of the same size', () => {
    // A straight profile cuts r²/2 of section per unit of rim where a quarter circle
    // cuts r²(1 − π/4), so the chamfer takes ~2.25× as much here — the corner terms
    // pull that below the 2.33 the linear terms alone would suggest.
    const chamfered = 8000 - volumeOf(chamferRim({ radius: 3 }, cube20()))
    const filleted = 8000 - volumeOf(filletRim({ radius: 3, segments: 128 }, cube20()))
    expect(chamfered / filleted).toBeCloseTo(chamferRemoved(80, 4, 3) / filletRemoved(80, 4, 3), 2)
  })
})

describe('rim ops reject what they cannot model, rather than returning wrong geometry', () => {
  it('refuses a rim band the solid is not prismatic through', () => {
    // A dome on top of the cube: the sweep would read one section and loft it straight
    // up, silently ADDING ~131mm³ where the dome narrows. Verified before the guard
    // existed — it returned 8576mm³ for an 8445mm³ solid without complaint.
    const domed = booleans.union(
      cube20(),
      transforms.translate([0, 0, 10], primitives.sphere({ radius: 6, segments: 32 }))
    )
    expect(() => filletRim({ radius: 3 }, domed)).toThrow(/not prismatic/)
  })

  it('refuses a radius the cross-section cannot absorb, in both profiles', () => {
    const post = primitives.cuboid({ size: [4, 4, 20] })
    expect(() => filletRim({ radius: 3, segments: 32 }, post)).toThrow(/wider than the cross-section/)
    // The chamfer case is why the guard samples its own fixed inset range: this lofts
    // from two slices, and two samples step straight over the collapse.
    expect(() => chamferRim({ radius: 3 }, post)).toThrow(/wider than the cross-section/)
    expect(volumeOf(filletRim({ radius: 1.5, segments: 32 }, post))).toBeLessThan(320)
  })

  it('rejects degenerate radii and unknown orientations by name', () => {
    expect(() => filletRim({ radius: 0 }, cube20())).toThrow(/non-zero number of millimetres/)
    expect(() => filletRim({ radius: NaN }, cube20())).toThrow(/non-zero number of millimetres/)
    expect(() => filletRim({ radius: 25 }, cube20())).toThrow(/narrower than the solid's 20mm extent/)
    expect(() => filletRim({ radius: -25 }, cube20())).toThrow(/narrower than the solid's 20mm extent/)
    expect(() => filletRim({ radius: 3, orientation: 'q+' }, cube20())).toThrow(/orientation must be one of/)
  })

  it('flares the rim outward on a negative radius, as V1 does (TODO/core-017)', () => {
    // `util.chamfer`'s slicer is `enlarge(slice, [-radius * 2, -radius * 2])`
    // (`jscad-utils/src/util.js:1608-1624`) and `util.enlarge` adds an absolute delta
    // to each dimension, so a negative radius grows the far slice instead of insetting
    // it. `sliceParams` reads `Math.abs(radius)` for the cut plane, so the band's
    // height and the face it sits on are unchanged — only the direction flips.
    //
    // `jscad-raspberrypi`'s `miniPiTFT.js:125` depends on this to build a clearance
    // frustum, and nothing else in this registry produces one. Rejecting the sign
    // (which this op used to do) forced that recipe to approximate the volume 10mm
    // too small in x and y.
    const flared = chamferRim({ radius: -3, orientation: 'z+' }, cube20())
    const [min, max] = measurements.measureBoundingBox(flared)
    // The face grows by the radius on every side; the band's height is unchanged, so
    // the solid neither gets taller nor moves.
    // 3 decimal places, the same tolerance the bounding-box test above uses and for
    // the same reason: `sectionAt` reads a cross-section through `project`, whose
    // `unionGeom2` round-trip inflates the outline by a shape-dependent ~6e-5mm. On
    // an inward rim that lands inside the remainder and never shows; on an outward
    // flare the loft *is* the bounding box, so it leaks out. 60 nanometres.
    expect(max[0] - min[0]).toBeCloseTo(26, 3)
    expect(max[1] - min[1]).toBeCloseTo(26, 3)
    expect(max[2] - min[2]).toBeCloseTo(20, 3)
    expect(min[2]).toBeCloseTo(-10, 3)

    // And it is a frustum, not a step: the added material tapers from nothing at the
    // cut plane to a full 3mm ledge at the face, so it is well under the 3mm-deep
    // prism a step would add.
    const stepVolume = 26 * 26 * 3 - 20 * 20 * 3
    const added = volumeOf(flared) - volumeOf(cube20())
    expect(added).toBeGreaterThan(0)
    expect(added).toBeLessThan(stepVolume)

    // The inward case is unchanged, and the two are genuinely opposite.
    expect(volumeOf(chamferRim({ radius: 3, orientation: 'z+' }, cube20()))).toBeLessThan(
      volumeOf(cube20())
    )
  })
})

/**
 * A plate with holes through it, built from primitives and `subtract` — not the sketch
 * primitive, so a failure here is the rim sweep's, not the sketch's. The plate's top face
 * is at `z = height / 2` and every hole runs right through it.
 *
 * Alongside the solid, this returns the two numbers the volume oracle needs, derived from
 * the construction rather than measured off the result (see {@link chamferRemoved}):
 *
 * - `perimeter`: every boundary of the top face, holes included, because the rim op
 *   bevels a hole's edge as well as the outside edge.
 * - `corners`: the Steiner constant `Σ tan(turnᵢ / 2)`, the δ² term of a mitred offset's
 *   area. A convex 90° corner adds 1, so an outside rectangle adds 4. A hole's corners are
 *   reflex corners of the *material* and subtract, so a square hole takes 4 away and a
 *   regular n-gon hole takes `n·tan(π/n)` (π in the limit) away.
 *
 * @param {object} spec
 * @param {[number, number]} spec.size Outside of the plate, millimetres.
 * @param {number} [spec.height]
 * @param {[number, number]} [spec.center] Plate centre in X/Y.
 * @param {Array<{ size: [number, number], center: [number, number] } | { radius: number, segments: number, center: [number, number] }>} spec.holes
 * @returns {{ solid: Geom3, perimeter: number, corners: number }}
 */
function plateWithHoles({ size, height = 10, center = [0, 0], holes }) {
  let solid = primitives.cuboid({ size: [size[0], size[1], height], center: [center[0], center[1], 0] })
  let perimeter = 2 * (size[0] + size[1])
  let corners = 4
  for (const hole of holes) {
    if ('radius' in hole) {
      const { radius, segments } = hole
      solid = booleans.subtract(
        solid,
        primitives.cylinder({ radius, segments, height: height * 3, center: [hole.center[0], hole.center[1], 0] })
      )
      perimeter += 2 * segments * radius * Math.sin(Math.PI / segments)
      corners -= segments * Math.tan(Math.PI / segments)
    } else {
      solid = booleans.subtract(
        solid,
        primitives.cuboid({ size: [hole.size[0], hole.size[1], height * 3], center: [hole.center[0], hole.center[1], 0] })
      )
      perimeter += 2 * (hole.size[0] + hole.size[1])
      corners -= 4
    }
  }
  return { solid, perimeter, corners }
}

/**
 * The user's plate from the 2026-10-04 report, built from the numbers in the saved
 * project itself (`examples/chamfer error.ndjson`): a 215.1 × 127.5 mm rectangle with a
 * 120.4 × 65.8 mm rectangular hole, extruded 10 mm. Read from the file, not retyped, so
 * the spec and the fixture cannot drift apart.
 *
 * @returns {{ solid: Geom3, perimeter: number, corners: number }}
 */
function usersPlate() {
  const sketch = chamferErrorProject
    .split('\n')
    .filter((/** @type {string} */ line) => line.trim() !== '')
    .map((/** @type {string} */ line) => JSON.parse(line))
    .find((/** @type {any} */ record) => record.op === 'primitive.sketch')
  const [outside, hole] = sketch.params.slices[0].profiles
  return plateWithHoles({
    size: [outside.widthMm, outside.heightMm],
    height: sketch.params.extrusion.heightMm,
    center: outside.centerMm,
    holes: [{ size: [hole.widthMm, hole.heightMm], center: hole.centerMm }],
  })
}

/**
 * Every holed fixture, with the radii each one takes. Each runs through *both* ops.
 *
 * @type {Array<[string, () => { solid: Geom3, perimeter: number, corners: number }, number[]]>}
 */
const HOLED_PLATES = [
  ["the user's plate (examples/chamfer error.ndjson)", usersPlate, [1, 2, 5]],
  ['a square hole', () => plateWithHoles({ size: [40, 40], holes: [{ size: [20, 20], center: [0, 0] }] }), [2]],
  ['a round hole', () => plateWithHoles({ size: [40, 40], holes: [{ radius: 10, segments: 32, center: [0, 0] }] }), [2]],
  [
    'two holes',
    () => plateWithHoles({ size: [60, 30], holes: [{ size: [10, 10], center: [-12, 0] }, { size: [10, 10], center: [12, 0] }] }),
    [2],
  ],
  ['an off-centre hole', () => plateWithHoles({ size: [40, 40], holes: [{ size: [10, 10], center: [8, -6] }] }), [2]],
  // Walls of 3 mm on two sides, meeting at the plate's corner: 1 mm fits, 2 mm does not
  // (that one is in the rejection block below).
  ['a hole near a corner', () => plateWithHoles({ size: [40, 40], holes: [{ size: [8, 8], center: [13, 13] }] }), [1]],
]

/** @type {Array<[string, 'chamferRim' | 'filletRim', number, () => { solid: Geom3, perimeter: number, corners: number }]>} */
const HOLED_ROWS = HOLED_PLATES.flatMap(([name, build, radii]) =>
  radii.flatMap((radius) => /** @type {const} */ (['chamferRim', 'filletRim']).map((op) => /** @type {any} */ ([name, op, radius, build])))
)

/**
 * Volume a rim op removes (positive radius) or adds (negative), per the analytic oracle.
 * For a flare the offset runs the other way, `A(δ) = A₀ + P·δ + C·δ²`, so the corner term
 * changes sign.
 *
 * @param {'chamferRim' | 'filletRim'} op
 * @param {number} perimeter
 * @param {number} corners
 * @param {number} radius
 * @returns {number} Removed volume, mm³; negative when material is added.
 */
function oracleRemoved(op, perimeter, corners, radius) {
  const r = Math.abs(radius)
  const linear = op === 'chamferRim' ? (perimeter * r ** 2) / 2 : perimeter * r ** 2 * (1 - Math.PI / 4)
  const corner = op === 'chamferRim' ? (corners * r ** 3) / 3 : corners * r ** 3 * (1 + 2 / 3 - Math.PI / 2)
  return radius > 0 ? linear - corner : -(linear + corner)
}

/**
 * The relative tolerance each op is held to. A chamfer is exact in two slices, so only the
 * section read (≤ 1e-3 mm of slab) is left: 0.1 %. A fillet's chords cut inside the arc
 * (see `DEFAULT_RIM_SEGMENTS`): 1 %. Every wrong result in the TODO's table was out by
 * more than 25 %.
 */
const RIM_TOLERANCE = { chamferRim: 1e-3, filletRim: 1e-2 }

/**
 * @param {'chamferRim' | 'filletRim'} op
 * @param {{ radius: number, orientation?: string }} options
 * @param {Geom3} solid
 * @returns {Geom3}
 */
const runRim = (op, options, solid) => (op === 'chamferRim' ? chamferRim(options, solid) : filletRim(options, solid))

describe('rim ops on a face with holes (TODO/core-051)', () => {
  it.each(HOLED_ROWS)('%s: %s r=%d removes the analytic volume from the outside edge and the hole', (_name, op, radius, build) => {
    const { solid, perimeter, corners } = build()
    const removed = volumeOf(solid) - volumeOf(runRim(op, { radius }, solid))
    const expected = oracleRemoved(op, perimeter, corners, radius)
    expect(removed).toBeGreaterThan(0)
    expect(Math.abs(removed - expected) / expected).toBeLessThan(RIM_TOLERANCE[op])
  })

  it.each(/** @type {const} */ (['chamferRim', 'filletRim']))(
    '%s: an island inside a hole is bevelled too (a tube with a post standing in it)',
    (op) => {
      // Three contours on one face: the tube's outside, its bore, and the post's outside —
      // the post is an island in the bore. Every one of them is a rim the op bevels.
      const tube = booleans.subtract(primitives.cuboid({ size: [40, 40, 10] }), primitives.cuboid({ size: [30, 30, 30] }))
      const solid = booleans.union(tube, primitives.cuboid({ size: [10, 10, 10] }))
      const removed = volumeOf(solid) - volumeOf(runRim(op, { radius: 1.5 }, solid))
      // 160 + 120 + 40 mm of rim; corners +4 (outside) −4 (bore) +4 (post).
      const expected = oracleRemoved(op, 320, 4, 1.5)
      expect(Math.abs(removed - expected) / expected).toBeLessThan(RIM_TOLERANCE[op])
    }
  )

  it.each(/** @type {const} */ (['chamferRim', 'filletRim']))(
    '%s: works on a face that is not z+ (z− and y+), through the canonical frame',
    (op) => {
      const { solid, perimeter, corners } = plateWithHoles({ size: [40, 40], holes: [{ size: [20, 20], center: [0, 0] }] })
      const expected = oracleRemoved(op, perimeter, corners, 2)
      // The plate is symmetric through z = 0, so its z− face is the same rim.
      const bottom = volumeOf(solid) - volumeOf(runRim(op, { radius: 2, orientation: 'z-' }, solid))
      expect(Math.abs(bottom - expected) / expected).toBeLessThan(RIM_TOLERANCE[op])
      // Turned so its holed face points +Y: rotateX(−90°) carries +Z onto +Y.
      const turned = transforms.rotateX(-Math.PI / 2, solid)
      const side = volumeOf(turned) - volumeOf(runRim(op, { radius: 2, orientation: 'y+' }, turned))
      expect(Math.abs(side - expected) / expected).toBeLessThan(RIM_TOLERANCE[op])
    }
  )

  it.each(/** @type {const} */ (['chamferRim', 'filletRim']))(
    '%s: a negative radius flares the outside edge outward and shrinks the hole (TODO/core-017)',
    (op) => {
      for (const build of [
        () => plateWithHoles({ size: [40, 40], holes: [{ size: [20, 20], center: [0, 0] }] }),
        () => plateWithHoles({ size: [40, 40], holes: [{ radius: 10, segments: 32, center: [0, 0] }] }),
      ]) {
        const { solid, perimeter, corners } = build()
        const flared = runRim(op, { radius: -2 }, solid)
        const added = volumeOf(flared) - volumeOf(solid)
        const expected = -oracleRemoved(op, perimeter, corners, -2)
        expect(added).toBeGreaterThan(0)
        expect(Math.abs(added - expected) / expected).toBeLessThan(RIM_TOLERANCE[op])
        // The face grew 2 mm on every side and the solid kept its height.
        const [min, max] = measurements.measureBoundingBox(flared)
        expect(max[0] - min[0]).toBeCloseTo(44, 3)
        expect(max[2] - min[2]).toBeCloseTo(10, 3)
      }
    }
  )

  it('leaves a plate with no hole exactly where it was (the TODO table\'s control row)', () => {
    const { solid } = plateWithHoles({ size: [40, 40], holes: [] })
    expect(volumeOf(solid) - volumeOf(chamferRim({ radius: 2 }, solid))).toBeCloseTo(chamferRemoved(160, 4, 2), 1)
    const filleted = volumeOf(solid) - volumeOf(filletRim({ radius: 2, segments: 256 }, solid))
    expect(filleted).toBeCloseTo(filletRemoved(160, 4, 2), 1)
  })
})

describe('rim ops refuse a radius a holed face cannot take (TODO/core-051)', () => {
  it.each(/** @type {const} */ (['chamferRim', 'filletRim']))(
    '%s: a hole 2 mm from the outside edge takes 0.9 mm but refuses 1.5 mm, naming the wall',
    (op) => {
      const { solid, perimeter, corners } = plateWithHoles({ size: [40, 40], holes: [{ size: [10, 10], center: [13, 0] }] })
      // Both cuts eat into the 2 mm wall from either side: 2 × 1.5 > 2.
      expect(() => runRim(op, { radius: 1.5 }, solid)).toThrow(/radius 1\.5mm is too large for this face/)
      expect(() => runRim(op, { radius: 1.5 }, solid)).toThrow(/wall between a hole and the outside edge is only 2\.00mm wide/)
      const removed = volumeOf(solid) - volumeOf(runRim(op, { radius: 0.9 }, solid))
      const expected = oracleRemoved(op, perimeter, corners, 0.9)
      expect(Math.abs(removed - expected) / expected).toBeLessThan(RIM_TOLERANCE[op])
    }
  )

  it.each(/** @type {const} */ (['chamferRim', 'filletRim']))('%s: two holes 2 mm apart refuse 1.5 mm, naming them', (op) => {
    const { solid } = plateWithHoles({ size: [60, 30], holes: [{ size: [10, 10], center: [-6, 0] }, { size: [10, 10], center: [6, 0] }] })
    expect(() => runRim(op, { radius: 1.5 }, solid)).toThrow(/wall between two holes is only 2\.00mm wide/)
  })

  it.each(/** @type {const} */ (['chamferRim', 'filletRim']))('%s: a hole near a corner refuses a radius its 3 mm walls cannot take', (op) => {
    const { solid } = plateWithHoles({ size: [40, 40], holes: [{ size: [8, 8], center: [13, 13] }] })
    expect(() => runRim(op, { radius: 2 }, solid)).toThrow(/wall between a hole and the outside edge is only 3\.00mm wide/)
  })

  it.each(/** @type {const} */ (['chamferRim', 'filletRim']))(
    '%s: a flare that would close a hole is refused, and one that fits is not',
    (op) => {
      // A 4 mm hole: a −3 mm flare shrinks it 3 mm from every side, through nothing and
      // out the other side. offset() does not stop at empty (see the core-003 block), so
      // without the check this returns a hole that has quietly turned inside out.
      const { solid, perimeter, corners } = plateWithHoles({ size: [40, 40], holes: [{ size: [4, 4], center: [0, 0] }] })
      expect(() => runRim(op, { radius: -3 }, solid)).toThrow(/a 3mm flare closes a hole in this face/)
      const added = volumeOf(runRim(op, { radius: -1.5 }, solid)) - volumeOf(solid)
      const expected = -oracleRemoved(op, perimeter, corners, -1.5)
      expect(Math.abs(added - expected) / expected).toBeLessThan(RIM_TOLERANCE[op])
    }
  )
})

describe('the sweep verifies slice correspondence instead of assuming it (TODO/core-051)', () => {
  // A plate section with a square hole, wound as geom2 winds it: material on the left.
  const section = geometries.geom2.create([
    ...[[-20, -20], [20, -20], [20, 20], [-20, 20]].map((point, index, ring) => [point, ring[(index + 1) % 4]]),
    ...[[-10, -10], [-10, 10], [10, 10], [10, -10]].map((point, index, ring) => [point, ring[(index + 1) % 4]]),
  ].map((side) => /** @type {any} */ (side)))
  const contours = geometries.geom2.toOutlines(section)

  it('pairs each contour with its own inset, in base order, every vertex on its mitre', () => {
    const inset = expansions.offset({ delta: -2, corners: 'edge' }, section)
    const aligned = alignInsetContours(contours, inset, 2, 'test')
    expect(aligned).toHaveLength(contours.length)
    aligned.forEach((ring, ringIndex) => {
      expect(ring).toHaveLength(contours[ringIndex].length)
      ring.forEach((point, index) => {
        const from = contours[ringIndex][index]
        // A 90° corner's mitre moves it √2 × inset, diagonally.
        expect(Math.hypot(point[0] - from[0], point[1] - from[1])).toBeCloseTo(2 * Math.SQRT2, 6)
      })
    })
  })

  it('throws, rather than lofting, when the inset is not the one claimed', () => {
    const inset = expansions.offset({ delta: -3, corners: 'edge' }, section)
    expect(() => alignInsetContours(contours, inset, 2, 'test')).toThrow(/do not correspond/)
  })

  it('throws when one contour moved and another did not (no uniform inset explains it)', () => {
    // Outside inset by 2, hole left alone: the counts and orientations all match, which is
    // exactly the case the old vertex-count check let through.
    const outer = geometries.geom2.fromPoints(
      /** @type {any} */ ([[-18, -18], [18, -18], [18, 18], [-18, 18]])
    )
    const hole = geometries.geom2.toSides(section).slice(4)
    const lopsided = geometries.geom2.create([...geometries.geom2.toSides(outer), ...hole])
    expect(() => alignInsetContours(contours, lopsided, 2, 'test')).toThrow(/do not correspond/)
  })
})

describe('why there is no general edge fillet here (TODO/core-003 finding, kept executable)', () => {
  it('cannot erode a solid: expand rejects a negative delta despite documenting one', () => {
    // expand.js's own docstring says "Contract is expand using a negative delta", but
    // expandGeom3 unions the shell back onto the original and builds spheres of the
    // given radius, so a negative delta throws. No erosion means no erode-then-dilate
    // rounding, which is the standard way to fillet without edge topology.
    expect(() => expansions.expand({ delta: -3, corners: 'round' }, cube20())).toThrow(/radius must be positive/)
  })

  it('offsets a 2D outline through zero and back, inverted, instead of emptying it', () => {
    // The reason assertRadiusFits samples the whole inset range. A 4×4 square:
    const square = primitives.rectangle({ size: [4, 4] })
    /** @param {number} delta */
    const areaAt = (delta) =>
      measurements.measureArea(expansions.offset({ delta, corners: 'edge' }, square))
    expect(areaAt(-1)).toBeCloseTo(4, 6)
    expect(areaAt(-2)).toBeCloseTo(0, 6)
    // Past the collapse the outline comes back with positive area, inside the original.
    expect(areaAt(-2.1)).toBeCloseTo(0.04, 6)
    expect(areaAt(-3)).toBeCloseTo(4, 6)
  })

  it('dilates rather than fillets: minkowski and expand grow the part by the radius', () => {
    const rounded = minkowski.minkowskiSum(cube20(), primitives.sphere({ radius: 3, segments: 16 }))
    const bounds = measurements.measureBoundingBox(rounded)
    // A fillet keeps the box at ±10. Both of V3's rounding operations push it to ±13,
    // round every convex edge at once, and cannot be aimed at a chosen edge.
    expect(bounds[1][0]).toBeCloseTo(13, 6)
    expect(volumeOf(rounded)).toBeCloseTo(
      volumeOf(expansions.expand({ delta: 3, corners: 'round', segments: 16 }, cube20())),
      6
    )
  })

  it('leaves boolean results without the edge topology an edge fillet would need', () => {
    const drilled = booleans.subtract(cube20(), primitives.cylinder({ radius: 5, height: 40, segments: 32 }))
    // A raw primitive is a closed manifold: every edge is shared by exactly two faces.
    expect(unmatchedEdges(cube20())).toBe(0)
    // A boolean result is not. BSP splitting leaves T-junctions, so ~42% of edges have
    // no partner and no half-edge graph can be built over the faces — there is nothing
    // stable to name when a user clicks "this edge".
    expect(unmatchedEdges(drilled)).toBeGreaterThan(100)

    // A manifold mesh IS recoverable, but only by triangulating, which destroys the
    // planar-face identity an edge fillet would have to select against: recovering the
    // feature edges again would mean dihedral-angle edge-loop extraction, i.e. writing
    // a mesh fillet engine that the kernel does not provide.
    const repaired = generalize({ snap: true, triangulate: true }, drilled)
    expect(unmatchedEdges(repaired)).toBe(0)
    expect(geometries.geom3.toPolygons(repaired).length).toBeGreaterThan(
      geometries.geom3.toPolygons(drilled).length
    )
  })
})

/**
 * Count undirected edges that are not shared by exactly two polygons.
 *
 * @param {Geom3} geometry
 * @returns {number}
 */
function unmatchedEdges(geometry) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  /** @param {number[]} vertex */
  const key = (vertex) => vertex.map((/** @type {number} */ value) => value.toFixed(9)).join(',')
  for (const polygon of geometries.geom3.toPolygons(geometry)) {
    const { vertices } = polygon
    for (let index = 0; index < vertices.length; index += 1) {
      const a = key(vertices[index])
      const b = key(vertices[(index + 1) % vertices.length])
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`
      counts.set(edge, (counts.get(edge) ?? 0) + 1)
    }
  }
  let unmatched = 0
  for (const count of counts.values()) if (count !== 2) unmatched += 1
  return unmatched
}
