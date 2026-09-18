/**
 * The in-flight drag-placement gesture — the state the Library panel and the
 * viewport have to agree about while a row is being dragged across them.
 *
 * ## One mechanism, one input path
 *
 * `TODO/ui-010`'s Proposed fix sketched HTML5 drag-and-drop for mouse plus pointer
 * events for touch, converging on shared commit logic. This implements the
 * stronger version of the same requirement: **pointer events only**, for mouse,
 * touch and pen alike. `pointerdown`/`pointermove`/`pointerup` already cover every
 * input type, HTML5 DnD has no reliable touch equivalent (which is why the two
 * paths were proposed in the first place), and one path cannot drift from itself.
 * This is the same call `render-001` made for camera input — drag and on-screen
 * chrome drive one camera model, not two.
 *
 * ## Why the pointer position is not reactive
 *
 * `move` runs on every `pointermove`. CLAUDE.md's Performance section forbids
 * per-frame allocation and Vue deep-reactivity in the pointer path, so the live
 * position lives in a plain object and reaches subscribers through a callback.
 * The reactive refs (`op`, `label`, `isDragging`) change at most twice per gesture
 * — on begin and on end — so they never push a DOM update per pointer event.
 *
 * ## Who decides what a drop means
 *
 * The viewport registers itself as the drop target. It is the only thing that
 * knows its own rect, its camera, and how to project a screen point onto the
 * working plane, so hit-testing and committing live behind that interface rather
 * than being re-derived here.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * @typedef {object} DropTarget
 * @property {(clientXPx: number, clientYPx: number) => boolean} contains
 * @property {(op: string, clientXPx: number, clientYPx: number, overrides: Record<string, any>) => void} preview
 * @property {() => void} clearPreview
 * @property {(op: string, clientXPx: number, clientYPx: number, overrides: Record<string, any>) => string | null} commit
 *   Returns the new body's id, or `null` if the drop could not be placed.
 */

/**
 * The payload of a drag with nothing chosen on it — every row but the two
 * model-parameterised ones. Shared and frozen rather than a fresh `{}` per
 * gesture, so the common case allocates nothing and cannot be mutated by a
 * subscriber.
 */
const NO_OVERRIDES = Object.freeze({})

export const usePlacementStore = defineStore('placement', () => {
  const op = ref('')
  const label = ref('')
  const isDragging = computed(() => op.value !== '')

  // Non-reactive live gesture state — see the module comment.
  const pointer = { x: 0, y: 0, overTarget: false }

  /**
   * The variant chosen on the row before this drag started (`TODO/ui-031`) — a
   * Raspberry Pi's `model`, and nothing at all for every other row.
   *
   * Part of the gesture's payload alongside `op`, not a second gesture: the row's
   * `<select>` is read once, at `begin`, and the same object then reaches the
   * preview and the commit, so the board being previewed cannot be a different
   * model from the board being placed. Non-reactive and plain for the same reason
   * `pointer` is — it changes at most once per gesture and is read inside the
   * pointer path.
   *
   * @type {Record<string, any>}
   */
  let overrides = NO_OVERRIDES

  /** @type {DropTarget | null} */
  let target = null
  /** @type {Set<() => void>} */
  const listeners = new Set()

  function notify() {
    for (const listener of listeners) listener()
  }

  /**
   * Subscribe to pointer movement during a drag. Returns an unsubscribe function.
   *
   * @param {() => void} listener
   * @returns {() => void}
   */
  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  /**
   * Register the viewport as the drop target. Returns a disposer.
   *
   * @param {DropTarget} dropTarget
   * @returns {() => void}
   */
  function registerTarget(dropTarget) {
    target = dropTarget
    return () => {
      if (target === dropTarget) target = null
    }
  }

  /**
   * @param {number} clientXPx
   * @param {number} clientYPx
   */
  function track(clientXPx, clientYPx) {
    pointer.x = clientXPx
    pointer.y = clientYPx
    const inside = target ? target.contains(clientXPx, clientYPx) : false
    pointer.overTarget = inside
    if (!target) return
    if (inside) target.preview(op.value, clientXPx, clientYPx, overrides)
    else target.clearPreview()
  }

  /**
   * Start dragging a Library row.
   *
   * @param {string} nextOp Registry key — the bulk of the payload of the gesture.
   * @param {string} nextLabel Human name, for the icon that follows the pointer.
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @param {Record<string, any>} [nextOverrides] The variant chosen on the row, if
   *   it has one to choose (`TODO/ui-031`). Read once, here, and used for both the
   *   preview and the commit.
   * @returns {void}
   */
  function begin(nextOp, nextLabel, clientXPx, clientYPx, nextOverrides = NO_OVERRIDES) {
    op.value = nextOp
    label.value = nextLabel
    overrides = nextOverrides
    track(clientXPx, clientYPx)
    notify()
  }

  /**
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {void}
   */
  function move(clientXPx, clientYPx) {
    if (!op.value) return
    track(clientXPx, clientYPx)
    notify()
  }

  function finish() {
    op.value = ''
    label.value = ''
    // Cleared with the rest of the gesture: a variant left standing would be
    // handed to the *next* drag, which may well be a row that has no such param.
    overrides = NO_OVERRIDES
    pointer.overTarget = false
    notify()
  }

  /**
   * Release: commit if the pointer is over the viewport, otherwise cancel.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {string | null} New body id, or `null` when nothing was placed.
   */
  function drop(clientXPx, clientYPx) {
    if (!op.value) return null
    track(clientXPx, clientYPx)
    const placed =
      pointer.overTarget && target
        ? target.commit(op.value, clientXPx, clientYPx, overrides)
        : null
    target?.clearPreview()
    finish()
    return placed
  }

  /** Abandon the gesture without placing anything (pointercancel, Escape). */
  function cancel() {
    if (!op.value) return
    target?.clearPreview()
    finish()
  }

  return {
    op,
    label,
    isDragging,
    /** Live, non-reactive pointer state. Read it in a subscriber, not a template. */
    pointer,
    subscribe,
    registerTarget,
    begin,
    move,
    drop,
    cancel,
  }
})
