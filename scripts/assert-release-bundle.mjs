// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Fails a build that is about to ship if it still contains a development-only feature:
 * `window.__e2eImport` (`VITE_E2E_HOOKS=1`) or the live-bridge preview transport
 * (`VITE_LIVE_BRIDGE=1`). Usage: `node scripts/assert-release-bundle.mjs <build dir>`.
 *
 * @module scripts/assert-release-bundle
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PREVIEW_TRANSPORT_MARKER } from '../src/ai/bridge/previewTransport.js'

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('usage: node scripts/assert-release-bundle.mjs <build dir>')
    process.exit(2)
  }
  const found = findDevOnlyMarkers(dir)
  for (const { file, marker } of found) console.error(`${dir}/assets/${file} contains ${marker}`)
  if (found.length > 0) {
    console.error('A development-only flag (VITE_E2E_HOOKS / VITE_LIVE_BRIDGE) was on for this build.')
    process.exit(1)
  }
  console.log(`${dir}: no development-only code in the bundle`)
}
