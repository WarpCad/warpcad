// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  SCENE_DETAIL_LIMIT,
  SCENE_LIST_LIMIT,
  assembleMessages,
  compactToolResult,
  summariseScene,
  turnLine,
} from './context.js'

/**
 * `TODO/ai-005` — context size: `describe_scene` is summarised after N bodies, older turns
 * are compacted to their intent lines, and both **say what was dropped**.
 */

/**
 * @param {number} count
 * @returns {import('./tools/read.js').SceneSummary}
 */
function scene(count) {
  const bodies = Array.from({ length: count }, (_, index) => ({
    id: `cuboid-${index + 1}`,
    name: `Cube ${index + 1}`,
    op: 'primitive.cuboid',
    boundsMm: /** @type {any} */ ([
      [0, 0, 0],
      [10, 10, 10],
    ]),
    sizeMm: /** @type {[number, number, number]} */ ([10, 10, 10]),
    color: null,
    parts: [],
  }))
  return { count, bodies, rolledBack: null, inactiveBodies: [] }
}

describe('summariseScene', () => {
  it('returns a small scene unchanged (same object, no note)', () => {
    const small = scene(SCENE_DETAIL_LIMIT)
    expect(summariseScene(small)).toBe(small)
  })

  it('keeps full detail for the most recent N bodies and lists the rest by id/name/op, saying so', () => {
    const big = scene(SCENE_DETAIL_LIMIT + 5)
    const out = /** @type {any} */ (summariseScene(big))
    expect(out.count).toBe(SCENE_DETAIL_LIMIT + 5)
    expect(out.bodies).toHaveLength(SCENE_DETAIL_LIMIT)
    // The newest bodies are the ones a turn is working on.
    expect(out.bodies.at(-1).id).toBe(`cuboid-${SCENE_DETAIL_LIMIT + 5}`)
    expect(out.otherBodies).toEqual([1, 2, 3, 4, 5].map((n) => ({ id: `cuboid-${n}`, name: `Cube ${n}`, op: 'primitive.cuboid' })))
    expect(out.summarised).toMatch(/5/)
    expect(out.summarised).toMatch(/describe_body/)
  })

  it('beyond the list limit, drops the oldest entirely and says how many', () => {
    const huge = scene(SCENE_DETAIL_LIMIT + SCENE_LIST_LIMIT + 7)
    const out = /** @type {any} */ (summariseScene(huge))
    expect(out.bodies).toHaveLength(SCENE_DETAIL_LIMIT)
    expect(out.otherBodies).toHaveLength(SCENE_LIST_LIMIT)
    expect(out.omittedBodies).toBe(7)
    expect(out.summarised).toMatch(/7/)
  })

  it('honours an explicit limit', () => {
    const out = /** @type {any} */ (summariseScene(scene(4), { detailLimit: 2 }))
    expect(out.bodies.map((/** @type {any} */ b) => b.id)).toEqual(['cuboid-3', 'cuboid-4'])
  })
})

describe('compactToolResult', () => {
  it('summarises describe_scene results and the scene a write returns', () => {
    const big = scene(SCENE_DETAIL_LIMIT + 1)
    expect(/** @type {any} */ (compactToolResult('describe_scene', big)).summarised).toBeDefined()
    const write = /** @type {any} */ (compactToolResult('create', { applied: [], scene: big }))
    expect(write.scene.summarised).toBeDefined()
    expect(write.applied).toEqual([])
  })

  it('leaves every other result alone', () => {
    const result = { error: 'nope' }
    expect(compactToolResult('operate', result)).toBe(result)
    const timeline = { rows: [] }
    expect(compactToolResult('get_timeline', timeline)).toBe(timeline)
  })
})

describe('turnLine', () => {
  it('says what a landed turn did, by record id', () => {
    expect(turnLine({ request: 'a 20 mm cube', status: 'done', recordIds: ['cuboid-1'] })).toMatch(/a 20 mm cube.*landed 1 record.*cuboid-1/s)
  })

  it('says a discarded turn left nothing', () => {
    const line = turnLine({ request: 'a wing', status: 'cancelled', recordIds: [] })
    expect(line).toMatch(/a wing/)
    expect(line).toMatch(/discarded|nothing/i)
  })

  it('folds a long request onto one capped line', () => {
    const line = turnLine({ request: `x\n${'y'.repeat(1000)}`, status: 'done', recordIds: [] })
    expect(line).not.toMatch(/\n/)
    expect(line.length).toBeLessThan(400)
  })
})

describe('assembleMessages', () => {
  const userContent = [{ type: 'text', text: 'now' }]

  it('with no history, is just the new user message', () => {
    expect(assembleMessages([], userContent)).toEqual([{ role: 'user', content: userContent }])
  })

  it('keeps the previous turn in full when it finished cleanly', () => {
    const previous = [
      { role: 'user', content: [{ type: 'text', text: 'before' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    ]
    const messages = assembleMessages([{ request: 'before', status: 'done', recordIds: [], messages: previous }], userContent)
    expect(messages).toEqual([...previous, { role: 'user', content: userContent }])
  })

  it('compacts older turns to their intent lines, says what was dropped, keeps roles alternating', () => {
    const full = (/** @type {string} */ text) => [
      { role: 'user', content: [{ type: 'text', text }] },
      { role: 'assistant', content: [{ type: 'text', text: `did ${text}` }] },
    ]
    /** @type {import('./context.js').TurnLog[]} */
    const turns = [
      { request: 'first', status: 'done', recordIds: ['cuboid-1'], messages: full('first') },
      { request: 'second', status: 'cancelled', recordIds: [] },
      { request: 'third', status: 'done', recordIds: ['sphere-2'], messages: full('third') },
    ]
    const messages = assembleMessages(turns, userContent)
    // Only the last turn survives in full.
    expect(messages).toHaveLength(3)
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    const note = messages[0].content[0].text
    expect(note).toMatch(/first/)
    expect(note).toMatch(/second/)
    expect(note).not.toMatch(/did first/)
    expect(note).toMatch(/dropped/i)
    expect(messages[0].content[1]).toEqual({ type: 'text', text: 'third' })
    // The originals are not mutated.
    expect(turns[2].messages?.[0].content).toHaveLength(1)
  })

  it('never replays a discarded turn in full (its bodies do not exist)', () => {
    /** @type {import('./context.js').TurnLog[]} */
    const turns = [
      {
        request: 'stopped one',
        status: 'cancelled',
        recordIds: [],
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'stopped one' }] },
          { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'create', input: {} }] },
        ],
      },
    ]
    const messages = assembleMessages(turns, userContent)
    expect(messages).toHaveLength(1)
    expect(messages[0].content[0].text).toMatch(/stopped one/)
    expect(messages[0].content.at(-1)).toEqual({ type: 'text', text: 'now' })
  })
})
