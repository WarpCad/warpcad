// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Real files inside the native app (`TODO/io-014`): projects in the app's **Documents** folder,
 * which the iOS Files app shows as *On My iPhone › WarpCad*, exports in `Documents/Exports/`, and
 * the system document picker for a file anywhere else.
 *
 * Every call goes through `src/native/shell.js`'s `invoke` to the commands `tauri-plugin-fs` 2.7
 * and `tauri-plugin-dialog` 2.8 register. `@tauri-apps/plugin-fs` is not imported, for the same
 * licence reason `@tauri-apps/api` is not (see `shell.js`), so the argument shapes below are the
 * ones those guest bindings send: a write's bytes are the **payload** and its path and options are
 * percent-encoded **headers**; every other command takes JSON with `options.baseDir`.
 *
 * Paths are always **relative to `$DOCUMENT`** (`baseDir` {@link DOCUMENT_BASE_DIR}), the only
 * folder the shell's capabilities let the page touch. A file the document picker hands out joins
 * that scope for the session, as the dialog plugin arranges, and is read by its own path.
 *
 * A save is a **temp file, then a rename**, as `mcp/projectFile.js` writes: a crash mid-save leaves
 * the old project whole, never a torn one. A failure removes the temp file and rejects.
 *
 * Framework-free: no Vue, no DOM. `global` is the object the bridge is read from (`globalThis` in
 * the app, a plain object in tests).
 *
 * @module native/files
 */

import { invoke, loadShellDetails, probeShell } from './shell.js'
import { UserFacingError } from '../core/userError.js'

/** `BaseDirectory.Document` in `@tauri-apps/api/path`: `$DOCUMENT`, the app's Documents folder on iOS. */
export const DOCUMENT_BASE_DIR = 6

/** `BaseDirectory.AppData` in `@tauri-apps/api/path`: `$APPDATA`, *Library/Application Support/<bundle id>* on iOS (`TODO/io-015`). */
export const APPDATA_BASE_DIR = 14

/** The folder under Documents every export goes to. */
export const EXPORTS_FOLDER = 'Exports'

/** A WarpCad project's extension. */
export const PROJECT_EXTENSION = '.ndjson'

/** What the document picker offers: the same list the web's `<input accept>` uses (`fileSystem.js`). */
const PICKER_FILTERS = [{ name: 'WarpCad project', extensions: ['ndjson', 'json', 'txt'] }]

/** @typedef {import('./shell.js').BridgeGlobal & { navigator?: { userAgent?: string, maxTouchPoints?: number } }} FilesGlobal */

/**
 * @typedef {object} ProjectEntry
 * @property {string} name the file name in Documents, `bracket.ndjson`
 * @property {number} lastModified epoch ms
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/**
 * A Tauri rejection is a bare string; make it an `Error` with that string as its message.
 *
 * @param {unknown} reason
 * @returns {Error}
 */
function asError(reason) {
  return reason instanceof Error ? reason : new Error(String(reason))
}

/**
 * @param {string} cmd
 * @param {unknown} args
 * @param {FilesGlobal} global
 * @param {{ headers: Record<string, string> }} [options]
 * @returns {Promise<unknown>}
 */
async function call(cmd, args, global, options) {
  try {
    return await invoke(cmd, /** @type {Record<string, unknown>} */ (args), global, options)
  } catch (reason) {
    throw asError(reason)
  }
}

/** @returns {string} */
function randomId() {
  const cryptoApi = /** @type {{ randomUUID?: () => string } | undefined} */ (globalThis.crypto)
  return typeof cryptoApi?.randomUUID === 'function' ? cryptoApi.randomUUID() : Math.random().toString(36).slice(2)
}

/**
 * Whether `name` is one plain, visible file name: no folder, no `..`, no leading dot.
 *
 * @param {string} name
 */
function isPlainName(name) {
  return name !== '' && !name.startsWith('.') && !/[/\\]/.test(name) && !/[\u0000-\u001f]/.test(name)
}

/**
 * The project file name for what the user typed: trimmed, with {@link PROJECT_EXTENSION} added if
 * missing. `null` for a name that is empty, hidden (a leading dot) or reaches outside the folder.
 *
 * @param {string} input `bracket`, `bracket.ndjson`
 * @returns {string | null}
 */
export function projectFileNameFor(input) {
  const trimmed = input.trim()
  const name = trimmed.toLowerCase().endsWith(PROJECT_EXTENSION) ? trimmed : `${trimmed}${PROJECT_EXTENSION}`
  if (!isPlainName(trimmed) || name === PROJECT_EXTENSION) return null
  return name
}

/**
 * The bytes of a read: the plugin answers with an `ArrayBuffer` (raw IPC) or a JSON byte array.
 *
 * @param {unknown} answer
 * @returns {string}
 */
function decodeText(answer) {
  if (answer instanceof ArrayBuffer) return decoder.decode(new Uint8Array(answer))
  if (ArrayBuffer.isView(answer)) return decoder.decode(answer)
  if (Array.isArray(answer)) return decoder.decode(Uint8Array.from(answer))
  throw new Error('the file could not be read: unexpected answer from the shell')
}

/**
 * @param {Uint8Array | string} data
 * @returns {Uint8Array}
 */
function bytesOf(data) {
  return typeof data === 'string' ? encoder.encode(data) : data
}

/**
 * @param {string} path Documents-relative
 * @returns {{ dir: string, base: string }}
 */
function split(path) {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? { dir: '', base: path } : { dir: path.slice(0, slash + 1), base: path.slice(slash + 1) }
}

/**
 * Write `data` to the Documents-relative `path` through a temp file beside it and a rename over it.
 *
 * @param {'plugin:fs|write_text_file' | 'plugin:fs|write_file'} command
 * @param {string} path
 * @param {Uint8Array} bytes
 * @param {FilesGlobal} global
 * @param {string} tempId
 * @param {number} [baseDir] {@link DOCUMENT_BASE_DIR} or {@link APPDATA_BASE_DIR}
 */
async function writeAtomic(command, path, bytes, global, tempId, baseDir = DOCUMENT_BASE_DIR) {
  const { dir, base } = split(path)
  const temp = `${dir}.${base}.${tempId}.tmp`
  const docs = { baseDir }
  try {
    await call(command, bytes, global, { headers: { path: encodeURIComponent(temp), options: JSON.stringify(docs) } })
    await call('plugin:fs|rename', { oldPath: temp, newPath: path, options: { oldPathBaseDir: baseDir, newPathBaseDir: baseDir } }, global)
  } catch (error) {
    await call('plugin:fs|remove', { path: temp, options: docs }, global).catch(() => {})
    throw error
  }
}

/**
 * Save a project to `Documents/<name>` atomically.
 *
 * @param {string} name a plain file name, `bracket.ndjson`
 * @param {string} text the project's NDJSON
 * @param {FilesGlobal} [global]
 * @param {string} [tempId] the temp file's unique part; tests pin it
 * @returns {Promise<ProjectEntry>} the name and the file's modification time after the write
 */
export async function writeProjectFile(name, text, global = /** @type {FilesGlobal} */ (globalThis), tempId = randomId()) {
  if (!isPlainName(name)) throw new UserFacingError('files/is-not-a-file-name-warpcad-can-save-under', `"${name}" is not a file name WarpCad can save under`)
  await writeAtomic('plugin:fs|write_text_file', name, encoder.encode(text), global, tempId)
  return { name, ...(await statProjectFile(name, global)) }
}

/**
 * A Documents file's modification time.
 *
 * @param {string} path Documents-relative
 * @param {FilesGlobal} [global]
 * @returns {Promise<{ lastModified: number }>}
 */
export async function statProjectFile(path, global = /** @type {FilesGlobal} */ (globalThis)) {
  const info = /** @type {{ mtime?: unknown } | null} */ (await call('plugin:fs|stat', { path, options: { baseDir: DOCUMENT_BASE_DIR } }, global))
  const mtime = info?.mtime
  return { lastModified: typeof mtime === 'number' ? mtime : typeof mtime === 'string' ? Date.parse(mtime) : 0 }
}

/**
 * Read a project from `Documents/<name>`.
 *
 * @param {string} name
 * @param {FilesGlobal} [global]
 * @returns {Promise<{ name: string, text: string, lastModified: number }>}
 */
export async function readProjectFile(name, global = /** @type {FilesGlobal} */ (globalThis)) {
  const answer = await call('plugin:fs|read_text_file', { path: name, options: { baseDir: DOCUMENT_BASE_DIR } }, global)
  const { lastModified } = await statProjectFile(name, global)
  return { name, text: decodeText(answer), lastModified }
}

/**
 * Whether `Documents/<name>` exists.
 *
 * @param {string} name
 * @param {FilesGlobal} [global]
 * @returns {Promise<boolean>}
 */
export async function projectExists(name, global = /** @type {FilesGlobal} */ (globalThis)) {
  return (await call('plugin:fs|exists', { path: name, options: { baseDir: DOCUMENT_BASE_DIR } }, global)) === true
}

/**
 * The projects in Documents, newest first: visible `.ndjson` files only (no folders, no temp files).
 *
 * @param {FilesGlobal} [global]
 * @returns {Promise<ProjectEntry[]>}
 */
export async function listProjects(global = /** @type {FilesGlobal} */ (globalThis)) {
  const entries = /** @type {Array<{ name?: unknown, isFile?: unknown }>} */ (
    (await call('plugin:fs|read_dir', { path: '', options: { baseDir: DOCUMENT_BASE_DIR } }, global)) ?? []
  )
  const names = entries
    .filter((entry) => entry.isFile === true && typeof entry.name === 'string')
    .map((entry) => /** @type {string} */ (entry.name))
    .filter((name) => isPlainName(name) && name.toLowerCase().endsWith(PROJECT_EXTENSION))
  const listed = await Promise.all(names.map(async (name) => ({ name, ...(await statProjectFile(name, global)) })))
  return listed.sort((a, b) => b.lastModified - a.lastModified || a.name.localeCompare(b.name))
}

/**
 * Where an export is, in the words of the app that shows it: the Files app on iOS, the Documents
 * folder elsewhere.
 *
 * @param {string} path Documents-relative, `Exports/part.stl`
 * @param {string} platform the shell's OS (`ios`, `macos`, …), `''` when unknown
 * @param {boolean} iPad whether an iOS device is an iPad
 * @returns {string}
 */
export function exportPlace(path, platform, iPad) {
  const parts = path.split('/').join(' › ')
  return platform === 'ios' ? `Files › On My ${iPad ? 'iPad' : 'iPhone'} › WarpCad › ${parts}` : `Documents › ${parts}`
}

/**
 * An iPad's WebKit reports itself as a Mac, so a Mac user agent with a touch screen is an iPad.
 *
 * @param {FilesGlobal} global
 */
function isIPad(global) {
  const agent = global.navigator?.userAgent ?? ''
  return /iPad/.test(agent) || (/Macintosh/.test(agent) && (global.navigator?.maxTouchPoints ?? 0) > 1)
}

/**
 * Write an export (STL, 3MF, a zip, a project copy) to `Documents/Exports/<name>`, replacing one of
 * the same name.
 *
 * @param {string} name `part.stl`
 * @param {Uint8Array | string} data
 * @param {FilesGlobal} [global]
 * @param {string} [tempId]
 * @returns {Promise<{ path: string, place: string }>} the Documents-relative path, and where to find it
 */
export async function writeExport(name, data, global = /** @type {FilesGlobal} */ (globalThis), tempId = randomId()) {
  if (!isPlainName(name)) throw new UserFacingError('files/is-not-a-file-name-warpcad-can-export-under', `"${name}" is not a file name WarpCad can export under`)
  await call('plugin:fs|mkdir', { path: EXPORTS_FOLDER, options: { baseDir: DOCUMENT_BASE_DIR, recursive: true } }, global)
  const path = `${EXPORTS_FOLDER}/${name}`
  await writeAtomic('plugin:fs|write_file', path, bytesOf(data), global, tempId)
  const { platform } = await loadShellDetails(probeShell(global), global)
  return { path, place: exportPlace(path, platform, isIPad(global)) }
}

/**
 * The last segment of a path or `file://` URL, decoded.
 *
 * @param {string} path
 */
function nameOfPath(path) {
  const last = path.slice(path.replace(/\/+$/, '').lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(last)
  } catch {
    return last
  }
}

/**
 * **Browse…**: the system document picker (`tauri-plugin-dialog`), for a project anywhere the
 * user can reach: iCloud Drive, another app's folder. `null` when it is dismissed.
 *
 * @param {FilesGlobal} [global]
 * @returns {Promise<{ path: string, name: string } | null>}
 */
export async function pickFile(global = /** @type {FilesGlobal} */ (globalThis)) {
  const answer = await call('plugin:dialog|open', { options: { multiple: false, directory: false, filters: PICKER_FILTERS } }, global)
  const path = Array.isArray(answer) ? answer[0] : answer
  if (typeof path !== 'string' || path === '') return null
  return { path, name: nameOfPath(path) }
}

/**
 * Read the file {@link pickFile} returned, by its own path (it is outside Documents).
 *
 * @param {string} path
 * @param {FilesGlobal} [global]
 * @returns {Promise<string>}
 */
export async function readPickedFile(path, global = /** @type {FilesGlobal} */ (globalThis)) {
  return decodeText(await call('plugin:fs|read_text_file', { path }, global))
}

/**
 * A file the system asked the app to open (`warpcad-native`'s `take_opened_files`).
 *
 * @typedef {object} OpenedFile
 * @property {string} name the file's name
 * @property {string | null} path `null` for a file directly in Documents (open it by `name`);
 *   otherwise its full path (a Mail attachment in `Documents/Inbox`, a file opened in place from
 *   iCloud Drive), which the shell has let the page read once
 */

/**
 * The files the shell received from open-URL events (a `.ndjson` tapped in the Files app or Mail)
 * since the last call, oldest first. Empty, not an error, for a shell without the command.
 *
 * @param {FilesGlobal} [global]
 * @returns {Promise<OpenedFile[]>}
 */
export async function takeOpenedFiles(global = /** @type {FilesGlobal} */ (globalThis)) {
  /** @type {unknown} */
  let answer
  try {
    answer = await call('take_opened_files', {}, global)
  } catch {
    return []
  }
  if (!Array.isArray(answer)) return []
  return answer
    .filter((entry) => typeof entry?.name === 'string' && isPlainName(entry.name) && (entry.path === null || typeof entry.path === 'string'))
    .map((entry) => ({ name: entry.name, path: entry.path }))
}

/**
 * Make an opened file one of the app's own projects and return its name in Documents. A file
 * already there is used where it is; one from elsewhere is read and **copied** in (the inbox Mail
 * leaves an attachment in cannot be written, and iCloud Drive is out of scope), under its own name
 * or the next free one (`bracket 2.ndjson`), so an existing project is never overwritten.
 *
 * @param {OpenedFile} opened
 * @param {FilesGlobal} [global]
 * @returns {Promise<string>}
 */
export async function importOpenedFile(opened, global = /** @type {FilesGlobal} */ (globalThis)) {
  if (opened.path === null) return opened.name
  const text = await readPickedFile(opened.path, global)
  const stem = opened.name.toLowerCase().endsWith(PROJECT_EXTENSION) ? opened.name.slice(0, -PROJECT_EXTENSION.length) : opened.name
  for (let n = 1; n < 1000; n += 1) {
    const name = `${stem}${n === 1 ? '' : ` ${n}`}${PROJECT_EXTENSION}`
    if (await projectExists(name, global)) continue
    await writeProjectFile(name, text, global)
    return name
  }
  throw new UserFacingError('files/no-free-name-for-in-warpcad-s-folder', `no free name for ${opened.name} in WarpCad's folder`)
}

/**
 * Whether `path` is a safe `$APPDATA`-relative path: plain segments, no `..`, no leading dot, no
 * empty segment.
 *
 * @param {string} path `autosave.ndjson`, `library/user.bolt.ndjson`
 */
function isAppDataPath(path) {
  return path !== '' && path.split('/').every(isPlainName)
}

/**
 * Write `text` to `$APPDATA/<path>` (*Application Support* on iOS) through a temp file and a rename,
 * as {@link writeProjectFile} does, creating the folders first (`TODO/io-015`). This is the app's
 * private copy of what IndexedDB holds: the OS can reclaim a web view's storage but not this folder.
 *
 * @param {string} path `$APPDATA`-relative, `autosave.ndjson` or `library/<id>.ndjson`
 * @param {string} text
 * @param {FilesGlobal} [global]
 * @param {string} [tempId]
 * @returns {Promise<void>}
 */
export async function writeAppData(path, text, global = /** @type {FilesGlobal} */ (globalThis), tempId = randomId()) {
  if (!isAppDataPath(path)) throw new UserFacingError('files/is-not-a-path-warpcad-can-keep-a-backup-under', `"${path}" is not a path WarpCad can keep a backup under`)
  const { dir } = split(path)
  await call('plugin:fs|mkdir', { path: dir.replace(/\/$/, ''), options: { baseDir: APPDATA_BASE_DIR, recursive: true } }, global)
  await writeAtomic('plugin:fs|write_text_file', path, encoder.encode(text), global, tempId, APPDATA_BASE_DIR)
}

/**
 * Read `$APPDATA/<path>`. `null` when there is no such file; a file that exists but cannot be read rejects.
 *
 * @param {string} path
 * @param {FilesGlobal} [global]
 * @returns {Promise<string | null>}
 */
export async function readAppData(path, global = /** @type {FilesGlobal} */ (globalThis)) {
  if (!isAppDataPath(path)) throw new UserFacingError('files/is-not-a-path-warpcad-can-read-a-backup-from', `"${path}" is not a path WarpCad can read a backup from`)
  const options = { baseDir: APPDATA_BASE_DIR }
  if ((await call('plugin:fs|exists', { path, options }, global)) !== true) return null
  return decodeText(await call('plugin:fs|read_text_file', { path, options }, global))
}

/**
 * Delete `$APPDATA/<path>`; a file already gone is not an error.
 *
 * @param {string} path
 * @param {FilesGlobal} [global]
 * @returns {Promise<void>}
 */
export async function removeAppData(path, global = /** @type {FilesGlobal} */ (globalThis)) {
  if (!isAppDataPath(path)) throw new UserFacingError('files/is-not-a-path-warpcad-can-remove-a-backup-from', `"${path}" is not a path WarpCad can remove a backup from`)
  const options = { baseDir: APPDATA_BASE_DIR }
  if ((await call('plugin:fs|exists', { path, options }, global)) !== true) return
  await call('plugin:fs|remove', { path, options }, global)
}

/**
 * The visible files directly inside `$APPDATA/<dir>`; empty when the folder does not exist.
 *
 * @param {string} dir `library`
 * @param {FilesGlobal} [global]
 * @returns {Promise<string[]>}
 */
export async function listAppData(dir, global = /** @type {FilesGlobal} */ (globalThis)) {
  if (!isAppDataPath(dir)) throw new Error(`"${dir}" is not a folder WarpCad keeps backups in`)
  const options = { baseDir: APPDATA_BASE_DIR }
  if ((await call('plugin:fs|exists', { path: dir, options }, global)) !== true) return []
  const entries = /** @type {Array<{ name?: unknown, isFile?: unknown }>} */ ((await call('plugin:fs|read_dir', { path: dir, options }, global)) ?? [])
  return entries
    .filter((entry) => entry.isFile === true && typeof entry.name === 'string' && isPlainName(entry.name))
    .map((entry) => /** @type {string} */ (entry.name))
    .sort()
}
