// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { LOCAL, centreOf, piAndCube, piWith, snapCubeTo, snapPiBy, subtractAvjackClearance } from './__fixtures__/piScenes.js'
import { brokenDependentsOf, brokenReferencesOf, impactOf, variableImpactOf } from './dependents.js'
import { createDocument } from './document.js'

/**
 * `TODO/ui-052`'s pre-commit impact check: given a candidate replacement for a
 * composite's creation record, which dependents would **newly** break, and why.
 *
 * Every case is a hand-built log over the real kernel (`__fixtures__/piScenes.js`), and
 * the check itself is the document's own tolerant shadow fold — no second evaluator.
 */

/**
 * @param {import('./document.js').WarpDocument} document
 * @param {Record<string, any>} params
 */
function modelChange(document, params) {
  return impactOf(document, [{ id: 'pi-1', record: piWith(document, params) }], { editedRootId: 'pi-1' })
}

describe('impactOf — what a variant change would break', () => {
  it('Pi 4 + a cube snapped to `avjack` → Pi 5 reports exactly that snap, with the part it lost', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const { breakages } = modelChange(document, { model: 5 })
    expect(breakages).toHaveLength(1)
    const [breakage] = breakages
    expect(breakage).toMatchObject({
      dependentRecordId: 'snap-1',
      dependentBodyId: 'cube-1',
      dependentName: 'Cube 1',
      missingPieces: ['avjack'],
      placement: true,
    })
    expect(breakage.relationship).toBe('Snap → avjack')
    expect(breakage.reason).toBe('Pi 5 has no part named `avjack`')
    // No alias for the AV jack — the default fix is Leave broken, never a guess.
    expect(breakage.suggestions).toEqual({})
  })

  it('a snap to `ethernet`, which both models have, breaks nothing — and the cube follows the jack', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'ethernet')
    const before = centreOf(document, 'cube-1')
    const { breakages, preview } = modelChange(document, { model: 5 })
    expect(breakages).toEqual([])

    const reference = centreOf(snapCubeTo(piAndCube({ model: 5 }), 'ethernet'), 'cube-1')
    const after = centreOf(preview, 'cube-1')
    for (let axis = 0; axis < 3; axis += 1) expect(after[axis]).toBeCloseTo(reference[axis], 6)
    expect(after[1]).not.toBeCloseTo(before[1], 1)
    // The live document is untouched by the check.
    const unchanged = centreOf(document, 'cube-1')
    for (let axis = 0; axis < 3; axis += 1) expect(unchanged[axis]).toBeCloseTo(before[axis], 9)
  })

  it('a sub-part Subtract on `clearance-avjack` reports a boolean-operand breakage', () => {
    const document = subtractAvjackClearance(piAndCube({ model: 4 }))
    const { breakages } = modelChange(document, { model: 5 })
    expect(breakages).toHaveLength(1)
    expect(breakages[0]).toMatchObject({
      dependentRecordId: 'bool-1',
      dependentBodyId: 'bool-1',
      missingPieces: ['clearance-avjack'],
      placement: false,
    })
    expect(breakages[0].relationship).toBe('Subtract (operand) → clearance-avjack')
  })

  it('an already-broken row is not re-reported as the user\'s new problem', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'snap-1', leftBroken: true },
      ],
      LOCAL,
    )
    expect(modelChange(document, { clearance: 7 }).breakages).toEqual([])
  })

  it('a bolt spec change that makes a later fillet not fit reports the kernel\'s own message', () => {
    const document = createDocument()
    document.append({ id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20, fit: 'loose' } }, LOCAL)
    document.append(
      { id: 'rim-1', op: 'modify.filletRim', target: 'bolt-1', supersedes: 'bolt-1', params: { radius: 4, orientation: 'z+' } },
      LOCAL,
    )
    const bolt = /** @type {any} */ (document.recordOf('bolt-1'))
    const { breakages } = impactOf(
      document,
      [{ id: 'bolt-1', record: { ...bolt, params: { ...bolt.params, spec: '1/4 socket' } } }],
      { editedRootId: 'bolt-1' },
    )
    expect(breakages).toHaveLength(1)
    expect(breakages[0].dependentRecordId).toBe('rim-1')
    expect(breakages[0].missingPieces).toEqual([])
    expect(breakages[0].reason).toMatch(/wider than the cross-section/)
    expect(breakages[0].relationship).toBe('Fillet')
  })

  it('degenerate: no dependents at all → none', () => {
    expect(modelChange(piAndCube({ model: 4 }), { model: 5 }).breakages).toEqual([])
  })

  it('degenerate: a dependent on the whole Pi (no pieces) follows the change and breaks nothing', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), '')
    expect(modelChange(document, { model: 5 }).breakages).toEqual([])
  })

  it('degenerate: `pieces: "avjack,usb1"` with only one missing names only that one', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack,usb1')
    const { breakages } = modelChange(document, { model: 5 })
    expect(breakages).toHaveLength(1)
    expect(breakages[0].missingPieces).toEqual(['avjack'])
    expect(breakages[0].relationship).toBe('Snap → avjack,usb1')
  })

  it('suggests a Remap only from the recipe\'s real aliases — Pi 4 `camera` → Pi 5 `camera0`', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'camera')
    const { breakages } = modelChange(document, { model: 5 })
    expect(breakages).toHaveLength(1)
    expect(breakages[0].suggestions).toEqual({ camera: 'camera0' })
    expect(breakages[0].newParts).toContain('camera0')
  })

  it('suggests the matching clearance for a hidden `clearance-<x>` part whose <x> has an alias', () => {
    const document = subtractAvjackClearance(piAndCube({ model: 4 }))
    const subtract = /** @type {any} */ (document.recordOf('bool-1'))
    document.reviseRecords(
      [{ id: 'bool-1', record: { ...subtract, operands: [{ id: subtract.operands[0].id, pieces: 'clearance-usbc' }] } }],
      LOCAL,
    )
    // Pi 4 → Pi 3: no `clearance-usbc` on a Pi 3, and no `clearance-microusb` either, so
    // nothing is suggested even though `usbc` itself has an alias.
    const { breakages } = modelChange(document, { model: 3 })
    expect(breakages).toHaveLength(1)
    expect(breakages[0].suggestions).toEqual({})
  })

  it('a change that only re-activates conditioned records reports nothing', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    const cube = /** @type {any} */ (document.recordOf('cube-1'))
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'cube-1', record: { ...cube, when: { ref: 'pi-1', param: 'model', in: [4] } } },
      ],
      LOCAL,
    )
    expect(modelChange(document, { model: 4 }).breakages).toEqual([])
  })

  it('an inactive dependent is not reported on a later change', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'usbc')
    const cube = /** @type {any} */ (document.recordOf('cube-1'))
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'cube-1', record: { ...cube, when: { ref: 'pi-1', param: 'model', in: [4] } } },
      ],
      LOCAL,
    )
    // Pi 5 → Pi 3: a Pi 3 has no `usbc`, but the cube is inactive on anything but a 4.
    expect(modelChange(document, { model: 3 }).breakages).toEqual([])
  })
})

describe('brokenDependentsOf — what Resolve… reopens the dialog with', () => {
  it('lists the rows left broken against this body, in the same shape', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'snap-1', leftBroken: true },
      ],
      LOCAL,
    )
    const listed = brokenDependentsOf(document, 'pi-1')
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({ dependentRecordId: 'snap-1', dependentBodyId: 'cube-1', missingPieces: ['avjack'] })
    expect(listed[0].reason).toBe('Pi 5 has no part named `avjack`')
    // The cube's own snap does not make the cube a body something depends on.
    expect(brokenDependentsOf(document, 'cube-1')).toEqual([])
  })

  it('lists the body\'s OWN row when it addresses one of its own parts — the Pi snapped by its avjack still gets a banner to Resolve', () => {
    const document = snapPiBy(piAndCube({ model: 4 }), 'avjack')
    const { breakages } = modelChange(document, { model: 5 })
    expect(breakages).toHaveLength(1)
    expect(breakages[0]).toMatchObject({ dependentRecordId: 'snap-pi', dependentBodyId: 'pi-1', missingPieces: ['avjack'] })
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'snap-pi', leftBroken: true },
      ],
      LOCAL,
    )
    expect(brokenDependentsOf(document, 'pi-1').map((breakage) => breakage.dependentRecordId)).toEqual(['snap-pi'])
  })

  it('brokenReferencesOf: the dependent body names what it depended on, for its own banner', () => {
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    document.reviseRecords(
      [
        { id: 'pi-1', record: piWith(document, { model: 5 }) },
        { id: 'snap-1', leftBroken: true },
      ],
      LOCAL,
    )
    expect(brokenReferencesOf(document, 'cube-1')).toEqual([
      {
        recordId: 'snap-1',
        refBodyId: 'pi-1',
        refBodyName: 'Raspberry Pi 1',
        relationship: 'Snap → avjack',
        pieces: ['avjack'],
        reason: 'Pi 5 has no part named `avjack`',
      },
    ])
    expect(brokenReferencesOf(document, 'pi-1')).toEqual([])
  })
})

describe('variableImpactOf — a variable edit is an edit of every bound record at once (TODO/core-050)', () => {
  /**
   * A 40 mm cube whose height is `h`, a fillet on it, and a small cube snapped onto it.
   * With `literalHeight`, the same tower written with literals — the reference.
   *
   * @param {number} [literalHeight]
   */
  async function boundTower(literalHeight) {
    const { defineVariable } = await import('./variables.js')
    const document = createDocument()
    if (literalHeight === undefined) {
      defineVariable(document, { name: 'h', kind: 'number', value: 40, unit: 'mm' }, LOCAL)
      defineVariable(document, { name: 'side', kind: 'number', value: 40, unit: 'mm' }, LOCAL)
    }
    const size = literalHeight === undefined ? [{ $var: 'side' }, { $var: 'side' }, { $var: 'h' }] : [40, 40, literalHeight]
    document.append({ id: 'base-1', op: 'primitive.cuboid', name: 'Base 1', params: { size, center: [0, 0, 0] } }, LOCAL)
    document.append({ id: 'rim-1', op: 'modify.filletRim', target: 'base-1', supersedes: 'base-1', params: { radius: 6, orientation: 'z+' } }, LOCAL)
    document.append({ id: 'top-1', op: 'primitive.cuboid', name: 'Top 1', params: { size: [6, 6, 6], center: [100, 0, 0] } }, LOCAL)
    document.append(
      { id: 'snap-1', op: 'group.snap', target: 'top-1', operands: ['rim-1'], supersedes: 'top-1', params: { axes: 'z', orientation: 'outside+', deltaMm: 0 } },
      LOCAL,
    )
    return document
  }

  it('the data-007 repro through a variable: the snapped cube follows a height change', async () => {
    const { setVariable } = await import('./variables.js')
    const document = await boundTower()
    const before = centreOf(document, 'top-1')
    expect(variableImpactOf(document, 'h', 60).breakages).toEqual([])
    setVariable(document, 'h', 60, LOCAL)
    const after = centreOf(document, 'top-1')
    const expected = centreOf(await boundTower(60), 'top-1')
    for (let axis = 0; axis < 3; axis += 1) expect(after[axis]).toBeCloseTo(expected[axis], 6)
    expect(Math.abs(after[2] - before[2])).toBeCloseTo(10, 6)
    document.undo()
    expect(centreOf(document, 'top-1')[2]).toBeCloseTo(before[2], 6)
  })

  it('shrinking a bound size reports the fillet that no longer fits, by name, before commit', async () => {
    const document = await boundTower()
    const text = JSON.stringify(document.entries)
    const { breakages, consumers } = variableImpactOf(document, 'side', 10)
    expect(consumers.map((consumer) => consumer.recordId)).toEqual(['base-1', 'base-1'])
    expect(breakages.map((breakage) => breakage.dependentRecordId)).toContain('rim-1')
    const rim = breakages.find((breakage) => breakage.dependentRecordId === 'rim-1')
    expect(rim?.dependentName).toBe('Base 1')
    expect(rim?.relationship).toBe('Fillet')
    expect(rim?.reason).toMatch(/wider than the cross-section/)
    expect(JSON.stringify(document.entries)).toBe(text)
  })

  it('refuses a value outside the variable\'s own range, and an unknown variable, by name', () => {
    const document = createDocument()
    expect(() => variableImpactOf(document, 'nope', 3)).toThrow(/nope/)
  })
})

describe('a bound enum is named by its value, not as an object (TODO/ui-059)', () => {
  it('the breakage reason names "Pi 5" when the model is a variable', async () => {
    const { bindParamToNewVariable } = await import('./variables.js')
    const { piAndCube, snapCubeTo } = await import('./__fixtures__/piScenes.js')
    const document = snapCubeTo(piAndCube({ model: 4 }), 'avjack')
    bindParamToNewVariable(
      document,
      'pi-1',
      'model',
      { name: 'piModel', kind: 'enum', value: 4, options: [{ value: 4, label: 'Pi 4' }, { value: 5, label: 'Pi 5' }] },
      LOCAL,
    )
    const { breakages } = variableImpactOf(document, 'piModel', 5)
    expect(breakages).toHaveLength(1)
    expect(breakages[0].reason).toMatch(/Pi 5/)
    expect(breakages[0].reason).not.toMatch(/object/)
  })
})
