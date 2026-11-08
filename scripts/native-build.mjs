// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Build-time helpers for `vite build --mode native` (`npm run build:native`, `TODO/build-017`).
 *
 * @module scripts/native-build
 */

/**
 * The native target stamped into `__SHELL__`: `WARPCAD_SHELL` when the caller names one, otherwise
 * derived from `TAURI_ENV_PLATFORM`, which the Tauri CLI sets for `beforeBuildCommand` (`ios`,
 * `android`, `windows`, and `darwin` for macOS). Plain `tauri` when neither is set.
 *
 * @param {Record<string, string | undefined>} env the build's environment (`process.env`)
 * @returns {string}
 */
export function shellTarget(env) {
  if (env.WARPCAD_SHELL) return env.WARPCAD_SHELL
  const platform = env.TAURI_ENV_PLATFORM ?? ''
  if (platform === '') return 'tauri'
  return `tauri-${platform === 'darwin' ? 'macos' : platform}`
}
