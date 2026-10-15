// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Which reference — the whole object, or one named part — the Inspector's
 * **Align to origin** row last measured a given body from, remembered **per
 * body for the session** (`TODO/ui-050`).
 *
 * UI-only view state, exactly the kind CLAUDE.md says Pinia is for (selection,
 * active tool, panel layout) — the same status `hiddenPartVisibility.js` has:
 * not a document record, not an Undo step, gone on reload. The document has no
 * opinion on which part a user last picked as a measuring reference, and it
 * must not: `src/core/transform.js`'s `alignToOriginRecord` takes a `partName`
 * as one call's own argument, so nothing here is replayed or persisted with
 * the document — it only saves the user re-picking `mb` every time they want
 * to align the same Raspberry Pi again in one sitting.
 *
 * A `Map<bodyId, partName | null>` rather than a single ref, for the same
 * reason `hiddenPartVisibility.js`'s `Set` is keyed by body id: switching the
 * selection to a different body and back must not lose what was picked for
 * the first one. `null` is a real, distinct value — "this body's remembered
 * reference is explicitly Whole object" — from "nothing has ever been picked
 * for this body" (a missing map entry), which is why {@link get} distinguishes
 * them rather than defaulting a missing key to `null` two different ways.
 *
 * @module stores/alignReference
 */

import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export const useAlignReferenceStore = defineStore('alignReference', () => {
  /** @type {Map<string, string | null>} bodyId -> partName, or null for "Whole object". */
  const reference = reactive(new Map())

  /**
   * The remembered reference for a body — a part name, or `null` for
   * "Whole object" (including "nothing has ever been picked for this body").
   *
   * @param {string} bodyId
   * @returns {string | null}
   */
  function get(bodyId) {
    return reference.get(bodyId) ?? null
  }

  /**
   * Remember a body's reference for the rest of the session.
   *
   * @param {string} bodyId
   * @param {string | null} partName `null` for "Whole object".
   */
  function set(bodyId, partName) {
    reference.set(bodyId, partName ?? null)
  }

  /**
   * Forget a body's remembered reference — used when a stored part name no
   * longer exists on the body's current group (an undo removed it, or a
   * param edit changed the part set), so the next render falls back to
   * "Whole object" rather than silently keep offering a stale name.
   *
   * @param {string} bodyId
   */
  function clear(bodyId) {
    reference.delete(bodyId)
  }

  /**
   * Forget every body's remembered reference — a new project reuses ids like `pi-1`, and a
   * stale entry must not apply to an unrelated body that happens to get the same id.
   */
  function reset() {
    reference.clear()
  }

  /**
   * The Align popover's Snap **Relation** (`TODO/ui-060`): `outside`, `inside` or `center`,
   * remembered for the session like the Reference above — UI-only, never in the document
   * (the record carries the resolved `orientation`, not this).
   *
   * @type {import('vue').Ref<'outside' | 'inside' | 'center'>}
   */
  const relation = ref(/** @type {'outside' | 'inside' | 'center'} */ ('outside'))

  /**
   * True while the Align popover is open on **World origin** with 2 bodies selected
   * (`TODO/ui-060`): only the first-picked body is involved then, so `Viewport.vue` drops the
   * second one's teal role colour. Owned by the popover, which clears it when it closes.
   *
   * @type {import('vue').Ref<boolean>}
   */
  const originOnly = ref(false)

  return { reference, get, set, clear, reset, relation, originOnly }
})
