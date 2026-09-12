/**
 * The endpoint position a sketch-handle drag is *proposing* — UI state, not
 * document state.
 *
 * The 2D counterpart of `src/stores/transformPreview.js`, and it exists for the
 * identical reason: section 7's Q14 requires the Inspector's start/end/length
 * fields to track a handle drag **live**, and the obvious way to get that —
 * appending a superseding `sketch.line` record on every `pointermove` — would
 * leave sixty records in the log and sixty steps in a future undo stack for what
 * the user experienced as one gesture.
 *
 * So the drag holds its proposed endpoint here, the overlay draws from it, the
 * Inspector reads from it, and exactly one record is appended on release.
 * Nothing here is ever persisted or replayed.
 *
 * Scalar refs rather than an array ref, deliberately: a `pointermove` writes
 * numbers into existing refs and allocates nothing (CLAUDE.md's Performance
 * rule about the pointer path).
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useSketchPreviewStore = defineStore('sketchPreview', () => {
  /** Lineage-root id of the entity being dragged, or `''` when none is. */
  const entityId = ref('')
  /** @type {import('vue').Ref<'start' | 'end'>} */
  const which = ref('start')
  const xMm = ref(0)
  const yMm = ref(0)

  /**
   * @param {string} id Lineage-root id.
   * @param {'start' | 'end'} endpoint
   * @param {number} startXMm Where that endpoint is right now, so the first
   *   frame of the drag draws the line exactly where it already was.
   * @param {number} startYMm
   * @returns {void}
   */
  function begin(id, endpoint, startXMm, startYMm) {
    entityId.value = id
    which.value = endpoint
    xMm.value = startXMm
    yMm.value = startYMm
  }

  /**
   * @param {number} nextXMm
   * @param {number} nextYMm
   * @returns {void}
   */
  function setPoint(nextXMm, nextYMm) {
    xMm.value = nextXMm
    yMm.value = nextYMm
  }

  function clear() {
    entityId.value = ''
  }

  return {
    entityId,
    which,
    xMm,
    yMm,
    isActive: computed(() => entityId.value !== ''),
    begin,
    setPoint,
    clear,
  }
})
