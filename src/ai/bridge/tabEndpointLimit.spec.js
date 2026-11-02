// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { LIMITS } from '../tools/limits.js'
import { createTabEndpoint } from './tabEndpoint.js'

/**
 * `TODO/ai-033`: on WebMCP and the live bridge the project's step limit is read **per call**, and a
 * group keeps a running record count compared with the limit in force — so raising the limit
 * after a stop lets the agent's next call land, in the same **Undo AI turn** group.
 *
 * A one-tool registry stands in for the real one: `land` asks the turn for room and appends `n`
 * cuboids, exactly as the real append tools do (`ctx.turn.canAppend`, then `commitRecords`).
 */

let serial = 0

/** @type {import('../tools/index.js').ToolRegistry} */
const tools = /** @type {any} */ ({
  run(/** @type {any} */ ctx, /** @type {string} */ name, /** @type {any} */ input) {
    const hit = ctx.turn.canAppend(input.n)
    if (hit) return { ...hit }
    const records = Array.from({ length: input.n }, () => {
      serial += 1
      return { id: `r${serial}`, op: 'primitive.cuboid', name: `Cube ${serial}`, params: { size: [5, 5, 5], center: [serial * 10, 0, 2.5] } }
    })
    ctx.document.appendAll(records, { origin: ctx.origin })
    ctx.turn.commitRecords(input.n)
    return { ok: true, landed: input.n }
  },
})

/** @param {number} initial */
function setup(initial) {
  const doc = createDocument()
  let limit = initial
  let t = 1_000_000
  const endpoint = createTabEndpoint({
    document: () => doc,
    tools,
    now: () => t,
    limits: () => ({ ...LIMITS, recordsPerTurn: limit }),
  })
  let id = 0
  return {
    doc,
    endpoint,
    /** @param {number} next */
    setLimit: (next) => {
      limit = next
    },
    /** @param {number} ms */
    advance: (ms) => {
      t += ms
    },
    /** @param {number} n */
    land: async (n) => (await endpoint.handle({ type: 'call', id: (id += 1), name: 'land', input: { n } }, { origin: 'webmcp', groupBy: 'idle' })).result,
  }
}

describe('createTabEndpoint: the project step limit, read per call (TODO/ai-033)', () => {
  it('a group stopped at the limit lands the next call after a raise, in the same group', async () => {
    const { doc, endpoint, land, setLimit } = setup(60)
    expect((await land(50)).ok).toBe(true)

    const refused = await land(50)
    expect(refused).toMatchObject({ limit: 'recordsPerTurn', stop: true })
    expect(refused.error).toMatch(/at most 60 records; 50 have landed/)
    expect(doc.entries).toHaveLength(50)
    // A retry at the same limit is still refused: the stop is not lifted by asking again.
    expect((await land(50)).limit).toBe('recordsPerTurn')

    setLimit(100)
    expect((await land(50)).ok).toBe(true)
    expect(doc.entries).toHaveLength(100)
    expect(endpoint.turns).toHaveLength(1)
    expect(endpoint.turns[0].recordIds).toHaveLength(100)

    // One Undo AI turn takes all of it.
    endpoint.undoLast()
    expect(doc.entries).toHaveLength(0)
    expect(endpoint.turns).toHaveLength(0)
  })

  it('a limit lowered below the running count refuses the next call, even of one step', async () => {
    const { doc, land, setLimit } = setup(1000)
    await land(50)
    await land(50)
    setLimit(60)
    expect((await land(1)).limit).toBe('recordsPerTurn')
    expect(doc.entries).toHaveLength(100)
  })

  it('a new project (reset) starts the count again', async () => {
    const { doc, endpoint, land } = setup(60)
    await land(50)
    expect((await land(50)).limit).toBe('recordsPerTurn')
    endpoint.reset()
    expect((await land(50)).ok).toBe(true)
    expect(doc.entries).toHaveLength(100)
    expect(endpoint.turns).toHaveLength(1)
  })

  it('a pause longer than the idle gap starts a new group with its own count (existing behaviour)', async () => {
    const { endpoint, land, advance } = setup(60)
    await land(50)
    expect((await land(50)).limit).toBe('recordsPerTurn')
    advance(61_000)
    expect((await land(50)).ok).toBe(true)
    expect(endpoint.turns).toHaveLength(2)
  })

  it('recordsPerCall still refuses a 51-step call at any limit', async () => {
    for (const limit of [50, 1000, 5000]) {
      const { doc, land } = setup(limit)
      expect((await land(51)).limit).toBe('recordsPerCall')
      expect(doc.entries).toHaveLength(0)
    }
  })

  it('still takes a plain Limits object (read once), for callers that pass one', async () => {
    const doc = createDocument()
    const endpoint = createTabEndpoint({ document: () => doc, tools, limits: { ...LIMITS, recordsPerTurn: 60 } })
    const reply = await endpoint.handle({ type: 'call', id: 1, name: 'land', input: { n: 50 } }, { origin: 'webmcp', groupBy: 'idle' })
    expect(reply.result.ok).toBe(true)
    const refused = await endpoint.handle({ type: 'call', id: 2, name: 'land', input: { n: 50 } }, { origin: 'webmcp', groupBy: 'idle' })
    expect(refused.result.limit).toBe('recordsPerTurn')
  })
})
