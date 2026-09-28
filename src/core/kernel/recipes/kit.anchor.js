/**
 * The `kit.anchor` composite recipe — §6's "Anchor" Kit-part row, which that catalogue
 * calls out as the "example of a multi-part `Group` as one draggable item".
 *
 * ## What it reproduces
 *
 * `jscad-utils@6.0.0`'s `parts.Anchor`. As with `kit.boardFrame`, 6.0.0 is not
 * installed here (the vendored copy is 3.2.0, which has neither `Anchor` nor
 * `BoardFrame`), so this was ported by reading
 * `/Users/johncole/src/jscad/jscad-utils/src/parts.js:398-407` directly, per
 * `TODO/core-012`'s explicit instruction not to add a dependency for a fixture:
 *
 * ```js
 * export function Anchor(width = 10, height = 10) {
 *   var hole = Cylinder(width, height).Center().color('red');
 *   var post = Cylinder(height / 2, width * 0.66)
 *     .rotateX(90).align(hole, 'xz').snap(hole, 'y', 'inside-')
 *     .translate([0, 0, -height / 6]).color('purple');
 *   return Group({ post, hole });
 * }
 * ```
 *
 * A snap-fit anchor: a `hole` cylinder of diameter `width` and height `height`, and a
 * `post` whose diameter comes from `height / 2` and whose length comes from
 * `width * 0.66` — the two dimensions genuinely cross over in V1, which is worth
 * saying out loud because it reads like a transposition. The post is turned onto Y,
 * centred on the hole in X and Z, snapped so its −Y face is flush with the hole's −Y
 * extreme, and finally dropped `height / 6` in Z. The hole is `red` and the post
 * `purple`, V1's own `.color(...)` calls above, carried on the two named records
 * (`TODO/core-026`; this line used to say colours had no equivalent here, which stopped
 * being true when the record gained a `color` field).
 *
 * `Cylinder(width, height).Center()` is a base-at-`z = 0` prism explicitly re-centred,
 * which is exactly where `primitive.cylinder` already sits — so the hole needs no
 * placement record at all, unlike every prism in `hardware.bolt.js`.
 *
 * ## Why this file touches `@jscad/modeling` when no other recipe does
 *
 * §4 says a recipe calls the group maths to compute a number and bakes the *result* in
 * as a plain `transform.translate`; `group.snap` never appears as a record.
 * `hardware.bolt.js` can do that with arithmetic alone, because its spec table already
 * gives every height involved. Here it cannot: `align`/`snap` are defined over
 * *bounding boxes*, and a tessellated cylinder's box is a property of its segment count
 * — a 5-segment post is not 5 mm wide just because its diameter is 5. So this recipe
 * builds the two cylinders as throwaway in-memory geometry, measures them with
 * `group.js`'s already-tested `calcCenterWith`/`calcSnap` (`TODO/core-001`), discards
 * the probes, and emits records carrying the computed numbers.
 *
 * This is **not** the limitation `core-001` flagged — "a recipe cannot snap against
 * geometry it did not create". That one is about reaching for another *document item's*
 * evaluated geometry, which does not exist yet when a recipe runs. Both solids here are
 * defined by this recipe's own params, so it can build them itself.
 *
 * The probe construction mirrors what `primitive.cylinder` and `transform.rotate` do
 * with the same params, deliberately and in the same order, so the measured offsets
 * describe the geometry the emitted records actually produce. `kit.anchor.spec.js`
 * re-derives the baked vector from the real bounding boxes to hold that honest.
 *
 * ## `rotateX(90)`: measured, not assumed
 *
 * `TODO/core-012` asks for the rotation's sign convention to be checked rather than
 * trusted. It was, in `kit.anchor.spec.js`: `transform.rotate` is z-y-x Tait-Bryan
 * about `params.center` (`TODO/ui-023`, `core-004`), and V1's `CSG.rotateX(90)` turns
 * about the X axis through the origin — the same rotation, and the post's own primitive
 * is centred on the origin, so the two agree. The sign turns out to be *immaterial*
 * for this part, which is the more useful finding: the post is a cylinder, symmetric
 * about its own axis, so ±90° about X give identical geometry, and its final position
 * is then fixed entirely by the align/snap that follow. The spec asserts both facts
 * so the reasoning is not just a comment.
 *
 * @module core/kernel/recipes/kit.anchor
 */

import modeling from '@jscad/modeling'

import { v1ColorToRecord } from '../colors.js'
import { calcCenterWith, calcSnap } from '../group.js'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { primitives, transforms } = modeling

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'kit.anchor'

/** V1 `Anchor`'s own `width = 10, height = 10` default, in millimetres. */
export const DEFAULT_ANCHOR_MM = 10

/**
 * The segment count the **probe** geometry below is measured with. The probe exists only
 * to compute the post's placement offset from bounding boxes, and a multiple of 4 puts a
 * vertex on each axis, so the box is the nominal cylinder's at any count — the offset
 * does not depend on the design resolution. The emitted records carry no count unless
 * the caller gave one (`TODO/core-035`), so the resolution policy decides how the real
 * parts are faceted; under `legacy` that is this same 32, byte-identical to before.
 */
export const PROBE_SEGMENTS = 32

/** V1: `Cylinder(height / 2, width * 0.66)` — the post's length is 0.66 × width. */
const POST_LENGTH_FRACTION = 0.66

/**
 * Positive, finite millimetres or a clear error naming the op and the parameter, the
 * same convention `registry.js`'s `requirePositive` applies to native ops.
 *
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function requirePositiveMm(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${OP}: ${label} must be a positive number of millimetres, got ${String(value)}`)
  }
  return value
}

/**
 * Expand a `kit.anchor` document line into the op records that define it.
 *
 * @param {object} params
 * @param {number} [params.width] Hole diameter in millimetres; V1 default 10.
 * @param {number} [params.height] Hole height in millimetres; V1 default 10.
 * @param {number} [params.segments] Cylinder segment count for both parts. Omitted: the
 *   design resolution decides (`TODO/core-035`).
 * @param {[number, number, number]} [params.center] Where the *hole's* centre lands;
 *   the post travels with it. Defaults to the origin.
 * @returns {OpRecord[]} Four records: the hole, and the post's primitive, rotate and
 *   baked placement translate.
 */
export function anchor(params) {
  const {
    width = DEFAULT_ANCHOR_MM,
    height = DEFAULT_ANCHOR_MM,
    segments,
    center,
  } = params

  requirePositiveMm(width, 'width')
  requirePositiveMm(height, 'height')
  if (center !== undefined && center !== null) {
    if (!Array.isArray(center) || center.length !== 3 || !center.every(Number.isFinite)) {
      throw new Error(
        `${OP}: center must be three finite millimetre values, got ${JSON.stringify(center)}`
      )
    }
  }

  const holeDiameterMm = width
  const holeHeightMm = height
  const postDiameterMm = height / 2
  const postLengthMm = width * POST_LENGTH_FRACTION

  // Probe geometry, built at the origin and thrown away below. `calcSnap` and
  // `calcCenterWith` are translation-equivariant — they return a difference of
  // bounding-box coordinates — so measuring at the origin and adding `center`
  // afterwards is exact, not an approximation.
  const probeSegments = segments ?? PROBE_SEGMENTS
  const holeProbe = primitives.cylinder({
    radius: holeDiameterMm / 2,
    height: holeHeightMm,
    segments: probeSegments,
  })
  const postProbe = transforms.rotate(
    [Math.PI / 2, 0, 0],
    primitives.cylinder({ radius: postDiameterMm / 2, height: postLengthMm, segments: probeSegments })
  )

  // V1's order exactly: align on x/z first, then snap on y against the *aligned*
  // post. The two touch disjoint axes, so the sum would be the same either way — but
  // the ordering is free to preserve, and a future non-orthogonal change would break
  // silently if it were not.
  const alignMm = calcCenterWith(postProbe, 'xz', holeProbe)
  const snapMm = calcSnap(transforms.translate(alignMm, postProbe), holeProbe, 'y', 'inside-')
  const [cx, cy, cz] = center ?? [0, 0, 0]

  /** V1's closing `.translate([0, 0, -height / 6])` — an analytic constant. */
  const nudgeZMm = -height / 6

  return [
    {
      id: 'hole',
      op: 'primitive.cylinder',
      params: {
        diameter: holeDiameterMm,
        height: holeHeightMm,
        ...(segments === undefined ? {} : { segments }),
        ...(center === undefined || center === null ? {} : { center }),
      },
      name: 'hole',
      ...v1ColorToRecord('red'),
    },
    {
      id: 'post.solid',
      op: 'primitive.cylinder',
      params: { diameter: postDiameterMm, height: postLengthMm, ...(segments === undefined ? {} : { segments }) },
    },
    {
      // 90° about X, turning the post's axis off Z and onto Y. Degrees, because the
      // registry is the only place radians exist (`Initial design.md` §5).
      id: 'post.turned',
      op: 'transform.rotate',
      params: { angles: [90, 0, 0] },
      target: 'post.solid',
    },
    {
      id: 'post',
      op: 'transform.translate',
      params: {
        vector: [
          alignMm[0] + snapMm[0] + cx,
          alignMm[1] + snapMm[1] + cy,
          alignMm[2] + snapMm[2] + nudgeZMm + cz,
        ],
      },
      target: 'post.turned',
      name: 'post',
      ...v1ColorToRecord('purple'),
    },
  ]
}
