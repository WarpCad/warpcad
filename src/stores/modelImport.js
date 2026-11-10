// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * **File → Import model…** (`TODO/ui-107`) — a model file comes into the **open project**, placed
 * in the 3D view, never into My parts. **UI state only** (the file being read, the refusal, the
 * placement session's label) plus the order the steps run in; the rules live in core
 * (`userPartTools.projectImportIdentity`, `document.importUserPart`), the read in the mesh worker
 * (`io/meshClient.js`), the placement in `stores/placement.js` and the viewport's drop target.
 *
 * ## Interaction model (from the TODO)
 *
 * - **Precondition**: none, except that History is not previewing a past step (the item is
 *   dimmed with its reason then, `fileMenu.importReason`).
 * - **Trigger**: File → Import model… (`file-import-model`), or a `.stl` / `.3mf` file dropped on
 *   the 3D view at laptop width.
 * - **Feedback**: *Reading bracket.stl…* with a spinner and Cancel near the top of the view
 *   ({@link reading}); a refusal in the same line, `role="alert"` ({@link error}); then the ghost
 *   and the chip *Place bracket.stl · Cancel* ({@link placingLabel}); on commit the model is
 *   selected and History has *Import bracket.stl*.
 * - **Placement**: an armed session (`placement.arm`) — the ghost follows hover and a click
 *   commits; on touch it starts at the centre of the view, a drag moves it and lifting commits.
 *   A dropped file commits at the drop point with no session (`placement.placeAt`).
 *
 * ## Why the definition is staged before the commit
 *
 * The ghost is built by the registry (`evaluateOp`), so the part must be registered while the
 * session is armed — in the project layer, where it would land anyway. Cancelling withdraws it
 * again ({@link release}), so a cancelled import leaves nothing behind; a committed one is then
 * carried by the document itself. The commit is `document.importUserPart`: definition and
 * records in **one** transaction, so one Undo removes the placed model.
 *
 * ## Change units
 *
 * An STL states no units. **Units** for a selected imported mesh is in the Inspector now (it was
 * on the My parts row, which an import no longer has): {@link setUnits} registers the part read
 * in the new units under an op of its own and swaps the placed instance to it with one
 * `reviseRecords` step (the narrow op change `isUnitsReread` allows), so Undo puts it back.
 *
 * @module stores/modelImport
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { lookupEntry } from '../core/kernel/registry.js'
import { recordsForDrop } from '../core/library.js'
import { effectiveUserPart, ensureProjectParts, isMeshPart, isUserPartOp, withdrawProjectPart } from '../core/userPart.js'
import { projectImportIdentity } from '../core/userPartTools.js'
import { cancelModelImport, importModelFile } from '../io/meshClient.js'
import { meshAssemblyDefinition, meshPartDefinition, meshPartSizeMm, withUnits } from '../io/meshPart.js'
import { useDocumentStore } from './document.js'
import { formatSizeMm, importedToast } from './library.js'
import { usePlacementStore } from './placement.js'
import { useSelectionStore } from './selection.js'
import { useTimelineStore } from './timeline.js'

/** What the item and a refused import say while History previews a past step. */
export const IMPORT_PREVIEW_REASON = 'Return to the latest step to import'

/** How long the *Imported bracket.stl — …* line stays after a commit, ms. */
const NOTICE_MS = 4500

/**
 * @typedef {{ superseded: true } | { ok: true, op: string, id?: string } | { ok: false, reason: string }} ImportOutcome
 */

export const useModelImportStore = defineStore('modelImport', () => {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const placement = usePlacementStore()
  const timeline = useTimelineStore()

  /** The file the worker is reading right now, or `''`: *Reading bracket.stl…*. */
  const reading = ref('')
  /** Why the last import was refused, or `''`. Shown with `role="alert"`. */
  const error = ref('')
  /** The file an armed placement session is placing, or `''`: the chip *Place bracket.stl*. */
  const placingLabel = ref('')
  /** After a commit: *Imported bracket.stl — 12 triangles, 40 × 20 × 10 mm*, briefly. */
  const notice = ref('')
  /** @type {ReturnType<typeof setTimeout> | null} */
  let noticeTimer = null

  /** @param {string} text */
  function showNotice(text) {
    notice.value = text
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => {
      notice.value = ''
      noticeTimer = null
    }, NOTICE_MS)
  }

  /** @param {string} op Whether any registered part, or the project's own copies, already use `op`. */
  function opTaken(op) {
    return lookupEntry(op) !== undefined || documentStore.raw.userParts().some((part) => part.op === op)
  }

  /**
   * Take a staged definition back out of the project layer, unless the project now carries it.
   *
   * @param {string} op
   */
  function release(op) {
    if (documentStore.raw.userParts().some((part) => part.op === op)) return
    withdrawProjectPart(op)
  }

  /**
   * The commit: definition and records as one transaction, the new body selected.
   *
   * @param {import('../core/userPart.js').UserPartDefinition} definition
   * @param {{ x: number, y: number }} pointMm
   * @param {string} fileName
   * @param {string} summary The notice's words after the commit.
   * @returns {string | null}
   */
  function commit(definition, pointMm, fileName, summary) {
    if (timeline.previewing) return null
    try {
      const records = documentStore.importPart(
        definition,
        () => recordsForDrop(definition.op, { x: pointMm.x, y: pointMm.y }, documentStore.raw),
        { label: `Import ${fileName}` }
      )
      const id = records[0]?.id ?? null
      if (id !== null) selection.select(id)
      error.value = ''
      showNotice(summary)
      return id
    } catch (failure) {
      error.value = `Could not place ${fileName}: ${failure instanceof Error ? failure.message : String(failure)}`
      return null
    }
  }

  /**
   * Read a model file and place it in the project: an armed session, or — with `at`, a file
   * dropped on the view — straight at the drop point. A second file supersedes one still being
   * read, and ends a session still waiting. Never throws; a refusal is {@link error}.
   *
   * @param {Blob & { name: string }} file
   * @param {{ at?: { clientX: number, clientY: number } }} [options]
   * @returns {Promise<ImportOutcome>}
   */
  async function importFile(file, options = {}) {
    error.value = ''
    if (timeline.previewing) {
      error.value = IMPORT_PREVIEW_REASON
      return { ok: false, reason: IMPORT_PREVIEW_REASON }
    }
    if (placement.armed) placement.cancel()
    reading.value = file.name
    const outcome = await importModelFile(file)
    if (outcome.superseded) return { superseded: true }
    reading.value = ''
    const { result } = outcome
    if (!result.ok) {
      error.value = result.reason
      return { ok: false, reason: result.reason }
    }

    /** @type {import('../core/userPart.js').UserPartDefinition} */
    let definition
    let summary = ''
    try {
      const { name, op } = projectImportIdentity(result.name, {
        projectParts: documentStore.raw.userParts().map((part) => ({ op: part.op, name: part.name })),
        opTaken,
      })
      // A 3MF is an assembly of placed meshes (`TODO/io-024`); one part of it is an ordinary mesh.
      definition = /** @type {any} */ (
        result.kind === 'assembly'
          ? meshAssemblyDefinition({ assets: result.assets, parts: result.parts, name, op, unitScale: result.unitScale })
          : meshPartDefinition({ record: result.record, name, triangleCount: result.triangleCount, op })
      )
      ensureProjectParts([definition])
      if (effectiveUserPart(op) === undefined) throw new Error('its part could not be built')
      let sizeText = ''
      try {
        sizeText = formatSizeMm(meshPartSizeMm(definition))
      } catch {
        sizeText = ''
      }
      summary = importedToast(file.name, result, sizeText)
    } catch (failure) {
      const reason = failure instanceof Error ? failure.message : String(failure)
      error.value = `Could not add ${file.name}: ${reason}`
      return { ok: false, reason }
    }

    const op = definition.op
    const place = (/** @type {{ x: number, y: number }} */ pointMm) => commit(definition, pointMm, file.name, summary)
    if (options.at !== undefined) {
      const id = placement.placeAt(op, options.at.clientX, options.at.clientY, place)
      if (id === null) {
        release(op)
        if (error.value === '') error.value = `Could not place ${file.name} there — drop it on the grid`
        return { ok: false, reason: error.value }
      }
      return { ok: true, op, id }
    }
    placingLabel.value = file.name
    placement.arm(op, file.name, {
      place,
      onEnd: ({ placed }) => {
        placingLabel.value = ''
        if (placed === null) release(op)
      },
    })
    return { ok: true, op }
  }

  /** Stop reading the file in progress, if any: nothing is added. */
  function cancelReading() {
    cancelModelImport()
    reading.value = ''
  }

  /** End the placement session with nothing added (the chip's Cancel, Esc). */
  function cancelPlacement() {
    if (placement.armed) placement.cancel()
    placingLabel.value = ''
  }

  function dismissError() {
    error.value = ''
  }

  /**
   * The imported mesh a body places, when it is one: its creation record and the definition.
   *
   * @param {string} bodyId
   * @returns {{ record: import('../core/kernel/registry.js').OpRecord, definition: import('../core/userPart.js').UserPartDefinition } | null}
   */
  function meshOf(bodyId) {
    const raw = documentStore.raw
    const root = raw.rootOf(bodyId) ?? bodyId
    const record = raw.lineageOf(root)[0]
    if (record === undefined || !isUserPartOp(record.op)) return null
    const definition = raw.userParts().find((part) => part.op === record.op) ?? effectiveUserPart(record.op)
    return definition !== undefined && isMeshPart(definition) ? { record, definition } : null
  }

  /**
   * **Units** in the Inspector: read a placed imported mesh in other units (or confirm the
   * assumed ones), as one undoable step. A file that states its units (3MF) is refused.
   *
   * @param {string} bodyId
   * @param {'mm' | 'cm' | 'inch'} units
   * @returns {boolean} Whether it changed.
   */
  function setUnits(bodyId, units) {
    error.value = ''
    if (timeline.previewing) return false
    const found = meshOf(bodyId)
    if (found === null) return false
    const { record, definition } = found
    /** @type {import('../core/userPart.js').UserPartDefinition} */
    let next
    try {
      const { op } = projectImportIdentity(definition.name, { projectParts: [], opTaken })
      next = { .../** @type {any} */ (withUnits(/** @type {any} */ (definition), units)), op, version: 1 }
    } catch (failure) {
      error.value = `Could not change units: ${failure instanceof Error ? failure.message : String(failure)}`
      return false
    }
    ensureProjectParts([next])
    try {
      documentStore.revise([{ id: String(record.id), record: { ...record, op: next.op } }], {
        label: `Read ${definition.name} in ${units}`,
      })
      return true
    } catch (failure) {
      release(next.op)
      error.value = `Could not change units: ${failure instanceof Error ? failure.message : String(failure)}`
      return false
    }
  }

  return {
    reading,
    error,
    placingLabel,
    notice,
    importFile,
    cancelReading,
    cancelPlacement,
    dismissError,
    meshOf,
    setUnits,
  }
})
