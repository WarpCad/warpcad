// SPDX-License-Identifier: AGPL-3.0-or-later
// Guard for TODO/testing-004: a kernel/library spec whose slowest test takes seconds on an idle machine
// blows the 5000 ms default the moment the full unit run (or a second process) competes for the CPU.
// Every spec below was measured (see TODO/done/testing-004-*.md) at >= 2 s for its slowest test under a
// 2x-loaded full run; each must declare a file-level testTimeout so a loaded machine slows it, not fails it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** @type {string[]} repo-relative paths of the specs that must declare a timeout */
export const HEAVY_SPECS = [
  'src/core/kernel/recipes/gear.wormPair.spec.js',
  'src/core/kernel/recipes/gear.worm.spec.js',
  'src/core/kernel/recipes/gear.ring.spec.js',
  'src/core/kernel/recipes/gear.bevelPair.spec.js',
  'src/core/kernel/recipes/gear.pair.spec.js',
  'src/core/kernel/recipes/raspberrypi.miniPiTFT.spec.js',
  'src/core/kernel/recipes/raspberrypi.piTFT24.spec.js',
  'src/core/kernel/recipes/raspberrypi.bplus.spec.js',
  'src/core/kernel/recipes/raspberrypi.screen.spec.js',
  'src/core/kernel/measure.spec.js',
  'src/core/kernel/resolution.spec.js',
  'src/core/kernel/fillet.spec.js',
  'src/core/library.spec.js',
  'src/core/document.spec.js',
  'src/core/repeat.fold.spec.js',
  'mcp/server.spec.js',
  'mcp/mcp-add.spec.js',
]

/**
 * The file-level timeout a spec declares via `vi.setConfig({ testTimeout: N })`, in ms.
 * @param {string} rel repo-relative path
 * @returns {number | null}
 */
function declaredTimeout(rel) {
  const text = readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8')
  const m = /vi\.setConfig\(\{\s*testTimeout:\s*([\d_]+)\s*\}\)/.exec(text)
  return m ? Number(m[1].replace(/_/g, '')) : null
}

describe('heavy specs declare a justified timeout (TODO/testing-004)', () => {
  for (const rel of HEAVY_SPECS) {
    it(`${rel} sets a file-level testTimeout of at least 20 s`, () => {
      const ms = declaredTimeout(rel)
      expect(ms, `${rel} has no vi.setConfig({ testTimeout }) — it fails intermittently under full-suite load`).not.toBeNull()
      expect(ms).toBeGreaterThanOrEqual(20_000)
    })
  }
})
