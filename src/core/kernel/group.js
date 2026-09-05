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

// `@jscad/modeling@2.x` is CommonJS. A bundler resolves its named exports, but raw
// Node ESM does not — and `CLAUDE.md` requires `src/core/` to be testable in plain
// Node. Destructuring the default export works under both.
const { booleans, measurements, transforms } = modeling

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
 */

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
 * @param {Geom3 | Group} value
 * @returns {BoundsMm}
 */
export function boundsOf(value) {
  const [min, max] = measurements.measureBoundingBox(toGeom3(value))
  return [
    [min[0], min[1], min[2]],
    [max[0], max[1], max[2]],
  ]
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
  return Object.freeze({ name, names: Object.freeze([]), parts: Object.freeze({}), holes: Object.freeze([]) })
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
 * @returns {Group}
 */
export function add(group, object, partName, options = {}) {
  if (!partName) throw new Error('add: a part name is required')
  const parts = { ...group.parts }

  if (isGroup(object)) {
    parts[partName] = combine(object, options.pieces)
    if (options.subpartPrefix) {
      for (const key of Object.keys(object.parts)) {
        parts[options.subpartPrefix + key] = object.parts[key]
      }
    }
  } else {
    parts[partName] = object
  }

  const names = options.hidden ? group.names : [...group.names, partName]
  return Object.freeze({
    name: group.name,
    names: Object.freeze(names),
    parts: Object.freeze(parts),
    holes: group.holes,
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
  for (const name of names) parts[name] = group.parts[name]
  return Object.freeze({
    name: group.name,
    names: Object.freeze([...names]),
    parts: Object.freeze(parts),
    holes: group.holes,
  })
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
