// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Playwright reporter: one tick per finished *test* (a retried test counts once, when its
// last attempt ends). The total comes from the suite Playwright hands `onBegin`, so it
// already reflects `--project`, `--grep` and sharding. See `write.mjs` for the format.

import { createProgress } from './write.mjs'

export default class TestProgressReporter {
  #progress = createProgress('playwright', 'tests')

  onBegin(_config, suite) {
    this.#progress.start(suite.allTests().length)
  }

  onTestEnd(test, result) {
    const isFinal = result.status === 'passed' || result.status === 'skipped' || result.retry >= test.retries
    if (!isFinal) return
    this.#progress.tick(result.status !== 'passed' && result.status !== 'skipped')
  }

  onEnd(result) {
    this.#progress.end(result.status === 'passed' ? 'done' : 'failed')
  }
}
