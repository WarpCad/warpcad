// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the model-import worker does (`TODO/io-009`), as functions that run in the worker or —
 * as the fallback — on the main thread. Kept out of `./mesh.worker.js` so the worker file owns
 * only the message protocol: the `src/sketch/imageJob.js` split.
 *
 * ## Import: only the validator's output survives
 *
 * A file chosen with **File → Import model…** is untrusted bytes. {@link importMeshFile}:
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
 * ## An assembly (`TODO/io-024`)
 *
 * A parser may answer with several placed meshes instead of one (`{ parts, unitScale }` — a
 * 3MF). {@link importParsedMesh} welds and validates **each distinct mesh** separately, stores it
 * once however many parts place it, gives every part a clean, unique name, and bakes one offset
 * for the whole assembly into each part's matrix — centred in X and Y, lowest point on Z = 0 —
 * so the parts keep their places relative to each other. The triangle cap applies to every
 * placed part together, after the reader's exact duplicates collapsed.
 *
 * @module io/meshJob
 */

import {
  MESH_LIMITS,
  buildMeshAsset,
  encodedByteLength,
  formatCount,
  meshBounds,
  tooManyTriangles,
  validateMeshAsset,
  weldMesh,
} from './meshAsset.js'
import { emptyPlacedBounds, groundOffset, growPlacedBounds, matrixProblem, withTranslation } from './meshMatrix.js'
import { formatForName, parseMeshFile, unsupportedFormatReason } from './meshFormats/index.js'

/** @typedef {import('./meshAsset.js').MeshAssetRecord} MeshAssetRecord */
/** @typedef {import('./meshAsset.js').MeshLimits} MeshLimits */

/**
 * @typedef {object} MeshImportSuccess
 * @property {true} ok
 * @property {'mesh'} kind One mesh (an STL), as opposed to an assembly.
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

/**
 * @typedef {object} MeshAssemblySuccess An imported file of several placed meshes (`TODO/io-024`).
 * @property {true} ok
 * @property {'assembly'} kind
 * @property {string} name The file's base name.
 * @property {string} format
 * @property {MeshAssetRecord[]} assets One validated record per distinct mesh.
 * @property {import('./meshPart.js').AssemblyPart[]} parts One per placed mesh, offset baked in.
 * @property {number} unitScale Millimetres per file unit, from the file.
 * @property {true} unitsStated
 * @property {number} triangleCount Triangles drawn across every part.
 * @property {number} duplicates Exact duplicates the reader collapsed.
 * @property {number} skippedObjects Objects that are not `model` (supports and the like), skipped.
 * @property {[number, number, number]} sizeMm The whole model's size.
 */

/**
 * @typedef {object} ParsedAssembly What a multi-mesh parser answers.
 * @property {true} ok
 * @property {string} format
 * @property {number} unitScale Millimetres per file unit.
 * @property {{ name: string | null, positions: Float32Array, indices: Uint32Array, matrix: readonly number[], color?: number, colorAlpha?: number }[]} parts
 *   Each part's mesh in file units and its placement, translation in file units. Parts drawing
 *   the same mesh share the same `positions` array.
 * @property {number} [duplicates]
 * @property {number} [skippedObjects]
 */

/** @typedef {MeshImportSuccess | MeshAssemblySuccess | { ok: false, reason: string }} MeshImportResult */

const FALLBACK_NAME = 'Imported model'
const MAX_NAME_LENGTH = 80
/** `USER_PART_LIMITS.maxRecords`, mirrored so the worker need not load the part validator. */
export const MAX_ASSEMBLY_RECORDS = 500
/** Names a part may not have: `group.js` keeps parts on a plain object (`TODO/io-024`). */
const REFUSED_NAMES = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * One part name from a file, made safe: control characters stripped, a comma (which separates
 * part names in an address) turned into a space, runs of space collapsed, bounded, and a name
 * a plain object cannot hold refused. `''` when nothing usable is left.
 *
 * @param {unknown} raw
 * @param {number} [maxLength]
 * @returns {string}
 */
export function cleanPartName(raw, maxLength = MAX_NAME_LENGTH) {
  if (typeof raw !== 'string') return ''
  const clean = raw
    .slice(0, maxLength * 4)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim()
  return REFUSED_NAMES.has(clean) ? '' : clean
}

/**
 * Every part's final name: its own (cleaned), else `Part n` by order; a name used more than once
 * is numbered `10K 1`, `10K 2`, …; and no two parts ever share one.
 *
 * @param {readonly (string | null | undefined)[]} rawNames
 * @returns {string[]}
 */
export function assemblyPartNames(rawNames) {
  const base = rawNames.map((raw, index) => cleanPartName(raw) || `Part ${index + 1}`)
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const name of base) counts.set(name, (counts.get(name) ?? 0) + 1)
  const taken = new Set(base.filter((name) => counts.get(name) === 1))
  /** @type {Map<string, number>} */
  const next = new Map()
  return base.map((name) => {
    if (counts.get(name) === 1) return name
    let number = next.get(name) ?? 1
    let candidate = ''
    do {
      const suffix = ` ${number}`
      candidate = `${name.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`
      number += 1
    } while (taken.has(candidate))
    next.set(name, number)
    taken.add(candidate)
    return candidate
  })
}

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
    const parsed = await parseMeshFile(fileName, bytes, limits)
    if (!parsed.ok) return parsed
    if ('parts' in parsed) return importParsedMesh(fileName, parsed, limits)
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
      kind: /** @type {const} */ ('mesh'),
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
 * Import a parsed assembly: weld, store and validate each distinct mesh, name every part, and
 * bake the whole model's ground offset into each part's matrix. Never throws.
 *
 * @param {string} fileName
 * @param {ParsedAssembly} parsed
 * @param {Partial<MeshLimits>} [overrides]
 * @returns {Promise<MeshAssemblySuccess | { ok: false, reason: string }>}
 */
export async function importParsedMesh(fileName, parsed, overrides = {}) {
  try {
    const limits = { ...MESH_LIMITS, ...overrides }
    const label = parsed.format === '3mf' ? '3MF' : parsed.format
    if (parsed.parts.length === 0) return { ok: false, reason: `Not a valid ${label}: it has nothing to import` }
    const names = assemblyPartNames(parsed.parts.map((part) => part.name))
    /** @type {Map<Float32Array, { welded: any, record: MeshAssetRecord }>} */
    const meshes = new Map()
    let storedBytes = 0
    for (const [index, part] of parsed.parts.entries()) {
      if (meshes.has(part.positions)) continue
      const welded = weldMesh(part.positions, part.indices)
      if (!welded.ok) return { ok: false, reason: `${welded.reason} in ${names[index]} — nothing to import` }
      storedBytes += encodedByteLength(welded.vertexCount, welded.triangleCount)
      if (storedBytes > limits.maxStoredBytes) {
        return {
          ok: false,
          reason: `That model is too detailed to store; simplify it below ${Math.round((limits.maxStoredBytes / (1024 * 1024)) * 10) / 10} MB and try again`,
        }
      }
      const record = await buildMeshAsset(welded)
      const verdict = validateMeshAsset(record)
      if (!verdict.ok) return { ok: false, reason: `The imported mesh ${names[index]} did not pass its own check: ${verdict.reason}` }
      meshes.set(part.positions, { welded, record })
    }
    const triangleCount = parsed.parts.reduce((total, part) => total + /** @type {any} */ (meshes.get(part.positions)).welded.triangleCount, 0)
    if (triangleCount > limits.maxTriangles) return { ok: false, reason: tooManyTriangles(triangleCount, limits.maxTriangles) }
    const records = new Set(/** @type {any[]} */ ([...meshes.values()].map((mesh) => mesh.record.id))).size
    if (records + parsed.parts.length + 1 > MAX_ASSEMBLY_RECORDS) {
      return { ok: false, reason: `That model has ${formatCount(parsed.parts.length)} parts — at most ${MAX_ASSEMBLY_RECORDS - records - 1} fit in one library part` }
    }

    // The file's translations are in its units; a stored matrix holds millimetres.
    const scale = parsed.unitScale
    const inMm = parsed.parts.map((part) => {
      const m = [...part.matrix]
      m[12] *= scale
      m[13] *= scale
      m[14] *= scale
      return m
    })
    const bounds = emptyPlacedBounds()
    parsed.parts.forEach((part, index) => {
      growPlacedBounds(bounds, /** @type {any} */ (meshes.get(part.positions)).welded.positions, scale, inMm[index])
    })
    const [dx, dy, dz] = groundOffset(bounds)
    /** @type {import('./meshPart.js').AssemblyPart[]} */
    const parts = []
    for (const [index, part] of parsed.parts.entries()) {
      const matrix = withTranslation(inMm[index], dx, dy, dz)
      const problem = matrixProblem(matrix)
      if (problem !== null) return { ok: false, reason: `${names[index]} cannot be placed: its ${problem}` }
      const mesh = /** @type {{ welded: any, record: MeshAssetRecord }} */ (meshes.get(part.positions))
      /** @type {import('./meshPart.js').AssemblyPart} */
      const placed = { name: names[index], assetId: mesh.record.id, triangleCount: mesh.welded.triangleCount, matrix }
      if (part.color !== undefined) {
        placed.color = part.color
        if (part.colorAlpha !== undefined) placed.colorAlpha = part.colorAlpha
      }
      parts.push(placed)
    }
    /** @type {Map<string, MeshAssetRecord>} */
    const assets = new Map()
    for (const { record } of meshes.values()) assets.set(record.id, record)
    return {
      ok: true,
      kind: 'assembly',
      name: meshNameFromFile(fileName),
      format: parsed.format,
      assets: [...assets.values()],
      parts,
      unitScale: scale,
      unitsStated: true,
      triangleCount,
      duplicates: parsed.duplicates ?? 0,
      skippedObjects: parsed.skippedObjects ?? 0,
      sizeMm: [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]],
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
    const unsupported = unsupportedFormatReason(file.name ?? '')
    if (unsupported !== null) return { ok: false, reason: unsupported }
    if (file.size > limits.maxFileBytes) {
      return { ok: false, reason: `That file is larger than ${Math.round(limits.maxFileBytes / (1024 * 1024))} MB` }
    }
    if (file.size === 0) return { ok: false, reason: `Not a valid ${formatForName(file.name ?? '')?.label ?? 'STL'}: the file is empty` }
    const bytes = new Uint8Array(await file.arrayBuffer())
    return importMeshBytes(file.name ?? '', bytes, limits)
  } catch (error) {
    return { ok: false, reason: `That file could not be read (${error instanceof Error ? error.message : 'unknown error'})` }
  }
}
