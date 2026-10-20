// SPDX-License-Identifier: AGPL-3.0-or-later
// TODO/build-014: the code fingerprint, the stored test-run results, and the pre-push check.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attestLines,
  fingerprint,
  fingerprintOfCommit,
  prune,
  readRuns,
  recordRun,
  verifyPush,
  ZERO_SHA,
} from './todo-progress-lib.mjs'
import { createRunRecorder } from './test-progress/record.mjs'
import { isFullRun } from './test-progress/playwright.mjs'
import { summarize } from './test-progress/vitest.mjs'

const dirs = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

/** A throwaway repo with a commit, to compare the working-tree and commit-tree fingerprints. */
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'tpl-'))
  dirs.push(dir)
  const git = (...args) => execFileSync('git', args, { cwd: dir }).toString()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 't@example.com')
  git('config', 'user.name', 't')
  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'TODO'))
  writeFileSync(join(dir, 'src/a.js'), 'a\n')
  writeFileSync(join(dir, 'package-lock.json'), '{}\n')
  writeFileSync(join(dir, 'TODO/x.md'), 'x\n')
  writeFileSync(join(dir, '.gitignore'), 'ignored.txt\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'init')
  const inDir = { git: (args, input) => execFileSync('git', args, { cwd: dir, input }).toString(), exists: (p) => existsSync(join(dir, p)) }
  return { dir, git, deps: inDir }
}

describe('fingerprint', () => {
  it('agrees between the working tree and the commit tree on a clean checkout', () => {
    const { deps } = repo()
    expect(fingerprint(deps)).toBe(fingerprintOfCommit('HEAD', deps))
  })

  it('changes for an untracked file, a src/ edit and a lockfile edit', () => {
    const { dir, deps } = repo()
    const base = fingerprint(deps)
    writeFileSync(join(dir, 'new.js'), 'n\n')
    const withNew = fingerprint(deps)
    expect(withNew).not.toBe(base)
    writeFileSync(join(dir, 'src/a.js'), 'changed\n')
    const withEdit = fingerprint(deps)
    expect(withEdit).not.toBe(withNew)
    writeFileSync(join(dir, 'package-lock.json'), '{"a":1}\n')
    expect(fingerprint(deps)).not.toBe(withEdit)
  })

  it('ignores TODO/, chat/ and ignored files', () => {
    const { dir, deps } = repo()
    const base = fingerprint(deps)
    writeFileSync(join(dir, 'TODO/x.md'), 'changed\n')
    mkdirSync(join(dir, 'chat'))
    writeFileSync(join(dir, 'chat/post.md'), 'p\n')
    writeFileSync(join(dir, 'ignored.txt'), 'i\n')
    expect(fingerprint(deps)).toBe(base)
  })

  it('drops a tracked-but-deleted file the way the commit tree no longer has it', () => {
    const { dir, git, deps } = repo()
    rmSync(join(dir, 'src/a.js'))
    git('commit', '-q', '-am', 'rm')
    expect(fingerprint(deps)).toBe(fingerprintOfCommit('HEAD', deps))
  })
})

describe('prune', () => {
  it('keeps _-prefixed records and removes an old step file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tpp-'))
    dirs.push(dir)
    for (const f of ['_runs.json', '_green.json', 'old-001.json']) writeFileSync(join(dir, f), '{}')
    const old = new Date(Date.now() - 2 * 86_400_000)
    for (const f of ['_runs.json', '_green.json', 'old-001.json']) utimesSync(join(dir, f), old, old)
    prune(dir)
    expect(existsSync(join(dir, '_runs.json'))).toBe(true)
    expect(existsSync(join(dir, '_green.json'))).toBe(true)
    expect(existsSync(join(dir, 'old-001.json'))).toBe(false)
  })
})

describe('recordRun / readRuns', () => {
  it('overwrites one suite and leaves the other', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tpr-'))
    dirs.push(dir)
    const path = join(dir, '_runs.json')
    const r = (fingerprint) => ({ fingerprint, scope: 'full', passed: 1, failed: 0, skipped: 0, failures: [], at: 'now' })
    recordRun('unit', r('a'), path)
    recordRun('e2e', r('b'), path)
    recordRun('unit', r('c'), path)
    const runs = readRuns(path)
    expect(runs.unit.fingerprint).toBe('c')
    expect(runs.e2e.fingerprint).toBe('b')
  })
})

describe('verifyPush', () => {
  const TIP = 'a'.repeat(40)
  const REMOTE = 'b'.repeat(40)
  const FP_TREE = [`100644 blob ${'1'.repeat(40)}\tsrc/a.js`, ''].join('\0')
  const fp = fingerprintOfCommit('x', { git: () => FP_TREE })
  const run = (over = {}) => ({ fingerprint: fp, scope: 'full', passed: 10, failed: 0, skipped: 0, failures: [], at: '2026-10-20T00:00:00Z', ...over })
  const stdin = (remoteRef = 'refs/heads/main', remoteSha = REMOTE, localSha = TIP) => `refs/heads/main ${localSha} ${remoteRef} ${remoteSha}\n`
  /** git stub: ls-tree returns the fixed tree, log returns `trailers` */
  const gitWith = (trailers = '') => vi.fn((args) => (args[0] === 'ls-tree' ? FP_TREE : trailers))

  it.each([
    ['a missing entry', { unit: run() }, 'e2e: no result stored', 'npm run test:e2e:headless'],
    ['a partial scope', { unit: run(), e2e: run({ scope: 'partial' }) }, 'e2e: the stored run was partial', 'npm run test:e2e:headless'],
    ['a moved tree', { unit: run({ moved: true }), e2e: run() }, 'unit: the tree changed while it was running', 'npm run test:unit -- --run'],
    ['different code', { unit: run({ fingerprint: 'zzz' }), e2e: run() }, 'unit: it ran on different code', 'npm run test:unit -- --run'],
  ])('refuses on %s, naming the suite and the command', (_n, runs, suiteLine, command) => {
    const r = verifyPush(stdin(), { git: gitWith(), runs })
    expect(r.ok).toBe(false)
    const text = r.lines.join('\n')
    expect(text).toContain(suiteLine)
    expect(text).toContain(command)
  })

  it('allows matching entries with no failures', () => {
    const r = verifyPush(stdin(), { git: gitWith(), runs: { unit: run(), e2e: run() } })
    expect(r.ok).toBe(true)
  })

  it('refuses failures with no trailer, and with a trailer naming only some', () => {
    const runs = { unit: run({ failures: ['a.spec.js > x'] }), e2e: run({ failures: ['e.js > y > chromium-laptop'] }) }
    expect(verifyPush(stdin(), { git: gitWith(''), runs }).ok).toBe(false)
    const some = verifyPush(stdin(), { git: gitWith('a.spec.js > x\n'), runs })
    expect(some.ok).toBe(false)
    expect(some.lines.join('\n')).toContain('e.js > y > chromium-laptop')
    expect(some.lines.join('\n')).not.toContain('  a.spec.js > x')
  })

  it('allows failures when the range names all of them, wherever the trailer sits', () => {
    const runs = { unit: run({ failures: ['a.spec.js > x'] }), e2e: run({ failures: ['e.js > y > chromium-laptop'] }) }
    const git = gitWith('a.spec.js > x\n\ne.js > y > chromium-laptop\n')
    const r = verifyPush(stdin(), { git, runs })
    expect(r.ok).toBe(true)
    expect(git).toHaveBeenCalledWith(['log', expect.stringContaining('Known-failures'), `${REMOTE}..${TIP}`])
  })

  it('reads the whole history for a new branch, and falls back when the remote tip is unknown', () => {
    const runs = { unit: run({ failures: ['f'] }), e2e: run() }
    const fresh = gitWith('f\n')
    expect(verifyPush(stdin('refs/heads/main', ZERO_SHA), { git: fresh, runs }).ok).toBe(true)
    expect(fresh).toHaveBeenCalledWith(['log', expect.any(String), TIP])
    const git = vi.fn((args) => {
      if (args[0] === 'ls-tree') return FP_TREE
      if (args[2].includes('..')) throw new Error('bad object')
      return 'f\n'
    })
    expect(verifyPush(stdin(), { git, runs }).ok).toBe(true)
  })

  it('passes tag pushes, other branches and deletions without checking anything', () => {
    const git = vi.fn()
    expect(verifyPush(`refs/tags/v1 ${TIP} refs/tags/v1 ${ZERO_SHA}\n`, { git, runs: {} }).ok).toBe(true)
    expect(verifyPush(`refs/heads/x ${TIP} refs/heads/x ${ZERO_SHA}\n`, { git, runs: {} }).ok).toBe(true)
    expect(verifyPush(`(delete) ${ZERO_SHA} refs/heads/main ${REMOTE}\n`, { git, runs: {} }).ok).toBe(true)
    expect(verifyPush('', { git, runs: {} }).ok).toBe(true)
    expect(git).not.toHaveBeenCalled()
  })

  it('attestLines prints one trailer per stored failure of this tree, and nothing otherwise', () => {
    const runs = { unit: run({ failures: ['a > b'] }), e2e: run({ failures: ['a > b', 'c > d > p'] }) }
    expect(attestLines(runs, fp)).toEqual(['Known-failures: a > b', 'Known-failures: c > d > p'])
    expect(attestLines(runs, 'other')).toEqual([])
    expect(attestLines({ unit: run(), e2e: run() }, fp)).toEqual([])
  })
})

describe('run recorder', () => {
  it('stores the start fingerprint, and marks the entry moved when the tree changed mid-run', () => {
    const record = vi.fn()
    const fps = ['one', 'two']
    const rec = createRunRecorder('e2e', { fingerprint: () => fps.shift(), record })
    rec.start()
    rec.finish({ scope: 'full', passed: 1, failed: 0, skipped: 0, failures: [] })
    expect(record).toHaveBeenCalledWith('e2e', expect.objectContaining({ fingerprint: 'one', moved: true }))
  })

  it('stores an unmoved entry without the flag, and never throws', () => {
    const record = vi.fn()
    const rec = createRunRecorder('unit', { fingerprint: () => 'same', record })
    rec.start()
    rec.finish({ scope: 'full', passed: 1, failed: 0, skipped: 0, failures: [] })
    expect(record.mock.calls[0][1]).not.toHaveProperty('moved')
    const boom = createRunRecorder('unit', { fingerprint: () => 'x', record: () => { throw new Error('disk') } })
    boom.start()
    expect(() => boom.finish({ scope: 'full', passed: 0, failed: 0, skipped: 0, failures: [] })).not.toThrow()
  })
})

describe('isFullRun (playwright)', () => {
  const names = ['chromium', 'firefox', 'webkit'].flatMap((e) => ['laptop', 'tablet', 'phone'].map((v) => `${e}-${v}`))
  const suite = (list = names) => ({ suites: list.map((title) => ({ title, allTests: () => [1] })) })
  const argv = (...rest) => ['node', 'playwright', 'test', ...rest]

  it('is full for a bare run, with or without neutral flags', () => {
    expect(isFullRun({ argv: argv() }, suite())).toBe(true)
    expect(isFullRun({ argv: argv('--workers', '4', '--reporter=list', '-u') }, suite())).toBe(true)
  })

  it.each([
    ['--project=guards'],
    ['--grep', 'x'],
    ['-g', 'x'],
    ['--last-failed'],
    ['--shard=1/2'],
    ['e2e/naming.spec.js'],
  ])('is partial with %s', (...flags) => {
    expect(isFullRun({ argv: argv(...flags) }, suite())).toBe(false)
  })

  it('is partial when a matrix project ran no tests, or a shard is set', () => {
    expect(isFullRun({ argv: argv() }, suite(names.slice(1)))).toBe(false)
    expect(isFullRun({ argv: argv(), shard: { current: 1, total: 2 } }, suite())).toBe(false)
  })
})

describe('summarize (vitest)', () => {
  const testCase = (fullName, state) => ({ fullName, result: () => ({ state }) })
  const mod = (moduleId, state, cases) => ({ moduleId, state: () => state, children: { allTests: () => cases } })
  const vitest = (all, cfg = {}) => ({ config: cfg, globTestSpecifications: async () => new Array(all).fill(0) })

  it('is full when every globbed spec ran with no name filter', async () => {
    const s = await summarize(vitest(1), 1, [mod('/x/a.spec.js', 'passed', [testCase('t', 'passed'), testCase('u', 'skipped')])])
    expect(s).toMatchObject({ scope: 'full', passed: 1, skipped: 1, failed: 0, failures: [] })
  })

  it('is partial for a file filter, a name pattern or watch mode', async () => {
    expect((await summarize(vitest(5), 1, [])).scope).toBe('partial')
    expect((await summarize(vitest(1, { testNamePattern: /x/ }), 1, [])).scope).toBe('partial')
    expect((await summarize(vitest(1, { watch: true }), 1, [])).scope).toBe('partial')
  })

  it('names failing tests and a file that failed to run', async () => {
    const s = await summarize(vitest(2), 2, [
      mod(`${process.cwd()}/a.spec.js`, 'failed', [testCase('s > t', 'failed')]),
      mod(`${process.cwd()}/b.spec.js`, 'failed', []),
    ])
    expect(s.failures).toEqual(['a.spec.js > s > t', 'b.spec.js > (file failed to run)'])
    expect(s.failed).toBe(2)
  })
})
