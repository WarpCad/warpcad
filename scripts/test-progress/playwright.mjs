// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Playwright reporter: one tick per finished *test* (a retried test counts once, when its
// last attempt ends). The total comes from the suite Playwright hands `onBegin`, so it
// already reflects `--project`, `--grep` and sharding. See `write.mjs` for the format.

import { createProgress } from './write.mjs'
import { createRunRecorder } from './record.mjs'

export default class TestProgressReporter {
  #progress = createProgress('playwright', 'tests')
  #runs = createRunRecorder('e2e')
  #full = false
  #passed = 0
  #failed = 0
  #skipped = 0
  #failures = []

  onBegin(config, suite) {
    this.#progress.start(suite.allTests().length)
    this.#full = isFullRun(config, suite)
    this.#runs.start()
  }

  onTestEnd(test, result) {
    const isFinal = result.status === 'passed' || result.status === 'skipped' || result.retry >= test.retries
    if (!isFinal) return
    this.#progress.tick(result.status !== 'passed' && result.status !== 'skipped')
    if (result.status === 'passed') this.#passed += 1
    else if (result.status === 'skipped') this.#skipped += 1
    else {
      this.#failed += 1
      // titlePath() is ['', project, file, ...describes, title]
      const [, project, file, ...titles] = test.titlePath()
      this.#failures.push(`${file} > ${titles.join(' > ')} > ${project}`)
    }
  }

  onEnd(result) {
    this.#progress.end(result.status === 'passed' ? 'done' : 'failed')
    this.#runs.finish({
      scope: this.#full && result.status !== 'interrupted' ? 'full' : 'partial',
      passed: this.#passed,
      failed: this.#failed,
      skipped: this.#skipped,
      failures: this.#failures,
    })
  }
}

// Options that take a separate value and do not narrow what runs.
const NEUTRAL_VALUE_FLAGS = new Set(['-j', '--workers', '--retries', '--timeout', '--reporter', '-c', '--config', '--output', '--repeat-each', '--max-failures'])

/**
 * An e2e run is `full` when the nine engine/viewport projects each ran at least one test and no
 * filter was passed. Playwright 1.63 keeps the CLI filters (`--project`, `-g`, `--last-failed`,
 * `--shard`, file paths) off the public config, so the only record of them is `config.argv`
 * (the command line Playwright itself parsed). Any argument it cannot place counts as a filter:
 * a false `partial` costs a re-run, a false `full` would let an untested push through.
 * @param {{ argv?: string[], shard?: unknown }} config
 * @param {{ suites: { title: string, allTests: () => unknown[] }[] }} suite
 * @returns {boolean}
 */
export function isFullRun(config, suite) {
  const ran = new Set(suite.suites.filter((s) => s.allTests().length > 0).map((s) => s.title))
  const matrixRan = ['chromium', 'firefox', 'webkit'].every((e) => ['laptop', 'tablet', 'phone'].every((v) => ran.has(`${e}-${v}`)))
  if (!matrixRan || config.shard || !Array.isArray(config.argv)) return false
  const rest = config.argv.slice(config.argv.indexOf('test') + 1)
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]
    if (!arg.startsWith('-')) return false // a file or title filter
    const flag = arg.split('=')[0]
    if (['--update-snapshots', '-u', '--quiet', '--ui', '--headed', '--debug', '--trace'].includes(flag)) continue
    if (NEUTRAL_VALUE_FLAGS.has(arg)) i += 1
    else if (!NEUTRAL_VALUE_FLAGS.has(flag)) return false // --project, -g, --grep, --last-failed, --shard, --only-changed, --list ...
  }
  return true
}
