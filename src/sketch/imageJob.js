// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the image worker does (`TODO/sketch-003`), as functions that run in the worker or —
 * as the fallback — on the main thread. Kept out of `./image.worker.js` so the worker file
 * owns only the message protocol, the same split as `src/core/exportJob.js`.
 *
 * ## Import: re-encode, so only pixels survive
 *
 * A photo chosen with **Add image…** is untrusted bytes (a polyglot file, script in its
 * EXIF/XMP comments, its GPS location). {@link importImage}:
 *
 * 1. sniffs the magic bytes — the file's declared type is a hint, not a fact — and reads
 *    the size **from the header, before decoding**, refusing a decompression bomb;
 * 2. decodes it (`createImageBitmap`, EXIF orientation applied);
 * 3. draws it, downscaled to at most {@link IMPORT_MAX_EDGE_PX} on the long edge, onto a
 *    canvas and encodes a **new** JPEG (q 0.85) — or PNG when the source really had
 *    transparency. Only pixels cross that step: metadata, comments, a second file glued
 *    on the end and the photo's location are all gone;
 * 4. hashes the new bytes for the record id, and runs the new record through the same
 *    validator a load uses.
 *
 * ## Load: validate, then decode — never re-encode
 *
 * {@link decodeAsset} is handed a record that already passed `validateImageAsset`. The
 * bytes go `Uint8Array` → `Blob` with the **allowlisted** MIME → `createImageBitmap`, and
 * nowhere else: never `innerHTML`, a CSS `url()`, an `<img src>` or a `data:` URL built by
 * string concatenation.
 *
 * @module sketch/imageJob
 */

import {
  ASSET_OP,
  IMPORT_MAX_EDGE_PX,
  MAX_ASSET_BYTES,
  assetIdFor,
  base64FromBytes,
  bytesFromBase64,
  dimensionProblem,
  importTypeProblem,
  readImageHeader,
  validateImageAsset,
} from './imageAsset.js'

/** @typedef {import('./imageAsset.js').ImageAssetRecord} ImageAssetRecord */

/**
 * @typedef {{ ok: true, record: ImageAssetRecord, bitmap: ImageBitmap } | { ok: false, reason: string }} ImportResult
 */

/** JPEG quality for an imported photo, then the fallbacks tried if it is over the cap. */
const JPEG_QUALITIES = [0.85, 0.7, 0.55]

/** How much each further downscale shrinks a too-big image. */
const SHRINK = 0.8

/**
 * The size to draw an image at so its long edge is at most `maxEdge` — never upscaled.
 *
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {number} [maxEdge]
 * @returns {{ widthPx: number, heightPx: number }}
 */
export function fitWithin(widthPx, heightPx, maxEdge = IMPORT_MAX_EDGE_PX) {
  const scale = Math.min(1, maxEdge / Math.max(widthPx, heightPx))
  return { widthPx: Math.max(1, Math.round(widthPx * scale)), heightPx: Math.max(1, Math.round(heightPx * scale)) }
}

/**
 * A canvas of the given size: `OffscreenCanvas` where there is one (every worker this
 * targets), else a detached `<canvas>` (the main-thread fallback).
 *
 * @param {number} width
 * @param {number} height
 * @returns {OffscreenCanvas | HTMLCanvasElement}
 */
function makeCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/**
 * @param {OffscreenCanvas | HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
function encode(canvas, type, quality) {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality })
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the image could not be encoded'))), type, quality)
  })
}

/**
 * Decode with the photo's EXIF orientation applied. Older engines reject the options bag;
 * they apply orientation by default anyway.
 *
 * @param {Blob} blob
 * @returns {Promise<ImageBitmap>}
 */
async function decodeOriented(blob) {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    return createImageBitmap(blob)
  }
}

/**
 * Whether any pixel of the drawn image is not fully opaque.
 *
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} context
 * @param {number} width
 * @param {number} height
 */
function hasTransparency(context, width, height) {
  const data = context.getImageData(0, 0, width, height).data
  for (let index = 3; index < data.length; index += 4) if (data[index] < 255) return true
  return false
}

/**
 * Re-encode a chosen file into a sanitized `asset.image` record. Never throws: a refusal
 * comes back as `{ ok: false, reason }` in words the panel can show.
 *
 * @param {Blob & { name?: string }} file
 * @returns {Promise<ImportResult>}
 */
export async function importImage(file) {
  const typeProblem = importTypeProblem(file.type ?? '', file.name ?? '')
  if (typeProblem) return { ok: false, reason: typeProblem }
  /** @type {ImageBitmap | null} */
  let source = null
  try {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer())
    const header = readImageHeader(head)
    if (header === null) return { ok: false, reason: 'That file is not a PNG, JPEG or WebP image' }
    const sizeProblem = dimensionProblem(header.widthPx, header.heightPx)
    if (sizeProblem) return { ok: false, reason: `Can't use that photo: ${sizeProblem}` }
    // Decode from a Blob typed by what the bytes *are*, not by what the file claimed.
    source = await decodeOriented(new Blob([file], { type: header.mime }))
    const mayHaveAlpha = header.mime !== 'image/jpeg'

    let size = fitWithin(source.width, source.height)
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const canvas = makeCanvas(size.widthPx, size.heightPx)
      const context = /** @type {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} */ (
        canvas.getContext('2d', { willReadFrequently: mayHaveAlpha })
      )
      if (!context) return { ok: false, reason: 'This browser could not prepare the image' }
      context.drawImage(source, 0, 0, size.widthPx, size.heightPx)
      const alpha = mayHaveAlpha && hasTransparency(context, size.widthPx, size.heightPx)
      const attempts = alpha ? [/** @type {[string, number | undefined]} */ (['image/png', undefined])] : JPEG_QUALITIES.map((quality) => /** @type {[string, number | undefined]} */ (['image/jpeg', quality]))
      for (const [type, quality] of attempts) {
        const blob = await encode(canvas, type, quality)
        if (blob.size > MAX_ASSET_BYTES) continue
        const bytes = new Uint8Array(await blob.arrayBuffer())
        /** @type {ImageAssetRecord} */
        const record = {
          id: await assetIdFor(bytes),
          op: ASSET_OP,
          params: { mime: /** @type {any} */ (type), widthPx: size.widthPx, heightPx: size.heightPx, dataBase64: base64FromBytes(bytes) },
        }
        // The same gate a load uses: what import writes must be something a load accepts.
        const verdict = validateImageAsset(record)
        if (!verdict.ok) return { ok: false, reason: `The re-encoded image did not pass its own check: ${verdict.reason}` }
        const bitmap = await createImageBitmap(new Blob([bytes], { type }))
        return { ok: true, record, bitmap }
      }
      size = { widthPx: Math.max(1, Math.round(size.widthPx * SHRINK)), heightPx: Math.max(1, Math.round(size.heightPx * SHRINK)) }
    }
    return { ok: false, reason: 'That image is too detailed to store — try a smaller copy' }
  } catch (error) {
    return { ok: false, reason: `That image could not be read (${error instanceof Error ? error.message : 'unknown error'})` }
  } finally {
    source?.close()
  }
}

/**
 * Decode a stored record's bytes. Validates first — a record should only get here after
 * passing a load, but the decoder is the thing being protected, so it checks again.
 *
 * @param {unknown} record
 * @returns {Promise<ImageBitmap>}
 * @throws {Error} naming why, for a record that fails validation or does not decode.
 */
export async function decodeAsset(record) {
  const verdict = validateImageAsset(record)
  if (!verdict.ok) throw new Error(verdict.reason)
  const params = /** @type {ImageAssetRecord} */ (record).params
  // `Uint8Array` → `Blob` with the allowlisted MIME → `createImageBitmap`. Nothing else.
  return createImageBitmap(new Blob([/** @type {any} */ (bytesFromBase64(params.dataBase64))], { type: verdict.mime }))
}
