// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { boundsOf } from '../core/kernel/group.js'
import { useColorPreviewStore } from '../stores/colorPreview.js'
import { useDocumentStore } from '../stores/document.js'
import { useColorCommands } from './useColorCommands.js'

/**
 * The Inspector's colour control, as the document sees it (`TODO/ui-037`).
 *
 * A native `<input type=color>` fires `input` continuously while the picker is open
 * and `change` once when the user settles. The contract these pin: `input` is a
 * **preview** (UI state, nothing written), `change` is **one** `style.recolor`
 * record, and one pick is one Undo step — never one step per `input` event.
 */
describe('useColorCommands (TODO/ui-037)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** A Cube and a Cylinder, apart: scenario 13's own step 1. */
  function seed() {
    const doc = useDocumentStore()
    doc.append(
      { id: 'cuboid-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [-60, 0, 20] } },
      { origin: 'local' }
    )
    doc.append(
      {
        id: 'cylinder-2',
        op: 'primitive.cylinder',
        name: 'Cylinder 1',
        params: { diameter: 40, height: 50, center: [60, 0, 25], segments: 32 },
      },
      { origin: 'local' }
    )
    return doc
  }

  /** @param {ReturnType<typeof useDocumentStore>} doc @param {string} id */
  function overridesOf(doc, id) {
    return doc.raw.bodies().find((body) => body.id === id)?.colorOverrides
  }

  it('a colour commit appends one correct style.recolor record, and touches no other body', () => {
    const doc = seed()
    const before = doc.raw.records.length

    useColorCommands().setColor('cuboid-1', 0xff0000)

    expect(doc.raw.records.length).toBe(before + 1)
    const record = doc.raw.records.at(-1)
    expect(record).toMatchObject({ op: 'style.recolor', target: 'cuboid-1', supersedes: 'cuboid-1', colorOverride: 0xff0000 })
    expect(record?.subPart).toBeUndefined()
    expect(record?.colorAlpha).toBeUndefined()
    expect(overridesOf(doc, 'cuboid-1')).toEqual([{ color: 0xff0000 }])
    expect(overridesOf(doc, 'cylinder-2')).toBeUndefined()
    expect(doc.raw.pendingUndo()?.label).toBe('Recolor Cube 1')
  })

  it('a second edit on the same body supersedes the first — chained on its lineage, not a separate entry', () => {
    const doc = seed()
    const colors = useColorCommands()
    colors.setColor('cuboid-1', 0xff0000)
    const first = doc.raw.records.at(-1)
    const count = doc.raw.records.length

    colors.setColor('cuboid-1', 0x00ff00)
    const second = doc.raw.records.at(-1)

    // Exactly one more record, and it supersedes the first pick's record — the
    // lineage terminal — rather than the creation record or anything else.
    expect(doc.raw.records.length).toBe(count + 1)
    expect(second?.supersedes).toBe(first?.id)
    // Still one body, still one whole-body entry: the newer pick replaced the older.
    expect(doc.raw.bodies()).toHaveLength(2)
    expect(overridesOf(doc, 'cuboid-1')).toEqual([{ color: 0x00ff00 }])

    // Each pick is one Undo step: one Undo returns the first pick, not the default.
    doc.undo()
    expect(overridesOf(doc, 'cuboid-1')).toEqual([{ color: 0xff0000 }])
    doc.undo()
    expect(overridesOf(doc, 'cuboid-1')).toBeUndefined()
  })

  it('previewing (the picker\'s `input` stream) writes nothing to the document or the undo stack', () => {
    const doc = seed()
    const colors = useColorCommands()
    const preview = useColorPreviewStore()
    const count = doc.raw.records.length
    const undo = doc.raw.pendingUndo()?.label

    for (const color of [0x110000, 0x440000, 0x880000, 0xcc0000, 0xff0000]) colors.preview('cuboid-1', color)

    expect(doc.raw.records.length).toBe(count)
    expect(doc.raw.pendingUndo()?.label).toBe(undo)
    expect(preview.isActive).toBe(true)
    expect(preview.bodyId).toBe('cuboid-1')
    expect(preview.color).toBe(0xff0000)
    expect(preview.subPart).toBe('')

    // `change` commits exactly one record for the whole gesture and ends the preview.
    colors.setColor('cuboid-1', 0xff0000)
    expect(doc.raw.records.length).toBe(count + 1)
    expect(preview.isActive).toBe(false)
  })

  it('picking the colour already in force is not a mutation', () => {
    const doc = seed()
    const colors = useColorCommands()
    colors.setColor('cuboid-1', 0xff0000)
    const count = doc.raw.records.length
    colors.setColor('cuboid-1', 0xff0000)
    expect(doc.raw.records.length).toBe(count)
  })

  it('cancelling a preview leaves the document exactly as it was', () => {
    const doc = seed()
    const colors = useColorCommands()
    const count = doc.raw.records.length
    colors.preview('cuboid-1', 0x123456)
    colors.cancelPreview()
    expect(useColorPreviewStore().isActive).toBe(false)
    expect(doc.raw.records.length).toBe(count)
    expect(overridesOf(doc, 'cuboid-1')).toBeUndefined()
  })

  it('reset clears the override in one step; with nothing to clear it is not a mutation', () => {
    const doc = seed()
    const colors = useColorCommands()
    const count = doc.raw.records.length
    colors.resetColor('cuboid-1')
    expect(doc.raw.records.length).toBe(count)

    colors.setColor('cuboid-1', 0xff0000)
    colors.resetColor('cuboid-1')
    expect(overridesOf(doc, 'cuboid-1')).toBeUndefined()
    expect(doc.raw.pendingUndo()?.label).toBe('Reset color of Cube 1')
    doc.undo()
    expect(overridesOf(doc, 'cuboid-1')).toEqual([{ color: 0xff0000 }])
  })

  it('keeps an existing alpha when only the hue is re-picked', () => {
    const doc = seed()
    doc.raw.setColorOverride('cuboid-1', { color: 0x00ff00, colorAlpha: 0.5 }, { origin: 'local' })
    doc.refresh()
    useColorCommands().setColor('cuboid-1', 0xff0000)
    expect(overridesOf(doc, 'cuboid-1')).toEqual([{ color: 0xff0000, colorAlpha: 0.5 }])
  })

  describe('a composite body — the core-020 regression surface', () => {
    /** `core-020`'s own reproduction: a plate, then a bolt, through the command layer. */
    function seedPlateAndBolt() {
      const doc = useDocumentStore()
      doc.append(
        { id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [40, 40, 6], center: [0, 0, 3] } },
        { origin: 'local' }
      )
      doc.append(
        { id: 'bolt1', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 20, fit: 'close' } },
        { origin: 'local' }
      )
      return doc
    }

    /** @param {ReturnType<typeof useDocumentStore>} doc @param {string} id */
    function geometryOf(doc, id) {
      return /** @type {any} */ (doc.raw.bodies().find((body) => body.id === id)?.geometry)
    }

    it('recolouring one sub-part, then the whole bolt, leaves its part list, its bounds and the plate untouched', () => {
      const doc = seedPlateAndBolt()
      const boltBefore = geometryOf(doc, 'bolt1')
      const namesBefore = [...boltBefore.names]
      const boundsBefore = boundsOf(boltBefore)
      const shellBounds = boundsOf(geometryOf(doc, 'shell'))
      // `core-020`'s symptom was the plate being swallowed into the bolt's group.
      expect(namesBefore).not.toContain('Shell 1')

      const colors = useColorCommands()
      colors.setColor('bolt1', 0x00ff00, 'head')
      colors.setColor('bolt1', 0xff0000)

      const boltAfter = geometryOf(doc, 'bolt1')
      expect(boltAfter.names).toEqual(namesBefore)
      expect(boundsOf(boltAfter)).toEqual(boundsBefore)
      expect(boundsOf(geometryOf(doc, 'shell'))).toEqual(shellBounds)
      expect(doc.raw.bodies().map((body) => body.id).sort()).toEqual(['bolt1', 'shell'])
      expect(overridesOf(doc, 'bolt1')).toEqual([{ color: 0x00ff00, subPart: 'head' }, { color: 0xff0000 }])
      expect(overridesOf(doc, 'shell')).toBeUndefined()
    })
  })
})
