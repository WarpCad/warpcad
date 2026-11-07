// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * What the app knows about the native shell it may be running inside (`TODO/build-017`,
 * `docs/decisions/native-mobile-shell.md`). Framework-free: no Vue, no DOM beyond a
 * `globalThis` lookup, so a unit test drives every branch with plain objects.
 *
 * Two facts identify a native build:
 * - the build-time target, `__SHELL__`, stamped by the `native` Vite mode (`''` on the web);
 * - the runtime bridge, `__TAURI_INTERNALS__`, which the Tauri webview injects before the page runs.
 *
 * `@tauri-apps/api` is deliberately not imported: its licence is not on the `npm run licenses`
 * allow-list, and the bridge is one global function. Mirrors the raw-`fetch`-not-SDK choice in
 * `docs/decisions/ai-partner.md`.
 *
 * @module native/shell
 */

/**
 * @typedef {object} ShellProbe
 * @property {string} target the build-time shell target, `''` for the web build
 * @property {unknown} [internals] the value of `globalThis.__TAURI_INTERNALS__`, when present
 */

/**
 * @typedef {object} ShellInfo
 * @property {boolean} native true when the page runs inside a native shell
 * @property {string} target the build-time shell target (`''` on the web)
 */

/**
 * The part of the global object the shell reads: the bridge the Tauri webview injects, when there is one.
 *
 * @typedef {object} BridgeGlobal
 * @property {{ invoke?: (cmd: string, args: Record<string, unknown>) => Promise<unknown> }} [__TAURI_INTERNALS__]
 */

/**
 * Reads the two identifying facts from the running page.
 *
 * @param {BridgeGlobal} [global] the global object to probe (`globalThis` in the app; a plain object in tests)
 * @param {string} [target] the build-time `__SHELL__` value
 * @returns {ShellProbe}
 */
export function probeShell(global = /** @type {BridgeGlobal} */ (/** @type {unknown} */ (globalThis)), target = typeof __SHELL__ === 'string' ? __SHELL__ : '') {
  return { target, internals: global.__TAURI_INTERNALS__ }
}

/**
 * True when the page runs inside a native shell. A build stamped with a target counts even if the
 * bridge is missing (the page is then broken, and that should not silently look like the web).
 *
 * @param {ShellProbe} probe
 * @returns {boolean}
 */
export function isNativeShell(probe) {
  return probe.target !== '' || probe.internals !== undefined
}

/**
 * The shell's identity for Help and diagnostics.
 *
 * @param {ShellProbe} probe
 * @returns {ShellInfo}
 */
export function shellInfo(probe) {
  return { native: isNativeShell(probe), target: probe.target }
}

/**
 * Calls a native command over the Tauri bridge. Rejects, rather than throwing synchronously, when
 * the page has no bridge, so callers can use one `catch` for "not available here".
 *
 * @param {string} cmd the command name the Rust side registered
 * @param {Record<string, unknown>} [args] the arguments, as JSON
 * @param {BridgeGlobal} [global] the global object to read the bridge from
 * @returns {Promise<unknown>}
 */
export function invoke(cmd, args = {}, global = /** @type {BridgeGlobal} */ (/** @type {unknown} */ (globalThis))) {
  const internals = global.__TAURI_INTERNALS__
  if (!internals || typeof internals.invoke !== 'function') {
    return Promise.reject(new Error(`native command "${cmd}" needs the native shell`))
  }
  return internals.invoke(cmd, args)
}
