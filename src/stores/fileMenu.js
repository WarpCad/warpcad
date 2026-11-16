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
 * ## A shared project (`TODO/io-016`)
 *
 * The Shared view's **Make my own copy to edit** is an Open of text that is already in hand, so it
 * goes through this same flow ({@link requestOpenShared}) instead of a second one: the same
 * **Replace the project?** confirm when the browser holds content (with a **Save or download yours
 * first** route, since the Shared view has no File menu), straight in when it holds nothing. The
 * one extra branch: a link whose project id equals the open project's is the sender re-sending an
 * update, so it asks **Merge their changes** (`mergeIn`, with its Undo-merge toast) or **Open
 * theirs instead**, and never offers to replace with a stranger's copy.
 *
 * ## Save as gist (`TODO/io-021`)
 *
 * **File ▾ → Save as gist…** is a second entry point to `useGistPublish`, not a second
 * implementation: the first save is its `publish()` (from a small dialog that asks the name and
 * Secret / Public, or the connect step without a token), and once the project has a gist this
 * account wrote, the same item reads **Save to gist** and calls `update()` straight away — which
 * merges a gist changed elsewhere in first (`TODO/io-019`), and opens the dialog with the reason
 * when it cannot. The gist is saved only by that item (or the Share sheet): Ctrl/Cmd+S
 * stays local, and the chip says how far behind the gist is instead of pushing.
 *
 * ## Import model… and Import part file… (`TODO/ui-107`)
 *
 * Two items in the "This device" group, right after **Merge file…**: **Import model…** brings an
 * STL or 3MF into the open project (`stores/modelImport.js`), placed in the view; **Import part
 * file…** reads WarpCad's own part file into My parts (`stores/library.js`'s `importText`). Both
 * change the document or what it is built from, so both are dimmed with {@link importReason}
 * while History previews a past step, the rule every document-changing item follows. The picker
 * itself is a hidden `<input type=file>` in `FileMenu.vue`, clicked inside the gesture once
 * {@link requestImport} says yes.
 *
 * ## In the native app (`TODO/io-014`)
 *
 * `persistence.fileCapabilities.mode === 'native-app'`: **Save** with no file yet, and **Save As…**,
 * first ask for a name in the name sheet ({@link nameRequest}, `ProjectNameDialog.vue`); a name
 * that is already another project's is refused there ({@link nameError}) and asked again.
 * **Open…** keeps the replace-confirm, then opens the Open sheet ({@link openSheetOpen},
 * `NativeOpenSheet.vue`) in place of the picker: the app's own projects, and **Browse…** for the
 * system document picker. Cancelling the sheet after a confirmed replace loses nothing, because
 * nothing is replaced until a file is chosen.
 *
 * A `.warpcad` (or legacy `.ndjson`) tapped in the Files app or Mail reaches the app through the shell's open-URL queue
 * ({@link openInbound}): it is copied into Documents if it lives elsewhere, then goes through
 * {@link requestOpenShared}, so a copy of the open project asks **Merge their changes** or **Open
 * theirs instead** (`ui-062`), anything to lose asks **Replace the project?**, and an empty
 * project opens it at once.
 *
 * ## What "non-empty" means
 *
 * Any step in the log, not the body count: a project whose every step is suppressed has no
 * bodies and is still someone's work.
 *
 * @module stores/fileMenu
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef, toRaw, watch } from 'vue'

import { parseNdjson } from '../core/ndjson.js'
import { projectIdOfRecords } from '../core/shareCopy.js'
import { DEFAULT_SHARE_NAME } from '../core/shareLink.js'
import { importOpenedFile, readProjectFile, takeOpenedFiles } from '../native/files.js'
import { useAlignReferenceStore } from './alignReference.js'
import { useDocumentStore } from './document.js'
import { useExportDialogStore } from './exportDialog.js'
import { useGistStore } from './gist.js'
import { createGistPublisher } from './gistPublish.js'
import { useHostedStore } from './hosted.js'
import { useMergeStore } from './merge.js'
import { usePersistenceStore } from './persistence.js'
import { useProjectSettingsStore } from './projectSettings.js'
import { useResolutionDialogStore } from './resolutionDialog.js'
import { useSharedOpenStore } from './sharedOpen.js'
import { IMPORT_PREVIEW_REASON } from './modelImport.js'
import { useTimelineStore } from './timeline.js'
import { useToastsStore } from './toasts.js'

/** @typedef {'open' | 'load' | 'new' | 'share' | 'share-update'} ConfirmKind */

/** How long the *Saved to gist* toast stays (`TODO/io-021`): longer than the default, it carries Copy link. */
const GIST_TOAST_MS = 6000
/** The toast queue key of the *Saved to gist* toast (`stores/toasts.js`). */
const GIST_TOAST_KEY = 'gist-save'

/**
 * What the Save as gist dialog shows: the token step, the first save's form, or **Save to gist**
 * again after it was refused.
 *
 * @typedef {'connect' | 'create' | 'update'} GistSaveStep
 */

/** @typedef {import('./sharedOpen.js').SharedOpenRequest} SharedOpenRequest */

export const useFileMenuStore = defineStore('fileMenu', () => {
  const documentStore = useDocumentStore()
  const persistence = usePersistenceStore()
  const hosted = useHostedStore()
  const exportDialog = useExportDialogStore()
  const resolutionDialog = useResolutionDialogStore()
  const projectSettings = useProjectSettingsStore()
  const alignReference = useAlignReferenceStore()
  const sharedOpen = useSharedOpenStore()
  const merge = useMergeStore()
  const gist = useGistStore()
  const publisher = createGistPublisher()
  const timeline = useTimelineStore()

  /** `TODO/ui-107`: why Import model… and Import part file… are dimmed, or `''`. */
  const importReason = computed(() => (timeline.previewing ? IMPORT_PREVIEW_REASON : ''))

  /**
   * **Import model…** / **Import part file…** (`TODO/ui-107`): close the menu and say whether the
   * caller should open its file picker — synchronously, inside the click, which is the gesture the
   * `<input type=file>` needs. Dimmed (and a no-op) while History previews.
   *
   * @returns {boolean}
   */
  function requestImport() {
    if (importReason.value !== '') return false
    menuOpen.value = false
    exportDialog.close()
    resolutionDialog.close()
    return true
  }

  const menuOpen = ref(false)
  const connectOpen = ref(false)
  /** `TODO/io-017`: the gist token dialog (**Connect GitHub for gists…**, or the Share sheet's button). */
  const gistConnectOpen = ref(false)
  /** Which replace question is showing, or `null`. @type {import('vue').Ref<ConfirmKind | null>} */
  const confirm = ref(null)
  /** `TODO/io-016`: the shared project the `share` / `share-update` question is about. */
  const pendingShared = shallowRef(/** @type {SharedOpenRequest | null} */ (null))
  /** `TODO/io-014`: the name sheet's pending Save (`saveAs`, and the name it offers), or `null`. */
  const nameRequest = ref(/** @type {{ saveAs: boolean, name: string } | null} */ (null))
  /** Why the name sheet's last name was refused, or `''`. */
  const nameError = ref('')
  /** A named save is being written: the sheet's Save button waits. */
  const nameBusy = ref(false)
  /** `TODO/io-014`: the native app's Open sheet. */
  const openSheetOpen = ref(false)
  /** `TODO/io-021`: the **Save as gist…** dialog. */
  const gistSaveOpen = ref(false)
  /** The last gist save's failure, in `gistMessages.js`'s wording, for that dialog — or `''`. */
  const gistSaveError = ref('')
  const toasts = useToastsStore()
  /** The short link the *Saved to gist* toast's **Copy link** copies. */
  const gistToastLink = shallowRef('')
  /** The toast after a gist save: its words and the short link its **Copy link** copies. It lives on the toast queue. */
  const gistSaveToast = computed(() => {
    const toast = toasts.items.find((t) => t.key === GIST_TOAST_KEY)
    return toast ? { text: toast.text, link: gistToastLink.value } : null
  })
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
      gistConnectOpen.value ||
      gistSaveOpen.value ||
      confirm.value !== null ||
      nameRequest.value !== null ||
      openSheetOpen.value ||
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
    if (persistence.needsFileName(saveAs)) {
      nameError.value = ''
      nameRequest.value = { saveAs, name: persistence.suggestedFileName() }
      return
    }
    void persistence.saveFile({ saveAs })
  }

  /**
   * The name sheet's **Save** (`TODO/io-014`): write under `name`. A name that is taken, or not a
   * file name, keeps the sheet open with the reason; anything else closes it, and the chip reports.
   *
   * @param {string} name as typed
   * @returns {Promise<void>}
   */
  async function saveNamed(name) {
    const request = nameRequest.value
    if (request === null || nameBusy.value) return
    nameBusy.value = true
    try {
      const result = await persistence.saveFile({ saveAs: request.saveAs, name })
      // Asked again: a taken name, no name, or one that is not a file name (no file was named).
      const askAgain = !result.ok && ('exists' in result || 'needsName' in result || ('error' in result && !('name' in result)))
      if (askAgain && 'error' in result) {
        nameError.value = result.error
        return
      }
      nameRequest.value = null
      nameError.value = ''
    } finally {
      nameBusy.value = false
    }
  }

  function cancelNamed() {
    nameRequest.value = null
    nameError.value = ''
  }

  /** What Open does once nothing is in the way: the Open sheet in the native app, else the picker. */
  function beginOpen() {
    if (persistence.fileCapabilities.mode === 'native-app') {
      openSheetOpen.value = true
      return
    }
    void persistence.openFile()
  }

  /**
   * The Open sheet's row: open one of the app's own projects. Called after the replace-confirm.
   *
   * @param {string} name
   */
  function openFromSheet(name) {
    openSheetOpen.value = false
    void persistence.openProjectFile(name)
  }

  /** The Open sheet's **Browse…**: the system document picker. */
  function browseFromSheet() {
    openSheetOpen.value = false
    void persistence.openFile()
  }

  function closeOpenSheet() {
    openSheetOpen.value = false
  }

  /** One {@link openInbound} at a time. */
  let inboundBusy = false

  /**
   * Open the newest project the shell was asked to open (`TODO/io-014`). A no-op outside the
   * native app and while a load is pending; the shell keeps the file queued until then.
   *
   * @returns {Promise<void>}
   */
  async function openInbound() {
    if (inboundBusy || persistence.loading || persistence.fileCapabilities.mode !== 'native-app') return
    inboundBusy = true
    try {
      const last = (await takeOpenedFiles()).at(-1)
      if (last === undefined) return
      /** @type {string} */
      let name
      /** @type {string} */
      let text
      try {
        name = await importOpenedFile(last)
        text = (await readProjectFile(name)).text
      } catch (error) {
        persistence.announce(`Couldn't open ${last.name}: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      /** @type {string | null} */
      let projectId = null
      try {
        projectId = projectIdOfRecords(parseNdjson(text).records)
      } catch {
        // Not readable as a project: Open refuses it by name, as for any file.
      }
      requestOpenShared({ name, copyText: text, theirText: text, projectId, leave: () => {}, fileName: name })
    } finally {
      inboundBusy = false
    }
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
    beginOpen()
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

  /**
   * **Make my own copy to edit** in the Shared view (`TODO/io-016`) — {@link requestOpen} for text
   * already in hand. The same project as the one open here (equal ids) asks Merge or Open theirs;
   * anything to lose asks the replace question; an empty browser opens straight away.
   *
   * @param {SharedOpenRequest} request
   */
  function requestOpenShared(request) {
    menuOpen.value = false
    if (persistence.loading) return
    pendingShared.value = request
    const liveId = toRaw(documentStore.raw).mergeState().projectId
    if (request.projectId !== null && liveId === request.projectId) {
      confirm.value = 'share-update'
      return
    }
    if (hasContent()) {
      confirm.value = 'share'
      return
    }
    openShared('copy')
  }

  // `TODO/ui-109`: the Shared view and the gist link ask through `stores/sharedOpen.js` (they cannot
  // import this store); take each request as it arrives, or the one waiting when this store is made.
  watch(
    () => sharedOpen.request,
    (request) => {
      if (request === null) return
      sharedOpen.request = null
      requestOpenShared(request)
    },
    { immediate: true, flush: 'sync' },
  )

  /**
   * Land the pending shared project: as the recipient's own copy (a new project id), as theirs
   * (the id it came with), or merged into the open project.
   *
   * @param {'copy' | 'theirs' | 'merge'} how
   */
  function openShared(how) {
    const request = pendingShared.value
    pendingShared.value = null
    if (request === null) return
    request.leave()
    if (how === 'merge') void persistence.mergeText(request.theirText, request.name)
    else if (request.fileName !== undefined) void persistence.openProjectFile(request.fileName)
    else void persistence.openText(how === 'copy' ? request.copyText : request.theirText, request.name)
  }

  /** **Merge their changes** — the `share-update` question's merge answer. */
  function confirmMerge() {
    if (confirm.value !== 'share-update') return
    confirm.value = null
    if (persistence.loading) {
      pendingShared.value = null
      return
    }
    openShared('merge')
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
      pendingShared.value = null
      return
    }
    if (kind === 'open') beginOpen()
    else if (kind === 'load') settleReplace(true)
    else if (kind === 'new') startNewProject()
    // `share-update`'s replace answer is **Open theirs instead**: the same project, so its id stays.
    else if (kind === 'share') openShared('copy')
    else if (kind === 'share-update') openShared('theirs')
  }

  function cancelConfirm() {
    if (confirm.value === 'load') settleReplace(false)
    confirm.value = null
    pendingShared.value = null
  }

  function openConnect() {
    menuOpen.value = false
    connectOpen.value = true
  }

  function closeConnect() {
    connectOpen.value = false
  }

  /** Why **Save as gist…** is dimmed (Publish's own `no-bodies` rule), or `''`. */
  const gistSaveReason = computed(() => (documentStore.bodies.length === 0 ? 'Nothing to save yet' : ''))
  /**
   * The project's save target is a gist: it has one, written by the connected account — or, with
   * no account connected yet, one the connect step may turn out to own. Someone else's gist (a
   * file they sent) is not: saving makes a new gist of this account's own, as the Share sheet does.
   */
  const gistTarget = computed(() => {
    const field = publisher.gistField.value
    return field !== null && (!gist.connected || field.owner === gist.login)
  })
  /** `Save as gist…` (asks first) until there is a target, then `Save to gist` (saves at once). */
  const gistSaveLabel = computed(() => (gistTarget.value ? 'Save to gist' : 'Save as gist…'))
  /** @type {import('vue').ComputedRef<GistSaveStep>} */
  const gistSaveStep = computed(() => {
    if (!gist.connected) return 'connect'
    return gistTarget.value ? 'update' : 'create'
  })
  /** The dialog's Name pre-fill — `TODO/io-020`'s rule: the project's name, `Untitled` without one. */
  const gistSaveDefaultName = computed(() => (persistence.projectName.trim() === '' ? DEFAULT_SHARE_NAME : persistence.projectName))
  /** GitHub is being talked to: the dialog's Save is disabled and says so. */
  const gistSaveBusy = computed(() => publisher.busy.value)

  /**
   * **Save as gist…** / **Save to gist**. A no-op while dimmed. With a target and a connected
   * account it saves at once (an update); otherwise it opens the dialog (connect, or the form).
   */
  function requestSaveAsGist() {
    if (gistSaveReason.value !== '') return
    menuOpen.value = false
    exportDialog.close()
    resolutionDialog.close()
    gistSaveError.value = ''
    if (gistTarget.value && gist.connected) {
      void saveAsGist()
      return
    }
    gistSaveOpen.value = true
  }

  /**
   * Save the project to its gist: `publish()` the first time (with the dialog's name and Secret /
   * Public), `update()` once it has one. A failure keeps — or opens — the dialog with the reason
   * and writes nothing; success closes it and raises the toast.
   *
   * @param {{ name?: string, public?: boolean }} [choice] The dialog's answers; unused by an update.
   * @returns {Promise<import('./gistPublish.js').GistPublishOk | import('../core/gistMessages.js').GistFailure>}
   */
  async function saveAsGist(choice = {}) {
    gistSaveError.value = ''
    const result = gistTarget.value
      ? await publisher.update()
      : await publisher.publish({ ...(choice.name === undefined ? {} : { name: choice.name }), public: choice.public === true })
    if (!result.ok) {
      gistSaveError.value = result.message
      gistSaveOpen.value = true
      return result
    }
    gistSaveOpen.value = false
    const elsewhere = result.warning === 'project-changed' ? ', but another project is open now' : ''
    showGistToast(`Saved to gist: ${result.name}${elsewhere}`, result.link)
    return result
  }

  /** @param {string} text @param {string} link */
  function showGistToast(text, link) {
    gistToastLink.value = link
    toasts.show({
      key: GIST_TOAST_KEY,
      testid: 'save-gist-toast',
      text,
      lingerMs: GIST_TOAST_MS,
      action: { label: 'Copy link', testid: 'save-gist-toast-copy', run: () => void copyGistLink(link) },
    })
  }

  /**
   * The toast's **Copy link**: a new tap, so the clipboard write has its own activation. On
   * success the toast says so; if the clipboard refuses it shows the link to copy by hand.
   *
   * @param {string} link
   */
  async function copyGistLink(link) {
    try {
      await navigator.clipboard.writeText(link)
      toasts.update(GIST_TOAST_KEY, { text: 'Gist link copied', action: null, link: null, lingerMs: GIST_TOAST_MS })
    } catch {
      toasts.update(GIST_TOAST_KEY, {
        action: null,
        link: { value: link, label: 'The gist link', testid: 'save-gist-toast-link' },
        lingerMs: GIST_TOAST_MS,
      })
    }
  }

  function dismissGistToast() {
    toasts.dismiss(GIST_TOAST_KEY)
  }

  function closeSaveAsGist() {
    gistSaveOpen.value = false
    gistSaveError.value = ''
  }

  /** Open the gist token dialog (`TODO/io-017`), from File ▾ or from the Share sheet. */
  function openGistConnect() {
    menuOpen.value = false
    gistConnectOpen.value = true
  }

  function closeGistConnect() {
    gistConnectOpen.value = false
  }

  /**
   * Escape: close the topmost thing this menu owns, if any.
   *
   * @returns {boolean} Whether anything was closed — the caller `preventDefault`s only then,
   *   so an Escape with nothing open still reaches the History strip's "leave preview".
   */
  function dismissTopmost() {
    if (nameRequest.value !== null) {
      cancelNamed()
      return true
    }
    if (openSheetOpen.value) {
      openSheetOpen.value = false
      return true
    }
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
      pendingShared.value = null
      return true
    }
    if (connectOpen.value) {
      connectOpen.value = false
      return true
    }
    if (gistConnectOpen.value) {
      gistConnectOpen.value = false
      return true
    }
    if (gistSaveOpen.value) {
      closeSaveAsGist()
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
    gistConnectOpen,
    confirm,
    anyOpen,
    hasContent,
    openMenu,
    closeMenu,
    toggleMenu,
    saveLocal,
    nameRequest,
    nameError,
    nameBusy,
    saveNamed,
    cancelNamed,
    openSheetOpen,
    openFromSheet,
    browseFromSheet,
    closeOpenSheet,
    openInbound,
    requestExport,
    requestResolution,
    requestProjectSettings,
    requestOpen,
    requestNew,
    requestMerge,
    importReason,
    requestImport,
    requestLoad,
    requestOpenShared,
    pendingShared,
    confirmReplace,
    confirmMerge,
    cancelConfirm,
    openConnect,
    closeConnect,
    openGistConnect,
    closeGistConnect,
    gistSaveOpen,
    gistSaveError,
    gistSaveToast,
    gistSaveReason,
    gistSaveLabel,
    gistSaveStep,
    gistSaveDefaultName,
    gistSaveBusy,
    requestSaveAsGist,
    saveAsGist,
    closeSaveAsGist,
    dismissGistToast,
    dismissTopmost,
  }
})
