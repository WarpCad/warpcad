// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Re-stamp the scripted-provider transcripts in `e2e/fixtures/ai/` (`TODO/ai-010`).
 *
 * Each transcript carries a hash of the input schema of every tool it calls. When a tool's
 * schema changes, `src/ai/providers/scripted.spec.js` fails with "re-record". The honest fix is:
 *
 *   1. Read the diff to the tool's schema and update the transcript's calls to match it.
 *   2. Run `npx playwright test e2e/ai-scripted.e2e.js`: the browser run is what proves the calls
 *      still do what the transcript's own text claims.
 *   3. Only then run this script (`npm run ai:stamp`) to record the new hashes.
 *
 * Stamping without steps 1 and 2 turns a stale fixture green without making it true.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { stampTranscript } from '../src/ai/providers/scripted.js'

const dir = join(import.meta.dirname, '..', 'e2e', 'fixtures', 'ai')
for (const file of readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
  const path = join(dir, file)
  const stamped = stampTranscript(JSON.parse(readFileSync(path, 'utf8')))
  writeFileSync(path, `${JSON.stringify(stamped, null, 2)}\n`)
  console.log(`stamped ${file}: ${Object.keys(stamped.tools).join(', ')}`)
}
