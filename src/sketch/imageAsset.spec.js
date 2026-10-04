// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  ASSET_OP,
  MAX_ASSET_BYTES,
  MAX_SIDE_PX,
  base64FromBytes,
  bytesFromBase64,
  importTypeProblem,
  readImageHeader,
  validateImageAsset,
} from './imageAsset.js'

// --- byte fixtures, built here so the spec owns every byte it trusts ------------------

/** @param {number} value @returns {number[]} big-endian u32 */
const u32be = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
/** @param {number} value @returns {number[]} little-endian u32 */
const u32le = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]
/** @param {string} text @returns {number[]} */
const ascii = (text) => [...text].map((char) => char.charCodeAt(0))

/** A PNG with just a signature, an IHDR and an IEND — no pixels, which is all a header read needs. @param {number} width @param {number} height */
function png(width, height) {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 2, 0, 0, 0, ...u32be(0),
    ...u32be(0), ...ascii('IEND'), ...u32be(0),
  ])
}

/**
 * A JPEG: SOI, an APP0 (JFIF) segment, then a baseline SOF0 carrying the size, then EOI.
 * @param {number} width @param {number} height @param {{ sofMarker?: number, app1Length?: number }} [options]
 */
function jpeg(width, height, { sofMarker = 0xc0, app1Length = 0 } = {}) {
  const app1 = app1Length > 0 ? [0xff, 0xe1, (app1Length >> 8) & 255, app1Length & 255, ...new Array(app1Length - 2).fill(0)] : []
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    ...app1,
    0xff, sofMarker, 0x00, 0x11, 8, (height >> 8) & 255, height & 255, (width >> 8) & 255, width & 255, 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xd9,
  ])
}

/** A lossy WebP (`VP8 `): the frame tag, the start code and the 14-bit dimensions. @param {number} width @param {number} height */
function webpLossy(width, height) {
  const frame = [0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, width & 255, (width >> 8) & 0x3f, height & 255, (height >> 8) & 0x3f]
  return new Uint8Array([...ascii('RIFF'), ...u32le(4 + 8 + frame.length), ...ascii('WEBP'), ...ascii('VP8 '), ...u32le(frame.length), ...frame])
}

/** A lossless WebP (`VP8L`): the 0x2f signature, then width-1 and height-1 in 14 bits each. @param {number} width @param {number} height */
function webpLossless(width, height) {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)
  const body = [0x2f, ...u32le(bits)]
  return new Uint8Array([...ascii('RIFF'), ...u32le(4 + 8 + body.length), ...ascii('WEBP'), ...ascii('VP8L'), ...u32le(body.length), ...body])
}

/** An extended WebP (`VP8X`): the canvas size, minus one, in 24 bits each. @param {number} width @param {number} height */
function webpExtended(width, height) {
  const w = width - 1
  const h = height - 1
  const body = [0, 0, 0, 0, w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255]
  return new Uint8Array([...ascii('RIFF'), ...u32le(4 + 8 + body.length), ...ascii('WEBP'), ...ascii('VP8X'), ...u32le(body.length), ...body])
}

const ID = 'img-0123456789abcdef01234567'

/**
 * @param {Uint8Array} bytes
 * @param {string} mime
 * @param {number} widthPx
 * @param {number} heightPx
 * @param {Record<string, unknown>} [extra]
 */
function record(bytes, mime, widthPx, heightPx, extra = {}) {
  return { id: ID, op: ASSET_OP, params: { mime, widthPx, heightPx, dataBase64: base64FromBytes(bytes), ...extra } }
}

// --- the valid cases ----------------------------------------------------------------

describe('validateImageAsset — valid minimal images pass with the right dimensions', () => {
  it.each([
    ['PNG', png(640, 480), 'image/png', 640, 480],
    ['JPEG (SOF0)', jpeg(2048, 1536), 'image/jpeg', 2048, 1536],
    ['JPEG (progressive SOF2, behind a 2 KB APP1)', jpeg(1200, 900, { sofMarker: 0xc2, app1Length: 2048 }), 'image/jpeg', 1200, 900],
    ['WebP lossy', webpLossy(300, 200), 'image/webp', 300, 200],
    ['WebP lossless', webpLossless(301, 199), 'image/webp', 301, 199],
    ['WebP extended', webpExtended(8000, 4000), 'image/webp', 8000, 4000],
  ])('%s', (_name, bytes, mime, width, height) => {
    expect(readImageHeader(bytes)).toEqual({ mime, widthPx: width, heightPx: height })
    expect(validateImageAsset(record(bytes, mime, width, height))).toEqual({ ok: true, mime, widthPx: width, heightPx: height })
  })
})

// --- the hostile cases: each rejected with a reason, none throws ----------------------

describe('validateImageAsset — hostile input is rejected with a reason and never throws', () => {
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
  const cases = /** @type {[string, unknown, RegExp][]} */ ([
    ['an SVG MIME', record(svg, 'image/svg+xml', 10, 10), /image\/svg\+xml is not allowed/],
    ['a GIF MIME', record(png(1, 1), 'image/gif', 1, 1), /image\/gif is not allowed/],
    ['a url key on the record', { ...record(png(1, 1), 'image/png', 1, 1), url: 'https://tracker.example/p.png' }, /unexpected field "url"/],
    ['a src key in params', record(png(1, 1), 'image/png', 1, 1, { src: 'https://tracker.example/p.png' }), /unexpected field "src"/],
    ['a remote reference instead of data', { id: ID, op: ASSET_OP, params: { mime: 'image/png', widthPx: 1, heightPx: 1, url: 'https://tracker.example/p.png' } }, /unexpected field "url"/],
    ['an unknown extra key', record(png(1, 1), 'image/png', 1, 1, { exif: 'x' }), /unexpected field "exif"/],
    ['non-base64 characters', { id: ID, op: ASSET_OP, params: { mime: 'image/png', widthPx: 1, heightPx: 1, dataBase64: 'iVBO<script>==' } }, /not base64/],
    ['base64 of the wrong length', { id: ID, op: ASSET_OP, params: { mime: 'image/png', widthPx: 1, heightPx: 1, dataBase64: 'iVBORw0' } }, /not base64/],
    ['over the size cap', { id: ID, op: ASSET_OP, params: { mime: 'image/png', widthPx: 1, heightPx: 1, dataBase64: 'A'.repeat(Math.ceil(MAX_ASSET_BYTES / 3) * 4 + 4) } }, /larger than/],
    ['PNG magic bytes declared as image/jpeg', record(png(10, 10), 'image/jpeg', 10, 10), /PNG.*declared as image\/jpeg/],
    ['a PNG IHDR declaring 50 000 × 50 000', record(png(50000, 50000), 'image/png', 50000, 50000), /50000 × 50000.*too large/],
    ['a 40 MP+ image inside the side limit', record(png(8000, 6000), 'image/png', 8000, 6000), /megapixels/],
    ['declared widthPx different from the header', record(png(640, 480), 'image/png', 641, 480), /says 641 × 480.*640 × 480/],
    ['a truncated header', { id: ID, op: ASSET_OP, params: { mime: 'image/png', widthPx: 1, heightPx: 1, dataBase64: base64FromBytes(png(1, 1).slice(0, 18)) } }, /truncated|not a PNG, JPEG or WebP/],
    ['a JPEG with no frame header before the scan', { id: ID, op: ASSET_OP, params: { mime: 'image/jpeg', widthPx: 1, heightPx: 1, dataBase64: base64FromBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])) } }, /not a PNG, JPEG or WebP/],
    ['an empty string', { id: ID, op: ASSET_OP, params: { mime: 'image/png', widthPx: 1, heightPx: 1, dataBase64: '' } }, /empty/],
    ['a zero-size image', record(png(0, 10), 'image/png', 0, 10), /zero/],
    ['a bad id', { ...record(png(1, 1), 'image/png', 1, 1), id: '../../etc' }, /id/],
    ['a lineage field', { ...record(png(1, 1), 'image/png', 1, 1), supersedes: 'cube-1' }, /unexpected field "supersedes"/],
    ['no params', { id: ID, op: ASSET_OP }, /params/],
    ['not an object', 'asset', /not an object/],
    ['null', null, /not an object/],
    ['an array', [], /not an object/],
    ['a non-string base64', { id: ID, op: ASSET_OP, params: { mime: 'image/png', widthPx: 1, heightPx: 1, dataBase64: 42 } }, /dataBase64/],
    ['a non-integer width', record(png(1, 1), 'image/png', 1.5, 1), /whole number/],
  ])
  it.each(cases)('%s', (_name, input, reason) => {
    /** @type {any} */
    let verdict
    expect(() => {
      verdict = validateImageAsset(input)
    }).not.toThrow()
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(reason)
  })

  it('a getter that throws is still a refusal, not a crash', () => {
    const hostile = { id: ID, op: ASSET_OP, params: {} }
    Object.defineProperty(hostile.params, 'mime', { enumerable: true, get() { throw new Error('boom') } })
    const verdict = validateImageAsset(hostile)
    expect(verdict.ok).toBe(false)
  })

  it('a 50 000 px WebP extended header is refused before any decode', () => {
    expect(validateImageAsset(record(webpExtended(50000, 10), 'image/webp', 50000, 10))).toMatchObject({ ok: false })
  })

  it('MAX_SIDE_PX itself is allowed; one more is not', () => {
    expect(validateImageAsset(record(png(MAX_SIDE_PX, 100), 'image/png', MAX_SIDE_PX, 100)).ok).toBe(true)
    expect(validateImageAsset(record(png(MAX_SIDE_PX + 1, 100), 'image/png', MAX_SIDE_PX + 1, 100)).ok).toBe(false)
  })
})

describe('readImageHeader', () => {
  it('returns null for something that is not an allowed raster', () => {
    expect(readImageHeader(new TextEncoder().encode('GIF89a\x01\x00\x01\x00'))).toBeNull()
    expect(readImageHeader(new Uint8Array(0))).toBeNull()
  })

  it('stops a JPEG walk that would run off the end, without throwing', () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff])
    expect(() => readImageHeader(broken)).not.toThrow()
    expect(readImageHeader(broken)).toBeNull()
  })
})

describe('base64', () => {
  it('round-trips arbitrary bytes, including every byte value', () => {
    const bytes = new Uint8Array(70_000).map((_, index) => (index * 31) & 255)
    expect(bytesFromBase64(base64FromBytes(bytes))).toEqual(bytes)
  })
})

describe('importTypeProblem — what Add image says about a file it will not take', () => {
  it('accepts the three raster types', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) expect(importTypeProblem(type, '')).toBe('')
  })

  it('names the iPhone HEIC case specifically', () => {
    expect(importTypeProblem('image/heic', 'IMG_0001.HEIC')).toBe('Choose a JPEG or PNG — iPhone HEIC photos can be exported as JPEG')
    expect(importTypeProblem('', 'IMG_0001.heif')).toBe('Choose a JPEG or PNG — iPhone HEIC photos can be exported as JPEG')
  })

  it('refuses SVG and GIF by name', () => {
    expect(importTypeProblem('image/svg+xml', 'logo.svg')).toMatch(/PNG, JPEG or WebP/)
    expect(importTypeProblem('image/gif', 'a.gif')).toMatch(/PNG, JPEG or WebP/)
  })
})
