// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Rim fillet and chamfer — the *only* fillet semantics JSCAD V3 can actually support.
 *
 * ## Read this before reaching for it as a general fillet
 *
 * This is **not** "select an edge, round it." `@jscad/modeling` cannot do that, and
 * neither could `jscad-utils` V1 — see the `TODO/core-003` addendum in
 * `docs/decisions/geometry-kernel.md` for the full finding and the OpenCascade.js
 * question it raises. What this module ports is exactly what V1's `util.fillet`/
 * `util.chamfer` actually did: take one axis-aligned end face, cut a band of height
 * `radius` off it, and re-loft that band from the cross-section at the cut plane up to
 * an inset copy at the face, following a quarter-circle (fillet) or straight (chamfer)
 * profile. The result rounds or bevels the whole *rim* of that one face at once.
 *
 * V1 built the loft from `CAG._toWallPolygons` driven by `CSG.Connector` frames; V3's
 * `extrudeFromSlices` does the same slice-to-slice walling internally, which is why
 * nothing here needs a connector type (V3 has none — see the same addendum).
 *
 * ## The precondition, enforced rather than assumed
 *
 * The algorithm reads a single cross-section and sweeps it, so it is only correct when
 * the solid is **prismatic along the axis throughout the band it touches**. V1 shared
 * this limitation and never checked it, which is precisely the "real edge-case coverage
 * was never characterized" risk `Initial design.md` §11 flagged: on a non-prismatic rim
 * (a domed top, a taper) the loft silently *adds* material instead of removing it and
 * returns a wrong solid with no error. {@link assertPrismaticBand} turns that silent
 * wrong answer into a loud one, per `CLAUDE.md`'s reject-degenerate-input-at-the-
 * boundary convention.
 *
 * @module core/kernel/fillet
 */

import modeling from '@jscad/modeling'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { booleans, expansions, extrusions, geometries, maths, measurements, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {import('@jscad/modeling').geometries.geom2.Geom2} Geom2 */

/**
 * The six axis-aligned faces a rim op can target, in V1's `orientation` spelling.
 *
 * @type {readonly string[]}
 */
export const RIM_ORIENTATIONS = Object.freeze(['x+', 'x-', 'y+', 'y-', 'z+', 'z-'])

/**
 * Slice count across the quarter-circle profile when a caller passes none — the
 * `legacy` count. The `modify.filletRim` op never relies on it: the registry always
 * passes the design resolution's count (`tessellation.js`'s `rimSlicesFor`,
 * `TODO/core-035`), which under `legacy` is this same 32. Direct callers (a recipe's
 * probe geometry) still get it. The profile converges from below, so more slices means
 * slightly more material removed, never less.
 */
export const DEFAULT_RIM_SEGMENTS = 32

/**
 * Thickness of the probe slab used to read a cross-section. V3 has no section-cut, so
 * a section is read as the projection of a thin slab (see {@link sectionAt}); this is
 * small enough not to disturb a millimetre-scale result and large enough to survive
 * the kernel's own epsilon.
 */
const SECTION_EPSILON_MM = 1e-3

/**
 * Rotate a solid so the named face points +Z, and back again.
 *
 * Everything downstream works in that canonical frame, so the profile math is written
 * once for `z+` rather than six times.
 *
 * @param {string} orientation One of {@link RIM_ORIENTATIONS}.
 * @returns {{ toZ: (g: Geom3) => Geom3, fromZ: (g: Geom3) => Geom3 }}
 */
function canonicalFrame(orientation) {
  const quarter = Math.PI / 2
  switch (orientation) {
    case 'z+':
      return { toZ: (g) => g, fromZ: (g) => g }
    case 'z-':
      return { toZ: (g) => transforms.rotateX(Math.PI, g), fromZ: (g) => transforms.rotateX(-Math.PI, g) }
    case 'x+':
      return { toZ: (g) => transforms.rotateY(-quarter, g), fromZ: (g) => transforms.rotateY(quarter, g) }
    case 'x-':
      return { toZ: (g) => transforms.rotateY(quarter, g), fromZ: (g) => transforms.rotateY(-quarter, g) }
    case 'y+':
      return { toZ: (g) => transforms.rotateX(quarter, g), fromZ: (g) => transforms.rotateX(-quarter, g) }
    case 'y-':
      return { toZ: (g) => transforms.rotateX(-quarter, g), fromZ: (g) => transforms.rotateX(quarter, g) }
    default:
      throw new Error(
        `rim: orientation must be one of ${RIM_ORIENTATIONS.join(', ')}, got ${String(orientation)}`
      )
  }
}

/**
 * A cuboid spanning the solid's X/Y extent (plus slack) over `[zLow, zHigh]`.
 *
 * @param {[[number, number, number], [number, number, number]]} bounds
 * @param {number} zLow
 * @param {number} zHigh
 * @returns {Geom3}
 */
function slabOver(bounds, zLow, zHigh) {
  const [min, max] = bounds
  return primitives.cuboid({
    size: [max[0] - min[0] + 2, max[1] - min[1] + 2, zHigh - zLow],
    center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (zLow + zHigh) / 2],
  })
}

/**
 * The solid's cross-section at `z`, read downward.
 *
 * V3 removed V1's `CSG.sectionCut` and offers only `project`, which returns a
 * *silhouette* of everything it is given — so this projects a slab one epsilon thick
 * rather than the whole solid, which is the same thing for any solid that is prismatic
 * across that epsilon and is what makes {@link assertPrismaticBand}'s check meaningful.
 *
 * @param {Geom3} solid In the canonical +Z frame.
 * @param {[[number, number, number], [number, number, number]]} bounds
 * @param {number} z Millimetres.
 * @returns {Geom2}
 */
function sectionAt(solid, bounds, z) {
  const slab = slabOver(bounds, z - SECTION_EPSILON_MM, z)
  return extrusions.project({ axis: [0, 0, 1] }, booleans.intersect(solid, slab))
}

/**
 * Reject a rim band the single-cross-section sweep cannot represent.
 *
 * Compares the section at the cut plane with the section just under the face. They
 * agree for a prismatic band and diverge for a dome, a taper, or anything else whose
 * profile changes across the band — the case where the sweep would otherwise return a
 * plausible-looking but wrong solid.
 *
 * @param {Geom2} atCut Section at `faceZ - radius`.
 * @param {Geom2} atFace Section just below `faceZ`.
 * @param {string} op Name used in the error message.
 * @returns {void}
 */
function assertPrismaticBand(atCut, atFace, op) {
  const cutArea = measurements.measureArea(atCut)
  const faceArea = measurements.measureArea(atFace)
  if (cutArea <= 0) {
    throw new Error(`${op}: the cross-section at the cut plane is empty — radius is larger than the solid`)
  }
  // 1% of the cut section, well outside projection/epsilon noise (observed <0.05%)
  // and well inside any real taper or dome.
  if (Math.abs(faceArea - cutArea) > cutArea * 0.01) {
    throw new Error(
      `${op}: the solid is not prismatic over the rim band — cross-section area changes from ` +
        `${cutArea.toFixed(3)}mm² at the cut plane to ${faceArea.toFixed(3)}mm² at the face. ` +
        'This operation sweeps one cross-section and would silently return wrong geometry here; ' +
        'see the core-003 addendum in docs/decisions/geometry-kernel.md.'
    )
  }
}

/**
 * Number of evenly spaced insets sampled by {@link assertRadiusFits}. Deliberately
 * independent of the caller's slice count: a chamfer lofts from only two slices, and
 * two samples are not enough to notice the section passing through zero between them.
 */
const RADIUS_PROBE_SAMPLES = 17

/**
 * Reject a radius the cross-section is too narrow to absorb.
 *
 * This guard exists because of a specific, verified `@jscad/modeling` 2.13.0 behaviour:
 * an inward `offset` does **not** clamp at empty and does **not** throw. Offsetting a
 * 4×4mm square by −2mm gives area 0 as expected, but −2.1mm gives back a 0.2×0.2mm
 * square and −3mm a 2×2mm square — the outline collapses through zero and re-expands
 * *inverted*, with positive measured area, still sitting inside the original outline.
 * A sweep built on those slices returns a confidently wrong solid, so neither a
 * positive area nor containment in the base can be trusted on its own.
 *
 * What is reliable is that the true section area falls monotonically as the inset
 * grows. Sampling the whole inset range and requiring each step to be positive and no
 * larger than the last catches the collapse wherever in the range it happens.
 *
 * @param {Geom2} base Cross-section at the cut plane.
 * @param {number} radius Largest inset the profile will reach.
 * @param {string} op
 * @returns {void}
 */
function assertRadiusFits(base, radius, op) {
  let previous = measurements.measureArea(base)
  for (let sample = 1; sample < RADIUS_PROBE_SAMPLES; sample += 1) {
    const inset = (radius * sample) / (RADIUS_PROBE_SAMPLES - 1)
    const area = measurements.measureArea(expansions.offset({ delta: -inset, corners: 'edge' }, base))
    if (area <= 0 || area > previous) {
      throw new Error(
        `${op}: radius ${radius}mm is wider than the cross-section can absorb — an inset of ` +
          `${inset.toFixed(3)}mm collapses it (area ${area.toFixed(4)}mm², down from ` +
          `${previous.toFixed(4)}mm²). Use a smaller radius.`
      )
    }
    previous = area
  }
}

/**
 * Non-zero, finite, and narrower than the solid's extent along the axis.
 *
 * ## Why a negative radius is allowed (TODO/core-017)
 *
 * V1's `util.chamfer` builds its far slice as `enlarge(slice, [-radius * 2, -radius *
 * 2])` (`jscad-utils/src/util.js:1608-1624`) and `util.enlarge` adds an absolute delta
 * to each dimension, so a **negative** radius grows the face instead of insetting it:
 * the band becomes an outward flare rather than a bevel. Its own `sliceParams` reads
 * `Math.abs(radius)` for the cut plane, so only the profile's direction flips, never
 * the band's height or which face it is on.
 *
 * That is not a curiosity — `jscad-raspberrypi`'s `miniPiTFT.js:125` uses it to build
 * a display clearance volume 5mm wider on every side than the display it protects,
 * and there is no other op in this registry that produces a frustum. So the sign is
 * honoured here rather than rejected. Only `0` is meaningless, and it still throws.
 *
 * @param {unknown} value
 * @param {number} extentMm Solid's size along the rim axis.
 * @param {string} op
 * @returns {number} The signed radius; callers take {@link bandOf} for the height.
 */
function requireRadius(value, extentMm, op) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
    throw new Error(
      `${op}: radius must be a non-zero number of millimetres — positive to cut the rim ` +
        `inward, negative to flare it outward — got ${String(value)}`
    )
  }
  if (Math.abs(value) >= extentMm) {
    throw new Error(
      `${op}: radius ${value}mm must be narrower than the solid's ${extentMm}mm extent along the axis`
    )
  }
  return value
}

/**
 * The band height a signed radius sweeps: always positive, always measured back from
 * the target face, exactly as V1's `sliceParams` does with its own `Math.abs`.
 *
 * @param {number} radius
 * @returns {number}
 */
function bandOf(radius) {
  return Math.abs(radius)
}

/**
 * Rotate an offset outline's vertex list so vertex `i` still corresponds to vertex `i`
 * of the outline it came from.
 *
 * `extrudeFromSlices` walls slice `n` to slice `n + 1` by index, so the two lists have
 * to agree on where the outline starts. They usually do — and every inward offset this
 * module took before `TODO/core-017` did, which is why this was never needed. An
 * **outward** `expansions.offset` does not: for a square it hands back
 * `[[13,-13],[13,13],[-13,13],[-13,-13]]` against a base of
 * `[[-10,-10],[10,-10],[10,10],[-10,10]]` — the same four corners, rotated one place.
 * Lofted as-is, every wall quad joins a corner to its *neighbour* and the solid comes
 * out twisted: a 3mm flare on a 20mm cube measured 556mm³ where 1596mm³ was right, and
 * crept towards the true value as slices were added rather than being wrong by a fixed
 * amount, which is exactly what a twist looks like.
 *
 * A pure offset moves every vertex and creates none (with `corners: 'edge'`), so the
 * correspondence is recoverable: take the cyclic shift that minimises total squared
 * distance between the two rings. Shift zero wins whenever the kernel already agreed,
 * which is why this is a no-op for every case that worked before.
 *
 * @param {Geom2} base Outline the offset was taken from.
 * @param {Geom2} offsetOutline Result of `expansions.offset`.
 * @param {string} op Named in the error.
 * @returns {Geom2}
 */
function alignVertices(base, offsetOutline, op) {
  const from = geometries.geom2.toPoints(base)
  const to = geometries.geom2.toPoints(offsetOutline)
  if (to.length !== from.length) {
    // `extrudeFromSlices` cannot wall two rings of different lengths into anything
    // meaningful, and quietly returning a mangled solid is the failure class this
    // whole module exists to refuse.
    throw new Error(
      `${op}: the rim profile changes the cross-section's vertex count ` +
        `(${from.length} to ${to.length}), so the sweep has no correspondence to loft ` +
        'along. This happens when an offset merges or splits part of the outline; use ' +
        'a smaller radius.'
    )
  }
  let bestShift = 0
  let bestCost = Infinity
  for (let shift = 0; shift < from.length; shift += 1) {
    let cost = 0
    for (let index = 0; index < from.length; index += 1) {
      const a = from[index]
      const b = to[(index + shift) % from.length]
      cost += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2
    }
    if (cost < bestCost) {
      bestCost = cost
      bestShift = shift
    }
  }
  if (bestShift === 0) return offsetOutline
  return geometries.geom2.fromPoints(
    from.map((_unused, index) => to[(index + bestShift) % from.length])
  )
}

/**
 * The shared rim sweep. `profile` maps a normalised position across the band to the
 * inset distance and the height above the cut plane, both in millimetres.
 *
 * @param {object} args
 * @param {Geom3} args.solid
 * @param {number} args.radius
 * @param {string} args.orientation
 * @param {number} args.slices Number of slices to loft, at least 2.
 * @param {(p: number, radius: number) => { inset: number, rise: number }} args.profile
 * @param {string} args.op
 * @returns {Geom3}
 */
function sweepRim({ solid, radius, orientation, slices, profile, op }) {
  const { toZ, fromZ } = canonicalFrame(orientation)
  const canonical = toZ(solid)
  const bounds = measurements.measureBoundingBox(canonical)
  const faceZ = bounds[1][2]
  const r = requireRadius(radius, bounds[1][2] - bounds[0][2], op)
  const cutZ = faceZ - bandOf(r)

  const base = sectionAt(canonical, bounds, cutZ)
  assertPrismaticBand(base, sectionAt(canonical, bounds, faceZ), op)

  // Every slice is built and checked before any of it is lofted, rather than inside
  // the callback: the check below is a comparison between slices, and depending on
  // `extrudeFromSlices` to invoke its callback in index order would make a
  // correctness guard hostage to an implementation detail of the kernel.
  //
  // Only for an inward radius: the guard exists because an over-large *inset*
  // collapses the outline through zero and re-expands it inverted. An outward offset
  // has no such failure mode — the section only grows — so applying the guard to a
  // negative radius would reject every legitimate flare.
  if (r > 0) assertRadiusFits(base, r, op)
  const steps = Array.from({ length: slices }, (_unused, index) => profile(index / (slices - 1), r))
  const outlines = steps.map(({ inset }) =>
    inset === 0
      ? base
      : alignVertices(base, expansions.offset({ delta: -inset, corners: 'edge' }, base), op)
  )

  const loft = extrusions.extrudeFromSlices(
    {
      numberOfSlices: slices,
      callback: (_progress, index) => {
        const s = extrusions.slice.fromSides(geometries.geom2.toSides(outlines[index]))
        return extrusions.slice.transform(
          maths.mat4.fromTranslation(maths.mat4.create(), [0, 0, cutZ + steps[index].rise]),
          s
        )
      },
    },
    base
  )

  const remainder = booleans.intersect(canonical, slabOver(bounds, bounds[0][2] - 1, cutZ))
  return fromZ(booleans.union(remainder, loft))
}

/**
 * Round the rim of one axis-aligned face with a quarter-circle profile.
 *
 * Ports `jscad-utils`' `util.fillet(object, radius, orientation)`. The face keeps its
 * position — the bounding box is unchanged; material is removed from the rim only.
 *
 * @param {object} options
 * @param {number} options.radius Fillet radius, millimetres.
 * @param {string} [options.orientation] Face to round, default `'z+'`.
 * @param {number} [options.segments] Slices across the profile, default
 *   {@link DEFAULT_RIM_SEGMENTS}.
 * @param {Geom3} solid
 * @returns {Geom3}
 */
export function filletRim({ radius, orientation = 'z+', segments = DEFAULT_RIM_SEGMENTS }, solid) {
  return sweepRim({
    solid,
    radius,
    orientation,
    slices: Math.max(2, segments),
    // Uniform in arc angle rather than in height: the same quarter circle V1 swept,
    // sampled evenly along it instead of bunching near the face. `rise` takes the
    // band's height, which is unsigned; only `inset` carries the sign, so a negative
    // radius bulges the rim outward over the same band.
    profile: (p, r) => {
      const angle = (p * Math.PI) / 2
      return { inset: r * (1 - Math.cos(angle)), rise: Math.abs(r) * Math.sin(angle) }
    },
    op: 'modify.filletRim',
  })
}

/**
 * Bevel the rim of one axis-aligned face with a straight 45° profile — or, with a
 * negative radius, flare it outward instead (see {@link requireRadius}).
 *
 * Ports `jscad-utils`' `util.chamfer(object, radius, orientation)`. Two slices are
 * exact — the profile is a straight line — so this needs no segment count.
 *
 * @param {object} options
 * @param {number} options.radius Chamfer size, millimetres. Negative flares outward.
 * @param {string} [options.orientation] Face to bevel, default `'z+'`.
 * @param {Geom3} solid
 * @returns {Geom3}
 */
export function chamferRim({ radius, orientation = 'z+' }, solid) {
  return sweepRim({
    solid,
    radius,
    orientation,
    slices: 2,
    profile: (p, r) => ({ inset: r * p, rise: Math.abs(r) * p }),
    op: 'modify.chamferRim',
  })
}
