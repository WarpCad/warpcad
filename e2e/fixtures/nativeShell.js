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

/**
 * @typedef {object} NativeShellOptions
 * @property {string} [platform] what `shell_info` reports as the OS (`ios`, `macos`, `android`, `windows`); default `ios`
 * @property {string} [version] what `shell_info` reports as the shell's version; default `1.13.0`
 * @property {Record<string, unknown>} [commands] further commands and the JSON each resolves with
 */

/**
 * Install the fake bridge before any app script runs. Call before `page.goto`.
 *
 * @param {import('@playwright/test').Page} page
 * @param {NativeShellOptions} [options]
 */
export async function installNativeShell(page, options = {}) {
  const table = {
    shell_info: { platform: options.platform ?? 'ios', version: options.version ?? '1.13.0' },
    ...options.commands,
  }
  await page.addInitScript((commands) => {
    /** @type {Map<string, unknown>} */
    const table = new Map(Object.entries(commands))
    /** @type {Array<{ cmd: string, args: unknown }>} */
    const calls = []
    const internals = {
      /** @param {string} cmd @param {Record<string, unknown>} [args] */
      invoke(cmd, args = {}) {
        calls.push({ cmd, args: JSON.parse(JSON.stringify(args)) })
        if (!table.has(cmd)) return Promise.reject(`Command ${cmd} not found`)
        return Promise.resolve(JSON.parse(JSON.stringify(table.get(cmd))))
      },
      metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
    }
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', { configurable: true, value: internals })
    /** @type {any} */
    const testSide = window
    testSide.__nativeShell = {
      calls,
      /** @param {string} name @param {unknown} value */
      set: (name, value) => table.set(name, value),
      names: () => [...table.keys()].sort(),
    }
  }, table)
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
