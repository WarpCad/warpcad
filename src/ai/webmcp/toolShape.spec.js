// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { OUTPUT_BUDGET, annotationsFor, modelContextOf, requestFor } from './toolShape.js'

/**
 * `toolShape.js` is the one place that knows WebMCP's registration shape (Decision 13, "Honest
 * limits": the spec has moved twice). These pin the parts that are not exercised end to end by
 * `register.spec.js`.
 */

const api = () => ({ registerTool: async () => undefined })

describe('modelContextOf: feature detection, never a throw', () => {
  it('prefers document.modelContext (the current draft)', () => {
    const fromDocument = api()
    const fromNavigator = api()
    expect(modelContextOf({ document: { modelContext: fromDocument }, navigator: { modelContext: fromNavigator } })).toBe(fromDocument)
  })

  it('falls back to navigator.modelContext for older Chromes', () => {
    const fromNavigator = api()
    expect(modelContextOf({ document: {}, navigator: { modelContext: fromNavigator } })).toBe(fromNavigator)
  })

  it('is null when the API is missing, partial, or there is no DOM at all', () => {
    expect(modelContextOf({ document: {}, navigator: {} })).toBeNull()
    expect(modelContextOf({ document: { modelContext: {} } })).toBeNull()
    expect(modelContextOf({ document: { modelContext: { registerTool: 'yes' } } })).toBeNull()
    expect(modelContextOf({})).toBeNull()
    expect(() => modelContextOf(/** @type {any} */ (undefined))).not.toThrow()
  })

  it('is null when reading the property throws (a locked-down embed)', () => {
    const hostile = {
      get document() {
        throw new Error('blocked')
      },
    }
    expect(modelContextOf(hostile)).toBeNull()
  })
})

describe('requestFor: the intent a write without a rationale records', () => {
  it('is undefined when the agent gave a rationale (the rationale is the intent)', () => {
    expect(requestFor('create', { op: 'primitive.cuboid', rationale: 'the base' })).toBeUndefined()
  })

  it('is the tool name and a one-line summary of its arguments otherwise, capped', () => {
    expect(requestFor('create', { op: 'primitive.cuboid', positionMm: [0, 0, 0] })).toBe('create {"op":"primitive.cuboid","positionMm":[0,0,0]}')
    expect(requestFor('get_timeline', {})).toBe('get_timeline')
    expect(requestFor('create', { rationale: '   ' })).toBe('create')
    const long = requestFor('apply_records', { steps: Array.from({ length: 50 }, () => ({ create: { op: 'primitive.cuboid', positionMm: [0, 0, 0] } })) })
    expect(long?.length).toBeLessThanOrEqual(160)
    expect(long?.endsWith('…')).toBe(true)
    expect(requestFor('create', { note: 'two\nlines' })).not.toContain('\n')
  })

  it('never reads limit or offset as part of the request', () => {
    expect(requestFor('describe_scene', { limit: 3, offset: 2 })).toBe('describe_scene')
  })
})

describe('annotationsFor and the budget', () => {
  it('the budget is Chrome’s 1.5K characters', () => {
    expect(OUTPUT_BUDGET).toBe(1500)
  })

  it('marks an unknown tool as neither read-only nor trusted', () => {
    expect(annotationsFor('something_new')).toEqual({ untrustedContentHint: true })
  })
})
