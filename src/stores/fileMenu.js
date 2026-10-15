// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The File ▾ menu's UI state and the two rules that live in it (`TODO/ui-033`) — **UI state
 * only**. Nothing here persists, serialises or talks to a network: it decides *when* to ask
 * and *what to call*, and hands every real action to `stores/persistence.js` (local file) or
 * `stores/hosted.js` (git repository), which own the mechanisms.
 *
 * ## Why a store, not component state
 *
 * Four things outside `FileMenu.vue` need to open or read it: the save-status chip (a
 * persistent error opens the menu — its Save/Download item is the user's escape hatch,
 * `interaction-model-qa.md` §8), the Ctrl/Cmd+O shortcut, the Connect dialog, and the conflict
 * dialog's "is something else open?" deferral. Shared UI state belongs in a store.
 *
 * ## The two rules
 *
 * **Open never destroys work without asking** (§10). A non-empty project raises the replace
 * confirm *before* the picker opens, and the picker is opened only from the Replace click — so
 * a cancelled picker after a confirmed replace can never lose anything, and the
 * `<input type=file>` fallback's `click()` still happens inside a user gesture. The same
 * question guards `Load from owner/repo` (§11: "identical replace-confirm to section 10").
 *
 * **Ctrl/Cmd+S never touches the network** (§11). {@link saveLocal} calls
 * `persistence.saveFile`, which has no route into the hosted store, connected or not, with
 * auto-push on or off.
 *
 * ## What "non-empty" means
 *
 * Any step in the log, not the body count: a project whose every step is suppressed has no
 * bodies and is still someone's work.
 *
 * @module stores/fileMenu
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { useAlignReferenceStore } from './alignReference.js'
import { useDocumentStore } from './document.js'
import { useExportDialogStore } from './exportDialog.js'
import { useHostedStore } from './hosted.js'
import { useMergeStore } from './merge.js'
import { usePersistenceStore } from './persistence.js'
import { useProjectSettingsStore } from './projectSettings.js'
import { useResolutionDialogStore } from './resolutionDialog.js'

/** @typedef {'open' | 'load' | 'new'} ConfirmKind */

export const useFileMenuStore = defineStore('fileMenu', () => {
  const documentStore = useDocumentStore()
  const persistence = usePersistenceStore()
  const hosted = useHostedStore()
  const exportDialog = useExportDialogStore()
  const resolutionDialog = useResolutionDialogStore()
  const projectSettings = useProjectSettingsStore()
  const alignReference = useAlignReferenceStore()
  const merge = useMergeStore()

  const menuOpen = ref(false)
  const connectOpen = ref(false)
  /** Which replace question is showing, or `null`. @type {import('vue').Ref<ConfirmKind | null>} */
  const confirm = ref(null)
  /** Resolves the hosted store's pending "replace?" question (`TODO/io-011`). */
  let replaceAnswer = /** @type {((answer: boolean) => void) | null} */ (null)

  /** @param {boolean} answer */
  function settleReplace(answer) {
    const resolve = replaceAnswer
    replaceAnswer = null
    resolve?.(answer)
  }

  /** Anything of this menu's own that is open — what defers a background conflict dialog. */
  const anyOpen = computed(
    () =>
      menuOpen.value ||
      connectOpen.value ||
      confirm.value !== null ||
      exportDialog.isOpen ||
      resolutionDialog.isOpen ||
      projectSettings.isOpen
  )

  /** @returns {boolean} Whether replacing the project would discard anything. */
  function hasContent() {
    void documentStore.version
    return documentStore.raw.entries.length > 0
  }

  function openMenu() {
    menuOpen.value = true
  }

  function closeMenu() {
    menuOpen.value = false
  }

  function toggleMenu() {
    menuOpen.value = !menuOpen.value
  }

  /**
   * `Save` / `Save As…` / `Download copy`. Called synchronously from the click or the
   * shortcut: `showSaveFilePicker` needs the user's activation.
   *
   * @param {{ saveAs?: boolean }} [options]
   */
  function saveLocal({ saveAs = false } = {}) {
    menuOpen.value = false
    void persistence.saveFile({ saveAs })
  }

  /**
   * `Export…` (`TODO/ui-034`): swap the menu for the export popover. A no-op while Export is
   * unavailable — the item is dimmed with the reason then, so this is the belt to its braces.
   */
  function requestExport() {
    if (exportDialog.unavailableReason !== '') return
    menuOpen.value = false
    resolutionDialog.close()
    exportDialog.open()
  }

  /**
   * `Resolution: Normal` (`TODO/core-035`): swap the menu for the resolution popover, the
   * same way `Export…` does. Always available — while History previews, the popover itself
   * says why its choices are disabled, so the current value can still be read.
   */
  function requestResolution() {
    menuOpen.value = false
    exportDialog.close()
    resolutionDialog.open()
  }

  /**
   * `Project settings…` (`TODO/ai-003`): swap the menu for the dialog that edits the
   * project's standing instructions. Always available — it changes no geometry.
   */
  function requestProjectSettings() {
    menuOpen.value = false
    exportDialog.close()
    resolutionDialog.close()
    projectSettings.open()
  }

  /**
   * `Open…` (and Ctrl/Cmd+O): confirm first when there is anything to lose. A no-op while a
   * load is still being announced and folded (`TODO/core-032`) — the item is disabled then.
   */
  function requestOpen() {
    menuOpen.value = false
    if (persistence.loading) return
    // A replace-confirm about to land over an open export popover would leave it half-hidden.
    exportDialog.close()
    if (hasContent()) {
      confirm.value = 'open'
      return
    }
    void persistence.openFile()
  }

  /**
   * `New` (and Ctrl/Cmd+Alt+N, `TODO/ui-054`): confirm first when there is anything to lose,
   * then start an empty project. A no-op while a load is still being announced and folded.
   * Nothing is picked, so — unlike Open — the whole thing can run synchronously.
   */
  function requestNew() {
    menuOpen.value = false
    if (persistence.loading) return
    exportDialog.close()
    resolutionDialog.close()
    if (hasContent()) {
      confirm.value = 'new'
      return
    }
    startNewProject()
  }

  /** The part of New that destroys: persistence's reset, then the per-session UI memory. */
  function startNewProject() {
    if (!persistence.newProject()) return
    alignReference.reset()
    hosted.detachForNewProject()
  }

  /**
   * **Merge file…** (`TODO/ui-062`): straight to the picker Open uses — nothing is replaced, so
   * nothing is confirmed. Must be called synchronously from the click (the `<input type=file>`
   * fallback's `click()` needs the gesture). A no-op while the item is dimmed
   * (`merge.unavailableReason`) or a load is pending.
   */
  function requestMerge() {
    if (merge.unavailableReason !== '') return
    menuOpen.value = false
    if (persistence.loading) return
    exportDialog.close()
    resolutionDialog.close()
    void persistence.mergeFile()
  }

  /** `Load from owner/repo`: the same replace question, then a read of the repository. */
  function requestLoad() {
    menuOpen.value = false
    if (persistence.loading) return
    void hosted.loadFromRemote(hasContent() ? { confirmReplace: askReplaceRemote } : {})
  }

  /**
   * `TODO/io-011`: Load from … merges a copy of this project, so the replace question is asked
   * only if the load turns out to replace — the hosted store calls this at that moment.
   *
   * @returns {Promise<boolean>}
   */
  function askReplaceRemote() {
    return new Promise((resolve) => {
      replaceAnswer = resolve
      confirm.value = 'load'
    })
  }

  /** The Replace button. Must be called synchronously from its click (see the module note). */
  function confirmReplace() {
    const kind = confirm.value
    confirm.value = null
    if (persistence.loading) {
      if (kind === 'load') settleReplace(false)
      return
    }
    if (kind === 'open') void persistence.openFile()
    else if (kind === 'load') settleReplace(true)
    else if (kind === 'new') startNewProject()
  }

  function cancelConfirm() {
    if (confirm.value === 'load') settleReplace(false)
    confirm.value = null
  }

  function openConnect() {
    menuOpen.value = false
    connectOpen.value = true
  }

  function closeConnect() {
    connectOpen.value = false
  }

  /**
   * Escape: close the topmost thing this menu owns, if any.
   *
   * @returns {boolean} Whether anything was closed — the caller `preventDefault`s only then,
   *   so an Escape with nothing open still reaches the History strip's "leave preview".
   */
  function dismissTopmost() {
    if (exportDialog.isOpen) {
      exportDialog.close()
      return true
    }
    if (resolutionDialog.isOpen) {
      resolutionDialog.close()
      return true
    }
    if (projectSettings.isOpen) {
      projectSettings.close()
      return true
    }
    if (confirm.value !== null) {
      if (confirm.value === 'load') settleReplace(false)
      confirm.value = null
      return true
    }
    if (connectOpen.value) {
      connectOpen.value = false
      return true
    }
    if (menuOpen.value) {
      menuOpen.value = false
      return true
    }
    return false
  }

  return {
    menuOpen,
    connectOpen,
    confirm,
    anyOpen,
    hasContent,
    openMenu,
    closeMenu,
    toggleMenu,
    saveLocal,
    requestExport,
    requestResolution,
    requestProjectSettings,
    requestOpen,
    requestNew,
    requestMerge,
    requestLoad,
    confirmReplace,
    cancelConfirm,
    openConnect,
    closeConnect,
    dismissTopmost,
  }
})
