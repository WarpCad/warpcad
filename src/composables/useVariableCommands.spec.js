// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { translateRecord } from '../core/transform.js'
import { VariableError, VariableInUseError } from '../core/variables.js'
import { useDocumentStore } from '../stores/document.js'
import { useSelectionStore } from '../stores/selection.js'
import { useParamCommands } from './useParamCommands.js'
import { useVariableCommands } from './useVariableCommands.js'

/**
 * `TODO/ui-059`: the thin command layer. What is asserted is what a person sees after one
 * Undo and what core refused with — never how many times something was called.
 */

/** @type {any} */
const PI_MODEL = {
  name: 'piModel',
  kind: 'enum',
  value: 4,
  label: 'Pi model',
  options: [
    { value: 4, label: 'Pi 4' },
    { value: 5, label: 'Pi 5' },
  ],
}

describe('useVariableCommands (TODO/ui-059)', () => {
  /** @type {ReturnType<typeof useDocumentStore>} */
  let doc
  /** @type {ReturnType<typeof useVariableCommands>} */
  let commands

  beforeEach(() => {
    setActivePinia(createPinia())
    doc = useDocumentStore()
    commands = useVariableCommands()
    doc.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } }, { origin: 'local' })
    doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [60, 0, 5] } }, { origin: 'local' })
  })

  it('define lists the variable, with nothing reading it yet', () => {
    commands.define(PI_MODEL)
    const rows = commands.list()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ parameters: 0, parts: 0, valueLabel: 'Pi 4' })
  })

  it('create-and-bind is one local Undo step, and Undo takes the variable and the binding back', () => {
    const depth = doc.raw.canUndo()
    commands.bindToNew('pi-1', 'model', PI_MODEL)
    expect(doc.raw.recordOf('pi-1')?.params?.model).toEqual({ $var: 'piModel' })
    expect(commands.list()[0].parameters).toBe(1)
    expect(doc.undo().ok).toBe(true)
    expect(doc.raw.recordOf('pi-1')?.params?.model).toBe(4)
    expect(commands.list()).toEqual([])
    expect(doc.raw.canUndo()).toBe(depth)
  })

  /** @type {any} */
  const WALL = { name: 'wall', kind: 'number', value: 8, unit: 'mm', min: 1, max: 40 }

  it('set changes every bound param in one step and returns the blast-radius line', () => {
    commands.define(WALL)
    commands.bind('cube-1', 'size.0', 'wall')
    commands.bind('cube-1', 'size.1', 'wall')
    const before = commands.list()[0]
    expect(before).toMatchObject({ parameters: 2, parts: 1 })

    const result = commands.set('wall', 12)
    expect(result).toEqual({ committed: true, summary: 'wall 8 mm → 12 mm — 2 parameters on 1 part changed' })
    const bounds = /** @type {[number[], number[]]} */ (doc.bodies.find((body) => body.id === 'cube-1')?.bounds)
    expect(bounds[1][0] - bounds[0][0]).toBeCloseTo(12, 6)
    expect(bounds[1][1] - bounds[0][1]).toBeCloseTo(12, 6)

    doc.undo()
    const undone = /** @type {[number[], number[]]} */ (doc.bodies.find((body) => body.id === 'cube-1')?.bounds)
    expect(undone[1][0] - undone[0][0]).toBeCloseTo(8, 6)
    expect(commands.list()[0].variable.value).toBe(8)
  })

  it("set refuses a value outside the variable's own range with core's reason, changing nothing", () => {
    commands.define(WALL)
    expect(() => commands.set('wall', 100)).toThrow(VariableError)
    expect(commands.list()[0].variable.value).toBe(8)
  })

  it('a value that would break a dependent is held, not committed, for the repair dialog', () => {
    commands.bindToNew('pi-1', 'model', PI_MODEL)
    doc.append(
      {
        id: 'snap-1',
        op: 'group.snap',
        target: 'cube-1',
        operands: [{ id: 'pi-1', pieces: 'avjack' }],
        supersedes: 'cube-1',
        params: { axes: 'z', orientation: 'outside+', deltaMm: 0 },
      },
      { origin: 'local' },
    )
    const result = commands.set('piModel', 5)
    expect('needsRepair' in result).toBe(true)
    if (!('needsRepair' in result)) return
    expect(result.breakages.map((breakage) => breakage.dependentRecordId)).toEqual(['snap-1'])
    expect(result.edit).toMatchObject({ variable: 'piModel', param: null, oldValue: 4 })
    expect(result.summary).toMatch(/piModel 4 → 5/)
    // Nothing committed yet.
    expect(commands.list()[0].variable.value).toBe(4)
  })

  it('applyRepair commits the value and the fix as one step, and announces the blast radius', () => {
    commands.bindToNew('pi-1', 'model', PI_MODEL)
    doc.append(
      {
        id: 'snap-1',
        op: 'group.snap',
        target: 'cube-1',
        operands: [{ id: 'pi-1', pieces: 'avjack' }],
        supersedes: 'cube-1',
        params: { axes: 'z', orientation: 'outside+', deltaMm: 0 },
      },
      { origin: 'local' },
    )
    const result = commands.set('piModel', 5)
    if (!('needsRepair' in result)) throw new Error('expected a held edit')
    commands.applyRepair(result.edit, result.breakages, { 'snap-1': { kind: 'condition', scope: 'body' } })
    expect(commands.list()[0].variable.value).toBe(5)
    expect(/** @type {any} */ (doc.raw.recordOf('cube-1')).when).toEqual({ var: 'piModel', in: [4] })
    doc.undo()
    expect(commands.list()[0].variable.value).toBe(4)
    expect(/** @type {any} */ (doc.raw.recordOf('cube-1')).when).toBeUndefined()
  })

  it("an unbindable row's reason comes back verbatim from core", () => {
    commands.define(WALL)
    doc.append(
      { id: 'rot-1', op: 'transform.rotate', target: 'cube-1', supersedes: 'cube-1', params: { angles: [0, 0, 90], center: [0, 0, 0], rotation: [0, 0, 90] } },
      { origin: 'local' },
    )
    expect(() => commands.bind('rot-1', 'angles.0', 'wall')).toThrow(/rotations are not bindable/)
  })

  it('rename rewrites the bindings with it, in one Undo step', () => {
    commands.bindToNew('pi-1', 'model', PI_MODEL)
    commands.rename('piModel', 'board')
    expect(doc.raw.recordOf('pi-1')?.params?.model).toEqual({ $var: 'board' })
    doc.undo()
    expect(doc.raw.recordOf('pi-1')?.params?.model).toEqual({ $var: 'piModel' })
    expect(commands.list()[0].variable.name).toBe('piModel')
  })

  it('delete of a variable in use is refused with its consumers; keepValues rewrites them to the literal', () => {
    commands.define(WALL)
    commands.bind('cube-1', 'size.0', 'wall')
    let thrown
    try {
      commands.remove('wall')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(VariableInUseError)
    expect(/** @type {any} */ (thrown).consumers.map((/** @type {any} */ consumer) => consumer.name)).toEqual(['Cube 1'])
    expect(commands.list()).toHaveLength(1)

    commands.remove('wall', { keepValues: true })
    expect(commands.list()).toEqual([])
    expect(doc.raw.recordOf('cube-1')?.params?.size).toEqual([8, 10, 10])
    doc.undo()
    expect(commands.list()).toHaveLength(1)
    expect(doc.raw.recordOf('cube-1')?.params?.size?.[0]).toEqual({ $var: 'wall' })
  })

  it('an unused variable deletes at once, and Undo brings it back', () => {
    commands.define(WALL)
    commands.remove('wall')
    expect(commands.list()).toEqual([])
    doc.undo()
    expect(commands.list()).toHaveLength(1)
  })

  it('unbind rewrites the field to its current literal — nothing jumps', () => {
    commands.define(WALL)
    commands.bind('cube-1', 'size.2', 'wall')
    commands.unbind('cube-1', 'size.2')
    expect(doc.raw.recordOf('cube-1')?.params?.size).toEqual([10, 10, 8])
  })

  it('a variable condition is a { var, in } on the row, and removing it is one step', () => {
    commands.bindToNew('pi-1', 'model', PI_MODEL)
    commands.setVariableCondition('cube-1', 'piModel', [4])
    expect(doc.raw.conditionOf('cube-1')).toMatchObject({ var: 'piModel', values: [4], refId: '' })
    // At Pi 5 the cube is switched off: not in the scene, listed as inactive.
    commands.set('piModel', 5)
    expect(doc.bodies.map((body) => body.id)).not.toContain('cube-1')
    expect(doc.inactiveBodies.map((body) => body.id)).toContain('cube-1')
    doc.undo()
    expect(doc.bodies.map((body) => body.id)).toContain('cube-1')
  })

  it('records the local origin and restores the selection on Undo', () => {
    const selection = useSelectionStore()
    selection.select('cube-1')
    commands.define(WALL)
    commands.bind('cube-1', 'size.0', 'wall')
    selection.clear()
    doc.undo()
    expect(selection.ids).toEqual(['cube-1'])
  })
})

/**
 * `TODO/FIND-core-078`: formulas from the panel — the Documentation example, through the same
 * store a person's taps go through, with the real kernel folding the cubes.
 */
describe('useVariableCommands — formulas (TODO/FIND-core-078)', () => {
  /** @type {ReturnType<typeof useDocumentStore>} */
  let doc
  /** @type {ReturnType<typeof useVariableCommands>} */
  let commands

  /** @param {string} id */
  const widthOf = (id) => {
    const bounds = /** @type {[number[], number[]]} */ (doc.bodies.find((body) => body.id === id)?.bounds)
    return bounds[1][0] - bounds[0][0]
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    doc = useDocumentStore()
    commands = useVariableCommands()
    doc.append({ id: 'base-1', op: 'primitive.cuboid', name: 'Base', params: { size: [60, 20, 10], center: [0, 0, 5] } }, { origin: 'local' })
    doc.append({ id: 'lid-1', op: 'primitive.cuboid', name: 'Lid', params: { size: [40, 20, 10], center: [0, 40, 5] } }, { origin: 'local' })
    doc.append({ id: 'c-1', op: 'primitive.cuboid', name: 'Cube 3', params: { size: [10, 10, 10], center: [0, 80, 5] } }, { origin: 'local' })
  })

  it('previews a value, an error with its position, and nothing for an empty box', () => {
    expect(commands.previewFormula('Base.width - (Lid.width / 2)')).toEqual({ value: 40 })
    const error = /** @type {{ error: string }} */ (commands.previewFormula('Base.width - (Lid.width / 2'))
    expect(error.error).toMatch(/at character 28/)
    expect(commands.previewFormula('   ')).toBeNull()
    expect(commands.previewFormula('Nobody.width')).toEqual({ error: expect.stringMatching(/no body named Nobody/) })
  })

  it('previews nothing into the document: no step, no Undo', () => {
    const depth = doc.raw.canUndo()
    const length = doc.raw.entries.length
    commands.previewFormula('Base.width * 2')
    expect(doc.raw.entries.length).toBe(length)
    expect(doc.raw.canUndo()).toBe(depth)
  })

  it('an edit preview names a loop the save would refuse', () => {
    commands.defineFormula({ name: 'overhang', formula: 'Base.width - (Lid.width / 2)', unit: 'mm' })
    expect(commands.previewFormula('overhang + 1', 'overhang')).toEqual({ error: expect.stringMatching(/circle/) })
  })

  it('the Documentation example: create, bind, change Base, one Undo', () => {
    commands.defineFormula({ name: 'overhang', formula: 'Base.width - (Lid.width / 2)', unit: 'mm' })
    const row = commands.list().find((candidate) => candidate.variable.name === 'overhang')
    // Shown by name, in the printer's canonical form (brackets that change nothing are dropped);
    // stored by id.
    expect(row).toMatchObject({ valueLabel: '40 mm', formula: 'Base.width - Lid.width / 2', parameters: 0 })
    expect(doc.raw.recordOf(/** @type {string} */ (row?.variable.id))?.params?.formula).toBe('#base-1.width - #lid-1.width / 2')

    commands.bind('c-1', 'size.0', 'overhang')
    expect(widthOf('c-1')).toBeCloseTo(40, 6)
    expect(commands.list()[0]).toMatchObject({ parameters: 1, parts: 1 })

    const before = commands.formulaValues()
    useParamCommands().setParamComponent('base-1', 'size', 0, 80)
    expect(widthOf('c-1')).toBeCloseTo(60, 6)
    expect(commands.formulaChanges(before)).toEqual(['overhang 40 mm → 60 mm — 1 parameter on 1 part changed'])

    expect(doc.undo().ok).toBe(true)
    expect(widthOf('c-1')).toBeCloseTo(40, 6)
    expect(widthOf('base-1')).toBeCloseTo(60, 6)
  })

  it('create, edit, rename and delete are one Undo step each', () => {
    commands.defineFormula({ name: 'half', formula: 'Base.width / 2', unit: 'mm' })
    commands.bind('c-1', 'size.0', 'half')
    const steps = doc.raw.canUndo()

    const set = commands.setFormula('half', 'Base.width / 3')
    expect(set).toEqual({ committed: true, summary: 'half 30 mm → 20 mm — 1 parameter on 1 part changed' })
    expect(widthOf('c-1')).toBeCloseTo(20, 6)
    doc.undo()
    expect(widthOf('c-1')).toBeCloseTo(30, 6)
    expect(doc.raw.canUndo()).toBe(steps)

    commands.rename('half', 'halfBase')
    expect(doc.raw.recordOf('c-1')?.params?.size?.[0]).toEqual({ $var: 'halfBase' })
    doc.undo()
    expect(doc.raw.recordOf('c-1')?.params?.size?.[0]).toEqual({ $var: 'half' })

    commands.remove('half', { keepValues: true })
    expect(commands.list()).toEqual([])
    expect(doc.raw.recordOf('c-1')?.params?.size?.[0]).toBe(30)
    doc.undo()
    expect(commands.list()).toHaveLength(1)
  })

  it('a formula edit that would break a dependent is held for the repair dialog, nothing written', () => {
    commands.defineFormula({ name: 'half', formula: 'Base.width / 2', unit: 'mm' })
    commands.bind('c-1', 'size.0', 'half')
    const length = doc.raw.entries.length
    const result = commands.setFormula('half', 'Base.width - 100')
    expect(result).toMatchObject({ needsRepair: true, edit: { variable: 'half' } })
    expect('breakages' in result && result.breakages.length).toBeGreaterThan(0)
    expect(doc.raw.entries.length).toBe(length)
    expect(doc.raw.recordOf('c-1')?.params?.size?.[0]).toEqual({ $var: 'half' })
  })

  it('setFormula on a value variable is core\'s refusal, by name', () => {
    commands.define({ name: 'wall', kind: 'number', value: 2, unit: 'mm' })
    expect(() => commands.setFormula('wall', '3')).toThrow(VariableError)
  })

  it('New formula from this value… creates and binds in one step, changing nothing on screen', () => {
    const steps = doc.raw.canUndo()
    commands.bindToNewFormula('c-1', 'size.0', { name: 'cWidth', formula: '10', unit: 'mm' })
    expect(doc.raw.recordOf('c-1')?.params?.size?.[0]).toEqual({ $var: 'cWidth' })
    expect(widthOf('c-1')).toBeCloseTo(10, 6)
    doc.undo()
    expect(doc.raw.recordOf('c-1')?.params?.size?.[0]).toBe(10)
    expect(commands.list()).toEqual([])
    expect(doc.raw.canUndo()).toBe(steps)
  })

  it('a value variable read by a formula counts what the formula feeds, not the formula itself', () => {
    commands.define({ name: 'wall', kind: 'number', value: 2, unit: 'mm' })
    commands.defineFormula({ name: 'inner', formula: 'Base.width - 2 * wall', unit: 'mm' })
    commands.bind('c-1', 'size.0', 'inner')
    const wall = commands.list().find((row) => row.variable.name === 'wall')
    expect(wall).toMatchObject({ parameters: 1, parts: 1 })
    expect(commands.set('wall', 3)).toEqual({ committed: true, summary: 'wall 2 mm → 3 mm — 1 parameter on 1 part changed' })
  })

  it('a reading taken before a later move carries the note on its chip; an unaffected one does not', () => {
    commands.defineFormula({ name: 'baseTop', formula: 'Base.max.z', unit: 'mm' })
    commands.defineFormula({ name: 'baseW', formula: 'Base.width', unit: 'mm' })
    commands.bind('c-1', 'size.2', 'baseTop')
    commands.bind('c-1', 'size.1', 'baseW')
    expect(commands.variesNoteOf('c-1', 'size.2')).toBe('')
    doc.raw.append(translateRecord(doc.raw, 'base-1', [0, 0, 5]), { origin: 'local' })
    doc.refresh()
    expect(commands.variesNoteOf('c-1', 'size.2')).toMatch(/^Reads Base before step \d+/)
    expect(commands.variesNoteOf('c-1', 'size.1')).toBe('')
  })

  it('a formula with an error lists with a dash and the reason, never "undefined"', () => {
    commands.defineFormula({ name: 'lidW', formula: 'Lid.width', unit: 'mm' })
    commands.bind('c-1', 'size.0', 'lidW')
    doc.deleteBodies(['lid-1'])
    const row = commands.list().find((candidate) => candidate.variable.name === 'lidW')
    expect(row?.valueLabel).toBe('—')
    expect(row?.variable.error).toMatch(/Lid|deleted|lid-1/)
  })
})
