// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The viewport, rendered offscreen for the assistant (`TODO/ai-007`): `capture_view`'s
 * three.js half. `src/ai/tools/capture.js` decides *what* to draw; this draws it.
 *
 * ## The real scene, without touching the user's view
 *
 * It renders the viewport's **own** `Scene` — its lights, grid, background and theme — so the
 * picture is what the user would see, not a look-alike that could drift from it (and so a
 * "scene too dark to see" bug, `SECOND-ATTEMPT.md`, shows up here exactly as on screen). What
 * it does not use is anything the user owns:
 *
 * - **Its own camera.** A fresh `PerspectiveCamera` framed on the requested bodies from the
 *   named view. The viewport's camera and orbit state are never read for writing, so the user's
 *   camera cannot move.
 * - **Its own meshes.** The turn's bodies come from the AI's fork of the document, which the
 *   viewport is not showing, so they are built here through the same mesh bridge the viewport
 *   uses (`createBodyObject`), drawn, and disposed. Everything the viewport already had in the
 *   scene (its bodies, ghosts, sketch overlays, the reference photo) is hidden for the one render
 *   and restored straight after. Typed arrays stay in plain locals — never reactive.
 * - **Its own target.** It draws into an offscreen `WebGLRenderTarget`, never the canvas, and the
 *   whole hide–render–read–restore runs inside one synchronous call, so no frame can composite in
 *   between: no flash. The selection is never read for writing either.
 *
 * ## Colour: encoded by the GPU, like the screen
 *
 * three.js applies the sRGB output transfer only when drawing to the screen; a plain render
 * target gets linear values, and a picture read back from one looks much darker than the
 * viewport. The target here is `SRGBColorSpace` + `UnsignedByteType`, which three.js allocates as
 * `SRGB8_ALPHA8`: the hardware encodes on write, the same transfer the screen path applies, at
 * full 8-bit precision. `e2e/ai-capture.e2e.js` compares the captured background with the
 * on-screen one to hold that.
 *
 * Anti-aliasing is supersampling: the target is twice the size and a 2D canvas scales it down.
 * A multisampled target would be cheaper, but reading back from one varies across engines.
 *
 * @module render/offscreenCapture
 */

import {
  BackSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  SRGBColorSpace,
  UnsignedByteType,
  Vector3,
  WebGLRenderTarget,
} from 'three'

import { STANDARD_VIEWS, positionFromSpherical, upFromSpherical } from './camera.js'
import { BODY_COLORS, createBodyMaterial, createBodyObject, disposeBodyObject } from './mesh.js'
import { VIEWPORT_THEMES } from './scene.js'

/** @typedef {import('../ai/tools/capture.js').CaptureRequest} CaptureRequest */
/** @typedef {import('../ai/tools/capture.js').CaptureResult} CaptureResult */
/** @typedef {import('../ai/tools/capture.js').ToolCapture} ToolCapture */
/** @typedef {[number, number, number]} Vec3 */

/**
 * `capture_view`'s views, as the viewport's own standard views — `iso` is the Home view the
 * orientation gizmo snaps to.
 */
export const CAPTURE_VIEWS = Object.freeze({
  iso: STANDARD_VIEWS.home,
  top: STANDARD_VIEWS.top,
  front: STANDARD_VIEWS.front,
  right: STANDARD_VIEWS.right,
  back: STANDARD_VIEWS.back,
  bottom: STANDARD_VIEWS.bottom,
  left: STANDARD_VIEWS.left,
})

/** What an empty scene frames: a patch of grid around the origin. */
const EMPTY_BOUNDS = /** @type {[Vec3, Vec3]} */ ([
  [-50, -50, 0],
  [50, 50, 20],
])

/** How much room is left around the framed bodies. */
const MARGIN = 1.15

/** Supersampling factor. */
const SUPERSAMPLE = 2

/** The colour a section's cut faces show: the inside of the wall. */
const SECTION_COLOR = 0xd9534f

/**
 * The camera for a named view, backed off until the box's bounding sphere fits the narrower of
 * the two fields of view.
 *
 * @param {string} view A key of {@link CAPTURE_VIEWS}; unknown falls back to `iso`.
 * @param {[readonly number[], readonly number[]]} boundsMm
 * @param {number} fovDeg Vertical field of view.
 * @param {number} aspect Width over height.
 * @returns {{ azimuthDeg: number, elevationDeg: number, distanceMm: number, target: { x: number, y: number, z: number } }}
 */
export function frameView(view, boundsMm, fovDeg, aspect) {
  const preset = CAPTURE_VIEWS[/** @type {keyof typeof CAPTURE_VIEWS} */ (view)] ?? CAPTURE_VIEWS.iso
  const [min, max] = boundsMm
  const target = { x: (min[0] + max[0]) / 2, y: (min[1] + max[1]) / 2, z: (min[2] + max[2]) / 2 }
  const radius = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2)
  const vertical = (fovDeg * Math.PI) / 180
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect)
  const half = Math.min(vertical, horizontal) / 2
  return { azimuthDeg: preset.azimuthDeg, elevationDeg: preset.elevationDeg, distanceMm: (radius * MARGIN) / Math.sin(half), target }
}

/**
 * WebGL reads rows bottom-up; an image is top-down.
 *
 * @param {Uint8Array} pixels RGBA, `width × height`.
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray<ArrayBuffer>}
 */
export function flipRows(pixels, width, height) {
  const out = new Uint8ClampedArray(new ArrayBuffer(pixels.length))
  const stride = width * 4
  for (let row = 0; row < height; row += 1) {
    out.set(pixels.subarray(row * stride, (row + 1) * stride), (height - 1 - row) * stride)
  }
  return out
}

/**
 * How much of an image is not background, and how varied it is — the non-blank check.
 *
 * @param {Uint8ClampedArray | Uint8Array} rgba
 * @param {readonly number[]} background `[r, g, b]`, 0–255.
 * @returns {{ contentFraction: number, lumaStdDev: number }}
 */
export function pixelStats(rgba, background) {
  const count = rgba.length / 4
  if (count === 0) return { contentFraction: 0, lumaStdDev: 0 }
  let content = 0
  let sum = 0
  let sumSquares = 0
  for (let index = 0; index < rgba.length; index += 4) {
    const r = rgba[index]
    const g = rgba[index + 1]
    const b = rgba[index + 2]
    if (Math.abs(r - background[0]) > 6 || Math.abs(g - background[1]) > 6 || Math.abs(b - background[2]) > 6) content += 1
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sum += luma
    sumSquares += luma * luma
  }
  const mean = sum / count
  // Rounded to a thousandth of a level, so a uniform image reads exactly 0 rather than float noise.
  const deviation = Math.sqrt(Math.max(0, sumSquares / count - mean * mean))
  return { contentFraction: content / count, lumaStdDev: Math.round(deviation * 1000) / 1000 }
}

/**
 * @param {number} hex
 * @returns {[number, number, number]}
 */
function rgbOf(hex) {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
}

/**
 * A copy of a body object's meshes sharing their geometry, with another material — the back
 * faces of a section.
 *
 * @param {import('three').Object3D} object
 * @param {import('three').Material} material
 * @returns {Group}
 */
function twinWith(object, material) {
  const twin = new Group()
  object.traverse((child) => {
    if (child instanceof Mesh) {
      const mesh = new Mesh(child.geometry, material)
      mesh.matrixAutoUpdate = false
      mesh.matrix.copy(child.matrixWorld)
      twin.add(mesh)
    }
  })
  return twin
}

/**
 * @typedef {object} OffscreenCaptureOptions
 * @property {import('three').WebGLRenderer} renderer The viewport's renderer.
 * @property {import('./scene.js').SceneGraph} graph The viewport's scene graph.
 * @property {(width: number, height: number) => HTMLCanvasElement} [makeCanvas]
 */

/**
 * Build the capture the viewport hands the assistant (`ToolContext.capture`).
 *
 * @param {OffscreenCaptureOptions} options
 * @returns {ToolCapture}
 */
export function createOffscreenCapture({ renderer, graph, makeCanvas }) {
  const canvasOf =
    makeCanvas ??
    ((width, height) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      return canvas
    })

  return {
    capture(request) {
      const theme = graph.theme
      const palette = BODY_COLORS[theme] ?? BODY_COLORS.dark
      const { widthPx, heightPx } = request
      const scale = Math.max(1, Math.min(SUPERSAMPLE, Math.floor(renderer.capabilities.maxTextureSize / Math.max(widthPx, heightPx))))
      const renderWidth = widthPx * scale
      const renderHeight = heightPx * scale

      /** @type {import('three').Material[]} */
      const materials = []
      /** @param {number} color */
      const material = (color) => {
        const made = createBodyMaterial(color)
        materials.push(made)
        return made
      }
      const plane = request.section
        ? new Plane(
            new Vector3(request.section.axis === 'x' ? -1 : 0, request.section.axis === 'y' ? -1 : 0, request.section.axis === 'z' ? -1 : 0),
            request.section.offsetMm
          )
        : null
      const highlighted = new Set(request.highlightIds)
      const group = new Group()
      group.name = 'ai-capture'
      /** @type {import('three').Object3D[]} */
      const built = []
      for (const body of request.bodies) {
        const color = highlighted.has(body.id) ? palette.selected : body.color ? Number.parseInt(body.color.slice(1), 16) : palette.body
        const front = material(color)
        if (plane) {
          front.clippingPlanes = [plane]
          front.side = FrontSide
        }
        const object = createBodyObject(body.geometry, /** @type {any} */ (front), body.id)
        built.push(object)
        group.add(object)
        if (plane) {
          // The inside of a cut wall: its back faces, in one flat colour, so the section reads.
          const back = new MeshStandardMaterial({ color: SECTION_COLOR, side: BackSide, clippingPlanes: [plane], roughness: 1, metalness: 0 })
          materials.push(back)
          object.updateMatrixWorld(true)
          group.add(twinWith(object, back))
        }
      }

      const aspect = widthPx / heightPx
      const framed = frameView(request.view, request.boundsMm ?? EMPTY_BOUNDS, graph.camera.fov, aspect)
      const camera = new PerspectiveCamera(graph.camera.fov, aspect, Math.max(0.01, framed.distanceMm / 1000), framed.distanceMm * 20 + 2000)
      const position = { x: 0, y: 0, z: 0 }
      positionFromSpherical(framed.azimuthDeg, framed.elevationDeg, framed.distanceMm, framed.target, position)
      const up = { x: 0, y: 0, z: 1 }
      upFromSpherical(framed.azimuthDeg, framed.elevationDeg, up)
      camera.position.set(position.x, position.y, position.z)
      camera.up.set(up.x, up.y, up.z)
      camera.lookAt(framed.target.x, framed.target.y, framed.target.z)
      camera.updateMatrixWorld(true)

      const target = new WebGLRenderTarget(renderWidth, renderHeight, { type: UnsignedByteType, depthBuffer: true })
      target.texture.colorSpace = SRGBColorSpace
      const pixels = new Uint8Array(renderWidth * renderHeight * 4)

      // Hide what the viewport put in the scene (its bodies, ghosts, overlays), keep the lights
      // and the grid, and put everything back however this ends.
      const scene = graph.scene
      /** @type {Array<[import('three').Object3D, boolean]>} */
      const hidden = []
      for (const child of scene.children) {
        if (child === graph.grid || /** @type {any} */ (child).isLight) continue
        hidden.push([child, child.visible])
        child.visible = false
      }
      const previousTarget = renderer.getRenderTarget()
      const previousClipping = renderer.localClippingEnabled
      scene.add(group)
      try {
        renderer.localClippingEnabled = plane !== null
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        renderer.readRenderTargetPixels(target, 0, 0, renderWidth, renderHeight, pixels)
      } finally {
        renderer.setRenderTarget(previousTarget)
        renderer.localClippingEnabled = previousClipping
        scene.remove(group)
        for (const [child, visible] of hidden) child.visible = visible
        for (const object of built) disposeBodyObject(/** @type {any} */ (object))
        for (const made of materials) made.dispose()
        target.dispose()
      }

      const full = canvasOf(renderWidth, renderHeight)
      const fullContext = /** @type {CanvasRenderingContext2D} */ (full.getContext('2d'))
      fullContext.putImageData(new ImageData(flipRows(pixels, renderWidth, renderHeight), renderWidth, renderHeight), 0, 0)
      const out = canvasOf(widthPx, heightPx)
      const context = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'))
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(full, 0, 0, widthPx, heightPx)
      const stats = pixelStats(context.getImageData(0, 0, widthPx, heightPx).data, rgbOf(VIEWPORT_THEMES[theme]?.background ?? VIEWPORT_THEMES.dark.background))
      const url = out.toDataURL('image/png')
      return {
        mediaType: 'image/png',
        data: url.slice(url.indexOf(',') + 1),
        widthPx,
        heightPx,
        contentFraction: stats.contentFraction,
      }
    },
  }
}

// --- the one capture the app has ------------------------------------------------------------

/** @type {ToolCapture | null} */
let active = null

/**
 * The viewport registers its capture on mount and clears it on unmount; the assistant reads it
 * per turn (`src/composables/useAgent.js`). A plain module variable, never reactive: it holds a
 * renderer.
 *
 * @param {ToolCapture | null} capture
 */
export function setViewportCapture(capture) {
  active = capture
}

/**
 * @returns {ToolCapture | null} The mounted viewport's capture, or `null` when there is no
 *   working viewport (not mounted, or WebGL never started / was lost).
 */
export function viewportCapture() {
  return active
}
