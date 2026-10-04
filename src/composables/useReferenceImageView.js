// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The viewport's half of the reference photo (`TODO/sketch-003`): keeps the WebGL plane
 * (`src/render/referenceImage.js`) in step with the editor's active slice, and projects the
 * pointer-transparent furniture drawn over it — the Set scale line and its label, and the
 * "Not to scale" / "1 px = 0.199 mm" badge on the photo's bottom-left corner.
 *
 * Split out of `Viewport.vue` so that component only routes pointer events here. The photo
 * is decoded off the main thread (`src/sketch/imageClient.js`) and only ever shown while the
 * editor is open: it is a tracing aid, never part of the scene, an export or a boolean.
 *
 * @module composables/useReferenceImageView
 */

import { reactive, ref } from 'vue'

import { sketchPointToScreen } from '../render/annotate.js'
import { createReferenceImageLayer, referenceImageMatrix } from '../render/referenceImage.js'
import { formatCalibration, imagePxToSketchMm, sketchMmToImagePx } from '../sketch/calibration.js'
import { decodeAssetBitmap, releaseAssetBitmaps } from '../sketch/imageClient.js'
import { useSketchEditorStore } from '../stores/sketchEditor.js'

/**
 * @typedef {object} ReferenceImageViewDeps
 * @property {() => any} orbit The orbit camera model.
 * @property {() => { widthPx: number, heightPx: number }} size The viewport's size.
 * @property {() => number} sliceZ The active slice's Z.
 * @property {(clientX: number, clientY: number) => number[] | null} projectToSketch
 * @property {() => void} scheduleRender
 */

/**
 * @param {ReferenceImageViewDeps} deps
 */
export function useReferenceImageView(deps) {
  const editor = useSketchEditorStore()

  /** `none` · `loading` · `shown` · `removed` · `error` — for `data-reference-image`. */
  const state = ref(/** @type {'none' | 'loading' | 'shown' | 'removed' | 'error'} */ ('none'))

  /** What the overlay draws, in viewport pixels. */
  const overlay = reactive({
    line: { visible: false, x1: 0, y1: 0, x2: 0, y2: 0, label: '', labelX: 0, labelY: 0, pending: false },
    badge: { visible: false, x: 0, y: 0, text: '', calibrated: false },
  })

  /** The live end of a Set scale line while the second point is being chosen, in image px. */
  const liveEndPx = [0, 0]
  let hasLiveEnd = false

  /** @type {ReturnType<typeof createReferenceImageLayer> | null} */
  let layer = null
  /** Bitmaps already decoded, by asset id — read synchronously by {@link sync}. */
  /** @type {Map<string, ImageBitmap>} */
  const ready = new Map()
  /** @type {Set<string>} */
  const failed = new Set()

  // Scratch (CLAUDE.md: no allocation in the pointer path).
  const scratchMm = [0, 0]
  const scratchPx = [0, 0]
  const scratchScreen = { x: 0, y: 0, depth: 0, visible: false }

  /** @param {import('three').Scene} scene */
  function attach(scene) {
    layer = createReferenceImageLayer(scene)
  }

  /**
   * Put the active slice's photo on screen, or take it off. Cheap; called on every draft,
   * slice or camera-frame change.
   */
  function sync() {
    if (!layer) return
    const view = editor.active ? editor.activeImage : null
    if (!view || view.state !== 'ok' || !view.placement || !view.asset) {
      layer.hide()
      state.value = view?.state === 'removed' ? 'removed' : 'none'
      syncOverlay()
      deps.scheduleRender()
      return
    }
    const asset = view.asset
    const bitmap = ready.get(asset.id)
    if (!bitmap) {
      layer.hide()
      if (failed.has(asset.id)) {
        state.value = 'error'
      } else {
        state.value = 'loading'
        decodeAssetBitmap(asset)
          .then((decoded) => {
            ready.set(asset.id, decoded)
            sync()
          })
          .catch(() => {
            failed.add(asset.id)
            sync()
          })
      }
      syncOverlay()
      return
    }
    const size = { widthPx: asset.params.widthPx, heightPx: asset.params.heightPx }
    layer.show(bitmap, referenceImageMatrix(editor.frame, deps.sliceZ(), view.placement, size), view.placement.opacity)
    state.value = 'shown'
    syncOverlay()
    deps.scheduleRender()
  }

  /**
   * @param {number} xMm
   * @param {number} yMm
   */
  function toScreen(xMm, yMm) {
    const { widthPx, heightPx } = deps.size()
    return sketchPointToScreen(deps.orbit(), editor.frame, xMm, yMm, deps.sliceZ(), widthPx, heightPx, scratchScreen)
  }

  /** Re-project the line and the badge — the camera, the draft or a Set scale point moved. */
  function syncOverlay() {
    const view = editor.active ? editor.activeImage : null
    const placement = view?.state === 'ok' ? view.placement : null
    const asset = view?.state === 'ok' ? view.asset : null
    if (!placement || !asset || state.value !== 'shown') {
      overlay.line.visible = false
      overlay.badge.visible = false
      return
    }
    const size = { widthPx: asset.params.widthPx, heightPx: asset.params.heightPx }

    // The badge, just under the photo's bottom-left corner — the top edge is where the
    // toolbar sits, and a rescaled photo's top often runs under it.
    imagePxToSketchMm(placement, size, [0, size.heightPx], scratchMm)
    const corner = toScreen(scratchMm[0], scratchMm[1])
    overlay.badge.visible = corner.visible
    overlay.badge.x = corner.x
    overlay.badge.y = corner.y
    overlay.badge.text = view?.badge ?? ''
    overlay.badge.calibrated = Boolean(placement.calibration)

    // The line: the one being drawn, else the applied calibration in dimension style.
    const pending = editor.imageTool === 'scale'
    const a = pending ? editor.scaleAPx : placement.calibration?.aPx ?? null
    const b = pending ? editor.scaleBPx ?? (a && hasLiveEnd ? liveEndPx : null) : placement.calibration?.bPx ?? null
    if (!a || !b) {
      overlay.line.visible = false
      return
    }
    imagePxToSketchMm(placement, size, a, scratchMm)
    const start = toScreen(scratchMm[0], scratchMm[1])
    const x1 = start.x
    const y1 = start.y
    const startVisible = start.visible
    imagePxToSketchMm(placement, size, b, scratchMm)
    const end = toScreen(scratchMm[0], scratchMm[1])
    overlay.line.visible = startVisible && end.visible
    overlay.line.x1 = x1
    overlay.line.y1 = y1
    overlay.line.x2 = end.x
    overlay.line.y2 = end.y
    overlay.line.pending = pending
    overlay.line.label = pending ? '' : placement.calibration ? formatCalibration(placement.calibration) : ''
    overlay.line.labelX = (x1 + end.x) / 2
    overlay.line.labelY = (y1 + end.y) / 2 - 10
  }

  /**
   * A client point in the active photo's pixels, or `null` (no photo, or off the plane).
   *
   * @param {number} clientX
   * @param {number} clientY
   * @returns {[number, number] | null}
   */
  function clientToImagePx(clientX, clientY) {
    const view = editor.activeImage
    if (view.state !== 'ok' || !view.placement || !view.asset) return null
    const point = deps.projectToSketch(clientX, clientY)
    if (!point) return null
    sketchMmToImagePx(view.placement, { widthPx: view.asset.params.widthPx, heightPx: view.asset.params.heightPx }, point, scratchPx)
    return [scratchPx[0], scratchPx[1]]
  }

  /**
   * Follow the pointer with the line's free end while the second point is being chosen.
   *
   * @param {number} clientX
   * @param {number} clientY
   */
  function trackLiveEnd(clientX, clientY) {
    if (editor.imageTool !== 'scale' || !editor.scaleAPx || editor.scaleBPx) return
    const px = clientToImagePx(clientX, clientY)
    if (!px) return
    liveEndPx[0] = px[0]
    liveEndPx[1] = px[1]
    hasLiveEnd = true
    syncOverlay()
  }

  function clearLiveEnd() {
    hasLiveEnd = false
  }

  /** The editor closed: the photo leaves the scene and its decoded memory is freed. */
  function release() {
    layer?.hide(true)
    ready.clear()
    failed.clear()
    releaseAssetBitmaps()
    hasLiveEnd = false
    state.value = 'none'
    overlay.line.visible = false
    overlay.badge.visible = false
  }

  function dispose() {
    release()
    layer?.dispose()
    layer = null
  }

  return { state, overlay, attach, sync, syncOverlay, clientToImagePx, trackLiveEnd, clearLiveEnd, release, dispose }
}
