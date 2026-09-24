/**
 * The one adapter between a Parameters-field edit and the document.
 *
 * Mirrors `useTransformCommands.js` exactly in shape — the record-building is
 * framework-free in `src/core/paramEdit.js`, and this is the thin reactive layer
 * that hands the result to the document store — but it has one thing that file
 * does not, and it is the whole reason this module exists rather than being two
 * lines in `Inspector.vue`:
 *
 * ## Three appends, in one order, as one undo step
 *
 * A rebuilt creation record ignores every record before it (`paramEdit.js`'s own
 * module doc), so a body that had been moved and turned comes back at its
 * creation params' own spot, un-turned. Restoring the pose is two more appends:
 *
 * 1. the rebuilt creation record,
 * 2. `rotateToRecord(...)` back to the pre-edit absolute rotation, then
 * 3. `moveToRecord(...)` back to the pre-edit absolute position.
 *
 * **Rotate before move, never the other way round.** `rotateRecord` turns a body
 * about its own *bounding-box centre*, and for anything that is not symmetric
 * about that point the box's centre moves when the solid turns. Restoring the
 * position last is what makes the final measured centre land exactly on the
 * pre-edit one instead of near it — and "near it" is the silent-drift failure
 * `TODO/ui-029` names ("editing a param must not silently snap the body back to
 * the origin"), just smaller.
 *
 * Both are `transform.js`'s own absolute-target builders, the same two a typed
 * Position or Rotation field already calls. Nothing here composes a pose itself;
 * a second implementation of that arithmetic is exactly what `transform.js`'s
 * module doc exists to prevent.
 *
 * All three go through one `documentStore.batch` (`TODO/ui-044`), so they are one
 * Undo step labelled `Edit <body>`. Committed separately they were two or three,
 * and one press of Undo left the body at its creation spot with the new params, a
 * state the user never made. `appendAll` cannot do this: the rotate-back and
 * move-back are measured against the rebuilt body, so each record can only be
 * built once the one before it has folded, which `batch` allows.
 *
 * ## Failing safe
 *
 * The guard is re-checked here before anything is built, even though the panel
 * has already greyed the fields out: `TODO/ui-029`'s named failure mode is
 * silent loss of a downstream op's effect, and a guard that lives only in a
 * component is one `v-if` away from not being a guard. `paramEditRecord` checks
 * it a third time, inside `core/`, for the same reason.
 *
 * A kernel validation error (a diameter of `0` hitting `requirePositive`) is
 * *thrown to the caller* rather than swallowed, so the Inspector can show it —
 * the same user-facing kernel-error contract `ui-027` established for the
 * Fillet/Chamfer popover, reused here rather than reinvented. `batch` is atomic,
 * so a rejected edit leaves the document and the undo stack exactly as they were,
 * whichever of the three records refused.
 *
 * @module composables/useParamCommands
 */

import { canEditParams, paramEditRecord, currentParamsOf, withComponent } from '../core/paramEdit.js'
import { moveToRecord, positionOf, rotateToRecord, rotationOf } from '../core/transform.js'
import { useDocumentStore } from '../stores/document.js'

/** @typedef {import('../core/paramEdit.js').ParamEditability} ParamEditability */

/**
 * @returns {{
 *   canEdit: (bodyId: string) => ParamEditability,
 *   setParam: (bodyId: string, key: string, value: number) => void,
 *   setParamComponent: (bodyId: string, key: string, index: number, value: number) => void,
 * }}
 */
export function useParamCommands() {
  const documentStore = useDocumentStore()

  /**
   * Rebuild one body's creation record with new params, then put it back where
   * it was. See the module doc for why the order is rotate-then-move.
   *
   * @param {string} bodyId
   * @param {Record<string, number | readonly number[]>} changes
   * @returns {void}
   */
  function applyChanges(bodyId, changes) {
    const raw = documentStore.raw
    // Fail safe, not loud-after-the-fact: a lineage carrying a fillet, a chamfer
    // or anything else non-transform is left exactly as it was.
    if (!canEditParams(raw, bodyId).editable) return

    const record = paramEditRecord(raw, bodyId, changes)
    if (record === null) return

    // Measured *before* the rebuild, off the evaluated geometry — the same two
    // numbers the Transform fields are showing, so a param edit and a typed
    // Position can never disagree about where the body is.
    const positionMm = positionOf(raw, bodyId)
    const rotationDeg = rotationOf(raw, bodyId)

    // Every mutation goes through the command layer inside an origin-tagged
    // transaction (CLAUDE.md Architecture); `'local'` because the trigger is this
    // user's own typing. May throw (a diameter of 0, a kernel range check); the
    // batch then leaves everything as it was and the caller shows the message.
    documentStore.batch(
      (commit) => {
        commit(record)

        if (rotationDeg.some((deg) => deg !== 0)) {
          commit(rotateToRecord(raw, bodyId, rotationDeg))
        }
        // Re-measured rather than assumed: the rebuilt solid is a different size,
        // and the rotation above may have shifted its bounding-box centre, so this
        // asks where the body *is now* before deciding how far it has to go back.
        const rebuiltMm = positionOf(raw, bodyId)
        if (rebuiltMm.some((mm, index) => mm !== positionMm[index])) {
          commit(moveToRecord(raw, bodyId, positionMm))
        }
      },
      { origin: 'local' }
    )
  }

  return {
    /**
     * Whether this body's Parameters fields may be offered as editable at all,
     * and — when they may not — the op that stands in the way, so the panel can
     * say which one rather than just refusing.
     */
    canEdit(bodyId) {
      return canEditParams(documentStore.raw, bodyId)
    },

    /** Commit one typed scalar param: a diameter, a height. */
    setParam(bodyId, key, value) {
      applyChanges(bodyId, { [key]: value })
    },

    /** Commit one typed component of a vector param: Size X, Side B. */
    setParamComponent(bodyId, key, index, value) {
      const raw = documentStore.raw
      const current = currentParamsOf(raw, bodyId)[key]
      applyChanges(bodyId, { [key]: withComponent(current, index, value) })
    },
  }
}
