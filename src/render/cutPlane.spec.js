// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createScreenPoint, worldToScreen } from './annotate.js'
import { createOrbitCamera } from './camera.js'
import {
  createCutPlaneAnnotation,
  cutPlaneDragDeltaMm,
  faceToScreen,
  faceViewIsUsable,
  screenToFace,
  updateCutPlaneAnnotation,
} from './cutPlane.js'

/** @type {[[number, number, number], [number, number, number]]} */
const BAR = [
  [0, -10, -10],
  [300, 10, 10],
]

describe('cut plane overlay — the translucent plane Split previews', () => {
  it('projects a four-corner plane at the cut position, with a handle at its centre', () => {
    const orbit = createOrbitCamera({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 800, target: { x: 150, y: 0, z: 0 } })
    const out = createCutPlaneAnnotation()
    updateCutPlaneAnnotation(orbit, BAR, 0, 150, 800, 600, out)
    expect(out.visible).toBe(true)
    expect(out.points).toMatch(/^(-?\d+(\.\d+)?,-?\d+(\.\d+)? ){3}-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    // Looking straight down -Y at the bar's middle, the plane at x = 150 is the screen's centre column.
    expect(out.handleX).toBeCloseTo(400, 3)
    expect(out.handleY).toBeCloseTo(300, 3)
  })

  it('moves with the offset: a cut further along +X lands further right on screen', () => {
    const orbit = createOrbitCamera({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 800, target: { x: 150, y: 0, z: 0 } })
    const at150 = createCutPlaneAnnotation()
    const at230 = createCutPlaneAnnotation()
    updateCutPlaneAnnotation(orbit, BAR, 0, 150, 800, 600, at150)
    updateCutPlaneAnnotation(orbit, BAR, 0, 230, 800, 600, at230)
    expect(at230.handleX).toBeGreaterThan(at150.handleX)
  })

  it('a drag along the axis’s screen image moves the plane that many millimetres; across it, none', () => {
    const orbit = createOrbitCamera({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 800, target: { x: 150, y: 0, z: 0 } })
    const out = createCutPlaneAnnotation()
    updateCutPlaneAnnotation(orbit, BAR, 0, 150, 800, 600, out)
    const pxPerMm = Math.hypot(out.axisX, out.axisY)
    expect(pxPerMm).toBeGreaterThan(0)
    expect(cutPlaneDragDeltaMm(out, 10 * pxPerMm, 0)).toBeCloseTo(10, 6)
    expect(cutPlaneDragDeltaMm(out, 0, 25)).toBeCloseTo(0, 6)
  })

  it('an axis pointing straight at the camera cannot be dragged along — zero, not a division by zero', () => {
    const orbit = createOrbitCamera({ azimuthDeg: 0, elevationDeg: 0, distanceMm: 800, target: { x: 150, y: 0, z: 0 } })
    const out = createCutPlaneAnnotation()
    updateCutPlaneAnnotation(orbit, BAR, 0, 150, 800, 600, out)
    expect(cutPlaneDragDeltaMm(out, 30, 30)).toBe(0)
  })

  it('hidden when there is nothing to cut', () => {
    const orbit = createOrbitCamera()
    const out = createCutPlaneAnnotation()
    out.visible = true
    updateCutPlaneAnnotation(orbit, null, 0, 0, 800, 600, out)
    expect(out.visible).toBe(false)
  })
})

describe('cut face markers — face position <-> screen (TODO/ui-067)', () => {
  /** Looking along X at the plane x = 150, from whichever side faces it square on. */
  function faceOn() {
    for (const azimuthDeg of [0, 90, 180, -90]) {
      const orbit = createOrbitCamera({ azimuthDeg, elevationDeg: 0, distanceMm: 800, target: { x: 150, y: 0, z: 0 } })
      const out = createCutPlaneAnnotation()
      updateCutPlaneAnnotation(orbit, BAR, 0, 150, 800, 600, out)
      if (faceViewIsUsable(out)) return out
    }
    throw new Error('no square-on view found')
  }

  it('a square-on camera can place markers; one looking along the face cannot', () => {
    expect(faceViewIsUsable(faceOn())).toBe(true)
    const orbit = createOrbitCamera({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 800, target: { x: 150, y: 0, z: 0 } })
    const out = createCutPlaneAnnotation()
    updateCutPlaneAnnotation(orbit, BAR, 0, 150, 800, 600, out)
    expect(faceViewIsUsable(out)).toBe(false)
  })

  it('the face centre lands on the handle, and screenToFace inverts faceToScreen', () => {
    const out = faceOn()
    expect(out.centreU).toBeCloseTo(0, 9)
    expect(out.centreV).toBeCloseTo(0, 9)
    const at = faceToScreen(out, 0, 0, { x: 0, y: 0 })
    expect(at.x).toBeCloseTo(out.handleX, 9)
    expect(at.y).toBeCloseTo(out.handleY, 9)
    const moved = faceToScreen(out, 7.5, -3, { x: 0, y: 0 })
    const back = screenToFace(out, moved.x, moved.y, { uMm: 0, vMm: 0 })
    expect(back?.uMm).toBeCloseTo(7.5, 6)
    expect(back?.vMm).toBeCloseTo(-3, 6)
  })

  it('a close, oblique camera: markers land within 0.5 px of the true projection (TODO/ui-137)', () => {
    const orbit = createOrbitCamera({ azimuthDeg: 30, elevationDeg: 35, distanceMm: 90, target: { x: 150, y: 0, z: 0 } })
    const out = createCutPlaneAnnotation()
    updateCutPlaneAnnotation(orbit, BAR, 0, 150, 390, 791, out)
    expect(out.hasHomography).toBe(true)
    const truth = createScreenPoint()
    const at = { x: 0, y: 0 }
    // Face axes for cut axis 0 are u = Y, v = Z; take the body's corners and some interior points.
    for (const [uMm, vMm] of [[-10, -10], [10, -10], [10, 10], [-10, 10], [4, -7], [0, 0]]) {
      worldToScreen(orbit, 150, uMm, vMm, 390, 791, truth)
      faceToScreen(out, uMm, vMm, at)
      expect(Math.abs(at.x - truth.x)).toBeLessThan(0.5)
      expect(Math.abs(at.y - truth.y)).toBeLessThan(0.5)
      const back = screenToFace(out, truth.x, truth.y, { uMm: 0, vMm: 0 })
      expect(back?.uMm).toBeCloseTo(uMm, 4)
      expect(back?.vMm).toBeCloseTo(vMm, 4)
    }
  })

  it('screenToFace refuses a face seen edge-on', () => {
    const orbit = createOrbitCamera({ azimuthDeg: -90, elevationDeg: 0, distanceMm: 800, target: { x: 150, y: 0, z: 0 } })
    const out = createCutPlaneAnnotation()
    updateCutPlaneAnnotation(orbit, BAR, 0, 150, 800, 600, out)
    expect(screenToFace(out, 100, 100, { uMm: 0, vMm: 0 })).toBeNull()
  })
})
