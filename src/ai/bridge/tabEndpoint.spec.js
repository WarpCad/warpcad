// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { serializeProject } from '../../core/project.js'
import { EDITING_REFUSAL, GESTURE_WAIT_MS, GROUP_IDLE_MS } from './protocol.js'
import { createTabEndpoint } from './tabEndpoint.js'

/**
 * The tab side of the live bridge (`TODO/ai-012`), against the **real** tool registry and a
 * **real** document — the only things faked are the clock, the wait, and "is the user in the
 * middle of a gesture".
 */

/** A clock the endpoint's waits advance, so a 10 s wait takes no real time. */
function fakeClock() {
  let t = 1_000_000
  return {
    now: () => t,
    /** @param {number} ms */
    advance: (ms) => {
      t += ms
    },
  }
}

/**
 * @param {object} [options]
 * @param {() => boolean} [options.isEditing]
 * @param {(ms: number) => void} [options.onSleep] Runs inside each wait, after the clock moves.
 * @param {string[]} [options.selected]
 */
function setup(options = {}) {
  const doc = createDocument()
  const clock = fakeClock()
  let selected = options.selected ?? []
  const endpoint = createTabEndpoint({
    document: () => doc,
    selection: { ids: () => [...selected], select: (ids) => (selected = [...ids]) },
    isEditing: options.isEditing ?? (() => false),
    now: clock.now,
    sleep: async (ms) => {
      clock.advance(ms)
      options.onSleep?.(ms)
    },
  })
  return {
    doc,
    clock,
    endpoint,
    selectedNow: () => selected,
    /** @param {string[]} ids The user's own pick. */
    pick: (ids) => {
      selected = [...ids]
    },
  }
}

/** @param {number} id @param {string} name @param {any} input @param {string} [request] */
const call = (id, name, input, request) => ({ type: /** @type {const} */ ('call'), id, name, input, ...(request === undefined ? {} : { request }) })

const BOX = { op: 'primitive.cuboid', positionMm: [0, 0, 0] }
const SPHERE = { op: 'primitive.sphere', positionMm: [0, 0, 40] }

describe('createTabEndpoint: one call, one atomic mcp batch', () => {
  it('runs a create through the real registry and lands it on the live document with origin mcp', async () => {
    const { doc, endpoint } = setup()
    const reply = await endpoint.handle(call(1, 'create', BOX, 'add a 40 mm cube'))

    expect(reply.type).toBe('result')
    expect(reply.id).toBe(1)
    expect(reply.result.error).toBeUndefined()
    expect(doc.entries).toHaveLength(1)
    const id = /** @type {string} */ (doc.entries[0].record.id)
    expect(doc.originOf(id)).toBe('mcp')
    expect(doc.intentOf(id)).toContain('add a 40 mm cube')
    // `data-008`'s id audit: minted under the tab's own replica, not a bridge replica.
    expect(id).toContain(doc.replicaId())
    // Never on the user's own undo stack.
    expect(doc.canUndo()).toBe(false)
  })

  it('lands a several-step apply_records as one batch and one group', async () => {
    const { doc, endpoint } = setup()
    const reply = await endpoint.handle(
      call(1, 'apply_records', { steps: [{ create: BOX }, { create: SPHERE }, { operate: { op: 'boolean.subtract', operands: [{ id: '@1' }, { id: '@2' }] } }] }, 'a cube minus a sphere')
    )
    expect(reply.result.error).toBeUndefined()
    expect(doc.entries).toHaveLength(3)
    expect(endpoint.turns).toHaveLength(1)
    expect(endpoint.turns[0].recordIds).toEqual(doc.entries.map((entry) => entry.record.id))
  })

  it('lands nothing for a refused call: the serialised project is byte-identical and no group is recorded', async () => {
    const { doc, endpoint } = setup()
    await endpoint.handle(call(1, 'create', BOX, 'a cube'))
    const before = serializeProject(doc)
    const clockBefore = doc.mergeClock()

    const refused = await endpoint.handle(call(2, 'operate', { op: 'boolean.union', operands: [{ id: doc.entries[0].record.id }] }, 'a cube'))
    expect(refused.result.error).toMatch(/2 or more operands/)
    const partial = await endpoint.handle(
      call(3, 'apply_records', { steps: [{ create: SPHERE }, { operate: { op: 'boolean.subtract', operands: [{ id: '@1' }] } }] }, 'a cube')
    )
    expect(partial.result.error).toBeDefined()

    expect(serializeProject(doc)).toBe(before)
    expect(doc.mergeClock()).toBe(clockBefore)
    expect(endpoint.turns).toHaveLength(1)
    expect(endpoint.turns[0].recordIds).toHaveLength(1)
  })

  it('answers a read tool without recording a group', async () => {
    const { endpoint } = setup()
    const reply = await endpoint.handle(call(1, 'describe_scene', {}))
    expect(reply.result).toMatchObject({ count: 0 })
    expect(endpoint.turns).toHaveLength(0)
  })
})

describe('createTabEndpoint: the browser tool list (the registry seam)', () => {
  it('offers get_selection over the live bridge, reading the user’s live selection', async () => {
    const { doc, endpoint, pick } = setup({ selected: [] })
    await endpoint.handle(call(1, 'create', BOX, 'a cube'))
    const id = /** @type {string} */ (doc.entries[0].record.id)
    // The user picks Claude's cube, then asks about "this".
    pick([id])
    const reply = await endpoint.handle(call(2, 'get_selection', {}))
    expect(reply.result.error).toBeUndefined()
    expect(JSON.stringify(reply.result)).toContain(id)
  })

  it('select changes only the bridge’s own selection, never the user’s', async () => {
    const { doc, endpoint, selectedNow } = setup({ selected: [] })
    await endpoint.handle(call(1, 'create', BOX, 'a cube'))
    const id = /** @type {string} */ (doc.entries[0].record.id)
    const reply = await endpoint.handle(call(2, 'select', { ids: [id] }))
    expect(reply.result.error).toBeUndefined()
    expect(selectedNow()).toEqual([])
    const read = await endpoint.handle(call(3, 'get_selection', {}))
    expect(JSON.stringify(read.result)).toContain(id)
  })

  it('offers capture_view when the tab hands over a capture, and refuses it by name when there is none', async () => {
    const { endpoint } = setup()
    const reply = await endpoint.handle(call(1, 'capture_view', { view: 'iso' }))
    expect(reply.result.error).toMatch(/viewport|render|capture/i)
    expect(reply.result.error).not.toMatch(/not available over MCP/)
  })
})

describe('createTabEndpoint: one writer, enforced', () => {
  it('runs calls one at a time, in the order they arrived', async () => {
    const { doc, endpoint } = setup()
    const first = endpoint.handle(call(1, 'create', BOX, 'two bodies'))
    const second = endpoint.handle(call(2, 'create', SPHERE, 'two bodies'))
    const [a, b] = await Promise.all([first, second])
    expect([a.id, b.id]).toEqual([1, 2])
    expect(doc.entries.map((entry) => entry.record.op)).toEqual(['primitive.cuboid', 'primitive.sphere'])
  })

  it('waits for a gesture to end, then runs', async () => {
    let editing = true
    const { doc, endpoint } = setup({
      isEditing: () => editing,
      onSleep: () => {
        editing = false
      },
    })
    const reply = await endpoint.handle(call(1, 'create', BOX, 'a cube'))
    expect(reply.result.error).toBeUndefined()
    expect(doc.entries).toHaveLength(1)
  })

  it('refuses a call that arrives mid-gesture once 10 s pass, in a sentence the model can read, and lands nothing', async () => {
    let waited = 0
    const { doc, endpoint } = setup({
      isEditing: () => true,
      onSleep: (ms) => {
        waited += ms
      },
    })
    const before = serializeProject(doc)
    const reply = await endpoint.handle(call(1, 'create', BOX, 'a cube'))
    expect(reply.result.error).toBe(EDITING_REFUSAL)
    expect(EDITING_REFUSAL).toBe('the user is editing; try again')
    expect(waited).toBeGreaterThanOrEqual(GESTURE_WAIT_MS)
    expect(waited).toBeLessThan(GESTURE_WAIT_MS + 1000)
    expect(serializeProject(doc)).toBe(before)
  })

  it('refuses a call whose document changed underneath it (documentRevision moved), never landing over the change', async () => {
    let editing = false
    /** @type {import('../../core/document.js').WarpDocument} */
    let target = /** @type {any} */ (null)
    const { doc, endpoint } = setup({
      isEditing: () => editing,
      onSleep: () => {
        // The user's gesture ends by committing an edit — a local write while the call waited.
        if (editing) {
          const record = /** @type {any} */ ({ ...target.records[0], id: target.nextId('cuboid') })
          target.append(record, { origin: 'local' })
        }
        editing = false
      },
    })
    target = doc
    await endpoint.handle(call(1, 'create', BOX, 'first'))
    const before = doc.entries.length
    // The call arrives mid-drag.
    editing = true
    const reply = await endpoint.handle(call(2, 'create', SPHERE, 'second'))
    expect(reply.result.error).toMatch(/project changed in WarpCad while this call waited/)
    expect(reply.result.error).toMatch(/retry/)
    // The user's edit is there; Claude's sphere is not.
    expect(doc.entries).toHaveLength(before + 1)
    expect(doc.entries.some((entry) => entry.record.op === 'primitive.sphere')).toBe(false)
  })
})

describe('createTabEndpoint: a group of landed batches is one Undo AI turn', () => {
  it('groups same-request batches inside 60 s into one entry, in data-010’s change shape', async () => {
    const { doc, clock, endpoint } = setup()
    await endpoint.handle(call(1, 'create', BOX, 'a cube and a sphere on top'))
    clock.advance(GROUP_IDLE_MS - 1000)
    await endpoint.handle(call(2, 'create', SPHERE, 'a cube and a sphere on top'))

    expect(endpoint.turns).toHaveLength(1)
    const turn = endpoint.turns[0]
    expect(turn.recordIds).toEqual(doc.entries.map((entry) => entry.record.id))
    expect(turn.change.added).toEqual(expect.arrayContaining(turn.recordIds))
    expect(turn.base.entries).toHaveLength(0)
    expect(turn.merged.entries).toHaveLength(2)
    for (const key of ['turnId', 'recordIds', 'revisedIds', 'removedIds', 'base', 'merged', 'change', 'version']) expect(turn).toHaveProperty(key)
  })

  it('starts a new group for a different request, or after a 60 s idle gap', async () => {
    const { clock, endpoint } = setup()
    await endpoint.handle(call(1, 'create', BOX, 'a cube'))
    await endpoint.handle(call(2, 'create', SPHERE, 'a sphere'))
    expect(endpoint.turns).toHaveLength(2)
    clock.advance(GROUP_IDLE_MS + 1)
    await endpoint.handle(call(3, 'create', BOX, 'a sphere'))
    expect(endpoint.turns).toHaveLength(3)
  })

  it('takes a whole group back in one step and leaves the local undo stack alone', async () => {
    const { doc, endpoint } = setup()
    // The user's own body first: it must survive, and stay on their undo stack.
    await endpoint.handle(call(1, 'create', BOX, 'seed'))
    const local = /** @type {any} */ ({ ...doc.records[0], id: doc.nextId('cuboid') })
    doc.append(local, { origin: 'local' })
    endpoint.undoLast()
    expect(doc.records.map((record) => record.id)).toEqual([local.id])

    await endpoint.handle(call(2, 'create', BOX, 'a cube and a sphere'))
    await endpoint.handle(call(3, 'create', SPHERE, 'a cube and a sphere'))
    expect(doc.entries).toHaveLength(3)
    const undoBefore = doc.pendingUndo()

    endpoint.undoLast()
    expect(doc.records.map((record) => record.id)).toEqual([local.id])
    expect(doc.pendingUndo()).toBe(undoBefore)
    expect(doc.canUndo()).toBe(true)
    expect(endpoint.turns).toHaveLength(0)
  })

  it('refuses by name to take back a group a later step builds on, and changes nothing', async () => {
    const { doc, endpoint } = setup()
    await endpoint.handle(call(1, 'create', BOX, 'a cube'))
    const id = /** @type {string} */ (doc.entries[0].record.id)
    // The user moves Claude's cube with the gizmo: a transform that builds on it.
    const move = /** @type {any} */ ({ id: doc.nextId('move'), op: 'transform.translate', target: id, supersedes: id, params: { vector: [10, 0, 0] } })
    doc.append(move, { origin: 'local' })
    const before = serializeProject(doc)
    expect(() => endpoint.undoLast()).toThrow()
    expect(serializeProject(doc)).toBe(before)
    expect(endpoint.turns).toHaveLength(1)
  })
})
