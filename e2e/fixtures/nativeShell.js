// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * A fake Tauri bridge for Playwright (`TODO/build-017`): the boundary mock every native-shell
 * `*.e2e.js` spec reuses. The real `globalThis.__TAURI_INTERNALS__` is injected by the Tauri
 * webview before any page script runs, so this installs one the same way, with an `addInitScript`,
 * and backs its `invoke` with an in-memory command table. `src/native/shell.js` is the only app code
 * that reads it. It works the same in Chromium, Firefox and WebKit.
 *
 * Every call is logged in `window.__nativeShell.calls`. A command the table does not have rejects
 * with the string Tauri itself rejects with, so a spec sees the app's "not available" path.
 *
 *     import { installNativeShell } from './fixtures/nativeShell.js'
 *     await installNativeShell(page, { platform: 'ios', version: '1.13.0' })
 */

import { createFakeTauriFs } from '../../src/native/__fixtures__/fakeFs.js'

/**
 * @typedef {object} NativeShellOptions
 * @property {string} [platform] what `shell_info` reports as the OS (`ios`, `macos`, `android`, `windows`); default `ios`
 * @property {string} [version] what `shell_info` reports as the shell's version; default `1.13.0`
 * @property {Record<string, unknown>} [commands] further commands and the JSON each resolves with
 */

/**
 * The page side of the fake bridge. Serialised into the page with `toString()` (see
 * {@link installNativeShell}), so it must be self-contained.
 *
 * @param {Record<string, unknown>} commands the JSON command table
 * @param {typeof createFakeTauriFs} createFs the in-memory Documents folder (`TODO/io-014`)
 */
function installInPage(commands, createFs) {
  /** @type {Map<string, unknown>} */
  const table = new Map(Object.entries(commands))
  const fs = createFs()
  /** @type {Array<{ cmd: string, args: unknown }>} */
  const calls = []
  const internals = {
    /**
     * @param {string} cmd
     * @param {unknown} [args]
     * @param {{ headers?: Record<string, string> }} [options]
     */
    invoke(cmd, args = {}, options = {}) {
      const binary = args instanceof ArrayBuffer || ArrayBuffer.isView(args)
      calls.push({ cmd, args: binary ? { bytes: /** @type {ArrayBufferView} */ (args).byteLength, headers: options?.headers ?? {} } : JSON.parse(JSON.stringify(args)) })
      if (table.has(cmd)) return Promise.resolve(JSON.parse(JSON.stringify(table.get(cmd))))
      if (fs.handles(cmd)) return fs.invoke(cmd, args, options)
      return Promise.reject(`Command ${cmd} not found`)
    },
    metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  }
  Object.defineProperty(globalThis, '__TAURI_INTERNALS__', { configurable: true, value: internals })
  /** @type {any} */
  const testSide = window
  testSide.__nativeShell = {
    calls,
    fs,
    /** @param {string} name @param {unknown} value */
    set: (name, value) => table.set(name, value),
    names: () => [...table.keys()].sort(),
  }
}

/**
 * Install the fake bridge before any app script runs. Call before `page.goto`.
 *
 * Besides the command table, the bridge answers `tauri-plugin-fs` and `tauri-plugin-dialog` from
 * an in-memory Documents folder (`src/native/__fixtures__/fakeFs.js`, `TODO/io-014`). It lives in
 * the page, so a reload starts it empty again.
 *
 * @param {import('@playwright/test').Page} page
 * @param {NativeShellOptions} [options]
 */
export async function installNativeShell(page, options = {}) {
  const table = {
    shell_info: { platform: options.platform ?? 'ios', version: options.version ?? '1.13.0' },
    ...options.commands,
  }
  // A script string, not a function: the fake folder's source goes in with it.
  await page.addInitScript({ content: `(${installInPage.toString()})(${JSON.stringify(table)}, ${createFakeTauriFs.toString()})` })
}

/**
 * The commands the app has sent to the fake shell so far, in order.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export const nativeCalls = (page) => page.evaluate(() => /** @type {any} */ (window).__nativeShell.calls.map((/** @type {{ cmd: string }} */ c) => c.cmd))

/**
 * Add or replace a command after the page has loaded.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @param {unknown} value the JSON the command resolves with
 */
export const setNativeCommand = (page, name, value) =>
  page.evaluate(({ name, value }) => /** @type {any} */ (window).__nativeShell.set(name, value), { name, value })

/**
 * Every file in the fake Documents folder, sorted, Documents-relative (`Exports/part.stl`).
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string[]>}
 */
export const nativeDocuments = (page) => page.evaluate(() => /** @type {any} */ (window).__nativeShell.fs.documents())

/**
 * A file's text in the fake Documents folder, or `null`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} path Documents-relative
 * @returns {Promise<string | null>}
 */
export const nativeFileText = (page, path) => page.evaluate((path) => /** @type {any} */ (window).__nativeShell.fs.text(path), path)

/**
 * Put a file outside Documents (iCloud Drive) and make it the next document-picker answer.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} path an absolute path
 * @param {string} text
 */
export const queueNativePick = (page, path, text) =>
  page.evaluate(({ path, text }) => {
    const fs = /** @type {any} */ (window).__nativeShell.fs
    fs.putOutside(path, text)
    fs.queuePick(path)
  }, { path, text })

/**
 * Make the next call of a native command reject with `message`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} cmd
 * @param {string} message
 */
export const failNativeCommand = (page, cmd, message) =>
  page.evaluate(({ cmd, message }) => /** @type {any} */ (window).__nativeShell.fs.fail(cmd, message), { cmd, message })
