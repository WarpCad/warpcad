// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Rotating e2e pair. The 3 engines x 3 viewports matrix is nine projects; running all of them on
// every run is too slow to iterate on. Instead each run executes ALL specs on just TWO projects,
// and the pair changes from run to run, so the whole matrix is covered over a few runs.
//
//   npm run test:e2e:headless              next pair in the rotation (+ guards)
//   npm run test:e2e:headless -- e2e/x.e2e.js   same pair, only that spec
//   npm run test:e2e:headless -- --project=webkit-phone   explicit project: no rotation, run as typed
//   npm run test:e2e:full                  the whole 9-way matrix, no rotation
//   node scripts/e2e-rotate.mjs --peek     print the next pair, change nothing
//
// A clean run of a pair counts as a green run (the reporter stores it as `full`, see
// `scripts/test-progress/playwright.mjs`). The rotation moves on only after a clean run, so a
// red pair is re-run on the same two projects until the fix is proven there; then the next run
// moves to a new pair. State lives in `.todo-progress/e2e-rotation.json` (gitignored).

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const STATE_FILE = join(ROOT, '.todo-progress', 'e2e-rotation.json')

const ENGINES = ['chromium', 'webkit', 'firefox']
const VIEWPORTS = ['phone', 'tablet', 'laptop']

/**
 * Every engine-viewport project, in rotation order. Firefox sorts last so that
 * leaving it out (below) trims the tail instead of reshuffling the pairs.
 * @param {{ skipFirefox?: boolean }} [opts]
 * @returns {string[]}
 */
export function allProjects({ skipFirefox = false } = {}) {
  return ENGINES.filter((e) => !(skipFirefox && e === 'firefox')).flatMap((e) => VIEWPORTS.map((v) => `${e}-${v}`))
}

/**
 * The pair for run number `index`. A project is paired with the one four places along the list,
 * which is a different viewport and (nine projects) a different engine, so each run crosses both
 * axes. Over `n` runs every project appears in exactly two pairs.
 * @param {number} index run counter, any non-negative integer
 * @param {string[]} [projects]
 * @returns {[string, string]}
 */
export function pairFor(index, projects = allProjects()) {
  const n = projects.length
  const k = ((index % n) + n) % n
  return [projects[k], projects[(k + 4) % n]]
}

/** @param {string} [path] @returns {number} */
export function readIndex(path = STATE_FILE) {
  try {
    const n = JSON.parse(readFileSync(path, 'utf8')).next
    return Number.isInteger(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

/** @param {number} next @param {string[]} pair @param {string} [path] */
export function writeIndex(next, pair, path = STATE_FILE) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, JSON.stringify({ next, lastPair: pair, at: new Date().toISOString() }, null, 2) + '\n')
  renameSync(`${path}.tmp`, path)
}

/**
 * Should this command line be left alone? An explicit `--project` means the caller already chose.
 * @param {string[]} args
 * @returns {boolean}
 */
export function hasExplicitProject(args) {
  return args.some((a) => a === '--project' || a.startsWith('--project=') || a === '-p')
}

const VALUE_FLAGS = new Set(['-j', '--workers', '--retries', '--timeout', '--reporter', '-c', '--config', '--output', '--repeat-each', '--max-failures'])

/**
 * Does this command line run fewer tests than the whole suite (a spec path, a title filter, a
 * shard)? Such a run proves less than a pair run, so it does not move the rotation on.
 * @param {string[]} args
 * @returns {boolean}
 */
export function narrowsRun(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (!a.startsWith('-')) return true
    if (VALUE_FLAGS.has(a)) i += 1
    else if (!['--update-snapshots', '-u', '--quiet', '--headed', '--debug', '--trace'].includes(a.split('=')[0]) && !VALUE_FLAGS.has(a.split('=')[0])) return true
  }
  return false
}

function main(args) {
  const skipFirefox = process.env.CLAUDE_CODE_REMOTE === 'true' || process.env.E2E_SKIP_FIREFOX === '1'
  const projects = allProjects({ skipFirefox })
  const index = readIndex()
  const pair = pairFor(index, projects)

  if (args.includes('--peek')) {
    console.log(pair.join(' '))
    return 0
  }

  const explicit = hasExplicitProject(args)
  const flags = explicit ? [] : [...pair, 'guards'].map((p) => `--project=${p}`)
  if (!explicit) console.log(`e2e rotation: run ${index + 1}, projects ${pair.join(' + ')} (+ guards)${skipFirefox ? ', firefox skipped' : ''}`)

  const bin = join(ROOT, 'node_modules', '.bin', 'playwright')
  const result = spawnSync(existsSync(bin) ? bin : 'npx', [...(existsSync(bin) ? [] : ['playwright']), 'test', ...flags, ...args], {
    stdio: 'inherit',
    cwd: ROOT,
    env: { ...process.env, ...(explicit ? {} : { WARPCAD_E2E_PAIR: pair.join(',') }) },
  })
  const status = result.status ?? 1
  if (!explicit && status === 0 && !narrowsRun(args)) writeIndex(index + 1, pair)
  else if (!explicit && status !== 0) console.log(`e2e rotation: red, the next run repeats ${pair.join(' + ')}`)
  return status
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)))
