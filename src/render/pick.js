// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Screen → world picking against the working plane.
 *
 * Framework-free on purpose, exactly like `camera.js`: no three.js, no DOM. It
 * reads the same orbit-camera model the renderer and the nav chrome already share,
 * so a drag-placement ghost is positioned from the *same* camera state the frame
 * is drawn with rather than a second, parallel projection that can drift.
 *
 * Conventions per CLAUDE.md: millimetres, Z-up. Every function here names its
 * coordinate space at the boundary — `client` is CSS pixels relative to the
 * viewport, `ndc` is normalised device coordinates in [-1, 1] with +Y up, and the
 * result is millimetres in document space.
 *
 * ## Working plane
 *
 * The plane is Z=0, the grid plane, because at this point in the roadmap there is
 * no other geometry to project against (`docs/decisions/interaction-model-qa.md`
 * control 1). The plane is a parameter rather than a constant so the later task
 * that projects onto an existing face has somewhere to put it, not a rewrite.
 *
 * ## Allocation
 *
 * Everything writes into a caller-supplied vector. CLAUDE.md forbids per-frame
 * allocation in the pointer path, and this runs on every `pointermove` of a drag.
 */

import { rightFromSpherical, upFromSpherical } from './camera.js'

const DEG = Math.PI / 180

/** @typedef {{ x: number, y: number, z: number }} Vec3 */
/** @typedef {{ x: number, y: number }} Vec2 */
/** @typedef {import('./camera.js').OrbitCamera} OrbitCamera */

// Pre-allocated scratch, module-scoped: the pointer path allocates nothing.
const scratchRight = { x: 0, y: 0, z: 0 }
const scratchUp = { x: 0, y: 0, z: 0 }

/**
 * CSS-pixel client coordinates → normalised device coordinates.
 *
 * Screen Y grows downward and NDC Y grows upward, so the vertical axis flips here
 * — the single place that flip happens.
 *
 * @param {number} clientXPx
 * @param {number} clientYPx
 * @param {{ left: number, top: number, width: number, height: number }} rect
 *   The viewport's bounding rect, in CSS pixels.
 * @param {Vec2} out Mutated in place.
 * @returns {Vec2} `out`
 */
export function ndcFromClient(clientXPx, clientYPx, rect, out) {
  out.x = rect.width > 0 ? ((clientXPx - rect.left) / rect.width) * 2 - 1 : 0
  out.y = rect.height > 0 ? -(((clientYPx - rect.top) / rect.height) * 2 - 1) : 0
  return out
}

/**
 * Where a click is raycast again when the exact point finds nothing, in CSS pixels from
 * that point — the exact point first, then a quarter-pixel each way.
 *
 * A ray that lands **exactly** on the edge two triangles share can pass between them:
 * three.js's ray–triangle test is not watertight on a shared edge, so the crack is zero
 * pixels wide but real. Found driving `TODO/core-035`: at Normal resolution a Ø40
 * cylinder's side wall put one of its edges precisely under the canvas's centre ray, and
 * a tap at (195, 205.66) px on a 390 px phone selected nothing, while 0.3 px either side
 * hit it. Finer tessellation means more edges, so more such points. A quarter pixel is
 * far below anything a user can aim at, so a miss that is a miss by a whole pixel is
 * still empty space.
 *
 * @type {readonly (readonly [number, number])[]}
 */
export const PICK_OFFSETS_PX = /** @type {readonly (readonly [number, number])[]} */ (
  Object.freeze(
    [
      [0, 0],
      [0.25, 0],
      [-0.25, 0],
      [0, 0.25],
      [0, -0.25],
    ].map((offset) => Object.freeze(offset))
  )
)

/**
 * True when an NDC point is inside the viewport rather than out over the panels.
 *
 * @param {Vec2} ndc
 * @returns {boolean}
 */
export function ndcIsInside(ndc) {
  return ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1
}

/**
 * Project a screen point onto the working plane, in millimetres.
 *
 * Builds the view ray directly from the camera's spherical state rather than
 * inverting a projection matrix: the ray direction is the forward vector plus the
 * screen-right and screen-up vectors scaled by the NDC position and the field of
 * view, which is the same construction a perspective unprojection performs and
 * needs no matrix, no three.js, and no allocation.
 *
 * @param {OrbitCamera} orbit
 * @param {number} ndcX In [-1, 1], +1 at the right edge.
 * @param {number} ndcY In [-1, 1], +1 at the top edge.
 * @param {number} aspect Viewport width / height.
 * @param {Vec3} out Mutated in place.
 * @param {number} [planeZMm] Working-plane height; the grid plane by default.
 * @returns {Vec3 | null} `out`, or `null` when the ray never meets the plane in
 *   front of the camera (a grazing view, or a plane behind the viewer). A caller
 *   showing a placement ghost must treat `null` as "no valid drop position" rather
 *   than falling back to the origin.
 */
export function projectToWorkingPlane(orbit, ndcX, ndcY, aspect, out, planeZMm = 0) {
  const { azimuthDeg, elevationDeg, distanceMm, target } = orbit.state
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  const cosEl = Math.cos(el)
  const sinEl = Math.sin(el)

  // Unit vector from target toward the camera; the camera looks back along it.
  const dirX = cosEl * Math.cos(az)
  const dirY = cosEl * Math.sin(az)
  const dirZ = sinEl

  const originX = target.x + distanceMm * dirX
  const originY = target.y + distanceMm * dirY
  const originZ = target.z + distanceMm * dirZ

  rightFromSpherical(azimuthDeg, elevationDeg, scratchRight)
  upFromSpherical(azimuthDeg, elevationDeg, scratchUp)

  const tanHalfFov = Math.tan((orbit.fovDeg * DEG) / 2)
  const rightScale = ndcX * tanHalfFov * (aspect > 0 ? aspect : 1)
  const upScale = ndcY * tanHalfFov

  const rayX = -dirX + scratchRight.x * rightScale + scratchUp.x * upScale
  const rayY = -dirY + scratchRight.y * rightScale + scratchUp.y * upScale
  const rayZ = -dirZ + scratchRight.z * rightScale + scratchUp.z * upScale

  // Parallel to the plane (or so near it that the intersection is meaningless).
  if (Math.abs(rayZ) < 1e-9) return null

  const t = (planeZMm - originZ) / rayZ
  // Behind the camera: the plane is there, but not in the direction being looked.
  if (!(t > 0) || !Number.isFinite(t)) return null

  out.x = originX + rayX * t
  out.y = originY + rayY * t
  out.z = planeZMm
  return out
}

/**
 * Project a screen point onto a **sketch slice's plane**, in that sketch's own local
 * millimetres (`TODO/sketch-001`).
 *
 * The generalisation of {@link projectToWorkingPlane} a sketch editor needs: a sketch
 * body may have been moved or turned since it was drawn, so its plane is wherever its
 * frame (`src/core/kernel/sketchFrame.js`) puts it — not necessarily the grid. Same ray,
 * same no-matrix construction; the plane is the frame's local XY at offset `zMm` along
 * its local Z. The frame is rigid, so world → local is a dot product with each axis
 * rather than a matrix inverse.
 *
 * @param {OrbitCamera} orbit
 * @param {number} ndcX
 * @param {number} ndcY
 * @param {number} aspect
 * @param {readonly number[]} frame Column-major 4×4, sketch-local → world.
 * @param {number} zMm The slice's offset along the sketch's local Z.
 * @param {number[]} out `[x, y]`, mutated in place.
 * @returns {number[] | null} `out`, or `null` when the ray never meets the plane in front
 *   of the camera.
 */
export function projectToSketchPlane(orbit, ndcX, ndcY, aspect, frame, zMm, out) {
  const { azimuthDeg, elevationDeg, distanceMm, target } = orbit.state
  const az = azimuthDeg * DEG
  const el = elevationDeg * DEG
  const dirX = Math.cos(el) * Math.cos(az)
  const dirY = Math.cos(el) * Math.sin(az)
  const dirZ = Math.sin(el)
  const originX = target.x + distanceMm * dirX
  const originY = target.y + distanceMm * dirY
  const originZ = target.z + distanceMm * dirZ

  rightFromSpherical(azimuthDeg, elevationDeg, scratchRight)
  upFromSpherical(azimuthDeg, elevationDeg, scratchUp)
  const tanHalfFov = Math.tan((orbit.fovDeg * DEG) / 2)
  const rightScale = ndcX * tanHalfFov * (aspect > 0 ? aspect : 1)
  const upScale = ndcY * tanHalfFov
  const rayX = -dirX + scratchRight.x * rightScale + scratchUp.x * upScale
  const rayY = -dirY + scratchRight.y * rightScale + scratchUp.y * upScale
  const rayZ = -dirZ + scratchRight.z * rightScale + scratchUp.z * upScale

  // The plane: through origin + n·zMm, normal n (the frame's local Z column).
  const nx = frame[8]
  const ny = frame[9]
  const nz = frame[10]
  const planeX = frame[12] + nx * zMm
  const planeY = frame[13] + ny * zMm
  const planeZ = frame[14] + nz * zMm
  const denominator = rayX * nx + rayY * ny + rayZ * nz
  if (Math.abs(denominator) < 1e-9) return null
  const t = ((planeX - originX) * nx + (planeY - originY) * ny + (planeZ - originZ) * nz) / denominator
  if (!(t > 0) || !Number.isFinite(t)) return null

  const relX = originX + rayX * t - frame[12]
  const relY = originY + rayY * t - frame[13]
  const relZ = originZ + rayZ * t - frame[14]
  out[0] = relX * frame[0] + relY * frame[1] + relZ * frame[2]
  out[1] = relX * frame[4] + relY * frame[5] + relZ * frame[6]
  return out
}

/**
 * @typedef {object} PlacementNeighbour
 * @property {readonly number[]} centroidMm The body's bounding-box centre, in
 *   document millimetres (`centroidOf` in `src/core/kernel/group.js`).
 */

/**
 * Which existing body a placement drag should snap against: the one whose
 * centroid is nearest the ghost's projected position (`TODO/ui-013`,
 * `Initial design.md` §7a's "closest item ... when >1 item is in the scene").
 *
 * ## Which distance, said out loud
 *
 * **World-space, and measured in the working plane** — the XY millimetre
 * distance from the projected drop point to each candidate's centroid — not
 * screen-space, and not a full 3D distance. Two reasons, both worth stating
 * rather than leaving to be re-derived:
 *
 * - *Not screen-space*: the drop point is already millimetres on the plane, so a
 *   world-space test needs no projection per candidate per `pointermove`, and it
 *   cannot change its answer when the user orbits without moving the pointer.
 * - *Not 3D*: a drag places on the plane and carries no height, so a tall body
 *   would otherwise measure as "further away" purely for being tall, and the
 *   nearest item under the pointer would lose to a shorter one beside it.
 *
 * Allocation-free and index-returning rather than item-returning, because this
 * runs on every `pointermove` of a drag (CLAUDE.md's Performance rule).
 *
 * @param {readonly PlacementNeighbour[]} items The bodies already in the scene.
 * @param {number} xMm The ghost's projected position on the working plane.
 * @param {number} yMm
 * @returns {number} Index into `items`, or `-1` when there is nothing to snap to
 *   — an empty scene, which is `ui-013`'s own stated precondition for behaving
 *   exactly as `ui-010` already did.
 */
export function nearestOnPlane(items, xMm, yMm) {
  let bestIndex = -1
  let bestSquaredMm = Infinity
  for (let index = 0; index < items.length; index += 1) {
    const centroid = items[index].centroidMm
    const dx = centroid[0] - xMm
    const dy = centroid[1] - yMm
    const squared = dx * dx + dy * dy
    // Strictly less, so an exact tie keeps the earlier body — deterministic
    // rather than dependent on iteration order.
    if (!(squared < bestSquaredMm)) continue
    bestSquaredMm = squared
    bestIndex = index
  }
  return bestIndex
}
