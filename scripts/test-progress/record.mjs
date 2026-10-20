// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Shared by the vitest and playwright reporters: store a finished run in
// `.todo-progress/_runs.json` (TODO/build-014) so the pre-push hook can ask whether the tests
// ran on the code being pushed. The fingerprint is taken when the run starts and again when it
// ends; if they differ the tree was edited mid-run and the entry is stored `moved`, which never
// vouches for anything. Like `write.mjs`, it must never be able to fail the run it describes.

import { fingerprint, recordRun } from '../todo-progress-lib.mjs'

/**
 * @param {'unit'|'e2e'} suite
 * @param {{ fingerprint?: () => string, record?: typeof recordRun }} [deps] injectable for tests
 * @returns {{ start: () => void, finish: (result: { scope: 'full'|'partial', passed: number, failed: number, skipped: number, failures: string[] }) => void }}
 */
export function createRunRecorder(suite, { fingerprint: fp = fingerprint, record = recordRun } = {}) {
  /** @type {string|null} */
  let before = null
  return {
    start() {
      try {
        before = fp()
      } catch {
        before = null
      }
    },
    finish(result) {
      try {
        if (!before) return // not a git checkout, or start() failed: nothing to vouch for
        const after = fp()
        record(suite, {
          fingerprint: before,
          ...result,
          at: new Date().toISOString(),
          ...(after === before ? {} : { moved: true }),
        })
      } catch {
        // best-effort, like the progress file
      }
    },
  }
}
