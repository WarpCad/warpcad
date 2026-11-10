// SPDX-License-Identifier: AGPL-3.0-or-later
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
 *
 * ## The armed session (`TODO/ui-107`)
 *
 * **File → Import model…** has no drag already under way: the file was picked from a menu. It
 * {@link arm}s a session instead — the same op, the same ghost and the same drop target, but no
 * pointer yet. {@link hover} moves the ghost (the first one sets the position; the viewport's
 * session layer starts it at the centre of the view, for touch), {@link commitArmed} commits it
 * where the click or the lifted finger is, and {@link cancel} ends it with nothing added. What a
 * commit *does* is the session's own `place` callback, handed to the target with the snapped
 * point, so the import's one transaction is the importer's business, not this store's. A file
 * dropped on the view is a one-shot {@link placeAt}: no session, the drop point is the point.
 *
 * `isDragging` stays "a Library row is being dragged" — the drag icon, the Library's tier hold
 * and the hosted-conflict deferral read it — and {@link isPlacing} is either kind of placement.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * @typedef {object} DropTarget
 * @property {(clientXPx: number, clientYPx: number) => boolean} contains
 * @property {(op: string, clientXPx: number, clientYPx: number, overrides: Record<string, any>) => void} preview
 * @property {() => void} clearPreview
 * @property {(op: string, clientXPx: number, clientYPx: number, overrides: Record<string, any>, place?: PlaceFn) => string | null} commit
 *   Returns the new body's id, or `null` if the drop could not be placed. With `place`, the
 *   target resolves the snapped point and hands it to `place` instead of appending the drop
 *   records itself (`TODO/ui-107`).
 */

/**
 * What an armed session's commit does with the snapped point on the working plane, in mm.
 *
 * @callback PlaceFn
 * @param {{ x: number, y: number }} pointMm
 * @returns {string | null} The new body's id, or `null` when nothing was placed.
 */

/**
 * @typedef {object} ArmOptions
 * @property {PlaceFn} place Commits the placement.
 * @property {(outcome: { placed: string | null }) => void} [onEnd] Called once when the session
 *   ends, committed or cancelled.
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
  /** An armed session (`TODO/ui-107`) rather than a drag: started from a menu, with no pointer. */
  const armed = ref(false)
  const isDragging = computed(() => op.value !== '' && !armed.value)
  const isPlacing = computed(() => op.value !== '')
  /** @type {ArmOptions | null} The armed session's callbacks; plain, set once per session. */
  let session = null

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
    // A Library drag started while an import waits to be placed ends that session first.
    if (armed.value) cancel()
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
    const ended = session
    session = null
    armed.value = false
    op.value = ''
    label.value = ''
    // Cleared with the rest of the gesture: a variant left standing would be
    // handed to the *next* drag, which may well be a row that has no such param.
    overrides = NO_OVERRIDES
    pointer.overTarget = false
    notify()
    return ended
  }

  /**
   * Release: commit if the pointer is over the viewport, otherwise cancel.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {string | null} New body id, or `null` when nothing was placed.
   */
  function drop(clientXPx, clientYPx) {
    if (!op.value || armed.value) return null
    track(clientXPx, clientYPx)
    const placed =
      pointer.overTarget && target
        ? target.commit(op.value, clientXPx, clientYPx, overrides)
        : null
    target?.clearPreview()
    finish()
    return placed
  }

  /** Abandon the gesture or the armed session without placing anything (pointercancel, Escape, Cancel). */
  function cancel() {
    if (!op.value) return
    target?.clearPreview()
    finish()?.onEnd?.({ placed: null })
  }

  /**
   * Start an armed placement session (`TODO/ui-107`): no pointer yet, so no preview until the
   * first {@link hover}. A drag or another session already under way is cancelled first.
   *
   * @param {string} nextOp The registered op to preview and place.
   * @param {string} nextLabel What the chip names, e.g. the file name.
   * @param {ArmOptions} options
   * @returns {void}
   */
  function arm(nextOp, nextLabel, options) {
    cancel()
    session = options
    armed.value = true
    op.value = nextOp
    label.value = nextLabel
    overrides = NO_OVERRIDES
    pointer.overTarget = false
    notify()
  }

  /**
   * Move an armed session's ghost. Allocates nothing: the shared pointer object and the target.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {void}
   */
  function hover(clientXPx, clientYPx) {
    if (!armed.value) return
    track(clientXPx, clientYPx)
    notify()
  }

  /**
   * Commit an armed session at a click or a lifted finger. Over the view, the target resolves the
   * snapped point and the session's `place` commits; the session then ends. Anywhere else — or
   * where the pointer meets no point on the plane — nothing is placed and the session stays armed.
   *
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @returns {string | null} The new body's id, or `null`.
   */
  function commitArmed(clientXPx, clientYPx) {
    if (!armed.value || session === null) return null
    track(clientXPx, clientYPx)
    if (!pointer.overTarget || !target) return null
    const placed = target.commit(op.value, clientXPx, clientYPx, overrides, session.place)
    if (placed === null) return null
    target.clearPreview()
    finish()?.onEnd?.({ placed })
    return placed
  }

  /**
   * A one-shot placement at a point, with no session: a model file dropped on the view.
   *
   * @param {string} placeOp
   * @param {number} clientXPx
   * @param {number} clientYPx
   * @param {PlaceFn} place
   * @returns {string | null}
   */
  function placeAt(placeOp, clientXPx, clientYPx, place) {
    if (!target || !target.contains(clientXPx, clientYPx)) return null
    const placed = target.commit(placeOp, clientXPx, clientYPx, NO_OVERRIDES, place)
    target.clearPreview()
    return placed
  }

  return {
    op,
    label,
    armed,
    isDragging,
    isPlacing,
    /** Live, non-reactive pointer state. Read it in a subscriber, not a template. */
    pointer,
    subscribe,
    registerTarget,
    begin,
    move,
    drop,
    cancel,
    arm,
    hover,
    commitArmed,
    placeAt,
  }
})
