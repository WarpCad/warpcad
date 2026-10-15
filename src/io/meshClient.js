// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Main-thread client for the model-import worker (`TODO/io-009`).
 *
 * {@link importModelFile} **supersedes** rather than queues (`CLAUDE.md` Performance): choosing
 * a second file while the first is still being read answers the first `{ superseded: true }`
 * and terminates the worker that was reading it — a real cancellation, since a 25 MB parse is
 * long enough to matter — then starts a fresh one for the new file. {@link cancelModelImport}
 * does the same with no new file (the Library row's cancel, or the panel closing).
 *
 * If a worker cannot be made (or fails to load its module), the same `./meshJob.js` function
 * runs on the main thread instead: slower, never failing — the image and export clients'
 * pattern. {@link setMeshWorkerFactory} is the test seam (`CLAUDE.md`: mock at the boundary).
 *
 * @module io/meshClient
 */

import { importMeshFile } from './meshJob.js'

/** @typedef {import('./meshJob.js').MeshImportResult} MeshImportResult */
/** @typedef {{ superseded: true } | { superseded: false, result: MeshImportResult }} MeshImportOutcome */

/** @type {(() => Worker) | null} */
let factory = null
/** @type {Worker | null} */
let worker = null
let workerUnavailable = false
let nextId = 0
let generation = 0
/** @type {((error?: Error) => void) | null} Settles the in-flight request: superseded, or with `error`. */
let abandonInFlight = null

/**
 * Replace how the worker is constructed; `null` restores the real one.
 *
 * @param {(() => Worker) | null} next
 * @returns {void}
 */
export function setMeshWorkerFactory(next) {
  factory = next
  workerUnavailable = false
  stopWorker()
}

function stopWorker() {
  worker?.terminate()
  worker = null
}

/** @returns {Worker | null} */
function resolveWorker() {
  if (workerUnavailable) return null
  if (worker) return worker
  try {
    worker = factory?.() ?? new Worker(new URL('./mesh.worker.js', import.meta.url), { type: 'module', name: 'warpcad-mesh' })
  } catch {
    workerUnavailable = true
    return null
  }
  const made = worker
  made.addEventListener('error', () => {
    workerUnavailable = true
    if (worker === made) stopWorker()
    abandonInFlight?.(new Error('the model reader stopped unexpectedly — try again'))
  })
  return made
}

/**
 * One request to the worker. Rejects with `'superseded'` when abandoned.
 *
 * @param {Worker} active
 * @param {Record<string, unknown>} message
 * @returns {Promise<any>}
 */
function ask(active, message) {
  const id = (nextId += 1)
  return new Promise((resolve, reject) => {
    /** @param {MessageEvent} event */
    const onMessage = (event) => {
      if (event.data?.id !== id) return
      active.removeEventListener('message', onMessage)
      abandonInFlight = null
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(String(event.data.error)))
    }
    abandonInFlight = (error = new Error('superseded')) => {
      active.removeEventListener('message', onMessage)
      abandonInFlight = null
      reject(error)
    }
    active.addEventListener('message', onMessage)
    active.postMessage({ id, ...message })
  })
}

/**
 * Stop the import in flight, if any: it answers `{ superseded: true }`.
 *
 * @returns {void}
 */
export function cancelModelImport() {
  generation += 1
  if (abandonInFlight !== null) {
    abandonInFlight()
    stopWorker()
  }
}

/**
 * Parse, weld, validate and hash a chosen model file off the main thread. Never throws.
 *
 * @param {Blob & { name?: string }} file
 * @returns {Promise<MeshImportOutcome>}
 */
export async function importModelFile(file) {
  cancelModelImport()
  const mine = generation
  /** @type {MeshImportResult} */
  let result
  const active = resolveWorker()
  try {
    result = active ? await ask(active, { kind: 'import', file }) : await importMeshFile(file)
  } catch (error) {
    if (mine !== generation) return { superseded: true }
    result = { ok: false, reason: `That model could not be read (${error instanceof Error ? error.message : String(error)})` }
  }
  if (mine !== generation) return { superseded: true }
  return { superseded: false, result }
}
