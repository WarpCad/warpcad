// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — drives duck-typed canvas/bitmap fakes.
import { describe, expect, it, vi } from 'vitest'

import { MAX_IMAGE_EDGE, downscaleToImagePart, fitWithin, imagePart } from './image.js'

/** `TODO/ai-004`: images go to the model as base64 parts, downscaled client-side (cost and request-size ceiling). */
describe('fitWithin', () => {
  it('leaves an image already inside the edge alone', () => {
    expect(fitWithin(800, 600, 1568)).toEqual({ width: 800, height: 600, scaled: false })
  })

  it('scales the long edge to the maximum, keeping aspect ratio', () => {
    expect(fitWithin(3136, 1568, 1568)).toEqual({ width: 1568, height: 784, scaled: true })
    expect(fitWithin(1000, 4000, 1000)).toEqual({ width: 250, height: 1000, scaled: true })
  })

  it('never produces a zero-sized edge, and survives degenerate input', () => {
    expect(fitWithin(10000, 1, 1568)).toEqual({ width: 1568, height: 1, scaled: true })
    expect(fitWithin(0, 0, 1568)).toEqual({ width: 0, height: 0, scaled: false })
    expect(fitWithin(Number.NaN, 5, 1568)).toEqual({ width: 0, height: 0, scaled: false })
  })

  it('the default maximum is 1568 px', () => {
    expect(MAX_IMAGE_EDGE).toBe(1568)
  })
})

describe('imagePart', () => {
  it('builds the Messages API base64 image block', () => {
    expect(imagePart('QUJD', 'image/png')).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } })
  })

  it('refuses a media type the API does not take, and strips a data-URL prefix', () => {
    expect(() => imagePart('QUJD', 'image/svg+xml')).toThrow(/media type/i)
    expect(imagePart('data:image/jpeg;base64,QUJD', 'image/jpeg').source.data).toBe('QUJD')
  })
})

describe('downscaleToImagePart', () => {
  function env({ width, height }) {
    const draw = vi.fn()
    const bitmap = { width, height, close: vi.fn() }
    return {
      draw,
      bitmap,
      createImageBitmap: vi.fn(async () => bitmap),
      makeCanvas: vi.fn((w, h) => ({
        width: w,
        height: h,
        getContext: () => ({ drawImage: draw }),
        toDataURL: (type) => `data:${type};base64,RESIZED-${w}x${h}`,
      })),
    }
  }

  it('resizes an oversized image to JPEG at the maximum edge and closes the bitmap', async () => {
    const e = env({ width: 3000, height: 1500 })
    const part = await downscaleToImagePart(new Blob(['x'], { type: 'image/png' }), { ...e })
    expect(e.makeCanvas).toHaveBeenCalledWith(1568, 784)
    expect(part).toEqual(imagePart('RESIZED-1568x784', 'image/jpeg'))
    expect(e.bitmap.close).toHaveBeenCalled()
  })

  it('an image already small enough is still re-encoded through the canvas (strips metadata) at its own size', async () => {
    const e = env({ width: 400, height: 300 })
    const part = await downscaleToImagePart(new Blob(['x'], { type: 'image/png' }), { ...e })
    expect(e.makeCanvas).toHaveBeenCalledWith(400, 300)
    expect(part.source.data).toBe('RESIZED-400x300')
  })

  it('fails plainly on an empty or undecodable image', async () => {
    const e = env({ width: 0, height: 0 })
    await expect(downscaleToImagePart(new Blob(['x']), { ...e })).rejects.toThrow(/image/i)
    await expect(downscaleToImagePart(new Blob(['x']), { ...e, createImageBitmap: async () => { throw new Error('bad') } })).rejects.toThrow(/image/i)
  })
})
