/**
 * Where a sketch body's own plane is now (`TODO/sketch-001`).
 *
 * A `primitive.sketch` is drawn in its **local** XY plane, with its origin at the
 * creation record's `center`. Moving or turning the body afterwards appends
 * `transform.translate` / `transform.rotate` records, and the slices must move with it:
 * re-opening Edit sketch on a turned body has to show the outlines on the turned plane,
 * and a pointer has to land in sketch millimetres on that plane.
 *
 * The frame is therefore the composition of exactly what the kernel did to the solid:
 * `translate(center)`, then each later transform record in lineage order, using the same
 * maths the registry's `transform.*` entries use (`@jscad/modeling`'s `mat4`, a rotate
 * about the record's own `center`). Records that do not move the body — a recolour, a
 * fillet, an in-place param edit — leave it alone.
 *
 * Lives in `src/core/kernel/` because it talks to `@jscad/modeling` directly, which only
 * this directory may do (CLAUDE.md's Project Structure).
 *
 * Matrices are column-major 16-number arrays — `@jscad/modeling`'s and three.js's shared
 * layout — so the render side can hand one straight to `Matrix4.fromArray`.
 *
 * @module core/kernel/sketchFrame
 */

import modeling from '@jscad/modeling'

const { mat4, vec3 } = modeling.maths

/** @typedef {import('./registry.js').OpRecord} OpRecord */
/** @typedef {number[]} FrameMatrix Column-major 4×4, sketch-local mm → world mm. */

/** @param {number} degrees */
function degToRad(degrees) {
  return (degrees * Math.PI) / 180
}

/** @param {unknown} value @returns {value is [number, number, number]} */
function isVec3(value) {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

/**
 * The frame of a sketch body, from its lineage (root first, as `document.lineageOf`
 * returns it).
 *
 * @param {readonly OpRecord[]} lineage
 * @returns {FrameMatrix}
 */
export function sketchFrameOf(lineage) {
  const [root] = lineage
  /** @type {[number, number, number]} */
  const center = isVec3(root?.params?.center) ? root.params.center : [0, 0, 0]
  let frame = mat4.fromTranslation(mat4.create(), center)
  for (const record of lineage.slice(1)) {
    if (record.op === 'transform.translate' && isVec3(record.params?.vector)) {
      frame = mat4.multiply(mat4.create(), mat4.fromTranslation(mat4.create(), record.params.vector), frame)
    } else if (record.op === 'transform.rotate' && isVec3(record.params?.angles)) {
      const [x, y, z] = record.params.angles
      /** @type {[number, number, number]} */
      const pivot = isVec3(record.params?.center) ? record.params.center : [0, 0, 0]
      // Exactly the registry's `transform.rotate`: to the pivot, turn, and back.
      const turn = mat4.fromTaitBryanRotation(mat4.create(), degToRad(z), degToRad(y), degToRad(x))
      const toPivot = mat4.fromTranslation(mat4.create(), [-pivot[0], -pivot[1], -pivot[2]])
      const back = mat4.fromTranslation(mat4.create(), pivot)
      frame = mat4.multiply(mat4.create(), back, mat4.multiply(mat4.create(), turn, mat4.multiply(mat4.create(), toPivot, frame)))
    }
  }
  return Array.from(frame)
}

/**
 * A sketch-local point in world millimetres.
 *
 * @param {readonly number[]} frame
 * @param {readonly number[]} localMm `[x, y, z]`, z being a slice offset.
 * @returns {[number, number, number]}
 */
export function frameApply(frame, localMm) {
  const out = vec3.transform(vec3.create(), /** @type {any} */ (localMm), /** @type {any} */ (frame))
  return [out[0], out[1], out[2]]
}

/**
 * A world point back in sketch-local millimetres.
 *
 * @param {readonly number[]} frame
 * @param {readonly number[]} worldMm
 * @returns {[number, number, number]}
 */
export function frameInverseApply(frame, worldMm) {
  const inverse = /** @type {any} */ (mat4).invert(mat4.create(), /** @type {any} */ (frame))
  const out = vec3.transform(vec3.create(), /** @type {any} */ (worldMm), inverse)
  return [out[0], out[1], out[2]]
}

/**
 * The frame of a sketch that has not been committed yet: its origin is the drop point.
 *
 * @param {readonly number[]} originMm
 * @returns {FrameMatrix}
 */
export function frameAtOrigin(originMm) {
  return Array.from(mat4.fromTranslation(mat4.create(), /** @type {any} */ ([originMm[0], originMm[1], originMm[2] ?? 0])))
}
