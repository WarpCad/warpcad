// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Scoring for the assistant's prompt evals (`TODO/ai-011`): what a run produced, measured with
 * numbers, and whether it passes the checks its case names.
 *
 * ## Checks are geometric, not textual
 *
 * A check reads the **resulting geometry** (body count, size, volume, watertightness, the bed,
 * named parts) and, for the one case that is about asking rather than building, whether the reply
 * asked a question or stated an assumption. Nothing here asks a model to judge a model: an
 * LLM-scored check would put one unmeasured model inside the measurement. What these numbers do
 * **not** capture (is the wing a good wing? is a bracket sensible?) is out of scope for v1 and
 * stays with the live scenarios in `TODO/ACCEPTANCE.md`.
 *
 * Every check can fail: `score.spec.js` runs each against known geometry **and** against a
 * deliberately wrong result, because a check that cannot fail is the bug.
 *
 * Framework-free and DOM-free. Plain Node (`bench/ai/run.js`) and plain specs both import it.
 *
 * @module bench/ai/score
 */

import { boundsOf, volumeOf } from '../../src/core/kernel/group.js'
import { toGeom3 } from '../../src/core/kernel/group.js'
import { makeWatertight, openEdgesOf } from '../../src/core/kernel/watertight.js'
import { bodySummary } from '../../src/ai/tools/read.js'
import { fitVerdict } from '../../src/core/buildVolume.js'

/**
 * @typedef {object} BodyFacts
 * @property {string} id
 * @property {string} name
 * @property {[number, number, number]} sizeMm Axis-aligned bounding box, millimetres.
 * @property {number} volumeMm3
 * @property {boolean} watertight No open edges in the surface the export would write.
 * @property {string[]} parts Visible named parts of a group; empty for a plain body.
 *
 * @typedef {object} RunFacts What one run left behind and said.
 * @property {BodyFacts[]} bodies The document's bodies after the turn.
 * @property {BodyFacts[]} seed The bodies the case started with (empty when it seeds none).
 * @property {string} text The assistant's last reply text.
 *
 * @typedef {object} CheckResult
 * @property {string} type
 * @property {boolean} pass
 * @property {string} detail One plain line: what was measured against what.
 */

/**
 * The facts a check reads, taken from a document. Runs the same watertight pass the export uses.
 *
 * @param {{ bodies: () => any[] }} document
 * @returns {BodyFacts[]}
 */
export function snapshotBodies(document) {
  return document.bodies().map((body) => {
    const summary = bodySummary(body)
    const [min, max] = boundsOf(body.geometry)
    return {
      id: body.id,
      name: body.name,
      sizeMm: /** @type {[number, number, number]} */ ([max[0] - min[0], max[1] - min[1], max[2] - min[2]]),
      volumeMm3: volumeOf(body.geometry),
      watertight: openEdgesOf(makeWatertight(toGeom3(body.geometry))).openEdges === 0,
      parts: summary.parts.filter((part) => !part.hidden).map((part) => part.name),
    }
  })
}

const round1 = (/** @type {number} */ value) => Math.round(value * 10) / 10
const sizeText = (/** @type {number[]} */ size) => size.map(round1).join(' × ')
const longest = (/** @type {BodyFacts} */ body) => Math.max(...body.sizeMm)

/**
 * Which bodies a check applies to. `any` passes when one body does, `all` when every body does
 * (and there is at least one), `largest` looks only at the body with the biggest volume.
 *
 * @param {'any' | 'all' | 'largest' | undefined} which
 * @param {BodyFacts[]} bodies
 * @param {(body: BodyFacts) => boolean} test
 * @returns {boolean}
 */
function applies(which, bodies, test) {
  if (bodies.length === 0) return false
  if (which === 'all') return bodies.every(test)
  if (which === 'largest') return test([...bodies].sort((a, b) => b.volumeMm3 - a.volumeMm3)[0])
  return bodies.some(test)
}

/**
 * Each check: the fields it needs (validated by {@link validateCase}) and how it decides.
 *
 * @type {Record<string, { needs: string[], run: (args: any, facts: RunFacts) => CheckResult }>}
 */
export const CHECKS = {
  bodyCount: {
    needs: ['min', 'max'],
    run: (args, { bodies }) => ({
      type: 'bodyCount',
      pass: bodies.length >= args.min && bodies.length <= args.max,
      detail: `${bodies.length} bodies, wanted ${args.min}–${args.max}`,
    }),
  },
  sizeWithin: {
    needs: ['sizeMm', 'tolMm'],
    run: (args, { bodies }) => ({
      type: 'sizeWithin',
      // A `null` axis is not dimensioned by the case (a drawing prints no height): it is skipped.
      pass: applies(args.body, bodies, (body) => body.sizeMm.every((value, axis) => args.sizeMm[axis] === null || Math.abs(value - args.sizeMm[axis]) <= args.tolMm)),
      detail: `sizes ${bodies.map((body) => sizeText(body.sizeMm)).join(' | ') || 'none'}, wanted ${sizeText(args.sizeMm)} ±${args.tolMm}`,
    }),
  },
  longestEdgeWithin: {
    needs: ['min', 'max'],
    run: (args, { bodies }) => ({
      type: 'longestEdgeWithin',
      pass: applies(args.body, bodies, (body) => longest(body) >= args.min && longest(body) <= args.max),
      detail: `longest edges ${bodies.map((body) => round1(longest(body))).join(', ') || 'none'}, wanted ${args.min}–${args.max} mm`,
    }),
  },
  volumeWithin: {
    needs: ['min', 'max'],
    run: (args, { bodies }) => ({
      type: 'volumeWithin',
      pass: applies(args.body, bodies, (body) => body.volumeMm3 >= args.min && body.volumeMm3 <= args.max),
      detail: `volumes ${bodies.map((body) => Math.round(body.volumeMm3)).join(', ') || 'none'} mm³, wanted ${args.min}–${args.max}`,
    }),
  },
  fillBelow: {
    needs: ['max'],
    run: (args, { bodies }) => {
      // Volume over bounding-box volume: a plain block is 1; a bracket, a holed block or a wing is less.
      const fill = (/** @type {BodyFacts} */ body) => body.volumeMm3 / (body.sizeMm[0] * body.sizeMm[1] * body.sizeMm[2] || Infinity)
      return {
        type: 'fillBelow',
        pass: applies(args.body ?? 'largest', bodies, (body) => fill(body) <= args.max),
        detail: `fill ${bodies.map((body) => fill(body).toFixed(2)).join(', ') || 'none'} of its bounding box, wanted at most ${args.max}`,
      }
    },
  },
  watertight: {
    needs: [],
    run: (_args, { bodies }) => ({
      type: 'watertight',
      pass: applies('all', bodies, (body) => body.watertight),
      detail: bodies.length === 0 ? 'no bodies to check' : `${bodies.filter((body) => body.watertight).length} of ${bodies.length} bodies watertight`,
    }),
  },
  fitsBed: {
    needs: ['bedMm'],
    run: (args, { bodies }) => {
      // The app's own verdict (`src/core/buildVolume.js`): a part may be turned or laid on its side,
      // exactly as the Fit badge and `check_printability` judge it, so "fits" means one thing.
      const bed = { widthMm: args.bedMm[0], depthMm: args.bedMm[1], heightMm: args.bedMm[2] }
      const fits = (/** @type {BodyFacts} */ body) => fitVerdict(body.sizeMm, bed).verdict !== 'too-large'
      return {
        type: 'fitsBed',
        pass: applies(args.body ?? 'all', bodies, fits),
        detail: `${bodies.filter(fits).length} of ${bodies.length} bodies fit ${args.bedMm.join(' × ')} mm`,
      }
    },
  },
  namedParts: {
    needs: ['names'],
    run: (args, { bodies }) => ({
      type: 'namedParts',
      pass: bodies.some((body) => args.names.every((/** @type {string} */ name) => body.parts.includes(name))),
      detail: `parts ${bodies.map((body) => `[${body.parts.join(', ')}]`).join(' ') || 'none'}, wanted ${args.names.join(', ')}`,
    }),
  },
  askedOrAssumed: {
    needs: [],
    run: (_args, { bodies, text }) => {
      // Either it asked and built nothing, or it built and said what it assumed. Building in
      // silence is the failure: the model invented the missing dimensions.
      const asked = text.includes('?') && bodies.length === 0
      const assumed = /\bassum(e|ed|es|ing|ption|ptions)\b/i.test(text)
      return { type: 'askedOrAssumed', pass: asked || assumed, detail: asked ? 'asked a question and built nothing' : assumed ? 'built and stated its assumptions' : `built ${bodies.length} bodies and stated no assumption` }
    },
  },
  preserved: {
    needs: ['ids'],
    run: (args, { bodies, seed }) => {
      // Still there, and the same size of thing: not deleted, not quietly replaced.
      const missing = args.ids.filter((/** @type {string} */ id) => {
        const now = bodies.find((body) => body.id === id)
        const was = seed.find((body) => body.id === id)
        return now === undefined || (was !== undefined && Math.abs(now.volumeMm3 - was.volumeMm3) > Math.max(1, was.volumeMm3 * 0.005))
      })
      return { type: 'preserved', pass: missing.length === 0, detail: missing.length === 0 ? `${args.ids.join(', ')} still there, unchanged` : `${missing.join(', ')} deleted or changed` }
    },
  },
}

/**
 * What is wrong with a case file. Empty means usable.
 *
 * @param {any} entry
 * @returns {string[]}
 */
export function validateCase(entry) {
  /** @type {string[]} */
  const problems = []
  if (entry === null || typeof entry !== 'object') return ['the case is not an object']
  if (typeof entry.id !== 'string' || entry.id === '') problems.push('it has no id')
  if (typeof entry.prompt !== 'string' || entry.prompt.trim() === '') problems.push('it has no prompt')
  if (!Array.isArray(entry.checks) || entry.checks.length === 0) problems.push('it has no checks (a case that checks nothing always passes)')
  for (const [index, check] of (Array.isArray(entry.checks) ? entry.checks : []).entries()) {
    const known = CHECKS[check?.type]
    if (known === undefined) {
      problems.push(`check ${index + 1}: unknown type ${JSON.stringify(check?.type)}`)
      continue
    }
    for (const field of known.needs) if (check[field] === undefined) problems.push(`check ${index + 1} (${check.type}): missing "${field}"`)
  }
  if (entry.images !== undefined && !(Array.isArray(entry.images) && entry.images.every((/** @type {unknown} */ image) => typeof image === 'string'))) {
    problems.push('"images" must be a list of file paths')
  }
  if (entry.needs !== undefined && !(Array.isArray(entry.needs) && entry.needs.every((/** @type {string} */ need) => need === 'browser'))) {
    problems.push('"needs" may only list "browser"')
  }
  return problems
}

/**
 * @param {Array<{ type: string } & Record<string, any>>} checks
 * @param {RunFacts} facts
 * @returns {CheckResult[]}
 */
export function runChecks(checks, facts) {
  return checks.map((check) => CHECKS[check.type].run(check, facts))
}

/**
 * Dollars per million tokens, from `docs/decisions/ai-partner.md` decision 9 (the `claude-api`
 * skill's model table, cached 2026-09-25). Dated data, not a promise: check it before quoting a
 * cost, and an id missing here costs `null`, never a guess. Cache writes are 1.25× input.
 */
export const PRICES = Object.freeze({
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
})

/**
 * @param {{ input: number, cacheRead: number, cacheWrite: number, output: number }} usage
 * @param {string} model
 * @returns {number | null} Estimated dollars, or `null` for a model with no price on file.
 */
export function costUsd(usage, model) {
  const price = /** @type {Record<string, { input: number, output: number, cacheRead: number }>} */ (PRICES)[model]
  if (price === undefined) return null
  return (usage.input * price.input + usage.cacheWrite * price.input * 1.25 + usage.cacheRead * price.cacheRead + usage.output * price.output) / 1_000_000
}

/**
 * @typedef {object} RunRecord
 * @property {boolean} pass Every check passed.
 * @property {CheckResult[]} checks
 * @property {number} toolCalls
 * @property {{ input: number, cacheRead: number, cacheWrite: number, output: number }} usage
 * @property {number | null} costUsd
 * @property {number} wallMs
 * @property {string} status The turn's own ending (`done`, `stopped`, `failed`, …).
 */

/**
 * Roll a case's runs up: pass rate, the mean effort, the total spend, and which checks failed
 * how often (so a change that breaks one check shows up as that check, not as "fewer passes").
 *
 * @param {RunRecord[]} runs
 */
export function aggregate(runs) {
  const count = runs.length
  const mean = (/** @type {(run: RunRecord) => number} */ pick) => (count === 0 ? 0 : runs.reduce((sum, run) => sum + pick(run), 0) / count)
  /** @type {Record<string, number>} */
  const checkFailures = {}
  for (const run of runs) for (const check of run.checks) if (!check.pass) checkFailures[check.type] = (checkFailures[check.type] ?? 0) + 1
  const costs = runs.map((run) => run.costUsd)
  return {
    runs: count,
    passes: runs.filter((run) => run.pass).length,
    passRate: count === 0 ? 0 : runs.filter((run) => run.pass).length / count,
    meanToolCalls: mean((run) => run.toolCalls),
    inputTokens: runs.reduce((sum, run) => sum + run.usage.input + run.usage.cacheRead + run.usage.cacheWrite, 0),
    outputTokens: runs.reduce((sum, run) => sum + run.usage.output, 0),
    costUsd: costs.some((cost) => cost === null) ? null : costs.reduce((sum, cost) => sum + (cost ?? 0), 0),
    meanWallMs: mean((run) => run.wallMs),
    checkFailures,
  }
}
