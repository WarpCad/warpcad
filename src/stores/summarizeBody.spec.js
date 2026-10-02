// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { primitives } from '@jscad/modeling'

import { add, addHole, createGroup } from '../core/kernel/group.js'
import { summarizeBody, useDocumentStore } from './document.js'

/**
 * `BodySummary.partNames` / `hiddenPartNames` (`TODO/ui-042`).
 *
 * The Objects list's expandable rows read the parts off the *summary*, not off a geometry
 * walk in the component. The precondition is the one `createBodyObject` uses to decide a
 * body is drawn part-by-part (and therefore pickable to a depth): a Group with at least one
 * named part and no holes.
 */
describe('summarizeBody parts (TODO/ui-042)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const cube = () => primitives.cuboid({ size: [4, 4, 4] })

  it('a bare solid has no parts', () => {
    const doc = useDocumentStore()
    doc.append({ id: 'c', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10], center: [0, 0, 5] } })
    expect(doc.bodies[0].partNames).toEqual([])
    expect(doc.bodies[0].hiddenPartNames).toEqual([])
  })

  it('a composite lists its visible parts in group order, and its hidden ones separately', () => {
    const doc = useDocumentStore()
    doc.append({ id: 'b', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12 } })
    const [bolt] = doc.bodies
    // `tap` itself is hidden by default as of TODO/render-004 (2026-09-26), on top
    // of its already-hidden `tap-*` children (TODO/core-026) — so it now falls on
    // the `hiddenPartNames` side of this list, not `partNames`.
    expect(bolt.partNames).toEqual(['head', 'thread'])
    // A tap-clearance solid is hidden from the picture but is exactly what a boolean addresses.
    expect(bolt.hiddenPartNames).toEqual(
      expect.arrayContaining(['tap', 'tap-head', 'tap-thread', 'tap-headClearSpace'])
    )
    // Visible and hidden never overlap.
    expect(bolt.hiddenPartNames.some((name) => bolt.partNames.includes(name))).toBe(false)
  })

  it('a Raspberry Pi lists its jacks — ethernet included — as parts', () => {
    const doc = useDocumentStore()
    doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} })
    const [pi] = doc.bodies
    expect(pi.partNames).toContain('ethernet')
    expect(pi.partNames).toContain('mb')
    expect(pi.partNames.length).toBeGreaterThan(10)
    expect(pi.hiddenPartNames.length).toBeGreaterThan(0)
  })

  it('a group carrying holes is not part-addressable — the same condition createBodyObject uses', () => {
    // A per-part mesh would render straight through the hole, so such a body is drawn as one
    // combined mesh and offers no part to point at.
    const withHole = addHole(add(createGroup('g'), cube(), 'block'), primitives.cuboid({ size: [1, 1, 1] }))
    const holed = summarizeBody(/** @type {any} */ ({ id: 'g2', name: 'G', op: 'group.assemble', geometry: withHole }))
    expect(holed.partNames).toEqual([])
    expect(holed.hiddenPartNames).toEqual([])
  })
})
