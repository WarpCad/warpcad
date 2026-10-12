// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — a Node-side spec (reads fixture files); `src/` is typechecked without Node types.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createDocument } from '../src/core/document.js'
import { boundsOf } from '../src/core/kernel/group.js'
import { createAgentContext, runTurn } from '../src/ai/agent.js'
import { createScriptedClient, staleProblems } from '../src/ai/providers/scripted.js'
import { fakeSelection } from '../src/ai/tools/__fixtures__/context.js'

/**
 * `TODO/ai-010` — the recorded scripted-provider transcripts in `e2e/fixtures/ai/`: kept current
 * against the tool schemas (a changed schema fails here with "re-record", in the unit stage, not
 * only in a browser), and the airfoil transcript played through the **real** agent loop, tool
 * registry and document in plain Node. The provider itself is `src/ai/providers/scripted.spec.js`.
 */

const FIXTURES = join(import.meta.dirname, '..', 'e2e', 'fixtures', 'ai')
const fixture = (name) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8'))

describe('the recorded fixtures are current', () => {
  const names = readdirSync(FIXTURES)
    .filter((/** @type {string} */ file) => file.endsWith('.json'))
    .map((/** @type {string} */ file) => file.replace(/\.json$/, ''))

  it('has the two scenario transcripts', () => {
    expect(names).toEqual(expect.arrayContaining(['airfoil-wing', 'drawing-board']))
  })

  for (const name of names) {
    it(`${name} matches the tool schemas as they are now (if not: re-record, see scripts/stamp-ai-fixtures.mjs)`, () => {
      expect(staleProblems(fixture(name))).toEqual([])
    })
  }
})

describe('scenario 17 plumbing — the airfoil transcript through the real agent, document and tools', () => {
  /** @param {ReturnType<typeof createDocument>} document */
  function context(document) {
    return createAgentContext({ client: createScriptedClient(fixture('airfoil-wing')), document, selection: fakeSelection(), replica: 'abcdef' })
  }

  it('builds a lofted wing, then the rest, checks printability, and every body stays', async () => {
    const document = createDocument({ replica: 'abcdef' })
    const ctx = context(document)
    const outcome = await runTurn({ userMessage: 'Use the sketch tool to create an airfoil for a model plane wing, create the wing then the rest of the model so I can 3D print it.', ctx })
    expect(outcome.status).toBe('done')
    expect(outcome.text).toMatch(/all on the bed/)
    // The real tool flags the knife-edge trailing edge; the transcript's reply must say so, not gloss over it.
    expect(outcome.text).toMatch(/trailing edge is a 0 mm wall/)
    // Scenario 1's lesson: nothing replaced anything.
    expect(document.bodies().map((body) => body.id)).toEqual(['sketch-abcdef-1', 'cuboid-abcdef-2', 'cuboid-abcdef-3', 'cuboid-abcdef-4'])
    expect(outcome.steps).toBe(5)
    // The wing is a real loft: 200 mm of span.
    const wing = /** @type {any} */ (document.bodies()[0].geometry)
    const [min, max] = boundsOf(wing)
    expect(max[2] - min[2]).toBeCloseTo(200, 0)
  })

  it('"make the wing 20 % longer" edits the wing in place: same bodies, 240 mm of span', async () => {
    const document = createDocument({ replica: 'abcdef' })
    const ctx = context(document)
    await runTurn({ userMessage: 'make the wing and the rest', ctx })
    const before = document.bodies().length
    const follow = await runTurn({ userMessage: 'make the wing 20 % longer', ctx })
    expect(follow.status).toBe('done')
    expect(document.bodies()).toHaveLength(before)
    const [min, max] = boundsOf(/** @type {any} */ (document.bodies()[0].geometry))
    expect(max[2] - min[2]).toBeCloseTo(240, 0)
  })
})
