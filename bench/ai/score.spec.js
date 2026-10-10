// SPDX-License-Identifier: AGPL-3.0-or-later
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../src/core/document.js'
import { createToolRegistry, createTurn } from '../../src/ai/tools/index.js'
import { CASES_DIR } from './run.js'
import { CHECKS, PRICES, aggregate, costUsd, runChecks, snapshotBodies, validateCase } from './score.js'

/**
 * `TODO/ai-011` — the scorer. The rule for this file: **a check that cannot fail is the bug**, so
 * every check type is run against a result it must accept and a deliberately wrong one it must
 * refuse. The geometry in the first block is real kernel output, not hand-typed facts.
 */

/** @param {Partial<import('./score.js').BodyFacts>} over */
const body = (over = {}) => ({ id: 'cuboid-1', name: 'Cube 1', sizeMm: /** @type {[number, number, number]} */ ([40, 40, 40]), volumeMm3: 64000, watertight: true, parts: [], ...over })
/** @param {Partial<import('./score.js').RunFacts>} over */
const facts = (over = {}) => ({ bodies: [body()], seed: [], text: '', ...over })

describe('snapshotBodies — real geometry', () => {
  it('reads size, volume, watertightness and named parts off a document', () => {
    const document = createDocument()
    const tools = createToolRegistry()
    const make = (/** @type {string} */ tool, /** @type {any} */ input) => /** @type {any} */ (tools.run({ document, origin: 'ai', turn: createTurn() }, tool, input))
    expect(make('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [40, 40, 40] } }).error).toBeUndefined()
    expect(make('create', { op: 'primitive.cuboid', positionMm: [60, 0, 0], params: { size: [10, 10, 10] } }).error).toBeUndefined()
    expect(make('operate', { op: 'group.assemble', operands: [{ id: 'cuboid-1' }, { id: 'cuboid-2' }], params: { names: ['Big', 'Small'] } }).error).toBeUndefined()
    const [group] = snapshotBodies(document)
    expect(group.sizeMm[0]).toBeCloseTo(85, 3) // centred: -20 to 65
    expect(group.sizeMm[1]).toBeCloseTo(40, 3)
    expect(group.volumeMm3).toBeCloseTo(64000 + 1000, 0)
    expect(group.watertight).toBe(true)
    expect(group.parts).toEqual(['Big', 'Small'])
  })
})

/** [type, args, a result it must pass, a result it must fail]. */
const CASES = /** @type {Array<[string, any, import('./score.js').RunFacts, import('./score.js').RunFacts]>} */ ([
  ['bodyCount', { min: 1, max: 2 }, facts(), facts({ bodies: [] })],
  ['sizeWithin', { body: 'any', sizeMm: [40, 40, 40], tolMm: 1 }, facts(), facts({ bodies: [body({ sizeMm: [40, 40, 44] })] })],
  ['sizeWithin', { body: 'any', sizeMm: [85, 56, null], tolMm: 2 }, facts({ bodies: [body({ sizeMm: [85.5, 56, 17] })] }), facts({ bodies: [body({ sizeMm: [90, 56, 17] })] })],
  ['longestEdgeWithin', { body: 'any', min: 30, max: 50 }, facts(), facts({ bodies: [body({ sizeMm: [400, 5, 5] })] })],
  ['volumeWithin', { body: 'largest', min: 60000, max: 64000 }, facts(), facts({ bodies: [body({ volumeMm3: 12000 })] })],
  ['fillBelow', { body: 'largest', max: 0.9 }, facts({ bodies: [body({ volumeMm3: 30000 })] }), facts()],
  ['watertight', {}, facts(), facts({ bodies: [body({ watertight: false })] })],
  ['fitsBed', { bedMm: [220, 220, 250], body: 'all' }, facts({ bodies: [body({ sizeMm: [30, 30, 200] })] }), facts({ bodies: [body({ sizeMm: [30, 30, 260] })] })],
  ['namedParts', { names: ['Board', 'USB-A 1'] }, facts({ bodies: [body({ parts: ['Board', 'USB-A 1', 'Ethernet'] })] }), facts({ bodies: [body({ parts: ['Board'] })] })],
  ['askedOrAssumed', {}, facts({ bodies: [], text: 'How long should it be?' }), facts({ bodies: [body()], text: 'Done.' })],
  ['preserved', { ids: ['cuboid-1'] }, facts({ seed: [body()], bodies: [body(), body({ id: 'cyl-2' })] }), facts({ seed: [body()], bodies: [body({ id: 'cyl-2' })] })],
])

describe('every check can fail', () => {
  it('has a case for every check type', () => {
    expect(new Set(CASES.map(([type]) => type))).toEqual(new Set(Object.keys(CHECKS)))
  })

  for (const [type, args, good, bad] of CASES) {
    it(`${type}: accepts the right result and refuses the wrong one, and says why in numbers`, () => {
      const [passed] = runChecks([{ type, ...args }], good)
      const [failed] = runChecks([{ type, ...args }], bad)
      expect(passed.pass, passed.detail).toBe(true)
      expect(failed.pass, failed.detail).toBe(false)
      expect(failed.detail).toMatch(/\d|no |stated/)
    })
  }

  it('a check with nothing to look at fails instead of passing vacuously', () => {
    for (const type of ['watertight', 'fitsBed', 'volumeWithin', 'sizeWithin']) {
      const args = type === 'fitsBed' ? { bedMm: [1, 1, 1] } : type === 'volumeWithin' ? { min: 0, max: 1e9 } : type === 'sizeWithin' ? { sizeMm: [1, 1, 1], tolMm: 1e9 } : {}
      expect(runChecks([{ type, ...args }], facts({ bodies: [] }))[0].pass, type).toBe(false)
    }
  })

  it('"asked a question" does not count if it also built something without saying what it assumed', () => {
    const result = runChecks([{ type: 'askedOrAssumed' }], facts({ bodies: [body()], text: 'Is that okay?' }))[0]
    expect(result.pass).toBe(false)
  })

  it('"preserved" notices a body that is still there but has been quietly replaced by a different one', () => {
    const replaced = facts({ seed: [body({ volumeMm3: 27000 })], bodies: [body({ volumeMm3: 5000 })] })
    expect(runChecks([{ type: 'preserved', ids: ['cuboid-1'] }], replaced)[0].pass).toBe(false)
  })

  it('"fitsBed" agrees with the app: a part may lie on its side, a 260 mm part on a 250 mm bed may not', () => {
    const check = { type: 'fitsBed', bedMm: [220, 220, 250], body: 'all' }
    expect(runChecks([check], facts({ bodies: [body({ sizeMm: [200, 30, 30] })] }))[0].pass).toBe(true)
    expect(runChecks([check], facts({ bodies: [body({ sizeMm: [260, 30, 30] })] }))[0].pass).toBe(false)
  })
})

describe('cost and aggregation', () => {
  it('prices a run from the dated table, cache writes at 1.25× input', () => {
    expect(costUsd({ input: 1_000_000, cacheRead: 0, cacheWrite: 0, output: 0 }, 'claude-opus-5-5')).toBeCloseTo(PRICES['claude-opus-5-5'].input, 6)
    expect(costUsd({ input: 0, cacheRead: 0, cacheWrite: 1_000_000, output: 0 }, 'claude-opus-5-5')).toBeCloseTo(5, 6)
    expect(costUsd({ input: 100_000, cacheRead: 1_000_000, cacheWrite: 0, output: 50_000 }, 'claude-sonnet-5-5')).toBeCloseTo(0.2 + 0.2 + 0.5, 6)
  })

  it('has no price for a model it does not know, and says null rather than guessing', () => {
    expect(costUsd({ input: 1, cacheRead: 0, cacheWrite: 0, output: 1 }, 'some-new-model')).toBeNull()
  })

  /** @param {boolean} pass @param {string[]} failing @param {number | null} cost */
  const run = (pass, failing = [], cost = 0.1) => ({
    pass,
    checks: failing.map((type) => ({ type, pass: false, detail: '' })),
    toolCalls: 4,
    usage: { input: 1000, cacheRead: 500, cacheWrite: 100, output: 200 },
    costUsd: cost,
    wallMs: 2000,
    status: 'done',
  })

  it('rolls runs up: pass rate, means, token and cost totals, and which checks failed how often', () => {
    const summary = aggregate([run(true), run(false, ['watertight']), run(false, ['watertight', 'bodyCount']), run(true)])
    expect(summary.runs).toBe(4)
    expect(summary.passes).toBe(2)
    expect(summary.passRate).toBe(0.5)
    expect(summary.meanToolCalls).toBe(4)
    expect(summary.inputTokens).toBe(4 * 1600)
    expect(summary.outputTokens).toBe(800)
    expect(summary.costUsd).toBeCloseTo(0.4, 9)
    expect(summary.meanWallMs).toBe(2000)
    expect(summary.checkFailures).toEqual({ watertight: 2, bodyCount: 1 })
  })

  it('an unknown price makes the total unknown, not a smaller number', () => {
    expect(aggregate([run(true, [], 0.1), run(true, [], null)]).costUsd).toBeNull()
  })

  it('no runs is zero, not NaN', () => {
    expect(aggregate([])).toMatchObject({ runs: 0, passRate: 0, meanToolCalls: 0, meanWallMs: 0 })
  })
})

describe('case files', () => {
  const files = readdirSync(CASES_DIR).filter((name) => name.endsWith('.json'))

  it('has the two user prompts verbatim, plus the plain, the under-specified, the ambiguous and the hostile case', () => {
    const prompts = files.map((name) => JSON.parse(readFileSync(join(CASES_DIR, name), 'utf8')).prompt)
    expect(prompts).toContain('Use the sketch tool to create an airfoil for a model plane wing, create the wing then the rest of the model so I can 3D print it.')
    expect(prompts).toContain('Here is a drawing of a raspberry pi 7 create a group object to be added to the library.')
    expect(files).toEqual(expect.arrayContaining(['cube-with-hole.json', 'bracket-m4.json', 'ambiguous-request.json', 'hostile-intent.json']))
  })

  for (const name of files) {
    it(`${name} is a valid case`, () => {
      expect(validateCase(JSON.parse(readFileSync(join(CASES_DIR, name), 'utf8')))).toEqual([])
    })
  }

  it('refuses a case that checks nothing, names an unknown check, or leaves a required field out', () => {
    expect(validateCase({ id: 'x', prompt: 'p', checks: [] })).toEqual(['it has no checks (a case that checks nothing always passes)'])
    expect(validateCase({ id: 'x', prompt: 'p', checks: [{ type: 'vibes' }] })).toEqual(['check 1: unknown type "vibes"'])
    expect(validateCase({ id: 'x', prompt: 'p', checks: [{ type: 'bodyCount', min: 1 }] })).toEqual(['check 1 (bodyCount): missing "max"'])
    expect(validateCase({ id: 'x', prompt: ' ', checks: [{ type: 'watertight' }] })).toContain('it has no prompt')
    expect(validateCase({ id: 'x', prompt: 'p', checks: [{ type: 'watertight' }], needs: ['gpu'] })).toContain('"needs" may only list "browser"')
  })
})
