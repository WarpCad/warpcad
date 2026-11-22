// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createReferencePhotoTaps } from './referencePhotoTaps.js'

/**
 * The reference photo's view and the editor are plain objects: the taps only call methods on them.
 *
 * @param {{ onPhoto?: boolean }} [options]
 */
function setup({ onPhoto = true } = {}) {
  const sketchEditor = {
    scaleAPx: /** @type {any} */ ([9, 9]),
    scaleBPx: /** @type {any} */ ([8, 8]),
    addScalePoint: vi.fn(),
    setScaleLine: vi.fn(),
    traceAt: vi.fn(),
  }
  const referenceImage = {
    clientToImagePx: vi.fn((x, y) => (onPhoto ? [x / 10, y / 10] : null)),
    trackLiveEnd: vi.fn(),
    clearLiveEnd: vi.fn(),
    syncOverlay: vi.fn(),
  }
  const scheduleRender = vi.fn()
  const taps = createReferencePhotoTaps({ sketchEditor, referenceImage, scheduleRender })
  return { sketchEditor, referenceImage, scheduleRender, taps }
}

describe('createReferencePhotoTaps', () => {
  it('begins a drag on the photo, forgetting any tapped marks and fixing the first point', () => {
    const { taps, sketchEditor } = setup()
    expect(taps.beginDrag(100, 200)).toBe(true)
    expect(sketchEditor.scaleAPx).toBeNull()
    expect(sketchEditor.scaleBPx).toBeNull()
    expect(sketchEditor.addScalePoint).toHaveBeenCalledWith([10, 20])
  })

  it('refuses a drag whose press is off the photo, and a later update does nothing', () => {
    const { taps, referenceImage, sketchEditor } = setup({ onPhoto: false })
    expect(taps.beginDrag(1, 1)).toBe(false)
    expect(sketchEditor.addScalePoint).not.toHaveBeenCalled()
    taps.updateDrag(5, 5)
    expect(referenceImage.trackLiveEnd).not.toHaveBeenCalled()
  })

  it('follows the pointer while dragging and schedules a frame', () => {
    const { taps, referenceImage, scheduleRender } = setup()
    taps.beginDrag(10, 10)
    taps.updateDrag(50, 60)
    expect(referenceImage.trackLiveEnd).toHaveBeenCalledWith(50, 60)
    expect(scheduleRender).toHaveBeenCalledTimes(1)
  })

  it('ends a drag by setting the line between the two points', () => {
    const { taps, sketchEditor, referenceImage } = setup()
    taps.beginDrag(10, 10)
    taps.endDrag(false, 300, 400)
    expect(sketchEditor.setScaleLine).toHaveBeenCalledWith([1, 1], [30, 40])
    expect(referenceImage.clearLiveEnd).toHaveBeenCalled()
    expect(referenceImage.syncOverlay).toHaveBeenCalled()
  })

  it('drops both marks when the drag is cancelled, and ending twice is a no-op', () => {
    const { taps, sketchEditor, referenceImage } = setup()
    taps.beginDrag(10, 10)
    sketchEditor.scaleAPx = [1, 1]
    taps.endDrag(true, 0, 0)
    expect(sketchEditor.setScaleLine).not.toHaveBeenCalled()
    expect(sketchEditor.scaleAPx).toBeNull()
    expect(sketchEditor.scaleBPx).toBeNull()
    referenceImage.syncOverlay.mockClear()
    taps.endDrag(true, 0, 0)
    expect(referenceImage.syncOverlay).not.toHaveBeenCalled()
  })

  it('cancelDrag forgets the drag without touching the editor', () => {
    const { taps, sketchEditor, referenceImage } = setup()
    taps.beginDrag(10, 10)
    taps.cancelDrag()
    taps.endDrag(false, 50, 50)
    expect(sketchEditor.setScaleLine).not.toHaveBeenCalled()
    expect(referenceImage.syncOverlay).not.toHaveBeenCalled()
  })

  it('a scale tap fixes the next point only when it lands on the photo', () => {
    const on = setup()
    on.taps.scaleTap(20, 30)
    expect(on.sketchEditor.addScalePoint).toHaveBeenCalledWith([2, 3])
    expect(on.scheduleRender).toHaveBeenCalled()
    const off = setup({ onPhoto: false })
    off.taps.scaleTap(20, 30)
    expect(off.sketchEditor.addScalePoint).not.toHaveBeenCalled()
    expect(off.scheduleRender).not.toHaveBeenCalled()
  })

  it('a trace tap traces the point, or NaN when off the photo so the trace can say why', () => {
    const on = setup()
    on.taps.traceTap(20, 30)
    expect(on.sketchEditor.traceAt).toHaveBeenCalledWith([2, 3])
    const off = setup({ onPhoto: false })
    off.taps.traceTap(20, 30)
    const arg = off.sketchEditor.traceAt.mock.calls[0][0]
    expect(Number.isNaN(arg[0]) && Number.isNaN(arg[1])).toBe(true)
  })
})
