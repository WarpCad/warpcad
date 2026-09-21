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
 * @property {'native' | 'fallback'} mode
 * @property {boolean} canSaveInPlace Whether a second Save can overwrite the same file.
 * @property {'Save' | 'Download copy'} saveLabel What the Save item should say.
 * @property {'Save As…' | null} saveAsLabel `null` when Save As would duplicate Save —
 *   the fallback has exactly one save action and it must not be listed twice.
 * @property {'Open…'} openLabel
 */

/**
 * What the current browser can honestly do. Feature-detected on the function,
 * never a UA sniff — a stubbed non-function property is not support.
 *
 * @param {any} [env]
 * @returns {FileCapabilities}
 */
export function getFileCapabilities(env = globalThis) {
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
 * @param {'native' | 'fallback'} mode
 * @param {Date} [date]
 * @returns {string}
 */
export function projectFileName(mode, date = new Date()) {
  return mode === 'native'
    ? `${BASE_NAME}${EXTENSION}`
    : `${BASE_NAME}-${formatFileStamp(date)}${EXTENSION}`
}

/**
 * @typedef {{ ok: true, mode: 'native' | 'fallback', name: string }
 *   | { ok: false, cancelled: true }
 *   | { ok: false, error: string, name?: string }} SaveResult
 */

/**
 * @typedef {{ ok: true, name: string, text: string, handle?: unknown }
 *   | { ok: false, cancelled: true }
 *   | { ok: false, error: string, name?: string }} OpenResult
 */

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  if (error instanceof Error) return error.message === '' ? error.name : `${error.name}: ${error.message}`
  return String(error)
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
 * @property {FileCapabilities} capabilities
 * @property {string | null} currentName The retained handle's file name, if any.
 * @property {(text: string, options?: { saveAs?: boolean, now?: Date }) => Promise<SaveResult>} save
 * @property {() => Promise<OpenResult>} open Must be called synchronously from the
 *   user's click: the fallback opens its picker before the first `await`.
 * @property {(result: OpenResult) => void} adopt Call after an opened file was
 *   accepted, so a later Save writes back to it. A refused file must *not* be adopted.
 * @property {() => void} forgetHandle
 */

/**
 * @param {any} [env] Browser globals; default `globalThis`. Tests pass a fake.
 * @returns {FileStorage}
 */
export function createFileStorage(env = globalThis) {
  const capabilities = getFileCapabilities(env)
  /** @type {any} */
  let handle = null

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
   * @returns {Promise<SaveResult>}
   */
  async function writeHandle(target, text) {
    try {
      const writable = await target.createWritable()
      await writable.write(text)
      await writable.close()
      return { ok: true, mode: 'native', name: target.name }
    } catch (error) {
      return { ok: false, error: messageOf(error), name: target.name }
    }
  }

  /** @type {FileStorage} */
  const storage = {
    capabilities,

    get currentName() {
      return handle?.name ?? null
    },

    async save(text, { saveAs = false, now = new Date() } = {}) {
      if (capabilities.mode === 'fallback') {
        return downloadCopy(text, projectFileName('fallback', now))
      }
      if (handle !== null && !saveAs) return writeHandle(handle, text)
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
      return result
    },

    open() {
      if (capabilities.mode === 'fallback') return openWithInput()
      return openWithPicker()
    },

    adopt(result) {
      if (result.ok) handle = result.handle ?? null
    },

    forgetHandle() {
      handle = null
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
      return { ok: true, name: file.name, text: await file.text(), handle: picked }
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
