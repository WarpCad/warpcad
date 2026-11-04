// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The placement an imported part's mesh carries (`TODO/io-024`): a 4 × 4 affine matrix in
 * **JSCAD `mat4` order** (column-major, translation in entries 12-14), holding millimetres, applied
 * after the record's `unitScale`.
 *
 * 3MF writes a placement as twelve numbers `m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32`, for
 * row vectors (`[x y z 1] × M`). That maps onto `mat4` order directly —
 * `[m00,m01,m02,0, m10,m11,m12,0, m20,m21,m22,0, m30,m31,m32,1]` — because a column-major matrix
 * applied to a column vector is the same arithmetic as a row-major one applied to a row vector.
 *
 * The matrix arrives in shared part files, so {@link matrixProblem} is the one check the part
 * validator (`src/core/userPart.js`) and the kernel (`import.mesh`) both run: 16 finite numbers,
 * affine, non-singular, bounded.
 *
 * Framework-free and pure.
 *
 * @module io/meshMatrix
 */

/** @typedef {readonly number[]} Matrix16 */

/** The bounds {@link matrixProblem} enforces, in one place. */
export const MATRIX_LIMITS = Object.freeze({
  /** No entry of the 3 × 3 part may exceed ± this (a scale factor). */
  maxLinear: 1e3,
  /** No translation may reach beyond ± this many millimetres. */
  maxTranslation: 1e6,
  /** The 3 × 3 part's determinant must be at least this large in magnitude. */
  minDeterminant: 1e-9,
})

/** @type {Matrix16} */
export const IDENTITY_MATRIX = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/**
 * A 3MF placement's twelve numbers as a 16-number matrix.
 *
 * @param {ArrayLike<number>} twelve
 * @returns {number[]}
 */
export function matrixFromThreeMf(twelve) {
  const t = twelve
  return [t[0], t[1], t[2], 0, t[3], t[4], t[5], 0, t[6], t[7], t[8], 0, t[9], t[10], t[11], 1]
}

/**
 * `outer ∘ inner`: the matrix that applies `inner` first, then `outer`.
 *
 * @param {Matrix16} outer
 * @param {Matrix16} inner
 * @returns {number[]}
 */
export function multiplyMatrices(outer, inner) {
  const out = new Array(16)
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0
      for (let k = 0; k < 4; k += 1) sum += outer[k * 4 + row] * inner[column * 4 + k]
      out[column * 4 + row] = sum
    }
  }
  return out
}

/**
 * A point moved by an affine matrix.
 *
 * @param {Matrix16} m
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {[number, number, number]}
 */
export function transformPoint(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]
}

/**
 * The determinant of the matrix's 3 × 3 part: negative for a mirror, which must reverse a
 * triangle's winding to keep its normal pointing out.
 *
 * @param {Matrix16} m
 * @returns {number}
 */
export function linearDeterminant(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2])
}

/**
 * The matrix with `(dx, dy, dz)` added to its translation: moved after everything else it does.
 *
 * @param {Matrix16} m
 * @param {number} dx
 * @param {number} dy
 * @param {number} dz
 * @returns {number[]}
 */
export function withTranslation(m, dx, dy, dz) {
  const out = [...m]
  out[12] += dx
  out[13] += dy
  out[14] += dz
  return out
}

/**
 * Whether a matrix is the identity, exactly.
 *
 * @param {Matrix16} m
 * @returns {boolean}
 */
export function isIdentityMatrix(m) {
  for (let index = 0; index < 16; index += 1) if (m[index] !== IDENTITY_MATRIX[index]) return false
  return true
}

/**
 * What is wrong with a stored placement matrix, or `null`. Never throws.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
export function matrixProblem(value) {
  if (!Array.isArray(value) || value.length !== 16) return 'matrix must be a list of 16 numbers'
  for (const entry of value) {
    if (typeof entry !== 'number' || !Number.isFinite(entry)) return 'matrix must hold only finite numbers'
  }
  if (value[3] !== 0 || value[7] !== 0 || value[11] !== 0 || value[15] !== 1) {
    return 'matrix must be affine (its last row 0, 0, 0, 1)'
  }
  for (const index of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
    if (Math.abs(value[index]) > MATRIX_LIMITS.maxLinear) return `matrix scale is beyond ±${MATRIX_LIMITS.maxLinear}`
  }
  for (const index of [12, 13, 14]) {
    if (Math.abs(value[index]) > MATRIX_LIMITS.maxTranslation) return `matrix translation is beyond ±${MATRIX_LIMITS.maxTranslation} mm`
  }
  if (!(Math.abs(linearDeterminant(value)) >= MATRIX_LIMITS.minDeterminant)) {
    return 'matrix is singular: it would flatten the part'
  }
  return null
}

/** @typedef {{ min: [number, number, number], max: [number, number, number] }} PlacedBounds */

/**
 * Grow `bounds` by a mesh's vertices, scaled to millimetres and then moved by `matrix`.
 *
 * @param {PlacedBounds} bounds Updated in place.
 * @param {ArrayLike<number>} positions `x, y, z` per vertex, in file units.
 * @param {number} unitScale Millimetres per file unit.
 * @param {Matrix16 | null} matrix In millimetres; `null` for none.
 * @returns {PlacedBounds}
 */
export function growPlacedBounds(bounds, positions, unitScale, matrix) {
  const { min, max } = bounds
  const m = matrix ?? IDENTITY_MATRIX
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] * unitScale
    const y = positions[index + 1] * unitScale
    const z = positions[index + 2] * unitScale
    const px = m[0] * x + m[4] * y + m[8] * z + m[12]
    const py = m[1] * x + m[5] * y + m[9] * z + m[13]
    const pz = m[2] * x + m[6] * y + m[10] * z + m[14]
    if (px < min[0]) min[0] = px
    if (px > max[0]) max[0] = px
    if (py < min[1]) min[1] = py
    if (py > max[1]) max[1] = py
    if (pz < min[2]) min[2] = pz
    if (pz > max[2]) max[2] = pz
  }
  return bounds
}

/** @returns {PlacedBounds} Empty bounds to grow. */
export function emptyPlacedBounds() {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
}

/**
 * The move that centres `bounds` in X and Y and puts its lowest point on Z = 0 — the same rule
 * `import.mesh`'s `recenter` applies to one mesh, applied once to a whole assembly.
 *
 * @param {PlacedBounds} bounds
 * @returns {[number, number, number]}
 */
export function groundOffset(bounds) {
  return [-(bounds.min[0] + bounds.max[0]) / 2 + 0, -(bounds.min[1] + bounds.max[1]) / 2 + 0, -bounds.min[2] + 0]
}
