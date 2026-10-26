// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import {
  VIEW_HIDDEN_LIMITS,
  bodyViewOf,
  encodeViewHidden,
  eyeStateOf,
  hiddenBodyIds,
  hiddenCountOf,
  isBodyDrawn,
  isPartDrawn,
  normalizeViewHidden,
  parseViewKey,
  viewHiddenMapOf,
  viewKey,
  withViewHidden,
} from './visibility.js'

/**
 * `TODO/ui-089` — the one rule for "is this body / this part drawn?". A user hide is a view
 * setting, independent of a recipe's own `hidden` helper parts, and never named bare `hidden`.
 */

const PARTS = ['Cube 1 A', 'Cube 1 B']

describe('viewKey', () => {
  it('a body key and a part key are distinct, and round-trip', () => {
    expect(viewKey('c-1')).not.toBe(viewKey('c-1', 'Cube 1 A'))
    expect(parseViewKey(viewKey('c-1'))).toEqual({ bodyId: 'c-1' })
    expect(parseViewKey(viewKey('c-1', 'Cube 1 A'))).toEqual({ bodyId: 'c-1', partName: 'Cube 1 A' })
  })

  it('is unambiguous whatever characters an id or a part name holds', () => {
    expect(viewKey('a', 'b c')).not.toBe(viewKey('a b', 'c'))
    expect(parseViewKey(viewKey('a"]', '["x'))).toEqual({ bodyId: 'a"]', partName: '["x' })
  })

  it('a key that is not one is null, not a throw', () => {
    expect(parseViewKey('nonsense')).toBeNull()
    expect(parseViewKey('[1]')).toBeNull()
    expect(parseViewKey('["a","b","c"]')).toBeNull()
  })
})

describe('rule 3: a part is drawn only when its body and the part are both shown', () => {
  /** @param {boolean} body @param {boolean} part */
  const bodyWith = (body, part) => bodyViewOf(
    withViewHidden(withViewHidden(new Map(), 'c-1', { hidden: body }), 'c-1', { subPart: 'Cube 1 A', hidden: part }),
    'c-1',
    PARTS
  )

  it.each([
    [false, false, true, true],
    [false, true, true, false],
    [true, false, false, false],
    [true, true, false, false],
  ])('body hidden %s × part hidden %s → body drawn %s, part drawn %s', (body, part, bodyDrawn, partDrawn) => {
    const view = bodyWith(body, part)
    expect(isBodyDrawn(view)).toBe(bodyDrawn)
    expect(isPartDrawn(view, 'Cube 1 A')).toBe(partDrawn)
    // The other part has no hide of its own: it follows the body alone.
    expect(isPartDrawn(view, 'Cube 1 B')).toBe(!body)
  })

  it('showing the body again restores whatever each part was set to', () => {
    let map = withViewHidden(new Map(), 'c-1', { subPart: 'Cube 1 A', hidden: true })
    map = withViewHidden(map, 'c-1', { hidden: true })
    map = withViewHidden(map, 'c-1', { hidden: false })
    const view = bodyViewOf(map, 'c-1', PARTS)
    expect(isPartDrawn(view, 'Cube 1 A')).toBe(false)
    expect(isPartDrawn(view, 'Cube 1 B')).toBe(true)
  })

  it('a new body id defaults to shown', () => {
    const map = withViewHidden(new Map(), 'c-1', { hidden: true })
    const view = bodyViewOf(map, 'c-2', [])
    expect(view).toEqual({ viewHidden: false, viewHiddenParts: [] })
    expect(isBodyDrawn(view)).toBe(true)
    expect(isBodyDrawn({})).toBe(true)
    expect(isPartDrawn({}, 'anything')).toBe(true)
  })

  it('a stale part name is ignored: it never reports and never hides anything', () => {
    const map = withViewHidden(new Map(), 'c-1', { subPart: 'Cube 1 Z', hidden: true })
    const view = bodyViewOf(map, 'c-1', PARTS)
    expect(view).toEqual({ viewHidden: false, viewHiddenParts: [] })
    expect(eyeStateOf(view)).toBe('shown')
  })

  it('reports hidden parts in the body\'s own part order', () => {
    let map = withViewHidden(new Map(), 'c-1', { subPart: 'Cube 1 B', hidden: true })
    map = withViewHidden(map, 'c-1', { subPart: 'Cube 1 A', hidden: true })
    expect(bodyViewOf(map, 'c-1', PARTS).viewHiddenParts).toEqual(['Cube 1 A', 'Cube 1 B'])
  })
})

describe('withViewHidden', () => {
  it('returns the same map when nothing changes, so a caller can tell a no-op', () => {
    const map = withViewHidden(new Map(), 'c-1', { hidden: true })
    expect(withViewHidden(map, 'c-1', { hidden: true })).toBe(map)
    const empty = new Map()
    expect(withViewHidden(empty, 'c-1', { hidden: false })).toBe(empty)
  })

  it('never mutates its input', () => {
    const map = new Map()
    withViewHidden(map, 'c-1', { hidden: true })
    expect(map.size).toBe(0)
  })
})

describe('the eye\'s three states and the count line', () => {
  it('shown, hidden, and some parts hidden', () => {
    expect(eyeStateOf({ viewHidden: false, viewHiddenParts: [] })).toBe('shown')
    expect(eyeStateOf({ viewHidden: true, viewHiddenParts: [] })).toBe('hidden')
    expect(eyeStateOf({ viewHidden: true, viewHiddenParts: ['Cube 1 A'] })).toBe('hidden')
    expect(eyeStateOf({ viewHidden: false, viewHiddenParts: ['Cube 1 A'] })).toBe('mixed')
  })

  it('counts a hidden body once and each hidden part of a shown body once', () => {
    const bodies = [
      { id: 'c-1', viewHidden: false, viewHiddenParts: ['Cube 1 A'] },
      { id: 'cyl', viewHidden: true, viewHiddenParts: ['x'] },
      { id: 'c-3' },
    ]
    expect(hiddenCountOf(bodies)).toBe(2)
    expect(hiddenBodyIds(bodies)).toEqual(['cyl'])
  })
})

describe('the state-line shape', () => {
  it('encodes only what is hidden, sorted, and nothing at all when nothing is', () => {
    expect(encodeViewHidden(new Map())).toBeNull()
    let map = withViewHidden(new Map(), 'z-body', { hidden: true })
    map = withViewHidden(map, 'a-body', { subPart: 'B', hidden: true })
    map = withViewHidden(map, 'a-body', { subPart: 'A', hidden: true })
    map = withViewHidden(map, 'z-body', { subPart: 'Q', hidden: true })
    expect(JSON.stringify(encodeViewHidden(map))).toBe('{"a-body":{"parts":["A","B"]},"z-body":{"body":true,"parts":["Q"]}}')
  })

  it('drops what the caller says is stale', () => {
    let map = withViewHidden(new Map(), 'gone', { hidden: true })
    map = withViewHidden(map, 'c-1', { subPart: 'Old piece', hidden: true })
    map = withViewHidden(map, 'c-1', { subPart: 'Cube 1 A', hidden: true })
    const keep = (/** @type {string} */ bodyId, /** @type {string | undefined} */ partName) =>
      bodyId === 'c-1' && partName !== 'Old piece'
    expect(encodeViewHidden(map, keep)).toEqual({ 'c-1': { parts: ['Cube 1 A'] } })
    expect(encodeViewHidden(map, () => false)).toBeNull()
  })

  it('round-trips through normalize and back to the same map', () => {
    let map = withViewHidden(new Map(), 'c-1', { hidden: true })
    map = withViewHidden(map, 'c-1', { subPart: 'Cube 1 A', hidden: true })
    const state = /** @type {any} */ (encodeViewHidden(map))
    expect(viewHiddenMapOf(normalizeViewHidden(JSON.parse(JSON.stringify(state))))).toEqual(map)
  })

  it('normalizes: duplicates collapse, `body: false` and an empty entry mean nothing', () => {
    expect(normalizeViewHidden({ 'c-1': { parts: ['B', 'A', 'B'] }, 'c-2': { body: false }, 'c-3': {} })).toEqual({
      'c-1': { parts: ['A', 'B'] },
    })
  })

  it.each([
    [3, /`viewHidden` must map body ids/],
    [['c-1'], /`viewHidden` must map body ids/],
    [null, /`viewHidden` must map body ids/],
    [{ 'c-1': true }, /"c-1".*must be an object/],
    [{ 'c-1': { body: 'yes' } }, /"c-1".*`body` must be true or false/],
    [{ 'c-1': { parts: 'Cube 1 A' } }, /"c-1".*`parts` must be a list of part names/],
    [{ 'c-1': { parts: [1, 2] } }, /"c-1".*`parts` must be a list of part names/],
    [{ 'c-1': { parts: [''] } }, /"c-1".*`parts` must be a list of part names/],
    [{ 'c-1': { parts: ['x'.repeat(VIEW_HIDDEN_LIMITS.maxNameLength + 1)] } }, /"c-1".*part name longer than/],
    [{ ['x'.repeat(VIEW_HIDDEN_LIMITS.maxNameLength + 1)]: { body: true } }, /body id that is empty or longer than/],
  ])('refuses %j by naming the field', (raw, message) => {
    expect(() => normalizeViewHidden(raw)).toThrow(message)
  })

  it('refuses more bodies, or more parts per body, than the caps', () => {
    /** @type {Record<string, { body: true }>} */
    const many = {}
    for (let index = 0; index <= VIEW_HIDDEN_LIMITS.maxBodies; index += 1) many[`b-${index}`] = { body: true }
    expect(() => normalizeViewHidden(many)).toThrow(/more than/)
    const parts = Array.from({ length: VIEW_HIDDEN_LIMITS.maxPartsPerBody + 1 }, (_, index) => `p${index}`)
    expect(() => normalizeViewHidden({ 'c-1': { parts } })).toThrow(/more than/)
  })
})
