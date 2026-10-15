// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The selection overlay's maths: world → screen, dimension lines, and the
 * transform gizmo's screen geometry (`TODO/ui-011`).
 *
 * Framework-free on purpose, exactly like `camera.js` and `pick.js`: no
 * three.js, no DOM, no Vue. CLAUDE.md is explicit that "geometry logic belongs
 * in `src/core/`, not in components" and that "a component doing coordinate math
 * beyond laying out its own pixels is a bug waiting to happen" — so
 * `DimensionLines.vue` and `Gizmo.vue` draw the numbers this module computes and
 * do no maths of their own, and every one of those numbers is unit-tested in
 * plain Node with no GPU.
 *
 * ## Why the overlays are DOM, not scene objects
 *
 * `render-001` established screen-space SVG/DOM overlays for the grid readout
 * and the orientation triad. CLAUDE.md's dimension-line note is explicit about
 * not introducing a second overlay technology for a third one, and there is a
 * second reason: an SVG overlay is assertable by an `*.e2e.js` spec across all
 * three engines without pixel-picking a WebGL canvas, which is exactly the
 * coverage a WebGL-sensitive surface needs.
 *
 * ## Projection
 *
 * {@link worldToScreen} is the exact inverse of `pick.js`'s
 * `projectToWorkingPlane` — same camera basis, same field of view, built the
 * same way from the orbit camera's spherical state rather than from a matrix.
 * The two are asserted against each other in the spec, because a sign flip in
 * either would draw an overlay that misses the solid it annotates.
 *
 * The **gizmo** is deliberately *not* perspective-projected beyond its origin:
 * its arms and rings are screen-constant, built from the camera's screen-right
 * and screen-up basis the same way `OrientationGizmo.vue`'s triad is, so the
 * handles stay a usable size on a 2 mm part and on a 2 m one alike. The
 * **dimension lines** are fully perspective-projected, because they measure real
 * bounding-box corners at genuinely different depths.
 *
 * ## Allocation
 *
 * Every function writes into a caller-supplied structure and allocates nothing,
 * per CLAUDE.md's Performance rule — these run from the viewport's render
 * callback, once per frame while the camera moves.
 *
 * @module render/annotate
 */

import { rightFromSpherical, upFromSpherical } from './camera.js'
import { formatMm } from '../core/units.js'

const DEG = Math.PI / 180
/** Below this, a screen-space direction is noise rather than a direction. */
const EPSILON_PX = 1e-6

/** @typedef {import('./camera.js').OrbitCamera} OrbitCamera */
/** @typedef {[number, number, number]} Vec3Mm */

/** Axis names, in document order. Z-up, per CLAUDE.md. */
export const AXIS_LABELS = Object.freeze(['X', 'Y', 'Z'])

/**
 * For each axis, the two other axis indices — the pair that a dimension line's
 * candidate edges vary over, and that a rotate ring spans.
 */
const OTHER_AXES = Object.freeze([
  Object.freeze([1, 2]),
  Object.freeze([0, 2]),
  Object.freeze([0, 1]),
])

/**
 * The four parallel edges of a box along any given axis, as min/max picks on the
 * two other axes.
 */
const EDGE_CORNERS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([1, 0]),
  Object.freeze([0, 1]),
  Object.freeze([1, 1]),
])

// Module-scoped scratch. Single-threaded, and every function below finishes with
// its scratch before the next call needs it.
const scratchRight = { x: 0, y: 0, z: 0 }
const scratchUp = { x: 0, y: 0, z: 0 }
const scratchDir = { x: 0, y: 0 }
const scratchCentre = createScreenPoint()
const scratchNear = createScreenPoint()
const scratchFar = createScreenPoint()
const scratchBestNear = createScreenPoint()
const scratchBestFar = createScreenPoint()

/**
 * @typedef {object} ScreenPoint
 * @property {number} x CSS pixels from the viewport's left edge.
 * @property {number} y CSS pixels from its top edge — screen Y, growing downward.
 * @property {number} depth Millimetres along the view direction; negative behind.
 * @property {boolean} visible False when the point is behind the camera.
 */

/**
 * @returns {ScreenPoint}
 */
export function createScreenPoint() {
  return { x: 0, y: 0, depth: 0, visible: false }
}

/**
 * Project a millimetre point in document space to CSS pixels in the viewport.
 *
 * The exact inverse of `pick.js`'s `projectToWorkingPlane`, and built the same
 * way — the view ray is the camera basis scaled by the field of view, so no
 * matrix is inverted and nothing is allocated.
 *
 * @param {OrbitCamera} orbit
 * @param {number} xMm
 * @param {number} yMm
 * @param {number} zMm
 * @param {number} widthPx Viewport width in CSS pixels.
 * @param {number} heightPx Viewport height in CSS pixels.
 * @param {ScreenPoint} out Mutated in place.
 * @returns {ScreenPoint} `out`. Check `visible` before drawing: a point behind
 *   the camera has a mathematically valid but *mirrored* projection, and drawing
 *   it would put a dimension line on the wrong side of the screen.
 */
export function worldToScreen(orbit, xMm, yMm, zMm, widthPx, heightPx, out) {
  const { azimuthDeg, elevationDeg, distanceMm, target } = orbit.state
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  const cosEl = Math.cos(el)

  // Unit vector from target toward the camera; the camera looks back along it.
  const dirX = cosEl * Math.cos(az)
  const dirY = cosEl * Math.sin(az)
  const dirZ = Math.sin(el)

  const vx = xMm - (target.x + distanceMm * dirX)
  const vy = yMm - (target.y + distanceMm * dirY)
  const vz = zMm - (target.z + distanceMm * dirZ)

  // Forward is -dir, so depth in front of the camera is the negated projection.
  const depth = -(vx * dirX + vy * dirY + vz * dirZ)
  out.depth = depth

  if (!(depth > 1e-9) || !(heightPx > 0) || !(widthPx > 0)) {
    out.visible = false
    out.x = 0
    out.y = 0
    return out
  }

  rightFromSpherical(azimuthDeg, elevationDeg, scratchRight)
  upFromSpherical(azimuthDeg, elevationDeg, scratchUp)
  const rightMm = vx * scratchRight.x + vy * scratchRight.y + vz * scratchRight.z
  const upMm = vx * scratchUp.x + vy * scratchUp.y + vz * scratchUp.z

  const tanHalfFov = Math.tan((orbit.fovDeg * DEG) / 2)
  const aspect = widthPx / heightPx
  const ndcX = rightMm / (depth * tanHalfFov * aspect)
  const ndcY = upMm / (depth * tanHalfFov)

  out.x = ((ndcX + 1) / 2) * widthPx
  // NDC Y grows upward and screen Y grows downward — the single flip.
  out.y = ((1 - ndcY) / 2) * heightPx
  out.visible = true
  return out
}

/**
 * Screen-space image of a world direction, ignoring perspective.
 *
 * The same construction `OrientationGizmo.vue` uses for its triad: the camera's
 * screen-right and screen-up basis, with the up component negated because SVG's
 * Y grows downward. Correct for a screen-constant overlay anchored at one point,
 * which is exactly what the transform gizmo is.
 *
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {number} axisX Unit world direction.
 * @param {number} axisY
 * @param {number} axisZ
 * @param {{ x: number, y: number }} out Mutated in place.
 * @returns {{ x: number, y: number }} `out`, in pixels per millimetre of the
 *   input direction — normalise it before scaling to a pixel length.
 */
export function screenDirection(azimuthDeg, elevationDeg, axisX, axisY, axisZ, out) {
  rightFromSpherical(azimuthDeg, elevationDeg, scratchRight)
  upFromSpherical(azimuthDeg, elevationDeg, scratchUp)
  out.x = axisX * scratchRight.x + axisY * scratchRight.y + axisZ * scratchRight.z
  out.y = -(axisX * scratchUp.x + axisY * scratchUp.y + axisZ * scratchUp.z)
  return out
}

// --- transform gizmo -------------------------------------------------------

/**
 * @typedef {object} GizmoArrow
 * @property {string} axis `"X"` | `"Y"` | `"Z"`.
 * @property {boolean} visible False when the axis points straight at the camera.
 * @property {number} tipX
 * @property {number} tipY
 * @property {number} h1x Arrowhead base corner.
 * @property {number} h1y
 * @property {number} h2x Opposite base corner.
 * @property {number} h2y
 *   `h1` is always the lit (up-left) flank and `h2` the shaded one, so the
 *   pair doubles as the cone's shading line (`TODO/ui-048`).
 * @property {number} baseX Centre of the cone's base, `headPx` behind the tip.
 * @property {number} baseY
 * @property {number} coneRx Half-width of the cone's base disc, across the arm.
 * @property {number} coneRy The same disc's half-depth after foreshortening:
 *   `coneRx × |axis · view|` — a full disc end-on, a line side-on.
 * @property {number} coneAngleDeg Screen angle of the disc's `coneRx` axis,
 *   degrees, for an SVG `rotate()`.
 * @property {1 | -1} facing Whether the axis points toward the camera (`+1`,
 *   base disc hidden behind the cone) or away from it (`-1`, base disc facing
 *   the viewer).
 * @property {number} s1x The shaft's shading line, across the arm at the hub:
 *   `s1` is the lit flank, `s2` the shaded one. A `userSpaceOnUse` gradient
 *   line, so it never depends on the shaft's own (possibly zero-width) bounds.
 * @property {number} s1y
 * @property {number} s2x
 * @property {number} s2y
 */

/**
 * @typedef {object} GizmoRing
 * @property {string} axis Axis the ring rotates *about*.
 * @property {boolean} visible
 * @property {number} ux Screen image of the ring's first spanning axis, in px.
 * @property {number} uy
 * @property {number} vx Screen image of its second spanning axis, in px.
 * @property {number} vy
 */

/**
 * @typedef {object} GizmoAnnotation
 * @property {boolean} visible
 * @property {number} originX Screen position of the body's origin.
 * @property {number} originY
 * @property {GizmoArrow[]} arrows Three translate arms.
 * @property {GizmoRing[]} rings Three rotate rings.
 */

/**
 * Allocate the gizmo's output structure once, so updating it per frame mutates
 * rather than rebuilds.
 *
 * @returns {GizmoAnnotation}
 */
export function createGizmoAnnotation() {
  return {
    visible: false,
    originX: 0,
    originY: 0,
    arrows: AXIS_LABELS.map((axis) => ({
      axis,
      visible: false,
      tipX: 0,
      tipY: 0,
      h1x: 0,
      h1y: 0,
      h2x: 0,
      h2y: 0,
      baseX: 0,
      baseY: 0,
      coneRx: 0,
      coneRy: 0,
      coneAngleDeg: 0,
      facing: /** @type {1 | -1} */ (1),
      s1x: 0,
      s1y: 0,
      s2x: 0,
      s2y: 0,
    })),
    rings: AXIS_LABELS.map((axis) => ({ axis, visible: false, ux: 0, uy: 0, vx: 0, vy: 0 })),
  }
}

/**
 * Floor for the translate arm's screen length, in pixels — `TODO/ui-012`'s own
 * tuned value for a comfortably grabbable handle. A tiny object's gizmo never
 * shrinks below this, even though it grows past it for a large one. Since
 * `TODO/ui-048` it is not applied on its own: it is the ring floor plus
 * `GIZMO_ARM_PAST_RING_PX`, and a unit test holds the two to it.
 */
export const GIZMO_ARM_FLOOR_PX = 58

/** Floor for the rotate ring's screen radius, in pixels. Same rationale. */
export const GIZMO_RING_FLOOR_PX = 40

/**
 * How far clear of the body's own on-screen half-diagonal the ring extends,
 * once the body is big enough that the floor stops being the binding
 * constraint.
 */
const GIZMO_RING_CLEARANCE_PX = 8

/**
 * How far past its rotate ring each translate arm reaches (`TODO/ui-048`). The
 * arm is *derived* from the ring rather than sized independently of it: the
 * ring already clears the body's silhouette (`ui-017`'s requirement), so an arm
 * a fixed step longer clears it too, and `armPx > ringPx` holds by construction
 * rather than by two constants happening to agree. 18 keeps the floor exactly
 * where `ui-012` tuned it: 40 + 18 = 58.
 */
const GIZMO_ARM_PAST_RING_PX = 18

/**
 * Ceiling on the ring, so an enormous body's gizmo doesn't grow enough to run
 * off screen. The arm's own ceiling follows from it.
 */
const GIZMO_RING_MAX_PX = 180

/**
 * The translate arrowhead's length, as a slight function of the arm
 * (`TODO/ui-048`). It used to be `armPx * 0.26`, a ratio inherited from
 * `ui-011`'s fixed 58px arm that turned into a ~57px triangle once `ui-017`
 * let the arm grow — a sign, not a handle. Now it grows a little with the arm,
 * but only between these bounds: the cap-sized head is no bigger than the old
 * floor-sized one (0.26 × 58 ≈ 15px).
 */
const GIZMO_HEAD_RATIO = 0.08
const GIZMO_HEAD_MIN_PX = 13
export const GIZMO_HEAD_MAX_PX = 16

/** Half-width of the cone's base, as a fraction of the head's length. */
const GIZMO_HEAD_HALF_WIDTH_RATIO = 0.35

/**
 * Drawn width of a translate arm's shaft, in pixels. Owned here rather than in
 * CSS because the shaft's shading line has to span exactly this width.
 */
export const GIZMO_SHAFT_WIDTH_PX = 3

/**
 * The translate arrowhead's screen length for an arm of `armPx` (`TODO/ui-048`).
 *
 * @param {number} armPx
 * @returns {number} Pixels, between the head's own floor and ceiling.
 */
export function gizmoHeadPx(armPx) {
  return clamp(armPx * GIZMO_HEAD_RATIO, GIZMO_HEAD_MIN_PX, GIZMO_HEAD_MAX_PX)
}

/**
 * Size the transform gizmo's translate arms and rotate rings to clear the
 * selected body's own on-screen silhouette (`TODO/ui-017`), instead of the
 * fixed pixel size `TODO/ui-011` originally drew them at.
 *
 * The body's bounding-box half-diagonal — the same `[minMm, maxMm]` pair
 * `Viewport.vue`'s `syncAnnotations()` already destructures for the dimension
 * lines — is converted to screen pixels via `mmPerPixel` (the same conversion
 * `DimensionLines` uses), then the ring is clamped between a floor (the
 * original 40px, so a tiny object's handles stay exactly as grabbable as
 * `ui-012` tuned them) and a cap (so an enormous body's gizmo can't run off
 * screen). The arm is the ring plus a short fixed reach (`TODO/ui-048`), which
 * puts its floor back at `ui-012`'s 58px.
 *
 * Deliberately not perspective-projected or angle-dependent: like
 * {@link updateGizmoAnnotation} itself, this only needs a single screen-space
 * scale for the whole gizmo, not a per-axis one.
 *
 * @param {readonly number[]} minMm Bounding box minimum, millimetres.
 * @param {readonly number[]} maxMm Bounding box maximum.
 * @param {number} mmPerPixel The viewport's current millimetres-per-pixel scale
 *   (`orbit.getMmPerPixel(heightPx)`). Non-finite or non-positive is treated as
 *   the floor, rather than dividing by zero or producing `NaN`.
 * @returns {{ armPx: number, ringPx: number }}
 */
export function gizmoSizeForBounds(minMm, maxMm, mmPerPixel) {
  if (!(mmPerPixel > 0)) {
    return { armPx: GIZMO_RING_FLOOR_PX + GIZMO_ARM_PAST_RING_PX, ringPx: GIZMO_RING_FLOOR_PX }
  }
  const spanX = maxMm[0] - minMm[0]
  const spanY = maxMm[1] - minMm[1]
  const spanZ = maxMm[2] - minMm[2]
  const halfDiagonalMm = 0.5 * Math.hypot(spanX, spanY, spanZ)
  const halfDiagonalPx = halfDiagonalMm / mmPerPixel

  // `clamp` alone would pass a NaN straight through (a non-finite extent), so
  // the floor is applied with `Math.max` first, which does not.
  const ringPx = clamp(
    Math.max(GIZMO_RING_FLOOR_PX, halfDiagonalPx + GIZMO_RING_CLEARANCE_PX) || GIZMO_RING_FLOOR_PX,
    GIZMO_RING_FLOOR_PX,
    GIZMO_RING_MAX_PX
  )
  return { armPx: ringPx + GIZMO_ARM_PAST_RING_PX, ringPx }
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Position the transform gizmo at a body's origin.
 *
 * Visual only — `TODO/ui-011` draws the handles and `ui-012` makes them
 * draggable. Nothing here knows about pointer input, deliberately: shipping half
 * an interaction would leave two half-owners of the same behaviour.
 *
 * A ring is drawn as an ellipse from its two conjugate semi-diameters (the
 * screen images of the two world axes it spans), which is exactly what an
 * axis-aligned circle projects to. Seen edge-on, one of the two collapses and
 * the ellipse degenerates to a line — which is the correct picture, not a bug.
 *
 * @param {OrbitCamera} orbit
 * @param {number} originXMm Body origin in document millimetres.
 * @param {number} originYMm
 * @param {number} originZMm
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {number} armPx Screen length of each translate arm.
 * @param {number} ringPx Screen radius of each rotate ring.
 * @param {GizmoAnnotation} out Mutated in place.
 * @returns {GizmoAnnotation} `out`
 */
export function updateGizmoAnnotation(
  orbit,
  originXMm,
  originYMm,
  originZMm,
  widthPx,
  heightPx,
  armPx,
  ringPx,
  out
) {
  worldToScreen(orbit, originXMm, originYMm, originZMm, widthPx, heightPx, scratchCentre)
  out.visible = scratchCentre.visible
  out.originX = scratchCentre.x
  out.originY = scratchCentre.y
  if (!out.visible) {
    for (const arrow of out.arrows) arrow.visible = false
    for (const ring of out.rings) ring.visible = false
    return out
  }

  const { azimuthDeg, elevationDeg } = orbit.state
  const headPx = gizmoHeadPx(armPx)
  const coneRx = headPx * GIZMO_HEAD_HALF_WIDTH_RATIO
  const shaftHalfPx = GIZMO_SHAFT_WIDTH_PX / 2

  for (let axis = 0; axis < 3; axis += 1) {
    const arrow = out.arrows[axis]
    screenDirection(azimuthDeg, elevationDeg, axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0, scratchDir)
    const length = Math.hypot(scratchDir.x, scratchDir.y)
    const toward = axisToward(azimuthDeg, elevationDeg, axis)
    arrow.facing = toward >= 0 ? 1 : -1
    if (!(length > EPSILON_PX)) {
      // The axis points straight at (or away from) the camera: it has no screen
      // direction at all, so it is hidden rather than drawn as a stub that would
      // read as a fourth, shorter handle. Every point collapses onto the hub, so
      // nothing downstream reads a stale or NaN coordinate.
      arrow.visible = false
      arrow.tipX = arrow.h1x = arrow.h2x = arrow.baseX = arrow.s1x = arrow.s2x = out.originX
      arrow.tipY = arrow.h1y = arrow.h2y = arrow.baseY = arrow.s1y = arrow.s2y = out.originY
      arrow.coneRx = 0
      arrow.coneRy = 0
      arrow.coneAngleDeg = 0
    } else {
      const dx = scratchDir.x / length
      const dy = scratchDir.y / length
      // The perpendicular pointing at the lit flank: light comes from the upper
      // left of the screen, so pick whichever of the two normals leans that way
      // (`TODO/ui-048` — the highlight runs *along* the rod, on one side of it).
      let px = -dy
      let py = dx
      if (px + py > 0) {
        px = -px
        py = -py
      }
      arrow.visible = true
      arrow.tipX = out.originX + dx * armPx
      arrow.tipY = out.originY + dy * armPx
      arrow.baseX = arrow.tipX - dx * headPx
      arrow.baseY = arrow.tipY - dy * headPx
      // Base corners either side of the base centre: h1 lit, h2 shaded.
      arrow.h1x = arrow.baseX + px * coneRx
      arrow.h1y = arrow.baseY + py * coneRx
      arrow.h2x = arrow.baseX - px * coneRx
      arrow.h2y = arrow.baseY - py * coneRx
      // The cone's base disc, foreshortened by how far the axis points along
      // the view direction — the strongest single "this is 3D" cue.
      arrow.coneRx = coneRx
      arrow.coneRy = coneRx * Math.abs(toward)
      arrow.coneAngleDeg = (Math.atan2(py, px) * 180) / Math.PI
      arrow.s1x = out.originX + px * shaftHalfPx
      arrow.s1y = out.originY + py * shaftHalfPx
      arrow.s2x = out.originX - px * shaftHalfPx
      arrow.s2y = out.originY - py * shaftHalfPx
    }

    const ring = out.rings[axis]
    const [spanA, spanB] = OTHER_AXES[axis]
    screenDirection(azimuthDeg, elevationDeg, spanA === 0 ? 1 : 0, spanA === 1 ? 1 : 0, spanA === 2 ? 1 : 0, scratchDir)
    ring.ux = scratchDir.x * ringPx
    ring.uy = scratchDir.y * ringPx
    screenDirection(azimuthDeg, elevationDeg, spanB === 0 ? 1 : 0, spanB === 1 ? 1 : 0, spanB === 2 ? 1 : 0, scratchDir)
    ring.vx = scratchDir.x * ringPx
    ring.vy = scratchDir.y * ringPx
    ring.visible = true
  }

  return out
}

/**
 * How many points a rotate ring is sampled at when it is drawn.
 *
 * A ring is sampled rather than emitted as an SVG `<ellipse>` under a transform
 * matrix built from its conjugate diameters, which would be exact and cheaper.
 * The reason is the degenerate case: an ellipse whose transform is
 * non-invertible — a ring seen exactly edge-on, which is precisely what the
 * orientation gizmo's standard-view snaps produce — is *not rendered at all* per
 * the SVG spec, so snapping to the top view would silently drop two of the three
 * rotate handles. A sampled polyline degrades to a visible line instead, which
 * is the correct picture of a ring seen edge-on.
 */
export const RING_SEGMENTS = 28

/** Unit-circle samples, computed once at module load rather than per frame. */
const RING_COS = Object.freeze(
  Array.from({ length: RING_SEGMENTS }, (_, index) => Math.cos((index / RING_SEGMENTS) * 2 * Math.PI))
)
const RING_SIN = Object.freeze(
  Array.from({ length: RING_SEGMENTS }, (_, index) => Math.sin((index / RING_SEGMENTS) * 2 * Math.PI))
)

/**
 * Allocate the point buffer one ring is drawn from.
 *
 * @returns {{ x: number, y: number }[]}
 */
export function createRingPoints() {
  return Array.from({ length: RING_SEGMENTS }, () => ({ x: 0, y: 0 }))
}

/**
 * Sample a rotate ring into screen points.
 *
 * The ring is the circle `origin + u·cos t + v·sin t`, where `u` and `v` are the
 * screen images of the two world axes it spans — so this is the exact projection
 * of an axis-aligned circle, not an approximation of one.
 *
 * @param {GizmoRing} ring
 * @param {number} originX
 * @param {number} originY
 * @param {{ x: number, y: number }[]} out Mutated in place; see {@link createRingPoints}.
 * @returns {{ x: number, y: number }[]} `out`
 */
export function ringPoints(ring, originX, originY, out) {
  for (let index = 0; index < RING_SEGMENTS; index += 1) {
    const cos = RING_COS[index]
    const sin = RING_SIN[index]
    out[index].x = originX + ring.ux * cos + ring.vx * sin
    out[index].y = originY + ring.uy * cos + ring.vy * sin
  }
  return out
}

/**
 * The two ring parameters {@link ringArrowheads} decorates: a quarter turn and
 * three-quarters of a turn around the same `origin + u·cos t + v·sin t` circle
 * {@link ringPoints} samples (`TODO/ui-022`). Picked a quarter-turn apart so
 * the pair reads as "this circle spins" rather than two marks stacked on top
 * of each other, and *not* placed at `t = 0`/`π` because those are exactly the
 * points a heavily edge-on ring collapses toward, which would crowd both
 * chevrons into the same spot on screen.
 */
const RING_ARROW_T = Object.freeze([Math.PI / 2, (3 * Math.PI) / 2])

/**
 * How large each ring arrowhead is drawn, relative to the ring's own screen
 * size. Small on purpose (`TODO/ui-022`'s "keep them small relative to
 * `ringPx` so they don't compete with the translate arms' own arrowheads for
 * visual weight"). Since `TODO/ui-048` the arms' heads are a near-fixed
 * {@link gizmoHeadPx} rather than a share of the arm, so at a large ring these
 * chevrons can out-measure an arm head; they stay secondary by being thin,
 * open and semi-transparent rather than by being shorter.
 */
const RING_ARROW_SIZE_RATIO = 0.16

/**
 * Allocate the two three-point arrowhead triangles {@link ringArrowheads}
 * writes into — the same nested three-point convention
 * {@link createDimensionAnnotation}'s `h1`/`h2` already use, so a caller
 * updating this per frame mutates rather than rebuilds.
 *
 * @returns {{ x: number, y: number }[][]}
 */
export function createRingArrowheads() {
  return [0, 1].map(() => [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ])
}

/**
 * Two small chevrons marking a rotate ring's drag direction (`TODO/ui-022`) —
 * the visual cue a bare ring otherwise doesn't carry: "drag along me to spin
 * the object," not "decorative circle" or "selection halo," the same job the
 * translate arms' own arrowheads already do for the move handles.
 *
 * The ring is the circle `origin + u·cos t + v·sin t` ({@link ringPoints}); its
 * tangent at `t` is the derivative, `-u·sin t + v·cos t` — cheap to compute
 * from the same `ring.ux/uy/vx/vy` the ring itself already carries, no new
 * projection needed. Each chevron's tip sits exactly on the ring at that `t`
 * (the same point `ringPoints` would sample there) and its base trails behind
 * along the tangent, mirroring {@link writeArrowhead}'s own
 * tip-then-base-corners convention used for the dimension lines.
 *
 * @param {GizmoRing} ring
 * @param {number} originX
 * @param {number} originY
 * @param {{ x: number, y: number }[][]} out Mutated in place; see
 *   {@link createRingArrowheads}. `out[0]` sits a quarter turn around the
 *   ring, `out[1]` three-quarters.
 * @returns {{ x: number, y: number }[][]} `out`
 */
export function ringArrowheads(ring, originX, originY, out) {
  const arrowPx =
    0.5 * (Math.hypot(ring.ux, ring.uy) + Math.hypot(ring.vx, ring.vy)) * RING_ARROW_SIZE_RATIO
  for (let index = 0; index < RING_ARROW_T.length; index += 1) {
    const t = RING_ARROW_T[index]
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const tipX = originX + ring.ux * cos + ring.vx * sin
    const tipY = originY + ring.uy * cos + ring.vy * sin

    let dirX = -ring.ux * sin + ring.vx * cos
    let dirY = -ring.uy * sin + ring.vy * cos
    const dirLength = Math.hypot(dirX, dirY)
    if (dirLength > EPSILON_PX) {
      dirX /= dirLength
      dirY /= dirLength
    } else {
      // Both spanning directions vanished at this sample (a fully degenerate,
      // effectively invisible ring) — fall back to a fixed direction so the
      // output stays finite rather than an all-zero, undrawable triangle.
      dirX = 1
      dirY = 0
    }
    writeArrowhead(out[index], tipX, tipY, dirX, dirY, arrowPx)
  }
  return out
}

// --- gizmo drag (TODO/ui-012) ----------------------------------------------

/**
 * How far a pointer drag has slid a body along one axis, in millimetres.
 *
 * The arm's own screen image is the axis: the pointer delta is projected onto it,
 * so dragging *across* an axis handle contributes nothing rather than sliding the
 * body sideways. `mmPerPixel` is the viewport's own scale — the same number the
 * grid readout quotes — so a 10 mm drag looks like 10 mm on the grid underneath it.
 *
 * An axis pointing straight at the camera has no screen direction at all, and
 * `updateGizmoAnnotation` hides its arm; a drag there returns zero rather than
 * dividing by a vanishing length.
 *
 * @param {GizmoAnnotation} gizmo
 * @param {number} axisIndex 0 | 1 | 2.
 * @param {number} dxPx Pointer travel since the drag began.
 * @param {number} dyPx
 * @param {number} mmPerPixel
 * @returns {number} Millimetres along that axis, signed.
 */
export function translateDeltaMm(gizmo, axisIndex, dxPx, dyPx, mmPerPixel) {
  const arrow = gizmo.arrows[axisIndex]
  if (!arrow || !arrow.visible) return 0
  const armX = arrow.tipX - gizmo.originX
  const armY = arrow.tipY - gizmo.originY
  const armLength = Math.hypot(armX, armY)
  if (!(armLength > EPSILON_PX)) return 0
  return ((dxPx * armX + dyPx * armY) / armLength) * mmPerPixel
}

/**
 * How far a rotate-ring drag has turned a body, in degrees.
 *
 * The sweep is the change in the pointer's angle *around the gizmo's hub*, not
 * its raw travel — which is what makes a ring drag feel like turning a dial
 * rather than pushing a slider, and what keeps the rotation right when the user
 * wanders off the drawn ellipse mid-drag.
 *
 * Two sign conventions meet here. Screen Y grows downward, so an increasing
 * `atan2` angle is *clockwise* on screen, while a positive right-hand rotation
 * about an axis pointing at the viewer reads *counter-clockwise* — hence the
 * negation. And grabbing the ring of an axis pointing **away** from the viewer
 * means grabbing the far side of the circle, where the same on-screen sweep is
 * the opposite rotation — hence `facing`. Getting either backwards produces a
 * gizmo that turns the wrong way, which no assertion about magnitude would catch.
 *
 * @param {number} originX Gizmo hub, in CSS pixels.
 * @param {number} originY
 * @param {number} fromXPx Where the drag began.
 * @param {number} fromYPx
 * @param {number} toXPx Where the pointer is now.
 * @param {number} toYPx
 * @param {number} facing `+1` when the axis points toward the camera, `-1` away.
 * @returns {number} Degrees about that axis, signed, wrapped to (-180, 180].
 */
export function rotateDeltaDeg(originX, originY, fromXPx, fromYPx, toXPx, toYPx, facing) {
  const fromX = fromXPx - originX
  const fromY = fromYPx - originY
  const toX = toXPx - originX
  const toY = toYPx - originY
  // A pointer sitting exactly on the hub has no angle to measure from.
  if (!(Math.hypot(fromX, fromY) > EPSILON_PX) || !(Math.hypot(toX, toY) > EPSILON_PX)) return 0

  let sweep = Math.atan2(toY, toX) - Math.atan2(fromY, fromX)
  // Wrap across the ±180° seam: without this, a 10° nudge past the seam reads as
  // a 350° spin in the other direction.
  while (sweep > Math.PI) sweep -= 2 * Math.PI
  while (sweep < -Math.PI) sweep += 2 * Math.PI
  const degrees = ((-sweep * 180) / Math.PI) * facing
  // Normalise negative zero: it is not a different angle, but it would print as
  // "-0°" in a field a user is reading (`src/core/units.js` does the same).
  return degrees === 0 ? 0 : degrees
}

/**
 * The signed component of a world axis along the direction toward the camera:
 * `+1` pointing straight at it, `0` lying flat across the screen, `-1` pointing
 * straight away (`TODO/ui-048` — the cone base's foreshortening).
 *
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {number} axisIndex 0 | 1 | 2.
 * @returns {number} In [-1, 1].
 */
export function axisToward(azimuthDeg, elevationDeg, axisIndex) {
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  const cosEl = Math.cos(el)
  // The unit vector from the camera target toward the camera — the same one
  // `worldToScreen` builds its view ray from.
  if (axisIndex === 0) return cosEl * Math.cos(az)
  if (axisIndex === 1) return cosEl * Math.sin(az)
  return Math.sin(el)
}

/**
 * Whether an axis points toward the camera (`+1`) or away from it (`-1`).
 *
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {number} axisIndex 0 | 1 | 2.
 * @returns {1 | -1}
 */
export function axisFacing(azimuthDeg, elevationDeg, axisIndex) {
  return axisToward(azimuthDeg, elevationDeg, axisIndex) >= 0 ? 1 : -1
}

// --- rotate dial (TODO/ui-064) ---------------------------------------------

/**
 * The rotate dial is drawn in the ring's own plane, from the ring's own
 * `origin + u·cos t + v·sin t` at radii a little inside 1. That expression is the
 * exact screen image of a circle in the plane the ring spans, so the dial
 * foreshortens with the ring at any camera angle, and turns edge-on with it,
 * with no second projection. That is the whole "same plane as the ring"
 * requirement.
 *
 * ## Hand direction: parameter sense, not facing
 *
 * A world rotation of `θ` about the ring's axis moves a point at ring parameter
 * `t` to `t + sense·θ`, where `sense` depends only on which two world axes the
 * ring spans and in what order (`OTHER_AXES`). X spans (Y, Z) and Z spans (X, Y),
 * both right-handed about their own axis, so `sense = +1`. Y spans (X, Z), and
 * `X × Z = −Y`, so `sense = −1`.
 *
 * `facing` does **not** enter here. It belongs to the screen-sweep →
 * world-angle step, which `rotateDeltaDeg` has already done before a turned
 * angle reaches the dial. Applying it twice is the same "turns the wrong way"
 * bug `rotateDeltaDeg`'s doc comment warns about, and no readout would show
 * it. The spec checks the hand against an independent world-space rotation of
 * the grabbed point for both facings of every axis.
 */

/** Tick spacing round the dial, degrees of turn. */
const DIAL_TICK_STEP_DEG = 15

/** How many ticks make a full dial. */
export const DIAL_TICK_COUNT = 360 / DIAL_TICK_STEP_DEG

/** Every this-many ticks is a long one (45°). */
const DIAL_MAJOR_EVERY = 3

/**
 * The dial is drawn **larger than the gizmo ring**, which is itself sized to
 * clear the part's bounding sphere (`gizmoSizeForBounds`). So every ratio below
 * is a multiple of the ring's radius, and the whole tick band and both hands
 * sit outside the part rather than being drawn over it.
 */

/** Outer end of every tick, as a multiple of the ring's radius. */
const DIAL_TICK_OUTER = 1.3
/** Inner end of a minor tick. */
const DIAL_TICK_MINOR_INNER = 1.2
/** Inner end of a major (45°) tick. */
const DIAL_TICK_MAJOR_INNER = 1.1
/** Where the 0/90/180/270 labels sit: just inside the ticks, on the ring itself. */
const DIAL_LABEL_RATIO = 1.0

/** Length of both hands and the sector's radius, as a multiple of the ring. */
export const DIAL_HAND_RATIO = 1.2

/** The live hand's arrowhead length, px. */
const DIAL_HAND_HEAD_PX = 9

/**
 * Points along the sector's arc, hub excluded. Odd, so a sweep's midpoint is
 * a sample. 37 is 10° a segment at a full turn.
 */
export const DIAL_SECTOR_POINTS = 37

/**
 * Below this, the ring is edge-on enough that its ticks overlap and the sector
 * degenerates to a sliver, so the dial draws only the live hand and the
 * readout. The measure is `|u × v| / ((|u|² + |v|²) / 2)`. For a circle whose
 * axis makes `c = |axis · view|` with the view, that is `2c / (1 + c²)`: 1
 * face-on, 0 edge-on. 0.25 is about 7° off edge-on.
 */
const DIAL_EDGE_ON_RATIO = 0.25

/** Labels round the dial: the turn, relative to the grab. */
const DIAL_LABEL_TEXT = Object.freeze(['0', '90', '180', '270'])

/** Readout pill size, px. Fixed so placement can be computed without measuring text. */
export const DIAL_READOUT_WIDTH_PX = 112
export const DIAL_READOUT_HEIGHT_PX = 50
/** The readout's main line, px. ≥ 14 so it is legible at phone width. */
export const DIAL_READOUT_FONT_PX = 18
/** Clear space between the readout and whatever it must not cover, px. */
const DIAL_READOUT_GAP_PX = 12
/**
 * How far clear of a fingertip the readout sits, px. A fingertip covers about
 * 9 mm of glass, more below the contact point (where the hand is) than above.
 */
const DIAL_READOUT_FINGER_PX = 48
/** Minimum distance from the viewport's edge, px. */
const DIAL_READOUT_MARGIN_PX = 8

/**
 * @typedef {object} DialTick
 * @property {number} x1 Inner end.
 * @property {number} y1
 * @property {number} x2 Outer end.
 * @property {number} y2
 * @property {boolean} major Every 45° of turn.
 */

/**
 * @typedef {object} DialLabel
 * @property {number} x Centre of the label text.
 * @property {number} y
 * @property {string} text `"0"` | `"90"` | `"180"` | `"270"`.
 */

/**
 * @typedef {object} DialAnnotation
 * @property {boolean} visible
 * @property {string} axis The ring's axis, `"X"` | `"Y"` | `"Z"`, for its colour.
 * @property {boolean} degenerate Ring seen (nearly) edge-on: only the live hand
 *   and the readout are drawn.
 * @property {number} originX Hub.
 * @property {number} originY
 * @property {DialTick[]} ticks {@link DIAL_TICK_COUNT} of them, tick 0 at the grab.
 * @property {DialLabel[]} labels Four.
 * @property {number} startX Tip of the start hand, fixed at the grab.
 * @property {number} startY
 * @property {number} liveX Tip of the live hand, at grab + turned.
 * @property {number} liveY
 * @property {{ x: number, y: number }[]} liveHead Three points, tip first.
 * @property {boolean} sectorVisible
 * @property {{ x: number, y: number }[]} sector {@link DIAL_SECTOR_POINTS} arc points
 *   from the start hand to the live hand; the hub closes the wedge.
 * @property {number} sectorSweepDeg The turn the sector shows, clamped to ±360.
 * @property {number} turnedDeg The signed turned angle, unwrapped.
 * @property {number} stepDeg The active snap step, `0` when continuous.
 * @property {number} readoutX Centre of the readout pill.
 * @property {number} readoutY
 */

/**
 * Allocate the dial's output structure once; {@link updateDialAnnotation}
 * mutates it.
 *
 * @returns {DialAnnotation}
 */
export function createDialAnnotation() {
  return {
    visible: false,
    axis: 'Z',
    degenerate: false,
    originX: 0,
    originY: 0,
    ticks: Array.from({ length: DIAL_TICK_COUNT }, (_, index) => ({
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      major: index % DIAL_MAJOR_EVERY === 0,
    })),
    labels: DIAL_LABEL_TEXT.map((text) => ({ x: 0, y: 0, text })),
    startX: 0,
    startY: 0,
    liveX: 0,
    liveY: 0,
    liveHead: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    sectorVisible: false,
    sector: Array.from({ length: DIAL_SECTOR_POINTS }, () => ({ x: 0, y: 0 })),
    sectorSweepDeg: 0,
    turnedDeg: 0,
    stepDeg: 0,
    readoutX: 0,
    readoutY: 0,
  }
}

/**
 * Which way a world rotation moves a ring's parameter. See the section comment.
 *
 * @param {string} axis `"X"` | `"Y"` | `"Z"`.
 * @returns {1 | -1}
 */
function ringParamSense(axis) {
  return axis === 'Y' ? -1 : 1
}

/**
 * How face-on a ring is: 1 face-on, 0 edge-on. See {@link DIAL_EDGE_ON_RATIO}.
 *
 * @param {GizmoRing} ring
 * @returns {number}
 */
function ringOpenness(ring) {
  const det = ring.ux * ring.vy - ring.vx * ring.uy
  const scale = (ring.ux * ring.ux + ring.uy * ring.uy + ring.vx * ring.vx + ring.vy * ring.vy) / 2
  return scale > EPSILON_PX ? Math.abs(det) / scale : 0
}

/**
 * The ring parameter, degrees, of a screen point: where on the ring a drag began.
 *
 * Inverts the ring's 2×2 `[u v]` map at the point rather than taking its screen
 * angle. On a foreshortened ring the two differ (an ellipse's polar angle is not
 * its parameter), and only the parameter lets the hands turn with the body.
 * The point need not be on the ring itself: the grab lands anywhere in the
 * ring's fat hit band, and the angle of `(cos t, sin t)·r` is the same for any `r`.
 *
 * On a ring too close to edge-on to invert, the parameter whose ring point
 * lies most nearly in the point's direction is used instead (the maximum of
 * `(u·p) cos t + (v·p) sin t`).
 *
 * @param {GizmoRing} ring
 * @param {number} originX Hub.
 * @param {number} originY
 * @param {number} xPx The point, viewport pixels.
 * @param {number} yPx
 * @returns {number} Degrees in (-180, 180]; `0` for a point on the hub.
 */
export function ringParamDeg(ring, originX, originY, xPx, yPx) {
  const dx = xPx - originX
  const dy = yPx - originY
  if (!(Math.hypot(dx, dy) > EPSILON_PX)) return 0
  let c
  let s
  if (ringOpenness(ring) >= DIAL_EDGE_ON_RATIO) {
    const det = ring.ux * ring.vy - ring.vx * ring.uy
    c = (dx * ring.vy - ring.vx * dy) / det
    s = (ring.ux * dy - dx * ring.uy) / det
  } else {
    c = ring.ux * dx + ring.uy * dy
    s = ring.vx * dx + ring.vy * dy
  }
  if (!(Math.hypot(c, s) > 0)) return 0
  const degrees = (Math.atan2(s, c) * 180) / Math.PI
  return degrees === 0 ? 0 : degrees
}

/**
 * Write the screen point at ring parameter `t` (radians) and radius `ratio`.
 *
 * @param {GizmoRing} ring
 * @param {number} originX
 * @param {number} originY
 * @param {number} t
 * @param {number} ratio
 * @param {{ x: number, y: number }} out
 */
function dialPoint(ring, originX, originY, t, ratio, out) {
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  out.x = originX + ratio * (ring.ux * cos + ring.vx * sin)
  out.y = originY + ratio * (ring.uy * cos + ring.vy * sin)
}

// Scratch for the dial's hand endpoints: single-threaded, finished with before return.
const scratchDialPoint = { x: 0, y: 0 }

/**
 * Lay out the rotate dial for a drag in progress (`TODO/ui-064`).
 *
 * Ticks every 15° of turn and labels every 90°, both counted from the grab, so
 * `0` is where you took hold. The start hand stays at the grab; the live hand
 * sits at grab + turned, exactly where the preview has carried the grabbed
 * point of the body. The sector fills the wedge between the hands, the long
 * way round when the turn is past 180°, up to a full disc.
 *
 * Allocates nothing: every array in `out` is reused.
 *
 * @param {GizmoRing} ring The ring being dragged.
 * @param {number} startParamDeg Ring parameter of the grab ({@link ringParamDeg}).
 * @param {number} turnedDeg Signed world rotation about the ring's axis, unwrapped.
 * @param {number} originX Hub.
 * @param {number} originY
 * @param {DialAnnotation} out Mutated in place.
 * @returns {DialAnnotation} `out`
 */
export function updateDialAnnotation(ring, startParamDeg, turnedDeg, originX, originY, out) {
  const sense = ringParamSense(ring.axis)
  const start = startParamDeg * DEG
  const turned = turnedDeg === 0 ? 0 : turnedDeg
  out.visible = true
  out.axis = ring.axis
  out.originX = originX
  out.originY = originY
  out.turnedDeg = turned
  // Edge-on: the ticks would stack on one line and the sector would be a
  // sliver, so only the live hand (and the readout) is drawn. The hand still
  // runs along the collapsed line as the body turns, which is honest.
  out.degenerate = ringOpenness(ring) < DIAL_EDGE_ON_RATIO

  dialPoint(ring, originX, originY, start, DIAL_HAND_RATIO, scratchDialPoint)
  out.startX = scratchDialPoint.x
  out.startY = scratchDialPoint.y
  dialPoint(ring, originX, originY, start + sense * turned * DEG, DIAL_HAND_RATIO, scratchDialPoint)
  out.liveX = scratchDialPoint.x
  out.liveY = scratchDialPoint.y

  let dirX = originX - out.liveX
  let dirY = originY - out.liveY
  const dirLength = Math.hypot(dirX, dirY)
  if (dirLength > EPSILON_PX) {
    dirX /= dirLength
    dirY /= dirLength
  } else {
    dirX = 1
    dirY = 0
  }
  writeArrowhead(out.liveHead, out.liveX, out.liveY, dirX, dirY, Math.min(DIAL_HAND_HEAD_PX, dirLength * 0.5))

  for (let index = 0; index < DIAL_TICK_COUNT; index += 1) {
    const tick = out.ticks[index]
    const t = start + sense * index * DIAL_TICK_STEP_DEG * DEG
    dialPoint(ring, originX, originY, t, tick.major ? DIAL_TICK_MAJOR_INNER : DIAL_TICK_MINOR_INNER, scratchDialPoint)
    tick.x1 = scratchDialPoint.x
    tick.y1 = scratchDialPoint.y
    dialPoint(ring, originX, originY, t, DIAL_TICK_OUTER, scratchDialPoint)
    tick.x2 = scratchDialPoint.x
    tick.y2 = scratchDialPoint.y
  }
  for (let index = 0; index < out.labels.length; index += 1) {
    dialPoint(ring, originX, originY, start + sense * index * 90 * DEG, DIAL_LABEL_RATIO, out.labels[index])
  }

  const sweep = clamp(turned, -360, 360)
  out.sectorSweepDeg = sweep === 0 ? 0 : sweep
  out.sectorVisible = !out.degenerate && sweep !== 0
  const last = DIAL_SECTOR_POINTS - 1
  for (let index = 0; index <= last; index += 1) {
    const t = start + (sense * sweep * DEG * index) / last
    dialPoint(ring, originX, originY, t, DIAL_HAND_RATIO, out.sector[index])
  }
  return out
}

/**
 * Place the dial's readout pill (`TODO/ui-064`): screen-aligned text, since
 * text skewed onto an ellipse is unreadable, kept inside the viewport.
 *
 * - **Mouse**: centred on the hub, just clear above the ring, so it never
 *   covers the hands it describes.
 * - **Touch**: above the fingertip by a finger's width, so the finger never
 *   covers it. Near the top edge, where there is no room above, it moves beside
 *   the finger instead: away from the hub if that side fits, otherwise the
 *   other side. It never drops under the finger, where the hand is.
 *
 * Writes `readoutX`/`readoutY`, the pill's centre, into `out`.
 *
 * @param {GizmoRing} ring
 * @param {number} originX Hub.
 * @param {number} originY
 * @param {number} pointerXPx The pointer, viewport pixels.
 * @param {number} pointerYPx
 * @param {boolean} touch Touch or pen: dodge the finger.
 * @param {number} widthPx Viewport size.
 * @param {number} heightPx
 * @param {DialAnnotation} out Mutated in place.
 * @returns {DialAnnotation} `out`
 */
export function placeDialReadout(ring, originX, originY, pointerXPx, pointerYPx, touch, widthPx, heightPx, out) {
  const halfW = DIAL_READOUT_WIDTH_PX / 2
  const halfH = DIAL_READOUT_HEIGHT_PX / 2
  const minX = DIAL_READOUT_MARGIN_PX + halfW
  const maxX = widthPx - DIAL_READOUT_MARGIN_PX - halfW
  const minY = DIAL_READOUT_MARGIN_PX + halfH
  const maxY = heightPx - DIAL_READOUT_MARGIN_PX - halfH

  let x
  let y
  if (!touch) {
    // The ellipse's exact vertical half-extent on screen.
    const ringHalfHeight = Math.hypot(ring.uy, ring.vy) * DIAL_TICK_OUTER
    x = originX
    y = originY - ringHalfHeight - DIAL_READOUT_GAP_PX - halfH
  } else {
    x = pointerXPx
    y = pointerYPx - DIAL_READOUT_FINGER_PX - halfH
    if (y < minY) {
      // No room above: beside the finger, away from the hub if that side fits.
      const reach = DIAL_READOUT_FINGER_PX + halfW
      const away = pointerXPx >= originX ? 1 : -1
      const preferred = pointerXPx + away * reach
      x = preferred >= minX && preferred <= maxX ? preferred : pointerXPx - away * reach
      y = pointerYPx
    }
  }
  // Clamp inside the viewport. A viewport narrower than the pill pins it to the left margin.
  out.readoutX = maxX >= minX ? clamp(x, minX, maxX) : minX
  out.readoutY = maxY >= minY ? clamp(y, minY, maxY) : minY
  return out
}

// --- dimension lines -------------------------------------------------------

/**
 * @typedef {object} DimensionAnnotation
 * @property {string} axis `"X"` | `"Y"` | `"Z"` — the **body's own** axis once
 *   `frame` is `"local"`, which for an unrotated body is also the world axis.
 * @property {'world' | 'local'} frame Which frame `lengthMm` was measured in
 *   (`TODO/ui-023`). `"world"` while the body is unrotated — where the two
 *   frames coincide — and `"local"` once it is turned, at which point the number
 *   is the part's own extent and the line runs along the part's own edge rather
 *   than along a grid axis.
 * @property {boolean} visible
 * @property {number} lengthMm The measured extent.
 * @property {string} label The extent, formatted with its unit.
 * @property {number} a1x The measured corner — the extension line's foot.
 * @property {number} a1y
 * @property {number} a2x The other measured corner.
 * @property {number} a2y
 * @property {number} e1x The extension line's head, just past the dimension line.
 * @property {number} e1y
 * @property {number} e2x
 * @property {number} e2y
 * @property {number} x1 The dimension line itself, offset clear of the solid.
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 * @property {{ x: number, y: number }[]} h1 Arrowhead at end 1: tip first.
 * @property {{ x: number, y: number }[]} h2 Arrowhead at end 2.
 * @property {number} labelX
 * @property {number} labelY
 */

/**
 * Allocate one axis's dimension annotation once.
 *
 * @returns {DimensionAnnotation}
 */
export function createDimensionAnnotation() {
  return {
    axis: 'X',
    frame: /** @type {'world' | 'local'} */ ('world'),
    visible: false,
    lengthMm: 0,
    label: '',
    a1x: 0,
    a1y: 0,
    a2x: 0,
    a2y: 0,
    e1x: 0,
    e1y: 0,
    e2x: 0,
    e2y: 0,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    h1: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    h2: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    labelX: 0,
    labelY: 0,
  }
}

/**
 * A box in a body's **own** frame, plus the turn that puts it back in the world
 * (`TODO/ui-023`).
 *
 * `minMm`/`maxMm` are the part's real extents on its real axes — what
 * `src/core/inspector.js` reports as `localBoundsMm` — rather than the
 * world-axis-aligned shadow a tilted part casts. A local point maps to world as
 * `pivotMm + R(rotationDeg)·(local − pivotMm)`, which is the exact inverse of the
 * un-turn `localBoundsOf` did to measure it; see that function for why any
 * consistently-used pivot is correct.
 *
 * An unrotated body's box is its world box, so a caller with nothing rotated
 * passes `rotationDeg: [0, 0, 0]` and gets bit-for-bit the pre-`ui-023` result.
 *
 * @typedef {object} OrientedBox
 * @property {readonly number[]} minMm Local-frame minimum, millimetres.
 * @property {readonly number[]} maxMm Local-frame maximum.
 * @property {readonly number[]} rotationDeg Degrees per axis, z-y-x Tait-Bryan.
 * @property {readonly number[]} pivotMm The point the local frame is anchored at.
 */

/**
 * Allocate an {@link OrientedBox} once, so a caller updating it per frame
 * mutates rather than rebuilds — the same contract as every `create*` here.
 *
 * @returns {{ minMm: readonly number[], maxMm: readonly number[], rotationDeg: readonly number[], pivotMm: readonly number[] }}
 */
export function createOrientedBox() {
  return { minMm: [0, 0, 0], maxMm: [0, 0, 0], rotationDeg: [0, 0, 0], pivotMm: [0, 0, 0] }
}

/**
 * Sines and cosines of the box currently being annotated, loaded once per call
 * rather than recomputed for each of its nine projected points.
 */
const scratchTurn = { active: false, cx: 1, sx: 0, cy: 1, sy: 0, cz: 1, sz: 0, px: 0, py: 0, pz: 0 }
const scratchPoint = { x: 0, y: 0, z: 0 }

/**
 * Load a box's rotation into {@link scratchTurn}.
 *
 * @param {OrientedBox} box
 * @returns {boolean} False when the body is unrotated, in which case
 *   {@link localToWorld} is the identity and nothing below costs anything.
 */
function loadTurn(box) {
  const rotation = box.rotationDeg
  const x = rotation?.[0] ?? 0
  const y = rotation?.[1] ?? 0
  const z = rotation?.[2] ?? 0
  scratchTurn.active = x !== 0 || y !== 0 || z !== 0
  if (!scratchTurn.active) return false
  scratchTurn.cx = Math.cos(x * DEG)
  scratchTurn.sx = Math.sin(x * DEG)
  scratchTurn.cy = Math.cos(y * DEG)
  scratchTurn.sy = Math.sin(y * DEG)
  scratchTurn.cz = Math.cos(z * DEG)
  scratchTurn.sz = Math.sin(z * DEG)
  const pivot = box.pivotMm
  scratchTurn.px = pivot?.[0] ?? 0
  scratchTurn.py = pivot?.[1] ?? 0
  scratchTurn.pz = pivot?.[2] ?? 0
  return true
}

/**
 * Map a local-frame point into world millimetres, using the turn most recently
 * loaded by {@link loadTurn}.
 *
 * `R = Rz(z)·Ry(y)·Rx(x)` — active, intrinsic Tait-Bryan in z-y-x order, which
 * is what `@jscad/modeling`'s `transforms.rotate` builds and therefore what
 * `src/core/kernel/registry.js`'s `transform.rotate` op actually applied to the
 * solid. Applying the three in the wrong order would draw a box that is the
 * right size and the wrong shape on screen.
 *
 * @param {number} lxMm
 * @param {number} lyMm
 * @param {number} lzMm
 * @param {{ x: number, y: number, z: number }} out Mutated in place.
 * @returns {{ x: number, y: number, z: number }} `out`
 */
function localToWorld(lxMm, lyMm, lzMm, out) {
  if (!scratchTurn.active) {
    out.x = lxMm
    out.y = lyMm
    out.z = lzMm
    return out
  }
  const { cx, sx, cy, sy, cz, sz, px, py, pz } = scratchTurn
  const vx = lxMm - px
  const vy = lyMm - py
  const vz = lzMm - pz
  // Rx first, then Ry, then Rz — innermost-first, matching the z-y-x intrinsic
  // order the composed matrix expands to.
  const y1 = cx * vy - sx * vz
  const z1 = sx * vy + cx * vz
  const x2 = cy * vx + sy * z1
  const z2 = -sy * vx + cy * z1
  out.x = px + cz * x2 - sz * y1
  out.y = py + sz * x2 + cz * y1
  out.z = pz + z2
  return out
}

/**
 * Read one corner of a bounding box into world millimetres.
 *
 * @param {readonly number[]} minMm
 * @param {readonly number[]} maxMm
 * @param {number} axis Axis being measured.
 * @param {number} axisPick 0 for the min end, 1 for the max end.
 * @param {number} pickA min/max on the first other axis.
 * @param {number} pickB min/max on the second other axis.
 * @param {number} component Which component to return, 0..2.
 * @returns {number}
 */
function corner(minMm, maxMm, axis, axisPick, pickA, pickB, component) {
  const [otherA] = OTHER_AXES[axis]
  let pick = pickB
  if (component === axis) pick = axisPick
  else if (component === otherA) pick = pickA
  return pick === 0 ? minMm[component] : maxMm[component]
}

/**
 * One corner of an oriented box, in world millimetres — {@link corner} three
 * times over, then turned by the loaded rotation.
 *
 * @param {readonly number[]} minMm
 * @param {readonly number[]} maxMm
 * @param {number} axis
 * @param {number} axisPick
 * @param {number} pickA
 * @param {number} pickB
 * @param {{ x: number, y: number, z: number }} out Mutated in place.
 * @returns {{ x: number, y: number, z: number }} `out`
 */
function orientedCorner(minMm, maxMm, axis, axisPick, pickA, pickB, out) {
  return localToWorld(
    corner(minMm, maxMm, axis, axisPick, pickA, pickB, 0),
    corner(minMm, maxMm, axis, axisPick, pickA, pickB, 1),
    corner(minMm, maxMm, axis, axisPick, pickA, pickB, 2),
    out
  )
}

/**
 * Build one axis's dimension line for a bounding box.
 *
 * ## Which edge gets dimensioned
 *
 * A box has four edges parallel to any axis, and drawing the number across the
 * middle of the solid would put it behind the thing it measures. The edge chosen
 * is whichever one projects **furthest from the box's screen centre** — the
 * outermost silhouette edge from wherever the camera currently is — which is
 * what makes the annotation re-orient as the user orbits, per
 * `docs/decisions/interaction-model-qa.md` control 3's "oriented per the
 * camera's current projection of that axis".
 *
 * The line is then pushed a further `offsetPx` outward along that same
 * screen-space direction, with extension lines tying it back to the two corners
 * it actually measures — the ordinary drafting convention, and the reason the
 * number stays readable against the solid rather than on top of it.
 *
 * ## Which frame the number is in
 *
 * The box is the body's **own** (`TODO/ui-023`), so the three numbers are the
 * part's real width, depth and height even when it is tilted — not the larger
 * world-axis box a tilted part happens to fit inside, which is bigger on every
 * axis and carries no readable diameter or length at all. `out.frame` says which
 * of the two a given call produced, so the overlay can tell a user that a
 * rotated part's lines are being read off the part rather than off the grid.
 *
 * The eight corners are built in the local frame and turned into world space one
 * at a time; the "furthest-from-centre edge wins" selection above then runs
 * unchanged over that oriented set. Two rotations make the *drawing* degenerate
 * without making the *measurement* wrong, and both are covered in the spec: a
 * turn that lines two local axes up on the same screen direction (they draw
 * parallel, which is the honest picture), and one that points a local axis dead
 * on at the camera (its edge has no screen direction, and the fallbacks below —
 * the line's own perpendicular, then straight down — keep every output finite).
 *
 * @param {OrbitCamera} orbit
 * @param {OrientedBox} boxMm The body's own box and the turn that places it.
 * @param {number} axisIndex 0 | 1 | 2 — the body's **local** axis.
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {number} offsetPx How far clear of the solid to draw the line.
 * @param {number} arrowPx Arrowhead length.
 * @param {DimensionAnnotation} out Mutated in place.
 * @returns {DimensionAnnotation} `out`
 */
export function updateDimensionAnnotation(
  orbit,
  boxMm,
  axisIndex,
  widthPx,
  heightPx,
  offsetPx,
  arrowPx,
  out
) {
  const { minMm, maxMm } = boxMm
  out.axis = AXIS_LABELS[axisIndex]
  // Measured off the local box, so it never depends on the camera or on which
  // way the part happens to be turned.
  const lengthMm = maxMm[axisIndex] - minMm[axisIndex]
  out.lengthMm = lengthMm
  out.label = formatMm(lengthMm)
  out.frame = loadTurn(boxMm) ? 'local' : 'world'

  localToWorld(
    (minMm[0] + maxMm[0]) / 2,
    (minMm[1] + maxMm[1]) / 2,
    (minMm[2] + maxMm[2]) / 2,
    scratchPoint
  )
  worldToScreen(orbit, scratchPoint.x, scratchPoint.y, scratchPoint.z, widthPx, heightPx, scratchCentre)
  if (!scratchCentre.visible) {
    out.visible = false
    return out
  }

  let bestScore = -1
  let found = false
  for (const [pickA, pickB] of EDGE_CORNERS) {
    orientedCorner(minMm, maxMm, axisIndex, 0, pickA, pickB, scratchPoint)
    worldToScreen(orbit, scratchPoint.x, scratchPoint.y, scratchPoint.z, widthPx, heightPx, scratchNear)
    orientedCorner(minMm, maxMm, axisIndex, 1, pickA, pickB, scratchPoint)
    worldToScreen(orbit, scratchPoint.x, scratchPoint.y, scratchPoint.z, widthPx, heightPx, scratchFar)
    if (!scratchNear.visible || !scratchFar.visible) continue

    const midX = (scratchNear.x + scratchFar.x) / 2
    const midY = (scratchNear.y + scratchFar.y) / 2
    const score = (midX - scratchCentre.x) ** 2 + (midY - scratchCentre.y) ** 2
    if (score <= bestScore) continue
    bestScore = score
    found = true
    copyScreenPoint(scratchNear, scratchBestNear)
    copyScreenPoint(scratchFar, scratchBestFar)
  }

  if (!found) {
    out.visible = false
    return out
  }
  out.visible = true

  out.a1x = scratchBestNear.x
  out.a1y = scratchBestNear.y
  out.a2x = scratchBestFar.x
  out.a2y = scratchBestFar.y

  // Outward: from the box's screen centre toward this edge's midpoint. A box
  // seen from straight on can put that midpoint exactly on the centre (a
  // zero-size body, or an axis dead-on), so fall back to the line's own
  // perpendicular rather than dividing by zero.
  const midX = (out.a1x + out.a2x) / 2
  const midY = (out.a1y + out.a2y) / 2
  let outX = midX - scratchCentre.x
  let outY = midY - scratchCentre.y
  let outLength = Math.hypot(outX, outY)
  if (!(outLength > EPSILON_PX)) {
    outX = -(out.a2y - out.a1y)
    outY = out.a2x - out.a1x
    outLength = Math.hypot(outX, outY)
  }
  if (outLength > EPSILON_PX) {
    outX /= outLength
    outY /= outLength
  } else {
    // Fully degenerate (a zero-size body seen head-on): push straight down, so
    // the label still lands somewhere finite and readable.
    outX = 0
    outY = 1
  }

  out.x1 = out.a1x + outX * offsetPx
  out.y1 = out.a1y + outY * offsetPx
  out.x2 = out.a2x + outX * offsetPx
  out.y2 = out.a2y + outY * offsetPx

  // Extension lines run from each measured corner out past the dimension line,
  // which is what ties the number to the feature it describes.
  const extendPx = offsetPx + arrowPx * 0.8
  out.e1x = out.a1x + outX * extendPx
  out.e1y = out.a1y + outY * extendPx
  out.e2x = out.a2x + outX * extendPx
  out.e2y = out.a2y + outY * extendPx

  // Arrowheads, tips on the line's own ends, pointing outward at each end so the
  // pair reads as a span rather than as two unrelated ticks.
  let lineX = out.x2 - out.x1
  let lineY = out.y2 - out.y1
  const lineLength = Math.hypot(lineX, lineY)
  if (lineLength > EPSILON_PX) {
    lineX /= lineLength
    lineY /= lineLength
  } else {
    lineX = 1
    lineY = 0
  }
  writeArrowhead(out.h1, out.x1, out.y1, lineX, lineY, arrowPx)
  writeArrowhead(out.h2, out.x2, out.y2, -lineX, -lineY, arrowPx)

  out.labelX = (out.x1 + out.x2) / 2 + outX * (arrowPx + 3)
  out.labelY = (out.y1 + out.y2) / 2 + outY * (arrowPx + 3)
  return out
}

/**
 * Write a three-point arrowhead: tip first, then the two base corners.
 *
 * @param {{ x: number, y: number }[]} head Mutated in place.
 * @param {number} tipX
 * @param {number} tipY
 * @param {number} dirX Unit direction the head's base sits along, from the tip.
 * @param {number} dirY
 * @param {number} arrowPx
 * @returns {void}
 */
function writeArrowhead(head, tipX, tipY, dirX, dirY, arrowPx) {
  const halfWidth = arrowPx * 0.34
  head[0].x = tipX
  head[0].y = tipY
  head[1].x = tipX + dirX * arrowPx - dirY * halfWidth
  head[1].y = tipY + dirY * arrowPx + dirX * halfWidth
  head[2].x = tipX + dirX * arrowPx + dirY * halfWidth
  head[2].y = tipY + dirY * arrowPx - dirX * halfWidth
}

/**
 * @param {ScreenPoint} from
 * @param {ScreenPoint} to Mutated in place.
 * @returns {void}
 */
function copyScreenPoint(from, to) {
  to.x = from.x
  to.y = from.y
  to.depth = from.depth
  to.visible = from.visible
}

// --- marquee select (TODO/ui-024) ------------------------------------------

/**
 * @typedef {object} MarqueeRect
 * @property {boolean} visible
 * @property {number} x Top-left corner, CSS pixels from the viewport's left edge.
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * Allocate the marquee-select rectangle's output structure once, so a drag
 * updates it in place per `pointermove` rather than rebuilding it — CLAUDE.md's
 * no-per-frame-allocation rule, and a marquee drag can fire many `pointermove`
 * events between rendered frames.
 *
 * @returns {MarqueeRect}
 */
export function createMarqueeRect() {
  return { visible: false, x: 0, y: 0, width: 0, height: 0 }
}

/**
 * Normalise two dragged screen points into a top-left/width/height rectangle.
 *
 * The two points can arrive in either order — a drag can go in any of the four
 * diagonal directions — so this is `Math.min`/`Math.abs`, not a plain
 * subtraction. A degenerate zero-travel drag (the same point given twice) is a
 * valid input here: it produces a zero-size rectangle rather than throwing.
 * `Viewport.vue` never actually reaches this function with zero travel — its
 * own `CLICK_SLOP_PX` gating keeps a true click from starting a marquee at
 * all, per this task's Testing section — but the pure helper still has to stay
 * well-defined for that input, and the spec exercises it directly.
 *
 * @param {number} x1Px
 * @param {number} y1Px
 * @param {number} x2Px
 * @param {number} y2Px
 * @param {MarqueeRect} out Mutated in place. `visible` is left untouched — that
 *   is the caller's concern (whether a marquee is in progress at all), not
 *   this function's.
 * @returns {MarqueeRect} `out`
 */
export function updateMarqueeRect(x1Px, y1Px, x2Px, y2Px, out) {
  out.x = Math.min(x1Px, x2Px)
  out.y = Math.min(y1Px, y2Px)
  out.width = Math.abs(x2Px - x1Px)
  out.height = Math.abs(y2Px - y1Px)
  return out
}

/**
 * @typedef {object} BoxScreenBounds
 * @property {boolean} visible False when every corner of the box projected
 *   behind the camera — nothing on screen to test the marquee against.
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 */

/**
 * Allocate a body's screen-space bounding box once, so testing several bodies
 * against a marquee mutates one structure in a loop rather than allocating
 * one per body.
 *
 * @returns {BoxScreenBounds}
 */
export function createBoxScreenBounds() {
  return { visible: false, minX: 0, minY: 0, maxX: 0, maxY: 0 }
}

// Scratch for updateBoxScreenBounds's own per-corner projection.
const scratchMarqueeCorner = createScreenPoint()

/**
 * Project a **world-axis-aligned** bounding box's eight corners to screen
 * space and reduce them to the axis-aligned screen rectangle of whichever
 * corners land in front of the camera.
 *
 * Deliberately the *world* box (`Body.boundsMm` — `src/core/inspector.js`,
 * also what `src/core/kernel/group.js`'s `boundsOf` returns), not the body's
 * own oriented local box {@link updateDimensionAnnotation} measures: a
 * marquee is a screen-space rectangle test, so what matters is where the
 * body's silhouette actually falls on screen, corners included, regardless of
 * whether the body itself is turned.
 *
 * @param {OrbitCamera} orbit
 * @param {readonly number[]} minMm
 * @param {readonly number[]} maxMm
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {BoxScreenBounds} out Mutated in place.
 * @returns {BoxScreenBounds} `out`
 */
export function updateBoxScreenBounds(orbit, minMm, maxMm, widthPx, heightPx, out) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let any = false
  for (let corner = 0; corner < 8; corner += 1) {
    const xMm = corner & 1 ? maxMm[0] : minMm[0]
    const yMm = corner & 2 ? maxMm[1] : minMm[1]
    const zMm = corner & 4 ? maxMm[2] : minMm[2]
    worldToScreen(orbit, xMm, yMm, zMm, widthPx, heightPx, scratchMarqueeCorner)
    if (!scratchMarqueeCorner.visible) continue
    any = true
    if (scratchMarqueeCorner.x < minX) minX = scratchMarqueeCorner.x
    if (scratchMarqueeCorner.x > maxX) maxX = scratchMarqueeCorner.x
    if (scratchMarqueeCorner.y < minY) minY = scratchMarqueeCorner.y
    if (scratchMarqueeCorner.y > maxY) maxY = scratchMarqueeCorner.y
  }
  out.visible = any
  out.minX = any ? minX : 0
  out.minY = any ? minY : 0
  out.maxX = any ? maxX : 0
  out.maxY = any ? maxY : 0
  return out
}

/**
 * Whether a body's projected screen bounds fall inside, or merely overlap,
 * the marquee rectangle.
 *
 * Partial overlap counts as enclosed, matching most CAD/DCC tools' marquee
 * convention — `TODO/ui-024`'s own Testing section states this choice rather
 * than leaving it implicit: a rectangle that clips even a corner of a body
 * selects it, the same forgiving standard ordinary rubber-band selection uses
 * everywhere else. Ordinary axis-aligned rectangle intersection, one edge
 * comparison per side.
 *
 * Takes the `x`/`y`/`width`/`height` shape rather than the full
 * {@link MarqueeRect}, deliberately: `visible` is the caller's own concern
 * (whether a marquee is in progress at all), not a fact this pure geometry
 * test needs to know about.
 *
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {BoxScreenBounds} bounds
 * @returns {boolean}
 */
export function marqueeIntersectsBox(rect, bounds) {
  if (!bounds.visible) return false
  return (
    bounds.minX <= rect.x + rect.width &&
    bounds.maxX >= rect.x &&
    bounds.minY <= rect.y + rect.height &&
    bounds.maxY >= rect.y
  )
}

// --- snap guides (TODO/ui-013) ---------------------------------------------

/**
 * @typedef {object} SnapGuideAnnotation
 * @property {boolean} visible
 * @property {string} axis `"X"` | `"Y"` — the working-plane axis being aligned.
 * @property {string} kind `"center"` | `"edge"` — which feature of the reference
 *   body the line lies on, so the overlay can style them differently.
 * @property {number} x1 CSS pixels from the viewport's left edge.
 * @property {number} y1
 * @property {number} x2
 * @property {number} y2
 */

/**
 * Allocate the two guide annotations once — one per working-plane axis, which is
 * as many as {@link updateSnapGuideAnnotations}'s input can ever produce.
 *
 * @returns {SnapGuideAnnotation[]}
 */
export function createSnapGuideAnnotations() {
  return [0, 1].map((axis) => ({
    visible: false,
    axis: AXIS_LABELS[axis],
    kind: 'edge',
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
  }))
}

// Scratch for the two endpoints of the guide currently being projected.
const scratchGuideA = createScreenPoint()
const scratchGuideB = createScreenPoint()

/**
 * Project the dashed placement guides `src/core/library.js`'s `updateSnap`
 * produced into screen space (`TODO/ui-013`).
 *
 * The guides are genuine world-space lines lying on the working plane — a line
 * of constant X or Y through the reference body's centre or one of its faces — so
 * they are fully perspective-projected through the same {@link worldToScreen}
 * every other overlay uses, exactly like the dimension lines and unlike the
 * screen-constant gizmo. A guide that were only *approximately* projected would
 * appear beside the face it claims to be on, which is the one thing it must not
 * do.
 *
 * Both endpoints have to land in front of the camera. A line with one end behind
 * the viewer has a mathematically valid but mirrored projection, and drawing it
 * would put a guide across the wrong half of the screen; hiding it is the honest
 * picture, matching {@link updateDimensionAnnotation}'s own rule.
 *
 * @param {OrbitCamera} orbit
 * @param {readonly import('../core/library.js').SnapGuide[]} guides
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {SnapGuideAnnotation[]} out Mutated in place; see
 *   {@link createSnapGuideAnnotations}.
 * @returns {SnapGuideAnnotation[]} `out`
 */
export function updateSnapGuideAnnotations(orbit, guides, widthPx, heightPx, out) {
  for (let index = 0; index < out.length; index += 1) {
    const annotation = out[index]
    const guide = guides[index]
    if (!guide || !guide.visible) {
      annotation.visible = false
      continue
    }
    annotation.axis = AXIS_LABELS[guide.axis]
    annotation.kind = guide.kind
    worldToScreen(orbit, guide.x1Mm, guide.y1Mm, guide.zMm, widthPx, heightPx, scratchGuideA)
    worldToScreen(orbit, guide.x2Mm, guide.y2Mm, guide.zMm, widthPx, heightPx, scratchGuideB)
    annotation.visible = scratchGuideA.visible && scratchGuideB.visible
    annotation.x1 = scratchGuideA.x
    annotation.y1 = scratchGuideA.y
    annotation.x2 = scratchGuideB.x
    annotation.y2 = scratchGuideB.y
  }
  return out
}

// --- sketch paths (TODO/sketch-001) ----------------------------------------

/** Scratch for one projected sketch point. */
const scratchSketchPoint = createScreenPoint()

/**
 * @typedef {object} SketchPathAnnotation
 * @property {boolean} visible False when any point falls behind the camera.
 * @property {string} d An SVG path: `M x y L x y … [Z]`, in CSS pixels.
 * @property {number} firstXPx The first point, for anchoring a badge.
 * @property {number} firstYPx
 * @property {number} minXPx Screen bounds of the outline.
 * @property {number} minYPx
 * @property {number} maxXPx
 * @property {number} maxYPx
 */

/** @returns {SketchPathAnnotation} */
export function createSketchPath() {
  return { visible: false, d: '', firstXPx: 0, firstYPx: 0, minXPx: 0, minYPx: 0, maxXPx: 0, maxYPx: 0 }
}

/**
 * Project one sketch outline — in its body's local plane, at a slice offset — onto the
 * screen, as an SVG path.
 *
 * The same one-camera rule as every other overlay here: projected through the orbit state
 * the WebGL frame was drawn with, so an outline stays glued to its plane as the camera
 * moves. The path string is the one allocation, and it is made only while the sketch
 * editor is open and only when the camera or the draft actually changed — the editor
 * suspends orbit, so in practice that is a pan, a zoom or an edit, never a continuous
 * per-frame cost on the ordinary scene.
 *
 * @param {OrbitCamera} orbit
 * @param {readonly number[]} frame Column-major 4×4, sketch-local mm → world mm.
 * @param {readonly (readonly number[])[]} pointsMm `[x, y]` in the sketch plane.
 * @param {number} zMm The slice's offset along the sketch's local Z.
 * @param {boolean} closed Close the path back to its first point.
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {SketchPathAnnotation} out Mutated in place.
 * @returns {SketchPathAnnotation} `out`
 */
export function updateSketchPath(orbit, frame, pointsMm, zMm, closed, widthPx, heightPx, out) {
  let d = ''
  let visible = pointsMm.length > 0
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let index = 0; index < pointsMm.length; index += 1) {
    const x = pointsMm[index][0]
    const y = pointsMm[index][1]
    const worldX = frame[0] * x + frame[4] * y + frame[8] * zMm + frame[12]
    const worldY = frame[1] * x + frame[5] * y + frame[9] * zMm + frame[13]
    const worldZ = frame[2] * x + frame[6] * y + frame[10] * zMm + frame[14]
    worldToScreen(orbit, worldX, worldY, worldZ, widthPx, heightPx, scratchSketchPoint)
    if (!scratchSketchPoint.visible) visible = false
    const px = scratchSketchPoint.x
    const py = scratchSketchPoint.y
    if (index === 0) {
      out.firstXPx = px
      out.firstYPx = py
    }
    d += `${index === 0 ? 'M' : ' L'}${px.toFixed(2)} ${py.toFixed(2)}`
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px > maxX) maxX = px
    if (py > maxY) maxY = py
  }
  if (closed && pointsMm.length > 2) d += ' Z'
  out.d = d
  out.visible = visible
  out.minXPx = minX
  out.minYPx = minY
  out.maxXPx = maxX
  out.maxYPx = maxY
  return out
}

/**
 * Project one point of a sketch plane — sketch-local mm at a slice offset — to screen
 * pixels (`TODO/sketch-002`'s point handles). The same transform {@link updateSketchPath}
 * applies to every point of an outline, so a handle sits exactly on its stroke.
 *
 * @param {OrbitCamera} orbit
 * @param {readonly number[]} frame Column-major 4×4, sketch-local mm → world mm.
 * @param {number} xMm
 * @param {number} yMm
 * @param {number} zMm The slice's offset along the sketch's local Z.
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {ScreenPoint} out Mutated in place.
 * @returns {ScreenPoint} `out`
 */
export function sketchPointToScreen(orbit, frame, xMm, yMm, zMm, widthPx, heightPx, out) {
  const worldX = frame[0] * xMm + frame[4] * yMm + frame[8] * zMm + frame[12]
  const worldY = frame[1] * xMm + frame[5] * yMm + frame[9] * zMm + frame[13]
  const worldZ = frame[2] * xMm + frame[6] * yMm + frame[10] * zMm + frame[14]
  return worldToScreen(orbit, worldX, worldY, worldZ, widthPx, heightPx, out)
}

/**
 * Shortest distance, in pixels, from a point to a **segment** (not the infinite
 * line through it).
 *
 * Screen-space, allocation-free, and the same answer at every zoom level because the
 * tolerance it is compared against is itself in pixels (the same reasoning as
 * `library.js`'s `SNAP_TOLERANCE_PX`).
 *
 * Degenerate case covered on purpose (CLAUDE.md's numerical convention): a
 * zero-length segment measures the distance to its single point rather than
 * dividing by zero.
 *
 * @param {number} px
 * @param {number} py
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number} Pixels, always ≥ 0.
 */
export function distanceToSegmentPx(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1)
  // Clamped to [0, 1]: past either end, the nearest point *on the segment* is
  // that endpoint, not a projection out beyond it.
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
