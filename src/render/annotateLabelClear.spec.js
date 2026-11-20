// SPDX-License-Identifier: AGPL-3.0-or-later
import { PerformanceObserver } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'

import { createOrbitCamera } from './camera.js'
import {
  GIZMO_CLEAR_PX,
  LABEL_CHAR_PX,
  LABEL_HALF_HEIGHT_PX,
  LABEL_PAD_PX,
  RING_SEGMENTS,
  createDimensionAnnotation,
  createGizmoAnnotation,
  gizmoSizeForBounds,
  updateDimensionAnnotation,
  updateGizmoAnnotation,
} from './annotate.js'

/**
 * TODO/ui-147: a dimension label's digits stay clear of the gizmo's rotate rings and translate arms.
 *
 * The oracle here is deliberately not the placer's own test: it samples each ring ellipse densely
 * (720 points, under 2 px apart at the largest ring) and each arm along its length, and asks whether any
 * sample falls inside the label's box grown by `GIZMO_CLEAR_PX`. Units: every number is screen px.
 */

const PHONE_W = 390
const PHONE_H = 844
const MIN = [-20, -20, 0]
const MAX = [20, 20, 50]
const CENTRE = [0, 0, 25]
const DIM_OFFSET_PX = 28
const DIM_ARROW_PX = 9

/**
 * @param {readonly number[]} rotationDeg
 * @returns {import('./annotate.js').OrientedBox}
 */
function box(rotationDeg) {
  return { minMm: MIN, maxMm: MAX, rotationDeg, pivotMm: CENTRE }
}

/**
 * @param {import('./camera.js').OrbitCamera} orbit
 * @param {number} widthPx
 * @param {number} heightPx
 * @returns {import('./annotate.js').GizmoAnnotation}
 */
function gizmoFor(orbit, widthPx, heightPx) {
  const { armPx, ringPx } = gizmoSizeForBounds(
    [-20, -20, -20],
    [20, 20, 70],
    orbit.getMmPerPixel(heightPx)
  )
  return updateGizmoAnnotation(orbit, CENTRE[0], CENTRE[1], CENTRE[2], widthPx, heightPx, armPx, ringPx, createGizmoAnnotation())
}

/**
 * Independent oracle: does any sampled point of any ring or arm sit inside the label's box grown by the clearance?
 *
 * @param {import('./annotate.js').DimensionAnnotation} out
 * @param {import('./annotate.js').GizmoAnnotation} gizmo
 * @param {number} [extraPx] Extra clearance to demand, for "clear with room to spare".
 * @returns {boolean}
 */
function labelMeetsGizmo(out, gizmo, extraPx = 0) {
  const halfW = (out.label.length * LABEL_CHAR_PX) / 2 + LABEL_PAD_PX + GIZMO_CLEAR_PX + extraPx
  const halfH = LABEL_HALF_HEIGHT_PX + GIZMO_CLEAR_PX + extraPx
  /** @param {number} x @param {number} y */
  const inside = (x, y, grow = 0) => Math.abs(x - out.labelX) <= halfW + grow && Math.abs(y - out.labelY) <= halfH + grow
  for (const ring of gizmo.rings) {
    if (!ring.visible) continue
    for (let i = 0; i < 720; i += 1) {
      const t = (i / 720) * 2 * Math.PI
      const x = gizmo.originX + ring.ux * Math.cos(t) + ring.vx * Math.sin(t)
      const y = gizmo.originY + ring.uy * Math.cos(t) + ring.vy * Math.sin(t)
      if (inside(x, y)) return true
    }
  }
  for (const arrow of gizmo.arrows) {
    if (!arrow.visible) continue
    for (let i = 0; i <= 200; i += 1) {
      const f = i / 200
      if (inside(gizmo.originX + (arrow.tipX - gizmo.originX) * f, gizmo.originY + (arrow.tipY - gizmo.originY) * f, arrow.coneRx)) return true
    }
  }
  return false
}

/**
 * @param {(orbit: import('./camera.js').OrbitCamera, rotationDeg: number[], axis: number, gizmo: import('./annotate.js').GizmoAnnotation) => void} visit
 * @returns {void}
 */
function sweep(visit) {
  for (const rotationDeg of [[0, 0, 0], [60, 0, 0], [0, 60, 0]]) {
    for (let azimuthDeg = -180; azimuthDeg < 180; azimuthDeg += 15) {
      for (const elevationDeg of [-30, 10, 40, 70]) {
        for (const distanceMm of [420, 600, 900]) {
          const orbit = createOrbitCamera({ azimuthDeg, elevationDeg, distanceMm })
          const gizmo = gizmoFor(orbit, PHONE_W, PHONE_H)
          for (let axis = 0; axis < 3; axis += 1) visit(orbit, rotationDeg, axis, gizmo)
        }
      }
    }
  }
}

describe('dimension label clear of the gizmo (TODO/ui-147)', () => {
  it('moves no label box onto a ring or arm over a 390 px orbit sweep, where a free spot exists', () => {
    const aware = createDimensionAnnotation()
    const blind = createDimensionAnnotation()
    let views = 0
    let blindHits = 0
    let awareHits = 0
    sweep((orbit, rotationDeg, axis, gizmo) => {
      updateDimensionAnnotation(orbit, box(rotationDeg), axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, blind)
      updateDimensionAnnotation(orbit, box(rotationDeg), axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, aware, gizmo)
      if (!aware.visible) return
      views += 1
      if (labelMeetsGizmo(blind, gizmo)) blindHits += 1
      if (labelMeetsGizmo(aware, gizmo)) awareHits += 1
    })
    expect(views).toBeGreaterThan(500)
    // The finding is real: the old placer put a label on the gizmo in a noticeable share of views.
    expect(blindHits).toBeGreaterThan(views * 0.1)
    // The new one leaves only the views where no spot is free (the fallback case, tested below).
    expect(awareHits).toBeLessThanOrEqual(views * 0.02)
  })

  it('does not move a label that was already clear', () => {
    const aware = createDimensionAnnotation()
    const blind = createDimensionAnnotation()
    let checked = 0
    sweep((orbit, rotationDeg, axis, gizmo) => {
      updateDimensionAnnotation(orbit, box(rotationDeg), axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, blind)
      updateDimensionAnnotation(orbit, box(rotationDeg), axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, aware, gizmo)
      if (!blind.visible || labelMeetsGizmo(blind, gizmo, 1)) return
      checked += 1
      expect(aware.labelX).toBeCloseTo(blind.labelX, 9)
      expect(aware.labelY).toBeCloseTo(blind.labelY, 9)
    })
    expect(checked).toBeGreaterThan(10)
  })

  it('leaves every label where it was when the gizmo is nowhere near it', () => {
    const aware = createDimensionAnnotation()
    const blind = createDimensionAnnotation()
    sweep((orbit, rotationDeg, axis, gizmo) => {
      gizmo.originX += 5000
      for (const arrow of gizmo.arrows) arrow.tipX += 5000
      updateDimensionAnnotation(orbit, box(rotationDeg), axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, blind)
      updateDimensionAnnotation(orbit, box(rotationDeg), axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, aware, gizmo)
      expect(aware.labelX).toBe(blind.labelX)
      expect(aware.labelY).toBe(blind.labelY)
    })
  })

  it('keeps a moved label inside the viewport and finite, and leaves the line and arrowheads where they measure', () => {
    const aware = createDimensionAnnotation()
    const blind = createDimensionAnnotation()
    sweep((orbit, rotationDeg, axis, gizmo) => {
      updateDimensionAnnotation(orbit, box(rotationDeg), axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, blind)
      updateDimensionAnnotation(orbit, box(rotationDeg), axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, aware, gizmo)
      if (!aware.visible) return
      const halfW = (aware.label.length * LABEL_CHAR_PX) / 2 + LABEL_PAD_PX
      expect(Number.isFinite(aware.labelX) && Number.isFinite(aware.labelY)).toBe(true)
      expect(aware.labelX - halfW).toBeGreaterThanOrEqual(-1e-9)
      expect(aware.labelX + halfW).toBeLessThanOrEqual(PHONE_W + 1e-9)
      expect(aware.labelY - LABEL_HALF_HEIGHT_PX).toBeGreaterThanOrEqual(-1e-9)
      expect(aware.labelY + LABEL_HALF_HEIGHT_PX).toBeLessThanOrEqual(PHONE_H + 1e-9)
      expect(aware.x1).toBeCloseTo(blind.x1, 9)
      expect(aware.y2).toBeCloseTo(blind.y2, 9)
      expect(aware.h1[0].x).toBeCloseTo(blind.h1[0].x, 9)
    })
  })

  it('treats a missing, hidden or null gizmo as nothing to avoid', () => {
    const orbit = createOrbitCamera({ azimuthDeg: 30, elevationDeg: 30, distanceMm: 200 })
    const gizmo = gizmoFor(orbit, PHONE_W, PHONE_H)
    const reference = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, box([60, 0, 0]), 2, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, reference)
    gizmo.visible = false
    for (const g of [undefined, null, gizmo]) {
      const out = createDimensionAnnotation()
      updateDimensionAnnotation(orbit, box([60, 0, 0]), 2, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, out, g)
      expect(out.labelX).toBeCloseTo(reference.labelX, 9)
      expect(out.labelY).toBeCloseTo(reference.labelY, 9)
    }
  })

  it('falls back to the least-crossed spot, finite and in the viewport, when no spot is free', () => {
    // A ring far larger than the viewport crosses every candidate position.
    const orbit = createOrbitCamera({ azimuthDeg: 30, elevationDeg: 30, distanceMm: 200 })
    const gizmo = createGizmoAnnotation()
    updateGizmoAnnotation(orbit, 0, 0, 25, PHONE_W, PHONE_H, 4000, 3950, gizmo)
    const out = createDimensionAnnotation()
    updateDimensionAnnotation(orbit, box([0, 0, 0]), 0, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, out, gizmo)
    expect(out.visible).toBe(true)
    expect(Number.isFinite(out.labelX) && Number.isFinite(out.labelY)).toBe(true)
    expect(out.labelX).toBeGreaterThan(0)
    expect(out.labelX).toBeLessThan(PHONE_W)
    expect(out.labelY).toBeGreaterThan(0)
    expect(out.labelY).toBeLessThan(PHONE_H)
  })

  it('survives rings seen edge-on and a zero-size body', () => {
    for (const elevationDeg of [0, 90]) {
      const orbit = createOrbitCamera({ azimuthDeg: -90, elevationDeg, distanceMm: 200 })
      const gizmo = gizmoFor(orbit, PHONE_W, PHONE_H)
      for (let axis = 0; axis < 3; axis += 1) {
        const out = createDimensionAnnotation()
        updateDimensionAnnotation(orbit, box([0, 0, 0]), axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, out, gizmo)
        if (out.visible) expect(Number.isFinite(out.labelX) && Number.isFinite(out.labelY)).toBe(true)
      }
    }
    const orbit = createOrbitCamera({ azimuthDeg: 20, elevationDeg: 20, distanceMm: 200 })
    const gizmo = gizmoFor(orbit, PHONE_W, PHONE_H)
    const out = createDimensionAnnotation()
    const zero = { minMm: [5, 5, 5], maxMm: [5, 5, 5], rotationDeg: [0, 0, 0], pivotMm: [5, 5, 5] }
    updateDimensionAnnotation(orbit, zero, 0, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, out, gizmo)
    expect(Number.isFinite(out.labelX) && Number.isFinite(out.labelY)).toBe(true)
  })

  it('allocates nothing per placement (CLAUDE.md, Performance)', async () => {
    const real = createOrbitCamera({ azimuthDeg: 40, elevationDeg: 25, distanceMm: 420 })
    const gizmo = gizmoFor(real, PHONE_W, PHONE_H)
    // `orbit.state` builds a fresh object on every read, which would hide this function's own allocation
    // behind the camera's. A stand-in with one stable state object isolates what the placer does.
    const stable = { state: { ...real.state }, fovDeg: real.fovDeg }
    const out = createDimensionAnnotation()
    const b = box([60, 0, 0])
    let moved = 0
    const call = () => {
      for (let axis = 0; axis < 3; axis += 1) {
        updateDimensionAnnotation(/** @type {any} */ (stable), b, axis, PHONE_W, PHONE_H, DIM_OFFSET_PX, DIM_ARROW_PX, out, gizmo)
        if (out.labelX > 0) moved += 1
      }
    }
    for (let i = 0; i < 3000; i += 1) call()
    // Count the garbage collections the loop causes: 60 000 placements. A placer that boxed a double or
    // built a small object per candidate measured 95 collections here; the shipped one stays under 10
    // (the residue is the test runner's own allocation, the same with no gizmo at all).
    let collections = 0
    const observer = new PerformanceObserver((list) => {
      collections += list.getEntries().length
    })
    observer.observe({ entryTypes: ['gc'] })
    for (let i = 0; i < 20000; i += 1) call()
    await new Promise((resolve) => setTimeout(resolve, 20))
    observer.disconnect()
    expect(moved).toBeGreaterThan(0)
    expect(collections).toBeLessThanOrEqual(10)
  })

  it('samples rings at the same count the gizmo draws', () => {
    expect(RING_SEGMENTS).toBeGreaterThanOrEqual(24)
  })
})
