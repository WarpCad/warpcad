// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The WebGL context-lost and restore handlers (`TODO/render-006`; moved out of `Viewport.vue` by
 * `TODO/ui-108` without a behaviour change).
 *
 * `contextRecovery.js` decides what the banner shows. This is the other half: what the viewport
 * does when the browser drops the GPU, hands it back, or the user presses **Restore view**. A
 * restore never reloads the page, so the document, both undo stacks, the selection, the camera
 * and the kernel worker are untouched.
 *
 * The canvas element, the frame handle and the Vue-owned canvas key stay with the component and
 * come in as functions. The GPU calls are injectable so the handlers run in plain Node.
 *
 * @module render/contextHandlers
 */
import { createOffscreenCapture, setViewportCapture } from './offscreenCapture.js'
import { rebuildGpuResources } from './scene.js'

/**
 * @typedef {object} ContextHandlersDeps
 * @property {() => (any | null)} viewport The mounted viewport (`createViewport`'s result), or `null`.
 * @property {() => (HTMLCanvasElement | null | undefined)} canvas The live canvas element.
 * @property {{ lost: () => void, restored: () => void, attemptFailed: () => void }} recovery
 * @property {() => void} cancelFrame Stop the scheduled frame, if any.
 * @property {() => void} measure Re-apply the size and schedule a frame.
 * @property {() => Promise<void>} remountCanvas Give the canvas a fresh element and wait for it to be in the DOM.
 * @property {{
 *   rebuild: (renderer: any, scene: any) => unknown,
 *   setCapture: (capture: any) => void,
 *   createCapture: (options: { renderer: any, graph: any }) => any,
 * }} [gpu] Defaults to the real `scene.js` and `offscreenCapture.js`.
 */

/**
 * @typedef {object} ContextHandlers
 * @property {(event: Event) => void} onLost
 * @property {() => void} onRestored
 * @property {() => Promise<void>} restoreView **Restore view**.
 * @property {(canvas: HTMLCanvasElement | null | undefined) => void} attach
 * @property {(canvas: HTMLCanvasElement | null | undefined) => void} detach
 */

/**
 * @param {ContextHandlersDeps} deps
 * @returns {ContextHandlers}
 */
export function createContextHandlers(deps) {
  const gpu = deps.gpu ?? {
    rebuild: rebuildGpuResources,
    setCapture: setViewportCapture,
    createCapture: createOffscreenCapture,
  }
  let restoring = false

  /**
   * The browser released the GPU: a background tab, a backgrounded iOS app, a driver reset.
   * `preventDefault` is what allows the context to be restored at all.
   *
   * @param {Event} event
   */
  function onLost(event) {
    event.preventDefault()
    // The assistant's capture_view renders through this context: with it gone, the agent stops
    // offering the tool rather than offering one that fails (`TODO/ai-007`).
    gpu.setCapture(null)
    deps.cancelFrame()
    // Ignored unless drawing: a repeat event during the wait must not cut it short.
    deps.recovery.lost()
  }

  /**
   * The browser handed the context back. three.js's own handler, registered on the canvas before
   * this one, has already reset its internal state; `rebuild` marks what it re-uploads.
   */
  function onRestored() {
    const viewport = deps.viewport()
    if (!viewport) return
    if (gpu.rebuild(viewport.renderer, viewport.graph.scene) === null) return
    resumeDrawing()
  }

  /** Back to drawing: the banner goes, capture_view comes back, and the first frame is scheduled. */
  function resumeDrawing() {
    const viewport = deps.viewport()
    if (!viewport) return
    deps.recovery.restored()
    gpu.setCapture(gpu.createCapture({ renderer: viewport.renderer, graph: viewport.graph }))
    // Re-applies the size (a fresh canvas starts at 300×150) and schedules the frame.
    deps.measure()
  }

  /** @param {HTMLCanvasElement | null | undefined} canvas */
  function attach(canvas) {
    canvas?.addEventListener('webglcontextlost', onLost)
    canvas?.addEventListener('webglcontextrestored', onRestored)
  }

  /** @param {HTMLCanvasElement | null | undefined} canvas */
  function detach(canvas) {
    canvas?.removeEventListener('webglcontextlost', onLost)
    canvas?.removeEventListener('webglcontextrestored', onRestored)
  }

  /**
   * **Restore view**: dispose the renderer and draw the same scene graph through a fresh one. On
   * the same canvas if its context is alive again, otherwise on a new canvas element, since a
   * canvas whose context stays lost can never give out another.
   */
  async function restoreView() {
    const viewport = deps.viewport()
    if (!viewport || restoring) return
    restoring = true
    let ok = false
    try {
      detach(deps.canvas())
      if (viewport.isContextLost()) await deps.remountCanvas()
      const canvas = deps.canvas()
      if (canvas) {
        // three's listeners go on in the renderer's constructor, ahead of the app's, as on mount.
        viewport.replaceRenderer(canvas)
        attach(canvas)
        ok = !viewport.isContextLost()
      }
    } catch {
      ok = false
      attach(deps.canvas())
    } finally {
      restoring = false
    }
    if (ok) resumeDrawing()
    else deps.recovery.attemptFailed()
  }

  return { onLost, onRestored, restoreView, attach, detach }
}
