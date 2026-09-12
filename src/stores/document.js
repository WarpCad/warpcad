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
import { boundsOf } from '../core/kernel/group.js'
import { lengthOf, lineFromParams } from '../sketch/entity.js'

/** @typedef {import('../core/document.js').Body} Body */
/** @typedef {import('../core/kernel/registry.js').OpRecord} OpRecord */

/**
 * @typedef {object} SketchEntitySummary
 * @property {string} id Lineage-root id — stable across endpoint edits.
 * @property {string} recordId
 * @property {string} name
 * @property {string} op
 * @property {[number, number]} startMm Millimetres on the Z=0 working plane.
 * @property {[number, number]} endMm
 * @property {number} lengthMm
 */

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
  /**
   * The document's sketch entities (`TODO/ui-020`), already parsed into the
   * shape the overlay and the Inspector read.
   *
   * Unlike `bodies` above, this genuinely *is* plain data all the way down —
   * four numbers per entity, no kernel geometry anywhere near it — so there is
   * no imperative-read caveat here. A malformed record (a document from an
   * untrusted URL) is dropped rather than rendered, per `lineFromParams`.
   *
   * @type {import('vue').ShallowRef<SketchEntitySummary[]>}
   */
  const sketchEntities = shallowRef(/** @type {SketchEntitySummary[]} */ ([]))

  function refresh() {
    sketchEntities.value = raw.sketchEntities().flatMap((entity) => {
      const line = lineFromParams(entity.id, entity.params)
      if (!line) return []
      return [
        {
          id: entity.id,
          recordId: entity.recordId,
          name: entity.name,
          op: entity.op,
          startMm: line.startMm,
          endMm: line.endMm,
          lengthMm: lengthOf(line.startMm, line.endMm),
        },
      ]
    })
    bodies.value = raw.bodies().map((body) => {
      // Measured off the evaluated geometry, not read out of the creation
      // record's `center` param. Once a body can be *moved* (`ui-012`), that
      // param stops describing where the body is — it is where the body was
      // first dropped — and this summary is what the scene list announces and
      // what specs assert a placement against. Same measurement, and the same
      // reasoning, as `src/core/inspector.js`'s Transform section.
      const [min, max] = boundsOf(body.geometry)
      return {
        id: body.id,
        name: body.name,
        op: body.op,
        center: /** @type {[number, number, number]} */ ([
          (min[0] + max[0]) / 2,
          (min[1] + max[1]) / 2,
          (min[2] + max[2]) / 2,
        ]),
      }
    })
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
    sketchEntities,
    count: computed(() => bodies.value.length),
    sketchCount: computed(() => sketchEntities.value.length),
    append,
    refresh,
  }
})
