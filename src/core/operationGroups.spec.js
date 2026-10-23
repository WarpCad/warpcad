// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { OPERATION_GROUPS, groupStates } from './operationGroups.js'

/**
 * The Operations toolbar's groups tier (`TODO/ui-082`): the hand-written group table and the pure
 * function that turns per-member enablement into each launcher's state (disabled, reason, count).
 */
describe('OPERATION_GROUPS (TODO/ui-082)', () => {
  it('is the hand-written table: Combine, Arrange, Shape, in that order, with their members', () => {
    expect(OPERATION_GROUPS.map((group) => [group.id, group.label, [...group.members]])).toEqual([
      ['combine', 'Combine', ['union', 'subtract', 'intersect', 'group']],
      ['arrange', 'Arrange', ['align', 'repeat', 'mirror']],
      ['shape', 'Shape', ['fillet', 'chamfer', 'enlarge', 'fit', 'bisect', 'split']],
    ])
  })

  it('puts no member in two groups, and leaves To library out (it stays a standalone button)', () => {
    const all = OPERATION_GROUPS.flatMap((group) => group.members)
    expect(new Set(all).size).toBe(all.length)
    expect(all).not.toContain('library')
    expect(all).not.toContain('to library')
  })

  it('gives every group a glyph', () => {
    for (const group of OPERATION_GROUPS) expect(group.glyph.length).toBeGreaterThan(0)
  })
})

describe('groupStates (TODO/ui-082)', () => {
  /** @type {import('./operationGroups.js').OperationGroup[]} */
  const GROUPS = [
    { id: 'pair', label: 'Pair', glyph: 'P', members: ['a', 'b'] },
    { id: 'trio', label: 'Trio', glyph: 'T', members: ['c', 'd', 'e'] },
  ]

  it('counts the enabled members and leaves the launcher enabled when any can run', () => {
    const [pair, trio] = groupStates(GROUPS, {
      a: { enabled: true, reason: 'A hint' },
      b: { enabled: true, reason: 'B hint' },
      c: { enabled: false, reason: 'Select 1' },
      d: { enabled: true, reason: 'D hint' },
      e: { enabled: false, reason: 'Select 2' },
    })
    expect(pair.enabledCount).toBe(2)
    expect(pair.disabled).toBe(false)
    expect(trio.enabledCount).toBe(1)
    expect(trio.disabled).toBe(false)
    expect(trio.members).toEqual([
      { key: 'c', enabled: false, reason: 'Select 1' },
      { key: 'd', enabled: true, reason: 'D hint' },
      { key: 'e', enabled: false, reason: 'Select 2' },
    ])
  })

  it('disables a launcher none of whose members can run, with the lead member’s reason as its title', () => {
    const [, trio] = groupStates(GROUPS, {
      a: { enabled: true, reason: '' },
      b: { enabled: true, reason: '' },
      c: { enabled: false, reason: 'Select 1 or 2 solids' },
      d: { enabled: false, reason: 'Drill into a part first' },
      e: { enabled: false, reason: 'Select exactly 1 solid' },
    })
    expect(trio.enabledCount).toBe(0)
    expect(trio.disabled).toBe(true)
    expect(trio.reason).toBe('Select 1 or 2 solids')
  })

  it('titles an enabled launcher with how many of its members can run', () => {
    const [pair] = groupStates(GROUPS, {
      a: { enabled: true, reason: '' },
      b: { enabled: false, reason: 'no' },
      c: { enabled: false, reason: '' },
      d: { enabled: false, reason: '' },
      e: { enabled: false, reason: '' },
    })
    expect(pair.reason).toBe('Pair — 1 of 2 available')
  })

  it('throws on a member it has no state for, rather than silently showing it disabled', () => {
    expect(() => groupStates(GROUPS, { a: { enabled: true, reason: '' } })).toThrow(/b/)
  })

  it('maps the real table: two solids enable all four Combine members and no Shape member', () => {
    /** @type {Record<string, { enabled: boolean, reason: string }>} */
    const twoSelected = {}
    for (const key of ['union', 'subtract', 'intersect', 'group', 'align']) twoSelected[key] = { enabled: true, reason: '' }
    twoSelected.repeat = { enabled: false, reason: 'Drill into a part' }
    for (const key of ['mirror', 'fillet', 'chamfer', 'enlarge', 'fit', 'bisect', 'split']) {
      twoSelected[key] = { enabled: false, reason: 'Select exactly 1 solid' }
    }
    const byId = Object.fromEntries(groupStates(OPERATION_GROUPS, twoSelected).map((state) => [state.id, state]))
    expect(byId.combine.enabledCount).toBe(4)
    expect(byId.arrange.enabledCount).toBe(1)
    expect(byId.shape.disabled).toBe(true)
    expect(byId.shape.reason).toBe('Select exactly 1 solid')
  })
})
