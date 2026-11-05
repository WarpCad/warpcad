// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ui-094`: renaming a part of a group — one `group.renamePart` record over the body's
 * terminal, and everything that holds the old name outside the fold following it.
 */
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { boundsOf, isGroup } from './kernel/group.js'
import { parseProject, serializeProject } from './project.js'
import { defineFormula, bindParam } from './variables.js'

const local = { origin: 'local' }
const MERGE = { origin: 'merge' }

const cuboid = (/** @type {string} */ id, /** @type {string} */ name, /** @type {number[]} */ center) => ({
  id,
  op: 'primitive.cuboid',
  name,
  params: { size: [10, 10, 10], center },
})

/** Three cubes grouped as `A`, `B`, `C` (0, 30, 60 mm along x). */
const GROUPED = [
  cuboid('a', 'A', [0, 0, 5]),
  cuboid('b', 'B', [30, 0, 5]),
  cuboid('c', 'C', [60, 0, 5]),
  { id: 'g', op: 'group.assemble', name: 'Group 1', target: 'a', operands: ['b', 'c'], consumes: ['a', 'b', 'c'], params: { names: ['A', 'B', 'C'] } },
]

/** @param {object} [options] */
function grouped(options = {}) {
  return createDocument({ ...options, actions: GROUPED.map((record) => structuredClone(record)) })
}

/** @param {import('./document.js').WarpDocument} document @param {string} [id] */
function partsOf(document, id = 'g') {
  const geometry = document.bodies().find((body) => body.id === id)?.geometry
  return isGroup(geometry) ? Object.keys(geometry.parts) : []
}

/** @param {import('./document.js').WarpDocument} document @param {string} [id] */
function bodyOf(document, id = 'g') {
  return /** @type {import('./document.js').Body} */ (document.bodies().find((body) => body.id === id))
}

describe('renamePart — a supersession over the terminal (TODO/ui-094)', () => {
  it('appends one unnamed record that keeps the body id, the part’s place and a History label', () => {
    const document = grouped()
    const { record } = document.renamePart('g', 'B', 'Lid', local)
    expect(record).toMatchObject({ op: 'group.renamePart', target: 'g', supersedes: 'g', params: { part: 'B', to: 'Lid' } })
    expect(record.name).toBeUndefined()
    expect(record.id).toMatch(/^g-renamepart/)
    expect(bodyOf(document).id).toBe('g')
    expect(partsOf(document)).toEqual(['A', 'Lid', 'C'])
    expect(document.pendingUndo()?.label).toBe('Rename B to Lid on Group 1')
    expect(document.timeline().at(-1)?.label).toBe('Rename B to Lid on Group 1')
  })

  it('one Undo puts the old name back; Redo brings the new one', () => {
    const document = grouped()
    document.renamePart('g', 'B', 'Lid', local)
    document.undo()
    expect(partsOf(document)).toEqual(['A', 'B', 'C'])
    document.redo()
    expect(partsOf(document)).toEqual(['A', 'Lid', 'C'])
  })

  it('survives a save and reload', () => {
    const document = grouped()
    document.renamePart('g', 'B', 'Lid', local)
    const parsed = parseProject(serializeProject(document))
    expect(parsed.warnings).toEqual([])
    const reloaded = createDocument()
    reloaded.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, { merge: parsed.merge })
    expect(partsOf(reloaded)).toEqual(['A', 'Lid', 'C'])
  })

  it('refuses by name, writing nothing: unknown body, unknown part, taken name, bad name, unchanged name, deleted body', () => {
    const document = grouped()
    const before = document.records.length
    expect(() => document.renamePart('nope', 'B', 'Lid', local)).toThrow(/no such body/)
    expect(() => document.renamePart('g', 'Nope', 'Lid', local)).toThrow(/no part named "Nope"/)
    expect(() => document.renamePart('g', 'A', 'B', local)).toThrow(/This group already has a part called B — "B 1" is free/)
    expect(() => document.renamePart('g', 'A', 'a,b', local)).toThrow(/comma/)
    expect(() => document.renamePart('g', 'A', '', local)).toThrow(/needs a name/)
    expect(() => document.renamePart('g', 'A', '12', local)).toThrow(/only digits/)
    expect(() => document.renamePart('g', 'A', 'A', local)).toThrow(/already called A/)
    expect(document.records.length).toBe(before)
    document.deleteBodies(['g'], local)
    expect(() => document.renamePart('g', 'A', 'Lid', local)).toThrow(/deleted/)
  })

  it('refuses a recipe’s own parts and a bare solid', () => {
    const document = createDocument()
    document.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { type: 'socket', spec: 'm3', length: 10, fit: 'loose' } }, local)
    document.append(cuboid('box', 'Box', [50, 0, 5]), local)
    expect(() => document.renamePart('bolt', 'head', 'Cap', local)).toThrow(/ready-made part/)
    expect(() => document.renamePart('box', 'A', 'Lid', local)).toThrow(/no parts/)
  })

  it('a red part stays red, and a recolour written after the rename uses the new name', () => {
    const document = grouped()
    document.setColorOverride('g', { color: 0xff0000, subPart: 'B' }, local)
    document.renamePart('g', 'B', 'Lid', local)
    expect(bodyOf(document).colorOverrides).toEqual([{ color: 0xff0000, subPart: 'Lid' }])
    document.setColorOverride('g', { color: 0x00ff00, subPart: 'Lid' }, local)
    expect(bodyOf(document).colorOverrides).toEqual([{ color: 0x00ff00, subPart: 'Lid' }])
    document.undo()
    document.undo()
    expect(bodyOf(document).colorOverrides).toEqual([{ color: 0xff0000, subPart: 'B' }])
  })

  it('a rename chained twice, and the old name reused by another part afterwards, keep each colour on its part', () => {
    const document = grouped()
    document.setColorOverride('g', { color: 0xff0000, subPart: 'A' }, local)
    document.setColorOverride('g', { color: 0x0000ff, subPart: 'B' }, local)
    document.renamePart('g', 'A', 'Tmp', local)
    document.renamePart('g', 'B', 'A', local)
    document.renamePart('g', 'Tmp', 'B', local)
    expect(partsOf(document)).toEqual(['B', 'A', 'C'])
    const colours = Object.fromEntries((bodyOf(document).colorOverrides ?? []).map((entry) => [entry.subPart, entry.color]))
    expect(colours).toEqual({ B: 0xff0000, A: 0x0000ff })
  })

  it('a Subtract names the part by its new name; a Subtract above the rename still folds', () => {
    const document = grouped()
    document.append(
      { id: 'plate', op: 'primitive.cuboid', name: 'Plate', params: { size: [100, 20, 4], center: [30, 0, 2] } },
      local,
    )
    document.append(
      { id: 'cut-1', op: 'boolean.subtract', name: 'Subtract 1', target: 'plate', operands: [{ id: 'g', pieces: 'A' }], consumes: ['plate'] },
      local,
    )
    document.renamePart('g', 'B', 'Lid', local)
    const terminal = /** @type {string} */ (document.currentIdOf('g'))
    document.append(
      { id: 'cut-2', op: 'boolean.subtract', name: 'Subtract 2', target: 'cut-1', operands: [{ id: terminal, pieces: 'Lid' }], consumes: ['cut-1'] },
      local,
    )
    expect(document.brokenSteps()).toEqual([])
    expect(document.bodies().some((body) => body.id === 'cut-2' || document.rootOf(body.recordId) === 'plate')).toBe(true)
  })

  it('a step whose part a later change removed folds to the value unchanged and breaks no row', () => {
    const document = grouped()
    document.append({ id: 'g-renamepart-x', op: 'group.renamePart', target: 'g', supersedes: 'g', params: { part: 'Gone', to: 'Lid' } }, local)
    document.append({ id: 'g-renamepart-y', op: 'group.renamePart', target: 'g-renamepart-x', supersedes: 'g-renamepart-x', params: { part: 'A', to: 'C' } }, local)
    expect(document.brokenSteps()).toEqual([])
    expect(partsOf(document)).toEqual(['A', 'B', 'C'])
  })

  it('a formula above the rename keeps its value; the later-change report names the move, never the rename', () => {
    const document = grouped()
    defineFormula(document, { name: 'edge', formula: '#g.A.max.x' }, local)
    document.append(cuboid('d', 'D', [0, 40, 5]), local)
    bindParam(document, 'd', 'size.0', 'edge', local)
    document.renamePart('g', 'A', 'Lid', local)
    // The row keeps what it read, and nothing reports the rename as a change.
    expect(boundsOf(bodyOf(document, 'd').geometry)[1][0] - boundsOf(bodyOf(document, 'd').geometry)[0][0]).toBeCloseTo(5, 6)
    expect(document.formulaResults().get('edge')?.varies).toEqual([])
    // Move the group, then give A its name back: the end value differs, and the step that changed it is the move.
    const moved = /** @type {string} */ (document.currentIdOf('g'))
    document.append({ id: 'g-move', op: 'transform.translate', target: moved, supersedes: moved, params: { vector: [3, 0, 0] } }, local)
    document.renamePart('g', 'Lid', 'A', local)
    const [varies] = /** @type {any} */ (document.formulaResults().get('edge')).varies
    expect(varies.changedAtStep).toBe(document.entries.findIndex((entry) => entry.record.id === 'g-move') + 1)
  })

  it('a row naming the new name cannot be moved above the rename', () => {
    const document = grouped()
    document.append(
      { id: 'pin', op: 'primitive.cylinder', name: 'Pin', params: { height: 10, diameter: 3, center: [0, 50, 5] } },
      local,
    )
    const { record } = document.renamePart('g', 'B', 'Lid', local)
    document.append(
      { id: 'pin-align', op: 'group.align', target: 'pin', supersedes: 'pin', operands: [{ id: /** @type {string} */ (record.id), pieces: 'Lid' }], params: { axes: 'xy', deltaMm: 0 } },
      local,
    )
    expect(document.canMove('pin-align', -1)).toEqual({ allowed: false, reason: expect.stringMatching(/uses step \d+'s result/) })
    // The rename itself can move above the pin: nothing between them names a part.
    expect(document.canMove(/** @type {string} */ (record.id), -1).allowed).toBe(true)
  })

  it('refuses a part a Repeat uses, naming the Repeat', () => {
    const document = grouped()
    document.append({ id: 'pin', op: 'primitive.cylinder', name: 'Pin', params: { height: 10, diameter: 3, center: [0, 50, 5] } }, local)
    document.append(
      { id: 'pin-align', op: 'group.align', target: 'pin', supersedes: 'pin', operands: [{ id: 'g', pieces: 'A' }], params: { axes: 'xy', deltaMm: 0 } },
      local,
    )
    document.append({ id: 'rep-1', op: 'pattern.repeat', name: 'Repeat 1', params: { source: 'pin', seed: { id: 'g', pieces: 'A' }, targets: ['B'] } }, local)
    expect(document.brokenSteps()).toEqual([])
    expect(() => document.renamePart('g', 'A', 'Lid', local)).toThrow(/Repeat 1 uses A/)
    expect(() => document.renamePart('g', 'B', 'Lid', local)).toThrow(/Repeat 1 uses B/)
    expect(() => document.renamePart('g', 'C', 'Lid', local)).not.toThrow()
  })
})

describe('renamePart — two copies renaming the same part merge cleanly (TODO/ui-094)', () => {
  /** @param {(document: any) => void} one @param {(document: any) => void} two */
  function bothWays(one, two) {
    const forward = { a: grouped({ replica: 'hhhhhh' }), b: grouped({ replica: 'oooooo' }) }
    one(forward.a)
    two(forward.b)
    forward.a.mergeFrom(forward.b.mergeState(), MERGE)
    const backward = { a: grouped({ replica: 'hhhhhh' }), b: grouped({ replica: 'oooooo' }) }
    one(backward.a)
    two(backward.b)
    backward.b.mergeFrom(backward.a.mergeState(), MERGE)
    expect(partsOf(forward.a)).toEqual(partsOf(backward.b))
    expect(serializeProject(forward.a)).toBe(serializeProject(backward.b))
    return forward.a
  }

  // Concurrent renames both supersede the same terminal, so the merge model (`docs-022`) flags the
  // later row `conflicts with step N` rather than re-parenting it — as it does any two unnamed
  // edits of one body (`setPartHidden`, a move). Same result in both orders; nothing is lost.
  it('the merged log’s first rename wins; the second is flagged as a conflict, the same both ways', () => {
    const merged = bothWays(
      (document) => document.renamePart('g', 'B', 'Lid', local),
      (document) => document.renamePart('g', 'B', 'Top', local),
    )
    const names = partsOf(merged)
    expect(names).toHaveLength(3)
    expect(names[1] === 'Lid' || names[1] === 'Top').toBe(true)
    expect(merged.brokenSteps()).toEqual([expect.objectContaining({ reason: expect.stringMatching(/^conflicts with step \d+ \(Rename B to/) })])
  })

  it('two different parts renamed on each side: one lands, the other is a named conflict to redo', () => {
    const merged = bothWays(
      (document) => document.renamePart('g', 'A', 'Base', local),
      (document) => document.renamePart('g', 'C', 'Cap', local),
    )
    const names = partsOf(merged)
    expect(names.includes('Base') !== names.includes('Cap')).toBe(true)
    expect(merged.brokenSteps()).toHaveLength(1)
  })
})
