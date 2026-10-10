// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { STANDARD_VIEWS } from './camera.js'
import { captureSize } from '../ai/image.js'
import { CAPTURE_VIEWS, flipRows, frameTopOrthographic, frameView, pixelStats } from './offscreenCapture.js'

/**
 * `TODO/ai-007` — the pure half of the offscreen capture: framing, size, colour encoding and
 * the non-blank statistic. The WebGL half needs a real context and is covered by
 * `e2e/ai-capture.e2e.js` against the running app on all three engines.
 */

describe('CAPTURE_VIEWS', () => {
  it('maps every tool view onto the viewport’s own standard views (iso is Home)', () => {
    expect(CAPTURE_VIEWS.iso).toEqual(STANDARD_VIEWS.home)
    for (const view of ['top', 'front', 'right', 'back', 'bottom', 'left']) {
      expect(CAPTURE_VIEWS[/** @type {keyof typeof CAPTURE_VIEWS} */ (view)]).toEqual(STANDARD_VIEWS[view])
    }
  })
})

describe('frameView', () => {
  it('aims at the centre of the box and backs off until its bounding sphere fits', () => {
    const framed = frameView('iso', [[-10, -10, 0], [10, 10, 20]], 45, 4 / 3)
    expect(framed.target).toEqual({ x: 0, y: 0, z: 10 })
    const radius = Math.sqrt(300)
    // The sphere fits the narrower (vertical) field of view.
    expect(framed.distanceMm).toBeGreaterThanOrEqual(radius / Math.sin((22.5 * Math.PI) / 180))
    expect(framed.distanceMm).toBeLessThan(2 * radius / Math.sin((22.5 * Math.PI) / 180))
  })

  it('a tall-narrow aspect fits the horizontal field instead', () => {
    const wide = frameView('front', [[-10, -10, -10], [10, 10, 10]], 45, 2)
    const narrow = frameView('front', [[-10, -10, -10], [10, 10, 10]], 45, 0.5)
    expect(narrow.distanceMm).toBeGreaterThan(wide.distanceMm)
  })

  it('an empty or degenerate box still gives a finite camera', () => {
    const framed = frameView('top', [[0, 0, 0], [0, 0, 0]], 45, 1)
    expect(Number.isFinite(framed.distanceMm)).toBe(true)
    expect(framed.distanceMm).toBeGreaterThan(0)
  })
})

describe('captureSize (src/ai/image.js — the tool sizes, the renderer obeys)', () => {
  it('defaults to 768 × 576 and keeps 4:3', () => {
    expect(captureSize(undefined)).toEqual({ widthPx: 768, heightPx: 576 })
    expect(captureSize(400)).toEqual({ widthPx: 400, heightPx: 300 })
  })

  it('clamps to [128, 1568] — the provider’s long-edge ceiling (ai-004)', () => {
    expect(captureSize(10).widthPx).toBe(128)
    expect(captureSize(99999).widthPx).toBe(1568)
  })
})

describe('flipRows', () => {
  it('turns WebGL’s bottom-up rows into an image’s top-down ones, colours untouched', () => {
    // 1 × 2: bottom row grey, top row white. The sRGB encode happens on the GPU (an
    // SRGB8_ALPHA8 target, the same transfer the screen path applies), so bytes pass through.
    const rows = new Uint8Array([128, 128, 128, 255, 255, 255, 255, 255])
    const out = flipRows(rows, 1, 2)
    expect([...out]).toEqual([255, 255, 255, 255, 128, 128, 128, 255])
  })

  it('leaves a single row alone', () => {
    expect([...flipRows(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), 2, 1)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('pixelStats', () => {
  it('a uniform image has no content and no variance', () => {
    const rgba = new Uint8ClampedArray(4 * 16).fill(40)
    expect(pixelStats(rgba, [40, 40, 40])).toEqual({ contentFraction: 0, lumaStdDev: 0 })
  })

  it('counts pixels that differ from the background, and their spread', () => {
    const rgba = new Uint8ClampedArray(4 * 4).fill(0)
    rgba.set([200, 200, 200, 255], 0)
    const stats = pixelStats(rgba, [0, 0, 0])
    expect(stats.contentFraction).toBeCloseTo(0.25, 9)
    expect(stats.lumaStdDev).toBeGreaterThan(50)
  })
})

describe('frameTopOrthographic (TODO/ai-008 overlay)', () => {
  it('centres on the box and fits it inside the aspect, so mm are uniform across the picture', () => {
    const top = frameTopOrthographic([[-50, -35, 0], [50, 35, 2]], 4 / 3)
    expect(top.centerX).toBeCloseTo(0, 9)
    expect(top.centerY).toBeCloseTo(0, 9)
    expect(top.halfWidth / top.halfHeight).toBeCloseTo(4 / 3, 9)
    // The 100 mm width is the binding side at 4:3 (70 mm height × 4/3 = 93 mm < 100 mm).
    expect(top.halfWidth * 2).toBeGreaterThanOrEqual(100)
    expect(top.halfHeight * 2).toBeGreaterThanOrEqual(70)
    expect(top.eyeZ).toBeGreaterThan(2)
    expect(top.depth).toBeGreaterThan(top.eyeZ)
  })

  it('a tall box binds on its height instead', () => {
    const top = frameTopOrthographic([[0, 0, 0], [10, 100, 0]], 4 / 3)
    expect(top.halfHeight * 2).toBeGreaterThanOrEqual(100)
    expect(top.centerY).toBeCloseTo(50, 9)
  })
})
