// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { base64FromBytes } from '../../sketch/imageAsset.js'
import { makeContext } from './__fixtures__/context.js'
import { addAttachment, createReferences, imagePxToMm, sentPxToImagePx } from './image.js'
import { createToolRegistry } from './index.js'

/**
 * `TODO/ai-008` — the model's hands for measuring a drawing: `get_reference_image`,
 * `set_reference_scale` and `locate_in_image`. Pixel coordinates are the pixels of the image
 * **as the model was sent it**; millimetres are sketch-plane millimetres with the image centred
 * on the sketch origin (`src/sketch/calibration.js`, the one place image space meets sketch
 * space). An unknown scale is refused, never assumed.
 */

const tools = createToolRegistry()

/** @param {number} value @returns {number[]} big-endian u32 */
const u32be = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
/** @param {string} text @returns {number[]} */
const ascii = (text) => [...text].map((char) => char.charCodeAt(0))

/** A header-only PNG: enough for the asset validator, which reads sizes without decoding. */
function png(/** @type {number} */ width, /** @type {number} */ height) {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 2, 0, 0, 0, ...u32be(0),
    ...u32be(0), ...ascii('IEND'), ...u32be(0),
  ])
}

const ASSET_ID = 'img-0123456789abcdef01234567'

/** A sanitised 1000 × 700 drawing, as the chat's Attach leaves it. */
function drawingRecord() {
  return { id: ASSET_ID, op: /** @type {'asset.image'} */ ('asset.image'), params: { mime: /** @type {'image/png'} */ ('image/png'), widthPx: 1000, heightPx: 700, dataBase64: base64FromBytes(png(1000, 700)) } }
}

/**
 * @param {{ sentWidthPx?: number, sentHeightPx?: number }} [options]
 */
function setup(options = {}) {
  const document = createDocument()
  const references = createReferences()
  const id = addAttachment(references, {
    name: 'board.png',
    record: drawingRecord(),
    sent: { mediaType: 'image/png', data: 'iVBORw0KGgo=', widthPx: options.sentWidthPx ?? 1000, heightPx: options.sentHeightPx ?? 700 },
    bitmap: { fake: 'bitmap' },
  })
  const ctx = { ...makeContext({ document }), references }
  /** @param {string} name @param {any} input */
  const run = (name, input) => /** @type {any} */ (tools.run(ctx, name, input))
  return { document, references, id, ctx, run }
}

describe('pixels ↔ millimetres at a known scale (pure)', () => {
  it('maps sent pixels to stored pixels by the downscale ratio', () => {
    const out = sentPxToImagePx([250, 175], { widthPx: 500, heightPx: 350 }, { widthPx: 1000, heightPx: 700 })
    expect(out[0]).toBeCloseTo(500, 9)
    expect(out[1]).toBeCloseTo(350, 9)
  })

  it('puts the image centre on the sketch origin, +y up, at mmPerPx', () => {
    const placement = { offsetMm: /** @type {[number, number]} */ ([0, 0]), rotationDeg: 0, mmPerPx: 0.1 }
    const size = { widthPx: 1000, heightPx: 700 }
    const centre = imagePxToMm(placement, size, [500, 350])
    expect(centre[0]).toBeCloseTo(0, 9)
    expect(centre[1]).toBeCloseTo(0, 9)
    const topLeft = imagePxToMm(placement, size, [0, 0])
    expect(topLeft[0]).toBeCloseTo(-50, 9)
    expect(topLeft[1]).toBeCloseTo(35, 9)
    const corner = imagePxToMm(placement, size, [950, 660])
    expect(corner[0]).toBeCloseTo(45, 9)
    expect(corner[1]).toBeCloseTo(-31, 9)
  })
})

describe('get_reference_image', () => {
  it('lists what there is to look at when no sliceId is given', () => {
    const { run, id } = setup()
    const result = run('get_reference_image', {})
    expect(result.error).toBeUndefined()
    expect(result.references).toEqual([{ sliceId: id, name: 'board.png', widthPx: 1000, heightPx: 700, scale: null }])
    expect(result.image).toBeUndefined()
  })

  it('returns the image as sent, with its pixel size and no scale yet', () => {
    const { run, id } = setup({ sentWidthPx: 500, sentHeightPx: 350 })
    const result = run('get_reference_image', { sliceId: id })
    expect(result).toMatchObject({ sliceId: id, widthPx: 500, heightPx: 350, scale: null })
    expect(result.image).toEqual({ mediaType: 'image/png', data: 'iVBORw0KGgo=' })
  })

  it('names the ids it knows when asked for one it does not', () => {
    const { run } = setup()
    const result = run('get_reference_image', { sliceId: 'attachment-9' })
    expect(result.error).toMatch(/attachment-9/)
    expect(result.error).toMatch(/attachment-1/)
  })

  it('is browser-only: the MCP server has no attached images', () => {
    expect(tools.definitions('mcp').map((tool) => tool.name)).not.toContain('get_reference_image')
    expect(tools.definitions('mcp').map((tool) => tool.name)).not.toContain('set_reference_scale')
    expect(tools.definitions('mcp').map((tool) => tool.name)).not.toContain('locate_in_image')
    expect(tools.definitions('ai').map((tool) => tool.name)).toEqual(expect.arrayContaining(['get_reference_image', 'set_reference_scale', 'locate_in_image']))
  })
})

describe('set_reference_scale', () => {
  it('sets mm per pixel from a printed dimension (85 mm over 850 px = 0.1 mm/px)', () => {
    const { run, id, references } = setup()
    const result = run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [950, 30], distanceMm: 85, label: 'board length' })
    expect(result.error).toBeUndefined()
    expect(result.mmPerPx).toBeCloseTo(0.1, 9)
    expect(result.imageSizeMm[0]).toBeCloseTo(100, 9)
    expect(result.imageSizeMm[1]).toBeCloseTo(70, 9)
    expect(result.label).toBe('board length')
    expect(references.scales.get(id)?.mmPerPx).toBeCloseTo(0.1, 9)
  })

  it('works in the pixels the model was sent, not the stored ones', () => {
    const { run, id, references } = setup({ sentWidthPx: 500, sentHeightPx: 350 })
    const result = run('set_reference_scale', { sliceId: id, fromPx: [50, 15], toPx: [475, 15], distanceMm: 85 })
    // 425 sent px = 850 stored px. The result speaks the model's pixels (0.2 mm each); the
    // stored calibration keeps the stored image's (0.1 mm each), as sketch-003 does.
    expect(result.mmPerPx).toBeCloseTo(0.2, 9)
    expect(references.scales.get(id)?.mmPerPx).toBeCloseTo(0.1, 9)
    const calibration = references.scales.get(id)?.calibration
    expect(calibration?.aPx[0]).toBeCloseTo(100, 9)
    expect(calibration?.bPx[0]).toBeCloseTo(950, 9)
    expect(calibration).toMatchObject({ length: 85, unit: 'mm' })
  })

  it('cross-checks other printed dimensions against the scale and reports the difference', () => {
    const { run, id } = setup()
    const result = run('set_reference_scale', {
      sliceId: id,
      fromPx: [100, 30],
      toPx: [950, 30],
      distanceMm: 85,
      checks: [
        { label: 'board width', fromPx: [990, 70], toPx: [990, 630], distanceMm: 56 },
        { label: 'hole spacing', fromPx: [135, 670], toPx: [715, 670], distanceMm: 49 },
      ],
    })
    expect(result.error).toBeUndefined()
    const [width, spacing] = result.checks
    expect(width).toMatchObject({ label: 'board width', printedMm: 56 })
    expect(width.measuredMm).toBeCloseTo(56, 6)
    expect(width.consistent).toBe(true)
    expect(spacing.measuredMm).toBeCloseTo(58, 6)
    expect(spacing.offByMm).toBeCloseTo(9, 6)
    expect(spacing.consistent).toBe(false)
    expect(result.warning).toMatch(/hole spacing/)
  })

  it('refuses a line of no length, a length of zero, and a point off the image — and keeps no scale', () => {
    const { run, id, references } = setup()
    expect(run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [100, 30], distanceMm: 85 }).error).toMatch(/two different points/i)
    expect(run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [950, 30], distanceMm: 0 }).error).toMatch(/greater than 0/)
    expect(run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [1950, 30], distanceMm: 85 }).error).toMatch(/outside the image/)
    expect(references.scales.has(id)).toBe(false)
  })
})

describe('locate_in_image', () => {
  it('refuses while the scale is unknown — it never assumes one', () => {
    const { run, id } = setup()
    const result = run('locate_in_image', { sliceId: id, query: 'board outline', boxesPx: [[100, 70, 950, 630]] })
    expect(result.error).toMatch(/scale/)
    expect(result.error).toMatch(/set_reference_scale/)
    expect(result.boxes).toBeUndefined()
  })

  it('gives each box in image pixels and in sketch millimetres after the scale', () => {
    const { run, id } = setup()
    run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [950, 30], distanceMm: 85 })
    const result = run('locate_in_image', { sliceId: id, query: 'board outline', boxesPx: [[100, 70, 950, 630]] })
    expect(result.error).toBeUndefined()
    expect(result.query).toBe('board outline')
    const [box] = result.boxes
    expect(box.px).toEqual([100, 70, 950, 630])
    expect(box.sizeMm[0]).toBeCloseTo(85, 6)
    expect(box.sizeMm[1]).toBeCloseTo(56, 6)
    expect(box.centerMm[0]).toBeCloseTo(2.5, 6)
    expect(box.centerMm[1]).toBeCloseTo(0, 6)
    expect(box.minMm[0]).toBeCloseTo(-40, 6)
    expect(box.minMm[1]).toBeCloseTo(-28, 6)
    expect(box.maxMm[0]).toBeCloseTo(45, 6)
    expect(box.maxMm[1]).toBeCloseTo(28, 6)
  })

  it('caps the boxes one call may convert (a limit in code, not the prompt)', () => {
    const { run, id } = setup()
    run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [950, 30], distanceMm: 85 })
    const boxes = Array.from({ length: 33 }, () => [0, 0, 10, 10])
    expect(run('locate_in_image', { sliceId: id, query: 'many', boxesPx: boxes }).error).toBe('invalid input')
  })
})

describe('a scaled attachment becomes a sketch slice’s reference image (create)', () => {
  /** @param {string} referenceImage */
  const sketch = (referenceImage) => ({
    op: 'primitive.sketch',
    positionMm: [0, 0, 0],
    params: {
      slices: [{ id: 's1', zMm: 0, referenceImage, profiles: [{ id: 'p1', kind: 'rect', role: 'solid', centerMm: [2.5, 0], widthMm: 85, heightMm: 56 }] }],
      extrusion: { method: 'linear', heightMm: 1.6 },
    },
  })

  it('is refused until the scale is set — scale first, in code', () => {
    const { run, id, document } = setup()
    const result = run('create', sketch(id))
    expect(result.error).toMatch(/set_reference_scale/)
    expect(document.entries).toHaveLength(0)
  })

  it('appends the sanitised asset and the sketch together, the photo calibrated and centred on the sketch origin', () => {
    const { run, id, document } = setup()
    run('set_reference_scale', { sliceId: id, fromPx: [100, 30], toPx: [950, 30], distanceMm: 85, label: 'board length' })
    const result = run('create', sketch(id))
    expect(result.error).toBeUndefined()
    expect(document.assets().has(ASSET_ID)).toBe(true)
    const record = document.records.find((entry) => entry.op === 'primitive.sketch')
    const image = /** @type {any} */ (record?.params).slices[0].image
    expect(/** @type {any} */ (record?.params).slices[0].referenceImage).toBeUndefined()
    expect(image).toMatchObject({ assetId: ASSET_ID, offsetMm: [0, 0], rotationDeg: 0 })
    expect(image.mmPerPx).toBeCloseTo(0.1, 9)
    expect(image.calibration).toMatchObject({ length: 85, unit: 'mm' })

    // Now the slice itself is a reference the tools can read.
    const bodyId = result.applied[0].bodyId
    const located = run('locate_in_image', { sliceId: `${bodyId}:1`, query: 'board', boxesPx: [[100, 70, 950, 630]] })
    expect(located.boxes[0].sizeMm[0]).toBeCloseTo(85, 6)
    expect(run('get_reference_image', {}).references.map((/** @type {any} */ r) => r.sliceId)).toEqual([id, `${bodyId}:1`])
  })

  it('is refused over MCP, where nothing is attached', () => {
    const document = createDocument()
    const result = /** @type {any} */ (tools.run(makeContext({ document, origin: 'mcp' }), 'create', sketch('attachment-1')))
    expect(result.error).toMatch(/attach/i)
    expect(document.entries).toHaveLength(0)
  })
})

describe('a project slice whose photo was never scaled', () => {
  it('counts as unknown scale (the provisional 0.1 mm/px is not a measurement)', () => {
    const document = createDocument()
    const record = drawingRecord()
    document.appendAll([
      record,
      {
        id: 'sketch-1',
        op: 'primitive.sketch',
        name: 'Sketch 1',
        params: {
          center: [0, 0, 0],
          slices: [{ id: 's1', zMm: 0, image: { assetId: ASSET_ID, offsetMm: [0, 0], rotationDeg: 0, opacity: 0.5, mmPerPx: 0.1 }, profiles: [{ id: 'p1', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 10, heightMm: 10 }] }],
          extrusion: { method: 'linear', heightMm: 2 },
        },
      },
    ], { origin: 'local' })
    const references = createReferences()
    const ctx = { ...makeContext({ document }), references }
    const result = /** @type {any} */ (tools.run(ctx, 'locate_in_image', { sliceId: 'sketch-1:1', query: 'x', boxesPx: [[0, 0, 10, 10]] }))
    expect(result.error).toMatch(/scale/)
    const scaled = /** @type {any} */ (tools.run(ctx, 'set_reference_scale', { sliceId: 'sketch-1:1', fromPx: [0, 0], toPx: [100, 0], distanceMm: 10 }))
    expect(scaled.error).toMatch(/Set scale/)
  })
})
