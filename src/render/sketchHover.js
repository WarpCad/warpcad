// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The sketch editor's hover and Shift re-snap (`TODO/sketch-007`), moved out of
 * `src/render/pointerGestures.js` without a behaviour change (`TODO/ui-152`). Framework-free: the
 * sketch controllers, the editor store, the pointer's projection and the frame scheduler are handed in.
 * Allocates nothing per call.
 */

/**
 * @typedef {object} SketchHoverDeps
 * @property {any} sketchEditor The sketch editor store.
 * @property {any} sketchHandler `src/render/sketchHandles.js`.
 * @property {any} sketchDraw `src/render/sketchDraw.js`.
 * @property {{ snap: (pointMm: number[], shiftKey: boolean, touch: boolean) => void, hide: () => void }} sketchSnapper
 * @property {() => boolean} isSketching Whether the sketch editor is open.
 * @property {() => number} pointerCount How many pointers are down on the canvas.
 * @property {(clientXPx: number, clientYPx: number) => (number[] | null)} projectToSketch
 * @property {() => void} scheduleRender
 */

/**
 * @typedef {object} SketchHover
 * @property {(clientXPx: number, clientYPx: number) => void} remember Note the last pointer over the canvas.
 * @property {(clientXPx: number, clientYPx: number, shiftKey: boolean) => void} hoverSnap Show where a press would land.
 * @property {(event: KeyboardEvent) => void} onShiftKey Shift pressed or released: re-snap in place.
 * @property {() => void} clear The pointer left the canvas: the hover and the snap marker go.
 */

/**
 * Create the sketch hover controller.
 *
 * @param {SketchHoverDeps} deps
 * @returns {SketchHover}
 */
export function createSketchHover({ sketchEditor, sketchHandler, sketchDraw, sketchSnapper, isSketching, pointerCount, projectToSketch, scheduleRender }) {
  /** The last pointer over the canvas, so pressing or releasing Shift can re-snap in place. */
  const snapPointer = { has: false, xPx: 0, yPx: 0 }

  /**
   * A mouse over the canvas with a drawing tool armed and nothing pressed: show where a press
   * would land, so the marker and its label appear *before* the click.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @param {boolean} shiftKey
   */
  function hoverSnap(clientXPx, clientYPx, shiftKey) {
    const tool = sketchEditor.tool
    if (tool === 'select') {
      sketchSnapper.hide()
      return
    }
    if (tool === 'line' && sketchEditor.chainLive) return
    const point = projectToSketch(clientXPx, clientYPx)
    if (!point) {
      sketchSnapper.hide()
      return
    }
    sketchSnapper.snap(point, shiftKey, false)
  }

  return {
    remember(clientXPx, clientYPx) {
      snapPointer.has = true
      snapPointer.xPx = clientXPx
      snapPointer.yPx = clientYPx
    },

    hoverSnap,

    /**
     * Shift pressed or released with the pointer still: re-place the point in hand at once, rather
     * than waiting for the next move — "hold Shift" should read as instant.
     */
    onShiftKey(event) {
      if (event.key !== 'Shift' || !isSketching() || !snapPointer.has) return
      const shiftKey = event.type === 'keydown'
      if (sketchHandler.drag.active) sketchHandler.updateDrag(snapPointer.xPx, snapPointer.yPx, shiftKey)
      else if (sketchDraw.drag.active) sketchDraw.update(snapPointer.xPx, snapPointer.yPx, shiftKey)
      else if (pointerCount() === 0) {
        hoverSnap(snapPointer.xPx, snapPointer.yPx, shiftKey)
        sketchDraw.trackChain(snapPointer.xPx, snapPointer.yPx, shiftKey)
      }
    },

    clear() {
      snapPointer.has = false
      if (!sketchDraw.drag.active && !sketchHandler.drag.active) sketchSnapper.hide()
      if (sketchDraw.live.has && !sketchDraw.drag.active) {
        sketchDraw.live.has = false
        sketchDraw.drawChain()
        scheduleRender()
      }
      sketchDraw.forgetHover()
      sketchHandler.forgetHover()
      if (sketchEditor.hoverProfileId) sketchEditor.hoverProfileId = ''
      if (sketchEditor.hoverVertex !== -1) sketchEditor.hoverVertex = -1
    },
  }
}
