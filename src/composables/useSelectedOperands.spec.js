// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { selectedOperandsOf, useSelectedOperands } from './useSelectedBody.js'
import { useSelectionStore } from '../stores/selection.js'

/**
 * The operand-building path every two-body control shares (`TODO/ui-035`, `ui-040`),
 * extended by `TODO/ui-063` so **every** addressed body becomes `{ id, pieces }`, not
 * just the one the single pick-depth slot happened to hold.
 */
describe('selectedOperandsOf (TODO/ui-063)', () => {
  const names = { pi: 'Raspberry Pi 1', screen: 'touchScreen2 1', cube: 'Cube 1' }
  const terminal = { pi: 'pi-move-3', screen: 'screen-1', cube: 'cube-1' }

  /**
   * @param {string[]} ids
   * @param {Record<string, string>} addresses
   */
  function build(ids, addresses) {
    return selectedOperandsOf({
      ids,
      partOf: (id) => addresses[id] ?? null,
      currentIdOf: (id) => terminal[/** @type {keyof typeof terminal} */ (id)] ?? null,
      nameOf: (id) => names[/** @type {keyof typeof names} */ (id)] ?? null,
    })
  }

  it('both sides addressed: both become { id, pieces }, in selection order, with › on both labels', () => {
    const operands = build(['pi', 'screen'], { pi: 'hole1', screen: 'piMountingPost1' })
    expect(operands.map((operand) => operand.ref)).toEqual([
      { id: 'pi-move-3', pieces: 'hole1' },
      { id: 'screen-1', pieces: 'piMountingPost1' },
    ])
    expect(operands.map((operand) => operand.label)).toEqual([
      'Raspberry Pi 1 › hole1',
      'touchScreen2 1 › piMountingPost1',
    ])
    expect(operands.map((operand) => operand.isSubPart)).toEqual([true, true])
    expect(operands.map((operand) => operand.partName)).toEqual(['hole1', 'piMountingPost1'])
  })

  it('asymmetric still works: a whole body is a bare terminal id', () => {
    const operands = build(['cube', 'pi'], { pi: 'ethernet' })
    expect(operands.map((operand) => operand.ref)).toEqual(['cube-1', { id: 'pi-move-3', pieces: 'ethernet' }])
    expect(operands[0].label).toBe('Cube 1')
    expect(operands[0].partName).toBeNull()
  })

  it('terminalId is always the bare terminal id (what supersedes names), name has no part on it', () => {
    const [moving] = build(['pi', 'screen'], { pi: 'mb' })
    expect(moving.terminalId).toBe('pi-move-3')
    expect(moving.name).toBe('Raspberry Pi 1')
    expect(moving.rootId).toBe('pi')
  })

  it('falls back to the root id when a body has no terminal record or name', () => {
    const [operand] = build(['ghost'], {})
    expect(operand.ref).toBe('ghost')
    expect(operand.label).toBe('ghost')
  })
})

describe('useSelectedOperands reads every selected body’s own address (TODO/ui-063)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('addressing the screen’s post does not drop the Pi’s hole', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi-1', 'hole1')
    selection.selectPart('screen-1', 'piMountingPost1', true)
    const operands = useSelectedOperands()
    expect(operands.value.map((operand) => operand.ref)).toEqual([
      { id: 'pi-1', pieces: 'hole1' },
      { id: 'screen-1', pieces: 'piMountingPost1' },
    ])
  })
})
