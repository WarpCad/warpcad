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
 * Framework-free: bytes in, bytes out.
 *
 * @module core/zip
 */

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
