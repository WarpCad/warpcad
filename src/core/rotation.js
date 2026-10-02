// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Composing rotations, the one place the z-y-x Tait-Bryan arithmetic lives.
 *
 * ## Why this module exists (`TODO/core-004`)
 *
 * A body's carried `rotationDeg` used to be built by **adding** each delta to the
 * previous triple, while the geometry was produced by applying each delta in the
 * world frame on top of the solid — that is, by **composing** them. Rotations do
 * not commute, so the two agreed only for a history of single-axis turns and for
 * one applied X-then-Y-then-Z (which is exactly what `Rz(z)·Ry(y)·Rx(x)` spells
 * out). Any other mixed order and the carried triple described an orientation the
 * solid was not in: the Inspector's Rotation fields lied, a typed absolute
 * rotation landed somewhere else, and `localBoundsOf`'s un-turn missed, so the
 * dimension lines drifted back toward the world-axis shadow `ui-023` had just
 * stopped them reporting.
 *
 * {@link composeDeg} is the fix: build both rotations as matrices, multiply them
 * in the order the kernel actually applies them, and decompose the product back
 * to a triple.
 *
 * ## Why the truth stays three degree numbers, and not a quaternion
 *
 * `TODO/core-004` sketched a second shape — carry a quaternion (or matrix) as the
 * record's truth and derive the display fields from it — and leaned toward it. On
 * reading the code it loses to this one on every axis that matters here:
 *
 *   1. **Its stated advantage is not real in this codebase.** The argument for a
 *      quaternion was that decomposing to Euler angles is ill-conditioned near a
 *      ±90° pitch, so displayed numbers can jump during a smooth drag. But
 *      `ui-012`'s display contract — which the finding explicitly says to keep —
 *      is three degree fields in the Inspector. Under a quaternion those fields
 *      are a decomposition of the quaternion, using this same z-y-x
 *      decomposition, and they jump in exactly the same places by exactly the
 *      same amounts. A quaternion would move where the decomposition happens, not
 *      remove it.
 *   2. **A z-y-x triple is surjective onto SO(3).** Every orientation has an
 *      exact representation as three degrees; the decomposition is non-unique
 *      (several triples name one rotation), which is a different property from
 *      lossy, and a harmless one when every consumer only ever rebuilds the
 *      matrix. The old bug was never "Euler angles cannot say it" — it was
 *      "we added when we should have composed".
 *   3. **Every consumer already speaks this triple, and becomes correct for
 *      free.** `src/core/kernel/group.js`'s `localBoundsOf` un-turns a solid with
 *      three sequential negated rotations, and `src/render/annotate.js` rebuilds
 *      `Rz·Ry·Rx` to map a local corner back into world space. Both are right the
 *      moment the triple is faithful, with no edit. A quaternion would either
 *      leave them on the Euler path (buying nothing for the actual bug) or give
 *      each a quaternion path *plus* a legacy Euler path — two routes through the
 *      same geometry maths, which is the drift `src/core/transform.js`'s own
 *      module header exists to warn about.
 *   4. **It would change the document schema** — `src/core/replay.js`, the NDJSON
 *      round trip and every persisted fixture would need a migration and a
 *      permanent legacy fallback — to buy the benefit point 1 shows is absent.
 *   5. **Accumulation is not a cost here.** A matrix → triple → matrix round trip
 *      is exact to about 1e-15, and it happens **once per committed record**, not
 *      per drag frame: `src/stores/transformPreview.js` previews the delta and a
 *      single record commits on release. Nothing drifts over any realistic
 *      history.
 *
 * What this module *does* take from that second shape is its substance: the
 * carried value is the real composed orientation rather than a running total.
 * Storing it as its exact Euler decomposition instead of a quaternion is a
 * representation choice that costs nothing at this size.
 *
 * ## The one behaviour change to know about
 *
 * Decomposition returns yaw and roll in `(-180, 180]` and pitch in `[-90, 90]`,
 * so the carried triple is now **canonical** rather than cumulative: turning a
 * body 350° and then 20° about Z reads `10`, where the old sum read `370`. Both
 * name the same orientation. The canonical form is what makes a typed absolute
 * rotation and a dragged one comparable at all, so it is the wanted behaviour,
 * but it does mean a ring dragged more than half a turn wraps its sign rather
 * than counting on.
 *
 * Framework-free and dependency-free, per `CLAUDE.md`'s Project Structure: this
 * is plain arithmetic over plain numbers, testable in bare Node. Degrees in,
 * degrees out — radians never cross this module's edge, matching
 * `src/core/kernel/registry.js`'s unit-boundary rule.
 *
 * @module core/rotation
 */

/** @typedef {[number, number, number]} Vec3Deg */
/**
 * A 3×3 rotation matrix, **row-major**: element `(row, col)` is `m[row * 3 + col]`.
 * Row-major because these are only ever read by hand here; `@jscad/modeling`'s
 * own `mat4` is column-major, and {@link matrixFromDeg}'s spec asserts the
 * transposed correspondence between the two so the difference cannot go unnoticed.
 *
 * @typedef {number[]} Mat3
 */

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/**
 * Below this `|cos(pitch)|` the yaw/roll split is a 0/0 — gimbal lock. Not a
 * tolerance on the *answer* (the orientation is still exact either side of it),
 * just the point where the two-angle split has to be made arbitrarily.
 */
const GIMBAL_EPSILON = 1e-9

/**
 * Degrees are rounded to this many decimals on the way out.
 *
 * A composition round trip lands on 44.99999999999999 where it means 45, and
 * that number is shown to a user in an Inspector field — so the noise is snapped
 * off. 1e-9 of a degree is about 1.7e-11 radians: across a 1000 mm part that is
 * a 1.7e-8 mm displacement, which is some nine orders of magnitude below the
 * kernel's own tessellation error. It removes float dust and nothing else.
 */
const DECIMALS = 9
const SNAP = 10 ** DECIMALS

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Vec3Deg}
 */
function requireDegrees(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new Error(
      `rotation: ${label} must be three finite degree values, got ${JSON.stringify(value)}`
    )
  }
  return [value[0], value[1], value[2]]
}

/**
 * Round float dust off a degree value, and normalise `-0` to `0` so a rotation
 * of nothing never renders as `-0°`.
 *
 * @param {number} degrees
 * @returns {number}
 */
function snapDeg(degrees) {
  const rounded = Math.round(degrees * SNAP) / SNAP
  return rounded === 0 ? 0 : rounded
}

/**
 * The rotation matrix a degree triple denotes: `R = Rz(z)·Ry(y)·Rx(x)`, active
 * intrinsic Tait-Bryan in z-y-x order.
 *
 * This is not a convention chosen here — it is the one `@jscad/modeling`'s
 * `transforms.rotate` builds via `mat4.fromTaitBryanRotation`, and therefore the
 * one `src/core/kernel/registry.js`'s `transform.rotate` op actually applies to
 * the solid. `src/core/rotation.spec.js` asserts these nine numbers against that
 * function directly rather than against anything else in this file.
 *
 * @param {readonly number[]} degrees
 * @returns {Mat3}
 */
export function matrixFromDeg(degrees) {
  const [x, y, z] = requireDegrees(degrees, 'a rotation')
  const cx = Math.cos(x * DEG_TO_RAD)
  const sx = Math.sin(x * DEG_TO_RAD)
  const cy = Math.cos(y * DEG_TO_RAD)
  const sy = Math.sin(y * DEG_TO_RAD)
  const cz = Math.cos(z * DEG_TO_RAD)
  const sz = Math.sin(z * DEG_TO_RAD)
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy,     cy * sx,                cy * cx,
  ]
}

/**
 * Recover a z-y-x degree triple from a rotation matrix.
 *
 * Inverts {@link matrixFromDeg}: `pitch = asin(-m20)`, then yaw and roll from the
 * first column and last row. At `|cos(pitch)| ≈ 0` — pitch at ±90°, where the
 * roll and yaw axes have collapsed onto each other — that split is a 0/0, so roll
 * is pinned at zero and yaw absorbs the whole turn. The triple returned there is
 * one of infinitely many that name the orientation; every one of them rebuilds
 * the same matrix, which is all any consumer of the triple asks of it.
 *
 * @param {Mat3} matrix
 * @returns {Vec3Deg} Roll/yaw in `(-180, 180]`, pitch in `[-90, 90]`.
 */
export function degFromMatrix(matrix) {
  const cosPitch = Math.hypot(matrix[0], matrix[3])
  const pitch = Math.atan2(-matrix[6], cosPitch)
  if (cosPitch > GIMBAL_EPSILON) {
    return [
      snapDeg(Math.atan2(matrix[7], matrix[8]) * RAD_TO_DEG),
      snapDeg(pitch * RAD_TO_DEG),
      snapDeg(Math.atan2(matrix[3], matrix[0]) * RAD_TO_DEG),
    ]
  }
  return [0, snapDeg(pitch * RAD_TO_DEG), snapDeg(Math.atan2(-matrix[1], matrix[4]) * RAD_TO_DEG)]
}

/**
 * `left · right` — the rotation that applies `right` first, then `left`.
 *
 * @param {Mat3} left
 * @param {Mat3} right
 * @returns {Mat3}
 */
function multiply(left, right) {
  /** @type {Mat3} */
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0]
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      out[row * 3 + col] =
        left[row * 3] * right[col] +
        left[row * 3 + 1] * right[3 + col] +
        left[row * 3 + 2] * right[6 + col]
    }
  }
  return out
}

/**
 * The transpose, which for a rotation matrix is its inverse.
 *
 * @param {Mat3} matrix
 * @returns {Mat3}
 */
function transpose(matrix) {
  return [
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8],
  ]
}

/**
 * The absolute rotation a body ends up in after `deltaDeg` is applied, in the
 * world frame, to a body currently at `currentDeg`.
 *
 * `R(delta)·R(current)`, in that order, because `transform.rotate` turns the
 * solid it is handed about world axes — the new delta is applied *on top of*
 * whatever the solid already is, so it goes on the left.
 *
 * Bit-exact on the two paths where the old addition was already right — a
 * single-axis history, and one applied X-then-Y-then-Z — because {@link snapDeg}
 * takes the round-trip dust back off. Those are the paths every existing test and
 * every acceptance drive exercises, and they do not move.
 *
 * @param {readonly number[]} deltaDeg Degrees applied now, per world axis.
 * @param {readonly number[]} currentDeg The body's absolute rotation before it.
 * @returns {Vec3Deg} The new absolute rotation.
 */
export function composeDeg(deltaDeg, currentDeg) {
  const delta = requireDegrees(deltaDeg, 'a rotation delta')
  const current = requireDegrees(currentDeg, 'a current rotation')
  // Nothing to compose, and no round trip to snap: the overwhelmingly common
  // case at rest, kept bit-for-bit rather than merely close.
  if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) return current
  if (current[0] === 0 && current[1] === 0 && current[2] === 0) {
    return degFromMatrix(matrixFromDeg(delta))
  }
  return degFromMatrix(multiply(matrixFromDeg(delta), matrixFromDeg(current)))
}

/**
 * The world-frame delta that turns a body at `currentDeg` to `targetDeg` — what
 * a typed absolute Inspector field has to become, expressed as the same kind of
 * delta a ring drag produces.
 *
 * `R(delta) = R(target)·R(current)⁻¹`. Deliberately *not* `target − current`:
 * that was only ever the right answer while the carried triple was a running sum,
 * and it is the second consequence `TODO/core-004` lists — typing an absolute
 * rotation after an out-of-order history landing somewhere other than the typed
 * value.
 *
 * @param {readonly number[]} targetDeg Absolute rotation the user asked for.
 * @param {readonly number[]} currentDeg The body's absolute rotation now.
 * @returns {Vec3Deg}
 */
export function relativeDeg(targetDeg, currentDeg) {
  const target = requireDegrees(targetDeg, 'a target rotation')
  const current = requireDegrees(currentDeg, 'a current rotation')
  if (current[0] === 0 && current[1] === 0 && current[2] === 0) return target
  return degFromMatrix(multiply(matrixFromDeg(target), transpose(matrixFromDeg(current))))
}
