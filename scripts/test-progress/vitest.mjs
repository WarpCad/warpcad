// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vitest reporter: one tick per finished test *file* (the total is known up front from the
// run's specifications, which is what makes an ETA possible). See `write.mjs` for the format.

import { createProgress } from './write.mjs'
import { createRunRecorder } from './record.mjs'

export default class TestProgressReporter {
  #progress = createProgress('vitest', 'files')
  #runs = createRunRecorder('unit')
  #vitest = null
  #specCount = 0

  onInit(vitest) {
    this.#vitest = vitest
  }

  onTestRunStart(specifications) {
    this.#progress.start(specifications.length)
    this.#specCount = specifications.length
    this.#runs.start()
  }

  onTestModuleEnd(testModule) {
    this.#progress.tick(testModule.state() === 'failed')
  }

  async onTestRunEnd(testModules) {
    this.#progress.end(testModules.some((m) => m.state() === 'failed') ? 'failed' : 'done')
    try {
      this.#runs.finish(await summarize(this.#vitest, this.#specCount, testModules))
    } catch {
      // never fail the run
    }
  }
}

/**
 * A unit run is `full` when every spec file the config matches ran, with no name filter, shard,
 * changed-only mode or watch mode. Reading the glob rather than the argv covers a file filter too.
 * @param {any} vitest the instance handed to `onInit`
 * @param {number} ran spec files this run started
 * @param {readonly any[]} testModules
 * @returns {Promise<{ scope: 'full'|'partial', passed: number, failed: number, skipped: number, failures: string[] }>}
 */
export async function summarize(vitest, ran, testModules) {
  const cfg = vitest?.config ?? {}
  const all = vitest ? (await vitest.globTestSpecifications()).length : -1
  const full = all === ran && !cfg.testNamePattern && !cfg.shard && !cfg.changed && !cfg.watch
  let passed = 0
  let failed = 0
  let skipped = 0
  const failures = []
  for (const m of testModules) {
    const file = m.moduleId.replace(`${process.cwd()}/`, '')
    let failedCases = 0
    for (const t of m.children.allTests()) {
      const state = t.result().state
      if (state === 'passed') passed += 1
      else if (state === 'failed') {
        failed += 1
        failedCases += 1
        failures.push(`${file} > ${t.fullName}`)
      } else skipped += 1
    }
    // A file that failed without a failing test (import error, empty suite) must still be named.
    if (m.state() === 'failed' && !failedCases) {
      failed += 1
      failures.push(`${file} > (file failed to run)`)
    }
  }
  return { scope: full ? 'full' : 'partial', passed, failed, skipped, failures }
}
