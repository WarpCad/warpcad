/**
 * The `kit.board` composite recipe — §6's "Board (rounded PCB slab)" Kit-part row.
 *
 * A composite recipe builds no geometry; it expands `params` into an array of *other*
 * op records that the same fold every op replays through evaluates (`Initial
 * design.md` §3, §4 — see `hardware.bolt.js`'s module doc for the fuller version).
 * Nothing in this file imports `@jscad/modeling`.
 *
 * ## What it reproduces
 *
 * `jscad-utils@3.2.0`'s `parts.Board`, which is vendored in this project's
 * `node_modules` and reads:
 *
 * ```js
 * // jscad-utils/src/parts.js:133-152
 * export function Board(width, height, corner_radius, thickness) {
 *   var r = util.divA([width, height], 2);
 *   var board = CAG.roundedRectangle({
 *     center: [r[0], r[1], 0], radius: r, roundradius: corner_radius,
 *     resolution: CSG.defaultResolution2D
 *   }).extrude({ offset: [0, 0, thickness || 1.62] });
 *   return board;
 * }
 * ```
 *
 * A 2D rounded rectangle extruded to `thickness`, whose `1.62` mm default is V1's own
 * — the standard PCB thickness, not a value invented here.
 *
 * ## V1 → V3 differences this expansion makes explicit
 *
 * **Placement.** V1 builds the profile with `center: [width/2, height/2]` and a
 * `radius` (half-extent) pair, so the slab lands in the positive quadrant with its
 * underside on `z = 0`. `@jscad/modeling`'s `roundedRectangle` takes a full `size` and
 * centres on `[0, 0]` by default, and every `primitive.*` row in this registry is
 * centred on `params.center`. This recipe follows the registry, not V1: the extrude
 * still runs `0 → thickness` (that is what `profile.extrudeLinear` does), and a single
 * `transform.translate` then drops the slab half a thickness so it straddles
 * `center`. That translate is a visible record rather than a hidden offset inside a
 * primitive, which is the property `hardware.bolt.js` argues for — and the same
 * centred-not-base-at-zero divergence `hardware.nut.js` and `hardware.washer.js`
 * already documented for their own prisms. It matters here for one concrete reason
 * beyond consistency: `src/core/library.js`'s drop maths positions a dropped body from
 * its own bounding box, so a slab whose box straddles its `center` lands under the
 * pointer.
 *
 * **A group of one.** V1 returns a bare CSG, not a `Group`. The single record here
 * still carries `name: 'board'`, because the fold's `add` is what puts a value in the
 * returned group at all — a nameless expansion would evaluate to an empty group.
 *
 * @module core/kernel/recipes/kit.board
 */

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'kit.board'

/**
 * V1 `Board`'s own `thickness || 1.62` default: 1.62 mm, the standard PCB thickness.
 * Shared with `kit.boardFrame`, whose V1 counterpart defaults identically.
 */
export const DEFAULT_BOARD_THICKNESS_MM = 1.62

/**
 * Segment count for the corner arcs. Matches `@jscad/modeling`'s own
 * `roundedRectangle` default and `@jscad/csg`'s `defaultResolution2D`, which V1 passed
 * explicitly — so a V1 and a V3 board of the same size tessellate the same way.
 * Emitted into the record rather than left to a library default, so a future upstream
 * change cannot silently move geometry.
 */
export const DEFAULT_PROFILE_SEGMENTS = 32

/**
 * `@jscad/modeling`'s own `EPS`, which its `roundedRectangle` subtracts before
 * comparing a corner radius against the half-dimension. Mirrored so this recipe's
 * message wins for every radius upstream would reject.
 */
const KERNEL_EPS_MM = 1e-5

/**
 * Positive, finite millimetre value or a clear error naming the op and the parameter —
 * the same convention `registry.js`'s `requirePositive` applies to native ops.
 * Recipes validate their own params (as `hardware.bolt` and `hardware.nut` do) because
 * a degenerate dimension should fail at the recipe boundary with the name a user
 * typed, not four records later with an internal one.
 *
 * @param {unknown} value
 * @param {string} label
 * @param {string} op
 * @returns {number}
 */
export function requirePositiveMm(value, label, op) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${op}: ${label} must be a positive number of millimetres, got ${String(value)}`)
  }
  return value
}

/**
 * A corner radius has to be non-negative *and* fit inside the shortest side it
 * rounds. Zero is legal and means a square corner (upstream degrades to a plain
 * rectangle), which is why this is not {@link requirePositiveMm}.
 *
 * @param {unknown} value
 * @param {number} smallerSideMm Shortest side the radius has to fit inside.
 * @param {string} label
 * @param {string} op
 * @returns {number}
 */
export function requireCornerRadiusMm(value, smallerSideMm, label, op) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `${op}: ${label} must be a non-negative number of millimetres, got ${String(value)}`
    )
  }
  if (value > 0 && value >= smallerSideMm / 2 - KERNEL_EPS_MM) {
    throw new Error(
      `${op}: ${label} must be smaller than half the shortest side ` +
        `(${smallerSideMm / 2} mm), got ${value}`
    )
  }
  return value
}

/**
 * The `[x, y, z]` a slab of `thicknessMm` needs so its bounding box straddles
 * `center` after `profile.extrudeLinear` has built it from `z = 0` upward.
 *
 * @param {unknown} center Caller-supplied `params.center`, possibly absent.
 * @param {number} thicknessMm
 * @param {string} op
 * @returns {[number, number, number]}
 */
export function centringVector(center, thicknessMm, op) {
  if (center === undefined || center === null) return [0, 0, -thicknessMm / 2]
  if (!Array.isArray(center) || center.length !== 3 || !center.every(Number.isFinite)) {
    throw new Error(`${op}: center must be three finite millimetre values, got ${JSON.stringify(center)}`)
  }
  return [center[0], center[1], center[2] - thicknessMm / 2]
}

/**
 * Expand a `kit.board` document line into the op records that define it.
 *
 * @param {object} params
 * @param {number} params.width Board width in millimetres, X.
 * @param {number} params.height Board height in millimetres, Y. V1's name for the
 *   in-plane dimension; the slab's *thickness* is the Z one.
 * @param {number} [params.cornerRadius] Corner-arc radius; must fit the shorter side.
 *   Required at runtime — marked optional here for the same reason
 *   `hardware.nut.js`'s `fit` is: the runtime check is the real gate, and a spec has
 *   to be able to call this with it missing to prove that check fires.
 * @param {number} [params.thickness] Defaults to {@link DEFAULT_BOARD_THICKNESS_MM}.
 * @param {number} [params.segments] Corner-arc segment count.
 * @param {[number, number, number]} [params.center] Where the slab's bounding-box
 *   centre lands; defaults to the origin.
 * @returns {OpRecord[]} Three records, in the schema the document stores.
 */
export function board(params) {
  const {
    width,
    height,
    cornerRadius,
    thickness = DEFAULT_BOARD_THICKNESS_MM,
    segments = DEFAULT_PROFILE_SEGMENTS,
    center,
  } = params

  requirePositiveMm(width, 'width', OP)
  requirePositiveMm(height, 'height', OP)
  requirePositiveMm(thickness, 'thickness', OP)
  requireCornerRadiusMm(cornerRadius, Math.min(width, height), 'cornerRadius', OP)

  return [
    {
      id: 'board.profile',
      op: 'profile.roundedRectangle',
      params: { size: [width, height], roundRadius: cornerRadius, segments },
    },
    {
      id: 'board.prism',
      op: 'profile.extrudeLinear',
      params: { height: thickness },
      target: 'board.profile',
    },
    {
      id: 'board',
      op: 'transform.translate',
      params: { vector: centringVector(center, thickness, OP) },
      target: 'board.prism',
      name: 'board',
    },
  ]
}
