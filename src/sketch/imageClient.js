// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Main-thread client for the image worker (`TODO/sketch-003`).
 *
 * - {@link importImageFile}: a newer import **supersedes** an older one rather than
 *   queueing behind it (CLAUDE.md's Performance rule) — choosing a second photo while the
 *   first is still being re-encoded answers the first `{ superseded: true }`.
 * - {@link traceImage} (`TODO/sketch-004`): Auto-trace a tap. A newer tap supersedes an
 *   older one the same way.
 * - {@link decodeAssetBitmap}: one decode per asset id, cached as a promise until
 *   {@link releaseAssetBitmaps} closes them all — the editor calls it when it closes, so a
 *   decoded photo's memory lives exactly as long as the editor that shows it.
 *
 * If a worker cannot be made (or fails to load its module), the same `./imageJob.js`
 * functions run on the main thread instead: slower, never failing — the export client's
 * pattern. {@link setImageWorkerFactory} is the test seam (CLAUDE.md: mock at the boundary).
 *
 * @module sketch/imageClient
 */

import { decodeAsset, importImage, traceAsset } from './imageJob.js'

/** @typedef {import('./imageJob.js').ImportResult} ImportResult */
/** @typedef {import('./trace.js').TraceResult} TraceResult */

/** @type {(() => Worker) | null} */
let factory = null
/** @type {Worker | null} */
let worker = null
let workerUnavailable = false
let nextId = 0
let importGeneration = 0
let traceGeneration = 0
/** @type {Map<string, Promise<ImageBitmap>>} */
const decoded = new Map()

/**
 * Replace how the worker is constructed; `null` restores the real one.
 *
 * @param {(() => Worker) | null} next
 */
export function setImageWorkerFactory(next) {
  factory = next
  workerUnavailable = false
  worker?.terminate()
  worker = null
}

/** @returns {Worker | null} */
function resolveWorker() {
  if (workerUnavailable) return null
  if (worker) return worker
  try {
    worker =
      factory?.() ??
      new Worker(new URL('./image.worker.js', import.meta.url), { type: 'module', name: 'warpcad-image' })
  } catch {
    workerUnavailable = true
    return null
  }
  worker.addEventListener('error', () => {
    workerUnavailable = true
    worker?.terminate()
    worker = null
  })
  return worker
}

/**
 * One request to the worker.
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
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(String(event.data.error)))
    }
    active.addEventListener('message', onMessage)
    active.postMessage({ id, ...message })
  })
}

/**
 * Re-encode a chosen file into a sanitized `asset.image` record.
 *
 * @param {Blob & { name?: string }} file
 * @returns {Promise<{ superseded: true } | { superseded: false, result: ImportResult }>}
 */
export async function importImageFile(file) {
  const generation = (importGeneration += 1)
  /** @type {ImportResult} */
  let result
  const active = resolveWorker()
  try {
    result = active ? await ask(active, { kind: 'import', file }) : await importImage(file)
  } catch (error) {
    result = { ok: false, reason: `That image could not be read (${error instanceof Error ? error.message : String(error)})` }
  }
  if (generation !== importGeneration) {
    if (result.ok) result.bitmap.close?.()
    return { superseded: true }
  }
  return { superseded: false, result }
}

/**
 * **Auto-trace** a tap on a stored photo, off the main thread. A newer call supersedes an
 * older one rather than queueing behind it: the older answers `{ superseded: true }`.
 * Never throws — a photo that cannot be read is a refusal in words.
 *
 * @param {import('./imageAsset.js').ImageAssetRecord} record
 * @param {readonly number[]} seedPx Where the user tapped, in image px.
 * @param {{ tolerancePx?: number, threshold?: number | null }} options
 * @returns {Promise<{ superseded: true } | { superseded: false, result: TraceResult }>}
 */
export async function traceImage(record, seedPx, options) {
  const generation = (traceGeneration += 1)
  /** @type {TraceResult | { superseded: true }} */
  let result
  const active = resolveWorker()
  try {
    result = active
      ? await ask(active, { kind: 'trace', record, seedPx: [seedPx[0], seedPx[1]], options })
      : await traceAsset(record, seedPx, options)
  } catch (error) {
    result = { ok: false, code: 'empty', reason: `The photo could not be read for tracing (${error instanceof Error ? error.message : String(error)})` }
  }
  if (generation !== traceGeneration || 'superseded' in result) return { superseded: true }
  return { superseded: false, result }
}

/**
 * The decoded bitmap of a stored record — decoded once per id, off the main thread.
 *
 * @param {import('./imageAsset.js').ImageAssetRecord} record
 * @returns {Promise<ImageBitmap>}
 */
export function decodeAssetBitmap(record) {
  const cached = decoded.get(record.id)
  if (cached) return cached
  const active = resolveWorker()
  const pending = active ? ask(active, { kind: 'decode', record }) : decodeAsset(record)
  decoded.set(record.id, pending)
  pending.catch(() => {
    if (decoded.get(record.id) === pending) decoded.delete(record.id)
  })
  return pending
}

/**
 * Hand a bitmap the import already decoded to the cache, so showing a just-imported photo
 * needs no second decode.
 *
 * @param {string} id
 * @param {ImageBitmap} bitmap
 */
export function rememberAssetBitmap(id, bitmap) {
  if (!decoded.has(id)) decoded.set(id, Promise.resolve(bitmap))
  else bitmap.close?.()
}

/** Close every cached bitmap and forget them — the editor closed. */
export function releaseAssetBitmaps() {
  for (const pending of decoded.values()) pending.then((bitmap) => bitmap.close?.()).catch(() => {})
  decoded.clear()
}
