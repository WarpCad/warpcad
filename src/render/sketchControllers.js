// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The sketch editor's render controllers, wired together once (`TODO/ui-108` extractions 4a to 4c and
 * 6, grouped by `TODO/ui-152`): the snap (`sketchSnap.js`), the point handles (`sketchHandles.js`), the
 * draw gesture and Line chain (`sketchDraw.js`), the extrusion preview (`sketchPreview.js`), the outline
 * sync (`sketchPathSync.js`) and the chain keys (`sketchChainKeys.js`).
 *
 * Moved out of `Viewport.vue` without a behaviour change. Framework-free. The pointer controller is
 * built *after* these (it takes them), so it is reached through a getter, called only from event
 * handlers, never during construction.
 */
import { createSketchSnap } from './sketchSnap.js'
import { createSketchHandles } from './sketchHandles.js'
import { createSketchDraw } from './sketchDraw.js'
import { createSketchPreview } from './sketchPreview.js'
import { createSketchPathSync } from './sketchPathSync.js'
import { createSketchChainKeys } from './sketchChainKeys.js'

/**
 * @typedef {object} SketchControllersDeps
 * @property {any} orbit The orbit camera.
 * @property {any} sketchEditor The sketch editor store.
 * @property {() => number} sliceZ The active slice's offset along the sketch's own Z.
 * @property {() => number} widthPx
 * @property {() => number} heightPx
 * @property {{ left: number, top: number, width: number, height: number }} viewportRect
 * @property {() => any} pointer The pointer gestures controller (`createPointerGestures`), built later.
 * @property {() => void} scheduleRender
 * @property {any} referenceImage The reference photo's view.
 * @property {() => boolean} isSketching Whether the sketch editor is open.
 * @property {(target: EventTarget | null) => boolean} isTextEntry Whether a key event's target is a text field (injected: render/ does not import composables).
 * @property {{ sketchSnap: any, sketchHandles: any, sketchChain: any, sketchDraftPath: any, sketchPaths: any[], sketchAxis: any }} overlays
 *   The reactive overlay structures from `useViewportOverlays`.
 * @property {any} channel The evaluation channel the extrusion preview builds on.
 * @property {() => any} resolution The document's tessellation resolution.
 * @property {() => (import('three').Scene | null)} scene The three.js scene, or `null`.
 */

/**
 * Create the sketch controllers.
 *
 * @param {SketchControllersDeps} deps
 */
export function createSketchControllers(deps) {
  const { orbit, sketchEditor, sliceZ, widthPx, heightPx, viewportRect, pointer, scheduleRender, referenceImage, overlays } = deps

  /** The draft's live extrusion ghost (`TODO/ui-108`, step 6). */
  const sketchPreview = createSketchPreview({
    editor: sketchEditor,
    channel: deps.channel,
    resolution: deps.resolution,
    scene: deps.scene,
    scheduleRender,
  })
  /** The sketch snap (`TODO/ui-108`, extraction 4a); it writes the reactive marker the overlay reads. */
  const sketchSnapper = createSketchSnap({
    orbit,
    editor: sketchEditor,
    sliceZ,
    widthPx,
    heightPx,
    isEditing: () => sketchHandler.drag.active,
    marker: overlays.sketchSnap,
  })
  /** The point handles and their drag (`TODO/ui-108`, extraction 4b). */
  const sketchHandler = createSketchHandles({
    orbit,
    editor: sketchEditor,
    sliceZ,
    widthPx,
    heightPx,
    viewport: viewportRect,
    layout: overlays.sketchHandles,
    projectToSketch: (clientXPx, clientYPx) => pointer().projectToSketch(clientXPx, clientYPx),
    snap: (pointMm, shiftKey, touch) => sketchSnapper.snap(pointMm, shiftKey, touch),
    hideSnap: () => sketchSnapper.hide(),
    isTouchPress: () => pointer().isTouchPress(),
    requestPreview: () => sketchPreview.request(),
  })
  /** The draw gesture, the Line chain and profile pick and hover (`TODO/ui-108`, extraction 4c). */
  const sketchDraw = createSketchDraw({
    orbit,
    editor: sketchEditor,
    sliceZ,
    widthPx,
    heightPx,
    project: (clientXPx, clientYPx) => pointer().projectToSketch(clientXPx, clientYPx),
    snap: (pointMm, shiftKey, touch) => sketchSnapper.snap(pointMm, shiftKey, touch),
    hideSnap: () => sketchSnapper.hide(),
    isTouchPress: () => pointer().isTouchPress(),
    scheduleRender,
    chain: overlays.sketchChain,
    draft: overlays.sketchDraftPath,
  })
  /** Re-projects the draft's outlines, the revolve axis and the chain when something they depend on changed. */
  const sketchPathSync = createSketchPathSync({
    orbit,
    sketchEditor,
    paths: overlays.sketchPaths,
    axis: overlays.sketchAxis,
    draftPath: overlays.sketchDraftPath,
    chain: overlays.sketchChain,
    handler: sketchHandler,
    draw: sketchDraw,
    snapper: sketchSnapper,
    referenceImage,
    widthPx,
    heightPx,
    sliceZ,
  })
  /** The sketch editor's keys (`TODO/ui-108`). */
  const onSketchChainKey = createSketchChainKeys({
    isSketching: deps.isSketching,
    sketchEditor,
    isTextEntry: deps.isTextEntry,
    redraw: () => {
      sketchDraw.drawChain()
      scheduleRender()
    },
  })

  return {
    sketchSnapper,
    sketchHandler,
    sketchDraw,
    sketchPreview,
    sketchPathSync,
    onSketchChainKey,
    /** @param {boolean} [force] */
    syncSketchPaths(force = false) {
      sketchPathSync.sync(force)
    },
  }
}
