// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { boundsOf } from '../core/kernel/group.js'
import { moveToRecord, positionOf, rotateToRecord } from '../core/transform.js'
import { bindParam, defineVariable } from '../core/variables.js'
import { useDocumentStore } from '../stores/document.js'
import { useLibraryDefaultsStore } from '../stores/libraryDefaults.js'
import { useParamCommands } from './useParamCommands.js'

/**
 * One Inspector param edit is **one** Undo step (`TODO/ui-044`).
 *
 * A param edit on a moved or turned body is a rebuilt creation record plus a
 * rotate-back and a move-back (see `useParamCommands.js`'s module doc). Committed
 * as separate appends, that was two or three Undo steps, and one press of Undo
 * left the body at its creation spot with the new params: a state the user never
 * made. These assert what the user sees after one Undo (geometry bounds and
 * volume-bearing size, every body), not how many times something was called.
 */
describe('useParamCommands (TODO/ui-044)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** A Sphere, then a Cylinder dropped away from the origin: `ui-044`'s own step 1. */
  function seed() {
    const doc = useDocumentStore()
    doc.append(
      { id: 'sphere-1', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 30, center: [80, 0, 15] } },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'cylinder-2',
        op: 'primitive.cylinder',
        name: 'Cylinder 1',
        params: { diameter: 40, height: 50, center: [-43, 10, 25], segments: 32 },
      },
      { origin: 'local' }
    )
    return doc
  }

  /**
   * Every body's id and rounded bounds, the whole scene.
   *
   * @param {ReturnType<typeof useDocumentStore>} doc
   */
  function snapshot(doc) {
    return doc.raw
      .bodies()
      .map((body) => ({
        id: body.id,
        bounds: boundsOf(body.geometry).map((corner) => corner.map((mm) => Math.round(mm * 1000) / 1000)),
      }))
  }

  it('a param edit on a moved body is one undo step, and one Undo returns the moved body at its old size', () => {
    const doc = seed()
    doc.append(moveToRecord(doc.raw, 'cylinder-2', [33, 10, 25]), { origin: 'local' })
    const moved = snapshot(doc)

    useParamCommands().setParam('cylinder-2', 'diameter', 12)

    // The edit took, and the body stayed where it had been moved to.
    const [cx, cy, cz] = positionOf(doc.raw, 'cylinder-2')
    expect(cx).toBeCloseTo(33, 6)
    expect(cy).toBeCloseTo(10, 6)
    expect(cz).toBeCloseTo(25, 6)
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Cylinder 1')

    doc.undo()

    expect(snapshot(doc)).toEqual(moved)
    // The move itself is the next step back, not a remainder of the edit.
    expect(doc.raw.pendingUndo()?.label).toBe('Move Cylinder 1')
  })

  it('a param edit on a moved and turned body is one undo step too', () => {
    const doc = seed()
    doc.append(moveToRecord(doc.raw, 'cylinder-2', [33, 10, 25]), { origin: 'local' })
    doc.append(rotateToRecord(doc.raw, 'cylinder-2', [30, 0, 0]), { origin: 'local' })
    const posed = snapshot(doc)
    const posedLabel = doc.raw.pendingUndo()?.label

    useParamCommands().setParam('cylinder-2', 'height', 20)
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Cylinder 1')

    doc.undo()

    expect(snapshot(doc)).toEqual(posed)
    expect(doc.raw.pendingUndo()?.label).toBe(posedLabel)

    // And Redo puts the whole edit back in one press, pose included.
    doc.redo()
    const [cx, cy] = positionOf(doc.raw, 'cylinder-2')
    expect(cx).toBeCloseTo(33, 6)
    expect(cy).toBeCloseTo(10, 6)
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Cylinder 1')
  })

  it('a value the kernel rejects throws and leaves the document and both stacks exactly as they were', () => {
    const doc = seed()
    doc.append(moveToRecord(doc.raw, 'cylinder-2', [33, 10, 25]), { origin: 'local' })
    const before = snapshot(doc)
    const entries = doc.raw.entries.length

    expect(() => useParamCommands().setParam('cylinder-2', 'diameter', 0)).toThrow()

    expect(snapshot(doc)).toEqual(before)
    expect(doc.raw.entries.length).toBe(entries)
    expect(doc.raw.pendingUndo()?.label).toBe('Move Cylinder 1')
  })
})

describe('useParamCommands — composite params and the repair dialog (TODO/ui-052)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const LOCAL = { origin: 'local' }

  /** A Pi 4 and a cube snapped to one of its parts, through the store. */
  function piWithSnap(pieces = 'avjack') {
    const doc = useDocumentStore()
    doc.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } }, LOCAL)
    doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [6, 6, 6], center: [120, 20, 3] } }, LOCAL)
    doc.append(
      {
        id: 'snap-1',
        op: 'group.snap',
        target: 'cube-1',
        operands: [{ id: 'pi-1', pieces }],
        supersedes: 'cube-1',
        params: { axes: 'xy', orientation: 'inside+', deltaMm: 0 },
      },
      LOCAL,
    )
    return doc
  }

  it('a change that breaks nothing commits at once, as one Undo step named for the body', () => {
    const doc = piWithSnap('ethernet')
    const result = useParamCommands().setParam('pi-1', 'model', 5)
    expect(result).toEqual({ committed: true })
    expect(doc.raw.recordOf('pi-1')?.params?.model).toBe(5)
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Raspberry Pi 1')
    doc.undo()
    expect(doc.raw.recordOf('pi-1')?.params?.model).toBe(4)
  })

  it('a change that would break a dependent is held — nothing commits — and the breakages come back', () => {
    const doc = piWithSnap('avjack')
    const version = doc.raw.version
    const result = useParamCommands().setParam('pi-1', 'model', 5)
    expect('needsRepair' in result && result.needsRepair).toBe(true)
    if (!('needsRepair' in result)) return
    expect(result.breakages.map((breakage) => breakage.dependentRecordId)).toEqual(['snap-1'])
    expect(result.edit).toMatchObject({ rootId: 'pi-1', param: 'model', oldValue: 4 })
    expect(doc.raw.recordOf('pi-1')?.params?.model).toBe(4)
    expect(doc.raw.version).toBe(version)
  })

  it('applyRepair commits the edit and every fix as one Undo step', () => {
    const doc = piWithSnap('avjack')
    const commands = useParamCommands()
    const result = commands.setParam('pi-1', 'model', 5)
    if (!('needsRepair' in result)) throw new Error('expected a repair')
    commands.applyRepair(result.edit, result.breakages, { 'snap-1': { kind: 'detach' } })
    expect(doc.raw.recordOf('pi-1')?.params?.model).toBe(5)
    expect(doc.raw.recordOf('snap-1')?.op).toBe('transform.translate')
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Raspberry Pi 1')
    doc.undo()
    expect(doc.raw.recordOf('pi-1')?.params?.model).toBe(4)
    expect(doc.raw.recordOf('snap-1')?.op).toBe('group.snap')
  })

  it('a value outside the schema throws and commits nothing', () => {
    const doc = piWithSnap('ethernet')
    expect(() => useParamCommands().setParam('pi-1', 'model', 9)).toThrow(/9/)
    expect(doc.raw.recordOf('pi-1')?.params?.model).toBe(4)
  })

  it('removing a condition while it is false brings the dependent back as broken, not hidden', () => {
    const doc = piWithSnap('avjack')
    const commands = useParamCommands()
    const held = commands.setParam('pi-1', 'model', 5)
    if (!('needsRepair' in held)) throw new Error('expected a repair')
    commands.applyRepair(held.edit, held.breakages, { 'snap-1': { kind: 'condition', scope: 'body' } })
    expect(doc.bodies.map((body) => body.id)).toEqual(['pi-1'])

    commands.setCondition('cube-1', null)
    expect(doc.bodies.map((body) => body.id)).toEqual(['pi-1', 'cube-1'])
    expect(doc.raw.brokenSteps().map((step) => step.id)).toEqual(['snap-1'])
    expect(doc.raw.pendingUndo()?.label).toBe('Remove condition from Cube 1')
  })

  it('editing a condition to include the current value makes the body active again', () => {
    const doc = piWithSnap('ethernet')
    const commands = useParamCommands()
    const cube = /** @type {any} */ (doc.raw.recordOf('cube-1'))
    doc.revise([{ id: 'cube-1', record: { ...cube, when: { ref: 'pi-1', param: 'model', in: [5] } } }])
    expect(doc.bodies.map((body) => body.id)).toEqual(['pi-1'])
    commands.setCondition('cube-1', { ref: 'pi-1', param: 'model', in: [4, 5] })
    expect(doc.bodies.map((body) => body.id)).toEqual(['pi-1', 'cube-1'])
    expect(doc.raw.pendingUndo()?.label).toBe('Edit condition on Cube 1')
  })
})

describe('useParamCommands — a primitive resize is a replace, so dependents follow (TODO/data-007)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const LOCAL = { origin: 'local' }

  /** A 40 mm cube at the origin and a small cube snapped onto its top. */
  function snappedPair() {
    const doc = useDocumentStore()
    doc.append({ id: 'big', op: 'primitive.cuboid', name: 'Big', params: { size: [40, 40, 40], center: [0, 0, 20] } }, LOCAL)
    doc.append({ id: 'small', op: 'primitive.cuboid', name: 'Small', params: { size: [10, 10, 10], center: [60, 0, 5] } }, LOCAL)
    doc.append(
      {
        id: 'snap-1',
        op: 'group.snap',
        target: 'small',
        operands: [{ id: 'big' }],
        supersedes: 'small',
        params: { axes: 'z', orientation: 'above-outside', deltaMm: 0 },
      },
      LOCAL,
    )
    return doc
  }

  /** @param {ReturnType<typeof useDocumentStore>} doc @param {string} id */
  function boundsById(doc, id) {
    const body = doc.raw.bodies().find((candidate) => candidate.id === id)
    if (body === undefined) throw new Error(`no body ${id}`)
    return boundsOf(body.geometry)
  }

  it('offers the replace path for a primitive', () => {
    snappedPair()
    expect(useParamCommands().canEdit('big')).toMatchObject({ editable: true, path: 'replace' })
  })

  it('a snapped body follows a Size Z change, and one Undo restores both', () => {
    const doc = snappedPair()
    expect(boundsById(doc, 'small')[0][2]).toBeCloseTo(40, 6)

    useParamCommands().setParamComponent('big', 'size', 2, 60)

    expect(boundsById(doc, 'big')[1][2]).toBeCloseTo(50, 6)
    expect(boundsById(doc, 'small')[0][2]).toBeCloseTo(50, 6)
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Big')

    doc.undo()
    expect(boundsById(doc, 'big')[1][2]).toBeCloseTo(40, 6)
    expect(boundsById(doc, 'small')[0][2]).toBeCloseTo(40, 6)
  })

  it('a moved primitive keeps its position through a resize', () => {
    const doc = snappedPair()
    doc.append(moveToRecord(doc.raw, 'big', [10, 20, 20]), LOCAL)
    useParamCommands().setParamComponent('big', 'size', 0, 20)
    const [cx, cy, cz] = positionOf(doc.raw, 'big')
    expect(cx).toBeCloseTo(10, 6)
    expect(cy).toBeCloseTo(20, 6)
    expect(cz).toBeCloseTo(20, 6)
  })

  it('a filleted primitive is editable, and a rim that no longer fits is reported by name', () => {
    const doc = useDocumentStore()
    doc.append({ id: 'cyl', op: 'primitive.cylinder', name: 'Cyl', params: { diameter: 40, height: 20, center: [0, 0, 10], segments: 32 } }, LOCAL)
    doc.append({ id: 'cyl-rim', op: 'modify.filletRim', supersedes: 'cyl', target: 'cyl', params: { radius: 5, orientation: 'z+' } }, LOCAL)
    const commands = useParamCommands()
    expect(commands.canEdit('cyl')).toMatchObject({ editable: true, path: 'replace' })

    commands.setParam('cyl', 'diameter', 50)
    expect(doc.raw.recordOf('cyl')?.params?.diameter).toBe(50)
    expect(doc.raw.recordOf('cyl-rim')?.op).toBe('modify.filletRim')

    expect(() => commands.setParam('cyl', 'diameter', 4)).toThrow(/cyl-rim|Fillet/i)
    expect(doc.raw.recordOf('cyl')?.params?.diameter).toBe(50)
  })
})

/**
 * `TODO/ui-068`: a local Inspector / History param edit on a placed Library part is what the
 * Library remembers for the next drag. This composable is the only boundary the AI and MCP
 * tools do not cross, which is what keeps the memory "what *you* last picked".
 */
describe('useParamCommands remembers the last local part params (TODO/ui-068)', () => {
  beforeEach(() => {
    // The memory is persisted to localStorage; a Node environment has none, so give it a fake.
    const backing = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (/** @type {string} */ key) => backing.get(key) ?? null,
      setItem: (/** @type {string} */ key, /** @type {string} */ value) => void backing.set(key, String(value)),
    })
    setActivePinia(createPinia())
  })

  afterEach(() => vi.unstubAllGlobals())

  function seedBolt() {
    const doc = useDocumentStore()
    doc.append(
      { id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { type: 'hex', spec: 'm10', length: 20, fit: 'loose' } },
      { origin: 'local' }
    )
    return doc
  }

  it('a direct commit remembers the post-edit params', () => {
    seedBolt()
    const library = useLibraryDefaultsStore()
    const commands = useParamCommands()
    expect(commands.setCompositeParams('bolt-1', { type: 'socket', spec: 'm2.5', length: 8 })).toEqual({ committed: true })
    expect(library.remembered['hardware.bolt']).toMatchObject({ type: 'socket', spec: 'm2.5', length: 8 })
  })

  it('a single-field setParam remembers too', () => {
    seedBolt()
    useParamCommands().setParam('bolt-1', 'length', 33)
    expect(useLibraryDefaultsStore().remembered['hardware.bolt']).toMatchObject({ length: 33 })
  })

  /** A Pi 4 with a cube snapped to its AV jack: a Pi 5 has none, so a model change needs repair. */
  function piWithSnap() {
    const doc = useDocumentStore()
    const local = { origin: 'local' }
    doc.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } }, local)
    doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [6, 6, 6], center: [120, 20, 3] } }, local)
    doc.append(
      {
        id: 'snap-1',
        op: 'group.snap',
        target: 'cube-1',
        operands: [{ id: 'pi-1', pieces: 'avjack' }],
        supersedes: 'cube-1',
        params: { axes: 'xy', orientation: 'inside+', deltaMm: 0 },
      },
      local
    )
    return doc
  }

  it('a needsRepair result remembers nothing, and an applied repair remembers once', () => {
    piWithSnap()
    const library = useLibraryDefaultsStore()
    const commands = useParamCommands()
    const result = commands.setParam('pi-1', 'model', 5)
    if (!('needsRepair' in result)) throw new Error('expected a repair')
    expect(library.remembered['raspberrypi.bplus']).toBeUndefined()

    commands.applyRepair(result.edit, result.breakages, { 'snap-1': { kind: 'detach' } })
    expect(library.remembered['raspberrypi.bplus']).toEqual({ model: 5 })
  })

  it('a primitive resize is never remembered', () => {
    seedBolt()
    const doc = useDocumentStore()
    doc.append({ id: 'cube-9', op: 'primitive.cuboid', name: 'Cube 9', params: { size: [5, 5, 5], center: [0, 0, 0] } }, { origin: 'local' })
    useParamCommands().setParam('cube-9', 'size', [50, 50, 50])
    expect(useLibraryDefaultsStore().remembered).toEqual({})
  })

  it('adds no document record and exactly one Undo step per edit', () => {
    const doc = seedBolt()
    const before = doc.raw.entries.length
    useParamCommands().setCompositeParams('bolt-1', { length: 9 })
    expect(doc.raw.entries.length).toBe(before)
    expect(doc.raw.pendingUndo()?.label).toBe('Edit Bolt 1')
    doc.undo()
    expect(doc.raw.recordOf('bolt-1')?.params?.length).toBe(20)
    // Undo does not roll the memory back.
    expect(useLibraryDefaultsStore().remembered['hardware.bolt']).toMatchObject({ length: 9 })
  })

  it('a variable-bound length is remembered as its resolved value', () => {
    const doc = seedBolt()
    defineVariable(doc.raw, { name: 'len', kind: 'number', value: 14, unit: 'mm' }, { origin: 'local' })
    bindParam(doc.raw, 'bolt-1', 'length', 'len', { origin: 'local' })
    doc.refresh()
    useParamCommands().setCompositeParams('bolt-1', { spec: 'm12' })
    expect(useLibraryDefaultsStore().remembered['hardware.bolt']?.length).toBe(14)
  })
})
