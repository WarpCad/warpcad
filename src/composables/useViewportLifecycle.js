// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The viewport's mount and unmount sequence (`TODO/ui-144`): build the three.js viewport, register
 * the drop target and the watchers, bind the window listeners, take the first measurement and body
 * sync, then undo all of it on unmount.
 *
 * Moved out of `Viewport.vue` without a behaviour change, in the same order. Every collaborator is
 * handed in, so a unit test can drive the sequence with fakes. Call it once, from `setup`, at the
 * point the component used to register its own `onMounted` and `onBeforeUnmount`.
 *
 * @module composables/useViewportLifecycle
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { createOffscreenCapture, setViewportCapture } from '../render/offscreenCapture.js'
import { createViewport } from '../render/scene.js'
import { registerViewportWatchers } from './useViewportWatchers.js'
import { registerEscapeYield } from './useOverlayStack.js'
import { useTheme } from './useTheme.js'

/**
 * @typedef {object} ViewportLifecycleDeps
 * @property {{ value: HTMLElement | null }} rootEl
 * @property {{ value: HTMLCanvasElement | null }} canvasEl
 * @property {{ value: string }} webglError
 * @property {{ fovDeg: number }} orbit
 * @property {{ minorMm: number, majorMm: number }} overlay
 * @property {() => any} getViewport The three.js viewport, or null before mount and after unmount.
 * @property {(viewport: any) => void} setViewport
 * @property {() => any} readCurrentSceneTheme
 * @property {any} bodyScene
 * @property {any} bodiesGroup
 * @property {any} sketchPreview
 * @property {any} placementGhost
 * @property {any} referenceImage
 * @property {any} placement
 * @property {any} dropTarget
 * @property {any} sketchEditor
 * @property {any} pointer
 * @property {any} gizmoDrag
 * @property {any} contextRecovery
 * @property {(canvas: HTMLCanvasElement) => void} attachContextListeners
 * @property {(canvas: HTMLCanvasElement | null) => void} detachContextListeners
 * @property {import('./useViewportWatchers.js').ViewportWatcherDeps} watcherDeps
 * @property {(event: KeyboardEvent) => void} onSketchChainKey
 * @property {() => boolean} isChainLive Is the Line chain live, so Escape stays ahead of the overlay stack?
 * @property {() => void} measure
 * @property {() => void} onThemeChange
 * @property {() => void} syncBodies
 * @property {() => void} cancelFrame
 * @property {() => boolean} shouldFrameOnMount A document already has content, or this is the Shared view.
 * @property {() => void} frameLoadedContent
 */

/**
 * Register the mount and unmount sequence for the viewport.
 *
 * @param {ViewportLifecycleDeps} d
 * @returns {void}
 */
export function useViewportLifecycle(d) {
  /** @type {(() => void) | null} */
  let unregisterTarget = null
  /** @type {(() => void) | null} */
  let unregisterChainYield = null
  /** @type {(() => void) | null} */
  let stopThemeWatch = null
  /** @type {ResizeObserver | null} */
  let resizeObserver = null
  /** @type {(() => void)[]} */
  const stopWatchers = []

  onMounted(() => {
    const canvas = d.canvasEl.value
    if (!canvas) return
    // First paint: `useTheme()` (in setup) has already written `<html data-theme>`, so this one read
    // sees the resolved theme's tokens, and every material and the scene start in those colours.
    const colors = d.readCurrentSceneTheme()
    d.bodyScene.createMaterials(colors)
    d.sketchPreview.createMaterial(colors.bodyGhost)
    d.placementGhost.setColor(colors.bodyGhost)

    try {
      const viewport = createViewport(canvas, { fovDeg: d.orbit.fovDeg, theme: colors })
      d.setViewport(viewport)
      viewport.graph.scene.add(d.bodiesGroup)
      d.referenceImage.attach(viewport.graph.scene)
      // `TODO/ai-007`: the assistant's capture_view renders this scene offscreen, with its own
      // camera and meshes, so the user's view is never moved (`src/render/offscreenCapture.js`).
      setViewportCapture(createOffscreenCapture({ renderer: viewport.renderer, graph: viewport.graph }))
      // Label the readout from the grid that actually got built, rather than
      // repeating the spacing constant in a second place.
      d.overlay.minorMm = viewport.graph.gridLines.minorMm
      d.overlay.majorMm = viewport.graph.gridLines.majorMm
    } catch (error) {
      // The chrome, gizmo and readout stay live: the camera model does not need
      // WebGL, so navigation still works and the failure is visible rather than a
      // silently blank rectangle.
      d.webglError.value = `This browser could not start WebGL: ${String(error)}`
    }
    d.attachContextListeners(canvas)

    unregisterTarget = d.placement.registerTarget(d.dropTarget)
    // `src/composables/useViewportWatchers.js` (`TODO/ui-108`).
    stopWatchers.push(...registerViewportWatchers(d.watcherDeps))

    if (typeof ResizeObserver !== 'undefined' && d.rootEl.value) {
      resizeObserver = new ResizeObserver(d.measure)
      resizeObserver.observe(d.rootEl.value)
    }
    window.addEventListener('keydown', d.onSketchChainKey)
    // The Line chain's Escape stays ahead of the overlay stack (`TODO/ui-110`).
    unregisterChainYield = registerEscapeYield(d.isChainLive)
    window.addEventListener('keydown', d.pointer.shiftKey)
    window.addEventListener('keyup', d.pointer.shiftKey)
    window.addEventListener('keydown', d.gizmoDrag.shiftKey)
    window.addEventListener('keyup', d.gizmoDrag.shiftKey)
    window.addEventListener('resize', d.measure)
    window.addEventListener('scroll', d.measure, { passive: true })

    // Follow a theme change, whether the user picked it in Help or the OS flipped it.
    stopThemeWatch = useTheme().onChange(d.onThemeChange)

    d.measure()
    // A document that already has content (a reload, a loaded file) renders on
    // mount rather than waiting for the next mutation.
    d.syncBodies()
    if (d.shouldFrameOnMount()) d.frameLoadedContent()
  })

  onBeforeUnmount(() => {
    setViewportCapture(null)
    // The viewport is the only thing that can draw or close the editor, so it must not
    // outlive it — a draft left open with no surface to finish it on is a stuck mode.
    d.sketchEditor.close()
    d.sketchPreview.clear()
    d.sketchPreview.dispose()
    d.referenceImage.dispose()
    d.cancelFrame()
    unregisterTarget?.()
    unregisterTarget = null
    for (const stop of stopWatchers.splice(0)) stop()
    resizeObserver?.disconnect()
    resizeObserver = null
    window.removeEventListener('keydown', d.onSketchChainKey)
    unregisterChainYield?.()
    window.removeEventListener('keydown', d.pointer.shiftKey)
    window.removeEventListener('keyup', d.pointer.shiftKey)
    window.removeEventListener('keydown', d.gizmoDrag.shiftKey)
    window.removeEventListener('keyup', d.gizmoDrag.shiftKey)
    d.gizmoDrag.clearStall()
    window.removeEventListener('resize', d.measure)
    window.removeEventListener('scroll', d.measure)
    stopThemeWatch?.()
    stopThemeWatch = null
    d.detachContextListeners(d.canvasEl.value)
    d.contextRecovery.dispose()
    d.bodyScene.dispose()
    d.placementGhost.dispose()
    d.getViewport()?.dispose()
    d.setViewport(null)
  })
}
