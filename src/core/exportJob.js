// SPDX-License-Identifier: AGPL-3.0-or-later
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
 * ## Exporting at another resolution (`TODO/core-035`)
 *
 * The Export popover can ask for a finer (or coarser) resolution than the design's, for
 * this file only. Packed bodies are already faceted at the design resolution, so such a
 * job carries the document's **records** instead ({@link refoldRequestOf}): the log, the
 * rollback marker, suppression and the scope's body ids. The job folds them itself, with
 * the same framework-free `createDocument` the app uses, at the export resolution — and
 * then runs the unchanged `solidsForExport` → `makeWatertight` → serialize path. So the
 * Print-resolution re-fold, the most expensive fold a user can ask for, happens here, in
 * the export worker, never on the main thread; and the design itself is never touched,
 * because the worker has only a copy of its records.
 *
 * @module core/exportJob
 */

import { createDocument } from './document.js'
import { EXPORT_FORMATS, ExportError, exportBodies, exportFilename, resolveExportScope, solidsForExport } from './export.js'
import { resolutionLabel } from './kernel/tessellation.js'
import { makeWatertight } from './kernel/watertight.js'
import { packSolids, unpackBodies } from './kernel/transport.js'
import { exportPrintPieces } from './printPrep.js'

/** @typedef {import('./kernel/transport.js').PackedBody} PackedBody */
/** @typedef {import('./export.js').ExportFormat} ExportFormat */

/**
 * Everything a job needs to fold the document again at another resolution — plain,
 * structured-cloneable data, never geometry.
 *
 * @typedef {object} RefoldRequest
 * @property {{ record: import('./kernel/registry.js').OpRecord, origin: string, suppressed?: boolean }[]} entries
 * @property {number | null} rollbackAt
 * @property {string} resolution The export resolution.
 * @property {string[]} ids The selected body ids, or `[]` for the whole scene — resolved
 *   against the re-folded bodies by the same `resolveExportScope` the dialog uses.
 */

/**
 * @typedef {object} ExportJobRequest
 * @property {ExportFormat} format
 * @property {PackedBody[]} bodies The design's evaluated bodies. Ignored when `refold`
 *   is given.
 * @property {RefoldRequest} [refold] Export at another resolution: fold these records
 *   here instead (`TODO/core-035`).
 */

/**
 * The records an export at `resolution` needs, copied out of `document` — so nothing the
 * job does can reach back into it.
 *
 * @param {Pick<import('./document.js').WarpDocument, 'entries' | 'rollbackAt'>} document
 * @param {string} resolution
 * @param {readonly string[]} ids Selected body ids, `[]` for the whole scene.
 * @returns {RefoldRequest}
 */
export function refoldRequestOf(document, resolution, ids) {
  return {
    // A JSON round trip rather than a reference: the records may be reactive proxies on
    // the main thread, and the request must be plain data to cross `postMessage`.
    entries: JSON.parse(
      JSON.stringify(
        document.entries.map((entry) => ({
          record: entry.record,
          origin: entry.origin,
          ...(entry.suppressed === true ? { suppressed: true } : {}),
        }))
      )
    ),
    rollbackAt: document.rollbackAt(),
    resolution,
    ids: [...ids],
  }
}

/**
 * Fold a {@link RefoldRequest} and pick the scope's bodies out of it.
 *
 * @param {RefoldRequest} refold
 * @returns {import('./export.js').ExportBody[]}
 * @throws {ExportError} `evaluation-failed` if the log does not fold at that resolution
 *   (a fillet that fitted a coarse rim may not fit a fine one), or `stale-selection`.
 */
function bodiesAtResolution(refold) {
  const document = createDocument({ resolution: refold.resolution, foldCache: null, restorableSteps: 0 })
  try {
    document.loadEntries(refold.entries, refold.rollbackAt, refold.resolution)
  } catch (error) {
    throw new ExportError(
      'evaluation-failed',
      `The design could not be re-evaluated at ${resolutionLabel(refold.resolution)} resolution: ` +
        `${error instanceof Error ? error.message : String(error)}`
    )
  }
  return resolveExportScope(document.bodies(), refold.ids).bodies
}

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
export function runExportJob({ format, bodies: packed, refold }) {
  const bodies = refold ? bodiesAtResolution(refold) : unpackBodies(packed)
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
 * @typedef {object} PrintPiecesJobResult
 * @property {'zip'} kind
 * @property {string} filename
 * @property {string} mimeType
 * @property {Uint8Array} bytes
 * @property {import('./printPrep.js').PrintPieceFile[]} files
 * @property {string} heuristic
 */

/**
 * Export → Print pieces (`TODO/io-007`) from packed geometry: one STL per top-level part,
 * laid flat, zipped. The same `exportPrintPieces` the main-thread fallback runs.
 *
 * @param {{ bodies: PackedBody[] }} request
 * @returns {PrintPiecesJobResult}
 * @throws {ExportError} `nothing-to-export`, `empty-geometry` or `not-watertight`.
 */
export function runPrintPiecesJob({ bodies: packed }) {
  const result = exportPrintPieces(unpackBodies(packed))
  return { kind: 'zip', ...result }
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
