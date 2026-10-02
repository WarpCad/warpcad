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

describe('no second sketch selection (TODO/sketch-001)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('has no sketchId — a finished sketch body is an ordinary body, and the editor keeps its own profile selection', () => {
    const selection = /** @type {any} */ (useSelectionStore())
    expect(selection.sketchId).toBeUndefined()
    expect(selection.selectSketch).toBeUndefined()
  })
})

/**
 * `selectPart` — pick depth addressed by **body id**, so the Objects list can name a part
 * of a body that no click can reach (`TODO/ui-042`).
 *
 * `drillInto` is deliberately untouched: it is the viewport's second-click path and its
 * "exactly one body selected" rule is `ui-016`'s contract. `selectPart` is the explicit
 * sibling for a route that already knows which body it means.
 */
describe('selection store — selectPart (TODO/ui-042)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('plain: the body becomes the whole selection, drilled — exactly what select + drillInto does', () => {
    const selection = useSelectionStore()
    selection.select('shell')
    selection.selectPart('pi', 'ethernet')
    expect(selection.ids).toEqual(['pi'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })

    const other = useSelectionStore()
    other.select('pi')
    other.drillInto('ethernet')
    expect(other.subPart).toEqual(selection.subPart)
  })

  it('plain, again on the same part: stays drilled — a repeat viewport click does not step back up', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'ethernet')
    selection.selectPart('pi', 'ethernet')
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    expect(selection.ids).toEqual(['pi'])
  })

  it('plain, on a sibling: re-targets straight to it, as a second viewport click on a sibling does', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'ethernet')
    selection.selectPart('pi', 'hdmi')
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'hdmi' })
    expect(selection.count).toBe(1)
  })

  it('additive: adds the body AT THE END with the depth — so a body selected first stays the boolean base', () => {
    const selection = useSelectionStore()
    selection.select('shell')
    selection.selectPart('pi', 'ethernet', true)
    // Order is the operand order: the shell is first (Subtract's base), the Pi second.
    expect(selection.ids).toEqual(['shell', 'pi'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  })

  it('additive on a body that is already selected: keeps its position, only the depth changes', () => {
    const selection = useSelectionStore()
    selection.selectMany(['pi', 'shell'])
    selection.selectPart('pi', 'ethernet', true)
    expect(selection.ids).toEqual(['pi', 'shell'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    selection.selectPart('pi', 'hdmi', true)
    expect(selection.ids).toEqual(['pi', 'shell'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'hdmi' })
  })

  it('additive on the part that is already addressed: steps back up to the whole body, body stays selected', () => {
    const selection = useSelectionStore()
    selection.select('shell')
    selection.selectPart('pi', 'ethernet', true)
    selection.selectPart('pi', 'ethernet', true)
    expect(selection.ids).toEqual(['shell', 'pi'])
    expect(selection.subPart).toBeNull()
  })

  it('never changes count — depth is not a second operand (ui-040 invariant)', () => {
    const selection = useSelectionStore()
    selection.select('shell')
    expect(selection.count).toBe(1)
    selection.selectPart('pi', 'ethernet', true)
    expect(selection.count).toBe(2)
    selection.selectPart('pi', 'hdmi', true)
    expect(selection.count).toBe(2)
    selection.selectPart('pi', 'hdmi', true)
    expect(selection.count).toBe(2)
  })

  it('one depth at a time: a part on a second body takes the slot from the first — never two silently', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'ethernet')
    selection.selectPart('bolt', 'tap', true)
    expect(selection.ids).toEqual(['pi', 'bolt'])
    expect(selection.subPart).toEqual({ bodyId: 'bolt', partName: 'tap' })
  })

  it('ignores an empty id or part name', () => {
    const selection = useSelectionStore()
    selection.select('shell')
    selection.selectPart('', 'x')
    selection.selectPart('pi', '')
    selection.selectPart(null, null)
    expect(selection.ids).toEqual(['shell'])
    expect(selection.subPart).toBeNull()
  })

  it('drillInto is unchanged: still a no-op unless exactly one body is selected (ui-016)', () => {
    const selection = useSelectionStore()
    selection.selectMany(['a', 'b'])
    selection.drillInto('tap')
    expect(selection.subPart).toBeNull()
  })
})
