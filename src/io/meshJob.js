// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the model-import worker does (`TODO/io-009`), as functions that run in the worker or —
 * as the fallback — on the main thread. Kept out of `./mesh.worker.js` so the worker file owns
 * only the message protocol: the `src/sketch/imageJob.js` split.
 *
 * ## Import: only the validator's output survives
 *
 * A file chosen with **Import model file…** is untrusted bytes. {@link importMeshFile}:
 *
 * 1. refuses a file over {@link MESH_LIMITS}`.maxFileBytes` **before reading it**;
 * 2. parses it (`./meshFormats/`), which checks a binary STL's length equation before
 *    allocating anything for the header's triangle count;
 * 3. welds the triangle soup into shared vertices and drops zero-area triangles
 *    (`./meshAsset.js`'s `weldMesh`);
 * 4. refuses a welded mesh over {@link MESH_LIMITS}`.maxStoredBytes`;
 * 5. encodes and hashes it into an `asset.mesh` record, and runs that record through the
 *    same `validateMeshAsset` a load uses — what import writes must be what a load accepts.
 *
 * The document stores that record, never the upload. Never throws: a refusal is
 * `{ ok: false, reason }` in words the Library shows.
 *
 * @module io/meshJob
 */

import {
  MESH_LIMITS,
  buildMeshAsset,
  encodedByteLength,
  meshBounds,
  validateMeshAsset,
  weldMesh,
} from './meshAsset.js'
import { parseMeshFile } from './meshFormats/index.js'

/** @typedef {import('./meshAsset.js').MeshAssetRecord} MeshAssetRecord */
/** @typedef {import('./meshAsset.js').MeshLimits} MeshLimits */

/**
 * @typedef {object} MeshImportSuccess
 * @property {true} ok
 * @property {MeshAssetRecord} record The validated `asset.mesh` record.
 * @property {string} name The file's base name — the part's suggested name.
 * @property {string} format Which parser read it (`'binary'`/`'ascii'` for STL).
 * @property {number} triangleCount Triangles stored, after the weld dropped degenerate ones.
 * @property {number} vertexCount Vertices stored, after welding.
 * @property {number} sourceTriangleCount Triangles in the file.
 * @property {number} droppedTriangles Zero-area triangles the weld removed.
 * @property {[number, number, number]} sizeRaw Bounding-box size **in the file's own units**
 *   — multiply by the chosen unit scale for millimetres.
 * @property {{ positions: Float32Array, indices: Uint32Array }} preview The welded mesh, in
 *   file units, for a one-time thumbnail on the render side. Transferred from the worker;
 *   hold it in a plain variable, never a Vue ref.
 */

/** @typedef {MeshImportSuccess | { ok: false, reason: string }} MeshImportResult */

const FALLBACK_NAME = 'Imported model'
const MAX_NAME_LENGTH = 80

/**
 * A file's display name: its base name, without folders or extension, control characters
 * removed, bounded.
 *
 * @param {string} fileName
 * @returns {string}
 */
export function meshNameFromFile(fileName) {
  const base = String(fileName ?? '').split(/[\\/]/).pop() ?? ''
  const stem = base.replace(/\.[A-Za-z0-9]{1,8}$/, '')
  // eslint-disable-next-line no-control-regex
  const clean = stem.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH).trim()
  return clean === '' ? FALLBACK_NAME : clean
}

/**
 * Import already-read bytes. The worker and the main-thread fallback both end here.
 *
 * @param {string} fileName
 * @param {Uint8Array} bytes
 * @param {MeshLimits} [limits]
 * @returns {Promise<MeshImportResult>}
 */
export async function importMeshBytes(fileName, bytes, limits = MESH_LIMITS) {
  try {
    const parsed = parseMeshFile(fileName, bytes, limits)
    if (!parsed.ok) return parsed
    const welded = weldMesh(parsed.positions, parsed.indices)
    if (!welded.ok) return { ok: false, reason: `${welded.reason} — nothing to import` }
    if (encodedByteLength(welded.vertexCount, welded.triangleCount) > limits.maxStoredBytes) {
      return {
        ok: false,
        reason: `That model is too detailed to store (${welded.triangleCount} triangles); simplify it below ${Math.round(limits.maxStoredBytes / (1024 * 1024))} MB and try again`,
      }
    }
    const record = await buildMeshAsset(welded)
    const verdict = validateMeshAsset(record)
    if (!verdict.ok) return { ok: false, reason: `The imported mesh did not pass its own check: ${verdict.reason}` }
    const { min, max } = meshBounds(welded.positions)
    return {
      ok: true,
      record,
      name: meshNameFromFile(fileName),
      format: parsed.format,
      triangleCount: welded.triangleCount,
      vertexCount: welded.vertexCount,
      sourceTriangleCount: parsed.triangleCount,
      droppedTriangles: welded.droppedTriangles,
      sizeRaw: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      preview: { positions: welded.positions, indices: welded.indices },
    }
  } catch (error) {
    return { ok: false, reason: `That model could not be read (${error instanceof Error ? error.message : 'unknown error'})` }
  }
}

/**
 * Import a chosen file. Never throws.
 *
 * @param {Blob & { name?: string }} file
 * @param {MeshLimits} [limits]
 * @returns {Promise<MeshImportResult>}
 */
export async function importMeshFile(file, limits = MESH_LIMITS) {
  try {
    if (typeof file?.size !== 'number' || typeof file.arrayBuffer !== 'function') {
      return { ok: false, reason: 'Nothing was chosen to import' }
    }
    if (file.size > limits.maxFileBytes) {
      return { ok: false, reason: `That file is larger than ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB` }
    }
    if (file.size === 0) return { ok: false, reason: 'Not a valid STL: the file is empty' }
    const bytes = new Uint8Array(await file.arrayBuffer())
    return importMeshBytes(file.name ?? '', bytes, limits)
  } catch (error) {
    return { ok: false, reason: `That file could not be read (${error instanceof Error ? error.message : 'unknown error'})` }
  }
}
