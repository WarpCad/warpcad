// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LOCAL, centreOf, piAndCube, piWith, snapCubeTo, snapPiBy, subtractAvjackClearance } from './__fixtures__/piScenes.js'
import { impactOf, variableImpactOf } from './dependents.js'
import { bindParamToNewVariable, setVariableRevision } from './variables.js'
import { serializeProject } from './project.js'
import { defaultFixOf, offeredFixesOf, repairChanges } from './repair.js'
import { recordLinesOf } from './__fixtures__/projectText.js'

/**
 * `TODO/ui-052`'s repair step: the fixes chosen in the dialog, turned into one revision.
 */

/**
 * The dialog's inputs for "change the Pi to `model`".
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {number} model
 */
function editTo(document, model) {
  const record = piWith(document, { model })
  const edit = { rootId: 'pi-1', record, param: 'model', oldValue: document.recordOf('pi-1')?.params?.model }
  const { breakages } = impactOf(document, [{ id: 'pi-1', record }], { editedRootId: 'pi-1' })
  return { edit, breakages }
}

describe('offered and default fixes', () => {
  it('a snap offers Only when (enum change), Remap, Detach and Leave broken; defaults to Leave broken with no suggestion', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const { breakages } = editTo(document, 5)
    expect(offeredFixesOf(breakages[0], { enumParam: true })).toEqual(['condition', 'remap', 'detach', 'leave'])
    expect(offeredFixesOf(breakages[0], { enumParam: false })).toEqual(['remap', 'detach', 'leave'])
    expect(defaultFixOf(breakages[0])).toEqual({ kind: 'leave' })
  })

  it('defaults to the suggested Remap when there is one', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'camera')
    const { breakages } = editTo(document, 5)
    expect(defaultFixOf(breakages[0])).toEqual({ kind: 'remap', pieces: { camera: 'camera0' } })
  })

  it('a boolean operand never offers Detach — there is no "keep where it is" for a cut', () => {
    const document = subtractAvjackClearance(piAndCube({ model: 4 }))
    const { breakages } = editTo(document, 5)
    expect(offeredFixesOf(breakages[0], { enumParam: true })).toEqual(['condition', 'remap', 'leave'])
  })

  it('a kernel failure with no missing part offers neither Remap nor Detach', () => {
    const breakage = /** @type {any} */ ({ missingPieces: [], placement: false, suggestions: {} })
    expect(offeredFixesOf(breakage, { enumParam: false })).toEqual(['leave'])
  })
})

describe('repairChanges — one revision for the edit and every chosen fix', () => {
  it('Detach leaves the dependent exactly where it was, and the Pi becomes a Pi 5', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const before = centreOf(document, 'cube-1')
    const { edit, breakages } = editTo(document, 5)

    const changes = repairChanges(document, edit, breakages, { 'snap-1': { kind: 'detach' } })
    document.reviseRecords(changes, LOCAL)

    const after = centreOf(document, 'cube-1')
    for (let axis = 0; axis < 3; axis += 1) expect(after[axis]).toBeCloseTo(before[axis], 6)
    expect(document.recordOf('pi-1')?.params?.model).toBe(5)
    const detached = /** @type {any} */ (document.recordOf('snap-1'))
    expect(detached.op).toBe('transform.translate')
    expect(detached.operands).toBeUndefined()
    expect(detached.supersedes).toBe('cube-1')
    expect(document.brokenSteps()).toEqual([])
  })

  it('Remap rewrites only the named piece and leaves everything else in the record alone', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack,usb1')
    const original = /** @type {any} */ (document.recordOf('snap-1'))
    const { edit, breakages } = editTo(document, 5)

    const changes = repairChanges(document, edit, breakages, { 'snap-1': { kind: 'remap', pieces: { avjack: 'usbc' } } })
    const remapped = /** @type {any} */ (changes.find((change) => change.id === 'snap-1')?.record)
    expect(remapped.operands).toEqual([{ id: original.operands[0].id, pieces: 'usbc,usb1' }])
    const { operands: _a, ...rest } = remapped
    const { operands: _b, ...originalRest } = original
    expect(rest).toEqual(originalRest)

    document.reviseRecords(changes, LOCAL)
    expect(document.brokenSteps()).toEqual([])
  })

  it('Only when (whole body) conditions the dependent body\'s creation record on the OLD value', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const { edit, breakages } = editTo(document, 5)
    const changes = repairChanges(document, edit, breakages, { 'snap-1': { kind: 'condition', scope: 'body' } })
    expect(changes.find((change) => change.id === 'cube-1')?.record?.when).toEqual({ ref: 'pi-1', param: 'model', in: [4] })
    document.reviseRecords(changes, LOCAL)
    expect(document.bodies().map((body) => body.id)).not.toContain('cube-1')
    expect(document.brokenSteps()).toEqual([])
  })

  it('Only when on the edited body\'s OWN row never conditions the body on itself — it falls back to this operation', () => {
    const document = snapPiBy(piAndCube({ model: 4 }), 'avjack')
    const { edit, breakages } = editTo(document, 5)
    const changes = repairChanges(document, edit, breakages, { 'snap-pi': { kind: 'condition', scope: 'body' } })
    expect(changes.find((change) => change.id === 'pi-1')?.record?.when).toBeUndefined()
    expect(changes.find((change) => change.id === 'snap-pi')?.record?.when).toEqual({ ref: 'pi-1', param: 'model', in: [4] })
    document.reviseRecords(changes, LOCAL)
    // The Pi 5 is still there — only its snap is switched off.
    expect(document.bodies().map((body) => body.id)).toContain('pi-1')
    expect(document.brokenSteps()).toEqual([])
  })

  it('Only when (this operation) conditions the one dependent record', () => {
    const document = subtractAvjackClearance(piAndCube({ model: 4 }))
    const { edit, breakages } = editTo(document, 5)
    const changes = repairChanges(document, edit, breakages, { 'bool-1': { kind: 'condition', scope: 'operation' } })
    expect(changes.find((change) => change.id === 'bool-1')?.record?.when).toEqual({ ref: 'pi-1', param: 'model', in: [4] })
    document.reviseRecords(changes, LOCAL)
    expect(document.bodies().map((body) => body.id)).toContain('bool-1')
  })

  it('Leave broken commits the edit and flags the row', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const { edit, breakages } = editTo(document, 5)
    document.reviseRecords(repairChanges(document, edit, breakages, { 'snap-1': { kind: 'leave' } }), LOCAL)
    expect(document.brokenSteps().map((step) => step.id)).toEqual(['snap-1'])
  })

  it('the whole batch is one origin and one Undo step, which restores the original log byte for byte', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const before = serializeProject(document)
    const undoDepth = () => {
      let depth = 0
      // `pendingUndo` only exposes the top — count by label change instead.
      return document.pendingUndo() ? depth + 1 : depth
    }
    const { edit, breakages } = editTo(document, 5)
    document.reviseRecords(repairChanges(document, edit, breakages, { 'snap-1': { kind: 'detach' } }), {
      origin: 'local',
      label: 'Edit Raspberry Pi 1',
    })
    expect(undoDepth()).toBe(1)
    expect(document.pendingUndo()?.label).toBe('Edit Raspberry Pi 1')
    document.undo()
    expect(recordLinesOf(serializeProject(document))).toBe(recordLinesOf(before))
    expect(document.pendingUndo()?.label).not.toBe('Edit Raspberry Pi 1')
  })

  it('a fix is required for every breakage — a missing one is refused by name', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const { edit, breakages } = editTo(document, 5)
    expect(() => repairChanges(document, edit, breakages, {})).toThrow(/snap-1/)
  })
})

describe('repairChanges — a variable edit (TODO/ui-059)', () => {
  /** @type {any} */
  const PI_MODEL = {
    name: 'piModel',
    kind: 'enum',
    value: 4,
    options: [
      { value: 4, label: 'Pi 4' },
      { value: 5, label: 'Pi 5' },
    ],
  }

  /** @param {import('./document.js').WarpDocument} document */
  function variableEdit(document) {
    bindParamToNewVariable(document, 'pi-1', 'model', PI_MODEL, LOCAL)
    const { breakages } = variableImpactOf(document, 'piModel', 5)
    const revision = /** @type {NonNullable<ReturnType<typeof setVariableRevision>>} */ (setVariableRevision(document, 'piModel', 5))
    const edit = { rootId: 'pi-1', recordId: revision.id, record: /** @type {any} */ (revision.record), param: null, oldValue: 4, variable: 'piModel' }
    return { edit, breakages }
  }

  it('lists the snapped cube as broken, and offers Only when (a variable is a choice)', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const { breakages } = variableEdit(document)
    expect(breakages.map((breakage) => breakage.dependentRecordId)).toEqual(['snap-1'])
    expect(offeredFixesOf(breakages[0], { enumParam: true })).toContain('condition')
  })

  it('Only when writes { var, in } on the dependent, and the variable changes in the same step', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const { edit, breakages } = variableEdit(document)
    const changes = repairChanges(document, edit, breakages, { 'snap-1': { kind: 'condition', scope: 'body' } })
    document.reviseRecords(changes, LOCAL)
    expect(/** @type {any} */ (document.recordOf('cube-1')).when).toEqual({ var: 'piModel', in: [4] })
    expect(document.brokenSteps()).toEqual([])
    expect(document.recordOf(edit.recordId)?.params?.value).toBe(5)
    document.undo()
    expect(/** @type {any} */ (document.recordOf('cube-1')).when).toBeUndefined()
    expect(document.recordOf(edit.recordId)?.params?.value).toBe(4)
  })

  it('Remap works against the body the row references, not the variable record', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'camera')
    const { edit, breakages } = variableEdit(document)
    const changes = repairChanges(document, edit, breakages, { 'snap-1': { kind: 'remap', pieces: { camera: 'camera0' } } })
    const remapped = /** @type {any} */ (changes.find((change) => change.id === 'snap-1')?.record)
    expect(remapped.operands[0].pieces).toBe('camera0')
  })
})
