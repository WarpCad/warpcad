// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { importImage } from '../sketch/imageJob.js'
import { base64FromBytes, bytesFromBase64 } from '../sketch/imageAsset.js'
import { prepareReference } from './reference.js'
import useAgentSource from '../composables/useAgent.js?raw'

/**
 * `TODO/ai-008` — an attached drawing is untrusted bytes, and it may end up stored in the
 * project as a slice's reference image. So the chat's **Attach** goes through `sketch-003`'s
 * sanitiser (`importImage`: sniff the bytes, read the size from the header before decoding,
 * re-encode so only pixels survive) **before** anything is made of it — the image the model is
 * sent is built from the sanitised record's bytes, never from the file. These specs prove the
 * hostile cases are refused by the real sanitiser in this path and that no other path exists.
 */

/** @param {number} value */
const u32be = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
/** @param {string} text */
const ascii = (text) => [...text].map((char) => char.charCodeAt(0))
/** @param {number} width @param {number} height */
const png = (width, height) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 2, 0, 0, 0, ...u32be(0), ...u32be(0), ...ascii('IEND'), ...u32be(0)])

/**
 * @param {BlobPart[]} parts
 * @param {string} name
 * @param {string} type
 */
const file = (parts, name, type) => Object.assign(new Blob(parts, { type }), { name })

describe('prepareReference: the real sanitiser refuses hostile images before anything is sent', () => {
  /** @type {Array<[string, Blob & { name: string }, RegExp]>} */
  const hostile = [
    ['an SVG carrying a script', file(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'board.svg', 'image/svg+xml'), /PNG, JPEG or WebP/],
    ['an SVG renamed .png with an empty type', file(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], 'board.png', ''), /not a PNG, JPEG or WebP/],
    ['a decompression bomb (huge header, tiny file)', file([png(30000, 30000)], 'bomb.png', 'image/png'), /Can't use that photo/],
    ['a truncated PNG', file([png(10, 10).slice(0, 18)], 'cut.png', 'image/png'), /not a PNG, JPEG or WebP/],
  ]

  for (const [label, bad, reason] of hostile) {
    it(`refuses ${label}, and never builds an image for the model from it`, async () => {
      const downscale = vi.fn()
      const result = await prepareReference(bad, { importImage: (f) => importImage(f).then((r) => ({ superseded: false, result: r })), downscale })
      expect(result.ok).toBe(false)
      expect(/** @type {any} */ (result).reason).toMatch(reason)
      expect(downscale).not.toHaveBeenCalled()
    })
  }
})

describe('prepareReference: what the model is sent comes from the sanitised bytes', () => {
  it('builds the image part from the re-encoded record, not the original file', async () => {
    const sanitised = png(1200, 900)
    const record = { id: 'img-aaaaaaaaaaaaaaaaaaaaaaaa', op: 'asset.image', params: { mime: 'image/png', widthPx: 1200, heightPx: 900, dataBase64: base64FromBytes(sanitised) } }
    const bitmap = { width: 1200, height: 900 }
    /** @type {Blob | null} */
    let seen = null
    const result = await prepareReference(file(['ORIGINAL-BYTES-WITH-EXIF'], 'board.jpg', 'image/jpeg'), {
      importImage: async () => ({ superseded: false, result: { ok: true, record: /** @type {any} */ (record), bitmap: /** @type {any} */ (bitmap) } }),
      downscale: async (blob) => {
        seen = blob
        return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'U0FOSVRJU0VE' } }
      },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(seen).not.toBeNull()
    const sent = new Uint8Array(await /** @type {Blob} */ (/** @type {unknown} */ (seen)).arrayBuffer())
    expect([...sent]).toEqual([...bytesFromBase64(record.params.dataBase64)])
    expect(/** @type {Blob} */ (/** @type {unknown} */ (seen)).type).toBe('image/png')
    expect(result.reference.record).toBe(record)
    expect(result.reference.bitmap).toBe(bitmap)
    // 1200 × 900 fits the 1568 px edge, so the model sees it at the stored size.
    expect(result.reference.sent).toEqual({ mediaType: 'image/jpeg', data: 'U0FOSVRJU0VE', widthPx: 1200, heightPx: 900 })
    expect(result.part.source.data).toBe('U0FOSVRJU0VE')
  })

  it('reports the downscaled size when the stored image is larger than the model edge', async () => {
    const record = { id: 'img-bbbbbbbbbbbbbbbbbbbbbbbb', op: 'asset.image', params: { mime: 'image/jpeg', widthPx: 2048, heightPx: 1024, dataBase64: 'AAAA' } }
    const result = await prepareReference(file(['x'], 'big.jpg', 'image/jpeg'), {
      importImage: async () => ({ superseded: false, result: { ok: true, record: /** @type {any} */ (record), bitmap: /** @type {any} */ ({}) } }),
      downscale: async () => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'U01BTEw=' } }),
    })
    expect(result.ok && result.reference.sent.widthPx).toBe(1568)
    expect(result.ok && result.reference.sent.heightPx).toBe(784)
  })

  it('a superseded import is not an attachment', async () => {
    const result = await prepareReference(file(['x'], 'a.png', 'image/png'), {
      importImage: async () => ({ superseded: true }),
      downscale: vi.fn(),
    })
    expect(result).toEqual({ ok: false, reason: '' })
  })
})

describe('there is no other way in', () => {
  it('the chat’s attach goes through prepareReference and never downscales a file directly', () => {
    const code = useAgentSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).toMatch(/prepareReference\(/)
    expect(code).not.toMatch(/downscaleToImagePart\(\s*file/)
  })
})
