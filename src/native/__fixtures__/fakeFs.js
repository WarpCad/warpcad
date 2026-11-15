// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * A fake Tauri bridge with an in-memory Documents folder (`TODO/io-014`): the boundary mock for
 * `src/native/files.js`. The unit specs call {@link createFakeTauriFs} directly; the Playwright
 * fixture (`e2e/fixtures/nativeShell.js`) puts its **source** into the page with `addInitScript`,
 * so unit and E2E specs run against the same fake. That is why the function is self-contained: no
 * imports and no reference to anything outside its own body.
 *
 * It answers the commands `tauri-plugin-fs` 2.7 and `tauri-plugin-dialog` 2.8 register, with the
 * argument shapes their guest bindings send: a write's bytes are the payload and its path and
 * options are percent-encoded headers; every other command takes JSON. Like the real plugin, a
 * path is allowed only under `$DOCUMENT` (`baseDir` 6, the scope in `warpcad-native`'s
 * capabilities), except a file the dialog has just handed out, which joins the scope as the
 * dialog plugin's does. A refusal rejects with a string, as Tauri does.
 *
 * Faults: `fail(cmd, message)` makes the next call of `cmd` reject with `message`.
 *
 * @module native/__fixtures__/fakeFs
 */

/**
 * @typedef {object} FakeFsOptions
 * @property {number} [startTime] The first modification time handed out, epoch ms.
 * @property {boolean} [desktop] Model the Mac and Windows scope (`TODO/io-029`): `$DOCUMENT` is the
 *   user's own Documents folder, and only `WarpCad/` inside it is reachable; anything else is refused.
 */

/**
 * @param {FakeFsOptions} [options]
 */
export function createFakeTauriFs(options = {}) {
  const DOCUMENT = 6
  /** `BaseDirectory.AppData` (`TODO/io-015`): kept in the same maps under this prefix, away from Documents. */
  const APPDATA = 14
  const APP = '@appdata'
  /** @type {Map<string, { bytes: number[], mtime: number }>} Documents-relative path → file. */
  const files = new Map()
  /** @type {Set<string>} Documents-relative directories; `''` is Documents itself. */
  const dirs = new Set(['', APP])
  /** @type {Map<string, number[]>} Absolute paths outside Documents (iCloud Drive, other apps). */
  const outside = new Map()
  /** @type {Set<string>} Outside paths the dialog has handed out this session. */
  const granted = new Set()
  /** @type {Array<string | null>} What the next `plugin:dialog|open` calls return. */
  const picks = []
  /** @type {Array<{ name: string, path: string | null }>} What the shell queued from open-URL events. */
  const opened = []
  /** @type {Map<string, string>} One-shot faults, by command. */
  const faults = new Map()
  /** @type {Array<{ cmd: string, path?: string, newPath?: string }>} */
  const calls = []
  let clock = options.startTime ?? 1_700_000_000_000

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  /** @param {unknown} payload @returns {number[]} */
  function bytesOf(payload) {
    if (payload instanceof ArrayBuffer) return Array.from(new Uint8Array(payload))
    if (ArrayBuffer.isView(payload)) return Array.from(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength))
    if (Array.isArray(payload)) return payload.map(Number)
    throw new Error('unexpected invoke body')
  }

  /** @param {string} path */
  function isAbsolute(path) {
    return path.startsWith('/') || path.startsWith('file://')
  }

  /** @param {string} path */
  function plainOutside(path) {
    return path.startsWith('file://') ? decodeURIComponent(path.slice('file://'.length)) : path
  }

  /**
   * The Documents-relative path, or a refusal for anything the scope does not cover.
   *
   * @param {string} path
   * @param {unknown} baseDir
   */
  function inDocuments(path, baseDir) {
    if (baseDir !== DOCUMENT && baseDir !== APPDATA) throw `forbidden path: ${path}`
    const parts = String(path).split('/').filter((part) => part !== '' && part !== '.')
    if (parts.includes('..')) throw `forbidden path: ${path}`
    if (options.desktop === true && baseDir === DOCUMENT && parts[0] !== 'WarpCad') throw `forbidden path: ${path}`
    // `$APPDATA` is a second scope; its files never appear as Documents.
    return (baseDir === APPDATA ? [APP, ...parts] : parts).join('/')
  }

  /** @param {string} path */
  function parentOf(path) {
    const slash = path.lastIndexOf('/')
    return slash < 0 ? '' : path.slice(0, slash)
  }

  /** @param {string} path */
  function baseName(path) {
    return path.slice(path.lastIndexOf('/') + 1)
  }

  function tick() {
    clock += 1000
    return clock
  }

  /**
   * @param {unknown} payload
   * @param {Record<string, string>} headers
   */
  function write(payload, headers) {
    const path = decodeURIComponent(headers.path ?? '')
    const writeOptions = headers.options ? JSON.parse(headers.options) : {}
    const target = inDocuments(path, writeOptions?.baseDir)
    if (!dirs.has(parentOf(target))) throw `failed to open file at path: ${path} with error: No such file or directory (os error 2)`
    if (dirs.has(target)) throw `failed to open file at path: ${path} with error: Is a directory (os error 21)`
    files.set(target, { bytes: bytesOf(payload), mtime: tick() })
    return null
  }

  /** @param {{ path: string, options?: { baseDir?: number } }} args */
  function read(args) {
    if (isAbsolute(args.path)) {
      const plain = plainOutside(args.path)
      if (!granted.has(plain)) throw `forbidden path: ${args.path}`
      const bytes = outside.get(plain)
      if (bytes === undefined) throw `failed to open file at path: ${args.path} with error: No such file or directory (os error 2)`
      return bytes
    }
    const target = inDocuments(args.path, args.options?.baseDir)
    const file = files.get(target)
    if (file === undefined) throw `failed to open file at path: ${args.path} with error: No such file or directory (os error 2)`
    return file.bytes
  }

  /** @type {Record<string, (args: any, headers: Record<string, string>) => unknown>} */
  const handlers = {
    'plugin:fs|write_text_file': (payload, headers) => write(payload, headers),
    'plugin:fs|write_file': (payload, headers) => write(payload, headers),
    'plugin:fs|read_text_file': (args) => read(args),
    'plugin:fs|read_file': (args) => read(args),
    'plugin:fs|exists': (args) => {
      const target = inDocuments(args.path, args.options?.baseDir)
      return files.has(target) || dirs.has(target)
    },
    'plugin:fs|stat': (args) => {
      const target = inDocuments(args.path, args.options?.baseDir)
      const file = files.get(target)
      if (file === undefined && !dirs.has(target)) throw `failed to get metadata of path: ${args.path} with error: No such file or directory (os error 2)`
      return {
        isFile: file !== undefined,
        isDirectory: file === undefined,
        isSymlink: false,
        size: file?.bytes.length ?? 0,
        mtime: file?.mtime ?? null,
        atime: null,
        birthtime: null,
        readonly: false,
      }
    },
    'plugin:fs|read_dir': (args) => {
      const target = inDocuments(args.path, args.options?.baseDir)
      if (!dirs.has(target)) throw `failed to read directory at path: ${args.path} with error: No such file or directory (os error 2)`
      const prefix = target === '' ? '' : `${target}/`
      /** @type {Array<{ name: string, isDirectory: boolean, isFile: boolean, isSymlink: boolean }>} */
      const entries = []
      for (const dir of dirs) {
        if (target === '' && dir === APP) continue
        if (dir !== target && dir.startsWith(prefix) && !dir.slice(prefix.length).includes('/')) {
          entries.push({ name: dir.slice(prefix.length), isDirectory: true, isFile: false, isSymlink: false })
        }
      }
      for (const path of files.keys()) {
        if (target === '' && path.startsWith(`${APP}/`)) continue
        if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/')) {
          entries.push({ name: path.slice(prefix.length), isDirectory: false, isFile: true, isSymlink: false })
        }
      }
      return entries
    },
    'plugin:fs|mkdir': (args) => {
      const target = inDocuments(args.path, args.options?.baseDir)
      if (files.has(target)) throw `failed to create directory at path: ${args.path} with error: File exists (os error 17)`
      if (!args.options?.recursive && !dirs.has(parentOf(target))) throw `failed to create directory at path: ${args.path} with error: No such file or directory (os error 2)`
      const parts = target.split('/')
      for (let i = 1; i <= parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'))
      return null
    },
    'plugin:fs|rename': (args) => {
      const from = inDocuments(args.oldPath, args.options?.oldPathBaseDir)
      const to = inDocuments(args.newPath, args.options?.newPathBaseDir)
      const file = files.get(from)
      if (file === undefined) throw `failed to rename old path: ${args.oldPath} to new path: ${args.newPath} with error: No such file or directory (os error 2)`
      if (!dirs.has(parentOf(to))) throw `failed to rename old path: ${args.oldPath} to new path: ${args.newPath} with error: No such file or directory (os error 2)`
      files.delete(from)
      // A rename keeps the file's own modification time, as on a real filesystem.
      files.set(to, file)
      return null
    },
    'plugin:fs|remove': (args) => {
      const target = inDocuments(args.path, args.options?.baseDir)
      if (!files.delete(target)) throw `failed to remove path: ${args.path} with error: No such file or directory (os error 2)`
      return null
    },
    'plugin:dialog|open': () => {
      const path = picks.length > 0 ? picks.shift() ?? null : null
      if (path !== null) granted.add(plainOutside(path))
      return path
    },
    take_opened_files: () => opened.splice(0, opened.length),
  }

  /**
   * The bridge's `invoke`, as `globalThis.__TAURI_INTERNALS__.invoke` is called.
   *
   * @param {string} cmd
   * @param {unknown} [args]
   * @param {{ headers?: Record<string, string> }} [invokeOptions]
   * @returns {Promise<unknown>}
   */
  function invoke(cmd, args = {}, invokeOptions = {}) {
    const headers = invokeOptions?.headers ?? {}
    const json = /** @type {any} */ (args)
    /** @type {{ cmd: string, path?: string, newPath?: string }} */
    const call = { cmd }
    const path = headers.path !== undefined ? decodeURIComponent(headers.path) : json?.oldPath ?? json?.path
    if (typeof path === 'string') call.path = path
    if (typeof json?.newPath === 'string') call.newPath = json.newPath
    calls.push(call)
    const fault = faults.get(cmd)
    if (fault !== undefined) {
      faults.delete(cmd)
      return Promise.reject(fault)
    }
    const handler = handlers[cmd]
    if (handler === undefined) return Promise.reject(`Command ${cmd} not found`)
    try {
      return Promise.resolve(handler(args, headers))
    } catch (error) {
      return Promise.reject(typeof error === 'string' ? error : String(error))
    }
  }

  return {
    invoke,
    calls,
    /** @returns {boolean} Whether this fake answers `cmd`. */
    handles: (/** @type {string} */ cmd) => Object.hasOwn(handlers, cmd),
    /** Every file under Documents, sorted, as Documents-relative paths. */
    documents: () => [...files.keys()].filter((path) => !path.startsWith(`${APP}/`)).sort(),
    /** Every file under `$APPDATA` (`TODO/io-015`), sorted, `$APPDATA`-relative. */
    appData: () => [...files.keys()].filter((path) => path.startsWith(`${APP}/`)).map((path) => path.slice(APP.length + 1)).sort(),
    /** A `$APPDATA`-relative file's text, or `null`. */
    appText: (/** @type {string} */ path) => {
      const file = files.get(`${APP}/${path}`)
      return file === undefined ? null : decoder.decode(new Uint8Array(file.bytes))
    },
    /** Put a file under `$APPDATA`, as the app's own earlier session would have. */
    putAppData: (/** @type {string} */ path, /** @type {string} */ text) => {
      const parent = parentOf(`${APP}/${path}`)
      handlers['plugin:fs|mkdir']({ path: parent.slice(APP.length), options: { baseDir: APPDATA, recursive: true } }, {})
      files.set(`${APP}/${path}`, { bytes: Array.from(encoder.encode(text)), mtime: tick() })
    },
    /** A Documents-relative file's text, or `null`. */
    text: (/** @type {string} */ path) => {
      const file = files.get(path)
      return file === undefined ? null : decoder.decode(new Uint8Array(file.bytes))
    },
    /** A Documents-relative file's modification time, or `null`. */
    mtime: (/** @type {string} */ path) => files.get(path)?.mtime ?? null,
    /** Put a file under Documents, as another app or the MCP server would; a new mtime. */
    put: (/** @type {string} */ path, /** @type {string} */ text) => {
      const parent = parentOf(path)
      if (parent !== '') handlers['plugin:fs|mkdir']({ path: parent, options: { baseDir: DOCUMENT, recursive: true } }, {})
      files.set(path, { bytes: Array.from(encoder.encode(text)), mtime: tick() })
    },
    /** Put a file outside Documents (iCloud Drive, another app); readable once the dialog picks it. */
    putOutside: (/** @type {string} */ path, /** @type {string} */ text) => {
      outside.set(path, Array.from(encoder.encode(text)))
    },
    /** What the next dialog open returns: a path, or `null` for a dismissed picker. */
    queuePick: (/** @type {string | null} */ path) => {
      picks.push(path)
    },
    /**
     * A file the shell received from an open-URL event: `path: null` for one directly in
     * Documents, else its full path, which (as the shell does) joins the scope, with `text`.
     */
    queueOpened: (/** @type {{ name: string, path: string | null }} */ entry, /** @type {string} */ text = '') => {
      if (entry.path !== null) {
        outside.set(plainOutside(entry.path), Array.from(encoder.encode(text)))
        granted.add(plainOutside(entry.path))
      }
      opened.push(entry)
    },
    /** The next call of `cmd` rejects with `message`. */
    fail: (/** @type {string} */ cmd, /** @type {string} */ message) => {
      faults.set(cmd, message)
    },
    baseName,
  }
}
