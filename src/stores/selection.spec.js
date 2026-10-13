// SPDX-License-Identifier: AGPL-3.0-or-later
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

  it('the additive toggle path keeps a body’s address; `subPart` is the single-body view only (ui-063)', () => {
    // `toggle` is the Shift-click/marquee-additive path. Adding a second body
    // keeps the first body's address (it is still an operand), but `subPart` —
    // what the breadcrumb, gizmo and `describeSelection` read — is now strictly
    // the single-body view, so it reads null at 2 selected.
    const selection = useSelectionStore()
    selection.select('group-1')
    selection.drillInto('Cube 1')
    selection.toggle('cuboid-2')
    expect(selection.ids).toEqual(['group-1', 'cuboid-2'])
    expect(selection.partOf('group-1')).toBe('Cube 1')
    expect(selection.subPart).toBeNull()
    selection.toggle('cuboid-2')
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
    expect(selection.partOf('pi')).toBe('ethernet')
    expect(selection.partOf('shell')).toBeNull()
  })

  it('additive on a body that is already selected: keeps its position, only the depth changes', () => {
    const selection = useSelectionStore()
    selection.selectMany(['pi', 'shell'])
    selection.selectPart('pi', 'ethernet', true)
    expect(selection.ids).toEqual(['pi', 'shell'])
    expect(selection.partOf('pi')).toBe('ethernet')
    selection.selectPart('pi', 'hdmi', true)
    expect(selection.ids).toEqual(['pi', 'shell'])
    expect(selection.partOf('pi')).toBe('hdmi')
  })

  it('additive on the part that is already addressed: steps back up to the whole body, body stays selected', () => {
    const selection = useSelectionStore()
    selection.select('shell')
    selection.selectPart('pi', 'ethernet', true)
    selection.selectPart('pi', 'ethernet', true)
    expect(selection.ids).toEqual(['shell', 'pi'])
    expect(selection.partOf('pi')).toBeNull()
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

  it('a part on a second body ADDS an address — the first body keeps its own (ui-063, was one slot)', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)
    expect(selection.ids).toEqual(['pi', 'screen'])
    expect(selection.partOf('pi')).toBe('hole1')
    expect(selection.partOf('screen')).toBe('piMountingPost1')
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

/**
 * Per-body addresses (`TODO/ui-063`). The single `subPart` slot could hold one depth for
 * the whole selection, so addressing `piMountingPost1` on the screen silently overwrote
 * `hole1` on the Pi and Snap/Align measured the Pi whole. Each selected body now carries
 * its own address; `subPart` survives as the derived single-body view the breadcrumb,
 * gizmo and `describeSelection` read.
 */
describe('selection store — per-body addresses (TODO/ui-063)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('addresses accumulate per body in a multi-selection, in selection order', () => {
    const selection = useSelectionStore()
    selection.select('pi')
    selection.selectPart('pi', 'hole1', true)
    selection.selectPart('screen', 'piMountingPost1', true)
    expect(selection.ids).toEqual(['pi', 'screen'])
    expect(selection.addresses).toEqual({ pi: 'hole1', screen: 'piMountingPost1' })
    expect(selection.count).toBe(2)
  })

  it('re-addressing the moving side between two commits is one additive tap, and leaves the other side alone', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)
    selection.selectPart('pi', 'mb', true)
    expect(selection.ids).toEqual(['pi', 'screen'])
    expect(selection.partOf('pi')).toBe('mb')
    expect(selection.partOf('screen')).toBe('piMountingPost1')
  })

  it('stepping one body back up to whole leaves the other body’s address alone', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)
    selection.selectPart('pi', 'hole1', true)
    expect(selection.partOf('pi')).toBeNull()
    expect(selection.partOf('screen')).toBe('piMountingPost1')
  })

  it('a body toggled out of the selection is dropped from the live addresses', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)
    selection.toggle('screen')
    expect(selection.ids).toEqual(['pi'])
    expect(selection.partOf('screen')).toBeNull()
    expect(Object.keys(selection.addresses)).toEqual(['pi'])
    // Back to one body: the single-body view is that body's address.
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'hole1' })
  })

  it('ui-040’s documented dance still works: a drilled body toggled out and back in comes back addressed', () => {
    // docs/booleans.md step 3 and e2e/boolean-operations.e2e.js: Shift-click the drilled
    // body out, Shift-click the base, Shift-click the drilled body back in. Parked while
    // out — inert, not an operand, not a lit row — and live again on the way back in.
    const selection = useSelectionStore()
    selection.select('bolt')
    selection.drillInto('thread')
    selection.toggle('bolt')
    expect(selection.partOf('bolt')).toBeNull()
    selection.toggle('cube')
    selection.toggle('bolt')
    expect(selection.ids).toEqual(['cube', 'bolt'])
    expect(selection.partOf('bolt')).toBe('thread')
    expect(selection.addresses).toEqual({ bolt: 'thread' })
  })

  it('select replaces the selection and clears every address but the surviving body’s own', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)
    selection.select('cube')
    expect(selection.addresses).toEqual({})
    expect(selection.subPart).toBeNull()
  })

  it('select of a body that was addressed keeps that one address (the post-commit reselect)', () => {
    // `commitSnapAlign` reselects the moving body by its root id; its address was
    // valid before the move and is still valid after it, exactly as `pruneSubPart` did.
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)
    selection.select('pi')
    expect(selection.addresses).toEqual({ pi: 'hole1' })
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'hole1' })
  })

  it('clear and an empty-space click clear every address, parked ones included', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)
    selection.toggle('screen')
    selection.clear()
    expect(selection.addresses).toEqual({})
    selection.toggle('screen')
    expect(selection.partOf('screen')).toBeNull()
  })

  it('a replacing marquee clears every address', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)
    selection.selectMany(['pi', 'screen'])
    expect(selection.addresses).toEqual({})
  })

  it('an additive marquee leaves existing addresses alone', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectMany(['screen'], true)
    expect(selection.ids).toEqual(['pi', 'screen'])
    expect(selection.partOf('pi')).toBe('hole1')
  })

  it('the single-body view is unchanged byte-for-byte: drill, step up, re-target', () => {
    const selection = useSelectionStore()
    selection.select('pi')
    selection.drillInto('mb')
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'mb' })
    selection.drillInto('hole1')
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'hole1' })
    selection.stepUp()
    expect(selection.subPart).toBeNull()
    expect(selection.ids).toEqual(['pi'])
  })

  it('subPart is null whenever more than one body is selected, even if both are addressed', () => {
    const selection = useSelectionStore()
    selection.selectPart('pi', 'hole1')
    selection.selectPart('screen', 'piMountingPost1', true)
    expect(selection.subPart).toBeNull()
  })

  it('restoreAddresses puts back only addresses whose body is selected (merge / undo)', () => {
    const selection = useSelectionStore()
    selection.selectMany(['pi', 'screen'])
    selection.restoreAddresses({ pi: 'hole1', screen: 'piMountingPost1', gone: 'x' })
    expect(selection.addresses).toEqual({ pi: 'hole1', screen: 'piMountingPost1' })
  })
})
