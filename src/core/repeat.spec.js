// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LOCAL, piBoltOnHole1 as boltOnHole1 } from './__fixtures__/piScenes.js'
import {
  REPEAT_LIMITS,
  REPEAT_OP,
  defaultRepeatName,
  mentionsSeed,
  nameFamily,
  repeatReferencedIds,
  repeatRefusal,
  substituteSeed,
} from './repeat.js'

/**
 * `TODO/core-061`'s pure half: rewriting one operand, finding a part's name family, and
 * every append-time refusal (decision 5), against a real Pi 5 and Touchscreen 2.
 */

/** The ids of the Pi's records, as the bolt's steps name them. */
const PI_ROOTS = /** @type {Record<string, string>} */ ({ 'pi-1': 'pi-1', 'pi-1-move': 'pi-1', 'pi-snap': 'pi-1', 'pi-align': 'pi-1' })
/** @param {string} id */
const rootOf = (id) => PI_ROOTS[id] ?? id

describe('substituteSeed — re-aim one step at another part', () => {
  const align = {
    id: 'bolt-align',
    op: 'group.align',
    target: 'bolt-turn',
    supersedes: 'bolt-turn',
    operands: [{ id: 'pi-snap', pieces: 'hole1' }],
    params: { axes: 'xy', deltaMm: 0 },
  }
  const snap = {
    id: 'bolt-snap',
    op: 'group.snap',
    target: 'bolt-align',
    supersedes: 'bolt-align',
    operands: [{ id: 'pi-snap', pieces: 'mb' }],
    params: { axes: 'z', orientation: 'outside-', deltaMm: -5 },
  }

  it('rewrites the seed operand (hole1 → hole2) and keeps the record it reads (the Pi as it was then)', () => {
    const next = substituteSeed(align, { id: 'pi-1', pieces: 'hole1' }, 'hole2', rootOf)
    expect(next.operands).toEqual([{ id: 'pi-snap', pieces: 'hole2' }])
    // Nothing else moves: the same step, aimed elsewhere.
    expect({ ...next, operands: undefined }).toEqual({ ...align, operands: undefined })
    // Never mutates the step it was given — that record is still Bolt 1's own.
    expect(align.operands).toEqual([{ id: 'pi-snap', pieces: 'hole1' }])
  })

  it('leaves `{ id: Pi, pieces: "mb" }` and every other operand alone, so the Z snap stays on mb', () => {
    const next = substituteSeed(snap, { id: 'pi-1', pieces: 'hole1' }, 'hole2', rootOf)
    expect(next).toEqual(snap)
  })

  it('leaves a bare target alone, and an operand on another body with the same part name', () => {
    const other = { ...align, operands: [{ id: 'screen-1', pieces: 'hole1' }] }
    expect(substituteSeed(other, { id: 'pi-1', pieces: 'hole1' }, 'hole2', rootOf)).toEqual(other)
  })

  it('renames the seed inside a comma list without touching its neighbours', () => {
    const both = { ...align, operands: [{ id: 'pi-snap', pieces: 'mb,hole1' }] }
    expect(substituteSeed(both, { id: 'pi-1', pieces: 'hole1' }, 'hole3', rootOf).operands).toEqual([
      { id: 'pi-snap', pieces: 'mb,hole3' },
    ])
  })

  it('mentionsSeed: true for a lineage with the Align, false once only the Snap on mb is left', () => {
    const seed = { id: 'pi-1', pieces: 'hole1' }
    expect(mentionsSeed([align, snap], seed, rootOf)).toBe(true)
    expect(mentionsSeed([snap], seed, rootOf)).toBe(false)
  })
})

describe('nameFamily — the targets ui-069 pre-ticks', () => {
  const pi = ['mb', 'hole1', 'hole2', 'hole3', 'hole4', 'fan1hole', 'fan2hole', 'usb1', 'usb2']

  it('hole1 → the four holes, in number order, seed included', () => {
    expect(nameFamily(pi, 'hole1')).toEqual(['hole1', 'hole2', 'hole3', 'hole4'])
  })

  it('mb → none: a name with no number has no family', () => {
    expect(nameFamily(pi, 'mb')).toEqual([])
  })

  it('a stem must match exactly: fan1hole is not a hole, and hathole1 is not one either', () => {
    expect(nameFamily([...pi, 'hathole1'], 'hole2')).toEqual(['hole1', 'hole2', 'hole3', 'hole4'])
  })

  it('hole1 does not match hole10 by prefix: hole10 is its own member, numbered after hole4', () => {
    const many = ['hole10', 'hole2', 'hole1', 'hole4', 'hole3']
    expect(nameFamily(many, 'hole1')).toEqual(['hole1', 'hole2', 'hole3', 'hole4', 'hole10'])
    expect(nameFamily(many, 'hole10')).toEqual(['hole1', 'hole2', 'hole3', 'hole4', 'hole10'])
  })

  it('a seed the body does not have has no family', () => {
    expect(nameFamily(pi, 'hole9')).toEqual([])
  })
})

const PARAMS = Object.freeze({ source: 'bolt-1', seed: Object.freeze({ id: 'pi-1', pieces: 'hole1' }), targets: Object.freeze(['hole2', 'hole3', 'hole4']) })

/** @param {Record<string, any>} [changes] */
const params = (changes = {}) => structuredClone({ ...PARAMS, ...changes })

describe('repeatRefusal — decision 5, every refusal with its reason, nothing appended', () => {
  it('a sound repeat is not refused', () => {
    expect(repeatRefusal(boltOnHole1(), params())).toBeNull()
  })

  it('refuses a source that is not a live body', () => {
    const document = boltOnHole1()
    expect(repeatRefusal(document, params({ source: 'nope' }))).toMatch(/no body "nope"/)
    document.deleteBodies(['bolt-1'], LOCAL)
    expect(repeatRefusal(document, params())).toMatch(/Bolt 1 has been deleted/)
  })

  it('refuses a seed body that is not live, or has no such part', () => {
    const document = boltOnHole1()
    expect(repeatRefusal(document, params({ seed: { id: 'nope', pieces: 'hole1' } }))).toMatch(/no body "nope"/)
    expect(repeatRefusal(document, params({ seed: { id: 'pi-1', pieces: 'hole9' } }))).toBe('Raspberry Pi 1 has no part named hole9')
  })

  it('refuses a missing, duplicated or seed-equal target, and an empty list', () => {
    const document = boltOnHole1()
    expect(repeatRefusal(document, params({ targets: ['hole2', 'hole9'] }))).toBe('Raspberry Pi 1 has no part named hole9')
    expect(repeatRefusal(document, params({ targets: ['hole2', 'hole2'] }))).toBe('hole2 is listed twice')
    expect(repeatRefusal(document, params({ targets: ['hole1', 'hole2'] }))).toBe(
      'hole1 is where Bolt 1 already is — pick the other targets'
    )
    expect(repeatRefusal(document, params({ targets: [] }))).toBe('Pick at least one target besides hole1')
  })

  it('refuses more targets than the limit, by the limit', () => {
    expect(REPEAT_LIMITS.maxTargets).toBe(64)
    const many = Array.from({ length: REPEAT_LIMITS.maxTargets + 1 }, (_, index) => `hole${index + 2}`)
    expect(repeatRefusal(boltOnHole1(), params({ targets: many }))).toBe('A repeat has at most 64 targets; this one has 65')
  })

  it('refuses a source whose steps never mention the seed, in the words the panel shows', () => {
    const document = boltOnHole1()
    expect(repeatRefusal(document, params({ seed: { id: 'pi-1', pieces: 'hole2' }, targets: ['hole3'] }))).toBe(
      "Nothing in Bolt 1's steps refers to hole2, so every repeat would land on Bolt 1"
    )
  })

  it('refuses a body repeated onto its own parts', () => {
    const document = boltOnHole1()
    expect(repeatRefusal(document, params({ seed: { id: 'bolt-1', pieces: 'head' }, targets: ['thread'] }))).toBe(
      "Bolt 1 can't be repeated onto its own parts"
    )
  })

  it('refuses a malformed record shape, naming the field', () => {
    const document = boltOnHole1()
    expect(repeatRefusal(document, /** @type {any} */ ({ source: 'bolt-1', seed: 'pi-1', targets: ['hole2'] }))).toMatch(/seed/)
    expect(repeatRefusal(document, /** @type {any} */ ({ ...params(), targets: ['hole2', 7] }))).toMatch(/targets/)
  })
})

describe('the rest of the record contract', () => {
  it('reports source and seed body as the records it depends on', () => {
    expect(repeatReferencedIds({ id: 'r', op: REPEAT_OP, params: params() })).toEqual(['bolt-1', 'pi-1'])
    expect(repeatReferencedIds({ id: 'r', op: 'primitive.cuboid', params: {} })).toEqual([])
  })

  it('names the repeat body after its source and its count', () => {
    expect(defaultRepeatName('Bolt 1', 3)).toBe('Bolt 1 ×3')
  })
})

describe('`skip`: steps a repeat leaves out (TODO/core-063)', () => {
  it('accepts a list of step ids and refuses anything else, naming the field', () => {
    const document = boltOnHole1()
    expect(repeatRefusal(document, params({ skip: ['bolt-snap'] }))).toBeNull()
    expect(repeatRefusal(document, params({ skip: 'bolt-snap' }))).toMatch(/skip/)
    expect(repeatRefusal(document, params({ skip: [7] }))).toMatch(/skip/)
  })

  it('refuses leaving out the source’s first step, which is the part itself', () => {
    expect(repeatRefusal(boltOnHole1(), params({ skip: ['bolt-1'] }))).toBe(
      "Bolt 1's first step is the part itself, so a repeat can't leave it out"
    )
  })

  it('leaving out the only step that mentions the seed leaves nothing to re-aim: the usual refusal', () => {
    expect(repeatRefusal(boltOnHole1(), params({ skip: ['bolt-align'] }))).toBe(
      "Nothing in Bolt 1's steps refers to hole1, so every repeat would land on Bolt 1"
    )
  })
})
