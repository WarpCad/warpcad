// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createOrbitCamera } from './camera.js'
import { createSketchSnap } from './sketchSnap.js'

/**
 * `createSketchSnap` is framework-free: the real orbit camera projects the marker, and the sketch
 * editor is a plain object with the fields the store exposes. The outlines are real `polyline`
 * profiles in sketch millimetres, the shape `src/sketch/profile.js` builds.
 */

/** An identity frame: sketch X/Y on world X/Y, sketch Z on world Z. */
const FRAME = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/** A closed 10 mm square with its corner at the origin. */
/**
 * @param {string} id
 */
function square(id) {
  return { id, kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 0], [10, 10], [0, 10]] }
}

/** An open three-point polyline, the shape a live Line chain builds. */
/**
 * @param {string} id
 */
function chain(id) {
  return { id, kind: 'polyline', role: 'solid', closed: false, pointsMm: [[30, 0], [40, 0], [40, 10]] }
}

/**
 * @param {object} [options]
 * @param {any[]} [options.profiles]
 * @param {boolean} [options.snapEnabled]
 * @param {string} [options.tool]
 * @param {string} [options.selectedProfileId]
 * @param {string} [options.chainId]
 * @param {boolean} [options.editing]
 */
function setup({ profiles = [square('a')], snapEnabled = true, tool = 'rect', selectedProfileId = '', chainId = '', editing = false } = {}) {
  const orbit = createOrbitCamera()
  const editor = {
    slice: { profiles },
    snapEnabled,
    tool,
    selectedProfileId,
    chainId,
    frame: FRAME,
  }
  const marker = { visible: false, xPx: 0, yPx: 0, markerXPx: 0, markerYPx: 0, lifted: false, kind: '', label: '' }
  const snap = createSketchSnap({
    orbit,
    editor,
    sliceZ: () => 0,
    widthPx: () => 800,
    heightPx: () => 600,
    isEditing: vi.fn(() => editing),
    marker,
  })
  return { snap, marker, orbit, editor }
}

describe('createSketchSnap: snapping a point', () => {
  it('pulls a point within reach of a corner onto that corner', () => {
    const { snap, marker } = setup()
    const point = [10.1, 10.05]
    // 0.1 mm per pixel: the 12 px reach is 1.2 mm, so 0.1 mm off a corner is well inside it.
    const moved = snap.snap(point, false, false)
    expect(moved).toBe(true)
    expect(point[0]).toBeCloseTo(10, 6)
    expect(point[1]).toBeCloseTo(10, 6)
    expect(marker.kind).not.toBe('')
    expect(marker.label).not.toBe('')
  })

  it('leaves a point alone when nothing is in reach', () => {
    const { snap, marker } = setup()
    const point = [500, 500]
    expect(snap.snap(point, false, false)).toBe(false)
    expect(point).toEqual([500, 500])
    expect(marker.kind).toBe('')
  })

  it('does nothing while snapping is switched off on the toolbar', () => {
    const { snap, marker } = setup({ snapEnabled: false })
    const point = [10.1, 10.05]
    expect(snap.snap(point, false, false)).toBe(false)
    expect(point).toEqual([10.1, 10.05])
    expect(marker.kind).toBe('')
  })

  it('does nothing while Shift is held', () => {
    const { snap } = setup()
    const point = [10.1, 10.05]
    expect(snap.snap(point, true, false)).toBe(false)
    expect(point).toEqual([10.1, 10.05])
  })

  it('never snaps onto the outline being dragged (its own targets are excluded)', () => {
    const { snap } = setup({ selectedProfileId: 'a', editing: true })
    const point = [10.1, 10.05]
    expect(snap.snap(point, false, false)).toBe(false)
  })

  it('keeps a live Line chain\'s first vertex as a target, so the chain can close on it', () => {
    const { snap } = setup({ profiles: [chain('c')], tool: 'line', chainId: 'c' })
    const point = [30.1, 0.05]
    expect(snap.snap(point, false, false)).toBe(true)
    expect(point[0]).toBeCloseTo(30, 6)
    expect(point[1]).toBeCloseTo(0, 6)
  })

  it('falls back to one millimetre per pixel when the camera reports no scale', () => {
    // The `|| 1` in the reach calculation, kept from the component: a camera with no scale yet
    // still has a reach, 12 mm, rather than none.
    const { snap, orbit } = setup()
    vi.spyOn(orbit, 'getMmPerPixel').mockReturnValue(0)
    const point = [10.1, 10.05]
    expect(snap.snap(point, false, false)).toBe(true)
    expect(point[0]).toBeCloseTo(10, 6)
  })

  it('lifts the marker above a finger on touch', () => {
    const { snap, marker } = setup()
    snap.snap([10.1, 10.05], false, true)
    expect(marker.lifted).toBe(true)
    expect(marker.markerYPx).toBeCloseTo(marker.yPx - 56, 6)
  })
})

describe('createSketchSnap: the marker', () => {
  it('hide clears the kind and the visibility', () => {
    const { snap, marker } = setup()
    snap.snap([10.1, 10.05], false, false)
    expect(marker.kind).not.toBe('')
    snap.hide()
    expect(marker.kind).toBe('')
    expect(marker.visible).toBe(false)
  })

  it('draw with no snap in hand leaves the marker hidden', () => {
    const { snap, marker } = setup()
    snap.draw()
    expect(marker.visible).toBe(false)
  })
})
