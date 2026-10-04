// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { Matrix4, Raycaster, Scene, Vector3 } from 'three'

import { createReferenceImageLayer, referenceImageMatrix } from './referenceImage.js'
import { imagePxToSketchMm } from '../sketch/calibration.js'

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const SIZE = { widthPx: 1400, heightPx: 1000 }
const PLACEMENT = { assetId: 'img-0123456789abcdef', offsetMm: /** @type {[number, number]} */ ([12, -7]), rotationDeg: 30, opacity: 0.4, mmPerPx: 0.2 }

/** A stand-in bitmap: three only reads width/height until upload (CLAUDE.md: no real GPU). */
const bitmap = /** @type {any} */ ({ width: 1400, height: 1000, close() {} })

describe('referenceImageMatrix', () => {
  it('puts each image corner exactly where calibration.js says that pixel sits on the slice', () => {
    const matrix = new Matrix4().fromArray(referenceImageMatrix(IDENTITY, 5, PLACEMENT, SIZE))
    // The plane is 1 × 1, centred; uv (0, 0) is the image's top-left after the layer's flip.
    for (const [u, v, px] of /** @type {[number, number, [number, number]][]} */ ([
      [-0.5, 0.5, [0, 0]],
      [0.5, 0.5, [1400, 0]],
      [-0.5, -0.5, [0, 1000]],
      [0.5, -0.5, [1400, 1000]],
    ])) {
      const world = new Vector3(u, v, 0).applyMatrix4(matrix)
      const expected = imagePxToSketchMm(PLACEMENT, SIZE, px)
      expect(world.x).toBeCloseTo(expected[0], 9)
      expect(world.y).toBeCloseTo(expected[1], 9)
      expect(world.z).toBeCloseTo(5, 9)
    }
  })

  it('follows the sketch frame: a body moved by +100 X carries its photo with it', () => {
    const moved = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 0, 0, 1]
    const matrix = new Matrix4().fromArray(referenceImageMatrix(moved, 0, PLACEMENT, SIZE))
    const centre = new Vector3(0, 0, 0).applyMatrix4(matrix)
    expect(centre.x).toBeCloseTo(112, 9)
    expect(centre.y).toBeCloseTo(-7, 9)
  })
})

describe('createReferenceImageLayer', () => {
  it('adds one non-pickable, depth-transparent plane under everything, and removes it again', () => {
    const scene = new Scene()
    const layer = createReferenceImageLayer(scene)
    expect(layer.shown()).toBe(false)
    layer.show(bitmap, referenceImageMatrix(IDENTITY, 0, PLACEMENT, SIZE), 0.4)
    expect(layer.shown()).toBe(true)
    const mesh = /** @type {any} */ (scene.getObjectByName('reference-image'))
    expect(mesh).toBeDefined()
    expect(mesh.renderOrder).toBeLessThan(0)
    expect(mesh.material.depthWrite).toBe(false)
    expect(mesh.material.transparent).toBe(true)
    expect(mesh.material.opacity).toBe(0.4)

    // Never a pick target: a ray straight through its centre finds nothing.
    const raycaster = new Raycaster(new Vector3(12, -7, 100), new Vector3(0, 0, -1))
    scene.updateMatrixWorld(true)
    expect(raycaster.intersectObjects(scene.children, true)).toEqual([])

    layer.hide()
    expect(layer.shown()).toBe(false)
    expect(scene.getObjectByName('reference-image')).toBeUndefined()
    layer.dispose()
  })

  it('re-showing the same bitmap reuses its texture; a new bitmap replaces it', () => {
    const scene = new Scene()
    const layer = createReferenceImageLayer(scene)
    layer.show(bitmap, IDENTITY, 0.5)
    const mesh = /** @type {any} */ (scene.getObjectByName('reference-image'))
    const first = mesh.material.map
    layer.show(bitmap, IDENTITY, 0.7)
    expect(mesh.material.map).toBe(first)
    expect(mesh.material.opacity).toBe(0.7)
    layer.show(/** @type {any} */ ({ width: 10, height: 10, close() {} }), IDENTITY, 0.7)
    expect(mesh.material.map).not.toBe(first)
    layer.dispose()
  })
})

describe('the editor closing frees the texture', () => {
  it('hide(true) takes the plane off and disposes its texture', () => {
    const scene = new Scene()
    const layer = createReferenceImageLayer(scene)
    layer.show(bitmap, IDENTITY, 0.5)
    const mesh = /** @type {any} */ (scene.getObjectByName('reference-image'))
    let disposed = 0
    mesh.material.map.addEventListener('dispose', () => (disposed += 1))
    layer.hide(true)
    expect(disposed).toBe(1)
    expect(mesh.material.map).toBeNull()
    layer.dispose()
  })
})
