// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Shared writer for the test-progress reporters (`vitest.mjs`, `playwright.mjs`).
//
// Each runner owns one small JSON file under `.test-progress/` (gitignored). A Claude
// Code mod (`~/.claude/dev-mods/.../test-progress`) polls that directory to show how far a
// test run has gone and an ETA — the file format below is its contract:
//
//   { runner, state: 'running'|'done'|'failed', unit: 'files'|'tests',
//     done, total, failed, startedAt, updatedAt }   (timestamps are ISO strings)
//
// Written to a temp name then renamed, so the poller never reads half a file. A reporter
// must never be able to fail a test run, so every write swallows its own errors.

import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = '.test-progress'

/**
 * Create a writer bound to one runner.
 * @param {string} runner file stem and display name, e.g. `vitest`
 * @param {'files'|'tests'} unit what `done`/`total` count
 * @returns {{ start: (total: number) => void, tick: (didFail: boolean) => void, end: (state: 'done'|'failed') => void }}
 */
export function createProgress(runner, unit) {
  let total = 0
  let done = 0
  let failed = 0
  let startedAt = ''

  const flush = (state) => {
    try {
      mkdirSync(DIR, { recursive: true })
      const file = join(DIR, `${runner}.json`)
      const body = { runner, state, unit, done, total, failed, startedAt, updatedAt: new Date().toISOString() }
      writeFileSync(`${file}.tmp`, JSON.stringify(body))
      renameSync(`${file}.tmp`, file)
    } catch {
      // progress is best-effort; never break the run it describes
    }
  }

  return {
    start(count) {
      total = count
      done = 0
      failed = 0
      startedAt = new Date().toISOString()
      flush('running')
    },
    tick(didFail) {
      done += 1
      if (didFail) failed += 1
      flush('running')
    },
    end(state) {
      flush(state)
    },
  }
}
