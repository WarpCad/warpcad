// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import {
  createDialAnnotation,
  createDimensionAnnotation,
  createGizmoAnnotation,
  createRulerAnnotation,
  gizmoSizeForBounds,
} from './annotate.js'
import { createOrbitCamera } from './camera.js'
import { createCutPlaneAnnotation } from './cutPlane.js'
import { createOverlaySync } from './overlaySync.js'

/**
 * `createOverlaySync` is framework-free: the real orbit camera and the real `annotate.js` and
 * `cutPlane.js` maths run, and the stores are plain objects. No WebGL is touched at all, so
 * nothing needs mocking beyond the gizmo drag's two re-projection hooks.
 */

const WIDTH_PX = 800
const HEIGHT_PX = 600

/**
 * A selected body description, shaped like `src/core/inspector.js`'s.
 *
 * @param {object} [extra]
 */
function body(extra = {}) {
  return {
    id: 'b1',
    positionMm: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    boundsMm: [
      [-10, -10, -10],
      [10, 10, 10],
    ],
    localBoundsMm: [
      [-10, -10, -10],
      [10, 10, 10],
    ],
    ...extra,
  }
}

/**
 * @param {object} [options]
 * @param {any} [options.selected]
 * @param {Record<string, any>} [options.views]
 * @param {any} [options.splitSheet]
 * @param {number} [options.widthPx]
 * @param {number} [options.heightPx]
 */
function setup({
  selected = body(),
  views = {},
  splitSheet = { isOpen: false, previewBounds: null, axisIndex: 0, cutMm: 0 },
  widthPx = WIDTH_PX,
  heightPx = HEIGHT_PX,
} = {}) {
  const orbit = createOrbitCamera({ azimuthDeg: 30, elevationDeg: 25, distanceMm: 200, target: { x: 1, y: 2, z: 3 } })
  const overlay = { azimuthDeg: 0, elevationDeg: 0, distanceMm: 0, target: '0,0,0', mmPerPixel: 0, minorMm: 10, majorMm: 50 }
  const gizmo = createGizmoAnnotation()
  const dial = createDialAnnotation()
  const ruler = createRulerAnnotation()
  const dimensions = [createDimensionAnnotation(), createDimensionAnnotation(), createDimensionAnnotation()]
  const cutPlane = createCutPlaneAnnotation()
  const gizmoDrag = { syncDial: vi.fn(), syncRuler: vi.fn() }
  const state = { selected }
  const sync = createOverlaySync({
    orbit,
    overlay,
    gizmo,
    dial,
    ruler,
    dimensions,
    cutPlane,
    selectedBody: () => state.selected,
    bodyView: (id) => views[id],
    splitSheet,
    gizmoDrag,
    widthPx: () => widthPx,
    heightPx: () => heightPx,
  })
  return { sync, orbit, overlay, gizmo, dial, ruler, dimensions, cutPlane, gizmoDrag, state, splitSheet }
}

describe('createOverlaySync: the camera mirror', () => {
  it('copies the orbit state and the scale into the overlay', () => {
    const { sync, orbit, overlay } = setup({ selected: null })
    sync.sync()
    expect(overlay.azimuthDeg).toBeCloseTo(30, 9)
    expect(overlay.elevationDeg).toBeCloseTo(25, 9)
    expect(overlay.distanceMm).toBeCloseTo(200, 9)
    expect(overlay.target).toBe('1.00,2.00,3.00')
    expect(overlay.mmPerPixel).toBeCloseTo(orbit.getMmPerPixel(HEIGHT_PX), 9)
  })

  it('leaves the grid spacing alone (the viewport owns it)', () => {
    const { sync, overlay } = setup({ selected: null })
    sync.sync()
    expect(overlay.minorMm).toBe(10)
    expect(overlay.majorMm).toBe(50)
  })

  it('formats a negative, fractional target to two places', () => {
    const { sync, orbit, overlay } = setup({ selected: null })
    orbit.state.target.x = -0.004
    orbit.state.target.y = 12.345
    orbit.state.target.z = -7.5
    sync.sync()
    expect(overlay.target).toBe('-0.00,12.35,-7.50')
  })

  it('reads the height at call time, so a resize changes the scale', () => {
    let heightPx = 600
    const orbit = createOrbitCamera()
    const overlay = { azimuthDeg: 0, elevationDeg: 0, distanceMm: 0, target: '', mmPerPixel: 0, minorMm: 10, majorMm: 50 }
    const sync = createOverlaySync({
      orbit,
      overlay,
      gizmo: createGizmoAnnotation(),
      dial: createDialAnnotation(),
      ruler: createRulerAnnotation(),
      dimensions: [createDimensionAnnotation(), createDimensionAnnotation(), createDimensionAnnotation()],
      cutPlane: createCutPlaneAnnotation(),
      selectedBody: () => null,
      bodyView: () => undefined,
      splitSheet: { isOpen: false, previewBounds: null, axisIndex: 0, cutMm: 0 },
      gizmoDrag: { syncDial: vi.fn(), syncRuler: vi.fn() },
      widthPx: () => 800,
      heightPx: () => heightPx,
    })
    sync.sync()
    const before = overlay.mmPerPixel
    heightPx = 300
    sync.sync()
    expect(overlay.mmPerPixel).toBeCloseTo(before * 2, 9)
  })
})

describe('createOverlaySync: the selection overlays', () => {
  it('hides the gizmo, dial, ruler and every dimension line with nothing selected', () => {
    const { sync, gizmo, dial, ruler, dimensions, gizmoDrag } = setup({ selected: null })
    gizmo.visible = true
    dial.visible = true
    ruler.visible = true
    for (const dimension of dimensions) dimension.visible = true
    sync.sync()
    expect(gizmo.visible).toBe(false)
    expect(dial.visible).toBe(false)
    expect(ruler.visible).toBe(false)
    expect(dimensions.map((d) => d.visible)).toEqual([false, false, false])
    // Nothing to re-project a drag onto.
    expect(gizmoDrag.syncDial).not.toHaveBeenCalled()
    expect(gizmoDrag.syncRuler).not.toHaveBeenCalled()
  })

  it('draws the gizmo at the body origin, sized to its bounds, with three dimension lines', () => {
    const { sync, orbit, overlay, gizmo, dimensions, gizmoDrag } = setup()
    sync.sync()
    expect(gizmo.visible).toBe(true)
    const { armPx } = gizmoSizeForBounds([-10, -10, -10], [10, 10, 10], overlay.mmPerPixel)
    // Every visible arm reaches exactly `armPx` from the hub.
    for (const arrow of gizmo.arrows) {
      if (!arrow.visible) continue
      expect(Math.hypot(arrow.tipX - gizmo.originX, arrow.tipY - gizmo.originY)).toBeCloseTo(armPx, 6)
    }
    expect(dimensions.map((d) => d.axis)).toEqual(['X', 'Y', 'Z'])
    expect(dimensions.every((d) => d.visible)).toBe(true)
    for (const dimension of dimensions) expect(dimension.lengthMm).toBeCloseTo(20, 9)
    expect(gizmoDrag.syncDial).toHaveBeenCalledTimes(1)
    expect(gizmoDrag.syncRuler).toHaveBeenCalledTimes(1)
    // The camera was not moved by an overlay sync.
    expect(orbit.version).toBe(0)
  })

  it('measures the local box, not the world-axis bounds, for the dimension lines', () => {
    const { sync, dimensions } = setup({
      selected: body({
        rotationDeg: [0, 0, 45],
        boundsMm: [
          [-14.142, -14.142, -5],
          [14.142, 14.142, 5],
        ],
        localBoundsMm: [
          [-10, -10, -5],
          [10, 10, 5],
        ],
      }),
    })
    sync.sync()
    expect(dimensions[0].lengthMm).toBeCloseTo(20, 9)
    expect(dimensions[1].lengthMm).toBeCloseTo(20, 9)
    expect(dimensions[2].lengthMm).toBeCloseTo(10, 9)
  })

  it('keeps the dimension lines but drops the gizmo on a drilled part', () => {
    const { sync, gizmo, dimensions, gizmoDrag } = setup({
      selected: body({ subPart: { groupName: 'G', partName: 'p' } }),
    })
    gizmo.visible = true
    sync.sync()
    expect(gizmo.visible).toBe(false)
    expect(dimensions.every((d) => d.visible)).toBe(true)
    expect(gizmoDrag.syncDial).toHaveBeenCalledTimes(1)
  })

  it('keeps the dimension lines but drops the gizmo on a repeat body', () => {
    const { sync, gizmo, dimensions } = setup({ selected: body({ moveRefusal: 'Move the source instead.' }) })
    gizmo.visible = true
    sync.sync()
    expect(gizmo.visible).toBe(false)
    expect(dimensions.every((d) => d.visible)).toBe(true)
  })

  it('hides everything for a selected body the user hid', () => {
    const { sync, gizmo, dimensions } = setup({ views: { b1: { viewHidden: true } } })
    sync.sync()
    expect(gizmo.visible).toBe(false)
    expect(dimensions.every((d) => !d.visible)).toBe(true)
  })

  it('hides everything for a drilled part the user hid, but not for a sibling part', () => {
    const hiddenPart = setup({
      selected: body({ subPart: { groupName: 'G', partName: 'p' } }),
      views: { b1: { viewHiddenParts: ['p'] } },
    })
    hiddenPart.sync.sync()
    expect(hiddenPart.dimensions.every((d) => !d.visible)).toBe(true)

    const sibling = setup({
      selected: body({ subPart: { groupName: 'G', partName: 'q' } }),
      views: { b1: { viewHiddenParts: ['p'] } },
    })
    sibling.sync.sync()
    expect(sibling.dimensions.every((d) => d.visible)).toBe(true)
  })

  it('treats a body with no mesh yet as drawn', () => {
    const { sync, gizmo } = setup({ views: {} })
    sync.sync()
    expect(gizmo.visible).toBe(true)
  })

  it('hides the overlays again once the selection clears', () => {
    const { sync, gizmo, dimensions, state } = setup()
    sync.sync()
    expect(gizmo.visible).toBe(true)
    state.selected = null
    sync.sync()
    expect(gizmo.visible).toBe(false)
    expect(dimensions.every((d) => !d.visible)).toBe(true)
  })

  it('survives a zero-size body (degenerate bounds) with finite output', () => {
    const { sync, gizmo, dimensions } = setup({
      selected: body({
        boundsMm: [
          [0, 0, 0],
          [0, 0, 0],
        ],
        localBoundsMm: [
          [0, 0, 0],
          [0, 0, 0],
        ],
      }),
    })
    sync.sync()
    expect(gizmo.visible).toBe(true)
    expect(Number.isFinite(gizmo.originX)).toBe(true)
    for (const arrow of gizmo.arrows) expect(Number.isFinite(arrow.tipX)).toBe(true)
    for (const dimension of dimensions) expect(dimension.lengthMm).toBeCloseTo(0, 9)
  })

  it('writes into the structures it was given rather than replacing them', () => {
    const { sync, gizmo, dimensions } = setup()
    const arrows = gizmo.arrows
    const first = dimensions[0]
    sync.sync()
    sync.sync()
    expect(gizmo.arrows).toBe(arrows)
    expect(dimensions[0]).toBe(first)
  })
})

describe('createOverlaySync: the cut plane', () => {
  it('hides the plane while the Split sheet is closed', () => {
    const { sync, cutPlane } = setup()
    cutPlane.visible = true
    sync.sync()
    expect(cutPlane.visible).toBe(false)
  })

  it('projects the plane while the Split sheet is open', () => {
    const { sync, cutPlane } = setup({
      selected: null,
      splitSheet: {
        isOpen: true,
        previewBounds: [
          [-10, -10, -10],
          [10, 10, 10],
        ],
        axisIndex: 2,
        cutMm: 0,
      },
    })
    sync.sync()
    expect(cutPlane.visible).toBe(true)
    expect(cutPlane.points.split(' ')).toHaveLength(4)
  })

  it('hides the plane when open with no bounds yet', () => {
    const { sync, cutPlane } = setup({
      splitSheet: { isOpen: true, previewBounds: null, axisIndex: 0, cutMm: 0 },
    })
    cutPlane.visible = true
    sync.sync()
    expect(cutPlane.visible).toBe(false)
  })

  it('reads the sheet live, so closing it hides the plane on the next sync', () => {
    const { sync, cutPlane, splitSheet } = setup({
      splitSheet: {
        isOpen: true,
        previewBounds: [
          [-10, -10, -10],
          [10, 10, 10],
        ],
        axisIndex: 0,
        cutMm: 2,
      },
    })
    sync.sync()
    expect(cutPlane.visible).toBe(true)
    splitSheet.isOpen = false
    sync.sync()
    expect(cutPlane.visible).toBe(false)
  })

  it('exposes the two passes separately for callers that need just one', () => {
    const { sync } = setup()
    expect(typeof sync.syncAnnotations).toBe('function')
    expect(typeof sync.syncCutPlane).toBe('function')
  })
})
