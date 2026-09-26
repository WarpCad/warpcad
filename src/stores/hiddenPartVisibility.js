/**
 * Which bodies currently show their hidden parts translucent (`TODO/ui-047`) —
 * **UI-only view state**, exactly the kind CLAUDE.md says Pinia is for (selection,
 * active tool, panel layout): not a document record, not an Undo step, the same
 * status the camera and the colour picker's live preview already have.
 *
 * ## Scope: per body, persistent for the session (the TODO's own recommendation)
 *
 * A `Set` of body ids rather than a single flag means turning a bolt's clearance on
 * survives deselecting it — the worked example this task ships is "see a bolt's
 * clearance while positioning a shell around it with the bolt deselected", which a
 * flag scoped to "only while selected" cannot do at all. It survives for the whole
 * session (this store's own lifetime), not just one page view: nothing here reads
 * or writes `localStorage`, so a reload starts every body hidden again, the same as
 * every other transient UI store in this file (`colorPreview.js`, `transformPreview.js`).
 *
 * A body id left in the set after that body is deleted is inert, not a leak worth
 * guarding against: nothing ever looks it up except by an id a live body actually
 * has, and the set holds plain strings, not geometry.
 *
 * @module stores/hiddenPartVisibility
 */

import { defineStore } from 'pinia'
import { reactive } from 'vue'

export const useHiddenPartVisibilityStore = defineStore('hiddenPartVisibility', () => {
  /** @type {Set<string>} Body ids whose hidden parts are currently drawn. */
  const shown = reactive(new Set())

  /**
   * @param {string} bodyId
   * @returns {boolean}
   */
  function isShown(bodyId) {
    return shown.has(bodyId)
  }

  /** @param {string} bodyId */
  function show(bodyId) {
    shown.add(bodyId)
  }

  /** @param {string} bodyId */
  function hide(bodyId) {
    shown.delete(bodyId)
  }

  /** @param {string} bodyId */
  function toggle(bodyId) {
    if (shown.has(bodyId)) shown.delete(bodyId)
    else shown.add(bodyId)
  }

  return { shown, isShown, show, hide, toggle }
})
