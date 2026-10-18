// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { OUTPUT_BUDGET, aliasNavigatorModelContext, annotationsFor, modelContextApiOf, modelContextOf, requestFor } from './toolShape.js'

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

describe('modelContextApiOf: which entry point was found, for the diagnostic (ai-024)', () => {
  it('says document when the current draft’s document.modelContext is there, even beside navigator', () => {
    expect(modelContextApiOf({ document: { modelContext: api() }, navigator: { modelContext: api() } })).toBe('document')
  })

  it('says navigator for an older Chrome that has only navigator.modelContext', () => {
    expect(modelContextApiOf({ document: {}, navigator: { modelContext: api() } })).toBe('navigator')
  })

  it('says none for neither, for an object without registerTool, and when reading throws', () => {
    expect(modelContextApiOf({ document: {}, navigator: {} })).toBe('none')
    expect(modelContextApiOf({ document: { modelContext: {} }, navigator: { modelContext: { registerTool: 1 } } })).toBe('none')
    expect(modelContextApiOf({})).toBe('none')
    expect(modelContextApiOf(/** @type {any} */ (undefined))).toBe('none')
    const hostile = {
      get document() {
        throw new Error('blocked')
      },
    }
    expect(modelContextApiOf(hostile)).toBe('none')
  })

  it('skips a document.modelContext without registerTool and takes a working navigator one', () => {
    const fromNavigator = api()
    expect(modelContextApiOf({ document: { modelContext: {} }, navigator: { modelContext: fromNavigator } })).toBe('navigator')
    expect(modelContextOf({ document: { modelContext: {} }, navigator: { modelContext: fromNavigator } })).toBe(fromNavigator)
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

describe('aliasNavigatorModelContext (ai-024)', () => {
  const api = { registerTool: () => undefined }

  it('exposes document.modelContext as navigator.modelContext when navigator has none', () => {
    /** @type {any} */
    const env = { document: { modelContext: api }, navigator: {} }
    expect(aliasNavigatorModelContext(env)).toBe(true)
    expect(env.navigator.modelContext).toBe(api)
  })

  it('never replaces a navigator.modelContext the browser already has', () => {
    const own = { registerTool: () => undefined }
    /** @type {any} */
    const env = { document: { modelContext: api }, navigator: { modelContext: own } }
    expect(aliasNavigatorModelContext(env)).toBe(false)
    expect(env.navigator.modelContext).toBe(own)
  })

  it('does nothing without a usable document.modelContext, or without a navigator, and never throws', () => {
    expect(aliasNavigatorModelContext({ document: {}, navigator: {} })).toBe(false)
    expect(aliasNavigatorModelContext({ document: { modelContext: {} }, navigator: {} })).toBe(false)
    expect(aliasNavigatorModelContext({ document: { modelContext: api } })).toBe(false)
    const frozen = Object.freeze({})
    expect(aliasNavigatorModelContext({ document: { modelContext: api }, navigator: frozen })).toBe(false)
    expect(aliasNavigatorModelContext(undefined)).toBe(false)
  })
})
