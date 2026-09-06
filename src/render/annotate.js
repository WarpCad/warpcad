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
 * @property {string} axis `"X"` | `"Y"` | `"Z"`.
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
 * @param {OrbitCamera} orbit
 * @param {readonly number[]} minMm Bounding box minimum, millimetres.
 * @param {readonly number[]} maxMm Bounding box maximum.
 * @param {number} axisIndex 0 | 1 | 2.
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {number} offsetPx How far clear of the solid to draw the line.
 * @param {number} arrowPx Arrowhead length.
 * @param {DimensionAnnotation} out Mutated in place.
 * @returns {DimensionAnnotation} `out`
 */
export function updateDimensionAnnotation(
  orbit,
  minMm,
  maxMm,
  axisIndex,
  widthPx,
  heightPx,
  offsetPx,
  arrowPx,
  out
) {
  out.axis = AXIS_LABELS[axisIndex]
  const lengthMm = maxMm[axisIndex] - minMm[axisIndex]
  out.lengthMm = lengthMm
  out.label = formatMm(lengthMm)

  worldToScreen(
    orbit,
    (minMm[0] + maxMm[0]) / 2,
    (minMm[1] + maxMm[1]) / 2,
    (minMm[2] + maxMm[2]) / 2,
    widthPx,
    heightPx,
    scratchCentre
  )
  if (!scratchCentre.visible) {
    out.visible = false
    return out
  }

  let bestScore = -1
  let found = false
  for (const [pickA, pickB] of EDGE_CORNERS) {
    worldToScreen(
      orbit,
      corner(minMm, maxMm, axisIndex, 0, pickA, pickB, 0),
      corner(minMm, maxMm, axisIndex, 0, pickA, pickB, 1),
      corner(minMm, maxMm, axisIndex, 0, pickA, pickB, 2),
      widthPx,
      heightPx,
      scratchNear
    )
    worldToScreen(
      orbit,
      corner(minMm, maxMm, axisIndex, 1, pickA, pickB, 0),
      corner(minMm, maxMm, axisIndex, 1, pickA, pickB, 1),
      corner(minMm, maxMm, axisIndex, 1, pickA, pickB, 2),
      widthPx,
      heightPx,
      scratchFar
    )
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
