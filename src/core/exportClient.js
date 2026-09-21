/**
 * Main-thread client for the export worker (`TODO/perf-001`).
 *
 * `File ▾ → Export…` used to do every part of its job synchronously: combine each
 * body's group, repair it for watertightness (`io-004`, `io-005`), serialize it, hand
 * over the bytes — with no yield anywhere. Measured in Chromium against the real app,
 * a 24-body scene froze the main thread for **224 ms at 4× CPU throttling and 339 ms at
 * 6×** even after `makeWatertight` was made near-linear, against `CLAUDE.md`'s 16 ms
 * frame budget and its "the main thread must never block on geometry evaluation".
 *
 * This module moves that work into `src/core/export.worker.js` and keeps the shape
 * callers already had: one call in, one `ExportResult` out.
 *
 * ## What stays on the main thread, and why
 *
 * Only glTF's last step. `GLTFExporter` is three.js, `src/core/` is framework-free by
 * `CLAUDE.md`'s Project Structure, and the meshing-and-serializing half of a `.glb`
 * measured ~5 ms of its ~54 — so the worker prepares the solids and the caller's own
 * `loadGltfExporter` finishes them. STL and OBJ never come back to the main thread at
 * all: the worker returns the finished file, transferred rather than copied.
 *
 * ## The fallback is the old path, exactly
 *
 * If a `Worker` cannot be constructed — no support, a blocked module worker, a bundler
 * that did not emit the chunk — {@link runExport} calls the very same
 * `exportBodies` / `exportGltf` it always did, on the main thread, and the export still
 * happens. It is slower and it still freezes, which is the pre-`perf-001` behaviour;
 * what it never does is fail. `workerAvailable()` reports which path a caller got, so
 * a test can assert the worker really was used rather than silently passing on the
 * fallback.
 *
 * ## The boundary, for tests
 *
 * {@link setExportWorkerFactory} replaces `new Worker(…)` — this module is the seam
 * `CLAUDE.md`'s Conventions mean by "always mock at the boundary: the kernel worker".
 * A unit test never constructs a real worker; `src/core/exportClient.spec.js` drives a
 * fake one that runs `runExportJob` in a promise.
 *
 * @module core/exportClient
 */

import { EXPORT_FORMATS, exportBodies, exportFilename } from './export.js'
import { unpackError } from './exportJob.js'
import { packBodies, unpackSolids } from './kernel/transport.js'

/** @typedef {import('./export.js').ExportBody} ExportBody */
/** @typedef {import('./export.js').ExportFormat} ExportFormat */
/** @typedef {import('./export.js').ExportResult} ExportResult */

/**
 * @typedef {object} ExportRunOptions
 * @property {() => Promise<(bodies: readonly ExportBody[], options?: { prepared?: { name: string, solid: any }[] }) => Promise<ExportResult>>} loadGltfExporter
 *   Resolves `exportGltf` from `src/render/export.js`. A function because it is a
 *   dynamic import, and injected because `src/core/` must not import three.js.
 */

/** @type {(() => Worker) | null} */
let factory = null
/** @type {Worker | null} */
let worker = null
/** True once constructing a worker has failed; stops retrying on every export. */
let workerUnavailable = false
let nextId = 0

/**
 * Replace how a worker is constructed. `null` restores the real one.
 *
 * @param {(() => Worker) | null} next
 */
export function setExportWorkerFactory(next) {
  factory = next
  workerUnavailable = false
  disposeExportWorker()
}

/** Drop the current worker, if any. The next export makes a fresh one. */
export function disposeExportWorker() {
  worker?.terminate()
  worker = null
}

/** @returns {boolean} Whether the last {@link runExport} used the worker. */
export function workerAvailable() {
  return !workerUnavailable
}

/**
 * @returns {Worker | null} The shared worker, or `null` when one cannot be made.
 */
function resolveWorker() {
  if (workerUnavailable) return null
  if (worker) return worker
  try {
    worker =
      factory?.() ??
      // `new URL(…, import.meta.url)` is the form Vite understands for both the dev
      // server and the production build; `type: 'module'` is what lets the worker use
      // the same ES imports the rest of `src/core/` does.
      new Worker(new URL('./export.worker.js', import.meta.url), { type: 'module', name: 'warpcad-export' })
  } catch {
    workerUnavailable = true
    worker = null
    return null
  }
  worker.addEventListener('error', () => {
    // A worker that failed to load its own module will never answer; fall back from now on.
    workerUnavailable = true
    disposeExportWorker()
  })
  return worker
}

/**
 * Ask the worker for one export.
 *
 * @param {Worker} active
 * @param {ExportFormat} format
 * @param {readonly ExportBody[]} bodies
 * @returns {Promise<import('./exportJob.js').ExportJobResult>}
 */
function ask(active, format, bodies) {
  const id = (nextId += 1)
  return new Promise((resolve, reject) => {
    /** @param {MessageEvent} event */
    const onMessage = (event) => {
      if (event.data?.id !== id) return
      cleanup()
      if (event.data.ok) resolve(event.data.result)
      else reject(unpackError(event.data.error))
    }
    const onError = () => {
      cleanup()
      reject(new Error('the export worker stopped before it answered'))
    }
    function cleanup() {
      active.removeEventListener('message', onMessage)
      active.removeEventListener('error', onError)
    }
    active.addEventListener('message', onMessage)
    active.addEventListener('error', onError)
    active.postMessage({ id, format, bodies: packBodies(bodies) })
  })
}

/**
 * Export bodies to file bytes, off the main thread when that is possible.
 *
 * The returned `ExportResult` is the same object shape `exportBodies` and `exportGltf`
 * return, so a caller cannot tell from the result which path ran — only
 * {@link workerAvailable} says that.
 *
 * @param {readonly ExportBody[]} bodies Already scoped by `resolveExportScope`.
 * @param {ExportFormat} format
 * @param {ExportRunOptions} options
 * @returns {Promise<ExportResult>}
 * @throws {import('./export.js').ExportError} Exactly as the synchronous path does,
 *   whichever side of the boundary refused it.
 */
export async function runExport(bodies, format, options) {
  const active = resolveWorker()
  if (active) {
    try {
      const job = await ask(active, format, bodies)
      if (job.kind === 'bytes') {
        return {
          bytes: /** @type {Uint8Array} */ (job.bytes),
          filename: job.filename,
          mimeType: job.mimeType,
          triangleCount: /** @type {number} */ (job.triangleCount),
        }
      }
      const exporter = await options.loadGltfExporter()
      return await exporter(bodies, { prepared: unpackSolids(job.solids ?? []) })
    } catch (failure) {
      // A refusal is an answer, not a worker problem: it must reach the popover by
      // name, not be retried on the main thread where it would refuse identically.
      if (failure instanceof Error && failure.name === 'ExportError') throw failure
      workerUnavailable = true
      disposeExportWorker()
    }
  }

  // Fallback: the pre-`perf-001` main-thread path, unchanged.
  if (format === 'glb') {
    const exporter = await options.loadGltfExporter()
    return await exporter(bodies)
  }
  return exportBodies(bodies, format)
}

/**
 * The filename an export would suggest, without doing the export — what the pending
 * state names while the worker is busy.
 *
 * @param {readonly ExportBody[]} bodies
 * @param {ExportFormat} format
 * @returns {string}
 */
export function pendingFilename(bodies, format) {
  return bodies.length === 0 ? `export.${EXPORT_FORMATS[format].extension}` : exportFilename(bodies, format)
}
