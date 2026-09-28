/**
 * What the pointer (or keyboard focus) is resting on in the Inspector's object list —
 * **UI only**, never the document (`TODO/ui-049`).
 *
 * The viewport reads this and paints the named body, or only the named part, in a hover
 * tint with its own x-ray twin, so a row in the list can be matched to geometry on the
 * canvas before anything is selected — including a body completely inside another, which
 * is exactly the body the list exists for (`TODO/ui-041`).
 *
 * ## One writer, change-rate writes
 *
 * Only the object list writes here in `ui-049` (viewport pointer-hover is a natural
 * follow-up that would reuse this store). `pointerenter` fires once per row, and
 * {@link setHover} refuses a repeat of the current target outright, so moving within a row
 * costs the viewport nothing: it repaints and swaps its hover twin only on a real change.
 *
 * ## Never stale
 *
 * A highlight on geometry the pointer is not over is a bug. The list clears the target on
 * `pointerleave` and when it unmounts (a selection change swaps the Inspector's content);
 * this store clears it itself when the hovered body leaves the live scene — undo, rollback,
 * a boolean that consumed it — because nothing in the list gets a `pointerleave` for a row
 * that simply stopped existing under a resting pointer.
 *
 * No document record and no Undo step: hovering is view state, like `ui-047`'s toggle.
 *
 * @module stores/hoverHighlight
 */

import { defineStore } from 'pinia'
import { shallowRef, watch } from 'vue'

import { useDocumentStore } from './document.js'
import { useTimelineStore } from './timeline.js'

/**
 * @typedef {object} HoverTarget
 * @property {string} bodyId A body's lineage-root id.
 * @property {string | null} partName One part of that body, or `null` for the whole body.
 */

export const useHoverHighlightStore = defineStore('hoverHighlight', () => {
  const documentStore = useDocumentStore()
  const timeline = useTimelineStore()

  /**
   * The hovered target, or `null`. A `shallowRef` holding a fresh frozen object per change,
   * so a reader can compare by identity and a repeat write is visibly *not* a change.
   *
   * @type {import('vue').ShallowRef<Readonly<HoverTarget> | null>}
   */
  const target = shallowRef(null)

  /** The scene the list is showing: a History preview's prefix, else the live one. */
  function announcedBodies() {
    return timeline.previewBodies ?? documentStore.bodies
  }

  /**
   * Hover a body, or one part of it.
   *
   * @param {string} bodyId
   * @param {string | null} [partName]
   * @returns {boolean} Whether the target changed — `false` for a repeat of the current
   *   target, and for a body the scene does not contain.
   */
  function setHover(bodyId, partName = null) {
    const current = target.value
    if (current && current.bodyId === bodyId && current.partName === partName) return false
    if (!announcedBodies().some((body) => body.id === bodyId)) return false
    target.value = Object.freeze({ bodyId, partName })
    return true
  }

  /**
   * Clear the hover — only if it is still `match`, when one is given. One row's `leave`
   * can arrive after the next row's `enter` (a pointer crossing nested rows, or focus
   * moving between them), and it must not wipe out the row that is now under the pointer.
   *
   * @param {HoverTarget} [match]
   * @returns {void}
   */
  function clearHover(match) {
    const current = target.value
    if (!current) return
    if (match && (current.bodyId !== match.bodyId || current.partName !== (match.partName ?? null))) return
    target.value = null
  }

  // A body that leaves the live scene takes its highlight with it. Synchronous, so no frame
  // is ever painted with a tint aimed at a body the viewport has just removed.
  watch(
    () => documentStore.bodies,
    (live) => {
      const current = target.value
      if (!current) return
      const body = live.find((candidate) => candidate.id === current.bodyId)
      // The body left the scene (a delete, an undo of its placement), or — since
      // `TODO/ui-051`'s Remove part — the body stayed but the hovered part did not.
      const partGone =
        body !== undefined &&
        current.partName !== null &&
        ![...(body.partNames ?? []), ...(body.hiddenPartNames ?? [])].includes(current.partName)
      if (body === undefined || partGone) target.value = null
    },
    { flush: 'sync' },
  )

  return { target, setHover, clearHover }
})
