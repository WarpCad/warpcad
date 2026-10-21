// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Library's drag-to-place gesture (`TODO/ui-010`, single-sourced for `TODO/ui-084`).
 *
 * `LibraryRow` is the only caller: the labelled column, the icon rail's tiles and the row pop-out
 * all render that one component, so a row placed from any of them is the same gesture, the same
 * payload and the same drop. Pointer events only — one path for mouse, touch and pen (see
 * `src/stores/placement.js`).
 *
 * The window listeners live in **module scope**, not in a component, on purpose: a tier change or
 * a closing pop-out can unmount the element the press started on while the finger is still down,
 * and the gesture must keep tracking until `pointerup` (`ui-079`'s "a drag in progress keeps
 * tracking"). There is only ever one pointer gesture at a time, so one set of listeners is enough.
 *
 * A **tile** defers the placement until the pointer has travelled past {@link LIBRARY_TAP_SLOP_PX};
 * a press released inside that slop is a tap, which opens the row's pop-out instead. A labelled row
 * begins placing on `pointerdown`, exactly as it always has.
 *
 * @module composables/useLibraryDrag
 */

import { useLibraryDefaultsStore } from '../stores/libraryDefaults.js'
import { usePlacementStore } from '../stores/placement.js'
import { useTimelineStore } from '../stores/timeline.js'

/** A press that travels no further than this is a tap — `Viewport.vue`'s own `CLICK_SLOP_PX`. */
export const LIBRARY_TAP_SLOP_PX = 5

/**
 * @typedef {object} LibraryDragOptions
 * @property {boolean} [deferUntilMoved] Begin placing only once the pointer leaves the tap slop.
 * @property {() => void} [onTap] A deferred press released inside the slop.
 * @property {() => void} [onBegin] The placement has begun.
 * @property {() => void} [onEnd] The gesture is over, however it ended.
 */

/**
 * The live gesture. Module-scope and non-reactive: it is read on every `pointermove`.
 *
 * @type {{
 *   row: import('../core/library.js').LibraryRow,
 *   startX: number,
 *   startY: number,
 *   began: boolean,
 *   options: LibraryDragOptions,
 *   placement: ReturnType<typeof usePlacementStore>,
 *   remembered: ReturnType<typeof useLibraryDefaultsStore>,
 * } | null}
 */
let gesture = null

/** @param {number} x @param {number} y */
function begin(x, y) {
  if (!gesture || gesture.began) return
  gesture.began = true
  const { row, placement, remembered } = gesture
  // The variant is read **here**, once, at the start of the placement — so the ghost and the
  // committed record are built from the same choice even if a dropdown changed mid-drag.
  placement.begin(row.op, row.label, x, y, remembered.overridesFor(row))
  gesture.options.onBegin?.()
}

/** @param {PointerEvent} event */
function onWindowPointerMove(event) {
  if (!gesture) return
  if (!gesture.began) {
    const travel = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY)
    if (travel <= LIBRARY_TAP_SLOP_PX) return
    begin(event.clientX, event.clientY)
    return
  }
  gesture.placement.move(event.clientX, event.clientY)
}

/** @param {PointerEvent} event */
function onWindowPointerUp(event) {
  const ended = gesture
  stopLibraryDrag()
  if (!ended) return
  if (ended.began) ended.placement.drop(event.clientX, event.clientY)
  else ended.options.onTap?.()
  ended.options.onEnd?.()
}

function onWindowPointerCancel() {
  const ended = gesture
  stopLibraryDrag()
  if (!ended) return
  if (ended.began) ended.placement.cancel()
  ended.options.onEnd?.()
}

/**
 * Remove the gesture's window listeners and forget it. Never commits or cancels a placement
 * itself; the pointer handlers above decide that.
 *
 * @returns {void}
 */
export function stopLibraryDrag() {
  gesture = null
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', onWindowPointerUp)
  window.removeEventListener('pointercancel', onWindowPointerCancel)
}

/**
 * Start a Library gesture from a `pointerdown` on a row or a tile.
 *
 * @param {PointerEvent} event
 * @param {import('../core/library.js').LibraryRow} row
 * @param {LibraryDragOptions} [options]
 * @returns {boolean} Whether a gesture started (left button / primary contact, no preview).
 */
export function startLibraryDrag(event, row, options = {}) {
  // Left button / primary contact only: a right-click or a middle-click must not start a
  // placement the user can't see themselves having started.
  if (event.button !== 0) return false
  // Belt and braces with the row's `disabled` attribute: a pointerdown can still arrive from a
  // synthetic event or a stale gesture, and a placement started during a preview would commit
  // against the wrong document (§14, point 3).
  if (useTimelineStore().previewing) return false
  event.preventDefault()
  stopLibraryDrag()
  gesture = {
    row,
    startX: event.clientX,
    startY: event.clientY,
    began: false,
    options,
    placement: usePlacementStore(),
    remembered: useLibraryDefaultsStore(),
  }
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', onWindowPointerUp)
  window.addEventListener('pointercancel', onWindowPointerCancel)
  if (!options.deferUntilMoved) begin(event.clientX, event.clientY)
  return true
}
