// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Portable project files: Save and Open, with a first-class fallback
 * (`TODO/io-001`; `docs/decisions/persistence-export.md`, sub-decision 2).
 *
 * ## The fallback is the primary path
 *
 * File System Access (`showSaveFilePicker` / `showOpenFilePicker`) is
 * **desktop-Chromium-only** — about 31% of users. Not Chrome for Android, not
 * Safari or iOS, not Firefox. WarpCad's phone and tablet targets are first-class,
 * so on every phone and tablet, and on two of the three committed engines, the
 * `<a download>` / `<input type=file>` path below is the *only* path. It is
 * built and tested first; native is the enhancement. No ponyfill (it would just
 * wrap this same code behind a `FileSystemFileHandle` illusion that hides the
 * semantic gap below), and no Origin Private File System (invisible to the
 * user's own file manager, so it cannot satisfy "hand this file to someone").
 *
 * ## The two paths are not equal, and callers must not pretend they are
 *
 * | | native | fallback |
 * |---|---|---|
 * | Save over the same file | yes — the handle is retained | **no** — every save is a new download |
 * | Save As… | yes | (same as Save — one item only) |
 *
 * | Notice the file changed on disk (`TODO/ai-009`) | yes — {@link FileStorage.readCurrent} re-reads the handle | **no** — the picked `File` is a one-time copy |
 *
 * ## A third mode inside the native app (`TODO/io-014`)
 *
 * In the Tauri shell (`isNativeShell()`), `native-app` is checked **first**, before File System
 * Access: projects are saved **in place** to the app's Documents folder (the Files app's *On My
 * iPhone › WarpCad*) through `src/native/files.js`, a temp file and a rename each time. The first
 * Save of a project has no file yet, so it needs a name ({@link FileStorage.save}'s `name`; the
 * File menu asks), and so does Save As…. **Open** in this mode is two things: {@link
 * FileStorage.openNamed} reads one of the app's own projects (and can be adopted as the Save
 * target and re-read, so `io-010`'s focus merge works), and {@link FileStorage.open} is **Browse…**,
 * the system document picker, whose file is treated as a **copy**: never the Save target, never
 * re-read. Nothing in this mode ever falls back to a download.
 *
 * So the module answers "what can I honestly offer?" through
 * {@link getFileCapabilities}, and `ui-033` labels its controls from that —
 * `Save` / `Save As…` where in-place save exists, **`Download copy`** and no
 * Save As… everywhere else — rather than calling a fresh download "Save".
 *
 * Framework-free and DOM-injected: every browser global is read from an `env`
 * argument (default `globalThis`), so the specs drive both paths with fakes and
 * no real picker or download ever fires.
 *
 * @module storage/fileSystem
 */

import { listProjects, pickFile, projectExists, projectFileNameFor, readPickedFile, readProjectFile, statProjectFile, writeProjectFile } from '../native/files.js'
import { isNativeShell, probeShell } from '../native/shell.js'
import { downloadBytes } from './download.js'

/** The FSA picker's accepted types, and the `<input accept>` list — see {@link ACCEPT_ATTRIBUTE}. */
const PICKER_TYPES = [
  {
    description: 'WarpCad project',
    accept: {
      'application/x-ndjson': ['.ndjson'],
      'application/json': ['.json'],
      'text/plain': ['.txt'],
    },
  },
]

/**
 * The hidden `<input type=file accept>`.
 *
 * iOS greys out any file whose type the picker does not recognise, and it does
 * not recognise `.ndjson`. Accepting `.json`, `.txt` and `text/plain` as well as
 * the native extension is what keeps a saved project selectable on an iPad
 * (`docs/decisions/interaction-model-qa.md` §10, Q16).
 */
export const ACCEPT_ATTRIBUTE = '.ndjson,.json,.txt,text/plain,application/x-ndjson,application/json'

const MIME = 'application/x-ndjson'
const BASE_NAME = 'warpcad-project'
const EXTENSION = '.ndjson'

/**
 * @typedef {object} FileCapabilities
 * @property {'native-app' | 'native' | 'fallback'} mode
 * @property {boolean} canSaveInPlace Whether a second Save can overwrite the same file.
 * @property {'Save' | 'Download copy'} saveLabel What the Save item should say.
 * @property {'Save As…' | null} saveAsLabel `null` when Save As would duplicate Save —
 *   the fallback has exactly one save action and it must not be listed twice.
 * @property {'Open…'} openLabel
 */

/**
 * What the current browser can honestly do. Feature-detected on the function,
 * never a UA sniff — a stubbed non-function property is not support. Inside the native shell the
 * app's own Documents folder wins over File System Access (`TODO/io-014`).
 *
 * @param {any} [env]
 * @param {string} [shellTarget] the build-time shell target; `''` asks about the browser alone
 * @returns {FileCapabilities}
 */
export function getFileCapabilities(env = globalThis, shellTarget = undefined) {
  if (isNativeShell(probeShell(env ?? {}, shellTarget))) {
    return { mode: 'native-app', canSaveInPlace: true, saveLabel: 'Save', saveAsLabel: 'Save As…', openLabel: 'Open…' }
  }
  const native =
    typeof env?.showSaveFilePicker === 'function' && typeof env?.showOpenFilePicker === 'function'
  return native
    ? {
        mode: 'native',
        canSaveInPlace: true,
        saveLabel: 'Save',
        saveAsLabel: 'Save As…',
        openLabel: 'Open…',
      }
    : {
        mode: 'fallback',
        canSaveInPlace: false,
        saveLabel: 'Download copy',
        saveAsLabel: null,
        openLabel: 'Open…',
      }
}

/**
 * Local `YYYYMMDD-HHMM`. Local time on purpose: it is a label the user reads in
 * their Files app, not a sortable machine timestamp.
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatFileStamp(date) {
  const two = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}` +
    `-${two(date.getHours())}${two(date.getMinutes())}`
  )
}

/**
 * The file name to offer. The fallback gets a timestamp because the browser
 * would otherwise dedupe to `warpcad-project (3).ndjson`, which is
 * indistinguishable from the previous copy and worse in a phone's Files app.
 *
 * @param {'native-app' | 'native' | 'fallback'} mode
 * @param {Date} [date]
 * @returns {string}
 */
export function projectFileName(mode, date = new Date()) {
  return mode !== 'fallback'
    ? `${BASE_NAME}${EXTENSION}`
    : `${BASE_NAME}-${formatFileStamp(date)}${EXTENSION}`
}

/**
 * @typedef {{ ok: true, mode: 'native-app' | 'native' | 'fallback', name: string, refusedName?: string }
 *   | { ok: false, cancelled: true }
 *   | { ok: false, needsName: true, error: string }
 *   | { ok: false, exists: true, error: string, name: string }
 *   | { ok: false, error: string, name?: string }} SaveResult
 *   `needsName` and `exists` only in `native-app` mode: there is no file yet and no name was given,
 *   or the new name is already another project's.
 */

/**
 * @typedef {{ ok: true, name: string, text: string, handle?: unknown, lastModified?: number, copy?: true }
 *   | { ok: false, cancelled: true }
 *   | { ok: false, error: string, name?: string }} OpenResult
 *   `handle` and `lastModified` only on the native path, and for one of the native app's own
 *   projects (`handle` is then its file name). `copy` marks a file opened through **Browse…** in
 *   the native app: a one-time copy, as on the fallback path (`TODO/io-014`).
 */

/**
 * What the retained file holds on disk right now (`TODO/ai-009`).
 *
 * @typedef {{ ok: true, name: string, text: string, lastModified: number }
 *   | { ok: false, error: string, name: string }} DiskRead
 */

/**
 * `TODO/io-008`: the browser defines the pickers and then refuses the write. `NotAllowedError`
 * is what `createWritable()` throws when permission is denied or the context disallows it (the
 * integrated browser's case); `SecurityError` is the same refusal from a sandboxed or insecure
 * context. Everything else — `AbortError`, `QuotaExceededError`, `NotFoundError`,
 * `NoModificationAllowedError` (a locked file) — is a real failure of *that* write and must
 * not silently turn Save into a download.
 *
 * @param {unknown} error
 */
function isWriteRefused(error) {
  return error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  if (error instanceof Error) return error.message === '' ? error.name : `${error.name}: ${error.message}`
  return String(error)
}

/**
 * A native-app failure's words: the shell's own reason (`files.js` makes each an `Error` with it).
 *
 * @param {unknown} error
 * @returns {string}
 */
function appMessageOf(error) {
  return error instanceof Error ? error.message || error.name : String(error)
}

/**
 * The picker rejects with `AbortError` when the user dismisses it — which is not
 * a failure, and reporting it as one would nag on every cancel.
 *
 * @param {unknown} error
 */
function isCancel(error) {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * @typedef {object} FileStorage
 * @property {FileCapabilities} capabilities A getter: it flips to the fallback shape for the
 *   rest of the session once the browser refuses a write (`TODO/io-008`).
 * @property {string | null} currentName The retained handle's file name, if any.
 * @property {(text: string, options?: { saveAs?: boolean, now?: Date, name?: string }) => Promise<SaveResult>} save
 *   `name` (`native-app` only): what to call a new file, as typed (`bracket`); used when there is
 *   no file yet or on Save As….
 * @property {() => Promise<Array<{ name: string, lastModified: number }>>} list `native-app` only:
 *   the app's own projects, newest first; empty elsewhere.
 * @property {(name: string) => Promise<OpenResult>} openNamed `native-app` only: read one of them.
 * @property {() => Promise<OpenResult>} open Must be called synchronously from the
 *   user's click: the fallback opens its picker before the first `await`.
 * @property {(result: OpenResult) => void} adopt Call after an opened file was
 *   accepted, so a later Save writes back to it. A refused file must *not* be adopted.
 * @property {() => void} forgetHandle
 * @property {(known?: { lastModified: number }) => Promise<DiskRead | null>} readCurrent
 *   `TODO/ai-009`: read the retained file as it is on disk now, so the app can notice a change
 *   made outside it (the MCP server, another editor). `null` when there is nothing to read —
 *   no retained handle, which is always the case on the fallback path: a file picked with
 *   `<input type=file>` cannot be read again, so a change to it cannot be seen. When `known`'s
 *   `lastModified` still matches, the text is not read and `text` is `''` with the same stamp
 *   — the cheap path a window-focus check takes.
 */

/**
 * @param {any} [env] Browser globals; default `globalThis`. Tests pass a fake.
 * @returns {FileStorage}
 */
export function createFileStorage(env = globalThis) {
  /**
   * Set once a write the browser offered was refused (`TODO/io-008`): from then on this session
   * is honestly a fallback one, whatever `showSaveFilePicker` claims.
   */
  let nativeWriteRefused = false
  /** @type {any} */
  let handle = null
  /** `native-app`: the Documents file this project saves to, or `null` before its first Save. */
  /** @type {string | null} */
  let appFile = null

  const inApp = () => storage.capabilities.mode === 'native-app'

  /**
   * `native-app` Save: in place when there is a file, otherwise under the given name, which must
   * not already be another project's. A failure is reported, never turned into a download.
   *
   * @param {string} text
   * @param {{ saveAs: boolean, name?: string }} options
   * @returns {Promise<SaveResult>}
   */
  async function saveInApp(text, { saveAs, name }) {
    /** @type {string | null} */
    let target = appFile
    if (saveAs || target === null) {
      if (name === undefined) return { ok: false, needsName: true, error: 'Choose a name for the project file' }
      target = projectFileNameFor(name)
      if (target === null) return { ok: false, error: `"${name.trim()}" can't be used as a file name — choose another name` }
    }
    try {
      if (target !== appFile && (await projectExists(target, env))) {
        return { ok: false, exists: true, name: target, error: `${target} already exists in WarpCad's folder — choose another name` }
      }
      await writeProjectFile(target, text, env)
    } catch (error) {
      return { ok: false, error: appMessageOf(error), name: target }
    }
    appFile = target
    return { ok: true, mode: 'native-app', name: target }
  }

  /**
   * `native-app` Browse…: the system document picker. The file is a copy (`copy: true`).
   *
   * @returns {Promise<OpenResult>}
   */
  async function browseInApp() {
    /** @type {{ path: string, name: string } | null} */
    let picked
    try {
      picked = await pickFile(env)
    } catch (error) {
      return { ok: false, error: appMessageOf(error) }
    }
    if (picked === null) return { ok: false, cancelled: true }
    try {
      return { ok: true, name: picked.name, text: await readPickedFile(picked.path, env), copy: true }
    } catch (error) {
      return { ok: false, error: appMessageOf(error), name: picked.name }
    }
  }

  /**
   * @param {string} text
   * @param {string} name
   * @returns {SaveResult}
   */
  function downloadCopy(text, name) {
    // The one download implementation, shared with Export… (`storage/download.js`). A download
    // cannot be confirmed to have landed, only started — the caller's wording ("Download
    // started") must reflect that.
    const result = downloadBytes(text, name, MIME, env)
    return result.ok ? { ok: true, mode: 'fallback', name } : result
  }

  /**
   * @param {any} target
   * @param {string} text
   * @returns {Promise<SaveResult & { refused?: boolean }>}
   */
  async function writeHandle(target, text) {
    try {
      const writable = await target.createWritable()
      await writable.write(text)
      await writable.close()
      return { ok: true, mode: 'native', name: target.name }
    } catch (error) {
      return { ok: false, error: appMessageOf(error), name: target.name, refused: isWriteRefused(error) }
    }
  }

  /**
   * @param {any} result
   * @returns {SaveResult}
   */
  function stripRefused(result) {
    if (result.ok) return result
    const { refused: _refused, ...rest } = result
    return rest
  }

  /**
   * The browser took the picker and refused the write (`TODO/io-008`). Deliver the user's data
   * from the click they already made, drop the handle, and remember the refusal so the menu
   * stops offering a Save that cannot be kept. `refusedName` is the file the picker may have
   * left empty on disk — the caller must tell the user about it.
   *
   * @param {any} target
   * @param {string} text
   * @param {Date} now
   * @returns {SaveResult}
   */
  function refusedToDownload(target, text, now) {
    handle = null
    nativeWriteRefused = true
    const result = downloadCopy(text, projectFileName('fallback', now))
    return result.ok ? { ...result, refusedName: target.name } : result
  }

  /** @type {FileStorage} */
  const storage = {
    get capabilities() {
      return nativeWriteRefused ? getFileCapabilities({}, '') : getFileCapabilities(env)
    },

    get currentName() {
      return inApp() ? appFile : handle?.name ?? null
    },

    async save(text, { saveAs = false, now = new Date(), name = undefined } = {}) {
      if (inApp()) return saveInApp(text, { saveAs, name })
      if (storage.capabilities.mode === 'fallback') {
        return downloadCopy(text, projectFileName('fallback', now))
      }
      if (handle !== null && !saveAs) {
        const target = handle
        const result = await writeHandle(target, text)
        if (!result.ok && result.refused) return refusedToDownload(target, text, now)
        return stripRefused(result)
      }
      /** @type {any} */
      let picked
      try {
        picked = await env.showSaveFilePicker({
          suggestedName: projectFileName('native', now),
          types: PICKER_TYPES,
        })
      } catch (error) {
        return isCancel(error) ? { ok: false, cancelled: true } : { ok: false, error: messageOf(error) }
      }
      const result = await writeHandle(picked, text)
      // Retain only a handle that actually took a write: a failed first save must
      // not leave the next Save silently aimed at a file that could not be written.
      if (result.ok) handle = picked
      if (!result.ok && result.refused) return refusedToDownload(picked, text, now)
      return stripRefused(result)
    },

    open() {
      if (inApp()) return browseInApp()
      if (storage.capabilities.mode === 'fallback') return openWithInput()
      return openWithPicker()
    },

    async list() {
      return inApp() ? listProjects(env) : []
    },

    async openNamed(name) {
      try {
        const read = await readProjectFile(name, env)
        return { ok: true, name: read.name, text: read.text, handle: read.name, lastModified: read.lastModified }
      } catch (error) {
        return { ok: false, error: appMessageOf(error), name }
      }
    },

    adopt(result) {
      if (!result.ok) return
      if (inApp()) appFile = typeof result.handle === 'string' ? result.handle : null
      else handle = result.handle ?? null
    },

    forgetHandle() {
      handle = null
      appFile = null
    },

    async readCurrent(known) {
      if (inApp()) {
        if (appFile === null) return null
        const name = appFile
        try {
          const { lastModified } = await statProjectFile(name, env)
          if (known !== undefined && lastModified === known.lastModified) return { ok: true, name, text: '', lastModified }
          const read = await readProjectFile(name, env)
          return { ok: true, name, text: read.text, lastModified: read.lastModified }
        } catch (error) {
          return { ok: false, error: appMessageOf(error), name }
        }
      }
      if (handle === null || typeof handle.getFile !== 'function') return null
      const target = handle
      try {
        const file = await target.getFile()
        if (known !== undefined && file.lastModified === known.lastModified) {
          return { ok: true, name: target.name, text: '', lastModified: file.lastModified }
        }
        return { ok: true, name: target.name, text: await file.text(), lastModified: file.lastModified }
      } catch (error) {
        return { ok: false, error: messageOf(error), name: target.name }
      }
    },
  }

  /** @returns {Promise<OpenResult>} */
  async function openWithPicker() {
    /** @type {any} */
    let picked
    try {
      ;[picked] = await env.showOpenFilePicker({ types: PICKER_TYPES, multiple: false })
    } catch (error) {
      return isCancel(error) ? { ok: false, cancelled: true } : { ok: false, error: messageOf(error) }
    }
    try {
      const file = await picked.getFile()
      return { ok: true, name: file.name, text: await file.text(), handle: picked, lastModified: file.lastModified }
    } catch (error) {
      return { ok: false, error: messageOf(error), name: picked?.name }
    }
  }

  /**
   * The hidden `<input type=file>`. Deliberately **not** `async`: the click on
   * the input must happen synchronously inside the caller's user gesture, and an
   * `async` function is fine only up to its first `await` — so everything before
   * the promise is built runs on the caller's stack, and the promise executor
   * below runs synchronously too.
   *
   * @returns {Promise<OpenResult>}
   */
  function openWithInput() {
    return new Promise((resolve) => {
      const input = env.document.createElement('input')
      input.type = 'file'
      input.accept = ACCEPT_ATTRIBUTE
      input.style.display = 'none'
      // Some engines only deliver `change` for an input that is in the document.
      env.document.body.appendChild(input)

      const cleanup = () => input.remove()
      input.addEventListener('change', async () => {
        const file = input.files?.[0]
        if (!file) {
          cleanup()
          resolve({ ok: false, cancelled: true })
          return
        }
        try {
          resolve({ ok: true, name: file.name, text: await file.text() })
        } catch (error) {
          resolve({ ok: false, error: messageOf(error), name: file.name })
        }
        cleanup()
      })
      // `cancel` is how a dismissed dialog reports itself (Chromium 113+, Firefox
      // 91+, Safari 16.4+). On an older engine that never fires it, the promise
      // simply stays pending and nothing is loaded — a silent no-op, which is the
      // right outcome for "the user changed their mind".
      input.addEventListener('cancel', () => {
        cleanup()
        resolve({ ok: false, cancelled: true })
      })
      input.click()
    })
  }

  return storage
}
