// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { defaultPlacement, imagePxToSketchMm } from './calibration.js'
import { emptySketchParams } from './profile.js'
import { applyCalibration, scaleProfileAbout, sliceImageOf, withSliceImage } from './referenceImage.js'

const SIZE = { widthPx: 1400, heightPx: 1000 }
const ID = 'img-0123456789abcdef01234567'

/** @param {any[]} profiles */
function params(profiles = []) {
  const base = emptySketchParams()
  return withSliceImage({ ...base, slices: [{ ...base.slices[0], profiles }] }, 0, defaultPlacement(ID))
}

describe('withSliceImage', () => {
  it('sets and removes a slice’s image without touching its outlines', () => {
    const circle = { id: 'p1', kind: 'circle', role: 'solid', centerMm: [0, 0], radiusMm: 5 }
    const withImage = params([circle])
    expect(sliceImageOf(withImage.slices[0])?.assetId).toBe(ID)
    expect(withImage.slices[0].profiles).toEqual([circle])
    const without = withSliceImage(withImage, 0, null)
    expect('image' in without.slices[0]).toBe(false)
    expect(without.slices[0].profiles).toEqual([circle])
  })

  it('is pure: the input is never mutated', () => {
    const before = params()
    const snapshot = JSON.stringify(before)
    withSliceImage(before, 0, null)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('applyCalibration', () => {
  it('sets mmPerPx from the line, keeps the user’s input, and keeps the first point where it was', () => {
    const before = params()
    const aPx = /** @type {[number, number]} */ ([200, 900])
    const bPx = /** @type {[number, number]} */ ([700, 900])
    const anchorBefore = imagePxToSketchMm(/** @type {any} */ (sliceImageOf(before.slices[0])), SIZE, aPx)
    const after = applyCalibration(before, 0, SIZE, { aPx, bPx, length: 100, unit: 'mm' }, false)
    const image = /** @type {any} */ (sliceImageOf(after.slices[0]))
    expect(image.mmPerPx).toBeCloseTo(0.2, 12)
    expect(image.calibration).toEqual({ aPx, bPx, length: 100, unit: 'mm' })
    const anchorAfter = imagePxToSketchMm(image, SIZE, aPx)
    expect(anchorAfter[0]).toBeCloseTo(anchorBefore[0], 9)
    expect(anchorAfter[1]).toBeCloseTo(anchorBefore[1], 9)
  })

  it('5 in along the line gives 127 mm between the points on the slice', () => {
    const after = applyCalibration(params(), 0, SIZE, { aPx: [212, 731], bPx: [850, 723], length: 5, unit: 'in' }, false)
    const image = /** @type {any} */ (sliceImageOf(after.slices[0]))
    const a = imagePxToSketchMm(image, SIZE, [212, 731])
    const b = imagePxToSketchMm(image, SIZE, [850, 723])
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(127, 9)
  })

  it('rescales the slice’s outlines about the same point when asked — traced first, calibrated second', () => {
    const rect = { id: 'p1', kind: 'rect', role: 'solid', centerMm: [10, 0], widthMm: 20, heightMm: 10 }
    const line = { id: 'p2', kind: 'polyline', role: 'solid', closed: false, pointsMm: [[0, 0], [10, 10]] }
    const before = params([rect, line])
    const aPx = /** @type {[number, number]} */ ([700, 500]) // the image centre: the anchor is the sketch origin
    const scaled = applyCalibration(before, 0, SIZE, { aPx, bPx: [1200, 500], length: 100, unit: 'mm' }, true)
    // 0.1 → 0.2 mm per px: everything doubles about (0, 0).
    expect(scaled.slices[0].profiles[0]).toMatchObject({ centerMm: [20, 0], widthMm: 40, heightMm: 20 })
    expect(scaled.slices[0].profiles[1]).toMatchObject({ pointsMm: [[0, 0], [20, 20]] })
    const kept = applyCalibration(before, 0, SIZE, { aPx, bPx: [1200, 500], length: 100, unit: 'mm' }, false)
    expect(kept.slices[0].profiles).toEqual(before.slices[0].profiles)
  })

  it('refuses a degenerate line or length by throwing a sentence, leaving nothing changed', () => {
    const before = params()
    expect(() => applyCalibration(before, 0, SIZE, { aPx: [5, 5], bPx: [5, 5], length: 5, unit: 'in' }, false)).toThrow(/two different points/)
    expect(() => applyCalibration(before, 0, SIZE, { aPx: [5, 5], bPx: [50, 5], length: 0, unit: 'in' }, false)).toThrow(/greater than 0/)
  })
})

describe('scaleProfileAbout', () => {
  it('scales every kind uniformly about a point', () => {
    const anchor = [10, 10]
    expect(scaleProfileAbout(/** @type {any} */ ({ id: 'c', kind: 'circle', role: 'hole', centerMm: [20, 10], radiusMm: 3 }), 2, anchor)).toEqual({
      id: 'c', kind: 'circle', role: 'hole', centerMm: [30, 10], radiusMm: 6,
    })
    expect(scaleProfileAbout(/** @type {any} */ ({ id: 'g', kind: 'polygon', role: 'solid', centerMm: [10, 0], radiusMm: 4, sides: 6, rotationDeg: 15 }), 0.5, anchor)).toEqual({
      id: 'g', kind: 'polygon', role: 'solid', centerMm: [10, 5], radiusMm: 2, sides: 6, rotationDeg: 15,
    })
  })
})
