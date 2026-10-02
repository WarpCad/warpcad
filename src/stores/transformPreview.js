// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The transform a gizmo drag is *proposing* — UI state, not document state.
 *
 * ## Why a live preview exists at all
 *
 * `docs/decisions/interaction-model-qa.md` control 4 requires the mesh and the
 * Inspector's numeric fields to move **during** a drag, "not only after release".
 * The obvious way to get that — append a `transform.*` record on every
 * `pointermove` — would write one document line per frame, so a two-second drag
 * would leave sixty records in the action log and sixty entries in a future undo
 * stack for what the user experienced as one gesture.
 *
 * So a drag holds its running delta here instead. Nothing in this store is ever
 * persisted or replayed: the viewport renders it straight onto the three.js mesh
 * object, and the Inspector adds it to the displayed numbers. Exactly one
 * `transform.*` record is appended, on `pointerup`, carrying the whole gesture's
 * delta (`src/core/transform.js`), and the preview clears in the same breath.
 *
 * CLAUDE.md is explicit that Pinia holds UI state only and that document state is
 * never mirrored into it. A proposed-but-uncommitted drag delta is precisely UI
 * state — the same category as "which tool is active" — so this is where it goes.
 *
 * Six scalar refs rather than two array refs, on purpose: a `pointermove` writes
 * numbers into existing refs and allocates nothing (CLAUDE.md's Performance rule
 * about the pointer path).
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useTransformPreviewStore = defineStore('transformPreview', () => {
  /**
   * Lineage-root id of the body being dragged, or `''` when nothing is.
   * @type {import('vue').Ref<string>}
   */
  const bodyId = ref('')

  const txMm = ref(0)
  const tyMm = ref(0)
  const tzMm = ref(0)
  const rxDeg = ref(0)
  const ryDeg = ref(0)
  const rzDeg = ref(0)

  /**
   * Begin previewing a drag on a body.
   *
   * @param {string} id Lineage-root id.
   * @returns {void}
   */
  function begin(id) {
    bodyId.value = id
    txMm.value = 0
    tyMm.value = 0
    tzMm.value = 0
    rxDeg.value = 0
    ryDeg.value = 0
    rzDeg.value = 0
  }

  /**
   * Set the running translation delta of the drag in progress.
   *
   * @param {number} xMm
   * @param {number} yMm
   * @param {number} zMm
   * @returns {void}
   */
  function setTranslate(xMm, yMm, zMm) {
    txMm.value = xMm
    tyMm.value = yMm
    tzMm.value = zMm
  }

  /**
   * Set the running rotation delta of the drag in progress, in degrees.
   *
   * @param {number} xDeg
   * @param {number} yDeg
   * @param {number} zDeg
   * @returns {void}
   */
  function setRotate(xDeg, yDeg, zDeg) {
    rxDeg.value = xDeg
    ryDeg.value = yDeg
    rzDeg.value = zDeg
  }

  function clear() {
    bodyId.value = ''
    txMm.value = 0
    tyMm.value = 0
    tzMm.value = 0
    rxDeg.value = 0
    ryDeg.value = 0
    rzDeg.value = 0
  }

  return {
    bodyId,
    txMm,
    tyMm,
    tzMm,
    rxDeg,
    ryDeg,
    rzDeg,
    isActive: computed(() => bodyId.value !== ''),
    begin,
    setTranslate,
    setRotate,
    clear,
  }
})
