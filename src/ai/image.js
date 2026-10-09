// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Images as Messages API parts (`TODO/ai-004`): base64, downscaled client-side to a maximum
 * edge before send. The cost of an image grows with its size, and the request has a size
 * ceiling, so the original stays in the document asset (`sketch-003`) and only the shrunk copy
 * is ever put on the wire.
 *
 * The geometry is pure ({@link fitWithin}); the decode/draw/encode is behind injectable
 * `createImageBitmap` / `makeCanvas` so it is testable without a real canvas
 * (`CLAUDE.md`: mock at the boundary). Re-encoding through a canvas also drops EXIF and other
 * metadata, which is a reason in its own right not to send the original bytes.
 *
 * @module ai/image
 */

/** The long-edge ceiling. The API downsizes anything larger itself; sending less saves the upload. */
export const MAX_IMAGE_EDGE = 1568

/** The narrowest capture `capture_view` renders (`TODO/ai-007`): below this the picture says nothing. */
export const MIN_CAPTURE_EDGE = 128

/** `capture_view`'s default width: enough to read a part, a fraction of the ceiling's tokens. */
export const DEFAULT_CAPTURE_WIDTH = 768

/**
 * The pixel size of a viewport capture (`TODO/ai-007`): 4:3, `width` clamped to
 * [{@link MIN_CAPTURE_EDGE}, {@link MAX_IMAGE_EDGE}], so a capture is already downscaled when it
 * is rendered and never needs a second pass before it is sent.
 *
 * @param {number | undefined} width
 * @returns {{ widthPx: number, heightPx: number }}
 */
export function captureSize(width) {
  const wanted = Number.isFinite(width) ? Math.round(/** @type {number} */ (width)) : DEFAULT_CAPTURE_WIDTH
  const widthPx = Math.min(MAX_IMAGE_EDGE, Math.max(MIN_CAPTURE_EDGE, wanted))
  return { widthPx, heightPx: Math.round((widthPx * 3) / 4) }
}

const MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/**
 * @param {number} width
 * @param {number} height
 * @param {number} [maxEdge]
 * @returns {{ width: number, height: number, scaled: boolean }} The size to draw at.
 */
export function fitWithin(width, height, maxEdge = MAX_IMAGE_EDGE) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 0, height: 0, scaled: false }
  }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height, scaled: false }
  const factor = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
    scaled: true,
  }
}

/**
 * @param {string} base64 Raw base64, or a `data:` URL (its prefix is dropped).
 * @param {string} mediaType One of PNG, JPEG, WebP or GIF — never SVG (markup, not pixels).
 * @returns {{ type: 'image', source: { type: 'base64', media_type: string, data: string } }}
 */
export function imagePart(base64, mediaType) {
  if (!MEDIA_TYPES.has(mediaType)) throw new Error(`The image media type ${mediaType} is not supported`)
  const comma = base64.startsWith('data:') ? base64.indexOf(',') : -1
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: comma === -1 ? base64 : base64.slice(comma + 1) } }
}

/**
 * Decode `blob`, draw it at {@link fitWithin}'s size and re-encode as JPEG.
 *
 * @param {Blob} blob
 * @param {object} [options]
 * @param {number} [options.maxEdge]
 * @param {(blob: Blob) => Promise<{ width: number, height: number, close?: () => void }>} [options.createImageBitmap]
 * @param {(width: number, height: number) => { width: number, height: number, getContext: (kind: '2d') => any, toDataURL: (type: string, quality?: number) => string }} [options.makeCanvas]
 * @returns {Promise<ReturnType<typeof imagePart>>}
 * @throws {Error} with a plain message when the image cannot be decoded or is empty.
 */
export async function downscaleToImagePart(blob, options = {}) {
  const {
    maxEdge = MAX_IMAGE_EDGE,
    createImageBitmap: decode = globalThis.createImageBitmap?.bind(globalThis),
    makeCanvas = (width, height) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return canvas
    },
  } = options
  /** @type {Awaited<ReturnType<NonNullable<typeof decode>>>} */
  let bitmap
  try {
    bitmap = await /** @type {NonNullable<typeof decode>} */ (decode)(blob)
  } catch {
    throw new Error('The image could not be decoded')
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height, maxEdge)
    if (size.width === 0) throw new Error('The image is empty')
    const canvas = makeCanvas(size.width, size.height)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, size.width, size.height)
    return imagePart(canvas.toDataURL('image/jpeg', 0.85), 'image/jpeg')
  } finally {
    bitmap.close?.()
  }
}
