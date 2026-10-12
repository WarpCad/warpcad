// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Vitest reporter: one tick per finished test *file* (the total is known up front from the
// run's specifications, which is what makes an ETA possible). See `write.mjs` for the format.

import { createProgress } from './write.mjs'

export default class TestProgressReporter {
  #progress = createProgress('vitest', 'files')

  onTestRunStart(specifications) {
    this.#progress.start(specifications.length)
  }

  onTestModuleEnd(testModule) {
    this.#progress.tick(testModule.state() === 'failed')
  }

  onTestRunEnd(testModules) {
    this.#progress.end(testModules.some((m) => m.state() === 'failed') ? 'failed' : 'done')
  }
}
