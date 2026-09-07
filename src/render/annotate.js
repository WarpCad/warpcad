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
    })),
    rings: AXIS_LABELS.map((axis) => ({ axis, visible: false, ux: 0, uy: 0, vx: 0, vy: 0 })),
  }
}

/**
 * Floor for the translate arm's screen length, in pixels — `TODO/ui-012`'s own
 * tuned value for a comfortably grabbable handle. A tiny object's gizmo never
 * shrinks below this, even though it grows past it for a large one.
 */
export const GIZMO_ARM_FLOOR_PX = 58

/** Floor for the rotate ring's screen radius, in pixels. Same rationale. */
export const GIZMO_RING_FLOOR_PX = 40

/**
 * How far clear of the body's own on-screen half-diagonal the arm/ring extend,
 * once the body is big enough that the floor stops being the binding
 * constraint. Kept smaller for the ring than the arm so the ring — attached at
 * the same origin — stays inside the translate arms rather than poking past
 * them, matching today's `58 > 40` ordering at every size.
 */
const GIZMO_ARM_CLEARANCE_PX = 16
const GIZMO_RING_CLEARANCE_PX = 8

/**
 * Ceiling on both, so an enormous body's gizmo doesn't grow enough to run off
 * screen.
 */
const GIZMO_ARM_MAX_PX = 220
const GIZMO_RING_MAX_PX = 180

/**
 * Size the transform gizmo's translate arms and rotate rings to clear the
 * selected body's own on-screen silhouette (`TODO/ui-017`), instead of the
 * fixed pixel size `TODO/ui-011` originally drew them at.
 *
 * The body's bounding-box half-diagonal — the same `[minMm, maxMm]` pair
 * `Viewport.vue`'s `syncAnnotations()` already destructures for the dimension
 * lines — is converted to screen pixels via `mmPerPixel` (the same conversion
 * `DimensionLines` uses), then clamped between a floor (today's original
 * 58px/40px, so a tiny object's handles stay exactly as grabbable as
 * `ui-012` tuned them) and a cap (so an enormous body's gizmo can't run off
 * screen).
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
    return { armPx: GIZMO_ARM_FLOOR_PX, ringPx: GIZMO_RING_FLOOR_PX }
  }
  const spanX = maxMm[0] - minMm[0]
  const spanY = maxMm[1] - minMm[1]
  const spanZ = maxMm[2] - minMm[2]
  const halfDiagonalMm = 0.5 * Math.hypot(spanX, spanY, spanZ)
  const halfDiagonalPx = halfDiagonalMm / mmPerPixel

  const armPx = clamp(
    Math.max(GIZMO_ARM_FLOOR_PX, halfDiagonalPx + GIZMO_ARM_CLEARANCE_PX),
    GIZMO_ARM_FLOOR_PX,
    GIZMO_ARM_MAX_PX
  )
  const ringPx = clamp(
    Math.max(GIZMO_RING_FLOOR_PX, halfDiagonalPx + GIZMO_RING_CLEARANCE_PX),
    GIZMO_RING_FLOOR_PX,
    GIZMO_RING_MAX_PX
  )
  return { armPx, ringPx }
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
  const headPx = armPx * 0.26

  for (let axis = 0; axis < 3; axis += 1) {
    const arrow = out.arrows[axis]
    screenDirection(azimuthDeg, elevationDeg, axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0, scratchDir)
    const length = Math.hypot(scratchDir.x, scratchDir.y)
    if (!(length > EPSILON_PX)) {
      // The axis points straight at (or away from) the camera: it has no screen
      // direction at all, so it is hidden rather than drawn as a stub that would
      // read as a fourth, shorter handle.
      arrow.visible = false
      arrow.tipX = out.originX
      arrow.tipY = out.originY
      arrow.h1x = out.originX
      arrow.h1y = out.originY
      arrow.h2x = out.originX
      arrow.h2y = out.originY
    } else {
      const dx = scratchDir.x / length
      const dy = scratchDir.y / length
      arrow.visible = true
      arrow.tipX = out.originX + dx * armPx
      arrow.tipY = out.originY + dy * armPx
      // Base corners sit behind the tip, offset either side of the arm.
      arrow.h1x = arrow.tipX - dx * headPx - dy * headPx * 0.45
      arrow.h1y = arrow.tipY - dy * headPx + dx * headPx * 0.45
      arrow.h2x = arrow.tipX - dx * headPx + dy * headPx * 0.45
      arrow.h2y = arrow.tipY - dy * headPx - dx * headPx * 0.45
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
 * visual weight" — the arms' own heads are `armPx * 0.26`, and rings are
 * already drawn smaller than arms per `ui-017`'s `58 > 40` ordering).
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
 * Whether an axis points toward the camera (`+1`) or away from it (`-1`).
 *
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {number} axisIndex 0 | 1 | 2.
 * @returns {1 | -1}
 */
export function axisFacing(azimuthDeg, elevationDeg, axisIndex) {
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  const cosEl = Math.cos(el)
  // The unit vector from the camera target toward the camera — the same one
  // `worldToScreen` builds its view ray from.
  let toward = Math.sin(el)
  if (axisIndex === 0) toward = cosEl * Math.cos(az)
  else if (axisIndex === 1) toward = cosEl * Math.sin(az)
  return toward >= 0 ? 1 : -1
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
