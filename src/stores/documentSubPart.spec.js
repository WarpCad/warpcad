// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useParamCommands } from '../composables/useParamCommands.js'
import { describeSelection } from '../core/inspector.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'

/**
 * `TODO/ui-052`'s selection rule: "If the selection was a drilled-into part of the edited
 * body that no longer exists, the selection falls back to the whole body, and the
 * breadcrumb updates."
 *
 * Found hand-driving the task: a Pi 4 changed to a Pi 5, drilled into `camera0` (a Pi 5
 * part), then Undo back to the Pi 4 — which has no `camera0`. The selection stayed drilled
 * into a part that was gone, and the Inspector's `describeSubPart` threw during render.
 */
describe('a drilled-into part that a change takes away (TODO/ui-052)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('falls back to the whole body, and the Inspector can describe the selection', () => {
    const documentStore = useDocumentStore()
    const selection = useSelectionStore()
    documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } })
    selection.select('pi')
    expect(useParamCommands().setParam('pi', 'model', 5)).toEqual({ committed: true })

    selection.selectPart('pi', 'camera0')
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'camera0' })

    documentStore.undo()

    expect(selection.ids).toEqual(['pi'])
    expect(selection.subPart).toBeNull()
    expect(() =>
      describeSelection(documentStore.raw.bodies(), selection.ids, {
        subPart: selection.subPart,
        records: documentStore.raw.records,
      }),
    ).not.toThrow()
  })

  it('leaves a drilled-into part alone when the part still exists after the change', () => {
    const documentStore = useDocumentStore()
    const selection = useSelectionStore()
    documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 4 } })
    selection.select('pi')
    useParamCommands().setParam('pi', 'model', 5)
    selection.selectPart('pi', 'ethernet')

    documentStore.undo()

    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  })
})

/**
 * `TODO/ui-063`: a multi-selection carries one address per body. Undo of a step that
 * parked the selection, and a merge that rebuilds it, must put each body's own address
 * back — not only the single-body `subPart` view, which is `null` at two selected.
 */
describe('per-body addresses survive Undo (TODO/ui-063)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('Delete two addressed bodies, then Undo: both come back selected, each at its own part', () => {
    const documentStore = useDocumentStore()
    const selection = useSelectionStore()
    documentStore.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model: 5 } })
    documentStore.append({ id: 'screen', op: 'raspberrypi.touchScreen2', name: 'touchScreen2 1', params: {} })
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)

    documentStore.deleteBodies(['pi', 'screen'])
    expect(selection.ids).toEqual([])
    documentStore.undo()

    expect(selection.ids).toEqual(['pi', 'screen'])
    expect(selection.partOf('pi')).toBe('hole1')
    expect(selection.partOf('screen')).toBe('piMountingPost1')
  })
})
