// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The sketch editor's keyboard rules (`TODO/ui-108`): the Line chain's keys (`TODO/sketch-006`)
 * and the Esc that stands down an armed Set scale (`TODO/sketch-003`) or Auto-trace
 * (`TODO/sketch-004`).
 *
 * Moved out of `Viewport.vue` without a behaviour change. The text-entry test is injected, so
 * this module imports nothing from the composables layer.
 *
 * @module render/sketchChainKeys
 */

/**
 * @typedef {object} SketchChainKeysDeps
 * @property {() => boolean} isSketching Is the sketch editor open?
 * @property {any} sketchEditor The sketch editor store.
 * @property {(target: EventTarget | null) => boolean} isTextEntry Is the target a text field?
 * @property {() => void} redraw Redraw the chain and schedule a frame; called when the key was handled.
 */

/**
 * Create the `keydown` handler.
 *
 * The Line chain's keys: Esc finishes (twice in a row cancels), Enter finishes, Backspace removes
 * the last point. They act only while the Line is armed with a chain live (Esc also for the
 * "twice" window), never in a text field, and mark the event handled so the app-wide
 * Backspace-deletes-the-selection shortcut stands down.
 *
 * @param {SketchChainKeysDeps} deps
 * @returns {(event: KeyboardEvent) => void}
 */
export function createSketchChainKeys(deps) {
  const { sketchEditor } = deps
  return function onSketchChainKey(event) {
    const sketching = deps.isSketching()
    // Esc stands an armed Set scale down — from the length field too.
    if (sketching && sketchEditor.imageTool === 'scale' && event.key === 'Escape' && !event.repeat) {
      event.preventDefault()
      sketchEditor.cancelScale()
      return
    }
    // …and an armed Auto-trace, keeping what it traced.
    if (sketching && sketchEditor.imageTool === 'trace' && event.key === 'Escape' && !event.repeat) {
      event.preventDefault()
      sketchEditor.finishTrace()
      return
    }
    if (!sketching || sketchEditor.tool !== 'line') return
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
    if (deps.isTextEntry(event.target)) return
    if (event.key === 'Escape') {
      if (event.repeat) return
      if (sketchEditor.escapeChain() !== 'none') event.preventDefault()
    } else if (event.key === 'Enter') {
      // Enter on a focused button is that button's click, not "finish".
      if (typeof HTMLElement !== 'undefined' && event.target instanceof HTMLElement && event.target.closest('button, a, [role="button"]')) return
      if (!sketchEditor.chainLive) return
      event.preventDefault()
      sketchEditor.finishChain()
    } else if (event.key === 'Backspace' && !event.shiftKey) {
      if (!sketchEditor.chainLive) return
      event.preventDefault()
      sketchEditor.undoPoint()
    }
    if (event.defaultPrevented) deps.redraw()
  }
}
