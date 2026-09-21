/**
 * The export job, as one pure function (`TODO/perf-001`).
 *
 * This is what actually runs inside the export worker (`src/core/export.worker.js`),
 * kept in its own module so it can be unit-tested — and run as a fallback — with no
 * `Worker` involved at all. It takes packed geometry and gives back either finished
 * file bytes or prepared solids, and it never touches the DOM, a store or three.js.
 *
 * ## Why the split between `bytes` and `solids`
 *
 * STL and OBJ are serialized kernel-side (`src/core/export.js`), so the worker can do
 * the whole job and return the file. glTF is serialized by three.js's `GLTFExporter`
 * over a `BufferGeometry` (`src/render/export.js`, and
 * `docs/decisions/persistence-export.md` sub-decision 4 for why there is no kernel-side
 * glTF serializer to use instead). Rather than drag three.js into the worker for the
 * one format, the worker does the expensive, kernel-shaped half of glTF's work too —
 * combining each body and repairing it, which `TODO/perf-001` measured at ~48 of the
 * ~54 ms a 24-body `.glb` costs — and hands the repaired solids back for the main
 * thread to mesh and serialize, which is the remaining ~5 ms.
 *
 * The important property either way: **the same `solidsForExport` and the same
 * `makeWatertight` run**, here as on the main thread. There is no second
 * implementation to drift, which is the failure `io-004` and `io-005` were both about.
 *
 * @module core/exportJob
 */

import { EXPORT_FORMATS, ExportError, exportBodies, exportFilename, solidsForExport } from './export.js'
import { makeWatertight } from './kernel/watertight.js'
import { packSolids, unpackBodies } from './kernel/transport.js'

/** @typedef {import('./kernel/transport.js').PackedBody} PackedBody */
/** @typedef {import('./export.js').ExportFormat} ExportFormat */

/**
 * @typedef {object} ExportJobRequest
 * @property {ExportFormat} format
 * @property {PackedBody[]} bodies
 */

/**
 * Either a finished file (STL, OBJ) or the prepared solids a `.glb` still needs meshing
 * from, plus the filename and mime type in both cases so the caller never re-derives
 * them.
 *
 * @typedef {object} ExportJobResult
 * @property {'bytes' | 'solids'} kind
 * @property {string} filename
 * @property {string} mimeType
 * @property {Uint8Array} [bytes] `kind: 'bytes'` only.
 * @property {number} [triangleCount] `kind: 'bytes'` only.
 * @property {{ name: string, polygons: number[][][] }[]} [solids] `kind: 'solids'` only.
 */

/**
 * Run an export end to end from packed geometry.
 *
 * @param {ExportJobRequest} request
 * @returns {ExportJobResult}
 * @throws {ExportError} Exactly what the synchronous path throws — `nothing-to-export`,
 *   `evaluation-failed`, `empty-geometry`.
 */
export function runExportJob({ format, bodies: packed }) {
  const bodies = unpackBodies(packed)
  if (format === 'glb') {
    // Validate and prepare here; `src/render/export.js` meshes and serializes.
    const prepared = solidsForExport(bodies).map(({ name, solid }) => ({ name, solid: makeWatertight(solid) }))
    return {
      kind: 'solids',
      filename: exportFilename(bodies, 'glb'),
      mimeType: EXPORT_FORMATS.glb.mimeType,
      solids: packSolids(prepared),
    }
  }
  const result = exportBodies(bodies, format)
  return {
    kind: 'bytes',
    filename: result.filename,
    mimeType: result.mimeType,
    bytes: result.bytes,
    triangleCount: result.triangleCount,
  }
}

/**
 * Flatten a thrown error into something `postMessage` can carry, keeping the `code` and
 * `bodyName` the popover branches on.
 *
 * @param {unknown} error
 * @returns {{ code: string | null, message: string, bodyName: string | undefined }}
 */
export function packError(error) {
  if (error instanceof ExportError) {
    return { code: error.code, message: error.message, bodyName: error.bodyName }
  }
  return { code: null, message: error instanceof Error ? error.message : String(error), bodyName: undefined }
}

/**
 * The inverse of {@link packError}: an `ExportError` again when it was one, so a
 * refusal that crossed the worker boundary is indistinguishable from one that did not.
 *
 * @param {{ code: string | null, message: string, bodyName?: string }} packedError
 * @returns {Error}
 */
export function unpackError(packedError) {
  if (packedError.code === null) return new Error(packedError.message)
  return new ExportError(
    /** @type {any} */ (packedError.code),
    packedError.message,
    packedError.bodyName
  )
}
