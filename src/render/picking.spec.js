// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import modeling from '@jscad/modeling'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three'

import { createMarqueeRect } from './annotate.js'
import { createOrbitCamera } from './camera.js'
import { createPicking } from './picking.js'

const { primitives } = modeling

/**
 * `createPicking` is framework-free: the real orbit camera, projections, raycaster and marquee
 * maths run; the selection store and the viewport are plain objects. No WebGL.
 */

const WIDTH_PX = 800
const HEIGHT_PX = 600
const CENTRE_X = WIDTH_PX / 2
const CENTRE_Y = HEIGHT_PX / 2

/** @param {ReturnType<typeof createOrbitCamera>} orbit */
function cameraFor(orbit) {
  const camera = new PerspectiveCamera(orbit.fovDeg, WIDTH_PX / HEIGHT_PX, 0.1, 100000)
  const scratch = { x: 0, y: 0, z: 0 }
  orbit.getPosition(scratch)
  camera.position.set(scratch.x, scratch.y, scratch.z)
  orbit.getUp(scratch)
  camera.up.set(scratch.x, scratch.y, scratch.z)
  const target = orbit.state.target
  camera.lookAt(target.x, target.y, target.z)
  camera.updateMatrixWorld()
  return camera
}

/**
 * @param {object} [options]
 * @param {boolean} [options.withViewport] A camera looking down at a 20 mm box, id `b1`, at the origin.
 * @param {boolean} [options.sketching]
 * @param {boolean} [options.previewing]
 * @param {any[]} [options.bodies]
 */
function setup({ withViewport = true, sketching = false, previewing = false, bodies = [] } = {}) {
  const orbit = createOrbitCamera()
  const bodiesGroup = new Group()
  /** @type {Map<string, any>} */
  const bodyMeshes = new Map()
  /** @type {any} */
  let viewport = null
  if (withViewport) {
    orbit.snapTo('top')
    const box = new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial())
    box.name = 'b1'
    bodiesGroup.add(box)
    bodiesGroup.updateMatrixWorld(true)
    bodyMeshes.set('b1', box)
    viewport = { graph: { camera: cameraFor(orbit) } }
  }
  const state = { sketching, previewing }
  const selection = {
    ids: /** @type {string[]} */ ([]),
    clear: vi.fn(),
    toggle: vi.fn(),
    select: vi.fn(),
    drillInto: vi.fn(),
    selectMany: vi.fn(),
  }
  const marqueeRect = createMarqueeRect()
  const picking = createPicking({
    orbit,
    viewport: () => viewport,
    bodiesGroup,
    bodyMeshes,
    viewportRect: { left: 0, top: 0, width: WIDTH_PX, height: HEIGHT_PX },
    widthPx: () => WIDTH_PX,
    heightPx: () => HEIGHT_PX,
    isSketching: () => state.sketching,
    isPreviewing: () => state.previewing,
    selection,
    documentBodies: () => bodies,
    marqueeRect,
  })
  return { picking, selection, state, marqueeRect, bodiesGroup, bodyMeshes }
}

describe('createPicking: hitsBodyAt', () => {
  it('is true over the body and false over empty space', () => {
    const { picking } = setup()
    expect(picking.hitsBodyAt(CENTRE_X, CENTRE_Y)).toBe(true)
    expect(picking.hitsBodyAt(5, 5)).toBe(false)
  })

  it('is false with no viewport yet', () => {
    const { picking } = setup({ withViewport: false })
    expect(picking.hitsBodyAt(CENTRE_X, CENTRE_Y)).toBe(false)
  })

  it('goes through a hidden mesh', () => {
    const { picking, bodyMeshes } = setup()
    bodyMeshes.get('b1').visible = false
    expect(picking.hitsBodyAt(CENTRE_X, CENTRE_Y)).toBe(false)
  })
})

describe('createPicking: pickAt', () => {
  it('selects the body under the point and clears on empty space', () => {
    const { picking, selection } = setup()
    picking.pickAt(CENTRE_X, CENTRE_Y)
    expect(selection.select).toHaveBeenCalledWith('b1')
    picking.pickAt(5, 5)
    expect(selection.clear).toHaveBeenCalledTimes(1)
  })

  it('toggles when additive, and clears outright on empty space even then', () => {
    const { picking, selection } = setup()
    picking.pickAt(CENTRE_X, CENTRE_Y, true)
    expect(selection.toggle).toHaveBeenCalledWith('b1')
    picking.pickAt(5, 5, true)
    expect(selection.clear).toHaveBeenCalledTimes(1)
  })

  it('does nothing while previewing or sketching', () => {
    const { picking, selection, state } = setup()
    state.previewing = true
    picking.pickAt(CENTRE_X, CENTRE_Y)
    state.previewing = false
    state.sketching = true
    picking.pickAt(CENTRE_X, CENTRE_Y)
    expect(selection.select).not.toHaveBeenCalled()
    expect(selection.clear).not.toHaveBeenCalled()
  })

  it('clears when there is no viewport or no body', () => {
    const { picking, selection } = setup({ withViewport: false })
    picking.pickAt(CENTRE_X, CENTRE_Y)
    expect(selection.clear).toHaveBeenCalledTimes(1)
  })

  it('drills into a group part only when the group is already the single selection', () => {
    const { picking, selection, bodyMeshes } = setup()
    bodyMeshes.get('b1').userData.partName = 'lid'
    picking.pickAt(CENTRE_X, CENTRE_Y)
    expect(selection.select).toHaveBeenCalledWith('b1')
    expect(selection.drillInto).not.toHaveBeenCalled()
    selection.ids = ['b1']
    picking.pickAt(CENTRE_X, CENTRE_Y)
    expect(selection.drillInto).toHaveBeenCalledWith('lid')
  })
})

describe('createPicking: finishMarquee', () => {
  const body = { id: 'b1', geometry: primitives.cuboid({ size: [20, 20, 20] }) }

  it('selects the bodies the rectangle overlaps, replacing or adding as asked', () => {
    const { picking, selection, marqueeRect } = setup({ bodies: [body] })
    picking.finishMarquee(true, CENTRE_X - 100, CENTRE_Y - 100, CENTRE_X + 100, CENTRE_Y + 100)
    expect(selection.selectMany).toHaveBeenCalledWith(['b1'], true)
    expect(marqueeRect.width).toBeCloseTo(200, 9)
    expect(marqueeRect.height).toBeCloseTo(200, 9)
    picking.finishMarquee(false, CENTRE_X - 100, CENTRE_Y - 100, CENTRE_X + 100, CENTRE_Y + 100)
    expect(selection.selectMany).toHaveBeenLastCalledWith(['b1'], false)
  })

  it('selects nothing for a rectangle that misses, and with no viewport', () => {
    const miss = setup({ bodies: [body] })
    miss.picking.finishMarquee(false, 0, 0, 10, 10)
    expect(miss.selection.selectMany).toHaveBeenCalledWith([], false)
    const none = setup({ withViewport: false, bodies: [body] })
    none.picking.finishMarquee(false, 0, 0, 800, 600)
    expect(none.selection.selectMany).toHaveBeenCalledWith([], false)
  })
})
