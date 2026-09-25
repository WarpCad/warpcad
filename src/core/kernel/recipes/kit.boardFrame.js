/**
 * The `kit.boardFrame` composite recipe — §6's "BoardFrame" Kit-part row.
 *
 * A composite recipe builds no geometry; it expands `params` into other op records
 * (`Initial design.md` §3, §4). Nothing in this file imports `@jscad/modeling`.
 *
 * ## What it reproduces
 *
 * `jscad-utils@6.0.0`'s `parts.BoardFrame`. That version is **not** installed in this
 * project — the vendored copy is 3.2.0, which has `Board` but neither `BoardFrame` nor
 * `Anchor` — so this port was written by reading
 * `/Users/johncole/src/jscad/jscad-utils/src/parts.js:445-472` directly, per the
 * explicit call in `TODO/core-012` not to add a 6.0.0 dependency just to diff a
 * fixture against. That is why `kit.boardFrame.spec.js` asserts geometric
 * relationships (outer size, wall volume, hollowness) rather than diffing V1 numbers
 * the way `hardware.bolt.spec.js` can:
 *
 * ```js
 * export function BoardFrame(outerWidth, outerHeight, innerWidth, innerHeight,
 *                            corner_radius, thickness) {
 *   var rOuter = util.divA([outerWidth, outerHeight], 2);
 *   var rInner = util.divA([innerWidth, innerHeight], 2);
 *   var frame2D = CAG.roundedRectangle({ center: [rOuter[0], rOuter[1], 0],
 *       radius: rOuter, roundradius: corner_radius, ... })
 *     .subtract(CAG.roundedRectangle({ center: [rOuter[0], rOuter[1], 0],
 *       radius: rInner, roundradius: corner_radius, ... }));
 *   return frame2D.extrude({ offset: [0, 0, thickness || 1.62] });
 * }
 * ```
 *
 * ## The subtract happens in 2D, and that ordering is the point
 *
 * V1's own doc comment says why, and it is worth carrying over verbatim: it "uses 2-D
 * CAG subtraction before extrusion to avoid BSP non-manifold artifacts that occur when
 * subtracting two same-height `Board` solids." So this recipe emits
 * `profile.roundedRectangle` twice, `boolean.subtract` over those two **profiles**, and
 * only then `profile.extrudeLinear`. Extruding both rectangles into same-height slabs
 * and subtracting those would be the natural-looking expansion and is exactly the
 * failure V1 flags — `kit.boardFrame.spec.js` asserts the record ordering directly so
 * a later refactor cannot quietly invert it.
 *
 * `boolean.subtract` needs no change to accept profiles: upstream's `subtract`
 * dispatches on its arguments' own geometry type
 * (`@jscad/modeling/src/operations/booleans/subtract.js`), and the fold passes values
 * through `toGeom3`, which leaves a non-`Group` value — a `geom2` included —
 * untouched. Only the final, named record has to be a solid, and it is.
 *
 * Both rectangles share one centre, which is what makes the frame concentric; V1
 * spells that out with its own `// same centre for concentricity` comment on the inner
 * rectangle's `center`. Here that is expressed by *omitting* `center` from both
 * profile records, so both take `profile.roundedRectangle`'s `[0, 0]` default, and by
 * placing the finished frame with one `transform.translate` — the same
 * centred-in-Z placement `kit.board.js`'s module doc explains.
 *
 * A 2D boolean is not exact: the outline it returns sits within ~1e-4 mm of the input
 * rectangle rather than on it (upstream routes geom2 booleans through `martinez`), so
 * the frame's measured outer size is `40 ± 1e-4`, not `40`. The spec asserts with a
 * millimetre tolerance for that reason and not out of vagueness.
 *
 * **No colour** (checked for `TODO/core-026`): V1's `BoardFrame`, quoted above, never
 * calls `.color()`, so there was nothing to port.
 *
 * @module core/kernel/recipes/kit.boardFrame
 */

import {
  centringVector,
  DEFAULT_BOARD_THICKNESS_MM,
  DEFAULT_PROFILE_SEGMENTS,
  requireCornerRadiusMm,
  requirePositiveMm,
} from './kit.board.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'kit.boardFrame'

/**
 * Expand a `kit.boardFrame` document line into the op records that define it.
 *
 * @param {object} params
 * @param {number} params.outerWidth Outer width in millimetres, X.
 * @param {number} params.outerHeight Outer height in millimetres, Y.
 * @param {number} params.innerWidth Cut-out width; must be smaller than `outerWidth`.
 * @param {number} params.innerHeight Cut-out height; must be smaller than `outerHeight`.
 * @param {number} params.cornerRadius Corner-arc radius, applied to **both**
 *   rectangles as V1 does; must fit the shortest side of the *inner* one.
 * @param {number} [params.thickness] Defaults to {@link DEFAULT_BOARD_THICKNESS_MM}.
 * @param {number} [params.segments] Corner-arc segment count.
 * @param {[number, number, number]} [params.center] Where the frame's bounding-box
 *   centre lands; defaults to the origin.
 * @returns {OpRecord[]} Five records, in the schema the document stores.
 */
export function boardFrame(params) {
  const {
    outerWidth,
    outerHeight,
    innerWidth,
    innerHeight,
    cornerRadius,
    thickness = DEFAULT_BOARD_THICKNESS_MM,
    segments = DEFAULT_PROFILE_SEGMENTS,
    center,
  } = params

  requirePositiveMm(outerWidth, 'outerWidth', OP)
  requirePositiveMm(outerHeight, 'outerHeight', OP)
  requirePositiveMm(innerWidth, 'innerWidth', OP)
  requirePositiveMm(innerHeight, 'innerHeight', OP)
  requirePositiveMm(thickness, 'thickness', OP)

  // An inner rectangle as large as the outer one subtracts the whole frame away and
  // evaluates to empty geometry rather than failing — the degenerate case
  // `primitive.tube`'s own innerDiameter check exists for, in the 2D form.
  if (innerWidth >= outerWidth) {
    throw new Error(
      `${OP}: innerWidth must be smaller than outerWidth, got ${innerWidth} against ${outerWidth}`
    )
  }
  if (innerHeight >= outerHeight) {
    throw new Error(
      `${OP}: innerHeight must be smaller than outerHeight, got ${innerHeight} against ${outerHeight}`
    )
  }

  // The inner rectangle is the smaller of the two and therefore the binding
  // constraint: a radius that fits the outer one can still be impossible here, and
  // upstream would reject it with a message naming neither this op nor this param.
  requireCornerRadiusMm(cornerRadius, Math.min(innerWidth, innerHeight), 'cornerRadius', OP)

  return [
    {
      id: 'frame.outer',
      op: 'profile.roundedRectangle',
      params: { size: [outerWidth, outerHeight], roundRadius: cornerRadius, segments },
    },
    {
      id: 'frame.inner',
      op: 'profile.roundedRectangle',
      params: { size: [innerWidth, innerHeight], roundRadius: cornerRadius, segments },
    },
    {
      id: 'frame.profile',
      op: 'boolean.subtract',
      params: {},
      target: 'frame.outer',
      operands: ['frame.inner'],
    },
    {
      id: 'frame.prism',
      op: 'profile.extrudeLinear',
      params: { height: thickness },
      target: 'frame.profile',
    },
    {
      id: 'frame',
      op: 'transform.translate',
      params: { vector: centringVector(center, thickness, OP) },
      target: 'frame.prism',
      name: 'frame',
    },
  ]
}
