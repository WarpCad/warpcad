// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A minimal zip writer (and reader) for Export → Print pieces (`TODO/io-007`).
 *
 * **Stored, not deflated.** Print pieces are a handful of binary STLs, which deflate poorly
 * anyway, and storing keeps this to a CRC and two headers per file — about a hundred lines
 * with no dependency, rather than a new production package and its licence review
 * (`npm run licenses`). Every zip reader (Windows Explorer, macOS Archive Utility, iOS Files,
 * every slicer that opens zips) reads method 0.
 *
 * File names are written UTF-8 with the language-encoding flag set. No timestamps beyond a
 * fixed 1980-01-01 — the bytes depend only on the files, so the same export is the same zip.
 *
 * ## Reading a zip someone else wrote (`TODO/io-024`)
 *
 * A 3MF is a zip, deflated, from any program. {@link listZipEntries} finds its entries through
 * the **central directory**, not the local headers, because a writer may leave a local header's
 * sizes zero and put them in a data descriptor after the data. {@link readZipEntry} then reads
 * one entry — stored or deflated — on demand, so a 3MF's thumbnails are never inflated at all.
 * Encryption, zip64 and split archives are refused; every offset is checked against the file;
 * every CRC is verified; and a deflated entry is inflated with `./shareLink.js`'s bounded inflate,
 * which stops the moment output passes the caller's limit. The bytes are untrusted throughout:
 * every refusal is `{ ok: false, reason }` in words, never a throw.
 *
 * Framework-free: bytes in, bytes out.
 *
 * @module core/zip
 */

import { inflate } from './shareLink.js'

/** CRC-32 (IEEE) lookup table, built once. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/**
 * CRC-32 of `bytes`, as zip stores it.
 *
 * @param {Uint8Array} bytes
 * @returns {number}
 */
export function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** General-purpose flag bit 11: names are UTF-8. */
const UTF8_FLAG = 0x0800
/** MS-DOS date for 1980-01-01. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1

/**
 * Build a stored zip of `files`, in order.
 *
 * @param {readonly { name: string, bytes: Uint8Array }[]} files Names must be unique.
 * @returns {Uint8Array}
 */
export function createZip(files) {
  const encoder = new TextEncoder()
  const names = new Set()
  const entries = files.map((file) => {
    if (names.has(file.name)) throw new Error(`createZip: duplicate file name "${file.name}"`)
    names.add(file.name)
    return { name: encoder.encode(file.name), bytes: file.bytes, crc: crc32(file.bytes) }
  })

  const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.bytes.length, 0)
  const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0)
  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)

  let at = 0
  /** @type {number[]} */
  const offsets = []
  for (const entry of entries) {
    offsets.push(at)
    view.setUint32(at, 0x04034b50, true)
    view.setUint16(at + 4, 20, true) // version needed: 2.0
    view.setUint16(at + 6, UTF8_FLAG, true)
    view.setUint16(at + 8, 0, true) // stored
    view.setUint16(at + 10, 0, true) // time
    view.setUint16(at + 12, DOS_DATE, true)
    view.setUint32(at + 14, entry.crc, true)
    view.setUint32(at + 18, entry.bytes.length, true)
    view.setUint32(at + 22, entry.bytes.length, true)
    view.setUint16(at + 26, entry.name.length, true)
    view.setUint16(at + 28, 0, true)
    out.set(entry.name, at + 30)
    out.set(entry.bytes, at + 30 + entry.name.length)
    at += 30 + entry.name.length + entry.bytes.length
  }

  const centralStart = at
  entries.forEach((entry, index) => {
    view.setUint32(at, 0x02014b50, true)
    view.setUint16(at + 4, 20, true) // made by
    view.setUint16(at + 6, 20, true) // needed
    view.setUint16(at + 8, UTF8_FLAG, true)
    view.setUint16(at + 10, 0, true)
    view.setUint16(at + 12, 0, true)
    view.setUint16(at + 14, DOS_DATE, true)
    view.setUint32(at + 16, entry.crc, true)
    view.setUint32(at + 20, entry.bytes.length, true)
    view.setUint32(at + 24, entry.bytes.length, true)
    view.setUint16(at + 28, entry.name.length, true)
    // extra, comment, disk, internal attrs: 0; external attrs 0; then offset
    view.setUint32(at + 42, offsets[index], true)
    out.set(entry.name, at + 46)
    at += 46 + entry.name.length
  })

  view.setUint32(at, 0x06054b50, true)
  view.setUint16(at + 8, entries.length, true)
  view.setUint16(at + 10, entries.length, true)
  view.setUint32(at + 12, at - centralStart, true)
  view.setUint32(at + 16, centralStart, true)
  return out
}

/**
 * Read a stored zip written by {@link createZip} back into its files, checking each CRC.
 *
 * @param {Uint8Array} zip
 * @returns {{ name: string, bytes: Uint8Array }[]}
 * @throws {Error} on anything that is not a stored zip, or a CRC mismatch.
 */
export function readZip(zip) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const decoder = new TextDecoder()
  /** @type {{ name: string, bytes: Uint8Array }[]} */
  const files = []
  let at = 0
  while (at + 4 <= zip.length && view.getUint32(at, true) === 0x04034b50) {
    if (view.getUint16(at + 8, true) !== 0) throw new Error('readZip: only stored entries are supported')
    const crc = view.getUint32(at + 14, true)
    const size = view.getUint32(at + 18, true)
    const nameLength = view.getUint16(at + 26, true)
    const extraLength = view.getUint16(at + 28, true)
    const name = decoder.decode(zip.subarray(at + 30, at + 30 + nameLength))
    const start = at + 30 + nameLength + extraLength
    const bytes = zip.slice(start, start + size)
    if (crc32(bytes) !== crc) throw new Error(`readZip: CRC mismatch for "${name}"`)
    files.push({ name, bytes })
    at = start + size
  }
  return files
}

// --- reading a zip from elsewhere (TODO/io-024) ------------------------------------------

/** The reader's caps, in one place. */
export const ZIP_LIMITS = Object.freeze({
  /** Entries one package may list. The Feather's 3MF lists 90. */
  maxEntries: 10_000,
})

/**
 * @typedef {object} ZipEntry One central-directory entry.
 * @property {string} name
 * @property {number} method 0 stored, 8 deflated.
 * @property {number} crc
 * @property {number} compressedSize
 * @property {number} uncompressedSize
 * @property {number} localOffset Where its local header starts.
 */

/** @typedef {{ ok: false, reason: string }} ZipRefusal */

const END_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50
const END_SIZE = 22
const MAX_COMMENT = 0xffff

/** @param {string} reason @returns {ZipRefusal} */
function refuse(reason) {
  return { ok: false, reason }
}

/**
 * The entries of a zip, by name, read from its central directory. Never throws.
 *
 * @param {Uint8Array} zip
 * @param {{ maxEntries?: number }} [limits]
 * @returns {{ ok: true, entries: Map<string, ZipEntry> } | ZipRefusal}
 */
export function listZipEntries(zip, limits = {}) {
  try {
    const maxEntries = limits.maxEntries ?? ZIP_LIMITS.maxEntries
    if (!(zip instanceof Uint8Array) || zip.length < END_SIZE) return refuse('it is not a zip package')
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    // The end record is the last thing in the file, followed only by its own comment.
    let end = -1
    const lowest = Math.max(0, zip.length - END_SIZE - MAX_COMMENT)
    for (let at = zip.length - END_SIZE; at >= lowest; at -= 1) {
      if (view.getUint32(at, true) === END_SIGNATURE && at + END_SIZE + view.getUint16(at + 20, true) <= zip.length) {
        end = at
        break
      }
    }
    if (end === -1) return refuse('it is not a zip package')
    if (end >= 20 && view.getUint32(end - 20, true) === ZIP64_LOCATOR_SIGNATURE) return refuse('it is a zip64 package, which is not read')
    const disk = view.getUint16(end + 4, true)
    const directoryDisk = view.getUint16(end + 6, true)
    const onDisk = view.getUint16(end + 8, true)
    const total = view.getUint16(end + 10, true)
    const directorySize = view.getUint32(end + 12, true)
    const directoryOffset = view.getUint32(end + 16, true)
    if (total === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
      return refuse('it is a zip64 package, which is not read')
    }
    if (disk !== 0 || directoryDisk !== 0 || onDisk !== total) return refuse('it is split across several files, which is not read')
    if (total > maxEntries) return refuse(`it holds more than ${maxEntries} files`)
    if (directoryOffset + directorySize > end) return refuse('its central directory runs past the end of the file (truncated?)')

    const decoder = new TextDecoder('utf-8')
    /** @type {Map<string, ZipEntry>} */
    const entries = new Map()
    let at = directoryOffset
    const stop = directoryOffset + directorySize
    for (let index = 0; index < total; index += 1) {
      if (at + 46 > stop || view.getUint32(at, true) !== CENTRAL_SIGNATURE) return refuse('its central directory is damaged')
      const flags = view.getUint16(at + 8, true)
      const method = view.getUint16(at + 10, true)
      const crc = view.getUint32(at + 16, true)
      const compressedSize = view.getUint32(at + 20, true)
      const uncompressedSize = view.getUint32(at + 24, true)
      const nameLength = view.getUint16(at + 28, true)
      const extraLength = view.getUint16(at + 30, true)
      const commentLength = view.getUint16(at + 32, true)
      const localOffset = view.getUint32(at + 42, true)
      const next = at + 46 + nameLength + extraLength + commentLength
      if (next > stop) return refuse('its central directory is damaged')
      const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength))
      if (flags & 0x0041) return refuse(`"${name}" is encrypted`)
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
        return refuse('it is a zip64 package, which is not read')
      }
      if (method !== 0 && method !== 8) return refuse(`"${name}" uses compression method ${method}; only stored and deflated are read`)
      if (entries.has(name)) return refuse(`it lists "${name}" twice`)
      entries.set(name, { name, method, crc, compressedSize, uncompressedSize, localOffset })
      at = next
    }
    return { ok: true, entries }
  } catch (error) {
    return refuse(`it could not be read as a zip (${error instanceof Error ? error.message : 'unknown error'})`)
  }
}

/**
 * Read one entry's bytes: stored, or inflated up to `maxBytes`. Checks where its data lies, its
 * size and its CRC. Never throws.
 *
 * @param {Uint8Array} zip
 * @param {ZipEntry} entry From {@link listZipEntries} of the same bytes.
 * @param {number} maxBytes The largest the entry may be once read.
 * @returns {Promise<{ ok: true, bytes: Uint8Array } | ZipRefusal>}
 */
export async function readZipEntry(zip, entry, maxBytes) {
  try {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    const tooLarge = () => refuse(`"${entry.name}" is larger than ${Math.round(maxBytes / (1024 * 1024))} MB once unpacked`)
    if (entry.uncompressedSize > maxBytes) return tooLarge()
    if (entry.localOffset + 30 > zip.length) return refuse(`"${entry.name}" starts past the end of the file (truncated?)`)
    if (view.getUint32(entry.localOffset, true) !== LOCAL_SIGNATURE) return refuse(`"${entry.name}" is damaged`)
    const start = entry.localOffset + 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true)
    const stop = start + entry.compressedSize
    if (stop > zip.length) return refuse(`"${entry.name}" runs past the end of the file (truncated?)`)
    const stored = zip.subarray(start, stop)
    /** @type {Uint8Array} */
    let bytes
    if (entry.method === 0) {
      bytes = stored
    } else {
      /** @type {Uint8Array | 'too-large'} */
      let inflated
      try {
        inflated = await inflate(stored, maxBytes)
      } catch {
        return refuse(`"${entry.name}" is damaged: its compressed data cannot be unpacked`)
      }
      if (inflated === 'too-large') return tooLarge()
      bytes = inflated
    }
    if (bytes.length !== entry.uncompressedSize) return refuse(`"${entry.name}" is damaged: its size does not match the directory`)
    if (crc32(bytes) !== entry.crc) return refuse(`"${entry.name}" is damaged: its CRC does not match`)
    return { ok: true, bytes }
  } catch (error) {
    return refuse(`"${entry.name}" could not be read (${error instanceof Error ? error.message : 'unknown error'})`)
  }
}
