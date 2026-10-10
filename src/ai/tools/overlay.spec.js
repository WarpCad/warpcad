// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { base64FromBytes } from '../../sketch/imageAsset.js'
import { makeContext } from './__fixtures__/context.js'
import { addAttachment, createReferences } from './image.js'
import { createToolRegistry } from './index.js'

/**
 * `TODO/ai-008` — `capture_view({ view: 'top', overlay: 'reference' })`: the model drawn
 * semi-transparent over the reference image at its established scale, so the model (and the
 * user, in the activity row's thumbnail) can see whether what was built matches the drawing.
 * The framework-free half is tested here against a fake capture boundary; the three.js half is
 * `src/render/offscreenCapture.js`, driven for real by `e2e/ai-drawing.e2e.js`.
 */

const tools = createToolRegistry()

/** @param {number} value */
const u32be = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
/** @param {string} text */
const ascii = (text) => [...text].map((char) => char.charCodeAt(0))
/** @param {number} width @param {number} height */
const png = (width, height) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 2, 0, 0, 0, ...u32be(0), ...u32be(0), ...ascii('IEND'), ...u32be(0)])

const ASSET_ID = 'img-00112233445566778899aabb'
const BITMAP = { fake: 'bitmap' }

function fakeCapture() {
  /** @type {any[]} */
  const requests = []
  return {
    requests,
    /** @param {any} request */
    capture(request) {
      requests.push(request)
      return { mediaType: /** @type {'image/png'} */ ('image/png'), data: 'iVBORw0KGgo=', widthPx: request.widthPx, heightPx: request.heightPx, contentFraction: 0.4 }
    },
  }
}

function setup() {
  const document = createDocument()
  const references = createReferences()
  const id = addAttachment(references, {
    name: 'board.png',
    record: { id: ASSET_ID, op: 'asset.image', params: { mime: 'image/png', widthPx: 1000, heightPx: 700, dataBase64: base64FromBytes(png(1000, 700)) } },
    sent: { mediaType: 'image/png', data: 'iVBORw0KGgo=', widthPx: 1000, heightPx: 700 },
    bitmap: BITMAP,
  })
  const capture = fakeCapture()
  const ctx = { ...makeContext({ document }), references, capture }
  /** @param {string} name @param {any} input */
  const run = (name, input) => /** @type {any} */ (tools.run(ctx, name, input))
  return { document, id, capture, run }
}

describe('capture_view overlay: reference', () => {
  it('is a top view only — a drawing is compared from above', () => {
    const { run, id } = setup()
    run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [950, 30], distanceMm: 85 })
    expect(run('capture_view', { view: 'iso', overlay: 'reference' }).error).toMatch(/top/)
  })

  it('is refused while no reference has a scale', () => {
    const { run, capture } = setup()
    const result = run('capture_view', { view: 'top', overlay: 'reference' })
    expect(result.error).toMatch(/set_reference_scale/)
    expect(capture.requests).toHaveLength(0)
  })

  it('hands the renderer the image, where it lies in world millimetres, and frames image and model together', () => {
    const { run, id, capture } = setup()
    run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [950, 30], distanceMm: 85 })
    run('create', { op: 'primitive.cuboid', positionMm: [2.5, 0, 0], params: { size: [85, 56, 1.6] } })
    const result = run('capture_view', { view: 'top', overlay: 'reference' })
    expect(result.error).toBeUndefined()
    const [request] = capture.requests
    expect(request.overlay.bitmap).toBe(BITMAP)
    expect(request.overlay.size).toEqual({ widthPx: 1000, heightPx: 700 })
    expect(request.overlay.placement.mmPerPx).toBeCloseTo(0.1, 9)
    expect(request.overlay.zMm).toBe(0)
    // Centred on the sketch origin: the image spans 100 × 70 mm.
    const [min, max] = request.overlay.boundsMm
    expect(min[0]).toBeCloseTo(-50, 6)
    expect(min[1]).toBeCloseTo(-35, 6)
    expect(max[0]).toBeCloseTo(50, 6)
    expect(max[1]).toBeCloseTo(35, 6)
    // The framing covers the image as well as the bodies.
    expect(request.boundsMm[0][0]).toBeLessThanOrEqual(-50)
    expect(request.boundsMm[1][1]).toBeGreaterThanOrEqual(35)
    expect(result.overlay).toMatchObject({ sliceId: id })
    expect(result.note).toMatch(/residual|off by|mm/i)
    expect(result.image.data).toBe('iVBORw0KGgo=')
  })

  it('follows a slice’s sketch plane once the photo is on a sketch', () => {
    const { run, id, capture } = setup()
    run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [950, 30], distanceMm: 85 })
    const made = run('create', {
      op: 'primitive.sketch',
      positionMm: [10, 0, 0],
      params: {
        slices: [{ id: 's1', zMm: 0, referenceImage: id, profiles: [{ id: 'p1', kind: 'rect', role: 'solid', centerMm: [2.5, 0], widthMm: 85, heightMm: 56 }] }],
        extrusion: { method: 'linear', heightMm: 1.6 },
      },
    })
    expect(made.error).toBeUndefined()
    const sliceId = `${made.applied[0].bodyId}:1`
    const result = run('capture_view', { view: 'top', overlay: 'reference', sliceId })
    expect(result.error).toBeUndefined()
    const [min, max] = capture.requests[0].overlay.boundsMm
    expect(min[0]).toBeCloseTo(-40, 6)
    expect(max[0]).toBeCloseTo(60, 6)
    expect(result.overlay.sliceId).toBe(sliceId)
  })

  it('says so when the image cannot be drawn (no decoded copy in this browser)', () => {
    const document = createDocument()
    const references = createReferences()
    const id = addAttachment(references, {
      name: 'board.png',
      record: { id: ASSET_ID, op: 'asset.image', params: { mime: 'image/png', widthPx: 1000, heightPx: 700, dataBase64: base64FromBytes(png(1000, 700)) } },
      sent: { mediaType: 'image/png', data: 'iVBORw0KGgo=', widthPx: 1000, heightPx: 700 },
    })
    const ctx = { ...makeContext({ document }), references, capture: fakeCapture() }
    tools.run(ctx, 'set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [950, 30], distanceMm: 85 })
    const result = /** @type {any} */ (tools.run(ctx, 'capture_view', { view: 'top', overlay: 'reference' }))
    expect(result.error).toMatch(/could not be drawn|not decoded/i)
  })
})
