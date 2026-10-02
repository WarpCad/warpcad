// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `text.label` builder (TODO/render-002) — `jscad-utils`' `label()` ported to
 * `@jscad/modeling`.
 *
 * ## Why this does not go through `profile.extrudeLinear`
 *
 * The TODO proposed reusing that op, on the assumption `vector_text()` returns a
 * `geom2`. It does not: it returns **open stroke polylines** (a single-line "Hershey"
 * font), which have no interior to extrude. V1's `label()` therefore thickened each
 * polyline with `rectangular_extrude({ w, h })` and unioned the pieces; the V3 spelling
 * of that is `extrudeRectangular` over a `path2` per stroke, which is what this does.
 *
 * Framework-free: no Vue, no DOM. Talks to `@jscad/modeling` directly, like the other
 * native builders in `registry.js`.
 *
 * @module core/kernel/text
 */

import modeling from '@jscad/modeling'

// See group.js: default import, not named, so this runs under raw Node ESM too.
const { booleans, extrusions, geometries, measurements, text, transforms } = modeling

/** @typedef {import('@jscad/modeling').geometries.geom3.Geom3} Geom3 */

const OP = 'text.label'

/**
 * Upstream's `vectorText({ height })` is a nominal font size, not a cap height: measured,
 * an "H" at `height: 10` spans y 0..15. Dividing by this makes `size` mean what the
 * Inspector label says, the height of a capital letter.
 */
const CAP_HEIGHT_RATIO = 1.5

/**
 * @param {unknown} value
 * @param {string} key
 * @returns {number}
 */
function requirePositive(value, key) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${OP}: ${key} must be a positive number, got ${String(value)}`)
  }
  return value
}

/**
 * Build the label solid, bounding-box-centred on `center` (default the origin) the way
 * every `primitive.*` is, so the Library's drop arithmetic needs no special case.
 *
 * @param {Record<string, any>} params Validated here, since a record's params are plain
 *   JSON of unknown shape.
 *   - `text` — ASCII string; characters outside 32-126 render as `?` (upstream's behaviour).
 *   - `size` — character (cap) height, mm.
 *   - `strokeWidth` — thickness of each stroke, mm; V1's `width`.
 *   - `height` — extrusion depth, mm; V1's `height`.
 *   - `center` — `[x, y, z]`, mm; optional.
 * @returns {Geom3}
 */
export function label(params) {
  if (typeof params.text !== 'string' || params.text.trim() === '') {
    throw new Error(`${OP}: text must contain at least one drawable character`)
  }
  const size = requirePositive(params.size, 'size')
  const strokeWidth = requirePositive(params.strokeWidth, 'strokeWidth')
  const height = requirePositive(params.height, 'height')

  const strokes = text.vectorText({ height: size / CAP_HEIGHT_RATIO }, params.text)
  const pieces = strokes
    // A one-point stroke (a dot) has no direction to thicken along.
    .filter((points) => points.length > 1)
    .map((points) =>
      extrusions.extrudeRectangular(
        { size: strokeWidth, height },
        geometries.path2.fromPoints({ closed: false }, points)
      )
    )
  if (pieces.length === 0) {
    throw new Error(`${OP}: text must contain at least one drawable character`)
  }

  const solid = booleans.union(pieces)
  const [min, max] = measurements.measureBoundingBox(solid)
  const center = params.center ?? [0, 0, 0]
  return transforms.translate(
    [
      center[0] - (min[0] + max[0]) / 2,
      center[1] - (min[1] + max[1]) / 2,
      center[2] - (min[2] + max[2]) / 2,
    ],
    solid
  )
}
