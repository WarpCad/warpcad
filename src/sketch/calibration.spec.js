// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MM_PER_PX,
  calibrationProblem,
  defaultPlacement,
  formatScale,
  imagePxToSketchMm,
  lengthToMm,
  mmPerPxFrom,
  placementOf,
  rescaleAbout,
  sketchMmToImagePx,
} from './calibration.js'

const IMAGE = { widthPx: 1000, heightPx: 800 }

describe('lengthToMm', () => {
  it('5 in is exactly 127 mm', () => {
    expect(lengthToMm(5, 'in')).toBe(127)
  })
  it('cm and mm', () => {
    expect(lengthToMm(10, 'cm')).toBe(100)
    expect(lengthToMm(42.5, 'mm')).toBe(42.5)
  })
})

describe('mmPerPxFrom', () => {
  it('a 500 px line that is 100 mm long is 0.2 mm per px', () => {
    expect(mmPerPxFrom([100, 300], [600, 300], 100, 'mm')).toBeCloseTo(0.2, 12)
  })

  it('a diagonal line uses its true length', () => {
    // 3-4-5: 500 px along the diagonal.
    expect(mmPerPxFrom([0, 0], [300, 400], 10, 'cm')).toBeCloseTo(0.2, 12)
  })

  it('5 in along 638.05 px gives 0.199 mm per px', () => {
    expect(mmPerPxFrom([212, 1310], [850, 1302], 5, 'in')).toBeCloseTo(127 / Math.hypot(638, 8), 12)
  })
})

describe('calibrationProblem — refused calibrations', () => {
  it.each([
    ['a zero-length line', [10, 10], [10, 10], 5, 'mm', /two different points/],
    ['coincident within a hair', [10, 10], [10, 10 + 1e-12], 5, 'mm', /two different points/],
    ['a zero length', [0, 0], [100, 0], 0, 'mm', /greater than 0/],
    ['a negative length', [0, 0], [100, 0], -5, 'in', /greater than 0/],
    ['a NaN length', [0, 0], [100, 0], Number.NaN, 'in', /greater than 0/],
    ['an unknown unit', [0, 0], [100, 0], 5, 'ft', /unit/],
    ['a non-finite point', [0, Infinity], [100, 0], 5, 'mm', /points/],
  ])('%s', (_name, a, b, length, unit, reason) => {
    expect(calibrationProblem(/** @type {any} */ (a), /** @type {any} */ (b), length, /** @type {any} */ (unit))).toMatch(reason)
  })

  it('a good calibration has no problem', () => {
    expect(calibrationProblem([0, 0], [100, 0], 5, 'in')).toBe('')
  })
})

describe('image px ↔ sketch mm', () => {
  it('the image centre sits on the offset, and +y flips (px down → mm up)', () => {
    const placement = { ...defaultPlacement('img-0123456789abcdef'), mmPerPx: 0.5 }
    expect(imagePxToSketchMm(placement, IMAGE, [500, 400])).toEqual([0, 0])
    const top = imagePxToSketchMm(placement, IMAGE, [500, 0])
    expect(top[0]).toBeCloseTo(0, 12)
    expect(top[1]).toBeCloseTo(200, 12) // top of the image is +y in the sketch
    const right = imagePxToSketchMm(placement, IMAGE, [1000, 400])
    expect(right[0]).toBeCloseTo(250, 12)
    expect(right[1]).toBeCloseTo(0, 12)
  })

  it('the default scale is 1 px = 0.1 mm, centred on the sketch origin', () => {
    const placement = defaultPlacement('img-0123456789abcdef')
    expect(placement.mmPerPx).toBe(DEFAULT_MM_PER_PX)
    expect(DEFAULT_MM_PER_PX).toBe(0.1)
    expect(placement.offsetMm).toEqual([0, 0])
    expect(placement.opacity).toBe(0.5)
    expect(placement.calibration).toBeUndefined()
  })

  it('round-trips under offset and rotation', () => {
    const placement = { ...defaultPlacement('img-0123456789abcdef'), offsetMm: /** @type {[number, number]} */ ([12.5, -40]), rotationDeg: 33, mmPerPx: 0.199 }
    for (const px of [[0, 0], [1000, 800], [212, 731], [-50, 1200]]) {
      const back = sketchMmToImagePx(placement, IMAGE, imagePxToSketchMm(placement, IMAGE, /** @type {[number, number]} */ (px)))
      expect(back[0]).toBeCloseTo(px[0], 9)
      expect(back[1]).toBeCloseTo(px[1], 9)
    }
  })

  it('a 90° rotation turns image +x onto sketch +y', () => {
    const placement = { ...defaultPlacement('img-0123456789abcdef'), rotationDeg: 90, mmPerPx: 1 }
    const right = imagePxToSketchMm(placement, IMAGE, [600, 400])
    expect(right[0]).toBeCloseTo(0, 12)
    expect(right[1]).toBeCloseTo(100, 12)
  })
})

describe('rescaleAbout — the image rescales about the calibration line’s first point', () => {
  it('keeps the anchor pixel where it was on the sketch', () => {
    const before = { ...defaultPlacement('img-0123456789abcdef'), offsetMm: /** @type {[number, number]} */ ([3, 4]), rotationDeg: 20 }
    const anchorPx = /** @type {[number, number]} */ ([212, 731])
    const anchorBefore = imagePxToSketchMm(before, IMAGE, anchorPx)
    const after = rescaleAbout(before, IMAGE, 0.199, anchorPx)
    expect(after.mmPerPx).toBe(0.199)
    const anchorAfter = imagePxToSketchMm(after, IMAGE, anchorPx)
    expect(anchorAfter[0]).toBeCloseTo(anchorBefore[0], 9)
    expect(anchorAfter[1]).toBeCloseTo(anchorBefore[1], 9)
    // And the rest of the image did scale: another pixel moved by the ratio.
    const other = /** @type {[number, number]} */ ([850, 731])
    const d0 = Math.hypot(...imagePxToSketchMm(before, IMAGE, other).map((v, i) => v - anchorBefore[i]))
    const d1 = Math.hypot(...imagePxToSketchMm(after, IMAGE, other).map((v, i) => v - anchorAfter[i]))
    expect(d1 / d0).toBeCloseTo(0.199 / 0.1, 9)
  })
})

describe('placementOf — a slice image read from an untrusted document', () => {
  const good = { assetId: 'img-0123456789abcdef', offsetMm: [1, 2], rotationDeg: 5, opacity: 0.4, mmPerPx: 0.2 }

  it('reads a good placement, defaulting nothing it was given', () => {
    expect(placementOf(good)).toEqual(good)
  })

  it('keeps a well-formed calibration', () => {
    const calibration = { aPx: [0, 0], bPx: [500, 0], length: 100, unit: 'mm' }
    expect(placementOf({ ...good, calibration })?.calibration).toEqual(calibration)
  })

  it.each([
    ['not an object', 'img'],
    ['no asset id', { ...good, assetId: undefined }],
    ['a URL as the asset id', { ...good, assetId: 'https://tracker.example/p.png' }],
    ['a zero scale', { ...good, mmPerPx: 0 }],
    ['a NaN offset', { ...good, offsetMm: [Number.NaN, 0] }],
    ['an opacity over 1', { ...good, opacity: 3 }],
  ])('%s → null', (_name, value) => {
    expect(placementOf(value)).toBeNull()
  })

  it('drops a malformed calibration rather than the whole image', () => {
    expect(placementOf({ ...good, calibration: { aPx: [0, 0], bPx: [0, 0], length: 5, unit: 'in' } })?.calibration).toBeUndefined()
    expect(placementOf({ ...good, calibration: 'x' })?.calibration).toBeUndefined()
  })
})

describe('formatScale', () => {
  it('reads like the badge', () => {
    expect(formatScale(127 / Math.hypot(638, 8))).toBe('1 px = 0.199 mm')
    expect(formatScale(0.2)).toBe('1 px = 0.2 mm')
    expect(formatScale(0.0123456)).toBe('1 px = 0.0123 mm')
    expect(formatScale(2.5)).toBe('1 px = 2.5 mm')
  })
})
