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
 * probe geometry) still get it. The chorded profile cuts inside the true arc, so the
 * volume converges from below: more slices removes slightly *less* material, never more
 * (a 20 mm cube, r 3: 32 slices −0.22 mm³, 512 −0.0008 mm³ off the exact value —
 * measured for `TODO/io-006`).
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
 * Put a projected section's corners back exactly where the solid has them (`TODO/io-006`).
 *
 * `extrusions.project` does not hand back the solid's own coordinates: on a hexagon
 * (Ø50) it returned the corner `(12.5, 21.650635)` as `(12.500032, 21.650543)`, about
 * 1e-4 mm off, while a corner on an axis comes back exact. The loft starts from this
 * section but the remainder it is unioned onto keeps the true corner, so every
 * off-axis corner of the cut plane became two corners 1e-4 mm apart: a sliver hole
 * (three open edges each — 12 on a hexagon) that no weld closes, because the
 * serializer's snap grid (~4e-4 mm) can straddle the pair, and `watertight.js` only
 * inserts vertices into edges — by design it never moves one. Every rim
 * `io-004`/`io-005` measured was square, so its corners never drifted.
 *
 * So each section vertex within {@link SECTION_EPSILON_MM} of one of the remainder's
 * corners on the cut plane takes that corner's exact coordinates. The drift is an
 * order of magnitude inside that radius and any genuine feature is far outside it.
 * Works side by side, so an outline with holes keeps its topology.
 *
 * @param {Geom2} section Projected cross-section at `cutZ`.
 * @param {Geom3} remainder The solid below the cut plane, whose top cap is at `cutZ`.
 * @param {number} cutZ Millimetres.
 * @returns {Geom2}
 */
function snapSectionToSolid(section, remainder, cutZ) {
  /** @type {[number, number][]} */
  const corners = []
  for (const polygon of geometries.geom3.toPolygons(remainder)) {
    for (const vertex of polygon.vertices) {
      if (Math.abs(vertex[2] - cutZ) <= SECTION_EPSILON_MM) corners.push([vertex[0], vertex[1]])
    }
  }
  if (corners.length === 0) return section
  const limit = SECTION_EPSILON_MM * SECTION_EPSILON_MM
  /** @type {Map<string, [number, number]>} */
  const snapped = new Map()
  /** @param {[number, number]} point @returns {[number, number]} */
  const snap = (point) => {
    const key = `${point[0]},${point[1]}`
    const known = snapped.get(key)
    if (known) return known
    let best = point
    let bestDistance = limit
    for (const corner of corners) {
      const distance = (corner[0] - point[0]) ** 2 + (corner[1] - point[1]) ** 2
      if (distance <= bestDistance) {
        bestDistance = distance
        best = corner
      }
    }
    snapped.set(key, best)
    return best
  }
  return geometries.geom2.create(
    geometries.geom2.toSides(section).map(([from, to]) => /** @type {any} */ ([snap(from), snap(to)]))
  )
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

/** @typedef {[number, number]} Vec2 */

/**
 * How far a vertex of an inset contour may sit from its exact mitre point before the
 * two slices are judged not to correspond: an absolute floor plus a share of how far the
 * vertex moved. `offsetFromPoints` computes the same intersection of the same two offset
 * lines, so a true partner lands within ~1e-12 mm of it; a wrong partner is a whole side
 * length away. The gap between the two is many orders of magnitude, so neither number is
 * delicate.
 */
const CORRESPONDENCE_FLOOR_MM = 1e-6
const CORRESPONDENCE_SHARE = 1e-6

/**
 * Two segments closer than this are touching. Used only between inset contours, where a
 * touch is already a zero-width wall.
 */
const TOUCH_EPSILON_MM = 1e-9

/**
 * Signed area of a closed ring, positive counter-clockwise (shoelace).
 *
 * @param {Vec2[]} ring
 * @returns {number} Square millimetres.
 */
function ringArea(ring) {
  let twice = 0
  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index]
    const b = ring[(index + 1) % ring.length]
    twice += a[0] * b[1] - b[0] * a[1]
  }
  return twice / 2
}

/**
 * Where an inset of `inset` mm puts each vertex of `ring`, worked out from the ring alone.
 *
 * A geom2 keeps its material on the **left** of every side: an outside edge winds
 * counter-clockwise, a hole clockwise, an island inside a hole counter-clockwise again.
 * So "inset into the material" is the same rule for every contour, whatever it is: move
 * each side left by `inset` (right, for a negative inset) and take each corner where its
 * two moved sides meet. That is a mitre — `expansions.offset` with `corners: 'edge'`
 * builds exactly this point — and it sits `inset / cos(turn / 2)` from the vertex, which
 * is `inset·√2` at a 90° corner (the bound `TODO/core-051` proposed, generalised so an
 * acute corner, which moves further, is not refused).
 *
 * @param {Vec2[]} ring
 * @param {number} inset Millimetres; negative moves the sides outward.
 * @returns {Vec2[]} One point per vertex, `NaN` where the corner is a hairpin.
 */
function mitresOf(ring, inset) {
  const count = ring.length
  /** @param {Vec2} from @param {Vec2} to @returns {Vec2} */
  const leftNormal = (from, to) => {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const length = Math.hypot(dx, dy)
    return [-dy / length, dx / length]
  }
  return ring.map((vertex, index) => {
    const before = leftNormal(ring[(index - 1 + count) % count], vertex)
    const after = leftNormal(vertex, ring[(index + 1) % count])
    const denominator = 1 + before[0] * after[0] + before[1] * after[1]
    if (!(denominator > 1e-12)) return /** @type {Vec2} */ ([Number.NaN, Number.NaN])
    return /** @type {Vec2} */ ([
      vertex[0] + (inset * (before[0] + after[0])) / denominator,
      vertex[1] + (inset * (before[1] + after[1])) / denominator,
    ])
  })
}

/**
 * Pair each contour of the section with its own inset, start each inset ring at the
 * partner of the base ring's first vertex, and **prove** every pairing rather than
 * trusting it.
 *
 * ## Why per contour (TODO/core-051)
 *
 * `extrudeFromSlices` walls side `i` of one slice to side `i` of the next, so the two
 * slices must agree side for side. Before this fix the agreement was recovered by trying
 * every cyclic shift of **one flat list** of the section's points (`geom2.toPoints`) and
 * keeping the cheapest. That is right for one closed outline, which is all `TODO/core-017`
 * (an outward offset hands back the same square rotated one place) ever met. A face with
 * a hole has two outlines, and `geom2.toPoints` returns their points **interleaved** in
 * the kernel's internal order, differently for the section and for its inset — on the
 * user's plate, outer ×3, hole ×4, outer for the section against outer ×3, hole ×3, outer,
 * hole for its inset. No shift
 * lines those up, so the loft walled corners to the wrong neighbours and returned a
 * twisted solid: a chamfer that *added* 832 mm³, with no error.
 *
 * So the unit here is the contour. `expansions.offset` insets each outline on its own and
 * keeps one inset ring per outline, which `geom2.toOutlines` reads back. For each base
 * ring this finds the inset ring and start vertex that put every vertex on its own mitre
 * ({@link mitresOf}), and keeps the best. An outside edge and a hole can never trade
 * places, because their mitres move in opposite directions relative to their winding.
 *
 * ## Verified, not assumed
 *
 * The best match is then held to the mitre within {@link CORRESPONDENCE_FLOOR_MM}. A
 * pairing that only *looks* plausible — the right counts, the right windings, the wrong
 * vertices — throws here instead of reaching the loft. That is the gap that let this bug
 * through: the old guard checked only that the vertex counts matched.
 *
 * Exported for its spec, which feeds it insets that do not correspond.
 *
 * @param {Vec2[][]} contours The section's outlines, `geom2.toOutlines(base)`.
 * @param {Geom2} insetSection `expansions.offset({ delta: -inset, corners: 'edge' }, base)`.
 * @param {number} inset Millimetres, signed as the offset was.
 * @param {string} op Named in the error.
 * @returns {Vec2[][]} One ring per contour, in contour order, vertex `i` partnering
 *   vertex `i` of that contour.
 */
export function alignInsetContours(contours, insetSection, inset, op) {
  if (inset === 0) return contours
  const rings = /** @type {Vec2[][]} */ (geometries.geom2.toOutlines(insetSection))
  const fromCount = contours.reduce((sum, ring) => sum + ring.length, 0)
  const toCount = rings.reduce((sum, ring) => sum + ring.length, 0)
  /** @returns {never} */
  const countChanged = () => {
    // `extrudeFromSlices` cannot wall two rings of different lengths into anything
    // meaningful, and quietly returning a mangled solid is the failure class this whole
    // module exists to refuse.
    throw new Error(
      `${op}: the rim profile changes the cross-section's vertex count ` +
        `(${fromCount} to ${toCount}), so the sweep has no correspondence to loft ` +
        'along. This happens when an offset merges or splits part of the outline; use ' +
        'a smaller radius.'
    )
  }
  if (rings.length !== contours.length || toCount !== fromCount) countChanged()

  const used = new Set()
  return contours.map((ring, contourIndex) => {
    const mitres = mitresOf(ring, inset)
    let best = { worst: Infinity, candidate: -1, shift: 0 }
    rings.forEach((candidate, candidateIndex) => {
      if (used.has(candidateIndex) || candidate.length !== ring.length) return
      // Start at the candidate vertex nearest the first mitre, then measure every vertex.
      let shift = 0
      let nearest = Infinity
      candidate.forEach((point, index) => {
        const distance = Math.hypot(point[0] - mitres[0][0], point[1] - mitres[0][1])
        if (distance < nearest) {
          nearest = distance
          shift = index
        }
      })
      let worst = 0
      for (let index = 0; index < ring.length && worst <= best.worst; index += 1) {
        const point = candidate[(index + shift) % ring.length]
        const mitre = mitres[index]
        const moved = Math.hypot(mitre[0] - ring[index][0], mitre[1] - ring[index][1])
        const allowed = CORRESPONDENCE_FLOOR_MM + CORRESPONDENCE_SHARE * moved
        const miss = Math.hypot(point[0] - mitre[0], point[1] - mitre[1]) / allowed
        worst = Number.isNaN(miss) ? Infinity : Math.max(worst, miss)
      }
      if (worst < best.worst) best = { worst, candidate: candidateIndex, shift }
    })
    if (best.candidate < 0) countChanged()
    if (!(best.worst <= 1)) {
      throw new Error(
        `${op}: the rim profile's slices do not correspond — contour ${contourIndex + 1} of ` +
          `the cross-section has no inset ring whose corners sit where a ${inset}mm inset ` +
          'puts them. Lofting them would return a twisted solid, so this stops here; ' +
          'please report it with the project file.'
      )
    }
    used.add(best.candidate)
    const partner = rings[best.candidate]
    return ring.map((_unused, index) => partner[(index + best.shift) % ring.length])
  })
}

/**
 * What each contour of a section is, for an error a person can act on.
 *
 * @param {Vec2[][]} contours
 * @returns {Array<'outside' | 'hole' | 'island'>}
 */
function contourKinds(contours) {
  /** @param {Vec2} point @param {Vec2[]} ring */
  const inside = (point, ring) => {
    let crossings = 0
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
      const a = ring[index]
      const b = ring[previous]
      if (a[1] > point[1] !== b[1] > point[1] && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) {
        crossings += 1
      }
    }
    return crossings % 2 === 1
  }
  return contours.map((ring, index) => {
    if (ringArea(ring) < 0) return 'hole'
    const depth = contours.filter((other, otherIndex) => otherIndex !== index && inside(ring[0], other)).length
    return depth === 0 ? 'outside' : 'island'
  })
}

/**
 * Shortest distance between segments `a0a1` and `b0b1`.
 *
 * @param {Vec2} a0 @param {Vec2} a1 @param {Vec2} b0 @param {Vec2} b1
 * @returns {number} Millimetres; 0 when they cross.
 */
function segmentDistance(a0, a1, b0, b1) {
  /** @param {Vec2} p @param {Vec2} q @param {Vec2} r */
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = cross(b0, b1, a0)
  const d2 = cross(b0, b1, a1)
  const d3 = cross(a0, a1, b0)
  const d4 = cross(a0, a1, b1)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0
  /** @param {Vec2} p @param {Vec2} s0 @param {Vec2} s1 */
  const toSegment = (p, s0, s1) => {
    const dx = s1[0] - s0[0]
    const dy = s1[1] - s0[1]
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - s0[0]) * dx + (p[1] - s0[1]) * dy) / lengthSquared))
    return Math.hypot(p[0] - (s0[0] + t * dx), p[1] - (s0[1] + t * dy))
  }
  return Math.min(toSegment(a0, b0, b1), toSegment(a1, b0, b1), toSegment(b0, a0, a1), toSegment(b1, a0, a1))
}

/**
 * The first pair of sides of the inset rings that touch or cross, other than neighbours
 * in one ring, or `null` if none do. A sort-and-sweep on X keeps this near linear on a
 * finely tessellated round hole.
 *
 * @param {Vec2[][]} rings
 * @returns {{ ringA: number, sideA: number, ringB: number, sideB: number } | null}
 */
function firstCollision(rings) {
  const sides = rings.flatMap((ring, ringIndex) =>
    ring.map((from, sideIndex) => {
      const to = ring[(sideIndex + 1) % ring.length]
      return {
        ringIndex,
        sideIndex,
        from,
        to,
        minX: Math.min(from[0], to[0]),
        maxX: Math.max(from[0], to[0]),
        minY: Math.min(from[1], to[1]),
        maxY: Math.max(from[1], to[1]),
      }
    })
  )
  sides.sort((a, b) => a.minX - b.minX)
  for (let i = 0; i < sides.length; i += 1) {
    const a = sides[i]
    for (let j = i + 1; j < sides.length && sides[j].minX <= a.maxX + TOUCH_EPSILON_MM; j += 1) {
      const b = sides[j]
      if (b.minY > a.maxY + TOUCH_EPSILON_MM || a.minY > b.maxY + TOUCH_EPSILON_MM) continue
      if (a.ringIndex === b.ringIndex) {
        const length = rings[a.ringIndex].length
        const gap = Math.abs(a.sideIndex - b.sideIndex)
        if (gap <= 1 || gap === length - 1) continue
      }
      if (segmentDistance(a.from, a.to, b.from, b.to) <= TOUCH_EPSILON_MM) {
        return { ringA: a.ringIndex, sideA: a.sideIndex, ringB: b.ringIndex, sideB: b.sideIndex }
      }
    }
  }
  return null
}

/**
 * What a positive radius runs into, by the kinds of the two contours that met (sorted,
 * joined with `+`). Only these two pairs move *towards* each other under an inset; an
 * island and the hole round it move apart.
 *
 * @type {Readonly<Record<string, string>>}
 */
const WALL_NAMES = Object.freeze({
  'hole+outside': 'the wall between a hole and the outside edge',
  'hole+hole': 'the wall between two holes',
})

/**
 * The same for a flare (negative radius), which moves every contour the other way.
 *
 * @type {Readonly<Record<string, string>>}
 */
const GAP_NAMES = Object.freeze({
  'hole+island': 'the gap between a hole and the island inside it',
  'outside+outside': 'the gap between two separate outlines',
})

/**
 * Reject a radius the face's contours cannot all take without running into each other
 * (`TODO/core-051`).
 *
 * A rim op moves **every** contour of the face into the material: a chamfer of *r* cuts
 * the outside edge in by *r* and grows each hole by *r*. So the wall between a hole and
 * the outside edge, or between two holes, is cut from both sides, and when it is narrower
 * than `2r` the two bevels cross. `expansions.offset` does not notice — it offsets each
 * outline on its own — and {@link assertRadiusFits} cannot either, because it reads only
 * the section's total area, which keeps falling straight through the collision. A
 * negative radius runs the other way: it shrinks every hole, and a hole smaller than
 * `2|r|` closes and re-opens inside out, which `offset` does not stop at either (the
 * core-003 note on {@link assertRadiusFits}).
 *
 * Checked at every inset the profile lofts *and* at evenly spaced probes across the
 * band, since a chamfer lofts only its two ends:
 *
 * - each contour's signed area must keep moving the one way an inset moves it — down for
 *   a positive radius, up for a negative one — and never change sign, which catches a
 *   hole or an island collapsing;
 * - no two sides of the inset rings may touch or cross, other than neighbours, which
 *   catches two contours (or two stretches of one) meeting.
 *
 * @param {Vec2[][]} contours The section's outlines.
 * @param {Array<{ inset: number, rings: Vec2[][] }>} samples Ordered by `|inset|`, rising.
 * @param {number} radius Signed.
 * @param {string} op
 * @returns {void}
 */
function assertContoursClear(contours, samples, radius, op) {
  const kinds = contourKinds(contours)
  const direction = Math.sign(radius)
  let previous = contours.map(ringArea)
  for (const { inset, rings } of samples) {
    const areas = rings.map(ringArea)
    areas.forEach((area, index) => {
      // Floating-point slack only: two samples a hair apart (a fillet's last inset,
      // r·(1 − cos 90°), against the probe at r) may measure equal.
      const slack = 1e-9 * Math.abs(previous[index])
      if (Math.sign(area) === Math.sign(previous[index]) && direction * (previous[index] - area) >= -slack) return
      if (radius < 0 && kinds[index] === 'hole') {
        throw new Error(
          `${op}: a ${-radius}mm flare closes a hole in this face — a flare shrinks every hole ` +
            `by ${-radius}mm on each side, and this one is too small to take it. Use a smaller ` +
            'flare, or fill the hole first.'
        )
      }
      throw new Error(
        `${op}: radius ${radius}mm is wider than the cross-section can absorb — an inset of ` +
          `${Math.abs(inset).toFixed(3)}mm collapses ${kinds[index] === 'island' ? 'an island' : 'one of its outlines'}. ` +
          'Use a smaller radius.'
      )
    })
    previous = areas

    const hit = firstCollision(rings)
    if (hit) {
      const a = contours[hit.ringA]
      const b = contours[hit.ringB]
      const width = segmentDistance(
        a[hit.sideA],
        a[(hit.sideA + 1) % a.length],
        b[hit.sideB],
        b[(hit.sideB + 1) % b.length]
      )
      // Two stretches of one ring meeting (a hole bent round a thin tongue) name no pair.
      const pair =
        hit.ringA === hit.ringB ? 'same' : [kinds[hit.ringA], kinds[hit.ringB]].sort((x, y) => x.localeCompare(y)).join('+')
      const size = Math.abs(radius)
      if (radius > 0) {
        const what = WALL_NAMES[pair] ?? 'a wall of this face'
        throw new Error(
          `${op}: radius ${radius}mm is too large for this face — ${what} is only ` +
            `${width.toFixed(2)}mm wide, and the rim cuts into it by ${size}mm from each side, ` +
            `so the two cuts would run into each other. Use a radius under ${(width / 2).toFixed(2)}mm.`
        )
      }
      const what = GAP_NAMES[pair] ?? 'a gap in this face'
      throw new Error(
        `${op}: a ${size}mm flare is too large for this face — ${what} is only ` +
          `${width.toFixed(2)}mm wide, and the flare grows into it by ${size}mm from each side, ` +
          `so the two would run into each other. Use a flare under ${(width / 2).toFixed(2)}mm.`
      )
    }
  }
}

/**
 * Build each slice's sides in the base section's **own** side order, so side `i` of every
 * slice partners side `i` of the base.
 *
 * Any one order would do for correctness, as long as every slice used it. This one is the
 * order the sweep used before `TODO/core-051` (`geom2.toSides(base)`), so wherever the old
 * sweep was already right (every single-outline face) it still writes the identical
 * polygons, and the `legacy` tessellation golden (`resolution.spec.js`) stays
 * byte-for-byte. `geom2.toOutlines` starts each ring one vertex along from `toSides`, which
 * is why the rings themselves are not used in their own order.
 *
 * @param {Geom2} base
 * @param {Vec2[][]} contours `geom2.toOutlines(base)`.
 * @param {string} op
 * @returns {(rings: Vec2[][]) => Array<[Vec2, Vec2]>} Sides for rings aligned to `contours`.
 */
function sidesInBaseOrder(base, contours, op) {
  /** @param {Vec2} from @param {Vec2} to */
  const keyOf = (from, to) => `${from[0]},${from[1]}|${to[0]},${to[1]}`
  /** @type {Map<string, [number, number]>} */
  const where = new Map()
  contours.forEach((ring, contour) =>
    ring.forEach((point, index) => where.set(keyOf(point, ring[(index + 1) % ring.length]), [contour, index]))
  )
  const order = geometries.geom2.toSides(base).map(([from, to]) => {
    const found = where.get(keyOf(/** @type {Vec2} */ (from), /** @type {Vec2} */ (to)))
    if (!found) {
      throw new Error(`${op}: the cross-section's outlines do not account for every side of it, so the sweep has no correspondence to loft along.`)
    }
    return found
  })
  return (rings) =>
    order.map(([contour, index]) => {
      const ring = rings[contour]
      return /** @type {[Vec2, Vec2]} */ ([ring[index], ring[(index + 1) % ring.length]])
    })
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

  const remainder = booleans.intersect(canonical, slabOver(bounds, bounds[0][2] - 1, cutZ))
  const base = snapSectionToSolid(sectionAt(canonical, bounds, cutZ), remainder, cutZ)
  assertPrismaticBand(base, sectionAt(canonical, bounds, faceZ), op)

  // Every slice is built and checked before any of it is lofted, rather than inside
  // the callback: the check below is a comparison between slices, and depending on
  // `extrudeFromSlices` to invoke its callback in index order would make a
  // correctness guard hostage to an implementation detail of the kernel.
  //
  // Only for an inward radius: the guard exists because an over-large *inset*
  // collapses the outline through zero and re-expands it inverted. An outward offset
  // has no such failure mode for the outside edge — the section only grows — so
  // applying the guard to a negative radius would reject every legitimate flare. (It
  // does for a hole, which a flare shrinks; `assertContoursClear` covers that per contour.)
  if (r > 0) assertRadiusFits(base, r, op)

  // The section as contours — the unit the slices must correspond by (TODO/core-051).
  const contours = /** @type {Vec2[][]} */ (geometries.geom2.toOutlines(base))
  /** @type {Map<number, Vec2[][]>} */
  const ringsAt = new Map([[0, contours]])
  /** @param {number} inset @returns {Vec2[][]} */
  const insetRings = (inset) => {
    let rings = ringsAt.get(inset)
    if (!rings) {
      rings = alignInsetContours(contours, expansions.offset({ delta: -inset, corners: 'edge' }, base), inset, op)
      ringsAt.set(inset, rings)
    }
    return rings
  }

  const steps = Array.from({ length: slices }, (_unused, index) => profile(index / (slices - 1), r))
  const probes = Array.from({ length: RADIUS_PROBE_SAMPLES - 1 }, (_unused, index) => (r * (index + 1)) / (RADIUS_PROBE_SAMPLES - 1))
  const insets = [...new Set([...steps.map(({ inset }) => inset), ...probes])]
    .filter((inset) => inset !== 0)
    .sort((a, b) => Math.abs(a) - Math.abs(b))
  assertContoursClear(
    contours,
    insets.map((inset) => ({ inset, rings: insetRings(inset) })),
    r,
    op
  )

  const sidesOf = sidesInBaseOrder(base, contours, op)
  const loft = extrusions.extrudeFromSlices(
    {
      numberOfSlices: slices,
      callback: (_progress, index) => {
        const s = extrusions.slice.fromSides(/** @type {any} */ (sidesOf(insetRings(steps[index].inset))))
        return extrusions.slice.transform(
          maths.mat4.fromTranslation(maths.mat4.create(), [0, 0, cutZ + steps[index].rise]),
          s
        )
      },
    },
    base
  )

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
