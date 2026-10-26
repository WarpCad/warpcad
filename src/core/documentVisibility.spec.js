// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { viewKey } from './visibility.js'

/**
 * `TODO/ui-089`: Hide / Show on the document. A view setting, not a modelling step: a `local`
 * change that bumps the version and is never an undo step (`setBuildVolume`'s rule), stamped per
 * body and per part so a merge keeps both sides' switches. Real kernel throughout.
 */

const local = { origin: 'local' }

const cube = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 90, 40], center: [0, 0, 20] } }
const cylinder = { id: 'cyl-1', op: 'primitive.cuboid', name: 'Cylinder 1', params: { size: [10, 10, 10], center: [60, 0, 5] } }
/** @param {string} id @param {number} offsetMm @param {string[]} names */
const split = (id, offsetMm, names) => ({
  id,
  op: 'modify.splitWithJoint',
  target: 'cube-1',
  supersedes: 'cube-1',
  params: { axis: 'y', offsetMm, joint: 'none', clearanceMm: 0.2, names },
})

/** @param {string} [replica] */
function splitDocument(replica) {
  return createDocument({
    ...(replica === undefined ? {} : { replica }),
    actions: [structuredClone(cube), split('cube-1-split', 45, ['Cube 1 A', 'Cube 1 B']), structuredClone(cylinder)],
  })
}

/** @param {any} document */
const visibilityOf = (document) =>
  Object.fromEntries(
    document.bodies().map((/** @type {any} */ body) => [body.id, { body: body.viewHidden === true, parts: body.viewHiddenParts ?? [] }])
  )

describe('setViewHidden / showAll — a view setting, not an undo step', () => {
  it('bumps the version, pushes no undo step, and Undo afterwards undoes the last modelling change', () => {
    const document = splitDocument()
    document.append({ id: 'move', op: 'transform.translate', target: 'cyl-1', supersedes: 'cyl-1', params: { vector: [5, 0, 0], rotation: [0, 0, 0] } }, local)
    const undoLabel = document.pendingUndo()?.label
    const version = document.version
    document.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true }, local)
    expect(document.version).toBe(version + 1)
    expect(document.pendingUndo()?.label).toBe(undoLabel)
    expect(document.canRedo()).toBe(false)

    const undone = document.undo()
    expect(undone?.records.map((record) => record.id)).toEqual(['move'])
    // The hide is untouched by the Undo, and the same tap shows it again.
    expect(visibilityOf(document)['cube-1']).toEqual({ body: false, parts: ['Cube 1 A'] })
    document.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: false }, local)
    expect(visibilityOf(document)['cube-1']).toEqual({ body: false, parts: [] })
    expect(document.canRedo()).toBe(true)
  })

  it('setting what is already set changes nothing, not even the version', () => {
    const document = splitDocument()
    const version = document.version
    document.setViewHidden('cyl-1', { hidden: false }, local)
    document.showAll(local)
    expect(document.version).toBe(version)
    document.setViewHidden('cyl-1', { hidden: true }, local)
    document.setViewHidden('cyl-1', { hidden: true }, local)
    expect(document.version).toBe(version + 1)
  })

  it('is origin-tagged like every mutation, and refuses what it cannot address, by name', () => {
    const document = splitDocument()
    expect(() => document.setViewHidden('cube-1', { hidden: true }, /** @type {any} */ ({}))).toThrow(/origin/)
    expect(() => document.showAll(/** @type {any} */ ({}))).toThrow(/origin/)
    expect(() => document.setViewHidden('ghost', { hidden: true }, local)).toThrow(/setViewHidden: no body "ghost"/)
    expect(() => document.setViewHidden('cube-1', /** @type {any} */ ({ hidden: 'yes' }), local)).toThrow(/`hidden` must be true or false/)
    expect(() => document.setViewHidden('cube-1', { subPart: '', hidden: true }, local)).toThrow(/`subPart`/)
  })

  it('a terminal record id addresses its body: the hide is keyed by the lineage root', () => {
    const document = splitDocument()
    document.setViewHidden('cube-1-split', { hidden: true }, local)
    expect(visibilityOf(document)['cube-1']).toEqual({ body: true, parts: [] })
  })

  it('showAll clears every body and part hide in one change', () => {
    const document = splitDocument()
    document.setViewHidden('cube-1', { subPart: 'Cube 1 B', hidden: true }, local)
    document.setViewHidden('cube-1', { hidden: true }, local)
    document.setViewHidden('cyl-1', { hidden: true }, local)
    const version = document.version
    document.showAll(local)
    expect(document.version).toBe(version + 1)
    expect(visibilityOf(document)).toEqual({ 'cube-1': { body: false, parts: [] }, 'cyl-1': { body: false, parts: [] } })
    expect(document.canUndo()).toBe(false)
  })
})

describe('bodies() reports visibility (rule 3, rule 7)', () => {
  it('a body that was never hidden carries neither field', () => {
    for (const body of splitDocument().bodies()) {
      expect(body).not.toHaveProperty('viewHidden')
      expect(body).not.toHaveProperty('viewHiddenParts')
    }
  })

  it('body and part are independent switches', () => {
    const document = splitDocument()
    document.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true }, local)
    document.setViewHidden('cube-1', { hidden: true }, local)
    expect(visibilityOf(document)['cube-1']).toEqual({ body: true, parts: ['Cube 1 A'] })
    document.setViewHidden('cube-1', { hidden: false }, local)
    expect(visibilityOf(document)['cube-1']).toEqual({ body: false, parts: ['Cube 1 A'] })
  })

  it('a split keeps the body hidden (same id via supersedes), and a stale part name is ignored', () => {
    const document = createDocument({ actions: [structuredClone(cube), structuredClone(cylinder)] })
    document.setViewHidden('cube-1', { hidden: true }, local)
    document.setViewHidden('cube-1', { subPart: 'Cube 1 B', hidden: true }, local)
    // Before the split the cube has no parts, so the part switch reports nothing yet.
    expect(visibilityOf(document)['cube-1']).toEqual({ body: true, parts: [] })
    document.append(split('cube-1-split', 45, ['Cube 1 A', 'Cube 1 B']), local)
    expect(visibilityOf(document)['cube-1']).toEqual({ body: true, parts: ['Cube 1 B'] })
  })

  it('a re-split keeps the hide of a piece that is still there', () => {
    const document = splitDocument()
    document.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true }, local)
    document.append({ ...split('cube-1-split-2', 70, ['Cube 1 B', 'Cube 1 C']), target: 'cube-1-split', supersedes: 'cube-1-split' }, local)
    expect(visibilityOf(document)['cube-1']).toEqual({ body: false, parts: ['Cube 1 A'] })
  })

  it('a body an operation makes from hidden inputs is new, so it is shown', () => {
    const document = createDocument({ actions: [structuredClone(cube), structuredClone(cylinder)] })
    document.setViewHidden('cube-1', { hidden: true }, local)
    document.setViewHidden('cyl-1', { hidden: true }, local)
    document.append({ id: 'union', op: 'boolean.union', name: 'Union 1', target: 'cube-1', operands: ['cyl-1'], consumes: ['cube-1', 'cyl-1'] }, local)
    expect(visibilityOf(document)).toEqual({ union: { body: false, parts: [] } })
  })
})

describe('visibility in the merge state', () => {
  it('a hide is one stamped switch and nothing else: no row, no register', () => {
    const document = splitDocument('hhhhhh')
    const before = document.mergeState()
    document.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true }, local)
    const after = document.mergeState()
    const written = after.viewHidden.get(viewKey('cube-1', 'Cube 1 A'))
    expect(written?.[0]).toBe(true)
    expect(written?.[1].replica).toBe('hhhhhh')
    expect(after.registers).toEqual(before.registers)
    expect([...after.entries.values()].map((entry) => entry.rec)).toEqual([...before.entries.values()].map((entry) => entry.rec))
    document.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: false }, local)
    const shown = document.mergeState().viewHidden.get(viewKey('cube-1', 'Cube 1 A'))
    expect(shown?.[0]).toBe(false)
    expect(shown?.[1].counter).toBeGreaterThan(/** @type {any} */ (written)[1].counter)
  })

  it('showAll stamps every switch it clears with one stamp', () => {
    const document = splitDocument()
    document.setViewHidden('cube-1', { hidden: true }, local)
    document.setViewHidden('cyl-1', { hidden: true }, local)
    document.showAll(local)
    const switches = [...document.mergeState().viewHidden.values()]
    expect(switches.map(([hidden]) => hidden)).toEqual([false, false])
    expect(switches[0][1]).toEqual(switches[1][1])
  })

  it('two copies hiding different parts both keep their hide after merging, either way round', () => {
    const human = splitDocument('hhhhhh')
    const other = splitDocument('oooooo')
    human.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true }, local)
    other.setViewHidden('cyl-1', { hidden: true }, local)
    const humanState = human.mergeState()
    human.mergeFrom(other.mergeState(), { origin: 'merge' })
    other.mergeFrom(humanState, { origin: 'merge' })
    const expected = { 'cube-1': { body: false, parts: ['Cube 1 A'] }, 'cyl-1': { body: true, parts: [] } }
    expect(visibilityOf(human)).toEqual(expected)
    expect(visibilityOf(other)).toEqual(expected)
  })

  it('a hide and a show of the same part on two copies: the later one wins on both', () => {
    const human = splitDocument('hhhhhh')
    const other = splitDocument('oooooo')
    human.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true }, local)
    other.observeMergeClock(human.mergeClock())
    other.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true }, local)
    other.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: false }, local)
    const humanState = human.mergeState()
    human.mergeFrom(other.mergeState(), { origin: 'merge' })
    other.mergeFrom(humanState, { origin: 'merge' })
    expect(visibilityOf(human)['cube-1']).toEqual({ body: false, parts: [] })
    expect(visibilityOf(other)['cube-1']).toEqual({ body: false, parts: [] })
  })

  it('an AI turn that never touched visibility leaves the user\'s hides alone, including ones made during the turn', () => {
    const live = splitDocument('hhhhhh')
    live.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: true }, local)
    live.ensureProjectId()
    // The fork the agent builds (`src/ai/agent.js`): seeded by merge, not by load.
    const fork = createDocument({ replica: 'aaaaaa', resolution: live.resolution() })
    fork.mergeFrom(live.mergeState(), { origin: 'merge' })
    fork.observeMergeClock(live.mergeClock())
    fork.append({ id: 'ai-box', op: 'primitive.cuboid', name: 'Box 1', params: { size: [5, 5, 5], center: [0, 60, 2.5] } }, { origin: 'ai' })
    // Meanwhile the user shows A and hides the cylinder.
    live.setViewHidden('cube-1', { subPart: 'Cube 1 A', hidden: false }, local)
    live.setViewHidden('cyl-1', { hidden: true }, local)
    live.mergeFrom(fork.mergeState(), { origin: 'ai' })
    expect(visibilityOf(live)).toEqual({
      'cube-1': { body: false, parts: [] },
      'cyl-1': { body: true, parts: [] },
      'ai-box': { body: false, parts: [] },
    })
  })
})

describe('loadEntries', () => {
  it('takes the loaded project\'s hides, and a load without any shows everything', () => {
    const source = splitDocument()
    const document = createDocument()
    document.loadEntries(source.entries, null, source.resolution(), { viewHidden: { 'cyl-1': { body: true }, ghost: { body: true } } })
    expect(visibilityOf(document)['cyl-1']).toEqual({ body: true, parts: [] })
    expect(document.viewHidden()).toEqual({ 'cyl-1': { body: true } })
    document.loadEntries(source.entries, null, source.resolution())
    expect(visibilityOf(document)['cyl-1']).toEqual({ body: false, parts: [] })
    expect(document.viewHidden()).toBeNull()
  })
})
