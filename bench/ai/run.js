// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Prompt evals for the assistant (`TODO/ai-011`): a small fixed set of prompts, run several times
 * each against a **real model** with a key from the environment, scored with numbers
 * (`bench/ai/score.js`) and written to a dated result file, so a prompt or tool change can be
 * compared before and after.
 *
 *     ANTHROPIC_API_KEY=… npm run eval:ai
 *     ANTHROPIC_API_KEY=… npm run eval:ai -- --case cube-with-hole --runs 5 --model claude-sonnet-5-5
 *     npm run eval:ai -- --list          # no key, no cost
 *
 * **Never in CI**: it costs money and a model is not deterministic. There is no CI step for it,
 * and `--max-cost` (default $5) stops starting new runs once the estimate passes it.
 *
 * Headless: the agent loop, tool registry and kernel run in plain Node, the way `mcp/` runs them.
 * A case marked `"needs": ["browser"]` (an attached image goes through the sketch sanitiser, which
 * needs a canvas; `capture_view` needs a GPU) is **listed and skipped here**, never faked; running
 * those in a Playwright-driven browser is not built yet (`bench/ai/README.md`).
 *
 * The key is read from `ANTHROPIC_API_KEY`, handed to the client per call, and never printed,
 * logged or written to a result file; an error message goes through `redactKey` first.
 *
 * @module bench/ai/run
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createAgentContext, runTurn } from '../../src/ai/agent.js'
import { createAnthropicClient, redactKey } from '../../src/ai/client.js'
import { DEFAULT_MODEL, isKnownModel } from '../../src/ai/models.js'
import { createToolRegistry, createTurn } from '../../src/ai/tools/index.js'
import { createDocument } from '../../src/core/document.js'
import { aggregate, costUsd, runChecks, snapshotBodies, validateCase } from './score.js'

const HERE = import.meta.dirname
export const CASES_DIR = join(HERE, 'cases')
export const RESULTS_DIR = join(HERE, '..', 'results', 'ai')

/**
 * @param {string} [dir]
 * @returns {{ cases: any[], problems: string[] }} Every case file, and what is wrong with any.
 */
export function loadCases(dir = CASES_DIR) {
  /** @type {any[]} */
  const cases = []
  /** @type {string[]} */
  const problems = []
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.json')).sort()) {
    try {
      const entry = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      const wrong = validateCase(entry)
      if (wrong.length > 0) problems.push(`${file}: ${wrong.join('; ')}`)
      else cases.push(entry)
    } catch (error) {
      problems.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { cases, problems }
}

/**
 * Seed a document the way a loaded project would be: through the tools, so the text a case plants
 * (an intent, say) lands where a real file's text would.
 *
 * @param {ReturnType<typeof createDocument>} document
 * @param {Array<{ tool: string, input: any, request?: string }>} [steps]
 */
function seed(document, steps = []) {
  const tools = createToolRegistry()
  for (const step of steps) {
    const result = /** @type {any} */ (tools.run({ document, origin: 'ai', turn: createTurn(), request: step.request }, step.tool, step.input))
    if (result?.error) throw new Error(`seeding "${step.tool}" failed: ${result.error}`)
  }
}

/** Replica id the harness's document mints seed ids under, so a case can name them. */
const BENCH_REPLICA = 'benchx'

/**
 * One run of one case.
 *
 * @param {object} options
 * @param {any} options.entry The case.
 * @param {import('../../src/ai/client.js').AiClient} options.client
 * @param {string} options.model For the price table only; the client already knows it.
 * @returns {Promise<import('./score.js').RunRecord & { text: string }>}
 */
export async function runOnce({ entry, client, model }) {
  // A fixed replica (`TODO/data-008`) so a case can name the ids its seed creates
  // (`cuboid-benchx-1`); the turn's own fork still mints under a random one.
  const document = createDocument({ replica: BENCH_REPLICA })
  seed(document, entry.seed)
  const seedFacts = snapshotBodies(document)
  const ctx = createAgentContext({
    client,
    document,
    selection: { ids: () => [], select() {} },
    ...(entry.standingInstructions ? { standingInstructions: () => ({ text: entry.standingInstructions, trusted: false }) } : {}),
  })
  const started = Date.now()
  const outcome = await runTurn({ userMessage: entry.prompt, ctx })
  const wallMs = Date.now() - started
  const facts = { bodies: snapshotBodies(document), seed: seedFacts, text: outcome.text ?? '' }
  const checks = runChecks(entry.checks, facts)
  // A turn that did not finish cannot have passed, even if the document it left happens to satisfy
  // every check (a stopped turn leaves nothing, which passes `bodyCount 0`).
  const finished = outcome.status === 'done'
  return {
    pass: finished && checks.every((check) => check.pass),
    checks,
    toolCalls: outcome.steps,
    usage: outcome.usage,
    costUsd: costUsd(outcome.usage, model),
    wallMs,
    status: outcome.status,
    text: facts.text,
  }
}

/**
 * @param {object} options
 * @param {any[]} options.cases
 * @param {number} options.runs
 * @param {string} options.model
 * @param {(entry: any) => import('../../src/ai/client.js').AiClient} options.clientFor A fresh client per run.
 * @param {number} [options.maxCostUsd]
 * @param {(line: string) => void} [options.log]
 */
export async function runCases({ cases, runs, model, clientFor, maxCostUsd = Infinity, log = () => {} }) {
  let spent = 0
  let budgetStopped = false
  /** @type {any[]} */
  const results = []
  for (const entry of cases) {
    if (entry.needs?.includes('browser')) {
      log(`- ${entry.id}: skipped (needs a browser: ${entry.needs.join(', ')})`)
      results.push({ id: entry.id, title: entry.title ?? entry.id, skipped: `needs ${entry.needs.join(', ')}` })
      continue
    }
    /** @type {any[]} */
    const records = []
    for (let index = 0; index < runs; index += 1) {
      if (spent > maxCostUsd) {
        budgetStopped = true
        break
      }
      try {
        const record = await runOnce({ entry, client: clientFor(entry), model })
        spent += record.costUsd ?? 0
        records.push(record)
        log(`- ${entry.id} run ${index + 1}/${runs}: ${record.pass ? 'PASS' : 'FAIL'} (${record.status}, ${record.toolCalls} tool calls, ${record.costUsd === null ? '?' : `$${record.costUsd.toFixed(3)}`})`)
      } catch (error) {
        records.push({ pass: false, checks: [], toolCalls: 0, usage: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, costUsd: 0, wallMs: 0, status: 'error', text: '', error: String(error instanceof Error ? error.message : error) })
        log(`- ${entry.id} run ${index + 1}/${runs}: ERROR ${error instanceof Error ? error.message : error}`)
      }
    }
    results.push({ id: entry.id, title: entry.title ?? entry.id, prompt: entry.prompt, summary: aggregate(records), runs: records })
  }
  return { model, runsPerCase: runs, spentUsd: spent, budgetStopped, results }
}

/** @param {number | null} value */
const dollars = (value) => (value === null ? 'unknown' : `$${value.toFixed(2)}`)

/**
 * @param {Awaited<ReturnType<typeof runCases>>} report
 * @param {{ date: string }} meta
 * @returns {string}
 */
export function renderMarkdown(report, meta) {
  const lines = [
    `# Assistant prompt evals — ${meta.date}`,
    '',
    `Model \`${report.model}\`, ${report.runsPerCase} runs per case, estimated spend ${dollars(report.spentUsd)}` +
      (report.budgetStopped ? ' (**stopped early: the spend cap was reached**)' : '') +
      '. Headless: agent, tools and kernel in Node.',
    '',
    '| Case | Pass | Tool calls | Tokens in / out | Cost | Wall | Failing checks |',
    '|---|---|---|---|---|---|---|',
  ]
  for (const result of report.results) {
    if (result.skipped) {
      lines.push(`| ${result.id} | skipped | | | | | ${result.skipped} |`)
      continue
    }
    const s = result.summary
    const failing = Object.entries(s.checkFailures).map(([type, n]) => `${type} ×${n}`).join(', ') || '—'
    lines.push(`| ${result.id} | ${s.passes}/${s.runs} | ${s.meanToolCalls.toFixed(1)} | ${s.inputTokens} / ${s.outputTokens} | ${dollars(s.costUsd)} | ${(s.meanWallMs / 1000).toFixed(1)} s | ${failing} |`)
  }
  lines.push('', '## Runs', '')
  for (const result of report.results) {
    if (result.skipped) continue
    lines.push(`### ${result.id}`, '', `> ${result.prompt}`, '')
    for (const [index, run] of result.runs.entries()) {
      lines.push(`- run ${index + 1}: **${run.pass ? 'PASS' : 'FAIL'}** (${run.status})`)
      for (const check of run.checks.filter((/** @type {any} */ c) => !c.pass)) lines.push(`  - ${check.type}: ${check.detail}`)
      if (run.error) lines.push(`  - error: ${run.error}`)
    }
    lines.push('')
  }
  lines.push('<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->', '')
  return lines.join('\n')
}

/**
 * @param {string[]} argv
 * @returns {{ caseId: string | null, runs: number, model: string, maxCostUsd: number, list: boolean }}
 */
export function parseArgs(argv) {
  const value = (/** @type {string} */ name) => {
    const at = argv.indexOf(`--${name}`)
    return at >= 0 ? argv[at + 1] : undefined
  }
  return {
    caseId: value('case') ?? null,
    runs: Math.max(1, Number(value('runs') ?? 3) || 3),
    model: value('model') ?? DEFAULT_MODEL,
    maxCostUsd: Number(value('max-cost') ?? 5),
    list: argv.includes('--list'),
  }
}

/**
 * @param {string[]} argv
 * @param {Record<string, string | undefined>} env
 * @param {{ out: (line: string) => void, err: (line: string) => void, resultsDir?: string }} io
 * @returns {Promise<number>} The exit code: 0 done, 2 cannot start (usage, no key), 3 stopped by the spend cap.
 */
export async function main(argv, env, io) {
  const args = parseArgs(argv)
  const { cases: loaded, problems } = loadCases()
  if (problems.length > 0) {
    io.err(`Bad case files:\n${problems.map((problem) => `  ${problem}`).join('\n')}`)
    return 2
  }
  const cases = args.caseId === null ? loaded : loaded.filter((entry) => entry.id === args.caseId)
  if (cases.length === 0) {
    io.err(`No case named "${args.caseId}". Cases: ${loaded.map((entry) => entry.id).join(', ')}`)
    return 2
  }
  if (args.list) {
    for (const entry of cases) io.out(`${entry.id}${entry.needs ? ` (needs ${entry.needs.join(', ')})` : ''}: ${entry.prompt}`)
    return 0
  }
  const key = env.ANTHROPIC_API_KEY?.trim()
  if (!key) {
    io.err('ANTHROPIC_API_KEY is not set, so nothing was run and nothing was spent (cost: $0.00).\nSet it for this one command only:  ANTHROPIC_API_KEY=… npm run eval:ai')
    return 2
  }
  if (!isKnownModel(args.model)) io.err(`Note: "${args.model}" is not one of the app's models; costs are not estimated for it.`)

  const report = await runCases({
    cases,
    runs: args.runs,
    model: args.model,
    maxCostUsd: args.maxCostUsd,
    log: (line) => io.out(redactKey(line, key)),
    clientFor: () => createAnthropicClient({ getKey: () => key, getModel: () => args.model, isOnline: () => true }),
  })

  const date = new Date().toISOString().slice(0, 10)
  const outDir = io.resultsDir ?? RESULTS_DIR
  mkdirSync(outDir, { recursive: true })
  let base = join(outDir, `${date}-${args.model}`)
  for (let n = 2; existsSync(`${base}.json`); n += 1) base = join(outDir, `${date}-${args.model}-${n}`)
  // `redactKey` over the whole file: no field of a run can carry the key out, by construction.
  writeFileSync(`${base}.json`, redactKey(JSON.stringify(report, null, 2), key) + '\n')
  writeFileSync(`${base}.md`, redactKey(renderMarkdown(report, { date }), key))
  io.out(`\nEstimated spend ${dollars(report.spentUsd)}. Wrote ${base}.md and .json`)
  return report.budgetStopped ? 3 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), process.env, { out: (line) => console.log(line), err: (line) => console.error(line) }).then((code) => process.exit(code))
}
