// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Progress + green-stamp helper for the TODO runner (`/fix-todo`, `/run-todos`, `/test`).
//
//   node scripts/todo-progress.mjs step <id> <1-9> [--state=running] [--model=sonnet] [--note="..."]
//   node scripts/todo-progress.mjs done <id>
//   node scripts/todo-progress.mjs batch <done>/<size>
//   node scripts/todo-progress.mjs stamp set | check | gate [--wait=60]
//
// `step`/`done`/`batch` write small JSON files under `.todo-progress/` (gitignored). A
// Claude Code mod (`~/.claude/dev-mods/.../todo-progress`) polls that directory to show
// what each running TODO is doing — the file format below is its contract.
//
// `stamp` records a fingerprint of the working tree's *code* (everything tracked or
// untracked-but-not-ignored, minus TODO/, chat/ and .todo-progress/, which no test reads)
// when a full test run goes green. `stamp check` exits 0 if the tree is unchanged since,
// so a later caller (the commit gate) can skip re-running an identical, already-green suite.
// The fingerprint is a sha256 (the "token" printed by `set`/`check`/`gate`).
//
// `stamp gate` is for a caller that is about to start a test run: exit 1 = go ahead and run,
// exit 0 = the tree already passed, skip it. With a stale stamp it exits 1 at once. With a
// matching one it asks "run again?" on a terminal (y = run, anything else = skip); with no
// terminal it waits `--wait` seconds (default 60) so the run can be cancelled, then exits 1.

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

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

/** Delete progress files untouched for over a day so the directory can't grow forever. */
function prune() {
  try {
    for (const f of readdirSync(DIR)) {
      const p = join(DIR, f)
      if (Date.now() - statSync(p).mtimeMs > 86_400_000) unlinkSync(p)
    }
  } catch {
    /* directory doesn't exist yet */
  }
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

/** @returns {string} sha256 over the content of every file a test could read */
function fingerprint() {
  const git = (args, input) =>
    execFileSync('git', args, { input, maxBuffer: 1 << 28 }).toString('utf8')
  const paths = git(['ls-files', '-z', '-c', '-o', '--exclude-standard'])
    .split('\0')
    .filter((p) => p && !/^(TODO|chat|\.todo-progress)\//.test(p))
  const sorted = [...new Set(paths)].sort()
  const present = sorted.filter((p) => {
    try {
      statSync(p)
      return true
    } catch {
      return false // tracked-but-deleted
    }
  })
  const hashes = git(['hash-object', '--stdin-paths'], present.join('\n') + '\n')
    .trim()
    .split('\n')
  const h = createHash('sha256')
  present.forEach((p, i) => h.update(`${p}\0${hashes[i]}\n`))
  return h.digest('hex')
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
} else if (cmd === 'stamp' && (a === 'set' || a === 'check' || a === 'gate')) {
  const fp = fingerprint()
  if (a === 'set') {
    writeJson(file('_green'), { fingerprint: fp, at: new Date().toISOString() })
    console.log(`green-stamp: set ${fp}`)
  } else if (a === 'check') {
    const ok = readJson(file('_green'))?.fingerprint === fp
    console.log(ok ? `green-stamp: match ${fp} (tree unchanged since last green run)` : 'green-stamp: stale')
    process.exit(ok ? 0 : 1)
  } else {
    const prev = readJson(file('_green'))
    if (prev?.fingerprint !== fp) {
      console.log('green-stamp: stale, run the tests')
      process.exit(1)
    }
    console.log(`Tests already passed on this exact code: ${fp} (at ${prev.at}).`)
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      const answer = await new Promise((r) => rl.question('Run them again? [y/N] ', r))
      rl.close()
      process.exit(/^y/i.test(answer.trim()) ? 1 : 0)
    }
    const seconds = Number(values.wait)
    console.log(`No terminal to ask: waiting ${seconds}s, then running again. Cancel now to skip.`)
    await new Promise((r) => setTimeout(r, seconds * 1000))
    process.exit(1)
  }
} else {
  throw new Error('usage: step | done | batch | stamp set|check|gate (see header of scripts/todo-progress.mjs)')
}
