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
import { boundsOf, hasNamedParts, volumeOf } from '../core/kernel/group.js'
import { lengthOf, lineFromParams } from '../sketch/entity.js'
import { useSelectionStore } from './selection.js'

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
 * @property {[[number, number, number], [number, number, number]]} bounds
 *   World-axis-aligned `[min, max]`, millimetres — added by `TODO/ui-027`,
 *   keeping the two corners `center` was already averaging away rather than
 *   discarding them.
 * @property {number} volumeMm3 Also added by `TODO/ui-027`: a rim fillet/
 *   chamfer deliberately leaves `bounds` unchanged (`fillet.js`'s own module
 *   doc and `fillet.spec.js`'s "leaves the bounding box alone" case), so this
 *   is what an e2e spec actually checks to confirm rim material was removed.
 * @property {string[]} partNames The body's **visible** named parts in group order, or
 *   `[]` for a bare solid (`TODO/ui-042`). Non-empty exactly when the body is drawn
 *   part-by-part (`hasNamedParts` — the condition `createBodyObject` uses), which is what
 *   makes it a composite the Objects list can expand and a boolean can address.
 * @property {string[]} hiddenPartNames Parts that exist in the group but are absent from
 *   `names` — a tap-clearance solid, a Raspberry Pi's mounting holes. Still addressable
 *   (`pieces` resolves against every part), which is exactly why the Objects list shows
 *   them. `[]` whenever {@link BodySummary.partNames} is.
 */
/**
 * One evaluated body as the plain, non-geometry summary the DOM and the specs
 * read.
 *
 * Exported since `TODO/ui-032`, which needs the *previewed* document summarised
 * the same way the live one is. Sharing the function rather than the shape is
 * the point: two mappings would let the scene list and the preview disagree
 * about what a body's centre is, and "the readout contradicts the picture" is
 * the failure class this project's Verification section exists for.
 *
 * @param {import('../core/document.js').Body} body
 * @returns {BodySummary}
 */
export function summarizeBody(body) {
  // Measured off the evaluated geometry, not read out of the creation record's
  // `center` param. Once a body can be *moved* (`ui-012`), that param stops
  // describing where the body is — it is where the body was first dropped — and
  // this summary is what the scene list announces and what specs assert a
  // placement against. Same measurement, and the same reasoning, as
  // `src/core/inspector.js`'s Transform section.
  const [min, max] = boundsOf(body.geometry)
  const geometry = body.geometry
  const composite = hasNamedParts(geometry)
  return {
    id: body.id,
    name: body.name,
    op: body.op,
    center: /** @type {[number, number, number]} */ ([
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]),
    bounds: /** @type {[[number, number, number], [number, number, number]]} */ ([min, max]),
    volumeMm3: volumeOf(body.geometry),
    partNames: composite ? [...geometry.names] : [],
    hiddenPartNames: composite
      ? Object.keys(geometry.parts).filter((name) => !geometry.names.includes(name))
      : [],
  }
}

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

  /**
   * Whether each control is enabled, and what it says it will do — the two
   * things `HistoryControls.vue` reads (`TODO/data-003`).
   *
   * Plain refs updated in {@link refresh} rather than `computed`s over `raw`,
   * because `raw` is deliberately non-reactive (see the module comment): a
   * computed reading `raw.canUndo()` would never re-evaluate.
   */
  const canUndo = ref(false)
  const canRedo = ref(false)
  const undoLabel = ref('')
  const redoLabel = ref('')
  /**
   * Bumped each time a whole document is *loaded* (autosave restore, Open) as
   * opposed to edited. The viewport frames the camera on it: a loaded project
   * whose geometry sits outside the default view would otherwise read as an empty
   * scene — the same class of defect as the second attempt's "too dark to see
   * anything" (`interaction-model-qa.md` §10). Edits deliberately do not move it.
   */
  const loadRevision = ref(0)


  function refresh() {
    canUndo.value = raw.canUndo()
    canRedo.value = raw.canRedo()
    undoLabel.value = raw.pendingUndo()?.label ?? ''
    redoLabel.value = raw.pendingRedo()?.label ?? ''
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
    bodies.value = raw.bodies().map(summarizeBody)
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
    appendAll([record], transaction)
    return record
  }

  /**
   * Append several records as **one undoable step** — a composite placement is
   * its recipe record plus the translate that drops it (`ui-030`), and section
   * 19's granularity rule is one *user action*, not one record.
   *
   * @param {readonly OpRecord[]} records
   * @param {{ origin?: string, label?: string }} [transaction]
   * @returns {readonly OpRecord[]}
   */
  function appendAll(records, transaction = {}) {
    const origin = transaction.origin ?? 'local'
    raw.appendAll(records, {
      origin,
      label: transaction.label,
      // The selection as it stood *before* the mutation, parked on the step so
      // undo can put it back (section 19: "the selection that existed before the
      // undone action is restored"). Captured here, in the one place every
      // mutation already funnels through, rather than at each of the half-dozen
      // call sites — which is also why this store reaches for the selection
      // store at all. `src/core/document.js` stays framework-free and treats the
      // whole thing as opaque `meta`.
      meta: origin === 'local' ? { selectionBefore: [...useSelectionStore().ids] } : undefined,
    })
    refresh()
    return records
  }

  /**
   * Replace the whole document with a parsed project (`TODO/io-001`) — the one
   * entry point for autosave restore and Open.
   *
   * Throws the command layer's `ReplayRejection` (naming the step) if any entry
   * does not fold, and in that case **nothing has changed**: the load is atomic,
   * so selection, history and the document are exactly as they were.
   *
   * On success selection is cleared (it named bodies that may no longer exist —
   * and selection is UI state, never persisted), both undo stacks are empty
   * (section 19), and {@link loadRevision} moves so the viewport frames the new
   * content.
   *
   * @param {readonly import('../core/document.js').DocumentEntry[]} entries
   * @param {number | null} [rollbackAt]
   */
  function load(entries, rollbackAt = null) {
    raw.loadEntries(entries, rollbackAt)
    useSelectionStore().clear()
    loadRevision.value += 1
    refresh()
  }

  /**
   * Put a remembered selection back, dropping anything that is no longer there.
   *
   * "If those bodies still exist" is load-bearing: undoing the *placement* of a
   * body that was selected when a later step ran would otherwise leave the
   * selection pointing at a record the document no longer has, and the gizmo and
   * Inspector would both be attached to nothing.
   *
   * @param {readonly string[]} ids
   */
  function restoreSelection(ids) {
    const live = new Set(bodies.value.map((body) => body.id))
    const survivors = ids.filter((id) => live.has(id))
    const selection = useSelectionStore()
    if (survivors.length === 0) selection.clear()
    else selection.selectMany(survivors)
  }

  /**
   * @typedef {object} HistoryResult
   * @property {boolean} ok
   * @property {string} [message] Why it was refused — shown to the user, never
   *   swallowed (section 19, point 4's named refusal).
   * @property {string} [label]
   */

  /**
   * Undo the most recent local step, then restore the selection it started with.
   *
   * @returns {HistoryResult}
   */
  function undo() {
    const step = raw.pendingUndo()
    if (!step) return { ok: false }
    try {
      raw.undo()
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    refresh()
    restoreSelection(step.meta?.selectionBefore ?? [])
    return { ok: true, label: step.label }
  }

  /**
   * Redo the most recently undone step, selecting what it (re)built.
   *
   * The mirror of undo's rule rather than a copy of it: redoing a placement
   * should leave the placed body selected, exactly as placing it did, so the
   * selection to restore here is the step's own lineage roots — not the
   * selection that preceded it.
   *
   * @returns {HistoryResult}
   */
  function redo() {
    const step = raw.pendingRedo()
    if (!step) return { ok: false }
    try {
      raw.redo()
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    refresh()
    /** @type {Set<string>} */
    const roots = new Set()
    for (const record of step.records) {
      const root = record.id === undefined ? undefined : raw.rootOf(record.id)
      if (root !== undefined) roots.add(root)
    }
    restoreSelection([...roots])
    return { ok: true, label: step.label }
  }

  return {
    raw,
    version,
    bodies,
    sketchEntities,
    count: computed(() => bodies.value.length),
    sketchCount: computed(() => sketchEntities.value.length),
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    loadRevision,
    load,
    append,
    appendAll,
    undo,
    redo,
    refresh,
  }
})
