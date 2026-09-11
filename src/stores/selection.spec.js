import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useSelectionStore } from './selection.js'

/**
 * The selection store's **pick depth** (`TODO/ui-016`).
 *
 * The store gained a second dimension with this task: `ids` says *which body*
 * is selected, and `subPart` says *how deep inside it* the selection currently
 * points. The two have to stay consistent — a `subPart` naming a body that is
 * no longer the single selection would put the Inspector's breadcrumb on one
 * object and its fields on another, which is exactly the silent-field-swap
 * failure control 6 asks the breadcrumb to make visible in the first place.
 */
describe('selection store — sub-part pick depth (TODO/ui-016)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with no pick depth at all', () => {
    const selection = useSelectionStore()
    expect(selection.subPart).toBeNull()
  })

  it('drills into a named part of the single selected body, and steps back up', () => {
    const selection = useSelectionStore()
    selection.select('group-1')
    expect(selection.subPart).toBeNull()

    selection.drillInto('Cube 1')
    expect(selection.subPart).toEqual({ bodyId: 'group-1', partName: 'Cube 1' })
    // The body itself stays selected — narrowing is a display depth, not a
    // different selection: the gizmo's whole-group contract has to come back
    // unchanged when the breadcrumb steps up.
    expect(selection.ids).toEqual(['group-1'])

    selection.stepUp()
    expect(selection.subPart).toBeNull()
    expect(selection.ids).toEqual(['group-1'])
  })

  it('re-targets straight to a sibling part without stepping up first', () => {
    const selection = useSelectionStore()
    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.drillInto('Cube 2')
    expect(selection.subPart).toEqual({ bodyId: 'group-1', partName: 'Cube 2' })
  })

  it('refuses to drill in when the selection is not exactly one body', () => {
    const selection = useSelectionStore()
    selection.clear()
    selection.drillInto('Cube 1')
    expect(selection.subPart).toBeNull()

    selection.selectMany(['group-1', 'cuboid-2'])
    selection.drillInto('Cube 1')
    expect(selection.subPart).toBeNull()
  })

  it('selecting a different body id clears the pick depth', () => {
    const selection = useSelectionStore()
    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.select('cuboid-9')
    expect(selection.subPart).toBeNull()
  })

  it('clearing the selection clears the pick depth with it', () => {
    const selection = useSelectionStore()
    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.clear()
    expect(selection.subPart).toBeNull()
  })

  it('a marquee that replaces the selection clears the pick depth', () => {
    const selection = useSelectionStore()
    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.selectMany(['cuboid-2', 'cuboid-3'])
    expect(selection.subPart).toBeNull()
  })

  it('the additive toggle path is untouched by pick depth', () => {
    // `toggle` is the Shift-click/marquee-additive path, and this task
    // deliberately adds no sub-part logic to it: a `subPart` left behind by a
    // multi-select is inert, because `describeSelection` only honours one whose
    // `bodyId` is the single selected body.
    const selection = useSelectionStore()
    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.toggle('cuboid-2')
    expect(selection.ids).toEqual(['group-1', 'cuboid-2'])
    expect(selection.subPart).toEqual({ bodyId: 'group-1', partName: 'Cube 1' })
  })
})
