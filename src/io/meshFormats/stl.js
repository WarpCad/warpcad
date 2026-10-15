// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The STL parser (`TODO/io-009`): binary or ASCII bytes to `{ positions, indices }`, hand-
 * rolled so every line that touches attacker-controlled bytes is code this project has read
 * (`docs/decisions/mesh-import.md` has the comparison that chose this over
 * `@jscad/stl-deserializer` and three.js's `STLLoader`).
 *
 * ## The one rule that matters
 *
 * A binary STL's triangle count is a uint32 in its header that anyone can set. So the
 * **length equation is checked first**: a binary file is exactly `80 + 4 + 50·n` bytes, and
 * nothing is allocated for `n` triangles until that holds and `n` is under the cap. That one
 * check also settles the classic sniffing trap — many exporters write `solid` at the start
 * of a *binary* header — because a file that satisfies the equation is binary whatever its
 * header says, and only a file that does not is tried as ASCII.
 *
 * ## ASCII without unbounded reads
 *
 * The ASCII reader walks the bytes once with a tokenizer: no `split`, no regex over the whole
 * file, a cap on token length and on token count, and a grammar that refuses the first token
 * out of place. Facet normals are read past, not trusted — they are recomputed from the
 * winding downstream, as every reader does (and many writers emit `0 0 0` or `nan` there).
 *
 * Pure and framework-free. Never throws: every refusal is `{ ok: false, reason }`, worded for
 * the Library's inline error ("Not a valid STL: …", "Too many triangles: …").
 *
 * @module io/meshFormats/stl
 */

import { MESH_LIMITS, formatCount, tooManyTriangles } from '../meshAsset.js'

/**
 * @typedef {{ ok: true, format: 'binary' | 'ascii', positions: Float32Array, indices: Uint32Array, triangleCount: number }
 *   | { ok: false, reason: string }} StlParseResult
 */

const HEADER_BYTES = 80
const TRIANGLE_BYTES = 50
const INVALID = 'Not a valid STL'
const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
const NON_FINITE_PATTERN = /^[+-]?(?:nan|inf|infinity)$/i

/** `12,408` / `1.2 M` — how a triangle count reads in the Library's messages. */
export const formatTriangleCount = formatCount

/** @param {string} detail @returns {{ ok: false, reason: string }} */
function invalid(detail) {
  return { ok: false, reason: `${INVALID}: ${detail}` }
}

/**
 * Which kind of STL these bytes are, by content — never by file name.
 *
 * @param {Uint8Array} bytes
 * @returns {'binary' | 'ascii' | null} `null` when it is neither.
 */
export function sniffStl(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return null
  if (bytes.length >= HEADER_BYTES + 4) {
    const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(HEADER_BYTES, true)
    if (HEADER_BYTES + 4 + TRIANGLE_BYTES * count === bytes.length) return 'binary'
  }
  let at = 0
  while (at < bytes.length && at < 1024 && isSpace(bytes[at])) at += 1
  if (startsWithWord(bytes, at, 'solid')) return 'ascii'
  return bytes.length >= HEADER_BYTES + 4 ? 'binary' : null
}

/**
 * Parse an STL file. Never throws.
 *
 * @param {Uint8Array} bytes The whole file.
 * @param {import('../meshAsset.js').MeshLimits} [limits]
 * @returns {StlParseResult}
 */
export function parseStl(bytes, limits = MESH_LIMITS) {
  try {
    if (!(bytes instanceof Uint8Array)) return invalid('nothing was read')
    if (bytes.length === 0) return invalid('the file is empty')
    if (bytes.length > limits.maxFileBytes) {
      return { ok: false, reason: `That file is larger than ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB` }
    }
    const kind = sniffStl(bytes)
    if (kind === 'binary') return parseBinary(bytes, limits)
    if (kind === 'ascii') return parseAscii(bytes, limits)
    return invalid('it is neither a binary STL nor text that starts with "solid"')
  } catch (error) {
    return invalid(`it could not be read (${error instanceof Error ? error.message : 'unknown error'})`)
  }
}

/**
 * @param {Uint8Array} bytes
 * @param {import('../meshAsset.js').MeshLimits} limits
 * @returns {StlParseResult}
 */
function parseBinary(bytes, limits) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(HEADER_BYTES, true)
  // The equation, before anything is sized by `count`.
  const room = Math.max(0, Math.floor((bytes.length - HEADER_BYTES - 4) / TRIANGLE_BYTES))
  if (HEADER_BYTES + 4 + TRIANGLE_BYTES * count !== bytes.length) {
    return invalid(
      `the header says ${groupDigits(count)} triangles but the file holds room for ${groupDigits(room)}` +
        ' (it may be truncated)'
    )
  }
  if (count === 0) return invalid('the file has no triangles')
  if (count > limits.maxTriangles) return { ok: false, reason: tooManyTriangles(count, limits.maxTriangles) }

  const positions = new Float32Array(count * 9)
  for (let triangle = 0; triangle < count; triangle += 1) {
    // 12 bytes of normal, ignored; 3 × 3 float32 corners; a 2-byte attribute, ignored.
    const at = HEADER_BYTES + 4 + triangle * TRIANGLE_BYTES + 12
    for (let index = 0; index < 9; index += 1) {
      const value = view.getFloat32(at + index * 4, true)
      const problem = coordinateProblem(value, limits)
      if (problem !== null) return problem
      positions[triangle * 9 + index] = value
    }
  }
  return { ok: true, format: 'binary', positions, indices: sequence(count * 3), triangleCount: count }
}

/**
 * @param {number} value
 * @param {import('../meshAsset.js').MeshLimits} limits
 * @returns {{ ok: false, reason: string } | null}
 */
function coordinateProblem(value, limits) {
  if (!Number.isFinite(value)) return invalid('a coordinate is not a finite number')
  if (value > limits.maxAbsCoordinate || value < -limits.maxAbsCoordinate) {
    return invalid(`a coordinate is beyond ±${formatCount(limits.maxAbsCoordinate)}`)
  }
  return null
}

/**
 * `4,294,967,295` — a count in full, so a lying header reads as the number it claims.
 *
 * @param {number} count
 * @returns {string}
 */
function groupDigits(count) {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** @param {number} length @returns {Uint32Array} */
function sequence(length) {
  const indices = new Uint32Array(length)
  for (let index = 0; index < length; index += 1) indices[index] = index
  return indices
}

// --- ASCII -------------------------------------------------------------------------------

/** @param {number} byte */
function isSpace(byte) {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x0b || byte === 0x0c
}

/**
 * @param {Uint8Array} bytes
 * @param {number} at
 * @param {string} word Lowercase ASCII.
 */
function startsWithWord(bytes, at, word) {
  if (at + word.length > bytes.length) return false
  for (let index = 0; index < word.length; index += 1) {
    if ((bytes[at + index] | 0x20) !== word.charCodeAt(index)) return false
  }
  return at + word.length === bytes.length || isSpace(bytes[at + word.length])
}

/**
 * A one-pass tokenizer over ASCII bytes, bounded in token length and count.
 */
class Tokens {
  /**
   * @param {Uint8Array} bytes
   * @param {import('../meshAsset.js').MeshLimits} limits
   */
  constructor(bytes, limits) {
    this.bytes = bytes
    this.limits = limits
    this.at = 0
    this.count = 0
    /** @type {string | null} Set when a limit is hit; the parse reports it. */
    this.problem = null
  }

  /** @returns {string | null} The next token, or `null` at the end or on a problem. */
  next() {
    const { bytes } = this
    while (this.at < bytes.length && isSpace(bytes[this.at])) this.at += 1
    if (this.at >= bytes.length) return null
    this.count += 1
    if (this.count > this.limits.maxAsciiTokens) {
      this.problem = 'it has more text than an STL of the largest allowed size'
      return null
    }
    const start = this.at
    while (this.at < bytes.length && !isSpace(bytes[this.at])) {
      if (this.at - start >= this.limits.maxAsciiTokenLength) {
        this.problem = `a word on it is longer than ${this.limits.maxAsciiTokenLength} characters`
        return null
      }
      const byte = bytes[this.at]
      if (byte < 0x20 || byte > 0x7e) {
        this.problem = 'it contains bytes that are not text'
        return null
      }
      this.at += 1
    }
    let token = ''
    for (let index = start; index < this.at; index += 1) token += String.fromCharCode(bytes[index])
    return token
  }

  /** Skip to the end of the current line — a solid's name, which may hold spaces. */
  skipLine() {
    const { bytes } = this
    while (this.at < bytes.length && bytes[this.at] !== 0x0a && bytes[this.at] !== 0x0d) this.at += 1
  }
}

/**
 * @param {Uint8Array} bytes
 * @param {import('../meshAsset.js').MeshLimits} limits
 * @returns {StlParseResult}
 */
function parseAscii(bytes, limits) {
  const tokens = new Tokens(bytes, limits)
  /** @type {number[]} */
  const corners = []
  let triangles = 0
  let solids = 0

  /** @param {string} detail */
  const fail = (detail) => invalid(tokens.problem ?? detail)
  /** @param {string} word */
  const expect = (word) => {
    const token = tokens.next()
    return token !== null && token.toLowerCase() === word
  }
  const number = () => {
    const token = tokens.next()
    if (token === null) return /** @type {const} */ ({ problem: fail('it ends in the middle of a facet') })
    if (NON_FINITE_PATTERN.test(token)) return { problem: invalid('a coordinate is not a finite number') }
    if (!NUMBER_PATTERN.test(token)) return { problem: invalid(`"${token}" is not a number`) }
    return { value: Number(token) }
  }

  for (;;) {
    const head = tokens.next()
    if (head === null) {
      if (tokens.problem !== null) return fail('')
      break
    }
    if (head.toLowerCase() !== 'solid') return fail(`expected "solid", found "${head}"`)
    solids += 1
    tokens.skipLine()
    for (;;) {
      const token = tokens.next()
      if (token === null) return fail('it ends before "endsolid"')
      const word = token.toLowerCase()
      if (word === 'endsolid') {
        tokens.skipLine()
        break
      }
      if (word !== 'facet') return fail(`expected "facet", found "${token}"`)
      if (triangles >= limits.maxTriangles) return { ok: false, reason: tooManyTriangles(null, limits.maxTriangles) }
      if (!expect('normal')) return fail('a facet has no normal')
      // Read past the normal: three tokens, whatever they say.
      for (let index = 0; index < 3; index += 1) if (tokens.next() === null) return fail('it ends in the middle of a facet')
      if (!expect('outer') || !expect('loop')) return fail('a facet has no "outer loop"')
      for (let corner = 0; corner < 3; corner += 1) {
        if (!expect('vertex')) return fail('a facet does not have exactly three vertices')
        for (let axis = 0; axis < 3; axis += 1) {
          const read = number()
          if ('problem' in read) return /** @type {{ ok: false, reason: string }} */ (read.problem)
          const stored = Math.fround(read.value)
          const problem = coordinateProblem(stored, limits)
          if (problem !== null) return problem
          corners.push(stored)
        }
      }
      if (!expect('endloop')) return fail('a facet does not have exactly three vertices')
      if (!expect('endfacet')) return fail('a facet is not closed with "endfacet"')
      triangles += 1
    }
  }
  if (solids === 0) return invalid('it has no "solid"')
  if (triangles === 0) return invalid('the file has no triangles')
  return { ok: true, format: 'ascii', positions: new Float32Array(corners), indices: sequence(triangles * 3), triangleCount: triangles }
}
