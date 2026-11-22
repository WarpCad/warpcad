// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The viewport's WebGL context-loss state and its handlers (`TODO/render-006`, `TODO/ui-108`),
 * grouped here by `TODO/ui-152` without a behaviour change: the reactive state the banner and
 * `data-webgl` read, `src/render/contextRecovery.js`, and `src/render/contextHandlers.js`.
 * **Restore view** gives the canvas a fresh element through `canvasKey` when the old context
 * stays lost.
 *
 * @module composables/useViewportContext
 */
import { nextTick, ref } from 'vue'
import { createContextHandlers } from '../render/contextHandlers.js'
import { createContextRecovery } from '../render/contextRecovery.js'

/**
 * @typedef {object} ViewportContextDeps
 * @property {() => any} viewport The three.js viewport, or `null`.
 * @property {() => (HTMLCanvasElement | null)} canvas
 * @property {() => void} cancelFrame
 * @property {() => void} measure
 */

/**
 * Create the context recovery state and handlers. Call once from `setup`.
 *
 * @param {ViewportContextDeps} deps Called lazily, so they may name things declared later.
 */
export function useViewportContext(deps) {
  /** Where the view stands after the browser released its context; `ready` whenever it is healthy. */
  const contextState = ref(/** @type {import('../render/contextRecovery.js').ContextState} */ ('ready'))
  /** How many Restore view attempts failed. */
  const contextFailures = ref(0)
  const contextRecovery = createContextRecovery({
    onChange(state, failures) {
      contextState.value = state
      contextFailures.value = failures
    },
  })
  /** Bumped to give the canvas a fresh element (and so a fresh context) when the old one stays lost. */
  const canvasKey = ref(0)
  const handlers = createContextHandlers({
    viewport: deps.viewport,
    canvas: deps.canvas,
    recovery: contextRecovery,
    cancelFrame: () => deps.cancelFrame(),
    measure: () => deps.measure(),
    remountCanvas: async () => {
      canvasKey.value += 1
      await nextTick()
    },
  })
  return {
    contextState,
    contextFailures,
    contextRecovery,
    canvasKey,
    attachContextListeners: handlers.attach,
    detachContextListeners: handlers.detach,
    onRestoreView: handlers.restoreView,
  }
}
