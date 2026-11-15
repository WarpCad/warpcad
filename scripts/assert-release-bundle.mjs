// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Fails a build that is about to ship if it still contains a development-only feature:
 * `window.__e2eImport` (`VITE_E2E_HOOKS=1`) or the live-bridge preview transport
 * (`VITE_LIVE_BRIDGE=1`). Usage: `node scripts/assert-release-bundle.mjs <build dir>`.
 *
 * @module scripts/assert-release-bundle
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PREVIEW_TRANSPORT_MARKER } from '../src/ai/bridge/previewTransport.js'
import { NATIVE_WEB_ONLY_FILES } from './native-build.mjs'

/** Strings that exist in a bundle only when a development-only flag was on. */
export const DEV_ONLY_MARKERS = ['__e2eImport', PREVIEW_TRANSPORT_MARKER]

/**
 * @param {string} dir A build folder (the one holding `assets/`).
 * @returns {{ file: string, marker: string }[]} Every `.js` asset in `dir/assets` that contains a marker.
 */
export function findDevOnlyMarkers(dir) {
  const assets = join(dir, 'assets')
  /** @type {{ file: string, marker: string }[]} */
  const found = []
  for (const file of readdirSync(assets).filter((name) => name.endsWith('.js'))) {
    const text = readFileSync(join(assets, file), 'utf8')
    for (const marker of DEV_ONLY_MARKERS) if (text.includes(marker)) found.push({ file, marker })
  }
  return found
}

/**
 * `TODO/ui-119`: the native bundle ships no Help (the app reads it from app.warpcad.com), so a
 * `help/` folder in it means the help plugin emitted for the wrong mode.
 *
 * @param {string} dir A build folder.
 * @returns {boolean} True when `dir/help` exists.
 */
export function findBundledHelp(dir) {
  return existsSync(join(dir, 'help'))
}

/**
 * `TODO/build-032`: the native bundle must carry no CSP `<meta>` tag. The browser would enforce it
 * beside the shell's own policy, and the page's, written for the web host, blocks Help and the
 * Tauri bridge.
 *
 * @param {string} dir A build folder.
 * @returns {boolean} True when `dir/index.html` has a `Content-Security-Policy` meta tag.
 */
export function findPageCsp(dir) {
  const file = join(dir, 'index.html')
  if (!existsSync(file)) return false
  return /<meta\b[^>]*http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(readFileSync(file, 'utf8'))
}

/**
 * `TODO/build-032`: files the web site serves and the native app never reads.
 *
 * @param {string} dir A build folder.
 * @returns {string[]} The names from {@link NATIVE_WEB_ONLY_FILES} that `dir` contains.
 */
export function findWebOnlyFiles(dir) {
  return NATIVE_WEB_ONLY_FILES.filter((name) => existsSync(join(dir, name)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const noHelp = args.includes('--no-help')
  const dir = args.find((arg) => !arg.startsWith('--'))
  if (!dir) {
    console.error('usage: node scripts/assert-release-bundle.mjs <build dir> [--no-help]')
    process.exit(2)
  }
  const found = findDevOnlyMarkers(dir)
  for (const { file, marker } of found) console.error(`${dir}/assets/${file} contains ${marker}`)
  if (found.length > 0) {
    console.error('A development-only flag (VITE_E2E_HOOKS / VITE_LIVE_BRIDGE) was on for this build.')
    process.exit(1)
  }
  if (noHelp && findBundledHelp(dir)) {
    console.error(`${dir}/help exists: the native build must ship no Help (TODO/ui-119).`)
    process.exit(1)
  }
  if (noHelp && findPageCsp(dir)) {
    console.error(`${dir}/index.html still has a Content-Security-Policy <meta> tag: the shell's policy must be the only one (TODO/build-032).`)
    process.exit(1)
  }
  const webOnly = noHelp ? findWebOnlyFiles(dir) : []
  if (webOnly.length > 0) {
    console.error(`${dir} carries web-only files the app never reads: ${webOnly.join(', ')} (TODO/build-032).`)
    process.exit(1)
  }
  console.log(`${dir}: no development-only code in the bundle${noHelp ? ', and no bundled Help, page policy or web-only files' : ''}`)
}
