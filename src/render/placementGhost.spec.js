// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'
import modeling from '@jscad/modeling'

import { ghostBoxAtOrigin, variantKey } from '../core/library.js'
import { createPlacementGhost } from './placementGhost.js'

const { primitives } = modeling

/**
 * `createPlacementGhost` is framework-free: the scene, the working-plane projection, the document
 * and the overlay are all handed in. The kernel is real (`primitive.cuboid` evaluates in Node), so
 * the snap geometry is the one the app computes. Only the scene is a stub; three.js builds its
 * meshes without a GL context.
 */

const OP = 'primitive.cuboid'

/**
 * A 10 mm cube centred on `x`, the shape of a body already in the document.
 *
 * @param {number} x
 */
function cubeAt(x) {
  return primitives.cuboid({ size: [10, 10, 10], center: [x, 0, 0] })
}

/**
 * Build a controller over a stub scene and a document of `bodies`.
 *
 * @param {object} [options]
 * @param {Array<{ id: string, geometry: any }>} [options.bodies]
 * @param {number} [options.mmPerPixel]
 * @param {number | null} [options.project] A fixed x; `null` means the pointer misses the plane.
 */
function setup({ bodies = [], mmPerPixel = 0.5, project = 0 } = {}) {
  const scene = { add: vi.fn() }
  // Both flags start `false`, as the controller's and the component's refs do: a callback fires
  // only on a flip, so the stub has to begin where the app does.
  const state = { version: 0, visible: false, snapped: false, guides: null }
  const deps = {
    scene: () => scene,
    project: vi.fn((/** @type {number} */ clientX, /** @type {number} */ clientY) =>
      project === null ? null : { x: project + clientX, y: clientY, z: 0 },
    ),
    mmPerPixel: () => mmPerPixel,
    resolution: () => 'normal',
    documentVersion: () => state.version,
    bodies: vi.fn(() => bodies),
    drawSnapGuides: vi.fn((guides) => {
      state.guides = guides
    }),
    onSnapChange: vi.fn((value) => {
      state.snapped = value
    }),
    onVisibleChange: vi.fn((value) => {
      state.visible = value
    }),
    color: 0x445566,
  }
  const ghost = createPlacementGhost(deps)
  return { ghost, deps, scene, state }
}

describe('createPlacementGhost: drop point', () => {
  it('commits at the pointer when there is nothing to align to', () => {
    const { ghost, deps } = setup({ bodies: [], project: 0 })
    const point = ghost.dropPoint(OP, variantKey(OP), {}, 12, 34)
    expect(point?.x).toBeCloseTo(12, 9)
    expect(point?.y).toBeCloseTo(34, 9)
    expect(deps.onSnapChange).not.toHaveBeenCalled()
  })

  it('returns null and clears the snap when the pointer misses the working plane', () => {
    const { ghost, deps } = setup({ project: null })
    expect(ghost.dropPoint(OP, variantKey(OP), {}, 5, 5)).toBeNull()
    expect(deps.drawSnapGuides).toHaveBeenCalled()
    expect(deps.onSnapChange).not.toHaveBeenCalled()
  })

  it('pulls the drop into an alignment with a neighbour edge within tolerance', () => {
    const body = { id: 'b1', geometry: cubeAt(0) }
    const { ghost, deps, state } = setup({ bodies: [body], mmPerPixel: 0.5, project: 0 })
    const origin = ghostBoxAtOrigin(OP, {})
    // Put the ghost's low edge 0.1 mm past the neighbour's high edge (x = 5). A drop there
    // should be pulled flush, so the drop point is where that edge lands exactly on 5.
    const pointerX = 5 - origin.minMm[0] + 0.1
    const point = ghost.dropPoint(OP, variantKey(OP), {}, pointerX, 0)
    expect(point?.x).toBeCloseTo(5 - origin.minMm[0], 3)
    expect(state.snapped).toBe(true)
    expect(deps.onSnapChange).toHaveBeenCalledWith(true)
  })

  it('stays where the pointer is when the nearest neighbour is far outside tolerance', () => {
    const body = { id: 'b1', geometry: cubeAt(0) }
    const { ghost, state } = setup({ bodies: [body], mmPerPixel: 0.5, project: 0 })
    const point = ghost.dropPoint(OP, variantKey(OP), {}, 500, 0)
    expect(point?.x).toBeCloseTo(500, 9)
    expect(state.snapped).toBe(false)
  })

  it('never snaps when a pixel has no millimetre scale (degenerate tolerance)', () => {
    const body = { id: 'b1', geometry: cubeAt(0) }
    const { ghost, state } = setup({ bodies: [body], mmPerPixel: 0, project: 0 })
    const origin = ghostBoxAtOrigin(OP, {})
    const point = ghost.dropPoint(OP, variantKey(OP), {}, 5 - origin.minMm[0] + 0.1, 0)
    expect(state.snapped).toBe(false)
    expect(point?.x).toBeCloseTo(5 - origin.minMm[0] + 0.1, 9)
  })

  it('reads the document once per version, not once per pointer event', () => {
    const body = { id: 'b1', geometry: cubeAt(0) }
    const { ghost, deps, state } = setup({ bodies: [body] })
    const key = variantKey(OP)
    ghost.dropPoint(OP, key, {}, 100, 0)
    ghost.dropPoint(OP, key, {}, 101, 0)
    ghost.dropPoint(OP, key, {}, 102, 0)
    expect(deps.bodies).toHaveBeenCalledTimes(1)

    state.version += 1
    ghost.dropPoint(OP, key, {}, 103, 0)
    expect(deps.bodies).toHaveBeenCalledTimes(2)
  })
})

describe('createPlacementGhost: preview', () => {
  it('joins the scene once, moves to the drop point and shows itself', () => {
    const { ghost, scene, state } = setup({ bodies: [], project: 0 })
    const key = variantKey(OP)
    ghost.preview(OP, key, {}, 20, 7)
    ghost.preview(OP, key, {}, 21, 8)
    expect(scene.add).toHaveBeenCalledTimes(1)
    const mesh = scene.add.mock.calls[0][0]
    expect(mesh.name).toBe('placement-ghost')
    expect(mesh.renderOrder).toBe(1)
    expect(mesh.position.x).toBeCloseTo(21, 9)
    expect(mesh.position.y).toBeCloseTo(8, 9)
    expect(mesh.visible).toBe(true)
    expect(state.visible).toBe(true)
  })

  it('hides the ghost when the pointer leaves the working plane', () => {
    const { ghost, state } = setup({ project: null })
    ghost.preview(OP, variantKey(OP), {}, 5, 5)
    expect(state.visible).toBe(false)
  })

  it('clear hides the ghost and drops the snap', () => {
    const body = { id: 'b1', geometry: cubeAt(0) }
    const { ghost, state } = setup({ bodies: [body], project: 0 })
    const origin = ghostBoxAtOrigin(OP, {})
    ghost.preview(OP, variantKey(OP), {}, 5 - origin.minMm[0] + 0.1, 0)
    expect(state.snapped).toBe(true)
    ghost.clear()
    expect(state.visible).toBe(false)
    expect(state.snapped).toBe(false)
  })

  it('reports a visibility flip only when it changes', () => {
    const { ghost, deps } = setup({ project: 0 })
    const key = variantKey(OP)
    ghost.preview(OP, key, {}, 1, 1)
    ghost.preview(OP, key, {}, 2, 2)
    ghost.preview(OP, key, {}, 3, 3)
    expect(deps.onVisibleChange).toHaveBeenCalledTimes(1)
  })

  it('recolours the material for a new colour scheme', () => {
    const { ghost, scene } = setup({ project: 0 })
    ghost.preview(OP, variantKey(OP), {}, 1, 1)
    const mesh = scene.add.mock.calls[0][0]
    ghost.setColor(0xabcdef)
    expect(mesh.material.color.getHex()).toBe(0xabcdef)
  })

  it('disposes cleanly and can be torn down before any preview', () => {
    const { ghost } = setup({ project: 0 })
    expect(() => ghost.dispose()).not.toThrow()
  })
})
