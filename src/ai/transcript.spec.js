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

// --- TODO/ai-007: what the assistant checked ----------------------------------------------

describe('check rows', () => {
  it('a capture row carries the image as a thumbnail the human can open', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'capture_view', input: { view: 'top' } },
      {
        type: 'tool_result',
        id: 't1',
        name: 'capture_view',
        isError: false,
        result: { view: 'top', widthPx: 768, heightPx: 576, image: { mediaType: 'image/png', data: 'AAAA' } },
      },
    ])
    expect(items[0]).toMatchObject({ kind: 'tool', status: 'ok', label: 'Looked at the top view', thumbnail: 'data:image/png;base64,AAAA' })
  })

  it('a measure row says the numbers', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'measure', input: { ids: ['c'] } },
      {
        type: 'tool_result',
        id: 't1',
        name: 'measure',
        isError: false,
        result: { bodies: [{ id: 'c', name: 'Cube 1', sizeMm: [214, 52, 18], volumeMm3: 64000.4, surfaceAreaMm2: 1 }] },
      },
    ])
    expect(items[0].label).toBe('Measured Cube 1')
    expect(items[0].summary).toBe('214 × 52 × 18 mm · 64000 mm³')
    expect(items[0].check).toBeUndefined()
  })

  it('a printability check with a problem is a failed check row, with the first problem', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'check_printability', input: { ids: ['w'] } },
      {
        type: 'tool_result',
        id: 't1',
        name: 'check_printability',
        isError: false,
        result: {
          bodies: [{ id: 'w', sizeMm: [214, 52, 18], fits: { asPlaced: true } }],
          issues: [
            { severity: 'info', message: 'Fits the build volume as placed.' },
            { severity: 'warning', message: 'Wall 1.2 mm at the trailing edge — below your 1.6 mm minimum.' },
          ],
        },
      },
    ])
    expect(items[0]).toMatchObject({ status: 'ok', check: 'fail', label: 'Checked printability' })
    expect(items[0].summary).toMatch(/1\.2 mm/)
  })

  it('a clean printability check passes, and a clearance overlap fails', () => {
    const clean = run([
      { type: 'tool_call', id: 't1', name: 'check_printability', input: { ids: ['w'] } },
      { type: 'tool_result', id: 't1', name: 'check_printability', isError: false, result: { bodies: [], issues: [{ severity: 'info', message: 'Fits.' }] } },
    ])
    expect(clean[0].check).toBe('pass')
    const overlap = run([
      { type: 'tool_call', id: 't1', name: 'check_clearance', input: { a: 'a', b: 'b' } },
      { type: 'tool_result', id: 't1', name: 'check_clearance', isError: false, result: { interpenetrating: true, message: 'They overlap by 12 mm³.' } },
    ])
    expect(overlap[0]).toMatchObject({ check: 'fail', summary: 'They overlap by 12 mm³.' })
  })
})

describe('drawing rows (TODO/ai-008)', () => {
  it('says the scale it set and where from', () => {
    expect(describeCall('set_reference_scale', { distanceMm: 85, label: 'board length' }, { mmPerPx: 0.1 })).toBe('Set scale 85.0 mm from “board length”')
    expect(describeCall('set_reference_scale', { distanceMm: 56 }, { mmPerPx: 0.1 })).toBe('Set scale 56.0 mm')
  })

  it('names what it located, and what it looked at', () => {
    expect(describeCall('locate_in_image', { query: 'SD slot' })).toBe('Located “SD slot” on the drawing')
    expect(describeCall('get_reference_image', {})).toBe('Looked at the drawing')
    expect(describeCall('capture_view', { view: 'top', overlay: 'reference' })).toBe('Compared the top view with the drawing')
  })

  it('a save proposal is a proposal, not a save', () => {
    expect(describeCall('save_to_library', { name: 'Pi 7 board' }, { saved: false })).toBe('Proposed saving “Pi 7 board” to My parts')
  })

  it('a cross-check that disagrees is a failed check row', () => {
    const items = run([
      { type: 'tool_call', id: 't1', name: 'set_reference_scale', input: { distanceMm: 85, label: 'board length' } },
      { type: 'tool_result', id: 't1', name: 'set_reference_scale', isError: false, result: { mmPerPx: 0.1, warning: 'hole spacing is printed 49 mm but measures 58 mm' } },
    ])
    expect(items[0]).toMatchObject({ status: 'ok', check: 'fail', summary: 'hole spacing is printed 49 mm but measures 58 mm' })
  })
})
