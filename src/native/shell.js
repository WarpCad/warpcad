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
 * @property {string} platform the OS the target names (`ios`, `macos`, `android`, `windows`), `''` when unknown
 */

/**
 * What the shell itself reports through its `shell_info` command (`warpcad-native/src-tauri/src/lib.rs`).
 *
 * @typedef {object} ShellDetails
 * @property {string} platform the OS the shell runs on (`ios`, `macos`, `android`, `windows`), `''` when unknown
 * @property {string} version the shell's own version, `''` when unknown
 */

/** The command the shell registers for {@link loadShellDetails}. */
export const SHELL_INFO_COMMAND = 'shell_info'

/** How each platform is written in the UI ("iOS app", "macOS app"). */
const PLATFORM_NAMES = Object.freeze({ ios: 'iOS', macos: 'macOS', android: 'Android', windows: 'Windows' })

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
  return { native: isNativeShell(probe), target: probe.target, platform: platformOfTarget(probe.target) }
}

/**
 * The OS a build target names: `tauri-ios` is `ios`. A bare `tauri` or an unknown target gives `''`.
 *
 * @param {string} target the build-time `__SHELL__` value
 * @returns {string}
 */
export function platformOfTarget(target) {
  const os = target.startsWith('tauri-') ? target.slice('tauri-'.length) : ''
  return Object.hasOwn(PLATFORM_NAMES, os) ? os : ''
}

/**
 * The platform as the UI writes it: `iOS`, `macOS`, `Android`, `Windows`. Unknown gives `Native`.
 *
 * @param {string} platform
 * @returns {string}
 */
export function platformName(platform) {
  return Object.hasOwn(PLATFORM_NAMES, platform) ? PLATFORM_NAMES[/** @type {keyof typeof PLATFORM_NAMES} */ (platform)] : 'Native'
}

/**
 * Help's version line inside a native shell (`TODO/build-017`):
 * `WarpCad <version> (<commit>) · <platform> app <shell version>`, for example
 * `WarpCad 1.13.0 (a1b2c3d) · iOS app 1.13.0`. The package's `0.0.0` placeholder reads `dev`, as the
 * header label does (`TODO/ai-024`). A shell version not yet known is left off rather than guessed.
 *
 * @param {{ version: string, commit: string, platform: string, shellVersion: string }} parts
 * @returns {string}
 */
export function nativeVersionLine({ version, commit, platform, shellVersion }) {
  const release = version === '0.0.0' ? 'dev' : version
  const app = `${platformName(platform)} app${shellVersion ? ` ${shellVersion}` : ''}`
  return `WarpCad ${release} (${commit}) · ${app}`
}

/**
 * Asks the shell what it is. Falls back to the build target's platform and no version when the
 * command is missing or answers with something unexpected, so Help still shows a line.
 *
 * @param {ShellProbe} probe
 * @param {BridgeGlobal} [global] the global object to read the bridge from
 * @returns {Promise<ShellDetails>}
 */
export async function loadShellDetails(probe, global = /** @type {BridgeGlobal} */ (/** @type {unknown} */ (globalThis))) {
  const fallback = { platform: platformOfTarget(probe.target), version: '' }
  try {
    const answer = /** @type {{ platform?: unknown, version?: unknown } | null} */ (await invoke(SHELL_INFO_COMMAND, {}, global))
    return {
      platform: typeof answer?.platform === 'string' && answer.platform ? answer.platform : fallback.platform,
      version: typeof answer?.version === 'string' ? answer.version : '',
    }
  } catch {
    return fallback
  }
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
