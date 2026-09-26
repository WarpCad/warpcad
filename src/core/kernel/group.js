/**
 * A functional port of `jscad-utils`' `Group` concept onto JSCAD V3.
 *
 * ## Why this file exists
 *
 * JSCAD V3 removed the `CSG`/`CAG` prototype chain entirely (`Initial design.md` §5):
 * there is no object to hang `.snap()`/`.align()` off, because `transforms.translate`
 * takes its geometry as the *last* argument and returns a new value rather than
 * mutating a `this`. `jscad-utils`' `Group` — a named dictionary of solids with
 * chainable, mutating methods — therefore has no upstream equivalent to wrap. What it
 * actually provided is generic bounding-box/axis arithmetic that does not depend on
 * JSCAD's version at all; only the calling convention did. That arithmetic is ported
 * here, verbatim in behaviour, as pure functions over plain values.
 *
 * ## jscad-object-api: health-checked, not adopted (TODO/core-001 step 1)
 *
 * `jscad-object-api@3.0.6` (`jscad-community/jscad-object-api`, last pushed
 * 2026-05-01) restores a *chained* calling style over `@jscad/modeling`. It was
 * rejected for three reasons, in order of weight:
 *
 *   1. **It solves the wrong problem.** Its surface is chained wrappers around
 *      primitives, transforms and booleans — the very calls this kernel already makes
 *      directly. It has no `Group`, no named-part dictionary, no `snap`/`align`/
 *      `combine`/`pick`, which is the entire capability that had to be rebuilt. Under
 *      the task's own "only hand-port whatever it doesn't already cover" test, it
 *      covers none of it.
 *   2. **Chaining is actively unwanted here.** `Initial design.md` §4 wants recipes
 *      that emit plain-JSON op records, and `CLAUDE.md` wants a framework-free,
 *      immutable core. Re-introducing a mutable-looking `this` chain would work
 *      against both.
 *   3. **Adoption/health signal is poor**: 1 star, 1 open issue, effectively a
 *      single-maintainer project, against a load-bearing dependency.
 *
 * The five functions below came to roughly 200 lines of arithmetic with no
 * dependencies beyond `@jscad/modeling` itself, which is a smaller liability than the
 * dependency would have been. This note is the record of that decision; a full
 * `docs/decisions/` write-up is out of scope for the spike.
 *
 * ## Conventions
 *
 * All lengths are millimetres, Z-up, per `CLAUDE.md`. Every function returns a new
 * value; nothing here mutates its arguments. `Geom3` values from `@jscad/modeling`
 * are themselves immutable, so groups share geometry rather than cloning it — the V1
 * `pick()`/`clone()` `CSG.fromPolygons(part.toPolygons())` deep copy exists only
 * because V1 geometry was mutable, and has no purpose in V3.
 *
 * @module core/kernel/group
 */

import modeling from '@jscad/modeling'

import { assertRecordColor } from './colors.js'

// `@jscad/modeling@2.x` is CommonJS. A bundler resolves its named exports, but raw
// Node ESM does not — and `CLAUDE.md` requires `src/core/` to be testable in plain
// Node. Destructuring the default export works under both.
const { booleans, measurements, primitives, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */
/** @typedef {[number, number, number]} Vec3Mm A millimetre vector, Z-up. */
/** @typedef {[Vec3Mm, Vec3Mm]} BoundsMm `[min, max]` corners in millimetres. */

/**
 * A named dictionary of solids, the V3 equivalent of `jscad-utils`' `Group`.
 *
 * `names` is the ordered subset of `parts` that a default `combine()` unions —
 * a part present in `parts` but absent from `names` is "hidden": still addressable
 * by name (for snapping, or for a later explicit `combine('tap')`) but not part of
 * the solid the group renders as.
 *
 * @typedef {object} Group
 * @property {string} name Label used in error messages.
 * @property {readonly string[]} names Ordered visible part names.
 * @property {Readonly<Record<string, Geom3>>} parts All parts, visible and hidden.
 * @property {readonly Geom3[]} holes Solids subtracted by `combine` unless `noholes`.
 * @property {Readonly<Record<string, PartColor>>} colors Colour per part name, for the
 *   parts that have one (TODO/core-026). An uncoloured part is simply absent. Every
 *   function here that rebuilds a group carries this map, so a moved or resized washer
 *   is still gray.
 */

/**
 * One part's colour: `0xRRGGBB` and an alpha in `(0, 1]`, always materialised (1 when
 * the record left it out) so a consumer never has to default it. See `./colors.js`.
 *
 * @typedef {object} PartColor
 * @property {number} color
 * @property {number} alpha
 */

/** @type {Readonly<Record<string, PartColor>>} */
const NO_COLORS = Object.freeze({})

/**
 * `[withObjectBoundIndex, moveObjectBoundIndex]` per snap orientation, ported
 * verbatim from `jscad-utils`' `util.flushSide`. `0` is a bounding box's min corner,
 * `1` its max corner, and `-1` means "use the reference solid's centroid instead".
 *
 * @type {Readonly<Record<string, readonly [number, number]>>}
 */
export const SNAP_SIDES = Object.freeze({
  'above-outside': [1, 0],
  'above-inside': [1, 1],
  'below-outside': [0, 1],
  'below-inside': [0, 0],
  'outside+': [0, 1],
  'outside-': [1, 0],
  'inside+': [1, 1],
  'inside-': [0, 0],
  'center+': [-1, 1],
  'center-': [-1, 0],
})

/** @type {Readonly<Record<string, 0 | 1 | 2>>} */
const AXIS_INDEX = Object.freeze({ x: 0, y: 1, z: 2 })

/**
 * Build a `[x, y, z]` millimetre vector by evaluating `valueFor` on the named axes
 * only, leaving the others at zero. Ported from `jscad-utils`' `util.axisApply`.
 *
 * @param {string} axes One or more of `'x'`, `'y'`, `'z'`, e.g. `'z'` or `'xy'`.
 * @param {(index: number, axis: string) => number} valueFor Called per named axis.
 * @returns {Vec3Mm}
 */
export function axisApply(axes, valueFor) {
  /** @type {Vec3Mm} */
  const result = [0, 0, 0]
  for (const axis of axes.split('')) {
    const index = AXIS_INDEX[axis]
    if (index === undefined) throw new Error(`unknown axis ${axis} in axes "${axes}"`)
    result[index] = valueFor(index, axis)
  }
  return result
}

/**
 * Bounding box of a solid or group, in millimetres.
 *
 * A hole-free group is measured **part by part, never unioned** (`TODO/core-029`). The
 * box around a union of solids is the box around their boxes, so the union — the
 * expensive half of `combine()`, and until `core-029` the largest piece of kernel work
 * the main thread did on every mutation, because every body summary, snap target and
 * marquee test called this — bought nothing here. Measured against the real union on
 * every library composite: equal to within 7e-15 mm, at ~0.01 ms instead of 1-8 ms
 * each (`measure.spec.js` holds it to 1e-9).
 *
 * The parts measured are the ones `combine()` would have unioned — the visible
 * `names`, so a hidden tap clearance never widens the box — and an empty part (no
 * polygons) is skipped, as the union would contribute nothing for it. A group carrying
 * **holes** still goes through the exact `combine()`: a subtraction can shrink the box,
 * and only doing it says by how much. Nothing in the app builds such a group today.
 *
 * @param {Geom3 | Group} value
 * @returns {BoundsMm}
 */
export function boundsOf(value) {
  if (isGroup(value) && value.holes.length === 0 && value.names.length > 0) {
    /** @type {Vec3Mm} */
    const min = [Infinity, Infinity, Infinity]
    /** @type {Vec3Mm} */
    const max = [-Infinity, -Infinity, -Infinity]
    let measured = 0
    for (const name of resolvePieces(value)) {
      const part = value.parts[name]
      if (part.polygons.length === 0) continue
      const [partMin, partMax] = measurements.measureBoundingBox(part)
      for (let axis = 0; axis < 3; axis += 1) {
        if (partMin[axis] < min[axis]) min[axis] = partMin[axis]
        if (partMax[axis] > max[axis]) max[axis] = partMax[axis]
      }
      measured += 1
    }
    // `+ 0` turns a `-0` into `0`: a part's own box can report `-0` where the union's
    // reported `0`, and a signed zero would otherwise leak into the vectors recipes and
    // drops bake into records (`library.spec.js`'s drop translate caught exactly that).
    if (measured > 0) {
      return [
        [min[0] + 0, min[1] + 0, min[2] + 0],
        [max[0] + 0, max[1] + 0, max[2] + 0],
      ]
    }
    // Every visible part is empty: fall through, so the answer is whatever an empty
    // union measures — the same as it always was.
  }
  const [min, max] = measurements.measureBoundingBox(toGeom3(value))
  return [
    [min[0], min[1], min[2]],
    [max[0], max[1], max[2]],
  ]
}

/**
 * Volume of a solid or group, in cubic millimetres.
 *
 * Added by `TODO/ui-027`: `modify.filletRim`/`chamferRim` deliberately leave a
 * solid's axis-aligned bounding box unchanged (`fillet.js`'s own module doc —
 * "the face keeps its position... material is removed from the rim only",
 * confirmed by `fillet.spec.js`'s own "leaves the bounding box alone" case),
 * so `boundsOf` above cannot tell a rim operation's UI spec whether anything
 * actually happened. Volume can: rim material is genuinely removed (fillet)
 * or replaced with less material (chamfer), so it strictly decreases either
 * way — the real, kernel-test-backed signal to check instead of a bounding
 * box that is invariant by design.
 *
 * @param {Geom3 | Group} value
 * @returns {number}
 */
export function volumeOf(value) {
  return measurements.measureVolume(toGeom3(value))
}

/** Degrees to radians. The single conversion point in this module. */
const DEG = Math.PI / 180

/**
 * Bounding box of a solid **in its own local, unrotated frame** (`TODO/ui-023`).
 *
 * {@link boundsOf} measures the world-axis-aligned box — the solid's shadow on
 * the main grid. For an unrotated body that *is* its real size, but the moment a
 * `transform.rotate` record is applied the two part company: a cylinder tilted
 * 30° about X fits inside a box that is bigger on two axes than the cylinder is,
 * and neither of those numbers is its diameter or its length. Dimension lines
 * exist so a user can read a part's size off the screen, so they need this
 * measurement, not that one.
 *
 * ## How the local frame is recovered
 *
 * A rotated solid's polygons carry no memory of the angle that produced them
 * (see `src/core/transform.js`), so the angle rides along on the record and
 * arrives here as `rotationDeg`. Applying its **inverse** un-turns the solid back
 * onto its own axes, and the box of *that* is the part's real size.
 *
 * The inverse has to match `src/core/kernel/registry.js`'s `transform.rotate`
 * exactly. That op calls `@jscad/modeling`'s `transforms.rotate`, which is
 * active, intrinsic Tait-Bryan in **z-y-x** order — `R = Rz(z)·Ry(y)·Rx(x)` — so
 * the inverse is `Rx(-x)·Ry(-y)·Rz(-z)`, applied in that order, which is the
 * three sequential calls below rather than one negated triple. A single
 * `rotate([-x,-y,-z])` would be `Rz(-z)·Ry(-y)·Rx(-x)`, a *different* rotation.
 *
 * ## Why the pivot matters, and why its exact choice does not
 *
 * The un-turn happens about `pivotMm`, not the world origin: rotating a body
 * sitting 300 mm out about the origin would fling it across the scene, and while
 * that would not change the *size* of the resulting box, it would put it
 * somewhere unrelated to the solid and cost precision on the way. The returned
 * box is therefore in a frame anchored at `pivotMm`, and a caller maps a local
 * point back with `pivot + R·(local − pivot)`. Because that is the exact inverse
 * of what happens here, *any* consistently-used pivot is correct — which matters,
 * because a body's world-AABB centre moves when an asymmetric solid (a cone) is
 * turned, so the pivot used here is not in general the same point the original
 * `transform.rotate` record turned about.
 *
 * ## `rotationDeg` is a faithful description of the solid (`TODO/core-004`)
 *
 * This un-turn is only ever as good as the rotation handed to it, so it is worth
 * saying what that value now guarantees. `rotationDeg` used to be a carried
 * **sum** of the deltas applied to the body while the geometry was their
 * **composition**, and rotations do not commute — so the two agreed only for a
 * history of single-axis turns and for one applied X-then-Y-then-Z. An
 * out-of-order mixed history (a Z turn, then an X turn) drifted, and the box
 * below came back larger than the part: a ⌀40 × 50 cylinder turned 45° about Y
 * and then 45° about X measured 46.82 / 51.05 / 59.42, not one of which is a
 * dimension of the cylinder.
 *
 * `src/core/transform.js` now composes rather than adds, so the carried triple is
 * the orientation the solid is genuinely in, for any history, and the inverse
 * taken here is the true inverse. Nothing in this function changed — it was
 * always the exact inverse of `R(rotationDeg)`; what changed is that
 * `rotationDeg` is now worth inverting.
 *
 * @param {Geom3 | Group} value
 * @param {readonly number[]} [rotationDeg] Absolute rotation currently applied,
 *   per axis. Zero (or absent) short-circuits to {@link boundsOf}.
 * @param {readonly number[]} [pivotMm] Point to un-turn about; defaults to the
 *   solid's own bounding-box centre.
 * @returns {BoundsMm} `[min, max]` in the local frame anchored at `pivotMm`.
 */
export function localBoundsOf(value, rotationDeg, pivotMm) {
  const geometry = toGeom3(value)
  const x = rotationDeg?.[0] ?? 0
  const y = rotationDeg?.[1] ?? 0
  const z = rotationDeg?.[2] ?? 0
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new Error(`localBoundsOf: rotation must be three finite degree values, got ${JSON.stringify(rotationDeg)}`)
  }
  // An unrotated body's local box *is* its world box, bit for bit — worth
  // short-circuiting both for the cost and so nothing drifts by a float epsilon
  // in the overwhelmingly common case.
  if (x === 0 && y === 0 && z === 0) return boundsOf(geometry)

  const pivot = pivotMm ?? centroidOf(geometry)
  let turned = transforms.translate(
    /** @type {Vec3Mm} */ ([-pivot[0], -pivot[1], -pivot[2]]),
    geometry
  )
  if (z !== 0) turned = transforms.rotate([0, 0, -z * DEG], turned)
  if (y !== 0) turned = transforms.rotate([0, -y * DEG, 0], turned)
  if (x !== 0) turned = transforms.rotate([-x * DEG, 0, 0], turned)
  return boundsOf(
    transforms.translate(/** @type {Vec3Mm} */ ([pivot[0], pivot[1], pivot[2]]), turned)
  )
}

/**
 * Overall size of a solid or group, in millimetres.
 *
 * @param {Geom3 | Group} value
 * @returns {Vec3Mm}
 */
export function sizeOf(value) {
  const [min, max] = boundsOf(value)
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
}

/**
 * Bounding-box centre of a solid or group, in millimetres. Named `centroidOf` to
 * match `jscad-utils`' `util.centroid`, which was likewise the box centre and not the
 * centre of mass.
 *
 * @param {Geom3 | Group} value
 * @returns {Vec3Mm}
 */
export function centroidOf(value) {
  const [min, max] = boundsOf(value)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/**
 * Millimetre translation that places `moving` against `reference` on the named axes.
 * The V3 port of `jscad-utils`' `util.calcSnap`; `snap()` below is this plus the
 * translate. Recipes call this directly to resolve a concrete vector they then bake
 * into a `transform.translate` op record (`Initial design.md` §4).
 *
 * @param {Geom3 | Group} moving Solid being moved.
 * @param {Geom3 | Group} reference Solid being moved against.
 * @param {string} axes Axes to snap on, e.g. `'z'`.
 * @param {string} orientation A key of {@link SNAP_SIDES}, e.g. `'outside-'`.
 * @param {number} [deltaMm] Extra offset applied to each snapped axis.
 * @returns {Vec3Mm}
 */
export function calcSnap(moving, reference, axes, orientation, deltaMm) {
  const side = SNAP_SIDES[orientation]
  if (!side) {
    throw new Error(
      `calcSnap: unknown orientation "${orientation}", expected one of ` +
        Object.keys(SNAP_SIDES).join('|')
    )
  }
  const movingBounds = boundsOf(moving)
  const referenceBounds = boundsOf(reference)
  const referenceCentroid = centroidOf(reference)
  const [referenceSide, movingSide] = side

  return axisApply(axes, (index) => {
    const from =
      referenceSide === -1 ? referenceCentroid[index] : referenceBounds[referenceSide][index]
    return from - movingBounds[movingSide][index] + (deltaMm ?? 0)
  })
}

/**
 * Millimetre translation that centres `moving` on `reference` along the named axes.
 * The V3 port of `jscad-utils`' `util.calcCenterWith`.
 *
 * @param {Geom3 | Group} moving
 * @param {string} axes
 * @param {Geom3 | Group} reference
 * @param {number | Vec3Mm} [delta] Scalar added to every axis, or a per-axis vector.
 * @returns {Vec3Mm}
 */
export function calcCenterWith(moving, axes, reference, delta) {
  const movingCentroid = centroidOf(moving)
  const referenceCentroid = centroidOf(reference)
  const offset = axisApply(axes, (index) => referenceCentroid[index] - movingCentroid[index])
  if (delta === undefined) return offset
  return /** @type {Vec3Mm} */ (
    offset.map((value, index) => value + (Array.isArray(delta) ? delta[index] : delta))
  )
}

/**
 * An empty group.
 *
 * @param {string} [name] Label used in error messages.
 * @returns {Group}
 */
export function createGroup(name = '') {
  return Object.freeze({
    name,
    names: Object.freeze([]),
    parts: Object.freeze({}),
    holes: Object.freeze([]),
    colors: NO_COLORS,
  })
}

/**
 * True when `value` is a {@link Group} rather than a bare solid.
 *
 * @param {unknown} value
 * @returns {value is Group}
 */
export function isGroup(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray(/** @type {Group} */ (value).names) &&
    typeof (/** @type {Group} */ (value).parts) === 'object'
  )
}

/**
 * Part names present in the group but absent from its visible `names` — every
 * "hidden" part (a bolt's `tap`/`tap-*`, a washer's `clearance`), in the group's own
 * `parts` insertion order (`TODO/ui-047`).
 *
 * The one definition of "hidden" for a UI to read: `src/stores/document.js`'s
 * `summarizeBody` (the Objects list's `hiddenPartNames`) and `src/core/inspector.js`'s
 * `describeBody` (the Inspector's **Hidden parts** section) both call this rather than
 * each re-deriving the same `parts` name filter, so the two surfaces can never disagree
 * about which parts of a body are hidden.
 *
 * @param {Group} group
 * @returns {readonly string[]}
 */
export function hiddenNamesOf(group) {
  return Object.keys(group.parts).filter((name) => !group.names.includes(name))
}

/**
 * Whether a body's geometry can be addressed part-by-part: a {@link Group} with at least
 * one **named** (visible) part and no holes.
 *
 * This is the one place that condition lives. The renderer draws such a body as one mesh
 * per part (`createBodyObject`), which is what makes a viewport second click able to drill
 * to a part; the document summary lists such a body's parts for the Objects list
 * (`TODO/ui-042`). A group with holes is drawn as one combined mesh — a per-part mesh would
 * render straight through them — and a group with only hidden parts cannot be drawn
 * part-by-part at all, so neither offers a part to point at.
 *
 * @param {unknown} value
 * @returns {value is Group}
 */
export function hasNamedParts(value) {
  return isGroup(value) && value.names.length > 0 && value.holes.length === 0
}

/**
 * Reduce a solid *or* a group to a single solid. A group collapses via
 * {@link combine}, matching `jscad-utils`, where handing a `Group` to something that
 * wanted geometry implicitly combined it.
 *
 * @param {Geom3 | Group} value
 * @returns {Geom3}
 */
export function toGeom3(value) {
  return isGroup(value) ? combine(value) : value
}

/**
 * Resolve a comma-separated piece list against a group, defaulting to its visible
 * `names`.
 *
 * @param {Group} group
 * @param {string} [pieces]
 * @returns {readonly string[]}
 */
function resolvePieces(group, pieces) {
  const requested = pieces ? pieces.split(',').map((piece) => piece.trim()) : group.names
  if (requested.length === 0) {
    throw new Error(
      `combine: no pieces to combine in group "${group.name || '(unnamed)'}" ` +
        `(parts: ${Object.keys(group.parts).join(',') || 'none'})`
    )
  }
  for (const piece of requested) {
    if (!group.parts[piece]) {
      throw new Error(
        `combine: no part named "${piece}" in group "${group.name || '(unnamed)'}" ` +
          `(parts: ${Object.keys(group.parts).join(',') || 'none'})`
      )
    }
  }
  return requested
}

/**
 * Union the named parts (default: the group's visible `names`) into one solid, then
 * subtract the group's holes unless `noholes` is set. The V3 port of
 * `jscad-utils`' `Group.combine`.
 *
 * @param {Group} group
 * @param {string} [pieces] Comma-separated part names.
 * @param {{ noholes?: boolean }} [options]
 * @returns {Geom3}
 */
export function combine(group, pieces, options = {}) {
  const names = resolvePieces(group, pieces)
  const solids = names.map((name) => group.parts[name])
  const united = solids.length === 1 ? solids[0] : booleans.union(solids)
  if (options.noholes || group.holes.length === 0) return united
  return booleans.subtract(united, ...group.holes)
}

/**
 * Add a solid — or flatten another group — under `partName`, returning a new group.
 * The V3 port of `jscad-utils`' `Group.add(object, name, hidden, subparts, parts)`.
 *
 * @param {Group} group
 * @param {Geom3 | Group} object Solid, or a group to flatten.
 * @param {string} partName
 * @param {object} [options]
 * @param {boolean} [options.hidden] Keep the part addressable but out of `names`.
 * @param {string} [options.subpartPrefix] When `object` is a group, also copy each of
 *   its parts in under this prefix (V1's `subparts` argument).
 * @param {string} [options.pieces] When `object` is a group, which of its pieces the
 *   combined part is built from (V1's `parts` argument).
 * @param {number} [options.color] The part's `0xRRGGBB` colour (TODO/core-026) — V1's
 *   `.color(...)` on the object being added, carried the same way `hidden` is.
 * @param {number} [options.colorAlpha] Its alpha in `(0, 1]`; defaults to 1.
 * @returns {Group}
 */
export function add(group, object, partName, options = {}) {
  if (!partName) throw new Error('add: a part name is required')
  assertRecordColor(options.color, options.colorAlpha, `add: part "${partName}"`)
  const parts = { ...group.parts }
  const colors = { ...group.colors }
  // Re-adding a name replaces the part, so it replaces (or clears) its colour too.
  delete colors[partName]

  if (isGroup(object)) {
    parts[partName] = combine(object, options.pieces)
    if (options.subpartPrefix) {
      for (const key of Object.keys(object.parts)) {
        parts[options.subpartPrefix + key] = object.parts[key]
        const subColor = object.colors?.[key]
        if (subColor) colors[options.subpartPrefix + key] = subColor
        else delete colors[options.subpartPrefix + key]
      }
    }
  } else {
    parts[partName] = object
  }
  if (options.color !== undefined) {
    colors[partName] = Object.freeze({ color: options.color, alpha: options.colorAlpha ?? 1 })
  }

  const names = options.hidden ? group.names : [...group.names, partName]
  return Object.freeze({
    name: group.name,
    names: Object.freeze(names),
    parts: Object.freeze(parts),
    holes: group.holes,
    colors: Object.freeze(colors),
  })
}

/**
 * Add a solid to the group's hole set — geometry `combine` subtracts from the union
 * unless asked not to. Immutable equivalent of assigning `group.holes` in V1.
 *
 * @param {Group} group
 * @param {Geom3} geometry
 * @returns {Group}
 */
export function addHole(group, geometry) {
  return Object.freeze({
    name: group.name,
    names: group.names,
    parts: group.parts,
    holes: Object.freeze([...group.holes, geometry]),
    colors: group.colors,
  })
}

/**
 * A new group holding only the named parts (default: the visible ones), all visible.
 * The V3 port of `jscad-utils`' `Group.pick`.
 *
 * @param {Group} group
 * @param {string} [pieces] Comma-separated part names.
 * @returns {Group}
 */
export function pick(group, pieces) {
  const names = resolvePieces(group, pieces)
  /** @type {Record<string, Geom3>} */
  const parts = {}
  /** @type {Record<string, PartColor>} */
  const colors = {}
  for (const name of names) {
    parts[name] = group.parts[name]
    const color = group.colors?.[name]
    if (color) colors[name] = color
  }
  return Object.freeze({
    name: group.name,
    names: Object.freeze([...names]),
    parts: Object.freeze(parts),
    holes: group.holes,
    colors: Object.freeze(colors),
  })
}

/**
 * Apply one geometry function to a solid, or to **every part and hole** of a group,
 * returning the same kind of value it was given.
 *
 * This is what "a transform preserves what it is handed" means in one place
 * (TODO/core-024). A composite that has been moved or turned is still a composite:
 * its head is still addressable as `head`, exactly as V1's `Group.map`/`Group.
 * translate` kept a positioned bolt's parts addressable — which is the whole reason
 * `bolt.combine('tap')` works in the real `.jscad` corpus *after* the bolt has been
 * snapped into place, not only before.
 *
 * The same function is applied to every part rather than each part recomputing one
 * of its own. That is load-bearing for anything measured from the group as a whole
 * — a rotation about the *group's* centre is not a rotation about each part's
 * centre — and it is the same discipline {@link enlarge}'s `scaleAboutCentroid`
 * already follows for the same reason.
 *
 * @template {Geom3 | Group} T
 * @param {T} value
 * @param {(geometry: Geom3) => Geom3} fn Applied to a solid, or per part and hole.
 * @returns {T} A group in, a group out; a solid in, a solid out.
 */
export function mapGeometry(value, fn) {
  if (!isGroup(value)) return /** @type {T} */ (fn(/** @type {Geom3} */ (value)))
  /** @type {Record<string, Geom3>} */
  const parts = {}
  for (const [name, geometry] of Object.entries(value.parts)) parts[name] = fn(geometry)
  return /** @type {T} */ (
    Object.freeze({
      name: value.name,
      names: value.names,
      parts: Object.freeze(parts),
      holes: Object.freeze(value.holes.map(fn)),
      colors: value.colors ?? NO_COLORS,
    })
  )
}

/**
 * Translate every part and hole of a group, returning a new group.
 *
 * @param {Group} group
 * @param {Vec3Mm} vectorMm
 * @returns {Group}
 */
export function translate(group, vectorMm) {
  /** @type {Record<string, Geom3>} */
  const parts = {}
  for (const [name, geometry] of Object.entries(group.parts)) {
    parts[name] = transforms.translate(vectorMm, geometry)
  }
  return Object.freeze({
    name: group.name,
    names: group.names,
    parts: Object.freeze(parts),
    holes: Object.freeze(group.holes.map((hole) => transforms.translate(vectorMm, hole))),
    colors: group.colors ?? NO_COLORS,
  })
}

/**
 * Move the whole group so that its `movingPieces` sit against `reference` on the
 * named axes. Every other part travels with them, which is the point of the group —
 * a bolt's head follows its thread. The V3 port of `jscad-utils`' `Group.snap`.
 *
 * @param {Group} group
 * @param {string} movingPieces Comma-separated part names driving the move.
 * @param {Geom3 | Group} reference
 * @param {string} axes
 * @param {string} orientation A key of {@link SNAP_SIDES}.
 * @param {number} [deltaMm]
 * @returns {Group}
 */
export function snap(group, movingPieces, reference, axes, orientation, deltaMm) {
  const offset = calcSnap(
    combine(group, movingPieces),
    toGeom3(reference),
    axes,
    orientation,
    deltaMm
  )
  return translate(group, offset)
}

/**
 * Move the whole group so that its `movingPieces` are centred on `reference` along
 * the named axes. The V3 port of `jscad-utils`' `Group.align`, including its
 * `{noholes: true}` on the moving pieces.
 *
 * @param {Group} group
 * @param {string} movingPieces Comma-separated part names driving the move.
 * @param {Geom3 | Group} reference
 * @param {string} axes
 * @param {number | Vec3Mm} [delta]
 * @returns {Group}
 */
export function align(group, movingPieces, reference, axes, delta) {
  const offset = calcCenterWith(
    combine(group, movingPieces, { noholes: true }),
    axes,
    toGeom3(reference),
    delta
  )
  return translate(group, offset)
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Resizing and cutting (TODO/core-019)
 *
 * Three more `jscad-utils` ports, and unlike `snap`/`align` above these are real
 * translations rather than wiring: nothing in this module covered them before.
 * `enlarge` and `fit` are the same arithmetic V1 used, expressed over
 * `@jscad/modeling`'s argument order; `bisect` is a deliberate *technique*
 * substitution, explained on the function itself.
 *
 * Each is checked against measured V1 output rather than against a reading of V1's
 * source — `scripts/generate-v1-modify-fixture.cjs` runs the real `jscad-utils@3.2.0`
 * under Node and `group.spec.js` diffs against what it recorded, the same discipline
 * `core-010`/`core-011` used for `hardware.nut`/`hardware.washer`. That was not
 * ceremony: two of V1's conventions here are invisible in its source (which half of a
 * bisect is `positive`, and what a negative offset measures from), and the first one
 * reads backwards from the source alone.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Axis letters in index order, for error messages that name the offending axis. */
const AXIS_NAMES = Object.freeze(['x', 'y', 'z'])

/**
 * Validate a per-axis millimetre triple.
 *
 * @param {unknown} value
 * @param {string} label Function name, so the throw says which call was wrong.
 * @returns {Vec3Mm}
 */
function requireVec3Mm(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => Number.isFinite(n))) {
    throw new Error(
      `${label}: expected three finite millimetre values [x, y, z], got ${JSON.stringify(value)}`
    )
  }
  return /** @type {Vec3Mm} */ ([value[0], value[1], value[2]])
}

/**
 * Scale a solid or group about its own bounding-box centre, so it changes size
 * without moving.
 *
 * This is exactly V1's arithmetic, not merely an equivalent of it. V1 scaled about
 * the world origin and then translated by `−(centroid(scaled) − centroid(original))`;
 * because a bounding-box centre scales linearly, that composes to `f·(p − c) + c` —
 * a scale about `c`. The same two steps are kept here rather than the more obvious
 * translate-scale-translate sandwich, so the float path matches V1's to the digit.
 *
 * A group keeps its named parts, scaled by the *group's* factor rather than each
 * part recomputing one from its own bounds — the same reason `translate` above maps
 * over parts, and the reason `group.snap` hands back a group at all: a bolt that has
 * been resized should still have an addressable head.
 *
 * @param {Geom3 | Group} value
 * @param {Vec3Mm} factors Per-axis scale factors; every one must be positive.
 * @returns {Geom3 | Group} A group in, a group out.
 */
function scaleAboutCentroid(value, factors) {
  const centre = centroidOf(value)
  /** @type {Vec3Mm} */
  const offset = [
    centre[0] - factors[0] * centre[0],
    centre[1] - factors[1] * centre[1],
    centre[2] - factors[2] * centre[2],
  ]
  /** @param {Geom3} geometry */
  const apply = (geometry) => transforms.translate(offset, transforms.scale(factors, geometry))

  if (!isGroup(value)) return apply(value)

  /** @type {Record<string, Geom3>} */
  const parts = {}
  for (const [name, geometry] of Object.entries(value.parts)) parts[name] = apply(geometry)
  return Object.freeze({
    name: value.name,
    names: value.names,
    parts: Object.freeze(parts),
    holes: Object.freeze(value.holes.map(apply)),
    colors: value.colors ?? NO_COLORS,
  })
}

/**
 * Grow (or shrink) a solid by an **absolute millimetre amount per axis**, keeping its
 * centroid where it is. The V3 port of `jscad-utils`' `util.enlarge`.
 *
 * `enlarge(box, [1, 1, 1])` makes every dimension 1 mm larger — not 1% larger, and not
 * 1 mm larger *on each side*. A zero delta leaves that axis alone, matching V1's own
 * `util.scale(size, 0) === 1` short-circuit (which is also why a zero delta is legal on
 * a zero-thickness axis, where no scale factor exists).
 *
 * ## Two divergences from V1, both deliberate
 *
 * 1. **The delta is one `[x, y, z]` vector, not three optional arguments.** V1 accepted
 *    either, and the two published versions disagree about what the spread form does
 *    when an argument is omitted: `jscad-utils@3.2.0`'s shipped bundle reads
 *    `[x, y, z]` literally, so `enlarge(o, 3)` produces `NaN` geometry, while its
 *    current source defaults `y` and `z` to `x`. Taking a vector makes the question
 *    disappear rather than picking a side, and matches how every op record in this
 *    project passes params anyway.
 * 2. **A delta that would collapse or invert an axis throws, naming the axis.** V1
 *    silently produced a mirrored solid: a −12 mm delta on a 10 mm axis gave a 2 mm
 *    wide *inside-out* body, measured and recorded in the fixture. `@jscad/modeling`
 *    would refuse it anyway — `transforms.scale` throws "factors must be positive" —
 *    so the choice here is not whether to fail, but whether the failure says which
 *    axis and why. See `CLAUDE.md` on covering degenerate cases loudly.
 *
 * @param {Geom3 | Group} value
 * @param {Vec3Mm} deltaMm Per-axis absolute growth in millimetres; negative shrinks.
 * @returns {Geom3 | Group} A group in, a group out, parts intact.
 */
export function enlarge(value, deltaMm) {
  const delta = requireVec3Mm(deltaMm, 'enlarge')
  const size = sizeOf(value)
  const factors = /** @type {Vec3Mm} */ (
    AXIS_NAMES.map((axis, index) => {
      if (delta[index] === 0) return 1
      const current = size[index]
      const target = current + delta[index]
      if (!(current > 0)) {
        throw new Error(
          `enlarge: ${axis} is ${current} mm thick, so a ${delta[index]} mm delta has no ` +
            `scale factor — translate or rebuild the solid instead`
        )
      }
      if (!(target > 0)) {
        throw new Error(
          `enlarge: ${axis} delta ${delta[index]} mm would ` +
            `${target === 0 ? 'collapse' : 'invert'} a ${current} mm axis (new size ` +
            `${target} mm). V1 silently mirrored the solid here; this port refuses`
        )
      }
      return target / current
    })
  )
  return scaleAboutCentroid(value, factors)
}

/**
 * Scale a solid so each axis reaches an **absolute target size**, keeping its centroid
 * where it is. The V3 port of `jscad-utils`' `util.fit`, V1's usual way of sizing a
 * text label to the space it has to sit in.
 *
 * Where {@link enlarge} takes a delta, this takes the finished size: `fit(o, [5, 5, 5])`
 * makes the solid 5 mm on every axis whatever it was before.
 *
 * ## V1 behaviours reproduced exactly, because real call sites rely on them
 *
 * - **A target of `0` means "leave this axis alone"**, V1's own documented sentinel
 *   (`if (a[i] === 0) return 1` in its source). It is not "scale this axis to nothing".
 * - **`keepAspectRatio` applies the single smallest ratio to all three axes**, so the
 *   solid keeps its proportions and lands *inside* the target box rather than filling
 *   it. Note the quirk this inherits: a zero axis contributes a ratio of `1` to that
 *   minimum, so `fit(o, [15, 0, 60], true)` scales by `1` — nothing moves, and the 15
 *   and 60 go unmet. Surprising, measured, and preserved (fixture case
 *   "a zero axis's sentinel 1 can win the keep_aspect_ratio min").
 *
 * Unlike {@link enlarge}, no guard here diverges from V1 on the ordinary path; a
 * *negative* target is rejected, since V1 would mirror the solid and no call site in
 * the surveyed corpus passes one.
 *
 * @param {Geom3 | Group} value
 * @param {Vec3Mm} sizeMm Per-axis target size in millimetres; `0` means don't scale.
 * @param {boolean} [keepAspectRatio] Scale all axes by the smallest ratio instead.
 * @returns {Geom3 | Group} A group in, a group out, parts intact.
 */
export function fit(value, sizeMm, keepAspectRatio = false) {
  const target = requireVec3Mm(sizeMm, 'fit')
  const size = sizeOf(value)
  const ratios = AXIS_NAMES.map((axis, index) => {
    // V1's `fitRatio`: a zero target contributes 1, and that 1 is still a candidate
    // for the minimum below. See the doc comment's note on the quirk that creates.
    if (target[index] === 0) return 1
    if (target[index] < 0) {
      throw new Error(`fit: ${axis} target ${target[index]} mm is negative; sizes are unsigned`)
    }
    if (!(size[index] > 0)) {
      throw new Error(
        `fit: ${axis} is ${size[index]} mm thick and cannot be scaled to ${target[index]} mm`
      )
    }
    return target[index] / size[index]
  })
  const uniform = Math.min(...ratios)
  const factors = /** @type {Vec3Mm} */ (
    ratios.map((ratio, index) => {
      if (target[index] === 0) return 1
      return keepAspectRatio ? uniform : ratio
    })
  )
  return scaleAboutCentroid(value, factors)
}

/**
 * How far past the solid's own bounds the half-space box below extends, as a multiple
 * of the solid's largest dimension. Ten is arbitrary but not magic: it only has to be
 * comfortably more than one so the box cannot end inside the solid and leave a stray
 * face, while staying small enough that the boolean works at the solid's own scale
 * rather than against a number large enough to cost precision.
 */
const HALF_SPACE_REACH_FACTOR = 10

/**
 * Floor for the reach above, in millimetres, so a degenerate input — an empty solid,
 * or a sliver with near-zero extent on every axis — still produces a box with real
 * volume instead of a zero-sized cuboid `@jscad/modeling` would reject.
 */
const HALF_SPACE_MIN_REACH_MM = 1

/**
 * Resolve an offset along one axis into an absolute millimetre position, using V1's
 * `util.getDelta` convention. Shared by `bisect`'s `offsetMm` and its `rotateOffsetMm`
 * for the same reason V1 shares one `getDelta` for both: they are the same three-way
 * argument, and having two copies is how the two drift apart.
 *
 * Three distinct behaviours off one argument, all measured rather than read:
 * **omitted** (`undefined`/`null`) is the axis's centre; a **negative** value — and
 * `-0` counts, V1's `util.isNegative` tests `1/n` — measures back from the maximum
 * face; anything else, `0` included, measures forward from the minimum face.
 *
 * @param {BoundsMm[0]} min Minimum corner of the solid being measured.
 * @param {BoundsMm[1]} max Maximum corner.
 * @param {Vec3Mm} size Overall size, i.e. `max - min`.
 * @param {number} axisIndex `0`, `1` or `2`.
 * @param {number | null} [offsetMm]
 * @param {string} [label] Prefixes the throw, so it says which argument was wrong.
 * @returns {number} An absolute position in millimetres along that axis.
 */
function resolveAxisPositionMm(min, max, size, axisIndex, offsetMm, label = 'bisect: offset') {
  if (offsetMm === undefined || offsetMm === null) return min[axisIndex] + size[axisIndex] / 2
  if (!Number.isFinite(offsetMm)) {
    throw new Error(`${label} must be a finite millimetre value, got ${offsetMm}`)
  }
  // V1's `util.getDelta`: a negative offset (its `isNegative` counts `-0`) is measured
  // back from the maximum face instead of forward from the minimum.
  if (offsetMm < 0 || Object.is(offsetMm, -0)) return max[axisIndex] + offsetMm
  return min[axisIndex] + offsetMm
}

/**
 * Cut a solid with the plane `axis = cutMm`, returning both halves named for the side
 * of the axis each sits on. Purely geometric: it takes no view on which half V1 calls
 * `negative`, because that answer is axis-dependent (see {@link bisect}).
 *
 * The technique is the half-space box described on {@link bisect}. `cutMm` is an
 * absolute position, deliberately not an offset — the angled path resolves the cut
 * position against the *original* solid and then cuts a *rotated* one, so offset
 * resolution and the cut itself cannot share a frame.
 *
 * @param {Geom3} geometry
 * @param {number} axisIndex `0`, `1` or `2`.
 * @param {number} cutMm Absolute cut position along that axis.
 * @returns {{ lower: Geom3, upper: Geom3 }} `lower` is the minimum-side piece.
 */
function cutHalfSpaces(geometry, axisIndex, cutMm) {
  const [min, max] = boundsOf(geometry)
  const size = sizeOf(geometry)
  const reach = Math.max(HALF_SPACE_REACH_FACTOR * Math.max(...size), HALF_SPACE_MIN_REACH_MM)
  /** @type {Vec3Mm} */
  const halfSpaceSize = [0, 0, 0]
  /** @type {Vec3Mm} */
  const halfSpaceCentre = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    if (i === axisIndex) {
      // Near face exactly on the cut plane, far face well past the solid.
      halfSpaceSize[i] = reach
      halfSpaceCentre[i] = cutMm + reach / 2
    } else {
      // Overhang the solid on both sides, so the box never clips it sideways.
      halfSpaceSize[i] = size[i] + 2 * reach
      halfSpaceCentre[i] = (min[i] + max[i]) / 2
    }
  }
  const halfSpace = primitives.cuboid({ size: halfSpaceSize, center: halfSpaceCentre })
  return {
    lower: booleans.subtract(geometry, halfSpace),
    upper: booleans.intersect(geometry, halfSpace),
  }
}

/**
 * Which world axis the cut plane tilts about when `rotateAxis` is omitted, per cut
 * axis. V1's own table, verbatim.
 *
 * Exported (not just module-local) so `TODO/ui-036`'s Rotate-axis dropdown can
 * default itself to the same table this module already enforces at commit time,
 * rather than hand-duplicating the three-entry map in `OperationsToolbar.vue` and
 * risking the two silently drifting apart — `Viewport.vue` already imports a
 * constant (`boundsOf`) straight from this module for the same reason.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DEFAULT_ROTATE_AXIS = Object.freeze({ x: 'y', y: 'x', z: 'x' })

/**
 * Cut one solid in two along a plane perpendicular to `axis` — optionally *tilted*
 * away from perpendicular — returning a group of the two halves. The V3 port of
 * `jscad-utils`' `util.bisect(object, axis, offset, angle, rotateaxis, rotateoffset)`.
 *
 * ## The tilted form (TODO/core-021)
 *
 * `core-019` ported the straight cut and deferred the angle. It is here now, and it
 * turned out not to need the rotated ortho-normal cut-plane basis that deferral
 * assumed: tilting is a *coordinate transform* around the straight cut, not a new
 * boolean technique. For any isometry `T`, `cut(S, P) = T(cut(T⁻¹S, T⁻¹P))`; take `T`
 * to be V1's own `rotate(rotationCenter, rotationAxis, angle)` and `T⁻¹P` is exactly
 * the untilted plane the straight path already cuts against. So the angled path turns
 * the solid by `−angleDeg`, runs the identical half-space-box cut, and turns both
 * halves back — no new geometry, and the straight path stays the thing being tested.
 *
 * Three axes are in play and each has its own default, which is where the real cost of
 * this form is:
 *
 * - **`axis`** is the cut plane's normal, as in the straight form.
 * - **`rotateAxis`** is the world axis the plane physically tilts about. Omitted, it
 *   comes from V1's table: `x→y`, `y→x`, `z→x`. It may not equal `axis` — V1's own
 *   sorted-pair lookup would silently return `undefined` for that (`"xx"` is not a key
 *   of `{xy:'z', yz:'x', xz:'y'}`) and carry on with a `NaN` rotation centre; this port
 *   throws, naming both axes.
 * - **The third axis** — neither of the above — is where `rotateOffsetMm` positions the
 *   tilt hinge, under the *same* three-way sign convention `offsetMm` uses (see
 *   {@link resolveAxisPositionMm}). Omitted therefore means that axis's **centre**, not
 *   zero, which is a real distinction for any solid not centred on the origin.
 *
 * The rotation centre's component on the tilt axis is the solid's own centroid there,
 * matching V1. That component is mathematically inert — expanding `R(v−c)+c` for `c`
 * sliding along the rotation axis shows the along-axis part of `c` cancels — but
 * *some* number is needed, and V1's is as good as any.
 *
 * **An omitted, `null` or zero `angleDeg` short-circuits to the straight path with no
 * rotation calls at all**, rather than rotating by zero degrees and back. That is a
 * behavioural default (V1's own `angle = angle || 0`), not just a numeric one: the
 * round trip would otherwise push float noise into every ordinary straight cut, and
 * `group.spec.js` asserts exact equality here rather than closeness precisely so a
 * "rotate by 0" implementation cannot pass.
 *
 * **Precision**: the two extra rotations cost the same class of rounding
 * {@link localBoundsOf} already discloses for this codebase's other
 * rotate-then-restore paths, and `core-021` expected to have to loosen the angled
 * specs' tolerance because of it. Measured, it did not: the worst bounds residual
 * against V1 across the whole fixture is **4.5e-10 mm**, at the fixture's own 9-decimal
 * rounding floor, so the angled cases compare at the same 6 places the straight ones
 * do. Bit-exactness still is not *promised* for a tilted cut — it is a rotate-and-back
 * round trip and nothing guarantees it lands on the same float — but the straight cut
 * genuinely keeps it, which is what the short-circuit above is for.
 *
 * ## Which half is which, and where the offset measures from
 *
 * Both conventions come from running V1, not from reading it (see this section's
 * header comment, and `__fixtures__/modify.v1-reference.json`):
 *
 * - **`negative` is the half on the axis's minimum side; `positive` is the maximum
 *   side — on every axis, with no exception.** V1 itself diverges on `y` (its cut-plane
 *   basis is left-handed there, making V1's own `negative` the maximum-side half on
 *   that one axis alone — see `TODO/done/core-021-*.md`); this port deliberately does
 *   not reproduce that quirk (`TODO/done/core-022-*.md`, decided by the user
 *   2026-09-17), on the grounds that a human driving the app has no reason to expect
 *   one axis to behave differently from the other two. Measured: a 10 mm cube cut on
 *   `z` at offset 2 puts the **2 mm** piece in `negative` and the **8 mm** piece in
 *   `positive`; the same holds on `y`.
 * - **A positive offset measures from the minimum face; a negative one from the
 *   maximum face**, so `offset: 2` and `offset: -2` on that cube are mirror images.
 *   An **omitted** offset cuts at the centre — but `0` does not: it cuts at the minimum
 *   face, leaving `negative` empty. V1 distinguishes the two (`util.isEmpty` accepts
 *   only `undefined`/`null`) and so does this.
 * - **`-0` is a real, distinct V1 idiom** meaning "the maximum face", used by real call
 *   sites (`.bisect('y', -0, ...)`), and it is honoured here. Note that it cannot
 *   survive a document round-trip: `JSON.stringify(-0)` is `"0"`, which means the
 *   opposite face. An op record that wants the maximum face should pass the solid's own
 *   size as a negative offset rather than relying on `-0`.
 *
 * ## Technique: a half-space box, not a cut plane
 *
 * V1 cut against an infinite plane (`CSG.OrthoNormalBasis` + `cutByPlane`).
 * `@jscad/modeling` has no infinite-plane primitive and no `cutByPlane`, so the
 * standard boolean-kernel equivalent is used instead: build one axis-aligned box that
 * covers the whole `+axis` half-space over this solid's extent, with its near face
 * exactly on the cut plane. Intersecting with it yields `positive`; subtracting it
 * yields `negative`. The two halves together reproduce the original's volume, which
 * `group.spec.js` asserts directly rather than assuming.
 *
 * @param {Geom3 | Group} value Solid to cut. A group is combined first — the result's
 *   parts are the two halves, so a group's own part names cannot survive.
 * @param {string} axis `'x'`, `'y'` or `'z'`: the cut plane's normal.
 * @param {number | null} [offsetMm] Where to cut along that axis. Omitted cuts at the
 *   centre.
 * @param {number | null} [angleDeg] Degrees to tilt the cut plane. Omitted, `null` or
 *   zero leaves it perpendicular to `axis` and takes the straight path exactly.
 * @param {string | null} [rotateAxis] World axis the plane tilts about; defaults per
 *   {@link DEFAULT_ROTATE_AXIS}. Must differ from `axis`.
 * @param {number | null} [rotateOffsetMm] Where the tilt hinge sits along the third
 *   axis. Omitted means that axis's **centre**, not zero.
 * @returns {Group} A two-part group, `negative` then `positive` — V1's names and V1's
 *   order.
 */
export function bisect(value, axis, offsetMm, angleDeg, rotateAxis, rotateOffsetMm) {
  const index = AXIS_INDEX[axis]
  if (index === undefined) {
    throw new Error(`bisect: unknown axis ${JSON.stringify(axis)}, expected 'x', 'y' or 'z'`)
  }
  const geometry = toGeom3(value)
  const [min, max] = boundsOf(geometry)
  const size = sizeOf(geometry)
  const cutMm = resolveAxisPositionMm(min, max, size, index, offsetMm)

  /**
   * Name the two halves: `negative` is always the minimum-side half, `positive` the
   * maximum-side half, on every axis (`TODO/done/core-022-*.md`).
   *
   * @param {{ lower: Geom3, upper: Geom3 }} halves
   */
  const asGroup = ({ lower, upper }) =>
    add(add(createGroup('bisect'), lower, 'negative'), upper, 'positive')

  if (angleDeg !== undefined && angleDeg !== null && !Number.isFinite(angleDeg)) {
    throw new Error(`bisect: angle must be a finite degree value, got ${angleDeg}`)
  }
  // V1's own `angle = angle || 0`: a falsy angle means "no tilt", and taking the
  // straight path outright is what keeps an ordinary cut bit-identical rather than
  // rounded through a zero-degree round trip.
  if (!angleDeg) return asGroup(cutHalfSpaces(geometry, index, cutMm))

  const tiltAxis = rotateAxis ?? DEFAULT_ROTATE_AXIS[axis]
  const tiltIndex = AXIS_INDEX[tiltAxis]
  if (tiltIndex === undefined) {
    throw new Error(
      `bisect: unknown rotateAxis ${JSON.stringify(tiltAxis)}, expected 'x', 'y' or 'z'`
    )
  }
  if (tiltIndex === index) {
    throw new Error(
      `bisect: rotateAxis "${tiltAxis}" is also the cut axis "${axis}" — a plane cannot ` +
        `tilt about its own normal. Pick one of the other two axes`
    )
  }
  // The remaining axis, neither cut nor tilt. Indices are 0,1,2 and sum to 3.
  const hingeIndex = 3 - index - tiltIndex
  const hingeMm = resolveAxisPositionMm(
    min,
    max,
    size,
    hingeIndex,
    rotateOffsetMm,
    'bisect: rotateOffset'
  )

  /** @type {Vec3Mm} */
  const centre = [0, 0, 0]
  centre[index] = cutMm
  centre[hingeIndex] = hingeMm
  // Inert — see the doc comment — but V1 fills it with the centroid, so this does too.
  centre[tiltIndex] = (min[tiltIndex] + max[tiltIndex]) / 2

  /**
   * Turn a solid about `centre` along the tilt axis. The same translate-rotate-translate
   * sandwich `localBoundsOf` above uses for a pivot-anchored rotation.
   *
   * @param {Geom3} solid
   * @param {number} radians
   * @returns {Geom3}
   */
  const turn = (solid, radians) => {
    /** @type {Vec3Mm} */
    const rotation = [0, 0, 0]
    rotation[tiltIndex] = radians
    return transforms.translate(
      centre,
      transforms.rotate(
        rotation,
        transforms.translate(/** @type {Vec3Mm} */ ([-centre[0], -centre[1], -centre[2]]), solid)
      )
    )
  }

  // `cut(S, T·P) = T(cut(T⁻¹S, P))`: turn the solid the other way, cut against the
  // plane the straight path already knows how to cut, turn both halves back.
  const radians = angleDeg * DEG
  const { lower, upper } = cutHalfSpaces(turn(geometry, -radians), index, cutMm)
  return asGroup({ lower: turn(lower, radians), upper: turn(upper, radians) })
}
