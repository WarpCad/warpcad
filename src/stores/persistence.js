/**
 * Local persistence, as the UI sees it (`TODO/io-001`): autosave and restore,
 * the save-status chip's state, and the file Save / Open API `ui-033` builds its
 * File ▾ menu on.
 *
 * UI state and orchestration only. The mechanisms are framework-free and live in
 * `src/storage/` (when to write, IndexedDB, file pickers) and `src/core/project.js`
 * (what the bytes are); this store joins them to the document store and turns
 * their outcomes into the one status surface — the header's `save-status` chip
 * (`docs/decisions/interaction-model-qa.md`, cross-cutting "The one status
 * surface"): transient success notices, **persistent errors**, silence only for a
 * user-cancelled picker.
 *
 * ## What `ui-033` calls
 *
 * - `fileCapabilities` — `{ mode, canSaveInPlace, saveLabel, saveAsLabel, openLabel }`.
 *   Label the menu from it: `Save` / `Save As…` when `mode === 'native'`, a single
 *   `Download copy` (no Save As…) when `'fallback'`. Both items carry
 *   `data-testid="file-save"`.
 * - `saveFile({ saveAs })` — serialises the document and writes it; sets the chip.
 *   Ctrl/Cmd+S calls `saveFile()`.
 * - `openFile()` — opens the picker (call it synchronously from the click) and
 *   replaces the document. **It does not confirm**: if `documentStore.count > 0`,
 *   show the `file-open-confirm` dialog *first* and call `openFile()` only on
 *   Replace, so a cancelled picker after a confirmed replace can never lose work.
 * - `openText(text, name)` — the same, minus the picker, for a caller that already
 *   has the text.
 * - `chipText` / `chipTone` / `errorMessage` / `dismissError()` — what the chip shows.
 *
 * ## Restore goes through the same seeding as everything else
 *
 * `documentStore.load` → `WarpDocument.loadEntries`, which clears both undo
 * stacks exactly as `createDocument`'s seed loop does (data-003, section 19:
 * "undo history does not survive a reload"). The restore path never touches the
 * history stacks itself, so that stays true by construction.
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { ReplayRejection } from '../core/document.js'
import { ProjectFormatError, parseProject, serializeProject } from '../core/project.js'
import { createAutosaver } from '../storage/autosave.js'
import { createFileStorage } from '../storage/fileSystem.js'
import { createIndexedDbBackend } from '../storage/indexeddb.js'
import { createLocalStorageMirror } from '../storage/localMirror.js'
import { useDocumentStore } from './document.js'

/** How long the "Restored your last session" notice stays before the chip returns to rest. */
const RESTORED_NOTICE_MS = 6000
/** Transient result notices (`section 9`: 4 s for a confirmed save, 6 s for a started download). */
const SAVED_NOTICE_MS = 4000
const DOWNLOAD_NOTICE_MS = 6000

/**
 * @typedef {object} PersistenceDependencies
 * @property {import('../storage/autosave.js').AutosaveBackend} backend
 * @property {import('../storage/fileSystem.js').FileStorage} files
 * @property {import('../storage/localMirror.js').SyncMirror} [mirror] The synchronous
 *   safety copy a dying page can still write; omitted in tests that do not care.
 */

/** @type {PersistenceDependencies | null} */
let dependencies = null

/**
 * Replace the storage boundary — for tests, which must never reach a real
 * IndexedDB or a real picker. Pass `null` to go back to the real ones.
 *
 * @param {PersistenceDependencies | null} next
 */
export function setPersistenceDependencies(next) {
  dependencies = next
}

/** @returns {PersistenceDependencies} */
function resolveDependencies() {
  dependencies ??= {
    backend: createIndexedDbBackend(),
    files: createFileStorage(),
    mirror: createLocalStorageMirror(),
  }
  return dependencies
}

/**
 * Local `HH:MM`, 24 h — deterministic across locales, which a spec can assert on.
 *
 * @param {number} epochMs
 */
function clock(epochMs) {
  const date = new Date(epochMs)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function reasonOf(error) {
  if (error instanceof ProjectFormatError || error instanceof ReplayRejection) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

export const usePersistenceStore = defineStore('persistence', () => {
  const documentStore = useDocumentStore()
  const deps = resolveDependencies()

  /** @type {import('vue').Ref<'idle' | 'saving' | 'saved'>} */
  const autosaveState = ref('idle')
  const savedAt = ref(0)
  /** Transient message over the resting text; cleared by its own timer. */
  const notice = ref('')
  /** Persistent, until the next success or a dismissal. */
  const errorMessage = ref('')

  /** @type {ReturnType<typeof setTimeout> | null} */
  let noticeTimer = null
  let started = false
  let startPromise = /** @type {Promise<void> | null} */ (null)
  /** @type {(() => void) | null} */
  let stopWatch = null

  /**
   * @param {string} text
   * @param {number} ms
   */
  function showNotice(text, ms) {
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    notice.value = text
    noticeTimer = setTimeout(() => {
      notice.value = ''
      noticeTimer = null
    }, ms)
  }

  function clearNotice() {
    if (noticeTimer !== null) clearTimeout(noticeTimer)
    noticeTimer = null
    notice.value = ''
  }

  const autosaver = createAutosaver({
    backend: deps.backend,
    mirror: deps.mirror,
    getText: () => serializeProject(documentStore.raw),
    onStatus(status) {
      if (status.state === 'saving') {
        autosaveState.value = 'saving'
      } else if (status.state === 'saved') {
        autosaveState.value = 'saved'
        savedAt.value = status.at
        errorMessage.value = ''
      } else {
        // Persistent: stays until a write succeeds or the user dismisses it.
        errorMessage.value = status.message
      }
    },
  })

  const chipTone = computed(() => {
    if (errorMessage.value) return 'error'
    if (autosaveState.value === 'saving') return 'saving'
    if (autosaveState.value === 'saved') return 'saved'
    return 'idle'
  })

  const chipText = computed(() => {
    if (errorMessage.value) return errorMessage.value
    if (notice.value) return notice.value
    if (autosaveState.value === 'saving') return 'Saving…'
    if (autosaveState.value === 'saved') return `Saved · ${clock(savedAt.value)}`
    return 'Autosave on'
  })

  /**
   * Parse, then load — the two-stage "fully validated before anything is
   * replaced" of section 10. Nothing is changed unless both stages pass.
   *
   * @param {string} text
   * @returns {{ ok: true, steps: number } | { ok: false, message: string }}
   */
  function loadText(text) {
    try {
      const { entries, rollbackAt } = parseProject(text)
      documentStore.load(entries, rollbackAt)
      return { ok: true, steps: entries.length }
    } catch (error) {
      return { ok: false, message: reasonOf(error) }
    }
  }

  /** Restore the last autosave, then start listening for edits. */
  async function run() {
    const versionAtStart = documentStore.raw.version
    const restored = await autosaver.restore()
    const editedDuringRestore = documentStore.raw.version !== versionAtStart
    let needsWrite = false

    if (restored.kind === 'failed') {
      errorMessage.value = restored.message
    } else if (restored.kind === 'found') {
      if (editedDuringRestore) {
        // The user got to the canvas before the read came back. Their edit is the
        // newer truth; replacing it with the older stored session would destroy
        // work in front of them. Their edit is autosaved below instead.
      } else {
        const loaded = loadText(restored.text)
        if (loaded.ok && restored.fromMirror) {
          // The page died before IndexedDB committed; the synchronous copy is the newer
          // truth. Push it into IndexedDB now (the mirror is cleared once that lands).
          needsWrite = true
        }
        if (loaded.ok) {
          savedAt.value = restored.savedAt
          autosaveState.value = 'saved'
          showNotice('Restored your last session', RESTORED_NOTICE_MS)
        } else {
          // Keep the unreadable copy where the next autosave cannot overwrite it,
          // and say so: silently starting empty and then autosaving over a
          // recoverable project is the failure this whole branch exists to stop.
          autosaver.clearMirror()
          try {
            await deps.backend.keepUnreadable({ text: restored.text, savedAt: restored.savedAt })
          } catch {
            /* storage is failing anyway; the message below is still true */
          }
          errorMessage.value = `Couldn't restore your last session (${loaded.message}) — the unreadable copy was kept`
        }
      }
    }

    // Installed *after* the restore so restoring is not itself an edit to save.
    stopWatch = watch(
      () => documentStore.version,
      () => autosaver.notifyChange(),
    )
    if (editedDuringRestore || needsWrite) autosaver.notifyChange()
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onDocumentVisibility)
    }
  }

  /**
   * Restore the last session and begin autosaving. Idempotent — safe to call from
   * a component that may mount twice (HMR, a test).
   *
   * @returns {Promise<void>}
   */
  function start() {
    if (!started) {
      started = true
      startPromise = run()
    }
    return /** @type {Promise<void>} */ (startPromise)
  }

  /**
   * Write anything pending now. Never rejects. The dying-page path: the synchronous
   * mirror first (the only write guaranteed to land), then IndexedDB.
   */
  function flush() {
    autosaver.flushSync()
    return autosaver.flush()
  }

  /**
   * Flush on the way out — mobile Safari kills a backgrounded tab without
   * warning, and a debounce alone would lose the last edit.
   *
   * @param {'visible' | 'hidden' | string} visibility
   */
  function onVisibilityChange(visibility) {
    if (visibility === 'hidden') void flush()
  }

  function onDocumentVisibility() {
    onVisibilityChange(document.visibilityState)
  }

  function onPageHide() {
    void flush()
  }

  /** Stop listening. Tests, and HMR teardown. */
  function stop() {
    stopWatch?.()
    stopWatch = null
    autosaver.dispose()
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onDocumentVisibility)
    }
    started = false
    startPromise = null
  }

  /**
   * Save the project to a file: `Save`/`Save As…` where the browser can write a
   * file in place, otherwise a downloaded copy. Sets the chip either way.
   *
   * @param {{ saveAs?: boolean }} [options]
   * @returns {Promise<import('../storage/fileSystem.js').SaveResult>}
   */
  async function saveFile({ saveAs = false } = {}) {
    const result = await deps.files.save(serializeProject(documentStore.raw), { saveAs })
    if (result.ok) {
      errorMessage.value = ''
      if (result.mode === 'native') {
        showNotice(`Saved to ${result.name} · ${clock(Date.now())}`, SAVED_NOTICE_MS)
      } else {
        // "Started", never "saved": a download cannot be confirmed to have landed.
        showNotice(`Download started: ${result.name}`, DOWNLOAD_NOTICE_MS)
      }
    } else if (!('cancelled' in result)) {
      clearNotice()
      errorMessage.value = `Couldn't save ${result.name ?? 'the project file'}: ${result.error}`
    }
    return result
  }

  /**
   * Replace the document with a project's text.
   *
   * @param {string} text
   * @param {string} name File name, for the chip and for a refusal.
   * @returns {{ ok: true, name: string, steps: number } | { ok: false, message: string }}
   */
  function openText(text, name) {
    const loaded = loadText(text)
    if (!loaded.ok) {
      clearNotice()
      errorMessage.value = `Couldn't open ${name}: ${loaded.message}`
      return { ok: false, message: loaded.message }
    }
    errorMessage.value = ''
    showNotice(`Opened ${name} · ${loaded.steps} step${loaded.steps === 1 ? '' : 's'}`, SAVED_NOTICE_MS)
    return { ok: true, name, steps: loaded.steps }
  }

  /**
   * Pick a file and open it. See the module note: this does not confirm a
   * replace, and it must be called synchronously from the user's click.
   *
   * @returns {Promise<{ ok: true, name: string, steps: number } | { ok: false, cancelled: true } | { ok: false, message: string }>}
   */
  async function openFile() {
    const picked = await deps.files.open()
    if (!picked.ok) {
      if ('cancelled' in picked) return { ok: false, cancelled: true }
      clearNotice()
      errorMessage.value = `Couldn't open ${picked.name ?? 'the file'}: ${picked.error}`
      return { ok: false, message: picked.error }
    }
    const opened = openText(picked.text, picked.name)
    // Only a file that actually loaded may become the Save target — adopting a
    // refused one would let the next Save overwrite it with the current document.
    if (opened.ok) deps.files.adopt(picked)
    return opened
  }

  function dismissError() {
    errorMessage.value = ''
  }

  /**
   * Put a transient result message on the one status surface — what `Exported union-1.stl`
   * (`TODO/ui-034`) uses. A notice, not an error: it clears itself, and it does not touch a
   * persistent error that is already showing (that outranks it in `useStatusSurface`).
   *
   * @param {string} text
   */
  function announce(text) {
    showNotice(text, DOWNLOAD_NOTICE_MS)
  }

  return {
    autosaveState,
    savedAt,
    notice,
    errorMessage,
    chipText,
    chipTone,
    fileCapabilities: deps.files.capabilities,
    start,
    stop,
    flush,
    onVisibilityChange,
    saveFile,
    openFile,
    openText,
    dismissError,
    announce,
  }
})
