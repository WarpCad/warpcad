// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — synthetic bitmaps and rings are plain literals.
import { describe, expect, it } from 'vitest'

import { contoursOf, grayscaleOf, otsuThreshold, ringSelfIntersects, traceRegion } from './trace.js'

/**
 * Auto-trace's pure pipeline (`TODO/sketch-004`), on synthetic bitmaps so every true
 * dimension is known: grayscale → Otsu → flood fill from the tap → speckle clean-up →
 * marching squares → outer/inner classification → Ramer–Douglas–Peucker.
 *
 * Coordinates are **image px**: origin at the top-left corner of the image, +y down, so
 * pixel (x, y) covers [x, x+1) × [y, y+1) and a filled run of pixels 10..109 has its edge at
 * exactly x = 10 and x = 110.
 */

const DARK = [34, 34, 38]
const LIGHT = [233, 229, 220]

/**
 * An RGBA bitmap whose pixel (x, y) is "part" (dark, unless `invert`) where `inside(x, y)`.
 *
 * @param {number} width
 * @param {number} height
 * @param {(x: number, y: number) => boolean} inside
 * @param {{ invert?: boolean }} [options]
 */
function bitmap(width, height, inside, options = {}) {
  const data = new Uint8ClampedArray(width * height * 4)
  const [part, ground] = options.invert ? [LIGHT, DARK] : [DARK, LIGHT]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = inside(x, y) ? part : ground
      const at = (y * width + x) * 4
      data[at] = colour[0]
      data[at + 1] = colour[1]
      data[at + 2] = colour[2]
      data[at + 3] = 255
    }
  }
  return { width, height, data }
}

/** A filled rectangle of pixels `x0..x0+w-1` × `y0..y0+h-1`. */
const inRect = (x0, y0, w, h) => (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h
/** A disc of pixels whose centres lie within `r` of (cx, cy). */
const inDisc = (cx, cy, r) => (x, y) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r

/** Shoelace area, unsigned. */
function area(ring) {
  let twice = 0
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    twice += a[0] * b[1] - b[0] * a[1]
  }
  return Math.abs(twice / 2)
}

function bounds(ring) {
  const xs = ring.map((p) => p[0])
  const ys = ring.map((p) => p[1])
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

describe('grayscaleOf / otsuThreshold', () => {
  it('converts RGBA to luma, treating transparency as the light background', () => {
    const image = { width: 3, height: 1, data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0]) }
    const gray = grayscaleOf(image)
    expect(gray).toBeInstanceOf(Uint8Array)
    expect(Array.from(gray)).toEqual([0, 255, 255])
  })

  it('splits a two-tone histogram between its tones', () => {
    const gray = new Uint8Array(1000)
    gray.fill(40, 0, 300)
    gray.fill(220, 300)
    const threshold = otsuThreshold(gray)
    expect(threshold).toBeGreaterThanOrEqual(40)
    expect(threshold).toBeLessThan(220)
  })

  it('a one-tone image (all black, all white, or empty) has a threshold and never throws', () => {
    expect(otsuThreshold(new Uint8Array(50).fill(0))).toBe(0)
    expect(otsuThreshold(new Uint8Array(50).fill(255))).toBe(255)
    expect(otsuThreshold(new Uint8Array(0))).toBe(127)
  })
})

describe('traceRegion — the tapped part becomes outlines', () => {
  it('a filled 100 × 60 px rectangle traces to 4 vertices after RDP, each corner within 1 px', () => {
    const image = bitmap(200, 140, inRect(40, 30, 100, 60))
    const result = traceRegion(image, [90, 60], { tolerancePx: 1 })
    expect(result.ok).toBe(true)
    expect(result.outlines).toHaveLength(1)
    const [solid] = result.outlines
    expect(solid.role).toBe('solid')
    expect(solid.pointsPx).toHaveLength(4)
    for (const corner of [[40, 30], [140, 30], [140, 90], [40, 90]]) {
      const nearest = Math.min(...solid.pointsPx.map((p) => Math.hypot(p[0] - corner[0], p[1] - corner[1])))
      expect(nearest).toBeLessThan(1)
    }
    // Each kept corner is one of marching squares' half-pixel corner cuts, so the area is a
    // shade under 100 × 60 — about 0.1 mm of edge at the fixture's 5 px per mm.
    expect(Math.abs(area(solid.pointsPx) / 6000 - 1)).toBeLessThan(0.02)
    expect(result.pointCount).toBe(4)
  })

  it("a filled disc's traced area is within 1% of πr²", () => {
    const r = 40
    const image = bitmap(140, 140, inDisc(70, 70, r))
    const result = traceRegion(image, [70, 70], { tolerancePx: 0.5 })
    expect(result.ok).toBe(true)
    expect(result.outlines).toHaveLength(1)
    expect(Math.abs(area(result.outlines[0].pointsPx) / (Math.PI * r * r) - 1)).toBeLessThan(0.01)
    // …and the outline is round: every vertex within a pixel of the circle.
    for (const [x, y] of result.outlines[0].pointsPx) expect(Math.abs(Math.hypot(x - 70, y - 70) - r)).toBeLessThan(1)
  })

  it('a rectangle with two holes yields 1 Solid + 2 Holes, the holes the right size and place', () => {
    const plate = inRect(20, 20, 160, 100)
    const holeA = inDisc(60, 70, 15)
    const holeB = inDisc(140, 70, 10)
    const image = bitmap(200, 140, (x, y) => plate(x, y) && !holeA(x, y) && !holeB(x, y))
    const result = traceRegion(image, [30, 30], { tolerancePx: 0.5 })
    expect(result.ok).toBe(true)
    expect(result.outlines.map((o) => o.role)).toEqual(['solid', 'hole', 'hole'])
    const holes = result.outlines.filter((o) => o.role === 'hole').map((o) => bounds(o.pointsPx))
    holes.sort((a, b) => a.minX - b.minX)
    expect((holes[0].minX + holes[0].maxX) / 2).toBeCloseTo(60, 0)
    expect(holes[0].maxX - holes[0].minX).toBeCloseTo(30, -0.5)
    expect((holes[1].minX + holes[1].maxX) / 2).toBeCloseTo(140, 0)
    expect(holes[1].maxX - holes[1].minX).toBeCloseTo(20, -0.5)
    expect(result.pointCount).toBe(result.outlines.reduce((sum, o) => sum + o.pointsPx.length, 0))
  })

  it('a tap on the background — the region running off the photo — adds nothing and says why', () => {
    const image = bitmap(200, 140, inRect(40, 30, 100, 60))
    const result = traceRegion(image, [5, 5], { tolerancePx: 1 })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('edge')
    expect(result.reason).toBe('That region runs off the edge of the photo — tap inside the part')
  })

  it('a part touching the image edge is refused the same way', () => {
    const image = bitmap(200, 140, inRect(0, 30, 100, 60))
    const result = traceRegion(image, [50, 60], { tolerancePx: 1 })
    expect(result).toMatchObject({ ok: false, code: 'edge' })
  })

  it('a light part on a dark mat traces the same as a dark part on a light table', () => {
    const shape = (x, y) => inRect(30, 20, 120, 80)(x, y) && !inDisc(90, 60, 20)(x, y)
    const dark = traceRegion(bitmap(180, 120, shape), [40, 30], { tolerancePx: 0.5 })
    const light = traceRegion(bitmap(180, 120, shape, { invert: true }), [40, 30], { tolerancePx: 0.5 })
    expect(dark.ok && light.ok).toBe(true)
    expect(light.outlines).toEqual(dark.outlines)
  })

  it('a 1-px speckle is ignored — inside the part it is no hole, beside it it is no part', () => {
    const rect = inRect(40, 30, 100, 60)
    const image = bitmap(200, 140, (x, y) => (rect(x, y) && !(x === 80 && y === 50)) || (x === 150 && y === 60))
    const result = traceRegion(image, [60, 60], { tolerancePx: 1 })
    expect(result.ok).toBe(true)
    expect(result.outlines.map((o) => o.role)).toEqual(['solid'])
    expect(result.outlines[0].pointsPx).toHaveLength(4)
  })

  it('a tap on a lone speckle says it is too small rather than tracing a dot', () => {
    const image = bitmap(100, 100, (x, y) => (x === 50 && y === 50) || inRect(10, 10, 20, 20)(x, y))
    const result = traceRegion(image, [50.5, 50.5], { tolerancePx: 1 })
    expect(result).toMatchObject({ ok: false, code: 'small' })
  })

  it('a manual threshold overrides Otsu: a mid-grey part is found only on the side it falls', () => {
    const data = bitmap(120, 100, inRect(30, 30, 60, 40))
    // Repaint the part mid-grey (128) on the light ground.
    for (let i = 0; i < 120 * 100; i += 1) if (data.data[i * 4] === DARK[0]) data.data.fill(128, i * 4, i * 4 + 3)
    expect(traceRegion(data, [60, 50], { tolerancePx: 1, threshold: 200 }).ok).toBe(true)
    // At threshold 100 the part and the ground are both "light": the region runs off the edge.
    expect(traceRegion(data, [60, 50], { tolerancePx: 1, threshold: 100 })).toMatchObject({ ok: false, code: 'edge' })
  })

  it('reports the threshold it used', () => {
    const result = traceRegion(bitmap(200, 140, inRect(40, 30, 100, 60)), [90, 60], { tolerancePx: 1 })
    expect(result.threshold).toBeGreaterThanOrEqual(DARK[0])
    expect(result.threshold).toBeLessThan(LIGHT[2])
  })
})

describe('traceRegion — degenerate input never throws', () => {
  it('an empty (0 × 0) image', () => {
    expect(traceRegion({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, [0, 0], { tolerancePx: 1 })).toMatchObject({ ok: false, code: 'empty' })
  })

  it('a single-pixel image', () => {
    const result = traceRegion(bitmap(1, 1, () => true), [0.5, 0.5], { tolerancePx: 1 })
    expect(result).toMatchObject({ ok: false, code: 'edge' })
  })

  it('an all-black and an all-white image: the tap fills the frame, which runs off the edge', () => {
    expect(traceRegion(bitmap(50, 40, () => true), [25, 20], { tolerancePx: 1 })).toMatchObject({ ok: false, code: 'edge' })
    expect(traceRegion(bitmap(50, 40, () => false), [25, 20], { tolerancePx: 1 })).toMatchObject({ ok: false, code: 'edge' })
  })

  it('a tap off the photo, or a non-finite tap', () => {
    const image = bitmap(50, 40, inRect(10, 10, 20, 20))
    expect(traceRegion(image, [-1, 5], { tolerancePx: 1 })).toMatchObject({ ok: false, code: 'outside' })
    expect(traceRegion(image, [50, 5], { tolerancePx: 1 })).toMatchObject({ ok: false, code: 'outside' })
    expect(traceRegion(image, [Number.NaN, 5], { tolerancePx: 1 })).toMatchObject({ ok: false, code: 'outside' })
  })

  it('a malformed bitmap (data shorter than width × height × 4)', () => {
    expect(traceRegion({ width: 10, height: 10, data: new Uint8ClampedArray(12) }, [5, 5], { tolerancePx: 1 })).toMatchObject({ ok: false, code: 'empty' })
  })

  it('a negative or non-finite tolerance is treated as 0, not thrown on', () => {
    const image = bitmap(60, 60, inRect(10, 10, 40, 40))
    expect(traceRegion(image, [30, 30], { tolerancePx: -3 }).ok).toBe(true)
    expect(traceRegion(image, [30, 30], { tolerancePx: Number.NaN }).ok).toBe(true)
  })
})

describe('traceRegion — topology', () => {
  it('two squares touching only at a corner are two parts: the tap traces only its own', () => {
    const image = bitmap(100, 100, (x, y) => inRect(20, 20, 30, 30)(x, y) || inRect(50, 50, 30, 30)(x, y))
    const result = traceRegion(image, [30, 30], { tolerancePx: 1 })
    expect(result.ok).toBe(true)
    expect(result.outlines).toHaveLength(1)
    const box = bounds(result.outlines[0].pointsPx)
    expect(box.maxX).toBeLessThanOrEqual(51)
    expect(box.maxY).toBeLessThanOrEqual(51)
  })

  it('a 1-px crack is closed (speckle clean-up), so the crack does not open the hole', () => {
    const ring = (x, y) => inDisc(50, 50, 35)(x, y) && !inDisc(50, 50, 20)(x, y)
    const cracked = (x, y) => ring(x, y) && !(x === 50 && y > 50)
    const result = traceRegion(bitmap(100, 100, cracked), [50, 22], { tolerancePx: 0.5 })
    expect(result.outlines.map((o) => o.role)).toEqual(['solid', 'hole'])
  })

  it('a self-touching outline — a C whose 3-px slot nearly closes it — stays one simple ring, never crossing itself', () => {
    const ring = (x, y) => inDisc(50, 50, 35)(x, y) && !inDisc(50, 50, 20)(x, y)
    // Cut a slot three pixels wide from the hole out to the rim: wide enough to survive the
    // clean-up's close, narrow enough that RDP at 4 px could fold the two sides across it.
    const c = (x, y) => ring(x, y) && !(x >= 49 && x <= 51 && y > 50)
    const image = bitmap(100, 100, c)
    for (const tolerancePx of [0.5, 2, 4]) {
      const result = traceRegion(image, [50, 22], { tolerancePx })
      expect(result.ok).toBe(true)
      expect(result.outlines.map((o) => o.role)).toEqual(['solid']) // the "hole" leaks out through the slot
      expect(ringSelfIntersects(result.outlines[0].pointsPx)).toBe(false)
    }
  })

  it('a ring touching its hole diagonally through one pixel corner: the background leaks, no hole', () => {
    // A 3 × 3 block with its centre and one diagonal corner pixel removed: the centre
    // background touches the outside only at a corner. Background is 8-connected, so it
    // is not enclosed.
    const pattern = new Set(['0,0', '1,0', '2,0', '0,1', '2,1', '0,2', '1,2'])
    const image = bitmap(20, 20, (x, y) => {
      const local = `${Math.floor((x - 5) / 3)},${Math.floor((y - 5) / 3)}`
      return x >= 5 && y >= 5 && x < 14 && y < 14 && pattern.has(local)
    })
    const result = traceRegion(image, [6, 6], { tolerancePx: 0 })
    expect(result.ok).toBe(true)
    expect(result.outlines.filter((o) => o.role === 'hole')).toHaveLength(0)
  })

  it('every outline is a ring without a repeated closing point; solids and holes come back in opposite windings in px', () => {
    const image = bitmap(120, 100, (x, y) => inRect(10, 10, 100, 80)(x, y) && !inRect(40, 30, 30, 30)(x, y))
    const result = traceRegion(image, [20, 20], { tolerancePx: 0.5 })
    const [solid, hole] = result.outlines
    for (const outline of result.outlines) {
      const first = outline.pointsPx[0]
      const last = outline.pointsPx[outline.pointsPx.length - 1]
      expect(first[0] === last[0] && first[1] === last[1]).toBe(false)
    }
    const signed = (ring) => ring.reduce((s, a, i) => s + a[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * a[1], 0)
    expect(Math.sign(signed(solid.pointsPx))).toBe(-Math.sign(signed(hole.pointsPx)))
    expect(hole.pointsPx).toHaveLength(4)
  })

  it('a hole smaller than the tolerance is dropped; a larger one kept', () => {
    const image = bitmap(120, 100, (x, y) => inRect(10, 10, 100, 80)(x, y) && !inRect(30, 30, 3, 3)(x, y) && !inRect(70, 40, 12, 12)(x, y))
    const result = traceRegion(image, [20, 20], { tolerancePx: 2 })
    expect(result.outlines.map((o) => o.role)).toEqual(['solid', 'hole'])
    expect(bounds(result.outlines[1].pointsPx).minX).toBeCloseTo(70, 0)
  })

  it('a long straight edge keeps no collinear vertex — not even where the ring happened to start', () => {
    // A tall thin rectangle: marching squares starts somewhere along an edge.
    const image = bitmap(60, 400, inRect(20, 10, 20, 380))
    const result = traceRegion(image, [30, 200], { tolerancePx: 0.75 })
    expect(result.outlines[0].pointsPx).toHaveLength(4)
  })

  it('a huge wiggly outline is capped well under the 4096-point polyline limit', () => {
    const image = bitmap(1200, 1200, (x, y) => {
      const dx = x + 0.5 - 600
      const dy = y + 0.5 - 600
      const angle = Math.atan2(dy, dx)
      return Math.hypot(dx, dy) <= 450 + 40 * Math.sin(angle * 90)
    })
    const result = traceRegion(image, [600, 600], { tolerancePx: 0 })
    expect(result.ok).toBe(true)
    expect(result.outlines[0].pointsPx.length).toBeLessThanOrEqual(2000)
    expect(ringSelfIntersects(result.outlines[0].pointsPx)).toBe(false)
  })
})

describe('contoursOf — marching squares on a mask', () => {
  it('a single pixel is one diamond of area ½ px²', () => {
    const mask = new Uint8Array(9)
    mask[4] = 1
    const loops = contoursOf(mask, 3, 3)
    expect(loops).toHaveLength(1)
    expect(loops[0]).toHaveLength(4)
    expect(area(loops[0])).toBeCloseTo(0.5, 12)
  })

  it('an empty mask has no contours', () => {
    expect(contoursOf(new Uint8Array(16), 4, 4)).toEqual([])
  })
})

describe('ringSelfIntersects', () => {
  it('a square does not; a bow-tie does; collinear and coincident points do not count as crossings', () => {
    expect(ringSelfIntersects([[0, 0], [10, 0], [10, 10], [0, 10]])).toBe(false)
    expect(ringSelfIntersects([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(true)
    expect(ringSelfIntersects([[0, 0], [5, 0], [10, 0], [10, 10], [0, 10]])).toBe(false)
    expect(ringSelfIntersects([[0, 0], [0, 0], [10, 0], [10, 10]])).toBe(false)
  })
})
