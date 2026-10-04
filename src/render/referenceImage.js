// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The sketch editor's reference photo, drawn **inside the WebGL scene** (`TODO/sketch-003`).
 *
 * Not a DOM `<img>` over the canvas: an element over the canvas intercepts pointer events,
 * and ui-020 finding #1's dead strip was exactly that failure. Here the photo is a textured
 * plane in the active slice's frame:
 *
 * - **under** the grid lines, the strokes and the extrusion preview — `renderOrder` below
 *   everything and `depthWrite: false`, so nothing coplanar with it z-fights and nothing
 *   behind it is hidden;
 * - **never a pick target** — its `raycast` is a no-op, so no picking path can ever land
 *   on it, whatever it is asked;
 * - at the chosen opacity, in the slice's local 2D frame, so moving or turning the body
 *   carries the photo with it, like the outlines.
 *
 * The bytes reach the GPU by one path only: an `ImageBitmap` the image worker decoded from
 * an allowlisted-MIME `Blob`, uploaded as a texture.
 *
 * @module render/referenceImage
 */

import { DoubleSide, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Texture } from 'three'

/** Drawn before the grid (0) and the extrusion preview (1). */
const RENDER_ORDER = -1

// Scratch, allocated once (CLAUDE.md: no per-frame allocation).
const scratchFrame = new Matrix4()
const scratchLocal = new Matrix4()
const scratchTurn = new Matrix4()
const scratchScale = new Matrix4()

/**
 * The plane's matrix: sketch frame × slice height × offset × rotation × size. The plane is
 * 1 × 1 and centred, so its scale is the photo's size in millimetres.
 *
 * @param {readonly number[]} frame Sketch-local mm → world mm, column-major.
 * @param {number} zMm The slice's offset along the sketch's own Z.
 * @param {Pick<import('../sketch/calibration.js').ImagePlacement, 'offsetMm' | 'rotationDeg' | 'mmPerPx'>} placement
 * @param {import('../sketch/calibration.js').ImageSize} size
 * @returns {number[]} Column-major, for `Matrix4.fromArray`.
 */
export function referenceImageMatrix(frame, zMm, placement, size) {
  scratchFrame.fromArray(/** @type {number[]} */ ([...frame]))
  scratchLocal.makeTranslation(placement.offsetMm[0], placement.offsetMm[1], zMm)
  scratchTurn.makeRotationZ((placement.rotationDeg * Math.PI) / 180)
  scratchScale.makeScale(size.widthPx * placement.mmPerPx, size.heightPx * placement.mmPerPx, 1)
  return scratchFrame.multiply(scratchLocal).multiply(scratchTurn).multiply(scratchScale).toArray()
}

/**
 * @param {import('three').Scene} scene
 * @returns {{
 *   show: (bitmap: ImageBitmap, matrix: readonly number[], opacity: number) => void,
 *   hide: (releaseTexture?: boolean) => void,
 *   shown: () => boolean,
 *   dispose: () => void,
 * }}
 */
export function createReferenceImageLayer(scene) {
  const geometry = new PlaneGeometry(1, 1)
  // An ImageBitmap is uploaded without a flip (WebGL ignores UNPACK_FLIP_Y for one), so the
  // image's top row would land at v = 0, the plane's bottom. Flip the plane's v instead.
  const uv = geometry.getAttribute('uv')
  for (let index = 0; index < uv.count; index += 1) uv.setY(index, 1 - uv.getY(index))
  uv.needsUpdate = true

  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'reference-image'
  mesh.renderOrder = RENDER_ORDER
  mesh.matrixAutoUpdate = false
  // Never a pick target, by any raycast — a photo is not geometry.
  mesh.raycast = () => {}

  /** @type {Texture | null} */
  let texture = null
  /** @type {ImageBitmap | null} */
  let textureSource = null

  /** @param {boolean} [releaseTexture] Also free the GPU texture — the editor closed. */
  function hide(releaseTexture = false) {
    if (mesh.parent) mesh.parent.remove(mesh)
    if (releaseTexture && texture) {
      texture.dispose()
      texture = null
      textureSource = null
      material.map = null
      material.needsUpdate = true
    }
  }

  return {
    show(bitmap, matrix, opacity) {
      if (textureSource !== bitmap) {
        texture?.dispose()
        texture = new Texture(/** @type {any} */ (bitmap))
        texture.flipY = false
        texture.colorSpace = SRGBColorSpace
        texture.needsUpdate = true
        textureSource = bitmap
        material.map = texture
        material.needsUpdate = true
      }
      material.opacity = Math.min(1, Math.max(0, opacity))
      mesh.matrix.fromArray(/** @type {number[]} */ ([...matrix]))
      mesh.matrixWorldNeedsUpdate = true
      if (!mesh.parent) scene.add(mesh)
    },
    hide,
    shown: () => mesh.parent !== null,
    dispose() {
      hide(true)
      material.dispose()
      geometry.dispose()
    },
  }
}
