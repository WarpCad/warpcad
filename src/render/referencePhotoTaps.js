// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Set scale's and Auto-trace's taps and drags on the reference photo (`TODO/sketch-003`,
 * `TODO/sketch-004`), moved out of `src/render/pointerGestures.js` without a behaviour change
 * (`TODO/ui-152`). Framework-free: the sketch editor store, the reference photo's view and the frame
 * scheduler are handed in.
 */

/**
 * @typedef {object} ReferencePhotoTapsDeps
 * @property {any} sketchEditor The sketch editor store.
 * @property {any} referenceImage The reference photo's view (`useReferenceImageView`).
 * @property {() => void} scheduleRender
 */

/**
 * @typedef {object} ReferencePhotoTaps
 * @property {(startClientXPx: number, startClientYPx: number) => boolean} beginDrag Start a Set scale
 *   drag at the press point; `false` when the press is not on the photo's plane.
 * @property {(clientXPx: number, clientYPx: number) => void} updateDrag The ruler's free end follows the pointer.
 * @property {(cancelled: boolean, clientXPx: number, clientYPx: number) => void} endDrag Fix (or drop) the ruler.
 * @property {() => void} cancelDrag Forget a drag without touching the editor (it closed under it).
 * @property {(clientXPx: number, clientYPx: number) => void} scaleTap A tap fixes the next ruler mark.
 * @property {(clientXPx: number, clientYPx: number) => void} traceTap A tap traces the region under it.
 */

/**
 * Create the reference photo's tap and drag handlers.
 *
 * @param {ReferencePhotoTapsDeps} deps
 * @returns {ReferencePhotoTaps}
 */
export function createReferencePhotoTaps({ sketchEditor, referenceImage, scheduleRender }) {
  /** A Set scale press-and-drag along the ruler: its first point, in image px. */
  const scaleDrag = { active: false, aPx: /** @type {[number, number] | null} */ (null) }

  return {
    beginDrag(startClientXPx, startClientYPx) {
      const px = referenceImage.clientToImagePx(startClientXPx, startClientYPx)
      if (!px) return false
      scaleDrag.active = true
      scaleDrag.aPx = px
      // A drag defines both points; a tapped first point it replaces is simply forgotten.
      sketchEditor.scaleAPx = null
      sketchEditor.scaleBPx = null
      sketchEditor.addScalePoint(px)
      return true
    },

    updateDrag(clientXPx, clientYPx) {
      if (!scaleDrag.active) return
      referenceImage.trackLiveEnd(clientXPx, clientYPx)
      scheduleRender()
    },

    endDrag(cancelled, clientXPx, clientYPx) {
      if (!scaleDrag.active) return
      scaleDrag.active = false
      referenceImage.clearLiveEnd()
      const end = cancelled ? null : referenceImage.clientToImagePx(clientXPx, clientYPx)
      if (!end || !scaleDrag.aPx) {
        sketchEditor.scaleAPx = null
        sketchEditor.scaleBPx = null
      } else {
        sketchEditor.setScaleLine(scaleDrag.aPx, end)
      }
      scaleDrag.aPx = null
      referenceImage.syncOverlay()
      scheduleRender()
    },

    cancelDrag() {
      scaleDrag.active = false
    },

    /**
     * A tap while Set scale is armed fixes the next point, the first then the second.
     */
    scaleTap(clientXPx, clientYPx) {
      const px = referenceImage.clientToImagePx(clientXPx, clientYPx)
      if (!px) return
      sketchEditor.addScalePoint(px)
      referenceImage.clearLiveEnd()
      referenceImage.syncOverlay()
      scheduleRender()
    },

    /**
     * A tap while Auto-trace is armed (`TODO/sketch-004`): trace the region under it, in the worker.
     * The answer lands in the draft (or the banner says why it did not).
     */
    traceTap(clientXPx, clientYPx) {
      const px = referenceImage.clientToImagePx(clientXPx, clientYPx)
      // Off the slice's plane altogether: the trace itself reports "Tap on the photo".
      sketchEditor.traceAt(px ?? [Number.NaN, Number.NaN])
    },
  }
}
