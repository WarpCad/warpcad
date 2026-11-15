// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Build-time helpers for `vite build --mode native` (`npm run build:native`, `TODO/build-017`).
 *
 * @module scripts/native-build
 */
import { rmSync } from 'node:fs'
import { join } from 'node:path'

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

/**
 * Where the native app reads Help from (`TODO/ui-119`): the native bundle ships none, so the index,
 * pages and pictures come from the published web app. The shell's CSP
 * (`warpcad-native/src-tauri/tauri.conf.json`) allows exactly this origin.
 */
export const NATIVE_HELP_BASE = 'https://app.warpcad.com/help/'

/**
 * The `__HELP_BASE__` define: {@link NATIVE_HELP_BASE} in the native mode, `''` (Help under the app's
 * own base, `src/help/loader.js`) everywhere else. A constant in the bundle, never a runtime
 * setting, so nothing in a project file or a URL can point Help somewhere else.
 *
 * @param {string} mode Vite's mode (`native`, `production`, ...).
 * @returns {string} the JSON-encoded define value
 */
export function helpBaseDefine(mode) {
  return JSON.stringify(mode === 'native' ? NATIVE_HELP_BASE : '')
}

/**
 * The `define` entries for the development-only flags. A native build forces both off, whatever the
 * shell's environment or a stray `.env.local` says, so neither can reach a store binary
 * (`scripts/assert-release-bundle.mjs` checks the result).
 *
 * @param {string} mode Vite's mode (`native`, `production`, ...).
 * @returns {Record<string, string>} Empty outside the native mode, where the environment decides.
 */
export function devFlagDefines(mode) {
  if (mode !== 'native') return {}
  return {
    'import.meta.env.VITE_E2E_HOOKS': JSON.stringify(''),
    'import.meta.env.VITE_LIVE_BRIDGE': JSON.stringify(''),
  }
}

/** The page's own policy as a `<meta>` tag: its `http-equiv` is `Content-Security-Policy`. */
const CSP_META = /<meta\b(?:(?!>)[\s\S])*?http-equiv\s*=\s*["']Content-Security-Policy["'][\s\S]*?>\s*/i

/**
 * `TODO/build-032`: the native bundle's `index.html` without the web page's CSP `<meta>` tag. A
 * browser enforces every policy it is given, so the shell's header (`tauri.conf.json`
 * `app.security.csp`) and the tag together allow only what both name, and the tag, written for the
 * web host, knows nothing of `app.warpcad.com` (Help) or `ipc:` (the Tauri bridge). Removing the tag
 * leaves one policy, the shell's. Rewriting it would leave two copies to drift. Every other mode
 * keeps its tag, because GitHub Pages cannot send headers.
 *
 * @param {string} html `index.html`.
 * @param {string} mode Vite's mode (`native`, `production`, ...).
 * @returns {string} `html`, minus the policy tag when `mode` is `native`.
 */
export function stripCspMeta(html, mode) {
  return mode === 'native' ? html.replace(CSP_META, '') : html
}

/**
 * Files from `public/` that serve the web site and that the app never reads, so a native bundle
 * should not carry them (`TODO/build-032`).
 */
export const NATIVE_WEB_ONLY_FILES = ['CNAME', 'llms-full.txt', 'github-social-preview.png', 'github-social-preview.svg']

/**
 * Deletes {@link NATIVE_WEB_ONLY_FILES} from a finished native build folder.
 *
 * @param {string} dir The build folder (`dist-native`).
 * @returns {void}
 */
export function removeWebOnlyFiles(dir) {
  for (const name of NATIVE_WEB_ONLY_FILES) rmSync(join(dir, name), { force: true })
}
