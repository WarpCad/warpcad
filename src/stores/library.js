// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Library's user-part state and flows (`TODO/ui-055`) — **UI state only**. The rules are
 * `core/userPartTools.js`'s and the part format is `core/userPart.js`'s; the persistence is
 * `storage/userLibrary.js`'s. This store decides what the Save sheet opens with, what the
 * sheet and the row menu say, and what each action does and in what order, and it is the one
 * place that loads the local library at app start.
 *
 * ## Interaction model (from the TODO)
 *
 * - **Precondition**: exactly one body selected ({@link saveGate}). A multi-selection is first
 *   combined with *Combine into group*, which the disabled reason says.
 * - **Trigger**: *Save to library…* opens the sheet ({@link openSave}); a row's ⋯ menu opens
 *   Rename, Duplicate, Export part file and Delete; *Import part file…* is in the section header.
 * - **Feedback**: the new row at the top of My parts with its thumbnail, a "Saved <name>" toast,
 *   an "in this project" dot on a used part, and — on Delete with placed instances — the choice
 *   to keep a copy in the project.
 * - **Delete never deletes placed geometry.** A placed part's definition lives in the *project*
 *   (core-037's project layer, adopted when it was placed), so removing it from the local
 *   library cannot change what a project builds; the row then shows from the project's copy
 *   until the project is closed.
 *
 * Geometry never lives here: the captured definition is plain JSON handed straight to the
 * backend; the only kernel value touched is read once for the thumbnail.
 *
 * @module stores/library
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { userLibrarySection } from '../core/library.js'
import { definePartFromSelection } from '../core/library.js'
import { USER_PART_PREFIX as USER_PREFIX, effectiveUserPart, effectiveUserParts, requiredUserParts, slugify } from '../core/userPart.js'
import {
  copyNameFor,
  duplicatePart,
  exposableParams,
  exposedFrom,
  partNameProblem,
  renamePart,
  saveToLibraryGate,
  usageOf,
} from '../core/userPartTools.js'
import { evaluateOp } from '../core/kernel/index.js'
import { MAX_PART_FILE_CHARS, parsePartFile, partFileName, serializePartFile } from '../core/userPartFile.js'
import { formatCount } from '../io/meshAsset.js'
import { cancelModelImport, importModelFile } from '../io/meshClient.js'
import { UNIT_SCALES, meshPartDefinition, meshPartInfo, meshPartSizeMm, withUnits } from '../io/meshPart.js'
import { renderPartThumbnail } from '../render/partThumbnail.js'
import { downloadBytes } from '../storage/download.js'
import { createUserLibrary, loadUserLibrary } from '../storage/userLibrary.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'
import { useTimelineStore } from './timeline.js'

/** The face budget of an imported model's thumbnail (the default is 40,000). */
const MESH_THUMBNAIL_FACES = 12_000

/** How long the "Saved <name>" toast stays, ms. */
const TOAST_MS = 4500

/** @typedef {import('../core/userPart.js').UserPartDefinition} UserPartDefinition */
/** @typedef {import('../core/library.js').LibraryRow} LibraryRow */
/**
 * @typedef {object} MeshRowInfo What an imported model's row shows (`TODO/io-009`).
 * @property {number} triangleCount
 * @property {keyof typeof UNIT_SCALES | null} units
 * @property {boolean} unitsConfirmed
 * @property {[number, number, number] | null} sizeMm Bounding box in mm at the current units;
 *   `null` if the stored mesh no longer decodes.
 * @property {string} sizeText `"42 × 18 × 6 mm"`, or `''`.
 */
/**
 * @typedef {LibraryRow & {
 *   inLibrary: boolean, usage: number, thumbnail: string | null, mesh: MeshRowInfo | null
 * }} UserPartRow
 */

/**
 * "42 × 18 × 6 mm" — enough digits to tell 0.04 from 0.4, not more.
 *
 * @param {readonly number[]} size Millimetres.
 * @returns {string}
 */
export function formatSizeMm(size) {
  const one = (/** @type {number} */ value) => {
    const abs = Math.abs(value)
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 3
    return String(Number(value.toFixed(digits)))
  }
  return `${size.map(one).join(' × ')} mm`
}

/**
 * @typedef {object} LibraryBoundaries
 * @property {(text: string, name: string) => void} [download] Hands a file to the browser.
 * @property {(geometry: unknown, options?: { maxFaces?: number }) => string | null} [thumbnailer]
 *   Draws a part's thumbnail.
 */

export const useLibraryStore = defineStore('library', () => {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()
  const timeline = useTimelineStore()

  /** @type {import('../storage/userLibrary.js').UserLibrary | null} */
  let backend = null
  /** @type {Required<LibraryBoundaries>} */
  let boundaries = {
    download: (text, name) => {
      downloadBytes(text, name, 'application/json')
    },
    thumbnailer: (geometry, options) => renderPartThumbnail(geometry, options),
  }

  /** `assetId|unitScale` → size in mm, so a row decodes its mesh once, not on every re-render. */
  const sizeCache = new Map()

  /**
   * Bumped whenever the local library changes, so every computed over the registry's
   * (non-reactive) user-part layers re-reads them. The project layer moves with the document,
   * whose `version` the rows depend on too.
   */
  const revision = ref(0)
  /** op → PNG data URL, for the parts that have one. */
  const thumbnails = shallowRef(/** @type {Record<string, string>} */ ({}))
  /** op → when it was last saved to the local library; the newest is listed first. */
  const savedAt = shallowRef(/** @type {Record<string, number>} */ ({}))
  /** The op most recently saved, imported or duplicated, so the panel can bring its row into view. */
  const revealOp = ref(/** @type {string | null} */ (null))
  /** Why the local library could not be read at start, or `''`. */
  const loadProblem = ref('')
  const loaded = ref(false)
  /** Whether the My parts section is open in the panel. */
  const expanded = ref(false)
  const toast = ref({ text: '', id: 0 })
  /** @type {ReturnType<typeof setTimeout> | null} */
  let toastTimer = null

  function backendOf() {
    if (backend === null) backend = createUserLibrary()
    return backend
  }

  /**
   * Replace the storage and the browser-facing boundaries. Tests, and nothing else.
   *
   * @param {import('../storage/userLibrary.js').UserLibrary} next
   * @param {LibraryBoundaries} [overrides]
   */
  function useBackend(next, overrides = {}) {
    backend = next
    boundaries = { ...boundaries, ...overrides }
  }

  /** @param {string} text */
  function showToast(text) {
    toast.value = { text, id: toast.value.id + 1 }
    if (toastTimer !== null) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast.value = { text: '', id: toast.value.id }
      toastTimer = null
    }, TOAST_MS)
  }

  function dismissToast() {
    if (toastTimer !== null) clearTimeout(toastTimer)
    toastTimer = null
    toast.value = { text: '', id: toast.value.id }
  }

  /**
   * Read the local library into the registry's library layer. Never rejects: storage that
   * cannot be read is an empty library, with the reason in {@link loadProblem}.
   *
   * @returns {Promise<void>}
   */
  async function start() {
    const result = await loadUserLibrary(backendOf())
    thumbnails.value = result.thumbnails
    savedAt.value = result.savedAt
    loadProblem.value = result.problems.map((problem) => problem.reason).join('; ')
    loaded.value = true
    revision.value += 1
  }

  /** Re-read after a change of our own. */
  async function reload() {
    const result = await loadUserLibrary(backendOf())
    thumbnails.value = result.thumbnails
    savedAt.value = result.savedAt
    revision.value += 1
    return result
  }

  // --- rows ---------------------------------------------------------------------------

  /** @type {import('vue').ComputedRef<UserPartRow[]>} */
  const userRows = computed(() => {
    void revision.value
    void documentStore.version
    const records = documentStore.raw.records
    const stamps = savedAt.value
    return userLibrarySection()
      .rows.map((row) =>
        Object.freeze({
          ...row,
          inLibrary: row.userPart?.libraryVersion !== null && row.userPart?.libraryVersion !== undefined,
          usage: usageOf(records, row.op),
          thumbnail: thumbnails.value[row.op] ?? null,
          mesh: meshRowInfo(row.op),
        })
      )
      // Newest first ("the new row appears at the top of My parts"); a part that is only in
      // the open project has no save time and follows, by name — `userLibrarySection`'s order.
      .sort((a, b) => (stamps[b.op] ?? 0) - (stamps[a.op] ?? 0))
  })

  /**
   * An imported model's facts for its row, or `null` for an ordinary part. The size decodes
   * the stored mesh, so it is cached by asset and units.
   *
   * @param {string} op
   * @returns {MeshRowInfo | null}
   */
  function meshRowInfo(op) {
    const definition = effectiveUserPart(op)
    const info = definition === undefined ? null : meshPartInfo(definition)
    if (definition === undefined || info === null) return null
    const key = `${info.assetId}|${info.unitScale}`
    if (!sizeCache.has(key)) {
      try {
        sizeCache.set(key, meshPartSizeMm(definition))
      } catch {
        sizeCache.set(key, null)
      }
    }
    const sizeMm = sizeCache.get(key) ?? null
    return {
      triangleCount: info.triangleCount,
      units: info.units,
      unitsConfirmed: info.unitsConfirmed,
      sizeMm,
      sizeText: sizeMm === null ? '' : formatSizeMm(sizeMm),
    }
  }

  /** Every part that exists right now, for name checks. */
  function takenParts() {
    return effectiveUserParts().map((part) => ({ op: part.op, name: part.name }))
  }

  // --- Save to library… ---------------------------------------------------------------

  const inactiveSelected = computed(() =>
    selection.ids.some((id) => documentStore.inactiveBodies.some((body) => body.id === id))
  )

  /** Enabled-state and reason for every *Save to library…* control (selection **count**). */
  const saveGate = computed(() =>
    saveToLibraryGate({ count: selection.count, previewing: timeline.previewing, inactive: inactiveSelected.value })
  )

  const saveOpen = ref(false)
  const saveBodyId = ref(/** @type {string | null} */ (null))
  const saveName = ref('')
  const saveCategory = ref('user')
  /** @type {import('vue').Ref<import('../core/userPartTools.js').ExposableParam[]>} */
  const saveCandidates = ref([])
  const saveChosen = ref(/** @type {string[]} */ ([]))
  const saveError = ref('')
  const saving = ref(false)

  const nameProblem = computed(() => {
    if (!saveOpen.value) return ''
    void revision.value
    void documentStore.version
    return partNameProblem(saveName.value, takenParts())
  })

  const canSave = computed(() => saveOpen.value && !saving.value && nameProblem.value === '')

  /**
   * Open the sheet on the one selected body.
   *
   * @returns {boolean} `false` unless {@link saveGate} is enabled.
   */
  function openSave() {
    if (!saveGate.value.enabled || selection.onlyId === null) return false
    const body = documentStore.bodies.find((candidate) => candidate.id === selection.onlyId)
    if (body === undefined) return false
    saveBodyId.value = body.id
    saveName.value = body.name
    saveCategory.value = 'user'
    saveCandidates.value = exposableParams(documentStore.raw, body.id)
    saveChosen.value = []
    saveError.value = ''
    saving.value = false
    saveOpen.value = true
    return true
  }

  function closeSave() {
    saveOpen.value = false
    saveBodyId.value = null
    saveError.value = ''
    saving.value = false
  }

  /**
   * Capture, store, and show — the one commit path, shared by the Save sheet and the assistant's
   * confirmed proposal (`TODO/ai-008`). Throws with the reason.
   *
   * @param {string} id
   * @param {string} name Trimmed.
   * @param {readonly import('../core/userPartTools.js').ExposableParam[]} chosen
   * @returns {Promise<string>} The saved part's op.
   */
  async function commitSave(id, name, chosen) {
    const definition = definePartFromSelection(documentStore.raw, id, { name, exposeParams: exposedFrom(chosen) })
    const geometry = documentStore.raw.bodies().find((body) => body.id === id)?.geometry
    const thumbnail = geometry === undefined ? null : boundaries.thumbnailer(geometry)
    await backendOf().save(definition, { thumbnail })
    await reload()
    expanded.value = true
    revealOp.value = definition.op
    showToast(`Saved ${name}`)
    return definition.op
  }

  /** @returns {Promise<boolean>} Whether the part was saved. */
  async function save() {
    if (!canSave.value || saveBodyId.value === null) return false
    saving.value = true
    saveError.value = ''
    const id = saveBodyId.value
    const name = saveName.value.trim()
    try {
      const chosen = saveCandidates.value.filter((candidate) => saveChosen.value.includes(candidate.key))
      await commitSave(id, name, chosen)
      closeSave()
      return true
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : String(error)
      saving.value = false
      return false
    }
  }

  /**
   * Save what the assistant proposed (`TODO/ai-008`) — called only from the chat's **Confirm**
   * tap. Everything is checked again against the live document now: the name may have been taken
   * and the body changed since the proposal.
   *
   * @param {{ bodyId: string, name: string, expose: readonly string[] }} proposal
   * @returns {Promise<{ ok: true, op: string } | { ok: false, reason: string }>}
   */
  async function saveProposed(proposal) {
    const name = proposal.name.trim()
    const problem = partNameProblem(name, takenParts())
    if (problem) return { ok: false, reason: problem }
    if (!documentStore.bodies.some((body) => body.id === proposal.bodyId)) {
      return { ok: false, reason: 'That body is no longer in the project' }
    }
    const candidates = exposableParams(documentStore.raw, proposal.bodyId)
    const chosen = candidates.filter((candidate) => proposal.expose.includes(candidate.key))
    try {
      return { ok: true, op: await commitSave(proposal.bodyId, name, chosen) }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  // --- the row menu -------------------------------------------------------------------

  const menuOp = ref(/** @type {string | null} */ (null))

  /** @param {string} op */
  function openMenu(op) {
    menuOp.value = op
  }

  function closeMenu() {
    menuOp.value = null
  }

  // Rename
  const renameOp = ref(/** @type {string | null} */ (null))
  const renameName = ref('')
  const renameError = ref('')

  const renameProblem = computed(() => {
    if (renameOp.value === null) return ''
    void revision.value
    return partNameProblem(renameName.value, takenParts(), { except: renameOp.value })
  })

  /** @param {string} op */
  function beginRename(op) {
    const part = effectiveUserPart(op)
    if (part === undefined) return
    closeMenu()
    renameOp.value = op
    renameName.value = part.name
    renameError.value = ''
  }

  function cancelRename() {
    renameOp.value = null
    renameError.value = ''
  }

  /** @returns {Promise<boolean>} */
  async function commitRename() {
    const op = renameOp.value
    if (op === null || renameProblem.value !== '') return false
    const stored = (await backendOf().list()).parts.find((part) => part.op === op)
    const part = stored ?? effectiveUserPart(op)
    if (part === undefined) return false
    try {
      await backendOf().save(renamePart(part, renameName.value))
      await reload()
      showToast(`Renamed to ${renameName.value.trim()}`)
      cancelRename()
      return true
    } catch (error) {
      renameError.value = error instanceof Error ? error.message : String(error)
      return false
    }
  }

  /**
   * @param {string} op
   * @returns {Promise<boolean>}
   */
  async function duplicate(op) {
    closeMenu()
    const part = effectiveUserPart(op)
    if (part === undefined) return false
    try {
      const name = copyNameFor(part.name, takenParts())
      await backendOf().save(duplicatePart(part, name), { thumbnail: thumbnails.value[op] ?? null })
      await reload()
      expanded.value = true
      revealOp.value = `${USER_PREFIX}${slugify(name)}`
      showToast(`Saved ${name}`)
      return true
    } catch (error) {
      showToast(`Could not duplicate: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  /**
   * Hand the part, and the parts it nests, to the browser as a file.
   *
   * @param {string} op
   * @returns {boolean}
   */
  function exportPart(op) {
    closeMenu()
    const part = effectiveUserPart(op)
    if (part === undefined) return false
    const { definitions } = requiredUserParts([{ id: 'x', op, params: {} }], effectiveUserPart)
    const text = serializePartFile(definitions, thumbnails.value)
    // An imported mesh can make the file bigger than the importer will read back: refuse
    // here, in words, rather than hand over a file Import part file… would call too large.
    if (text.length > MAX_PART_FILE_CHARS) {
      showToast(
        `Could not export ${part.name}: the part file would be ${(text.length / 1_000_000).toFixed(1)} million characters, ` +
          `over the ${(MAX_PART_FILE_CHARS / 1_000_000).toFixed(0)} million Import part file… reads`
      )
      return false
    }
    boundaries.download(text, partFileName(op))
    showToast(`Exported ${part.name}`)
    return true
  }

  // Delete
  const deleteOp = ref(/** @type {string | null} */ (null))

  /** @param {string} op */
  function beginDelete(op) {
    closeMenu()
    deleteOp.value = op
  }

  function cancelDelete() {
    deleteOp.value = null
  }

  /**
   * What the Delete dialog says — the copy depends on whether any placed instance uses the
   * part. With instances the default (and only) action keeps a copy in the project.
   */
  const deletePrompt = computed(() => {
    if (deleteOp.value === null) return null
    void revision.value
    void documentStore.version
    const part = effectiveUserPart(deleteOp.value)
    const name = part?.name ?? deleteOp.value
    const usage = usageOf(documentStore.raw.records, deleteOp.value)
    if (usage === 0) {
      return {
        name,
        usage,
        confirmLabel: 'Delete',
        message: `Delete ${name} from My parts? Projects you have already placed it in keep their own copy.`,
      }
    }
    const plural = usage === 1 ? '1 placed instance' : `${usage} placed instances`
    return {
      name,
      usage,
      confirmLabel: 'Keep a copy in the project',
      message:
        `${name} has ${plural} in this project. It is removed from My parts, but ${usage === 1 ? 'that instance stays' : 'those instances stay'} ` +
        'in the project, with a copy of the part — nothing you placed is deleted.',
    }
  })

  /** @returns {Promise<boolean>} */
  async function confirmDelete() {
    const op = deleteOp.value
    if (op === null) return false
    try {
      await backendOf().remove(op)
      await reload()
      deleteOp.value = null
      showToast(`Deleted ${effectiveUserPart(op)?.name ?? op.replace(/^user\./, '')} from My parts`)
      return true
    } catch (error) {
      showToast(`Could not delete: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  // --- Import part file… ----------------------------------------------------------------

  const importError = ref('')

  /**
   * Add every part in a part file to the local library. A part whose name is already taken
   * is skipped (never overwritten); a bad part is reported by name and the rest still load.
   *
   * @param {string} text
   * @returns {Promise<{ added: string[], skipped: string[], problems: import('../core/userPart.js').UserPartProblem[] }>}
   */
  async function importText(text) {
    importError.value = ''
    const parsed = parsePartFile(text)
    /** @type {string[]} */
    const added = []
    /** @type {string[]} */
    const addedOps = []
    /** @type {string[]} */
    const skipped = []
    const problems = [...parsed.problems]
    const existing = new Set(takenParts().map((part) => part.op))
    for (const part of parsed.parts) {
      if (existing.has(part.op)) {
        skipped.push(part.name)
        continue
      }
      try {
        await backendOf().save(part, { thumbnail: parsed.thumbnails[part.op] ?? null })
        added.push(part.name)
        addedOps.push(part.op)
        existing.add(part.op)
      } catch (error) {
        problems.push({ op: part.op, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    if (added.length > 0) {
      await reload()
      expanded.value = true
      revealOp.value = addedOps[0] ?? null
      showToast(`Imported ${added.join(', ')}`)
    }
    const failure = problems.map((problem) => (problem.op ? `${problem.op}: ${problem.reason}` : problem.reason)).join('; ')
    importError.value =
      failure !== '' ? failure : added.length === 0 && skipped.length > 0 ? `${skipped.join(', ')} already in My parts` : ''
    return { added, skipped, problems }
  }

  // --- Import model file… (TODO/io-009) ---------------------------------------------------

  /** The file being read right now, or `''` — the "Reading bracket.stl…" row. */
  const modelImporting = ref('')

  /**
   * A free part name for an imported file: its base name, or "<name> copy" when taken.
   *
   * @param {string} name
   * @returns {string}
   */
  function importedNameFor(name) {
    const taken = takenParts()
    return partNameProblem(name, taken) === '' ? name : copyNameFor(name, taken)
  }

  /**
   * Read a model file (STL) in the worker and add it to My parts as a part. A second file
   * supersedes the one being read. Never throws; a refusal is {@link importError}.
   *
   * @param {File} file
   * @returns {Promise<{ ok: true, op: string } | { ok: false, reason: string } | { superseded: true }>}
   */
  async function importModel(file) {
    importError.value = ''
    expanded.value = true
    modelImporting.value = file.name
    const outcome = await importModelFile(file)
    if (outcome.superseded) return { superseded: true }
    modelImporting.value = ''
    const { result } = outcome
    if (!result.ok) {
      importError.value = result.reason
      return { ok: false, reason: result.reason }
    }
    try {
      const name = importedNameFor(result.name)
      const op = `${USER_PREFIX}${slugify(name)}`
      const definition = meshPartDefinition({ record: result.record, name, triangleCount: result.triangleCount, op })
      await backendOf().save(definition, { thumbnail: null })
      await reload()
      // The thumbnail is drawn once, from the part as the registry now builds it.
      // One frame to paint the row first, then a thumbnail with a lowered face budget: a scan
      // has far more faces than a 96 px picture can show, and drawing them all would hold the
      // main thread for several frames (measured in docs/decisions/mesh-import.md).
      await new Promise((resolve) => setTimeout(resolve, 0))
      let thumbnail = null
      try {
        thumbnail = boundaries.thumbnailer(evaluateOp(op, {}), { maxFaces: MESH_THUMBNAIL_FACES })
      } catch {
        thumbnail = null
      }
      if (thumbnail !== null) {
        await backendOf().save(definition, { thumbnail })
        await reload()
      }
      revealOp.value = op
      const info = meshRowInfo(op)
      showToast(
        `Imported ${file.name} — ${formatCount(result.triangleCount)} triangles` +
          (info?.sizeText ? `, ${info.sizeText}` : '')
      )
      return { ok: true, op }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      importError.value = `Could not add ${file.name}: ${reason}`
      return { ok: false, reason }
    }
  }

  /** Stop reading the model file in progress, if any. */
  function cancelImportModel() {
    cancelModelImport()
    modelImporting.value = ''
  }

  /**
   * Read an imported model in other units (or confirm the assumed ones). A new version of the
   * part, so a project that already placed it keeps its copy.
   *
   * @param {string} op
   * @param {keyof typeof UNIT_SCALES} units
   * @returns {Promise<boolean>}
   */
  async function setMeshUnits(op, units) {
    const stored = (await backendOf().list()).parts.find((part) => part.op === op)
    const part = stored ?? effectiveUserPart(op)
    if (part === undefined) return false
    try {
      await backendOf().save(withUnits(part, units))
      await reload()
      return true
    } catch (error) {
      showToast(`Could not change units: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  return {
    revision,
    thumbnails,
    modelImporting,
    importModel,
    cancelImportModel,
    setMeshUnits,
    revealOp,
    loadProblem,
    loaded,
    expanded,
    toast,
    dismissToast,
    useBackend,
    start,
    userRows,
    saveGate,
    saveOpen,
    saveName,
    saveCategory,
    saveCandidates,
    saveChosen,
    saveError,
    saving,
    nameProblem,
    canSave,
    openSave,
    closeSave,
    save,
    saveProposed,
    menuOp,
    openMenu,
    closeMenu,
    renameOp,
    renameName,
    renameError,
    renameProblem,
    beginRename,
    cancelRename,
    commitRename,
    duplicate,
    exportPart,
    deleteOp,
    deletePrompt,
    beginDelete,
    cancelDelete,
    confirmDelete,
    importError,
    importText,
  }
})
