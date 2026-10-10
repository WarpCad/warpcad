// SPDX-License-Identifier: AGPL-3.0-or-later
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
 * - `chipText` / `chipTone` / `errorMessage` / `loadWarning` / `dismissError()` — what the chip shows.
 * - `loading` — `Opening <name>…` / `Restoring your last session…` while a load is announced
 *   and folding, `''` otherwise. The File button reads busy from it (`TODO/core-032`).
 *
 * ## A load is announced before it folds (`TODO/core-032`)
 *
 * Open, hosted Load and autosave restore fold records this page has never built, on the
 * main thread: 70-200 ms on the large measured fixtures, three to four times that on a
 * phone (`docs/decisions/kernel-evaluation-worker.md`, slice 4). That block is kept — a
 * worker fold was measured and rejected there — but it is never *silent*: `loading` is set,
 * one frame is painted with it (`nextPaint`), and only then does the same synchronous,
 * atomic `loadEntries` run. A refusal is unchanged, just after the pending state, which it
 * clears. While one load is pending no other Open or Load can start.
 *
 * ## The opened file changed on disk (`TODO/ai-009`)
 *
 * The MCP server (`mcp/server.js`) edits a **closed** project file; if the app has the same
 * file open, the server cannot know (`docs/decisions/ai-partner.md` decision 6). So the app
 * looks: on window focus, on the tab becoming visible, and before every in-place Save, it
 * re-reads the file it opened or last saved (`FileStorage.readCurrent`) and compares the bytes
 * with what it last read or wrote. A difference sets `diskChanged`, the chip reads
 * {@link DISK_CHANGED_TEXT}, and the `disk-change` dialog asks — the hosted conflict dialog's
 * rules for a local file: **Reload** (replace this project with the file), **Overwrite the
 * file** (write this project over it), or **Cancel** (decide later; the chip keeps saying so,
 * and tapping it asks again). **No merge, ever**, and nothing is overwritten without that
 * explicit answer: an in-place Save while the file has changed raises the dialog instead of
 * writing.
 *
 * What can be seen depends on the engine, and the UI never pretends otherwise
 * (`diskCanWatch`): only a file opened or saved through **File System Access** (desktop
 * Chromium) has a handle to read again. A file picked with `<input type=file>` — Firefox,
 * Safari, every phone and tablet — is a one-time copy, so a change to it cannot be noticed;
 * **File ▸ Open…** again is how its new rows come in (`docs/mcp.md`).
 *
 * The dialog waits while a drag or another dialog is open (`setUiBusy`, wired by the File
 * menu exactly as for the hosted conflict), so it never lands under a finger.
 *
 * ## Restore goes through the same seeding as everything else
 *
 * `documentStore.load` → `WarpDocument.loadEntries`, which clears both undo
 * stacks exactly as `createDocument`'s seed loop does (data-003, section 19:
 * "undo history does not survive a reload"). The restore path never touches the
 * history stacks itself, so that stays true by construction.
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'

import { ReplayRejection } from '../core/document.js'
import { DEFAULT_RESOLUTION } from '../core/kernel/tessellation.js'
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

/** The chip's words while the opened file has changed on disk (`TODO/ai-009`). */
export const DISK_CHANGED_TEXT = 'File changed on disk — Reload'

/**
 * @typedef {object} PersistenceDependencies
 * @property {import('../storage/autosave.js').AutosaveBackend} backend
 * @property {import('../storage/fileSystem.js').FileStorage} files
 * @property {import('../storage/localMirror.js').SyncMirror} [mirror] The synchronous
 *   safety copy a dying page can still write; omitted in tests that do not care.
 * @property {() => Promise<void>} [nextPaint] Resolves once a frame showing the current
 *   state has been painted (`TODO/core-032`) — the UI boundary a load waits on before it
 *   folds. The real one is {@link afterNextPaint}; omitted (a test that does not care), the
 *   load folds on the next microtask.
 */

/** A hidden tab paints nothing, so a load never waits on a frame for longer than this. */
const PAINT_WAIT_LIMIT_MS = 100

/**
 * Resolve after the browser has painted the current DOM: a `requestAnimationFrame` callback
 * runs just *before* a paint, and a task queued from it runs after that paint. Raced with a
 * short timeout, because a background tab never runs the frame at all — an autosave
 * restore in a tab opened behind another must still load.
 *
 * @returns {Promise<void>}
 */
export function afterNextPaint() {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    const limit = setTimeout(finish, PAINT_WAIT_LIMIT_MS)
    if (typeof requestAnimationFrame !== 'function') {
      clearTimeout(limit)
      finish()
      return
    }
    requestAnimationFrame(() => {
      setTimeout(() => {
        clearTimeout(limit)
        finish()
      }, 0)
    })
  })
}

/** What a load that has no painted frame to wait for waits on: the next microtask. */
const noPaint = () => Promise.resolve()

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
    nextPaint: afterNextPaint,
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

/**
 * One sentence naming every record a load skipped (`TODO/sketch-001`'s retired
 * `sketch.line` records), grouped by reason: "skipped 2 steps (sketch-1, sketch-2): sketch
 * lines are no longer supported — redraw them in a Sketch primitive".
 *
 * @param {readonly import('../core/project.js').LoadWarning[]} warnings
 * @returns {string}
 */
function describeSkipped(warnings) {
  /** @type {Map<string, string[]>} */
  const byReason = new Map()
  for (const warning of warnings) {
    const ids = byReason.get(warning.message) ?? []
    ids.push(warning.id ?? warning.op)
    byReason.set(warning.message, ids)
  }
  return [...byReason]
    .map(([message, ids]) => `skipped ${ids.length} step${ids.length === 1 ? '' : 's'} (${ids.join(', ')}): ${message}`)
    .join('; ')
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
  /**
   * What the last load had to leave out — retired records, an image dropped as unsafe
   * (`TODO/sketch-003`). Persistent until the next load, File ▸ New or a dismissal — and,
   * unlike {@link errorMessage}, **not** cleared by the autosave that every load triggers:
   * that save lands about a second later, and used to wipe the report off the chip before
   * anyone could read which records were dropped.
   */
  const loadWarning = ref('')
  /**
   * The load being announced and folded (`TODO/core-032`), or `''`. Outranks everything on
   * the chip: it is what is happening right now.
   */
  const loading = ref('')
  const nextPaint = deps.nextPaint ?? noPaint

  /**
   * `TODO/ai-009`: what this session last read from, or wrote to, the file it has a handle on —
   * `null` when it has none (nothing opened or saved natively, the fallback path, File ▸ New).
   * `lastModified` is `null` after a Save, where the new stamp is not known until the next read.
   *
   * @type {{ text: string, lastModified: number | null } | null}
   */
  let diskKnown = null
  /**
   * The file's newer bytes, while they differ from {@link diskKnown}. Not reactive-deep: the
   * text can be large and is only ever replaced whole.
   *
   * @type {import('vue').ShallowRef<{ name: string, text: string, lastModified: number } | null>}
   */
  const diskChange = shallowRef(null)
  /** Whether the user wants the dialog showing (false after Cancel, until asked again). */
  const diskPromptWanted = ref(false)
  /** A drag or another dialog is in the way; set by the File menu. */
  const uiBusy = ref(false)
  /** Whether a change to the open file can be noticed at all (a native handle is held). */
  const diskCanWatch = ref(false)
  /** @type {Promise<void> | null} */
  let diskCheck = null

  const diskChanged = computed(() => diskChange.value !== null)
  const diskChangeName = computed(() => diskChange.value?.name ?? '')
  const diskPromptOpen = computed(() => diskChange.value !== null && diskPromptWanted.value && !uiBusy.value)

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

  /** @type {import('vue').ComputedRef<import('../composables/useStatusSurface.js').StatusTone>} */
  const chipTone = computed(() => {
    if (loading.value) return 'saving'
    if (errorMessage.value) return 'error'
    if (loadWarning.value) return 'error'
    if (diskChange.value !== null) return 'warn'
    if (autosaveState.value === 'saving') return 'saving'
    if (autosaveState.value === 'saved') return 'saved'
    return 'idle'
  })

  const chipText = computed(() => {
    if (loading.value) return loading.value
    if (errorMessage.value) return errorMessage.value
    if (loadWarning.value) return loadWarning.value
    if (diskChange.value !== null) return DISK_CHANGED_TEXT
    if (notice.value) return notice.value
    if (autosaveState.value === 'saving') return 'Saving…'
    if (autosaveState.value === 'saved') return `Saved · ${clock(savedAt.value)}`
    return 'Autosave on'
  })

  /**
   * Parse, then load — the two-stage "fully validated before anything is
   * replaced" of section 10. Nothing is changed unless both stages pass.
   *
   * A record this build has retired is skipped rather than refusing the file
   * (`TODO/sketch-001`), and comes back as a `skipped` sentence the caller must show.
   *
   * @param {string} text
   * @returns {{ ok: true, steps: number, skipped: string } | { ok: false, message: string }}
   */
  function loadText(text) {
    try {
      const { entries, rollbackAt, resolution, standingInstructions, buildVolume, userParts, unavailableParts, warnings } =
        parseProject(text)
      documentStore.load(entries, rollbackAt, resolution, { standingInstructions, buildVolume, userParts, unavailableParts })
      return { ok: true, steps: entries.length, skipped: warnings.length > 0 ? describeSkipped(warnings) : '' }
    } catch (error) {
      return { ok: false, message: reasonOf(error) }
    }
  }

  /**
   * Announce `label`, let a frame paint it, then run `fold` — the one order every load
   * takes (`TODO/core-032`). `loading` is cleared however `fold` ends.
   *
   * @template T
   * @param {string} label
   * @param {() => T} fold
   * @returns {Promise<T>}
   */
  async function announced(label, fold) {
    loading.value = label
    try {
      await nextPaint()
      return fold()
    } finally {
      loading.value = ''
    }
  }

  /** Restore the last autosave, then start listening for edits. */
  async function run() {
    const versionAtStart = documentStore.raw.version
    const restored = await autosaver.restore()
    let editedDuringRestore = documentStore.raw.version !== versionAtStart
    let needsWrite = false

    if (restored.kind === 'failed') {
      errorMessage.value = restored.message
    } else if (restored.kind === 'found') {
      if (editedDuringRestore) {
        // The user got to the canvas before the read came back. Their edit is the
        // newer truth; replacing it with the older stored session would destroy
        // work in front of them. Their edit is autosaved below instead.
      } else {
        // An edit made during the announced frame is still the user getting there first.
        const loaded = await announced('Restoring your last session…', () =>
          documentStore.raw.version !== versionAtStart ? null : loadText(restored.text),
        )
        if (loaded === null) {
          // As above: their edit is the newer truth, and is autosaved below instead.
          editedDuringRestore = true
        } else if (loaded.ok) {
          // The page died before IndexedDB committed; the synchronous copy is the newer
          // truth. Push it into IndexedDB now (the mirror is cleared once that lands).
          if (restored.fromMirror) needsWrite = true
          savedAt.value = restored.savedAt
          autosaveState.value = 'saved'
          // Persistent, not a passing notice: the session lost records on the way in, and
          // the user has to be able to read which before the next autosave makes it final.
          if (loaded.skipped) loadWarning.value = `Restored your last session, but ${loaded.skipped}`
          else showNotice('Restored your last session', RESTORED_NOTICE_MS)
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
      window.addEventListener('focus', onWindowFocus)
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
    // Coming back to the tab is the other "focus" a phone gives (no window focus event there).
    else if (visibility === 'visible') void checkDiskFile()
  }

  function onWindowFocus() {
    void checkDiskFile()
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
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('focus', onWindowFocus)
    }
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
   * An in-place Save first looks at the file (`TODO/ai-009`): if it changed on disk since this
   * session read or wrote it, nothing is written and the disk-change dialog asks instead —
   * `{ ok: false, conflict: true }`.
   *
   * @param {{ saveAs?: boolean }} [options]
   * @returns {Promise<import('../storage/fileSystem.js').SaveResult | { ok: false, conflict: true }>}
   */
  async function saveFile({ saveAs = false } = {}) {
    if (!saveAs && diskKnown !== null && deps.files.capabilities.mode === 'native') {
      await checkDiskFile()
      if (diskChange.value !== null) {
        diskPromptWanted.value = true
        return { ok: false, conflict: true }
      }
    }
    return writeFile({ saveAs })
  }

  /**
   * The write itself, with no disk check — what Save does after its check, and what the
   * dialog's explicit **Overwrite the file** does.
   *
   * @param {{ saveAs: boolean }} options
   * @returns {Promise<import('../storage/fileSystem.js').SaveResult>}
   */
  async function writeFile({ saveAs }) {
    const text = serializeProject(documentStore.raw)
    const result = await deps.files.save(text, { saveAs })
    if (result.ok && result.mode === 'native') {
      // Now in step with the file this handle points at (a Save As points it somewhere new).
      diskKnown = { text, lastModified: null }
      diskChange.value = null
      diskPromptWanted.value = false
      diskCanWatch.value = true
    }
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
   * Replace the document with a project's text: announced as `Opening <name>…`, a frame
   * painted, then folded (`TODO/core-032`). Refused without touching anything while another
   * load is still pending.
   *
   * @param {string} text
   * @param {string} name File name, for the chip and for a refusal.
   * @returns {Promise<{ ok: true, name: string, steps: number } | { ok: false, message: string }>}
   */
  async function openText(text, name) {
    if (loading.value) return { ok: false, message: 'Another file is still opening' }
    const loaded = await announced(`Opening ${name}…`, () => loadText(text))
    if (!loaded.ok) {
      clearNotice()
      errorMessage.value = `Couldn't open ${name}: ${loaded.message}`
      return { ok: false, message: loaded.message }
    }
    errorMessage.value = ''
    loadWarning.value = ''
    if (loaded.skipped) {
      clearNotice()
      loadWarning.value = `Opened ${name}, but ${loaded.skipped}`
    } else {
      showNotice(`Opened ${name} · ${loaded.steps} step${loaded.steps === 1 ? '' : 's'}`, SAVED_NOTICE_MS)
    }
    return { ok: true, name, steps: loaded.steps }
  }

  /**
   * Pick a file and open it. See the module note: this does not confirm a
   * replace, and it must be called synchronously from the user's click.
   *
   * @returns {Promise<{ ok: true, name: string, steps: number } | { ok: false, cancelled: true } | { ok: false, message: string }>}
   */
  async function openFile() {
    if (loading.value) return { ok: false, message: 'Another file is still opening' }
    const picked = await deps.files.open()
    if (!picked.ok) {
      if ('cancelled' in picked) return { ok: false, cancelled: true }
      clearNotice()
      errorMessage.value = `Couldn't open ${picked.name ?? 'the file'}: ${picked.error}`
      return { ok: false, message: picked.error }
    }
    const opened = await openText(picked.text, picked.name)
    // Only a file that actually loaded may become the Save target — adopting a
    // refused one would let the next Save overwrite it with the current document.
    if (opened.ok) {
      deps.files.adopt(picked)
      // `TODO/ai-009`: only a native pick can be read again, so only it can be watched.
      diskKnown = picked.handle === undefined ? null : { text: picked.text, lastModified: picked.lastModified ?? null }
      diskChange.value = null
      diskPromptWanted.value = false
      diskCanWatch.value = diskKnown !== null
    }
    return opened
  }

  /**
   * Start an empty project (`TODO/ui-054`): the same atomic `documentStore.load` Open uses —
   * so selection is cleared and both undo stacks are emptied exactly as for Open — with an
   * empty entry list at the default resolution, then the remembered Save target is dropped,
   * so the next Save asks *where* instead of overwriting the file the old project came from.
   * The caller confirms first (`fileMenu.requestNew`); the next autosave replaces the stored
   * project with the empty one.
   *
   * @returns {boolean} `false`, touching nothing, while a load is still pending.
   */
  function newProject() {
    if (loading.value) return false
    documentStore.load([], null, DEFAULT_RESOLUTION)
    deps.files.forgetHandle()
    forgetDisk()
    errorMessage.value = ''
    loadWarning.value = ''
    showNotice(`New project · ${clock(Date.now())}`, SAVED_NOTICE_MS)
    return true
  }

  /** The project no longer comes from the file this session was watching. */
  function forgetDisk() {
    diskKnown = null
    diskChange.value = null
    diskPromptWanted.value = false
    diskCanWatch.value = false
  }

  /**
   * Look at the opened file on disk and raise the disk-change dialog if it changed
   * (`TODO/ai-009`). Never throws; a no-op when nothing can be watched. Concurrent calls share
   * one read.
   *
   * @returns {Promise<void>}
   */
  function checkDiskFile() {
    diskCheck ??= (async () => {
      const known = diskKnown
      if (known === null || typeof deps.files.readCurrent !== 'function') return
      const read = await deps.files.readCurrent(known.lastModified === null ? undefined : { lastModified: known.lastModified })
      // Unreadable now (moved, deleted, permission withdrawn): say nothing here — a Save will
      // report it in its own words, and a focus is no time for an error.
      if (read === null || !read.ok || diskKnown !== known) return
      if (known.lastModified !== null && read.lastModified === known.lastModified) return
      if (read.text === known.text) {
        // Rewritten with the same bytes (a touch, our own Save), or changed back.
        known.lastModified = read.lastModified
        diskChange.value = null
        return
      }
      const pending = diskChange.value
      if (pending !== null && pending.text === read.text) {
        diskChange.value = { ...pending, lastModified: read.lastModified }
        return
      }
      diskChange.value = { name: read.name, text: read.text, lastModified: read.lastModified }
      diskPromptWanted.value = true
    })().finally(() => {
      diskCheck = null
    })
    return diskCheck
  }

  /**
   * The disk-change dialog's three answers. **No merge, ever.**
   *
   * - `reload` — replace this project with the file (the same atomic load as Open; a file this
   *   build cannot read is refused by name and the project is untouched);
   * - `overwrite` — write this project over the file, in place;
   * - `cancel` — close the dialog; the chip still says the file changed, and tapping it asks again.
   *
   * @param {'reload' | 'overwrite' | 'cancel'} choice
   * @returns {Promise<void>}
   */
  async function resolveDiskChange(choice) {
    const pending = diskChange.value
    diskPromptWanted.value = false
    if (pending === null || choice === 'cancel') return
    if (choice === 'reload') {
      const opened = await openText(pending.text, pending.name)
      if (opened.ok && diskChange.value === pending) {
        diskKnown = { text: pending.text, lastModified: pending.lastModified }
        diskChange.value = null
      }
      return
    }
    await writeFile({ saveAs: false })
  }

  /** Ask again after a Cancel — what tapping the chip does while the file differs. */
  function showDiskPrompt() {
    if (diskChange.value !== null) diskPromptWanted.value = true
  }

  /**
   * A drag, popover or another dialog is open: hold the disk-change dialog back until it is not.
   *
   * @param {boolean} busy
   */
  function setUiBusy(busy) {
    uiBusy.value = busy
  }

  function dismissError() {
    errorMessage.value = ''
    loadWarning.value = ''
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
    loadWarning,
    loading,
    chipText,
    chipTone,
    fileCapabilities: deps.files.capabilities,
    diskChanged,
    diskChangeName,
    diskPromptOpen,
    diskCanWatch,
    checkDiskFile,
    resolveDiskChange,
    showDiskPrompt,
    setUiBusy,
    start,
    stop,
    flush,
    onVisibilityChange,
    saveFile,
    openFile,
    openText,
    newProject,
    dismissError,
    announce,
  }
})
