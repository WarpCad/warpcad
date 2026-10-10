// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * An image attached in the chat, made safe before anything else touches it (`TODO/ai-008`).
 *
 * An attached drawing is untrusted bytes — and it may be kept in the project as a sketch slice's
 * reference photo (`create`, a slice's `referenceImage`). So **Attach** runs it through
 * `sketch-003`'s sanitiser first (`src/sketch/imageClient.js`'s `importImageFile`: the bytes are
 * sniffed, the size is read from the header *before* decoding so a decompression bomb is refused,
 * an SVG is refused outright, and the image is re-encoded so only pixels survive). Then:
 *
 * - the copy the model is sent is downscaled from the **sanitised record's** bytes, never from the
 *   file (`src/ai/image.js`'s `downscaleToImagePart`, at most 1,568 px on the long edge);
 * - the decoded bitmap the sanitiser hands back is kept for `capture_view`'s overlay.
 *
 * There is no other way in: `reference.spec.js` checks the chat's attach calls this and never
 * downscales a file directly, and drives the hostile cases (huge, SVG with a script, truncated)
 * through the real sanitiser.
 *
 * The browser boundaries (the image worker, canvas) are injected, so it runs in a spec without a
 * browser (`CLAUDE.md`: mock at the boundary).
 *
 * @module ai/reference
 */

import { fitWithin } from './image.js'
import { bytesFromBase64 } from '../sketch/imageAsset.js'

/** @typedef {import('../sketch/imageAsset.js').ImageAssetRecord} ImageAssetRecord */
/** @typedef {ReturnType<typeof import('./image.js').imagePart>} ImagePart */

/**
 * @typedef {object} PreparedReference
 * @property {ImageAssetRecord} record The sanitised record.
 * @property {import('./tools/image.js').SentImage} sent What the model is sent, and its size.
 * @property {unknown} bitmap The sanitiser's decoded copy.
 */

/**
 * @typedef {object} ReferenceBoundaries
 * @property {(file: Blob & { name?: string }) => Promise<{ superseded: true } | { superseded: false, result: import('../sketch/imageJob.js').ImportResult }>} importImage
 *   `sketch-003`'s sanitiser (`importImageFile`).
 * @property {(blob: Blob) => Promise<ImagePart>} downscale `downscaleToImagePart`.
 */

/**
 * Sanitise an attached file and prepare the copy the model sees.
 *
 * @param {Blob & { name?: string }} file
 * @param {ReferenceBoundaries} boundaries
 * @returns {Promise<{ ok: true, reference: PreparedReference, part: ImagePart } | { ok: false, reason: string }>}
 *   `reason` is in words the composer can show; `''` for an import a newer one superseded.
 */
export async function prepareReference(file, boundaries) {
  const imported = await boundaries.importImage(file)
  if (imported.superseded) return { ok: false, reason: '' }
  const { result } = imported
  if (!result.ok) return { ok: false, reason: result.reason }
  const { record, bitmap } = result
  // Only the sanitised bytes go on: a Blob typed by the record's allowlisted MIME.
  const blob = new Blob([/** @type {BlobPart} */ (bytesFromBase64(record.params.dataBase64))], { type: record.params.mime })
  /** @type {ImagePart} */
  let part
  try {
    part = await boundaries.downscale(blob)
  } catch {
    return { ok: false, reason: 'That image could not be prepared to send. Try a PNG, JPEG or WebP.' }
  }
  const size = fitWithin(record.params.widthPx, record.params.heightPx)
  return {
    ok: true,
    part,
    reference: {
      record,
      bitmap,
      sent: { mediaType: part.source.media_type, data: part.source.data, widthPx: size.width, heightPx: size.height },
    },
  }
}
