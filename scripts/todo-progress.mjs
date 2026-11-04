// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Progress + green-check helper for the TODO runner (`/fix-todo`, `/run-todos`, `/test`, `/commit`).
//
//   node scripts/todo-progress.mjs step <id> <1-9> [--state=running] [--model=sonnet] [--note="..."]
//   node scripts/todo-progress.mjs done <id>
//   node scripts/todo-progress.mjs batch <done>/<size>
//   node scripts/todo-progress.mjs stamp check | results | attest | verify-push   (TODO/build-014)
//
// `step`/`done`/`batch` write small JSON files under `.todo-progress/` (gitignored). A
// Claude Code mod (`~/.claude/dev-mods/.../todo-progress`) polls that directory to show
// what each running TODO is doing — the file format below is its contract.
//
// There is no separate "green" file to set. The unit and e2e reporters (scripts/test-progress/)
// store every finished run in `.todo-progress/_runs.json` (fingerprint, scope, counts, failing
// test ids), whoever started it: a hand run, `/test`, or a run the pre-push hook asks for.
//
//   stamp check        exits 0 when both suites have a stored full run, unmoved and failure-free,
//                      on the current code (`greenStatus`); exits 1 and names the stale suite
//                      otherwise. `/test` and `/commit` use it to skip a re-run. It never runs tests.
//   stamp results      prints what is stored.
//   stamp attest       prints the `Known-failures:` commit-message trailer for the current tree.
//   stamp verify-push  the `.githooks/pre-push` entry point: refuses a push of main unless both
//                      suites ran in full on the pushed commit. It never runs tests.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { attestLines, fingerprint, greenStatus, prune, readRuns, verifyPush, SUITE_COMMANDS } from './todo-progress-lib.mjs'

const DIR = '.todo-progress'
const STEP_NAMES = [
  'locate', 'scope', 'preflight', 'red-green', 'verify', 'accept', 'retire', 'roadmap', 'commit',
]
const STATES = ['running', 'failed', 'escalated', 'blocked', 'done']

/** @param {string} name @returns {string} */
const file = (name) => join(DIR, `${name}.json`)

/** @param {string} path @returns {any} parsed JSON, or null if absent/corrupt */
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** @param {string} path @param {unknown} value */
function writeJson(path, value) {
  mkdirSync(DIR, { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}

/** @param {string} id @returns {string} the TODO's frontmatter title, or '' */
function titleOf(id) {
  for (const dir of ['TODO', 'TODO/done']) {
    try {
      const name = readdirSync(dir).find((f) => f.startsWith(`${id}-`) && f.endsWith('.md'))
      if (!name) continue
      const m = readFileSync(join(dir, name), 'utf8').match(/^title:\s*(.+)$/m)
      return m ? m[1].trim() : ''
    } catch {
      /* try next dir */
    }
  }
  return ''
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    state: { type: 'string', default: 'running' },
    model: { type: 'string' },
    note: { type: 'string' },
    wait: { type: 'string', default: '60' },
  },
})
const [cmd, a, b] = positionals

if (cmd === 'step') {
  const step = Number(b)
  if (!a || !(step >= 1 && step <= 9)) throw new Error('usage: step <id> <1-9> [--state --model --note]')
  if (!STATES.includes(values.state)) throw new Error(`--state must be one of ${STATES.join('|')}`)
  const prev = readJson(file(a))
  const now = new Date().toISOString()
  writeJson(file(a), {
    id: a,
    title: prev?.title || titleOf(a),
    step,
    stepName: STEP_NAMES[step - 1],
    state: values.state,
    model: values.model ?? prev?.model ?? '',
    note: values.note ?? '',
    startedAt: prev?.startedAt ?? now,
    updatedAt: now,
  })
  prune()
} else if (cmd === 'done') {
  if (!a) throw new Error('usage: done <id>')
  const prev = readJson(file(a)) ?? { id: a, title: titleOf(a), startedAt: new Date().toISOString() }
  writeJson(file(a), { ...prev, step: 9, stepName: 'commit', state: 'done', note: '', updatedAt: new Date().toISOString() })
} else if (cmd === 'batch') {
  const m = /^(\d+)\/(\d+)$/.exec(a ?? '')
  if (!m) throw new Error('usage: batch <done>/<size>')
  writeJson(file('_batch'), { done: Number(m[1]), size: Number(m[2]), updatedAt: new Date().toISOString() })
} else if (cmd === 'stamp' && (a === 'check' || a === 'results' || a === 'attest' || a === 'verify-push')) {
  if (a === 'verify-push') {
    const stdin = process.stdin.isTTY ? '' : readFileSync(0, 'utf8')
    const { ok, lines } = verifyPush(stdin)
    for (const l of lines) (ok ? console.log : console.error)(l)
    process.exit(ok ? 0 : 1)
  }
  const fp = fingerprint()
  if (a === 'results') {
    const runs = readRuns()
    for (const suite of Object.keys(SUITE_COMMANDS)) {
      const r = runs[suite]
      if (!r) {
        console.log(`${suite}: no result stored (run: ${SUITE_COMMANDS[suite]})`)
        continue
      }
      const age = Math.round((Date.now() - Date.parse(r.at)) / 60_000)
      const match = r.fingerprint === fp ? 'matches this tree' : 'DIFFERENT code than this tree'
      console.log(`${suite}: ${r.scope}${r.moved ? ' (tree moved mid-run)' : ''}, ${r.passed} passed, ${r.failed} failed, ${r.skipped} skipped, ${age} min ago, ${match}`)
    }
  } else if (a === 'attest') {
    for (const l of attestLines(readRuns(), fp)) console.log(l)
  } else {
    // check: the same answer for an agent and for a person, read from the stored runs.
    const { green, lines } = greenStatus(readRuns(), fp)
    for (const l of lines) console.log(l)
    console.log(green ? `green: every suite passed in full on ${fp.slice(0, 12)}` : `not green on ${fp.slice(0, 12)}`)
    process.exit(green ? 0 : 1)
  }
} else {
  throw new Error('usage: step | done | batch | stamp check|results|attest|verify-push (see header of scripts/todo-progress.mjs)')
}
