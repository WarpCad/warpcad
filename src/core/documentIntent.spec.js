// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument, foldableEntry } from './document.js'
import { INSTRUCTIONS_MAX_LENGTH, INTENT_MAX_LENGTH } from './intent.js'

/**
 * `TODO/ai-003` — design intent on the document.
 *
 * - A record's **intent** travels with its entry, beside `origin`, never inside the record:
 *   every record line stays byte-identical to what the command layer built.
 * - The project's **standing instructions** are document metadata, outside the fold and
 *   outside both undo stacks: Undo never changes them and changing them never refolds.
 */

const cube = (/** @type {string} */ id, x = 0) => ({
  id,
  op: 'primitive.cuboid',
  name: id,
  params: { size: [10, 10, 10], center: [x, 0, 5] },
})

describe('per-record intent', () => {
  it('rides on the entry from the transaction, and the record itself is untouched', () => {
    const document = createDocument()
    const record = cube('a')
    document.append(record, { origin: 'ai', intent: 'Make a bracket' })
    expect(document.entries[0].intent).toBe('Make a bracket')
    expect(document.entries[0].record).toEqual(cube('a'))
    expect(Object.keys(document.entries[0].record)).not.toContain('intent')
  })

  it('is absent, not empty, when the transaction carries none', () => {
    const document = createDocument()
    document.append(cube('a'), { origin: 'local' })
    expect('intent' in document.entries[0]).toBe(false)
  })

  it('is set by insertAt too, which is the path the AI tools land through', () => {
    const document = createDocument()
    document.append(cube('a'), { origin: 'local' })
    document.insertAt(0, [cube('b', 20)], { origin: 'ai', intent: 'Second one' })
    expect(document.entries.map((entry) => entry.intent)).toEqual(['Second one', undefined])
  })

  it('takes a per-record map, so a whole forked turn can land in one insert with each call’s own intent', () => {
    const document = createDocument()
    document.insertAt(0, [cube('a'), cube('b', 20)], { origin: 'ai', intent: { a: 'first call', b: 'second call' } })
    expect(document.intentOf('a')).toBe('first call')
    expect(document.intentOf('b')).toBe('second call')
  })

  it('is cleaned and capped on the way in', () => {
    const document = createDocument()
    document.append(cube('a'), { origin: 'ai', intent: `  bad\u0000 ${'x'.repeat(2000)}` })
    const intent = /** @type {string} */ (document.intentOf('a'))
    expect(intent.startsWith('bad x')).toBe(true)
    expect(intent.length).toBe(INTENT_MAX_LENGTH)
  })

  it('shows on the timeline row, null when there is none', () => {
    const document = createDocument()
    document.append(cube('a'), { origin: 'local' })
    document.append(cube('b', 20), { origin: 'ai', intent: 'Why b exists' })
    expect(document.timeline().map((row) => row.intent)).toEqual([null, 'Why b exists'])
  })

  it('survives a refold (suppress, then unsuppress, of another row)', () => {
    const document = createDocument()
    document.append(cube('a'), { origin: 'ai', intent: 'keep me' })
    document.append(cube('b', 20), { origin: 'local' })
    document.setSuppressed('b', true, { origin: 'local' })
    document.setSuppressed('b', false, { origin: 'local' })
    expect(document.intentOf('a')).toBe('keep me')
  })

  it('survives a History edit of the row (replaceRecord) and a reorder', () => {
    const document = createDocument()
    document.append(cube('a'), { origin: 'ai', intent: 'why a' })
    document.append(cube('b', 20), { origin: 'local' })
    document.replaceRecord('a', { ...cube('a'), params: { size: [12, 12, 12], center: [0, 0, 6] } }, { origin: 'local' })
    expect(document.intentOf('a')).toBe('why a')
    document.moveStep('a', 1, { origin: 'local' })
    expect(document.timeline().map((row) => [row.id, row.intent])).toEqual([
      ['b', null],
      ['a', 'why a'],
    ])
  })

  it('is carried by foldableEntry, so a load and every throwaway copy keep it', () => {
    expect(foldableEntry({ record: cube('a'), origin: 'ai', intent: 'why' }).intent).toBe('why')
    expect('intent' in foldableEntry({ record: cube('a'), origin: 'local' })).toBe(false)
  })

  it('comes back from loadEntries', () => {
    const document = createDocument()
    document.loadEntries([{ record: cube('a'), origin: 'ai', intent: 'loaded why' }])
    expect(document.intentOf('a')).toBe('loaded why')
  })
})

describe('standing instructions', () => {
  it('start empty', () => {
    expect(createDocument().standingInstructions()).toBe('')
  })

  it('are set through the command layer with an origin, and bump the version (so autosave runs)', () => {
    const document = createDocument()
    const before = document.version
    document.setStandingInstructions('Print on a 220×220 mm bed', { origin: 'local' })
    expect(document.standingInstructions()).toBe('Print on a 220×220 mm bed')
    expect(document.version).toBeGreaterThan(before)
  })

  it('refuse a change with no origin', () => {
    const document = createDocument()
    expect(() => document.setStandingInstructions('x', /** @type {any} */ ({}))).toThrow(/origin/)
  })

  it('setting the same text again is a no-op that does not bump the version', () => {
    const document = createDocument()
    document.setStandingInstructions('same', { origin: 'local' })
    const before = document.version
    document.setStandingInstructions('same', { origin: 'local' })
    expect(document.version).toBe(before)
  })

  it('are cleaned and capped', () => {
    const document = createDocument()
    document.setStandingInstructions(`a\u0007b${'z'.repeat(5000)}`, { origin: 'local' })
    expect(document.standingInstructions().startsWith('abz')).toBe(true)
    expect(document.standingInstructions()).toHaveLength(INSTRUCTIONS_MAX_LENGTH)
  })

  it('are not an undo step, and Undo of an earlier edit leaves them alone', () => {
    const document = createDocument()
    document.append(cube('a'), { origin: 'local' })
    document.setStandingInstructions('Walls at least 1.6 mm', { origin: 'local' })
    expect(document.pendingUndo()?.label).not.toMatch(/instruction/i)
    document.undo()
    expect(document.entries).toHaveLength(0)
    expect(document.standingInstructions()).toBe('Walls at least 1.6 mm')
  })

  it('are replaced by a load: what the loaded project carries, or nothing', () => {
    const document = createDocument()
    document.setStandingInstructions('old project rules', { origin: 'local' })
    document.loadEntries([{ record: cube('a'), origin: 'local' }], null, 'legacy', { standingInstructions: 'new rules' })
    expect(document.standingInstructions()).toBe('new rules')
    document.loadEntries([], null, 'legacy')
    expect(document.standingInstructions()).toBe('')
  })

  it('a refused load leaves them as they were', () => {
    const document = createDocument()
    document.setStandingInstructions('keep', { origin: 'local' })
    expect(() =>
      document.loadEntries([{ record: { id: 'x', op: 'evil.exec' }, origin: 'local' }], null, 'legacy', {
        standingInstructions: 'hostile',
      }),
    ).toThrow()
    expect(document.standingInstructions()).toBe('keep')
  })
})
