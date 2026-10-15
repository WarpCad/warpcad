// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Generated STL fixtures for specs (`TODO/io-009`): built triangle by triangle, so a spec
 * knows exactly what it hands the parser. No third-party model is used anywhere.
 */

/** @typedef {[number, number, number]} Vec3 */
/** @typedef {[Vec3, Vec3, Vec3]} Triangle */

/**
 * A box's twelve triangles, wound counter-clockwise seen from outside (STL's convention and
 * the kernel's).
 *
 * @param {Vec3} size
 * @param {Vec3} [origin] The minimum corner.
 * @returns {Triangle[]}
 */
export function boxTriangles(size, origin = [0, 0, 0]) {
  /** @type {[number, number, number][][]} */
  const unit = [
    [[0, 0, 0], [0, 1, 0], [1, 1, 0]], [[0, 0, 0], [1, 1, 0], [1, 0, 0]], // -z
    [[0, 0, 1], [1, 0, 1], [1, 1, 1]], [[0, 0, 1], [1, 1, 1], [0, 1, 1]], // +z
    [[0, 0, 0], [1, 0, 0], [1, 0, 1]], [[0, 0, 0], [1, 0, 1], [0, 0, 1]], // -y
    [[0, 1, 0], [0, 1, 1], [1, 1, 1]], [[0, 1, 0], [1, 1, 1], [1, 1, 0]], // +y
    [[0, 0, 0], [0, 0, 1], [0, 1, 1]], [[0, 0, 0], [0, 1, 1], [0, 1, 0]], // -x
    [[1, 0, 0], [1, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1], [1, 0, 1]], // +x
  ]
  return /** @type {Triangle[]} */ (
    unit.map((triangle) =>
      triangle.map((corner) => /** @type {Vec3} */ ([0, 1, 2].map((axis) => origin[axis] + corner[axis] * size[axis]))),
    )
  )
}

/**
 * A cube's twelve triangles.
 *
 * @param {number} [size]
 * @param {Vec3} [origin] The minimum corner.
 * @returns {Triangle[]}
 */
export function cubeTriangles(size = 10, origin = [0, 0, 0]) {
  return boxTriangles([size, size, size], origin)
}

/**
 * A flat N × N grid of squares in the plane z = `z`, two triangles each — an open surface
 * with many shared vertices, for size and weld tests.
 *
 * @param {number} n Squares per side.
 * @param {number} [step]
 * @param {number} [z]
 * @returns {Triangle[]}
 */
export function gridTriangles(n, step = 1, z = 0) {
  /** @type {Triangle[]} */
  const out = []
  for (let row = 0; row < n; row += 1) {
    for (let col = 0; col < n; col += 1) {
      const x0 = col * step
      const y0 = row * step
      const x1 = x0 + step
      const y1 = y0 + step
      out.push([[x0, y0, z], [x1, y0, z], [x1, y1, z]], [[x0, y0, z], [x1, y1, z], [x0, y1, z]])
    }
  }
  return out
}

/**
 * A binary STL: 80-byte header, little-endian triangle count, 50 bytes per triangle.
 *
 * @param {readonly Triangle[]} triangles
 * @param {{ header?: string, count?: number }} [options] `count` overrides the header's
 *   triangle count (a lying header); `header` is written as ASCII into the first 80 bytes.
 * @returns {Uint8Array}
 */
export function binaryStl(triangles, options = {}) {
  const bytes = new Uint8Array(84 + 50 * triangles.length)
  const view = new DataView(bytes.buffer)
  const header = options.header ?? 'binary fixture'
  for (let index = 0; index < Math.min(80, header.length); index += 1) bytes[index] = header.charCodeAt(index)
  view.setUint32(80, options.count ?? triangles.length, true)
  triangles.forEach((triangle, index) => {
    const at = 84 + 50 * index
    // Normal left zero: readers recompute it from the winding, as this one does.
    triangle.forEach((corner, cornerIndex) => {
      corner.forEach((value, axis) => view.setFloat32(at + 12 + cornerIndex * 12 + axis * 4, value, true))
    })
  })
  return bytes
}

/**
 * An ASCII STL.
 *
 * @param {readonly Triangle[]} triangles
 * @param {{ name?: string, format?: (value: number) => string, eol?: string }} [options]
 * @returns {Uint8Array}
 */
export function asciiStl(triangles, options = {}) {
  const format = options.format ?? ((value) => String(value))
  const eol = options.eol ?? '\n'
  const name = options.name ?? 'fixture'
  const lines = [`solid ${name}`]
  for (const triangle of triangles) {
    lines.push('  facet normal 0 0 0', '    outer loop')
    for (const corner of triangle) lines.push(`      vertex ${corner.map(format).join(' ')}`)
    lines.push('    endloop', '  endfacet')
  }
  lines.push(`endsolid ${name}`)
  return asciiBytes(lines.join(eol) + eol)
}

/**
 * @param {string} text ASCII only.
 * @returns {Uint8Array}
 */
export function asciiBytes(text) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0))
}
