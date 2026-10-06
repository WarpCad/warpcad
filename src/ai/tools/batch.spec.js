// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from '../../core/document.js'
import { recordsForDrop } from '../../core/library.js'
import { makeContext } from './__fixtures__/context.js'
import { createToolRegistry } from './index.js'
import { LIMITS, createTurn } from './limits.js'

const tools = createToolRegistry()

/**
 * Everything a rejected batch must leave exactly as it was.
 *
 * @param {import('../../core/document.js').WarpDocument} document
 */
function state(document) {
  return JSON.stringify({
    entries: document.entries,
    bodies: document.bodies().map((body) => [body.id, body.recordId]),
    rollbackAt: document.rollbackAt(),
    canUndo: document.canUndo(),
    pendingUndo: document.pendingUndo()?.label ?? null,
  })
}

const CUBE = { create: { op: 'primitive.cuboid', positionMm: [0, 0, 0], params: { size: [20, 20, 20] } } }
const SPHERE = { create: { op: 'primitive.sphere', positionMm: [10, 0, 0], params: { diameter: 20 } } }

describe('apply_records — several steps, one atomic append', () => {
  it('builds a whole cube-sphere-subtract in one call, naming earlier steps by @n', () => {
    const document = createDocument()
    const result = /** @type {any} */ (
      tools.run(makeContext({ document }), 'apply_records', {
        steps: [CUBE, SPHERE, { operate: { op: 'boolean.subtract', operands: [{ id: '@1' }, { id: '@2' }] } }],
      })
    )
    expect(result.error).toBeUndefined()
    expect(result.applied).toEqual([
      { batchStep: 1, tool: 'create', bodyId: 'cuboid-1', recordIds: ['cuboid-1'] },
      { batchStep: 2, tool: 'create', bodyId: 'sphere-2', recordIds: ['sphere-2'] },
      { batchStep: 3, tool: 'operate', bodyId: 'bool-3', recordIds: ['bool-3'] },
    ])
    expect(result.scene.count).toBe(1)
    expect(document.entries.every((entry) => entry.origin === 'ai')).toBe(true)
  })

  it('leaves the document unchanged when the third record is invalid — all or none', () => {
    const document = createDocument()
    document.appendAll(recordsForDrop('primitive.cone', { x: -50, y: 0 }, document), { origin: 'local' })
    const before = state(document)
    const result = /** @type {any} */ (
      tools.run(makeContext({ document }), 'apply_records', {
        steps: [CUBE, SPHERE, { operate: { op: 'modify.filletRim', operands: [{ id: '@1' }], params: { radius: 500, orientation: 'z+' } } }],
      })
    )
    expect(result.batchStep).toBe(3)
    expect(result.error).toMatch(/can't be built/)
    expect(state(document)).toBe(before)
  })

  it('leaves the document unchanged when a later step names a body that does not exist', () => {
    const document = createDocument()
    const before = state(document)
    const result = /** @type {any} */ (
      tools.run(makeContext({ document }), 'apply_records', {
        steps: [CUBE, SPHERE, { operate: { op: 'boolean.subtract', operands: [{ id: '@1' }, { id: 'ghost-9' }] } }],
      })
    )
    expect(result).toMatchObject({ batchStep: 3 })
    expect(result.reason).toMatch(/ghost-9/)
    expect(state(document)).toBe(before)
  })

  it('refuses an @n that points at itself, a later step, or nothing', () => {
    for (const ref of ['@2', '@3', '@0', '@x']) {
      const document = createDocument()
      const result = /** @type {any} */ (
        tools.run(makeContext({ document }), 'apply_records', {
          steps: [CUBE, { operate: { op: 'transform.translate', operands: [{ id: ref }], params: { deltaMm: [0, 0, 1] } } }],
        })
      )
      expect(result.reason, ref).toMatch(/@/)
      expect(document.entries, ref).toHaveLength(0)
    }
  })

  it('resolves @n to a placed composite’s body, so the next step builds on its drop translate', () => {
    const document = createDocument()
    const result = /** @type {any} */ (
      tools.run(makeContext({ document }), 'apply_records', {
        steps: [
          { create: { op: 'hardware.washer', positionMm: [0, 0, 0] } },
          { operate: { op: 'transform.translate', operands: [{ id: '@1' }], params: { deltaMm: [0, 0, 10] } } },
        ],
      })
    )
    expect(result.error).toBeUndefined()
    expect(result.applied[0].recordIds).toHaveLength(2)
    const move = document.entries.at(-1)?.record
    expect(move?.supersedes).toBe(result.applied[0].recordIds[1])
    expect(document.bodies()).toHaveLength(1)
  })

  it('refuses an empty batch', () => {
    const result = /** @type {any} */ (tools.run(makeContext({ document: createDocument() }), 'apply_records', { steps: [] }))
    expect(result.error).toBeDefined()
  })
})

describe('the caps, enforced in the registry rather than the prompt', () => {
  it('refuses more records in one call than the per-call cap, before building anything, and stops the turn', () => {
    const document = createDocument()
    const turn = createTurn()
    const steps = Array.from({ length: LIMITS.recordsPerCall + 1 }, (_, index) => ({
      create: { op: 'primitive.cuboid', positionMm: [index * 50, 0, 0] },
    }))
    const result = /** @type {any} */ (tools.run(makeContext({ document, turn }), 'apply_records', { steps }))
    expect(result).toMatchObject({ limit: 'recordsPerCall', stop: true })
    expect(document.entries).toHaveLength(0)
    expect(turn.stats.stopped).toBe(true)
  })

  it('counts a composite’s two records against the per-call cap, not one', () => {
    const document = createDocument()
    const steps = Array.from({ length: 26 }, (_, index) => ({ create: { op: 'hardware.nut', positionMm: [index * 30, 0, 0] } }))
    const result = /** @type {any} */ (tools.run(makeContext({ document }), 'apply_records', { steps }))
    expect(result).toMatchObject({ limit: 'recordsPerCall', stop: true })
    expect(document.entries).toHaveLength(0)
  })

  it('refuses the call that would cross the per-turn cap, keeping what earlier calls landed', () => {
    const document = createDocument()
    const turn = createTurn({ limits: { ...LIMITS, recordsPerTurn: 3 } })
    const ctx = makeContext({ document, turn })
    expect(/** @type {any} */ (tools.run(ctx, 'apply_records', { steps: [CUBE, SPHERE] })).error).toBeUndefined()
    const before = state(document)
    const result = /** @type {any} */ (
      tools.run(ctx, 'apply_records', { steps: [{ create: { op: 'primitive.cone', positionMm: [50, 0, 0] } }, { create: { op: 'primitive.cone', positionMm: [90, 0, 0] } }] })
    )
    expect(result).toMatchObject({ limit: 'recordsPerTurn', stop: true })
    expect(state(document)).toBe(before)
    expect(turn.stats.records).toBe(2)
  })

  it('does not charge a rejected batch against the turn', () => {
    const turn = createTurn()
    tools.run(makeContext({ document: createDocument(), turn }), 'apply_records', {
      steps: [CUBE, { operate: { op: 'boolean.subtract', operands: [{ id: '@1' }, { id: 'nope-1' }] } }],
    })
    expect(turn.stats.records).toBe(0)
  })
})

describe('origin scoping — one AI turn is never on the local undo stack', () => {
  it('a local undo removes the human’s step and leaves the AI’s record in place', () => {
    const document = createDocument()
    document.appendAll(recordsForDrop('primitive.cuboid', { x: 0, y: 0 }, document), { origin: 'local' })
    tools.run(makeContext({ document }), 'apply_records', { steps: [{ create: { op: 'primitive.sphere', positionMm: [60, 0, 0] } }] })
    expect(document.pendingUndo()?.records.map((record) => record.id)).toEqual(['cuboid-1'])
    document.undo()
    expect(document.bodies().map((body) => body.id)).toEqual(['sphere-2'])
    expect(document.originOf('sphere-2')).toBe('ai')
    expect(document.canUndo()).toBe(false)
  })

  it('refuses to run any tool under the local origin', () => {
    const document = createDocument()
    expect(() => tools.run(makeContext({ document, origin: 'local' }), 'apply_records', { steps: [CUBE] })).toThrow(/local/)
    expect(document.entries).toHaveLength(0)
  })
})
