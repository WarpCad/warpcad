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
import { parsePartFile, partFileName, serializePartFile } from '../core/userPartFile.js'
import { renderPartThumbnail } from '../render/partThumbnail.js'
import { downloadBytes } from '../storage/download.js'
import { createUserLibrary, loadUserLibrary } from '../storage/userLibrary.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'
import { useTimelineStore } from './timeline.js'

/** How long the "Saved <name>" toast stays, ms. */
const TOAST_MS = 4500

/** @typedef {import('../core/userPart.js').UserPartDefinition} UserPartDefinition */
/** @typedef {import('../core/library.js').LibraryRow} LibraryRow */
/**
 * @typedef {LibraryRow & { inLibrary: boolean, usage: number, thumbnail: string | null }} UserPartRow
 */

/**
 * @typedef {object} LibraryBoundaries
 * @property {(text: string, name: string) => void} [download] Hands a file to the browser.
 * @property {(geometry: unknown) => string | null} [thumbnailer] Draws a part's thumbnail.
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
    thumbnailer: (geometry) => renderPartThumbnail(geometry),
  }

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
        })
      )
      // Newest first ("the new row appears at the top of My parts"); a part that is only in
      // the open project has no save time and follows, by name — `userLibrarySection`'s order.
      .sort((a, b) => (stamps[b.op] ?? 0) - (stamps[a.op] ?? 0))
  })

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

  /** @returns {Promise<boolean>} Whether the part was saved. */
  async function save() {
    if (!canSave.value || saveBodyId.value === null) return false
    saving.value = true
    saveError.value = ''
    const id = saveBodyId.value
    const name = saveName.value.trim()
    try {
      const chosen = saveCandidates.value.filter((candidate) => saveChosen.value.includes(candidate.key))
      const definition = definePartFromSelection(documentStore.raw, id, { name, exposeParams: exposedFrom(chosen) })
      const geometry = documentStore.raw.bodies().find((body) => body.id === id)?.geometry
      const thumbnail = geometry === undefined ? null : boundaries.thumbnailer(geometry)
      await backendOf().save(definition, { thumbnail })
      await reload()
      expanded.value = true
      revealOp.value = definition.op
      showToast(`Saved ${name}`)
      closeSave()
      return true
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : String(error)
      saving.value = false
      return false
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

  return {
    revision,
    thumbnails,
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
