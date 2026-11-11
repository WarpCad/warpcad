// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The app-data copy of the autosave and of My parts, inside the iOS app (`TODO/io-015`).
 *
 * A WKWebView app's IndexedDB is reclaimable by the OS (`docs/decisions/native-mobile-shell.md`,
 * Q2), and so is `localStorage`, which lives in the same store. *Application Support* is not. So
 * every autosave is also written to `autosave.ndjson` there, and every My-parts change to
 * `library/<id>.ndjson`, through `src/native/files.js`'s temp-and-rename writes.
 *
 * Both mirrors do **nothing outside the iOS app**: the platform is asked of the shell once
 * (`shell_info`), and a browser, a desktop shell or a failed answer is "not iOS". A mirror write
 * can reject (the caller logs it); a mirror read that finds nothing answers `null` or `[]`.
 *
 * Framework-free: no Vue, no DOM.
 *
 * @module storage/nativeMirror
 */

import { listAppData, readAppData, removeAppData, writeAppData } from '../native/files.js'
import { loadShellDetails, probeShell } from '../native/shell.js'

/** The autosave's copy, `$APPDATA`-relative. */
export const AUTOSAVE_MIRROR_PATH = 'autosave.ndjson'

/** The folder My parts' copies live in, `$APPDATA`-relative. */
export const LIBRARY_MIRROR_FOLDER = 'library'

/** @typedef {import('../native/files.js').FilesGlobal} FilesGlobal */

/**
 * Whether the shell says it is iOS, asked once.
 *
 * @param {FilesGlobal} global
 * @returns {() => Promise<boolean>}
 */
function iosGate(global) {
  /** @type {Promise<boolean> | null} */
  let answer = null
  return () => {
    answer ??= loadShellDetails(probeShell(global), global).then((details) => details.platform === 'ios')
    return answer
  }
}

/**
 * @typedef {object} NativeAutosaveMirror
 * @property {(record: import('./autosave.js').StoredProject) => Promise<void>} write Replace the copy with `record.text`.
 * @property {() => Promise<string | null>} read The copy's text, `null` when there is none (or this is not the iOS app).
 */

/**
 * @param {object} [options]
 * @param {FilesGlobal} [options.global] Where the bridge is read from; `globalThis` in the app.
 * @returns {NativeAutosaveMirror}
 */
export function createNativeAutosaveMirror({ global = /** @type {FilesGlobal} */ (globalThis) } = {}) {
  const ios = iosGate(global)
  return {
    async write(record) {
      if (!(await ios())) return
      await writeAppData(AUTOSAVE_MIRROR_PATH, record.text, global)
    },
    async read() {
      if (!(await ios())) return null
      return readAppData(AUTOSAVE_MIRROR_PATH, global)
    },
  }
}

/**
 * @typedef {object} NativeLibraryMirror
 * @property {(op: string, text: string) => Promise<void>} write Replace the part's copy.
 * @property {(op: string) => Promise<void>} remove Delete the part's copy.
 * @property {() => Promise<Array<{ file: string, text: string }>>} list Every copy; a file that cannot be read is left out.
 */

/**
 * The file a part's copy is kept in.
 *
 * @param {string} op `user.bolt`
 * @returns {string}
 */
function libraryPath(op) {
  return `${LIBRARY_MIRROR_FOLDER}/${encodeURIComponent(op)}.ndjson`
}

/**
 * @param {object} [options]
 * @param {FilesGlobal} [options.global]
 * @returns {NativeLibraryMirror}
 */
export function createNativeLibraryMirror({ global = /** @type {FilesGlobal} */ (globalThis) } = {}) {
  const ios = iosGate(global)
  return {
    async write(op, text) {
      if (!(await ios())) return
      await writeAppData(libraryPath(op), text, global)
    },
    async remove(op) {
      if (!(await ios())) return
      await removeAppData(libraryPath(op), global)
    },
    async list() {
      if (!(await ios())) return []
      const names = await listAppData(LIBRARY_MIRROR_FOLDER, global)
      /** @type {Array<{ file: string, text: string }>} */
      const found = []
      for (const file of names) {
        if (!file.endsWith('.ndjson')) continue
        try {
          const text = await readAppData(`${LIBRARY_MIRROR_FOLDER}/${file}`, global)
          if (text !== null) found.push({ file, text })
        } catch {
          /* an unreadable copy is no copy */
        }
      }
      return found
    },
  }
}
