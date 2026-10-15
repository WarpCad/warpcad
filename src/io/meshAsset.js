// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `asset.mesh` record — an imported model's triangles saved inside a library part or a
 * project — and the one validator every copy of it passes through (`TODO/io-009`). The
 * `src/sketch/imageAsset.js` analogue.
 *
 * ## Why a mesh is an asset, not a body
 *
 * `CLAUDE.md`: geometry is derived from the timeline and never persisted as document state.
 * An STL *is* a mesh, so it is stored as **source data**: this record. The `import.mesh` op
 * (`src/core/kernel/recipes/importMesh.js`) consumes it and builds the body, so the body is
 * derived and disposable like any other, and the asset is what it is derived *from*.
 *
 * ## Why this is untrusted input
 *
 * A record arrives from a file the user picked, a project someone sent, a part file, or a
 * `#/gist/<id>` link (ACCEPTANCE scenario 8). So every record — at import, at load, on a
 * local append and in the kernel — goes through {@link validateMeshAsset}, which:
 *
 * - accepts exactly `{ id, op, params: { vertexCount, triangleCount, dataBase64 } }`; any
 *   other field, a URL above all, is a refusal, never ignored;
 * - checks every cap in {@link MESH_LIMITS} **before decoding**, and checks the data's
 *   length against the declared counts before decoding too, so a record cannot make the
 *   validator allocate more than its own (capped) text implies;
 * - then decodes and checks every coordinate is finite and within
 *   ±{@link MESH_LIMITS}`.maxAbsCoordinate`, every index is in range, and at least one
 *   triangle has area.
 *
 * It returns `{ ok, reason }` and **never throws**, whatever it is handed.
 *
 * ## The stored encoding
 *
 * `dataBase64` is one little-endian buffer: `vertexCount × 3` float32 positions, then
 * `triangleCount × 3` indices — uint16 while `vertexCount ≤ 65 536`, else uint32. The index
 * width follows from `vertexCount`, so it is not a field that could disagree. Vertices are
 * **welded** ({@link weldMesh}) before storing: STL repeats every corner per triangle, and
 * sharing them both shrinks the asset about 6× and is what lets the export repair
 * (`src/core/kernel/watertight.js`) see shared edges at all. The id is `mesh-` and 24 hex
 * digits of the SHA-256 of that buffer, so the same file imported twice is the same record.
 *
 * Framework-free: no DOM, no Vue, no three.js. Runs in Node, the main thread and workers.
 *
 * @module io/meshAsset
 */

import { base64FromBytes, bytesFromBase64 } from '../sketch/imageAsset.js'

/** The op of the record. */
export const MESH_ASSET_OP = 'asset.mesh'

/**
 * The hostile-input caps, in one place (the `USER_PART_LIMITS` pattern). Enforced in code by
 * the parser, the weld and the validator.
 *
 * `maxStoredBytes` is 5 MiB rather than the 10 MB `TODO/io-009` first suggested: its base64
 * (≈ 7.0 M characters) plus a part definition's own 1 M-character cap and a thumbnail still
 * fits under the part file's 8 M-character limit (`userPartFile.js`), so a mesh at the cap can
 * always be exported as a part file. A cap-sized 250 k-triangle mesh welds to ≈ 4.5 MB.
 */
/**
 * @typedef {object} MeshLimits
 * @property {number} maxFileBytes
 * @property {number} maxStoredBytes
 * @property {number} maxTriangles
 * @property {number} maxVertices
 * @property {number} maxAbsCoordinate
 * @property {number} maxAsciiTokenLength
 * @property {number} maxAsciiTokens
 */

/** @type {Readonly<MeshLimits>} */
export const MESH_LIMITS = Object.freeze({
  /** The largest file **Import model file…** reads at all (25 MiB). */
  maxFileBytes: 25 * 1024 * 1024,
  /** The largest encoded mesh a record may hold (5 MiB, before base64). */
  maxStoredBytes: 5 * 1024 * 1024,
  /** Triangles in one file, and in one record. */
  maxTriangles: 250_000,
  /** Vertices in one record — every corner of every triangle, unwelded. */
  maxVertices: 750_000,
  /** No coordinate may be beyond ± this, in the file's own units. */
  maxAbsCoordinate: 1e6,
  /** Longest single token an ASCII STL may hold (a number, a keyword). */
  maxAsciiTokenLength: 64,
  /** Tokens an ASCII STL may hold: 21 per facet at the triangle cap, plus slack. */
  maxAsciiTokens: 250_000 * 21 + 4096,
})


/** The weld radius, as a fraction of the bounding-box diagonal. */
export const WELD_TOLERANCE_RATIO = 1e-5

/** Above this many vertices, indices are stored as uint32. */
const UINT16_VERTEX_LIMIT = 65_536

/** The longest `dataBase64` that can hold {@link MESH_LIMITS}`.maxStoredBytes`. */
const MAX_BASE64_LENGTH = Math.ceil(MESH_LIMITS.maxStoredBytes / 3) * 4

/** `mesh-` and a hex content hash. */
const ID_PATTERN = /^mesh-[0-9a-f]{16,64}$/
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/
const RECORD_KEYS = Object.freeze(new Set(['id', 'op', 'params']))
const PARAM_KEYS = Object.freeze(new Set(['vertexCount', 'triangleCount', 'dataBase64']))

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1

/**
 * @typedef {object} MeshAssetParams
 * @property {number} vertexCount
 * @property {number} triangleCount
 * @property {string} dataBase64
 */

/**
 * @typedef {object} MeshAssetRecord
 * @property {string} id `mesh-` + a content hash of the encoded buffer.
 * @property {'asset.mesh'} op
 * @property {MeshAssetParams} params
 */

/**
 * An indexed triangle mesh, in the file's own units. Held in plain, non-reactive variables
 * (`CLAUDE.md` Performance): never put one in a Vue ref.
 *
 * @typedef {object} IndexedMesh
 * @property {Float32Array} positions `x, y, z` per vertex.
 * @property {Uint32Array | Uint16Array} indices Three per triangle.
 */

/** @typedef {{ min: [number, number, number], max: [number, number, number] }} MeshBounds */

/**
 * @typedef {{ ok: true, vertexCount: number, triangleCount: number } | { ok: false, reason: string }} MeshAssetVerdict
 */

/**
 * @typedef {{ ok: true, positions: Float32Array, indices: Uint32Array, vertexCount: number, triangleCount: number, droppedTriangles: number, tolerance: number }
 *   | { ok: false, reason: string }} WeldResult
 */

/**
 * `12,408` / `1.2 M` — how counts read in messages and labels.
 *
 * @param {number} count
 * @returns {string}
 */
export function formatCount(count) {
  if (count >= 1_000_000) return `${(Math.round(count / 100_000) / 10).toString()} M`
  return String(Math.round(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * `250 k` — how a cap reads in messages.
 *
 * @param {number} limit
 * @returns {string}
 */
export function formatLimit(limit) {
  if (limit >= 1_000_000 && limit % 100_000 === 0) return `${limit / 1_000_000} M`
  if (limit >= 1000 && limit % 1000 === 0) return `${limit / 1000} k`
  return formatCount(limit)
}

/**
 * The refusal for a triangle count over the cap — the exact words the Library shows.
 *
 * @param {number | null} count `null` when the count is only known to be over (an ASCII file
 *   stopped at the cap).
 * @param {number} limit
 * @returns {string}
 */
export function tooManyTriangles(count, limit) {
  const said = count === null ? `more than ${formatCount(limit)}` : formatCount(count)
  return `Too many triangles: ${said}, limit ${formatLimit(limit)}`
}

/**
 * The axis-aligned bounds of a position array.
 *
 * @param {ArrayLike<number>} positions `x, y, z` per vertex; at least one vertex.
 * @returns {MeshBounds}
 */
export function meshBounds(positions) {
  /** @type {[number, number, number]} */
  const min = [Infinity, Infinity, Infinity]
  /** @type {[number, number, number]} */
  const max = [-Infinity, -Infinity, -Infinity]
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[index + axis]
      if (value < min[axis]) min[axis] = value
      if (value > max[axis]) max[axis] = value
    }
  }
  return { min, max }
}

/**
 * The weld radius for a mesh with these bounds: {@link WELD_TOLERANCE_RATIO} of its
 * diagonal.
 *
 * @param {MeshBounds} bounds
 * @returns {number} 0 for a mesh that is a single point.
 */
export function weldTolerance(bounds) {
  const dx = bounds.max[0] - bounds.min[0]
  const dy = bounds.max[1] - bounds.min[1]
  const dz = bounds.max[2] - bounds.min[2]
  return Math.hypot(dx, dy, dz) * WELD_TOLERANCE_RATIO
}

/**
 * Share vertices that lie within the weld radius of one another, and drop every triangle
 * that is left with no area — one the weld collapsed, or one that never had any.
 *
 * A vertex joins the first earlier vertex within `tolerance` of it (Euclidean), found through
 * a grid of `tolerance`-sized cells and their 26 neighbours, so two corners closer than the
 * radius always weld and two farther apart never do, wherever the cell boundaries fall. The
 * first vertex's coordinates are kept, unrounded. `-0` is stored as `0`.
 *
 * @param {ArrayLike<number>} positions `x, y, z` per vertex.
 * @param {ArrayLike<number>} indices Three per triangle, each `< positions.length / 3`.
 * @param {{ tolerance?: number }} [options] The radius; default {@link weldTolerance}.
 * @returns {WeldResult}
 */
export function weldMesh(positions, indices, options = {}) {
  const sourceVertices = Math.floor(positions.length / 3)
  if (sourceVertices === 0 || indices.length < 3) return { ok: false, reason: 'The file has no triangles' }
  const bounds = meshBounds(positions)
  const tolerance = options.tolerance ?? weldTolerance(bounds)
  if (!(tolerance > 0)) return { ok: false, reason: 'The file has no triangle with any area' }

  // Cell coordinates are bounded: each axis spans at most the diagonal, so at most
  // 1 / WELD_TOLERANCE_RATIO + 2 cells — the packed key below is exact in a double.
  const span = Math.ceil(1 / WELD_TOLERANCE_RATIO) + 3
  const [minX, minY, minZ] = bounds.min
  /** @type {Map<number, number[]>} cell key → welded vertex ids in it */
  const cells = new Map()
  const remap = new Uint32Array(sourceVertices)
  /** @type {number[]} */
  const kept = []
  const toleranceSquared = tolerance * tolerance
  for (let vertex = 0; vertex < sourceVertices; vertex += 1) {
    const x = positions[vertex * 3] + 0
    const y = positions[vertex * 3 + 1] + 0
    const z = positions[vertex * 3 + 2] + 0
    const cx = Math.floor((x - minX) / tolerance)
    const cy = Math.floor((y - minY) / tolerance)
    const cz = Math.floor((z - minZ) / tolerance)
    let found = -1
    search: for (let dz = -1; dz <= 1; dz += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const bucket = cells.get(cx + dx + 1 + (cy + dy + 1) * span + (cz + dz + 1) * span * span)
          if (bucket === undefined) continue
          for (const candidate of bucket) {
            const ex = kept[candidate * 3] - x
            const ey = kept[candidate * 3 + 1] - y
            const ez = kept[candidate * 3 + 2] - z
            if (ex * ex + ey * ey + ez * ez <= toleranceSquared) {
              found = candidate
              break search
            }
          }
        }
      }
    }
    if (found === -1) {
      found = kept.length / 3
      // `+ 0` turns -0 into 0, so equal meshes encode — and hash — identically.
      kept.push(x === 0 ? 0 : x, y === 0 ? 0 : y, z === 0 ? 0 : z)
      const key = cx + 1 + (cy + 1) * span + (cz + 1) * span * span
      const bucket = cells.get(key)
      if (bucket === undefined) cells.set(key, [found])
      else bucket.push(found)
    }
    remap[vertex] = found
  }

  const welded = new Float32Array(kept)
  // A triangle is dropped when its cross product is this small: zero area to well inside the
  // weld radius (a sliver a hundred-millionth of the radius wide).
  const minArea2 = (toleranceSquared * 1e-8) ** 2
  /** @type {number[]} */
  const triangles = []
  let dropped = 0
  const triangleCount = Math.floor(indices.length / 3)
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = remap[indices[triangle * 3]]
    const b = remap[indices[triangle * 3 + 1]]
    const c = remap[indices[triangle * 3 + 2]]
    if (a === b || b === c || a === c || triangleArea2(welded, a, b, c) <= minArea2) {
      dropped += 1
      continue
    }
    triangles.push(a, b, c)
  }
  if (triangles.length === 0) return { ok: false, reason: 'The file has no triangle with any area' }

  // Drop vertices only the dropped triangles used, so every stored vertex is referenced.
  const used = new Int32Array(welded.length / 3).fill(-1)
  /** @type {number[]} */
  const compact = []
  const outIndices = new Uint32Array(triangles.length)
  for (let index = 0; index < triangles.length; index += 1) {
    const vertex = triangles[index]
    if (used[vertex] === -1) {
      used[vertex] = compact.length / 3
      compact.push(welded[vertex * 3], welded[vertex * 3 + 1], welded[vertex * 3 + 2])
    }
    outIndices[index] = used[vertex]
  }
  const outPositions = new Float32Array(compact)
  return {
    ok: true,
    positions: outPositions,
    indices: outIndices,
    vertexCount: outPositions.length / 3,
    triangleCount: outIndices.length / 3,
    droppedTriangles: dropped,
    tolerance,
  }
}

/**
 * Twice the triangle's area, squared — `|AB × AC|²`, no square root.
 *
 * @param {ArrayLike<number>} positions
 * @param {number} a
 * @param {number} b
 * @param {number} c
 * @returns {number}
 */
function triangleArea2(positions, a, b, c) {
  const ax = positions[a * 3]
  const ay = positions[a * 3 + 1]
  const az = positions[a * 3 + 2]
  const ux = positions[b * 3] - ax
  const uy = positions[b * 3 + 1] - ay
  const uz = positions[b * 3 + 2] - az
  const vx = positions[c * 3] - ax
  const vy = positions[c * 3 + 1] - ay
  const vz = positions[c * 3 + 2] - az
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  return nx * nx + ny * ny + nz * nz
}

/**
 * The byte length of the encoding for these counts.
 *
 * @param {number} vertexCount
 * @param {number} triangleCount
 * @returns {number}
 */
export function encodedByteLength(vertexCount, triangleCount) {
  return vertexCount * 12 + triangleCount * 3 * (vertexCount <= UINT16_VERTEX_LIMIT ? 2 : 4)
}

/**
 * The canonical little-endian buffer for a welded mesh.
 *
 * @param {IndexedMesh} mesh
 * @returns {Uint8Array}
 */
export function encodeMesh(mesh) {
  const vertexCount = mesh.positions.length / 3
  const triangleCount = mesh.indices.length / 3
  const bytes = new Uint8Array(encodedByteLength(vertexCount, triangleCount))
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < mesh.positions.length; index += 1) view.setFloat32(index * 4, mesh.positions[index], true)
  const at = vertexCount * 12
  if (vertexCount <= UINT16_VERTEX_LIMIT) {
    for (let index = 0; index < mesh.indices.length; index += 1) view.setUint16(at + index * 2, mesh.indices[index], true)
  } else {
    for (let index = 0; index < mesh.indices.length; index += 1) view.setUint32(at + index * 4, mesh.indices[index], true)
  }
  return bytes
}

/**
 * The record id for an encoded buffer: `mesh-` and the first 24 hex digits of its SHA-256.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function meshAssetIdFor(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {any} */ (bytes)))
  let hex = ''
  for (let index = 0; index < 12; index += 1) hex += digest[index].toString(16).padStart(2, '0')
  return `mesh-${hex}`
}

/**
 * The `asset.mesh` record for a welded mesh. The caller has already checked the stored-size
 * cap (`meshJob.js`); the record is not validated here — the importer runs it through the
 * same {@link validateMeshAsset} a load uses.
 *
 * @param {IndexedMesh} mesh From {@link weldMesh}.
 * @returns {Promise<MeshAssetRecord>}
 */
export async function buildMeshAsset(mesh) {
  const bytes = encodeMesh(mesh)
  return {
    id: await meshAssetIdFor(bytes),
    op: MESH_ASSET_OP,
    params: {
      vertexCount: mesh.positions.length / 3,
      triangleCount: mesh.indices.length / 3,
      dataBase64: base64FromBytes(bytes),
    },
  }
}

// --- validation ------------------------------------------------------------------------

/** @param {string} reason @returns {{ ok: false, reason: string }} */
function refuse(reason) {
  return { ok: false, reason }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The last few params a validation passed or failed, by their data string: a part is
 * validated each time a layer is set (`userPart.js`), and a multi-megabyte decode on every
 * one of those is wasted work. Keyed by the full string (compared by value), so a different
 * mesh can never be served another's verdict.
 *
 * @type {Map<string, { vertexCount: number, triangleCount: number, verdict: DecodeOutcome }>}
 */
const verdicts = new Map()
const VERDICT_MEMO_SIZE = 8

/** @typedef {{ ok: true, mesh: IndexedMesh, vertexCount: number, triangleCount: number } | { ok: false, reason: string }} DecodeOutcome */

/**
 * Check and decode an `asset.mesh`'s params. Never throws.
 *
 * @param {unknown} params
 * @returns {DecodeOutcome}
 */
function inspectParams(params) {
  if (!isPlainObject(params)) return refuse('params must be an object')
  for (const key of Object.keys(params)) {
    if (!PARAM_KEYS.has(key)) return refuse(`unexpected field "${key}" — a mesh record holds only inline data`)
  }
  const { vertexCount, triangleCount, dataBase64 } = params
  if (typeof vertexCount !== 'number' || !Number.isInteger(vertexCount) || vertexCount < 3) {
    return refuse('vertexCount must be a whole number, at least 3')
  }
  if (typeof triangleCount !== 'number' || !Number.isInteger(triangleCount) || triangleCount < 1) {
    return refuse('triangleCount must be a whole number, at least 1')
  }
  if (triangleCount > MESH_LIMITS.maxTriangles) return refuse(tooManyTriangles(triangleCount, MESH_LIMITS.maxTriangles))
  if (vertexCount > MESH_LIMITS.maxVertices) {
    return refuse(`the mesh has ${formatCount(vertexCount)} vertices — at most ${formatLimit(MESH_LIMITS.maxVertices)}`)
  }
  if (typeof dataBase64 !== 'string') return refuse('dataBase64 must be text')
  if (dataBase64.length > MAX_BASE64_LENGTH) {
    return refuse(`the mesh data is larger than ${MESH_LIMITS.maxStoredBytes / (1024 * 1024)} MB`)
  }
  const byteLength = encodedByteLength(vertexCount, triangleCount)
  if (dataBase64.length !== Math.ceil(byteLength / 3) * 4) {
    return refuse(`the data's length does not match ${vertexCount} vertices and ${triangleCount} triangles`)
  }
  const memo = verdicts.get(dataBase64)
  if (memo !== undefined && memo.vertexCount === vertexCount && memo.triangleCount === triangleCount) return memo.verdict

  const verdict = decodeChecked(dataBase64, vertexCount, triangleCount, byteLength)
  verdicts.set(dataBase64, { vertexCount, triangleCount, verdict })
  if (verdicts.size > VERDICT_MEMO_SIZE) verdicts.delete(/** @type {string} */ (verdicts.keys().next().value))
  return verdict
}

/**
 * Decode data whose length already matches its counts, and check what is in it.
 *
 * @param {string} dataBase64
 * @param {number} vertexCount
 * @param {number} triangleCount
 * @param {number} byteLength
 * @returns {DecodeOutcome}
 */
function decodeChecked(dataBase64, vertexCount, triangleCount, byteLength) {
  if (!BASE64_PATTERN.test(dataBase64)) return refuse('the mesh data is not base64')
  const fromBase64 = /** @type {any} */ (Uint8Array).fromBase64
  /** @type {Uint8Array} */
  let bytes
  try {
    bytes = typeof fromBase64 === 'function' ? fromBase64(dataBase64) : bytesFromBase64(dataBase64)
  } catch {
    return refuse('the mesh data is not base64')
  }
  if (bytes.length !== byteLength) {
    return refuse(`the data's length does not match ${vertexCount} vertices and ${triangleCount} triangles`)
  }
  // A fresh, aligned buffer: positions at 0, indices at a multiple of 4.
  const buffer = bytes.byteOffset === 0 && bytes.buffer.byteLength === byteLength ? bytes.buffer : bytes.slice().buffer
  const wide = vertexCount > UINT16_VERTEX_LIMIT
  /** @type {Float32Array} */
  let positions
  /** @type {Uint16Array | Uint32Array} */
  let indices
  if (LITTLE_ENDIAN) {
    positions = new Float32Array(buffer, 0, vertexCount * 3)
    indices = wide ? new Uint32Array(buffer, vertexCount * 12, triangleCount * 3) : new Uint16Array(buffer, vertexCount * 12, triangleCount * 3)
  } else {
    const view = new DataView(buffer)
    positions = new Float32Array(vertexCount * 3)
    for (let index = 0; index < positions.length; index += 1) positions[index] = view.getFloat32(index * 4, true)
    indices = wide ? new Uint32Array(triangleCount * 3) : new Uint16Array(triangleCount * 3)
    for (let index = 0; index < indices.length; index += 1) {
      indices[index] = wide ? view.getUint32(vertexCount * 12 + index * 4, true) : view.getUint16(vertexCount * 12 + index * 2, true)
    }
  }
  const limit = MESH_LIMITS.maxAbsCoordinate
  for (let index = 0; index < positions.length; index += 1) {
    const value = positions[index]
    if (!Number.isFinite(value)) return refuse('a coordinate is not a finite number')
    if (value > limit || value < -limit) return refuse(`a coordinate is beyond ±${formatCount(limit)}`)
  }
  let area = false
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index]
    const b = indices[index + 1]
    const c = indices[index + 2]
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
      return refuse(`triangle ${index / 3 + 1} names a vertex index past the last vertex (${vertexCount - 1})`)
    }
    if (!area && a !== b && b !== c && a !== c && triangleArea2(positions, a, b, c) > 0) area = true
  }
  if (!area) return refuse('the mesh has no triangle with any area')
  return { ok: true, mesh: { positions, indices }, vertexCount, triangleCount }
}

/**
 * Check an `asset.mesh` record's params alone — what the kernel's `asset.mesh` build sees
 * (a build is handed params, not the record's id). Never throws.
 *
 * @param {unknown} params
 * @returns {MeshAssetVerdict}
 */
export function validateMeshAssetParams(params) {
  try {
    const outcome = inspectParams(params)
    return outcome.ok ? { ok: true, vertexCount: outcome.vertexCount, triangleCount: outcome.triangleCount } : outcome
  } catch (error) {
    return refuse(`the mesh could not be read (${error instanceof Error ? error.message : 'unknown error'})`)
  }
}

/**
 * Check an `asset.mesh` record. Never throws.
 *
 * @param {unknown} record
 * @returns {MeshAssetVerdict}
 */
export function validateMeshAsset(record) {
  try {
    if (!isPlainObject(record)) return refuse('the record is not an object')
    for (const key of Object.keys(record)) {
      if (!RECORD_KEYS.has(key)) return refuse(`unexpected field "${key}" — a mesh record holds only inline data`)
    }
    if (record.op !== MESH_ASSET_OP) return refuse(`op must be "${MESH_ASSET_OP}"`)
    if (typeof record.id !== 'string' || !ID_PATTERN.test(record.id)) return refuse('id must be "mesh-" followed by a hex hash')
    return validateMeshAssetParams(record.params)
  } catch (error) {
    return refuse(`the record could not be read (${error instanceof Error ? error.message : 'unknown error'})`)
  }
}

/**
 * Decode a stored record's (or a build's) params into an indexed mesh, validating first.
 * The arrays may be shared with a memoised earlier decode: never write to them.
 *
 * @param {unknown} recordOrParams An `asset.mesh` record, or just its params.
 * @returns {IndexedMesh}
 * @throws {Error} naming why, for data that fails validation.
 */
export function decodeMeshAsset(recordOrParams) {
  const isRecord = isPlainObject(recordOrParams) && Object.hasOwn(recordOrParams, 'op')
  if (isRecord) {
    const verdict = validateMeshAsset(recordOrParams)
    if (!verdict.ok) throw new Error(verdict.reason)
  }
  /** @type {DecodeOutcome} */
  let outcome
  try {
    outcome = inspectParams(isRecord ? /** @type {any} */ (recordOrParams).params : recordOrParams)
  } catch (error) {
    throw new Error(`the mesh could not be read (${error instanceof Error ? error.message : 'unknown error'})`)
  }
  if (!outcome.ok) throw new Error(outcome.reason)
  return outcome.mesh
}
