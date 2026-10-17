// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { piBoltRepeated } from './__fixtures__/piScenes.js'
import { describeSelection } from './inspector.js'

/**
 * A repeat body in the Inspector (`TODO/ui-069`, the controls for `TODO/core-061` decision 6):
 * what it repeats, the move refusal shown in the gizmo's place, and its source's parameters,
 * read-only — the description the panel and the viewport both branch on.
 */

/** @param {ReturnType<typeof piBoltRepeated>} document @param {string} id @param {string} [partName] */
function describe1(document, id, partName) {
  return describeSelection(document.bodies(), [id], {
    document,
    records: document.records,
    ...(partName ? { subPart: { bodyId: id, partName } } : {}),
  }).body
}

describe('describeSelection — a repeat body (TODO/ui-069)', () => {
  it('names its source and seed, and says how to move it instead of offering a move', () => {
    const document = piBoltRepeated()
    const body = /** @type {any} */ (describe1(document, 'rep-1'))
    expect(body.repeat).toMatchObject({
      source: 'bolt-1',
      sourceName: 'Bolt 1',
      seed: { id: 'pi-1', pieces: 'hole1' },
      seedName: 'Raspberry Pi 1',
      targets: ['hole2', 'hole3', 'hole4'],
      members: ['hole2', 'hole3', 'hole4'],
      broken: [],
    })
    expect(body.moveRefusal).toBe('Move Bolt 1 or Raspberry Pi 1; the repeats follow them')
  })

  it('shows the source’s parameters (read-only elsewhere), not the record’s own source/seed/targets', () => {
    const document = piBoltRepeated()
    const body = /** @type {any} */ (describe1(document, 'rep-1'))
    const keys = body.params.map((/** @type {any} */ field) => field.key)
    expect(keys).toEqual(expect.arrayContaining(['spec', 'length']))
    expect(keys).not.toContain('source')
    expect(keys).not.toContain('targets')
    expect(body.opLabel).toBe('Repeat of Bolt / screw')
    // Nothing on a repeat can be bound to a variable: its params are the source's.
    expect(body.bind).toBeUndefined()
  })

  it('a drilled-into member still carries the repeat, so the panel can say what Delete does', () => {
    const document = piBoltRepeated()
    const body = /** @type {any} */ (describe1(document, 'rep-1', 'hole3'))
    expect(body.subPart).toEqual({ groupName: 'Bolt 1 ×3', partName: 'hole3' })
    expect(body.repeat?.source).toBe('bolt-1')
  })

  it('an ordinary body carries neither', () => {
    const document = piBoltRepeated()
    const body = /** @type {any} */ (describe1(document, 'bolt-1'))
    expect(body.repeat).toBeUndefined()
    expect(body.moveRefusal).toBeUndefined()
  })
})
