// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createOrbitCamera } from './camera.js'
import { createCutPlaneAnnotation, cutPlaneDragDeltaMm, updateCutPlaneAnnotation } from './cutPlane.js'

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
