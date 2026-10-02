// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The colour a picker is *proposing* — UI state, not document state (`TODO/ui-037`).
 *
 * A native `<input type="color">` fires `input` continuously while its picker is
 * open and `change` once when the user settles on a colour. Writing a
 * `style.recolor` record per `input` would leave dozens of records and dozens of
 * Undo steps for what the user experienced as one pick — exactly the failure
 * `transformPreview.js` exists to prevent for a gizmo drag, and solved the same
 * way: the running value lives here, the viewport paints it straight onto the
 * mesh, and exactly one record is committed on `change`
 * (`src/composables/useColorCommands.js`), clearing this in the same breath.
 *
 * Three scalar refs, so an `input` event writes numbers into existing refs and
 * allocates nothing.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useColorPreviewStore = defineStore('colorPreview', () => {
  /** Lineage-root id of the body being previewed, or `''` when nothing is. */
  const bodyId = ref('')
  /** The drilled-into part being previewed, or `''` for the whole body. */
  const subPart = ref('')
  /** `0xRRGGBB`. Meaningless while {@link bodyId} is `''`. */
  const color = ref(0)

  /**
   * Show `nextColor` on a body (or one part of it) without touching the document.
   *
   * @param {string} id Lineage-root id.
   * @param {number} nextColor `0xRRGGBB`.
   * @param {string} [part] Named sub-part, or omitted for the whole body.
   * @returns {void}
   */
  function set(id, nextColor, part) {
    bodyId.value = id
    subPart.value = part ?? ''
    color.value = nextColor
  }

  /** Stop previewing: the committed document state is what draws again. */
  function clear() {
    bodyId.value = ''
    subPart.value = ''
    color.value = 0
  }

  return { bodyId, subPart, color, isActive: computed(() => bodyId.value !== ''), set, clear }
})
