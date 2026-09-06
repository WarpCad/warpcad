/**
 * The UI's handle on the document.
 *
 * Deliberately thin. CLAUDE.md is explicit that Pinia holds **UI state only** and
 * that document state "lives wherever the document/sync decision lands, never
 * mirrored into Pinia". So the real log lives in `src/core/document.js` as a plain,
 * non-reactive value, and this store holds only what a component needs to *react*
 * to: a version counter and a small plain-data summary of the placed bodies.
 *
 * What is emphatically **not** reactive here is geometry. `bodies()` returns
 * kernel solids with multi-thousand-element vertex arrays, and CLAUDE.md's
 * Performance section calls Vue deep-reactivity over those a performance bug — so
 * geometry is only ever read imperatively, through {@link useDocumentStore}'s
 * `raw` handle, by the renderer.
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { createDocument } from '../core/document.js'

/** @typedef {import('../core/document.js').Body} Body */
/** @typedef {import('../core/kernel/registry.js').OpRecord} OpRecord */

/**
 * @typedef {object} BodySummary
 * @property {string} id
 * @property {string} name
 * @property {string} op
 * @property {[number, number, number]} center Millimetres, Z-up.
 */

export const useDocumentStore = defineStore('document', () => {
  // Plain and non-reactive on purpose — see the module comment.
  const raw = createDocument()

  const version = ref(0)
  /** @type {import('vue').ShallowRef<BodySummary[]>} */
  const bodies = shallowRef(/** @type {BodySummary[]} */ ([]))

  function refresh() {
    bodies.value = raw.bodies().map((body) => ({
      id: body.id,
      name: body.name,
      op: body.op,
      center: /** @type {[number, number, number]} */ (body.params.center ?? [0, 0, 0]),
    }))
    version.value = raw.version
  }

  /**
   * Append one record, origin-tagged. The only way a component is allowed to
   * change the document (CLAUDE.md: "never mutate document state directly from a
   * component — that breaks undo").
   *
   * @param {OpRecord} record
   * @param {{ origin?: string }} [transaction]
   * @returns {OpRecord}
   */
  function append(record, transaction = {}) {
    raw.append(record, { origin: transaction.origin ?? 'local' })
    refresh()
    return record
  }

  return {
    raw,
    version,
    bodies,
    count: computed(() => bodies.value.length),
    append,
    refresh,
  }
})
