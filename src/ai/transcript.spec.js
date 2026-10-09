// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { applyEvent, describeCall, formatUsage, nextStepAfter } from './transcript.js'

/**
 * `TODO/ai-006` — the chat transcript is a pure reducer over the agent's events (`ai-005`), so
 * the panel only renders it and a spec can drive every shape without a browser or a model.
 */

const sceneOf = (/** @type {Array<[string, string]>} */ ...bodies) => ({
  count: bodies.length,
  bodies: bodies.map(([id, name]) => ({ id, name })),
})

/** @param {any[]} events */
const run = (events) => events.reduce((items, event) => applyEvent(items, event), /** @type {any[]} */ ([]))

describe('streamed text', () => {
  it('appends deltas to one assistant item', () => {
    const items = run([
      { type: 'text', text: 'Making a ' },
      { type: 'text', text: 'cube.' },
    ])
    expect(items).toEqual([{ kind: 'assistant', text: 'Making a cube.' }])
  })

  it('starts a new item after a tool call, so each reply reads on its own', () => {
    const items = run([
      { type: 'text', text: 'First.' },
      { type: 'tool_call', id: 't1', name: 'describe_scene', input: {} },
      { type: 'text', text: 'Second.' },
    ])
    expect(items.map((/** @type {any} */ item) => item.kind)).toEqual(['assistant', 'tool', 'assistant'])
  })

  it('never mutates the list it was given', () => {
    const before = run([{ type: 'text', text: 'a' }])
    const frozen = JSON.stringify(before)
    applyEvent(before, { type: 'text', text: 'b' })
    expect(JSON.stringify(before)).toBe(frozen)
  })
})

describe('tool rows', () => {
  it('opens running and closes with the result, labelled from the call and the scene it returned', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'create', input: { op: 'primitive.cuboid' } },
      {
        type: 'tool_result',
        id: 't1',
        name: 'create',
        isError: false,
        result: { applied: [{ batchStep: 1, tool: 'create', bodyId: 'b1', recordIds: ['r1'] }], scene: sceneOf(['b1', 'Cube 1']) },
      },
    ])
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: 'tool', id: 't1', status: 'ok', label: 'Created Cube 1', bodyIds: ['b1'] })
  })

  it('labels a boolean from the operand names', () => {
    const label = describeCall(
      'operate',
      { op: 'boolean.subtract', operands: [{ id: 'a' }, { id: 'b' }] },
      { applied: [{ bodyId: 'c' }], scene: sceneOf(['a', 'Cube 1'], ['b', 'Cylinder 2'], ['c', 'Result']) },
      (id) => ({ a: 'Cube 1', b: 'Cylinder 2' })[/** @type {'a' | 'b'} */ (id)]
    )
    expect(label).toBe('Subtract Cube 1 − Cylinder 2')
  })

  it('names the steps of an apply_records call by count', () => {
    expect(describeCall('apply_records', { steps: [{}, {}, {}] }, undefined)).toBe('Applied 3 steps')
    expect(describeCall('apply_records', { steps: [{}] }, undefined)).toBe('Applied 1 step')
  })

  it('treats a read tool as looking, not changing', () => {
    expect(describeCall('describe_scene', {}, undefined)).toBe('Looked at the scene')
    expect(describeCall('unheard_of_tool', {}, undefined)).toBe('Used unheard_of_tool')
  })

  it('marks an error row distinct and carries the tool’s own reason', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'create', input: { op: 'primitive.cuboid' } },
      { type: 'tool_result', id: 't1', name: 'create', isError: true, result: { error: 'size must be positive', step: 1 } },
    ])
    expect(items[0]).toMatchObject({ status: 'error', error: 'size must be positive' })
  })

  it('says what the agent did next after an error row', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'create', input: { op: 'primitive.cuboid' } },
      { type: 'tool_result', id: 't1', name: 'create', isError: true, result: { error: 'bad' } },
      { type: 'tool_call', id: 't2', name: 'describe_scene', input: {} },
    ])
    expect(nextStepAfter(items, 0)).toBe('Looked at the scene')
    expect(nextStepAfter(items, 1)).toBeUndefined()
  })

  it('falls back to text when the agent’s next move was a reply', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'create', input: {} },
      { type: 'tool_result', id: 't1', name: 'create', isError: true, result: { error: 'bad' } },
      { type: 'text', text: 'Let me try a smaller size.' },
    ])
    expect(nextStepAfter(items, 0)).toBe('Replied')
  })
})

describe('turn ending', () => {
  it('adds a notice for a stopped, cancelled or failed turn and marks its rows discarded', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'create', input: { op: 'primitive.cuboid' } },
      { type: 'tool_result', id: 't1', name: 'create', isError: false, result: { applied: [], scene: sceneOf() } },
      { type: 'notice', kind: 'cancelled', message: 'Stopped. Nothing from this turn was kept.' },
      { type: 'turn_end', outcome: { status: 'cancelled', recordIds: [] } },
    ])
    expect(items[0]).toMatchObject({ status: 'discarded' })
    expect(items.at(-1)).toMatchObject({ kind: 'notice', level: 'cancelled', message: 'Stopped. Nothing from this turn was kept.' })
  })

  it('leaves a landed turn’s rows as they were', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'create', input: {} },
      { type: 'tool_result', id: 't1', name: 'create', isError: false, result: { applied: [], scene: sceneOf() } },
      { type: 'turn_end', outcome: { status: 'done', recordIds: ['r1'] } },
    ])
    expect(items[0].status).toBe('ok')
  })

  it('closes a row still running when the turn ends without its result', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'create', input: {} },
      { type: 'turn_end', outcome: { status: 'failed', recordIds: [] } },
    ])
    expect(items[0].status).toBe('discarded')
  })
})

describe('formatUsage', () => {
  it('sums every kind of input and shows output separately', () => {
    expect(formatUsage({ input: 1200, cacheRead: 3000, cacheWrite: 800, output: 450 })).toBe('5.0k in · 450 out')
  })

  it('is empty for a turn that used nothing', () => {
    expect(formatUsage({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 })).toBe('')
  })
})
