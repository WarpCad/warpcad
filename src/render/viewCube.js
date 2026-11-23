// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The view cube's geometry (`TODO/ui-158`): which faces of the orientation cube look at the viewer,
 * and where each face lands on screen, from the orbit camera's azimuth and elevation.
 *
 * Framework-free, like `camera.js`, whose basis it reuses instead of re-deriving the Z-up signs
 * (WarpCad1's `render-008` was exactly that slip: its cube turned *with* the camera, not against it).
 * A world direction `v` lands at CSS screen `(R·v, −U·v)` (CSS y grows down) with depth `C·v`, where
 * R, U and C are `rightFromSpherical`, `upFromSpherical` and the unit to-camera vector. So the cube
 * matrix's rows are R, −U and C.
 *
 * The cube is drawn orthographically, like the WarpCad1 cube the owner liked, so no perspective
 * divide: each face is a flat 2D affine image of a square, and `faceTransforms` gives that affine
 * directly. The component applies it as a plain CSS `matrix()` on each face button, which keeps hit
 * testing to the browser's ordinary 2D path on every engine (no `preserve-3d` context to disagree
 * about).
 *
 * Every function writes into caller-owned typed arrays: the cube re-projects on every orbit frame,
 * and CLAUDE.md's performance rule forbids allocation there.
 */

import { positionFromSpherical, rightFromSpherical, upFromSpherical } from './camera.js'

/** @typedef {'right' | 'left' | 'back' | 'front' | 'top' | 'bottom'} CubeFaceView */

/**
 * @typedef {object} CubeFace
 * @property {CubeFaceView} view the standard view the face snaps to; the camera sits on `normal` there
 * @property {ReadonlyArray<number>} normal outward unit normal, world (Z-up)
 * @property {ReadonlyArray<number>} u the face's local +x (CSS right) in world
 * @property {ReadonlyArray<number>} w the face's local +y (CSS down) in world
 * @property {string} name the face's short name, as the Views grid prints it
 * @property {'x' | 'y' | 'z'} axis the world axis the face sits on, which picks its tint (`--axis-x/-y/-z`)
 * @property {string} axisLabel the signed axis of the camera side, as printed on the face (`+Z`, `−Y`)
 * @property {string} title the face button's title and accessible name
 */

/**
 * The six faces, in WarpCad1's order (right, left, back, front, top, bottom). Side faces hang with
 * local down along world −Z; Top is laid out as seen from above (+Y up the screen), Bottom as seen
 * from below.
 * @type {ReadonlyArray<CubeFace>}
 */
export const VIEW_CUBE_FACES = Object.freeze([
  Object.freeze({ view: 'right', normal: [1, 0, 0], u: [0, 1, 0], w: [0, 0, -1], name: 'Right', axis: 'x', axisLabel: '+X', title: 'Right view (camera on +X)' }),
  Object.freeze({ view: 'left', normal: [-1, 0, 0], u: [0, -1, 0], w: [0, 0, -1], name: 'Left', axis: 'x', axisLabel: '−X', title: 'Left view (camera on −X)' }),
  Object.freeze({ view: 'back', normal: [0, 1, 0], u: [-1, 0, 0], w: [0, 0, -1], name: 'Back', axis: 'y', axisLabel: '+Y', title: 'Back view (camera on +Y)' }),
  Object.freeze({ view: 'front', normal: [0, -1, 0], u: [1, 0, 0], w: [0, 0, -1], name: 'Front', axis: 'y', axisLabel: '−Y', title: 'Front view (camera on −Y)' }),
  Object.freeze({ view: 'top', normal: [0, 0, 1], u: [1, 0, 0], w: [0, -1, 0], name: 'Top', axis: 'z', axisLabel: '+Z', title: 'Top view (looking straight down Z)' }),
  Object.freeze({ view: 'bottom', normal: [0, 0, -1], u: [1, 0, 0], w: [0, 1, 0], name: 'Bottom', axis: 'z', axisLabel: '−Z', title: 'Bottom view (camera on −Z)' }),
])

/**
 * A face is facing only when its depth exceeds this. At a pole, `cos(90°)` leaves the four side faces
 * at about 6e-17 rather than 0; they are edge-on and must not take a pointer.
 */
export const FACING_EPSILON = 1e-9

const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 })
/** Module scratch, so no call allocates. */
const right = { x: 0, y: 0, z: 0 }
const up = { x: 0, y: 0, z: 0 }
const toCamera = { x: 0, y: 0, z: 0 }

/** @param {number} az @param {number} el */
function basis(az, el) {
  rightFromSpherical(az, el, right)
  upFromSpherical(az, el, up)
  positionFromSpherical(az, el, 1, ORIGIN, toCamera)
}

/**
 * Whether a face depth from `facingFaces` means the face looks at the viewer.
 * @param {number} depth
 * @returns {boolean}
 */
export function isFacing(depth) {
  return depth > FACING_EPSILON
}

/**
 * The world-to-screen linear map of the cube, row-major 3×3: rows R, −U, C, so `M·v` is a world
 * direction's CSS screen x, CSS screen y (down) and depth toward the viewer.
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {Float64Array} out length 9, written in place
 * @returns {Float64Array} `out`
 */
export function cubeMatrix(azimuthDeg, elevationDeg, out) {
  basis(azimuthDeg, elevationDeg)
  out[0] = right.x
  out[1] = right.y
  out[2] = right.z
  out[3] = -up.x
  out[4] = -up.y
  out[5] = -up.z
  out[6] = toCamera.x
  out[7] = toCamera.y
  out[8] = toCamera.z
  return out
}

/**
 * Each face's depth toward the viewer (`C·n`), in `VIEW_CUBE_FACES` order. Positive means it faces
 * the camera; test with `isFacing`, not `> 0`.
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {Float64Array} out length 6, written in place
 * @returns {Float64Array} `out`
 */
export function facingFaces(azimuthDeg, elevationDeg, out) {
  positionFromSpherical(azimuthDeg, elevationDeg, 1, ORIGIN, toCamera)
  for (let i = 0; i < 6; i++) {
    const n = VIEW_CUBE_FACES[i].normal
    out[i] = n[0] * toCamera.x + n[1] * toCamera.y + n[2] * toCamera.z
  }
  return out
}

/**
 * Each face's 2D screen affine, six numbers per face in `VIEW_CUBE_FACES` order: `[a, b, c, d, tx, ty]`
 * as CSS `matrix(a, b, c, d, …)` takes them, so a point `(x, y)` on the face (in side lengths from the
 * face's centre, CSS y down) lands at `(a·x + c·y + tx, b·x + d·y + ty)` side lengths from the cube's
 * centre on screen. `tx` and `ty` are in side lengths, so the caller multiplies them by the cube's side
 * in px; the linear part is unitless.
 * @param {number} azimuthDeg
 * @param {number} elevationDeg
 * @param {Float64Array} out length 36, written in place
 * @returns {Float64Array} `out`
 */
export function faceTransforms(azimuthDeg, elevationDeg, out) {
  basis(azimuthDeg, elevationDeg)
  for (let i = 0; i < 6; i++) {
    const { normal: n, u, w } = VIEW_CUBE_FACES[i]
    const k = i * 6
    out[k] = right.x * u[0] + right.y * u[1] + right.z * u[2]
    out[k + 1] = -(up.x * u[0] + up.y * u[1] + up.z * u[2])
    out[k + 2] = right.x * w[0] + right.y * w[1] + right.z * w[2]
    out[k + 3] = -(up.x * w[0] + up.y * w[1] + up.z * w[2])
    out[k + 4] = 0.5 * (right.x * n[0] + right.y * n[1] + right.z * n[2])
    out[k + 5] = -0.5 * (up.x * n[0] + up.y * n[1] + up.z * n[2])
  }
  return out
}
