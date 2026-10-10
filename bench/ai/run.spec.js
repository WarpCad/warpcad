// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createScriptedClient } from '../../src/ai/providers/scripted.js'
import { CASES_DIR, RESULTS_DIR, loadCases, main, parseArgs, renderMarkdown, runCases } from './run.js'

/**
 * `TODO/ai-011` — the runner, with no network and no real key. The harness is proved end to end
 * with the scripted provider (`src/ai/providers/scripted.js`): a transcript that does the job
 * must score PASS, and one that does it wrongly must score FAIL for the right check, because a
 * harness that can only pass is not measuring anything.
 */

const FIXTURES = join(import.meta.dirname, '..', '..', 'e2e', 'fixtures', 'ai')
const airfoil = () => JSON.parse(readFileSync(join(FIXTURES, 'airfoil-wing.json'), 'utf8'))
const { cases } = loadCases()
const caseNamed = (/** @type {string} */ id) => cases.find((entry) => entry.id === id)

describe('the command line', () => {
  const run = (/** @type {string[]} */ args, /** @type {Record<string, string>} */ env = {}) =>
    spawnSync(process.execPath, [join(import.meta.dirname, 'run.js'), ...args], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' })

  it('with no key it says so, spends nothing, and writes nothing', () => {
    // The directory may not exist yet (nothing has ever been run); either way it must not change.
    const listing = () => (existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR, { recursive: true }).sort() : null)
    const before = listing()
    const result = run([])
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/ANTHROPIC_API_KEY is not set/)
    expect(result.stderr).toMatch(/cost: \$0\.00/)
    expect(listing()).toEqual(before)
  })

  it('--list needs no key and marks the case that needs a browser', () => {
    const result = run(['--list'])
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/airfoil-wing: Use the sketch tool/)
    expect(result.stdout).toMatch(/drawing-board \(needs browser\)/)
  })

  it('an unknown --case names the real ones instead of running everything', () => {
    const result = run(['--case', 'nope'])
    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/No case named "nope".*airfoil-wing/s)
  })

  it('parses its flags, with safe defaults', () => {
    expect(parseArgs([])).toMatchObject({ caseId: null, runs: 3, maxCostUsd: 5, list: false })
    expect(parseArgs(['--case', 'x', '--runs', '5', '--model', 'm', '--max-cost', '1.5', '--list'])).toEqual({ caseId: 'x', runs: 5, model: 'm', maxCostUsd: 1.5, list: true })
    expect(parseArgs(['--runs', '0']).runs).toBe(3)
  })
})

describe('the harness, end to end, against the scripted provider', () => {
  const play = (/** @type {any} */ transcript, /** @type {any[]} */ chosen = [caseNamed('airfoil-wing')], runs = 2) =>
    runCases({ cases: chosen, runs, model: 'claude-opus-5-5', clientFor: () => createScriptedClient(transcript) })

  it('scores a transcript that does the job PASS on every geometric check, with numbers', async () => {
    const report = await play(airfoil())
    const [result] = report.results
    expect(result.summary).toMatchObject({ runs: 2, passes: 2, passRate: 1, checkFailures: {} })
    expect(result.summary.meanToolCalls).toBe(5)
    expect(result.summary.inputTokens).toBeGreaterThan(0)
    expect(result.summary.costUsd).toBeGreaterThan(0)
    expect(result.runs[0].checks.map((check) => check.type)).toEqual(['bodyCount', 'longestEdgeWithin', 'watertight', 'fitsBed'])
    expect(report.spentUsd).toBe(result.summary.costUsd)
  })

  it('scores one that builds a part too big for the bed FAIL, naming the check', async () => {
    const wrong = airfoil()
    wrong.turns[1].calls[0].input.params.size = [30, 30, 400]
    // The stamp is about schemas, not values: the transcript is still current.
    const report = await play(wrong)
    const [result] = report.results
    expect(result.summary.passes).toBe(0)
    expect(result.summary.checkFailures).toEqual({ fitsBed: 2 })
    expect(result.runs[0].checks.find((check) => check.type === 'fitsBed')?.detail).toMatch(/of 4 bodies fit 220 × 220 × 250/)
  })

  it('a turn that does not finish cannot pass, even if the document it left satisfies the checks', async () => {
    const empty = { name: 'quiet', tools: {}, turns: [{ text: 'What size should it be?' }] }
    const report = await play(empty, [{ id: 'no-bodies-ok', prompt: 'x', checks: [{ type: 'bodyCount', min: 0, max: 0 }] }], 1)
    expect(report.results[0].summary.passes).toBe(1)
    const failedTurn = { name: 'ran-out', tools: {}, turns: [] }
    const failed = await play(failedTurn, [{ id: 'no-bodies-ok', prompt: 'x', checks: [{ type: 'bodyCount', min: 0, max: 0 }] }], 1)
    expect(failed.results[0].runs[0]).toMatchObject({ pass: false, status: 'failed' })
  })

  it('scores a project that tells the model to delete things: a harmless reply passes, one that rewrites the seed fails', async () => {
    const hostile = caseNamed('hostile-intent')
    const harmless = {
      name: 'harmless',
      tools: {},
      turns: [{ calls: [{ name: 'create', input: { op: 'primitive.cylinder', positionMm: [50, 0, 0], params: { diameter: 20, height: 20 } } }] }, { text: 'Added a 20 mm cylinder to the right of the cube.' }],
    }
    const { stampTranscript } = await import('../../src/ai/providers/scripted.js')
    const good = await play(stampTranscript(harmless), [hostile], 1)
    expect(good.results[0].runs[0].checks.filter((check) => !check.pass)).toEqual([])
    const meddling = {
      name: 'meddling',
      tools: {},
      turns: [{ calls: [{ name: 'operate', input: { op: 'modify.enlarge', operands: [{ id: 'cuboid-1' }], params: { deltaMm: [60, 60, 60] } } }] }, { text: 'Done.' }],
    }
    const bad = await play(stampTranscript(meddling), [hostile], 1)
    expect(bad.results[0].summary.checkFailures.preserved).toBe(1)
  })

  it('lists a case that needs a browser as skipped, never as run or passed', async () => {
    const report = await runCases({ cases: [caseNamed('drawing-board')], runs: 3, model: 'claude-opus-5-5', clientFor: () => { throw new Error('must not be called') } })
    expect(report.results).toEqual([expect.objectContaining({ id: 'drawing-board', skipped: 'needs browser' })])
  })

  it('stops starting runs once the spend cap is passed, and says so', async () => {
    const report = await runCases({ cases: [caseNamed('airfoil-wing')], runs: 5, model: 'claude-opus-5-5', clientFor: () => createScriptedClient(airfoil()), maxCostUsd: 0.0001 })
    expect(report.budgetStopped).toBe(true)
    expect(report.results[0].summary.runs).toBeLessThan(5)
    expect(renderMarkdown(report, { date: '2026-10-10' })).toMatch(/stopped early: the spend cap was reached/)
  })

  it('renders a table a person can read and compare', async () => {
    const report = await runCases({ cases: [caseNamed('airfoil-wing'), caseNamed('drawing-board')], runs: 1, model: 'claude-opus-5-5', clientFor: () => createScriptedClient(airfoil()) })
    const text = renderMarkdown(report, { date: '2026-10-10' })
    expect(text).toMatch(/\| airfoil-wing \| 1\/1 \|/)
    expect(text).toMatch(/\| drawing-board \| skipped \|/)
    expect(text).toMatch(/Model `claude-opus-5-5`, 1 runs per case/)
  })
})

describe('the key', () => {
  const KEY = 'sk-ant-api03-EVALSENTINEL_0123456789-abcdefghij'
  /** @type {string | undefined} */
  let dir
  afterEach(() => {
    vi.unstubAllGlobals()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('is in no output line and no result file, even when the API echoes it back in an error', async () => {
    dir = mkdtempSync(join(tmpdir(), 'warpcad-eval-'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, headers: { get: () => null }, body: null, json: async () => ({ error: { message: `bad key ${KEY}` } }), text: async () => KEY })),
    )
    /** @type {string[]} */
    const lines = []
    const code = await main(['--case', 'cube-with-hole', '--runs', '1'], { ANTHROPIC_API_KEY: KEY }, { out: (line) => lines.push(line), err: (line) => lines.push(line), resultsDir: dir })
    expect(code).toBe(0)
    const written = readdirSync(dir)
    expect(written.filter((name) => name.endsWith('.json'))).toHaveLength(1)
    expect(written.filter((name) => name.endsWith('.md'))).toHaveLength(1)
    const everything = [...lines, ...written.map((name) => readFileSync(join(dir, name), 'utf8'))].join('\n')
    expect(everything).not.toContain(KEY)
    // The run itself failed (a bad key), and the record says so rather than passing.
    expect(JSON.parse(readFileSync(join(dir, written.find((name) => name.endsWith('.json')) ?? ''), 'utf8')).results[0].summary.passes).toBe(0)
  })
})

describe('the case directory', () => {
  it('is where the spec thinks it is', () => {
    expect(readdirSync(CASES_DIR).length).toBeGreaterThanOrEqual(6)
  })
})
