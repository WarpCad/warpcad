// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `asset.image` record — a reference photo saved inside the project — and the one
 * validator every copy of it passes through (`TODO/sketch-003`).
 *
 * ## Why this is untrusted input
 *
 * A project can come from anywhere: a file someone sent, a repository, a `#/gist/<id>`
 * link (ACCEPTANCE scenario 8). The project is JSON, so no record can execute, but an
 * embedded image is still attacker-controlled bytes about to be handed to a decoder. So
 * every `asset.image` record — at import, at load, and on every local append — goes
 * through {@link validateImageAsset}, which:
 *
 * - accepts **only** `image/png`, `image/jpeg` and `image/webp`. No SVG (it can carry
 *   `<script>`), no GIF, no HEIC;
 * - accepts **only** inline base64 data. There is no URL field, and any field it does
 *   not know is a refusal, not ignored — a remote reference would make the browser fetch
 *   it on load (a tracking pixel, or a request to an internal address);
 * - checks the bytes are what the record says: base64 charset and length, a size cap,
 *   magic bytes that match the declared MIME, and header dimensions that match the
 *   declared `widthPx`/`heightPx`;
 * - reads those dimensions **from the header, without decoding**, and refuses anything
 *   over {@link MAX_SIDE_PX} on a side or {@link MAX_PIXELS} in total, so a small file that
 *   declares 50 000 × 50 000 px never reaches a decoder (a decompression bomb).
 *
 * It returns `{ ok, reason }` and **never throws**, whatever it is handed — a getter that
 * throws included.
 *
 * Framework-free: no DOM, no Vue. Runs in Node, the main thread and the image worker.
 *
 * @module sketch/imageAsset
 */

/** The op of the record. A data record: it never reaches the kernel. */
export const ASSET_OP = 'asset.image'

/** The only MIME types an image may have — rasters a browser decodes without scripting. */
export const ALLOWED_MIMES = Object.freeze(['image/png', 'image/jpeg', 'image/webp'])

/** Largest side, in pixels, of an image the validator lets near a decoder. */
export const MAX_SIDE_PX = 8192

/** Largest image, in pixels, the validator lets near a decoder (40 MP). */
export const MAX_PIXELS = 40_000_000

/** Import downscales so the long edge is at most this. */
export const IMPORT_MAX_EDGE_PX = 2048

/** The cap on the stored image's bytes (1.5 MB), after import has re-encoded it. */
export const MAX_ASSET_BYTES = 1.5 * 1024 * 1024

/** The longest `dataBase64` that can hold {@link MAX_ASSET_BYTES}. */
const MAX_BASE64_LENGTH = Math.ceil(MAX_ASSET_BYTES / 3) * 4

/** `img-` and a hex content hash. Nothing else: an id is shown in messages and used as a key. */
const ID_PATTERN = /^img-[0-9a-f]{16,64}$/

const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/

const RECORD_KEYS = Object.freeze(new Set(['id', 'op', 'params']))
const PARAM_KEYS = Object.freeze(new Set(['mime', 'widthPx', 'heightPx', 'dataBase64']))

/**
 * @typedef {object} ImageAssetParams
 * @property {'image/png' | 'image/jpeg' | 'image/webp'} mime
 * @property {number} widthPx
 * @property {number} heightPx
 * @property {string} dataBase64
 */

/**
 * @typedef {object} ImageAssetRecord
 * @property {string} id `img-` + a content hash of the sanitized bytes.
 * @property {'asset.image'} op
 * @property {ImageAssetParams} params
 */

/**
 * @typedef {{ ok: true, mime: string, widthPx: number, heightPx: number } | { ok: false, reason: string }} ImageAssetVerdict
 */

/**
 * Check an `asset.image` record. Never throws.
 *
 * @param {unknown} record
 * @returns {ImageAssetVerdict}
 */
export function validateImageAsset(record) {
  try {
    return check(record)
  } catch (error) {
    // A getter that throws, a proxy that lies — whatever it is, it is not an image.
    return { ok: false, reason: `the record could not be read (${error instanceof Error ? error.message : 'unknown error'})` }
  }
}

/**
 * @param {unknown} record
 * @returns {ImageAssetVerdict}
 */
function check(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return refuse('the record is not an object')
  const value = /** @type {Record<string, unknown>} */ (record)
  for (const key of Object.keys(value)) {
    if (!RECORD_KEYS.has(key)) return refuse(`unexpected field "${key}" — an image record holds only inline data`)
  }
  if (value.op !== ASSET_OP) return refuse(`op must be "${ASSET_OP}"`)
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) return refuse('id must be "img-" followed by a hex hash')
  const params = value.params
  if (params === null || typeof params !== 'object' || Array.isArray(params)) return refuse('params must be an object')
  const p = /** @type {Record<string, unknown>} */ (params)
  for (const key of Object.keys(p)) {
    if (!PARAM_KEYS.has(key)) return refuse(`unexpected field "${key}" — an image record holds only inline data`)
  }
  const mime = p.mime
  if (typeof mime !== 'string' || !ALLOWED_MIMES.includes(mime)) {
    return refuse(`${typeof mime === 'string' ? mime : 'that type'} is not allowed — only PNG, JPEG or WebP`)
  }
  for (const key of ['widthPx', 'heightPx']) {
    const size = p[key]
    if (typeof size !== 'number' || !Number.isInteger(size)) return refuse(`${key} must be a whole number`)
  }
  const widthPx = /** @type {number} */ (p.widthPx)
  const heightPx = /** @type {number} */ (p.heightPx)
  const data = p.dataBase64
  if (typeof data !== 'string') return refuse('dataBase64 must be text')
  if (data.length === 0) return refuse('the image data is empty')
  if (data.length > MAX_BASE64_LENGTH) return refuse(`the image is larger than ${MAX_ASSET_BYTES / (1024 * 1024)} MB`)
  if (data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) return refuse('the image data is not base64')

  const bytes = bytesFromBase64(data)
  const header = readImageHeader(bytes)
  if (header === null) return refuse('the data is not a PNG, JPEG or WebP image (or its header is truncated)')
  if (header.mime !== mime) return refuse(`the data is a ${shortName(header.mime)} image, declared as ${mime}`)
  const sizeProblem = dimensionProblem(header.widthPx, header.heightPx)
  if (sizeProblem) return refuse(sizeProblem)
  if (header.widthPx !== widthPx || header.heightPx !== heightPx) {
    return refuse(`the record says ${widthPx} × ${heightPx} px but the image is ${header.widthPx} × ${header.heightPx} px`)
  }
  return { ok: true, mime, widthPx, heightPx }
}

/** @param {string} reason @returns {{ ok: false, reason: string }} */
function refuse(reason) {
  return { ok: false, reason }
}

/** @param {string} mime */
function shortName(mime) {
  return mime === 'image/png' ? 'PNG' : mime === 'image/jpeg' ? 'JPEG' : 'WebP'
}

/**
 * Why an image of this size is refused, or `''`. Shared by load and import, so both draw
 * the line in the same place.
 *
 * @param {number} widthPx
 * @param {number} heightPx
 * @returns {string}
 */
export function dimensionProblem(widthPx, heightPx) {
  if (!(widthPx > 0 && heightPx > 0)) return 'the image has zero width or height'
  if (widthPx > MAX_SIDE_PX || heightPx > MAX_SIDE_PX) {
    return `the image is ${widthPx} × ${heightPx} px, too large (at most ${MAX_SIDE_PX} px on a side)`
  }
  if (widthPx * heightPx > MAX_PIXELS) {
    const mp = ((widthPx * heightPx) / 1e6).toFixed(1)
    return `the image is ${mp} megapixels — at most ${MAX_PIXELS / 1e6} megapixels; export a smaller copy`
  }
  return ''
}

// --- header parsing, without decoding ----------------------------------------------

/**
 * @typedef {object} ImageHeader
 * @property {'image/png' | 'image/jpeg' | 'image/webp'} mime What the magic bytes say.
 * @property {number} widthPx
 * @property {number} heightPx
 */

/**
 * Read an image's type and size from its header, **without decoding it**: PNG `IHDR`, JPEG
 * `SOFn`, WebP `VP8 ` / `VP8L` / `VP8X`. Never throws.
 *
 * @param {Uint8Array} bytes
 * @returns {ImageHeader | null} `null` for anything else, or a header cut short.
 */
export function readImageHeader(bytes) {
  try {
    if (isPng(bytes)) return pngHeader(bytes)
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return jpegHeader(bytes)
    if (isWebp(bytes)) return webpHeader(bytes)
    return null
  } catch {
    return null
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** @param {Uint8Array} bytes */
function isPng(bytes) {
  return bytes.length >= 8 && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

/** @param {Uint8Array} bytes */
function isWebp(bytes) {
  return bytes.length >= 12 && text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WEBP'
}

/** @param {Uint8Array} bytes @param {number} at @param {number} length */
function text(bytes, at, length) {
  let out = ''
  for (let index = at; index < at + length; index += 1) out += String.fromCharCode(bytes[index])
  return out
}

/** @param {Uint8Array} bytes @param {number} at */
function u32be(bytes, at) {
  return ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]
}

/** @param {Uint8Array} bytes @param {number} at */
function u16be(bytes, at) {
  return (bytes[at] << 8) + bytes[at + 1]
}

/** @param {Uint8Array} bytes @param {number} at */
function u24le(bytes, at) {
  return bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16)
}

/**
 * @param {Uint8Array} bytes
 * @returns {ImageHeader | null}
 */
function pngHeader(bytes) {
  // The first chunk must be IHDR: length (4), type (4), then width and height.
  if (bytes.length < 24 || text(bytes, 12, 4) !== 'IHDR') return null
  return { mime: 'image/png', widthPx: u32be(bytes, 16), heightPx: u32be(bytes, 20) }
}

/** Start-of-frame markers that carry the image size: C0-CF except DHT (C4), JPG (C8) and DAC (CC). */
/** @param {number} marker */
function isSof(marker) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

/**
 * Walk the JPEG's segments to the first frame header. Bounded by the byte count, so a
 * crafted file cannot loop.
 *
 * @param {Uint8Array} bytes
 * @returns {ImageHeader | null}
 */
function jpegHeader(bytes) {
  let at = 2
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) return null
    // Fill bytes: any number of 0xFF before the marker.
    let marker = bytes[at + 1]
    while (marker === 0xff && at + 2 < bytes.length) {
      at += 1
      marker = bytes[at + 1]
    }
    at += 2
    // Markers with no length field.
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue
    if (marker === 0xd9 || marker === 0xda) return null // end, or the scan, before any frame header
    if (at + 1 >= bytes.length) return null
    const length = u16be(bytes, at)
    if (length < 2) return null
    if (isSof(marker)) {
      if (at + 6 >= bytes.length) return null
      return { mime: 'image/jpeg', heightPx: u16be(bytes, at + 3), widthPx: u16be(bytes, at + 5) }
    }
    at += length
  }
  return null
}

/**
 * @param {Uint8Array} bytes
 * @returns {ImageHeader | null}
 */
function webpHeader(bytes) {
  const chunk = text(bytes, 12, 4)
  if (chunk === 'VP8 ') {
    // Frame tag (3 bytes) at 20, then the start code 9d 01 2a, then 14-bit sizes.
    if (bytes.length < 30 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
    return { mime: 'image/webp', widthPx: (bytes[26] | (bytes[27] << 8)) & 0x3fff, heightPx: (bytes[28] | (bytes[29] << 8)) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)
    return { mime: 'image/webp', widthPx: (bits & 0x3fff) + 1, heightPx: ((bits >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    if (bytes.length < 30) return null
    return { mime: 'image/webp', widthPx: u24le(bytes, 24) + 1, heightPx: u24le(bytes, 27) + 1 }
  }
  return null
}

// --- base64 --------------------------------------------------------------------------

const CHUNK = 0x8000

/**
 * Bytes to base64, in chunks — `String.fromCharCode(...bytes)` on a megabyte overflows the
 * argument limit.
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base64FromBytes(bytes) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(index, index + CHUNK)))
  }
  return btoa(binary)
}

/**
 * Base64 to bytes. The caller has already checked the charset.
 *
 * @param {string} encoded
 * @returns {Uint8Array}
 */
export function bytesFromBase64(encoded) {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

// --- import ---------------------------------------------------------------------------

const HEIC_MESSAGE = 'Choose a JPEG or PNG — iPhone HEIC photos can be exported as JPEG'

/**
 * What **Add image…** says about a chosen file before reading it, or `''` when its type
 * is one it takes. The bytes are still sniffed afterwards: a file's declared type is a
 * hint, not a fact.
 *
 * @param {string} type The file's MIME type, possibly empty.
 * @param {string} name The file's name.
 * @returns {string}
 */
export function importTypeProblem(type, name) {
  if (ALLOWED_MIMES.includes(type)) return ''
  if (/heic|heif/i.test(type) || /\.(heic|heif)$/i.test(name)) return HEIC_MESSAGE
  if (type === '' && /\.(png|jpe?g|webp)$/i.test(name)) return ''
  return 'Choose a PNG, JPEG or WebP image'
}

/**
 * The record id for sanitized bytes: `img-` and the first 24 hex digits of their SHA-256,
 * so the same photo added twice is the same record.
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<string>}
 */
export async function assetIdFor(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', /** @type {any} */ (bytes)))
  let hex = ''
  for (let index = 0; index < 12; index += 1) hex += digest[index].toString(16).padStart(2, '0')
  return `img-${hex}`
}
