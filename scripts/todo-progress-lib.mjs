// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Library half of `scripts/todo-progress.mjs`: the code fingerprint, the stored test-run
// results (`.todo-progress/_runs.json`) and the pre-push check (TODO/build-014). It lives in
// its own module because the CLI runs top-level code on import, so the test reporters and the
// pre-push hook could not import it.
//
// "This code" means the same thing everywhere here: a sha256 over the tracked-or-untracked,
// non-ignored files under src/ only. Tests, docs, lockfiles and config do not move the number.
// The green stamp, the stored results and the push check all compare that one number.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const DIR = '.todo-progress'
export const RUNS_FILE = join(DIR, '_runs.json')
export const ZERO_SHA = '0'.repeat(40)
export const TRAILER = 'Known-failures'

/** Command that (re)produces each suite's stored result, named in a refusal. */
export const SUITE_COMMANDS = {
  unit: 'npm run test:unit -- --run',
  e2e: 'npm run test:e2e:headless',
}

const WATCHED_DIR = 'src/'

/**
 * @typedef {(args: string[], input?: string) => string} Git runs git, returns stdout
 * @typedef {{ fingerprint: string, scope: 'full'|'partial', passed: number, failed: number,
 *   skipped: number, failures: string[], at: string, moved?: boolean }} RunRecord
 * @typedef {{ unit?: RunRecord, e2e?: RunRecord }} Runs
 */

/** @type {Git} */
export const realGit = (args, input) =>
  execFileSync('git', args, { input, maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] }).toString('utf8')

/**
 * @param {[string, string][]} entries `[path, blobId]` pairs
 * @returns {string} sha256 of the sorted entries
 */
function digest(entries) {
  const h = createHash('sha256')
  for (const [p, id] of [...entries].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) h.update(`${p}\0${id}\n`)
  return h.digest('hex')
}

/**
 * Fingerprint of the working tree's code.
 * @param {{ git?: Git, exists?: (path: string) => boolean }} [deps]
 * @returns {string} sha256
 */
export function fingerprint({ git = realGit, exists = defaultExists } = {}) {
  const paths = git(['ls-files', '-z', '-c', '-o', '--exclude-standard'])
    .split('\0')
    .filter((p) => p && p.startsWith(WATCHED_DIR))
  const present = [...new Set(paths)].filter(exists) // tracked-but-deleted files drop out
  const ids = present.length ? git(['hash-object', '--stdin-paths'], present.join('\n') + '\n').trim().split('\n') : []
  return digest(present.map((p, i) => [p, ids[i]]))
}

/** @param {string} p @returns {boolean} */
function defaultExists(p) {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

/**
 * Fingerprint of a commit's tree, equal to {@link fingerprint} on a clean checkout of it. A push
 * sends commits, not whatever is in the working directory, so the hook must hash the commit.
 * @param {string} rev commit-ish
 * @param {{ git?: Git }} [deps]
 * @returns {string} sha256
 */
export function fingerprintOfCommit(rev, { git = realGit } = {}) {
  const entries = []
  for (const line of git(['ls-tree', '-r', '-z', rev]).split('\0')) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+)$/s.exec(line)
    if (m && m[2].startsWith(WATCHED_DIR)) entries.push([m[2], m[1]])
  }
  return digest(entries)
}

/** @param {string} path @returns {any} parsed JSON, or null if absent/corrupt */
export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Delete step files untouched for over a day so the directory can't grow forever. Names starting
 * with `_` (`_green`, `_batch`, `_runs`) are records that must outlive a weekly push, so they stay.
 * @param {string} [dir]
 * @param {number} [now] epoch ms
 */
export function prune(dir = DIR, now = Date.now()) {
  try {
    for (const f of readdirSync(dir)) {
      if (f.startsWith('_')) continue
      const p = join(dir, f)
      if (now - statSync(p).mtimeMs > 86_400_000) unlinkSync(p)
    }
  } catch {
    /* directory doesn't exist yet */
  }
}

/** @param {string} [path] @returns {Runs} */
export function readRuns(path = RUNS_FILE) {
  return readJson(path) ?? {}
}

/**
 * Store the latest run of one suite, replacing that suite's previous entry.
 * @param {'unit'|'e2e'} suite
 * @param {RunRecord} record
 * @param {string} [path]
 */
export function recordRun(suite, record, path = RUNS_FILE) {
  const all = readRuns(path)
  all[suite] = record
  mkdirSync(DIR, { recursive: true })
  writeFileSync(`${path}.tmp`, JSON.stringify(all, null, 2) + '\n')
  renameSync(`${path}.tmp`, path)
}

/**
 * @param {Runs} runs
 * @param {string} fp fingerprint of the code being checked
 * @returns {string[]} failure ids of every suite whose full, unmoved result matches `fp`
 */
export function failuresFor(runs, fp) {
  const ids = []
  for (const suite of Object.keys(SUITE_COMMANDS)) {
    const r = runs[suite]
    if (r && r.fingerprint === fp && r.scope === 'full' && !r.moved) ids.push(...r.failures)
  }
  return [...new Set(ids)]
}

/**
 * `Known-failures:` trailer lines for a commit of the tree with fingerprint `fp`.
 * @param {Runs} runs
 * @param {string} fp
 * @returns {string[]} lines, empty when nothing failed
 */
export function attestLines(runs, fp) {
  return failuresFor(runs, fp).map((id) => `${TRAILER}: ${id}`)
}

/**
 * Why a suite's stored result cannot vouch for the code with fingerprint `fp`.
 * @param {'unit'|'e2e'} suite
 * @param {RunRecord|undefined} r
 * @param {string} fp
 * @returns {string|null} a reason, or null when it can
 */
function whyNot(suite, r, fp) {
  if (!r) return 'no result stored'
  if (r.moved) return 'the tree changed while it was running'
  if (r.scope !== 'full') return 'the stored run was partial (a filter was passed)'
  if (r.fingerprint !== fp) return 'it ran on different code than the commit being pushed'
  return null
}

/**
 * The pre-push check. Does not run tests; asks whether they ran on the pushed code.
 * @param {string} stdin the hook's stdin: `<local ref> <local sha> <remote ref> <remote sha>` per line
 * @param {{ git?: Git, runs?: Runs }} [deps]
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function verifyPush(stdin, { git = realGit, runs = readRuns() } = {}) {
  const tips = []
  for (const line of stdin.split('\n')) {
    const [, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/)
    if (remoteRef !== 'refs/heads/main' || !localSha || localSha === ZERO_SHA) continue // tags, other branches, deletions
    tips.push({ tip: localSha, remoteSha })
  }
  if (!tips.length) return { ok: true, lines: [] }

  const lines = []
  for (const { tip, remoteSha } of tips) {
    const fp = fingerprintOfCommit(tip, { git })
    const missing = Object.entries(SUITE_COMMANDS).flatMap(([suite, command]) => {
      const why = whyNot(suite, runs[suite], fp)
      return why ? [`  ${suite}: ${why}. Run: ${command}`] : []
    })
    if (missing.length) {
      lines.push(`push refused: the tests have not run on ${tip.slice(0, 9)}.`, ...missing)
      continue
    }
    const failures = failuresFor(runs, fp)
    if (!failures.length) {
      const u = runs.unit.at
      lines.push(`tests ran on this code (unit ${u}, e2e ${runs.e2e.at}); fingerprint ${fp.slice(0, 12)}`)
      continue
    }
    const named = new Set(knownFailures(tip, remoteSha, git))
    const unnamed = failures.filter((id) => !named.has(id))
    if (unnamed.length) {
      lines.push(
        `push refused: ${unnamed.length} failing test(s) are not named in a "${TRAILER}:" trailer of the commits being pushed.`,
        ...unnamed.map((id) => `  ${id}`),
        'Run `node scripts/todo-progress.mjs stamp attest` and add its lines to a commit message.',
      )
      continue
    }
    lines.push(`tests ran on this code with ${failures.length} known failure(s), all named in a ${TRAILER}: trailer.`)
  }
  // A line that opens "push refused" makes the whole push fail.
  return { ok: !lines.some((l) => l.startsWith('push refused')), lines }
}

/**
 * Every `Known-failures:` value in the commits a push would add.
 * @param {string} tip
 * @param {string} remoteSha all zeros for a new branch
 * @param {Git} git
 * @returns {string[]}
 */
function knownFailures(tip, remoteSha, git) {
  const format = `--format=%(trailers:key=${TRAILER},valueonly,unfold)`
  const out = (range) => git(['log', format, range]).split('\n').map((l) => l.trim()).filter(Boolean)
  if (!remoteSha || remoteSha === ZERO_SHA) return out(tip)
  try {
    return out(`${remoteSha}..${tip}`)
  } catch {
    return out(tip) // the remote's tip isn't a local object (someone else pushed): read all history
  }
}
