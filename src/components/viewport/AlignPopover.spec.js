// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'

import AlignPopover from './AlignPopover.vue'
import { useAlignReferenceStore } from '../../stores/alignReference.js'
import { useDocumentStore } from '../../stores/document.js'
import { useSelectionStore } from '../../stores/selection.js'

enableAutoUnmount(afterEach)

/**
 * The one **Align** popover (`TODO/ui-060`): Snap, Align and the Inspector's old Align to
 * origin row, behind one Target dropdown.
 *
 * Mounted on its own, not through `OperationsToolbar` — the toolbar only opens and closes
 * it (that half is `OperationsToolbar.spec.js`'s). Every length is millimetres, Z-up.
 *
 * The fixture is two cuboids far enough apart that every Snap relation lands somewhere
 * different: **A** (10 mm, centred `[0, 0, 5]`, so x −5..5) moves, **B** (20 mm, centred
 * `[100, 50, 10]`, so x 90..110, centre 100) is the target.
 */
describe('AlignPopover (TODO/ui-060)', () => {
  /** @type {ReturnType<typeof useDocumentStore>} */
  let documentStore
  /** @type {ReturnType<typeof useSelectionStore>} */
  let selection

  beforeEach(() => {
    setActivePinia(createPinia())
    documentStore = useDocumentStore()
    selection = useSelectionStore()
  })

  /**
   * @param {string} id
   * @param {string} name
   * @param {number} size
   * @param {[number, number, number]} center
   */
  function placeCuboid(id, name, size, center) {
    documentStore.append(
      { id, op: 'primitive.cuboid', name, params: { size: [size, size, size], center } },
      { origin: 'local' },
    )
  }

  function placeAandB() {
    placeCuboid('a', 'Cube A', 10, [0, 0, 5])
    placeCuboid('b', 'Cube B', 20, [100, 50, 10])
  }

  /** A Raspberry Pi B+ moved off the origin — the composite `ui-050` existed for. */
  function placePi(id = 'pi-1') {
    documentStore.append({ id, op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: { model: 4 } }, { origin: 'local' })
    documentStore.append(
      { id: `${id}-move`, op: 'transform.translate', target: id, supersedes: id, params: { vector: [50, -30, 25], rotation: [0, 0, 0] } },
      { origin: 'local' },
    )
  }

  /**
   * @param {string} id Lineage-root id.
   * @returns {[[number, number, number], [number, number, number]]}
   */
  function boundsOf(id) {
    const found = documentStore.bodies.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no body "${id}"`)
    return found.bounds
  }

  /** @returns {import('../../core/kernel/registry.js').OpRecord} */
  function lastRecord() {
    return documentStore.raw.records[documentStore.raw.records.length - 1]
  }

  describe('with 1 body selected', () => {
    it('has no Target dropdown — the only target is World origin — and says so on the top line', () => {
      placeAandB()
      selection.select('a')
      const wrapper = mount(AlignPopover)
      expect(wrapper.find('[data-testid="align-target"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="align-operands"]').text()).toBe('Aligning Cube A to World origin')
      expect(wrapper.attributes('data-target')).toBe('origin')
    })

    it('offers the drop shortcut and every grid button, but no Snap row and no offset', () => {
      placeAandB()
      selection.select('a')
      const wrapper = mount(AlignPopover)
      expect(wrapper.get('[data-testid="align-drop"]').attributes('disabled')).toBeUndefined()
      for (const axis of ['x', 'y', 'z']) {
        for (const mode of ['min', 'center', 'max']) {
          expect(wrapper.get(`[data-testid="align-${axis}-${mode}"]`).attributes('disabled')).toBeUndefined()
        }
      }
      expect(wrapper.find('[data-testid="align-relation"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="align-x-snap-plus"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="align-offset"]').exists()).toBe(false)
    })

    it('hides Measure from for a bare solid, and lists only visible parts for a composite', () => {
      placeAandB()
      selection.select('a')
      expect(mount(AlignPopover).find('[data-testid="align-reference"]').exists()).toBe(false)

      placePi()
      selection.select('pi-1')
      const select = mount(AlignPopover).get('[data-testid="align-reference"]')
      const values = select.findAll('option').map((option) => option.attributes('value'))
      expect(values[0]).toBe('')
      expect(values).toContain('mb')
      expect(values).not.toContain('clearance-ethernet')
    })

    it('an axis tap commits one Align-to-origin record on that axis only, leaves the selection alone, and a repeat is a no-op', async () => {
      placeAandB()
      selection.select('a')
      const wrapper = mount(AlignPopover)
      const before = documentStore.raw.records.length

      await wrapper.get('[data-testid="align-x-max"]').trigger('click')
      expect(documentStore.raw.records.length).toBe(before + 1)
      expect(lastRecord().op).toBe('transform.translate')
      expect(lastRecord().params?.alignedTo).toBe(true)
      expect(boundsOf('a')[1][0]).toBeCloseTo(0, 6)
      expect(boundsOf('a')[0][1]).toBeCloseTo(-5, 6)
      expect(selection.ids).toEqual(['a'])

      await wrapper.get('[data-testid="align-x-max"]').trigger('click')
      expect(documentStore.raw.records.length).toBe(before + 1)
    })

    it('the shortcut is one record: centred on X/Y, sitting on Z = 0', async () => {
      placeAandB()
      // B, not A: A already sits centred on the grid, so the shortcut would be a no-op.
      selection.select('b')
      const wrapper = mount(AlignPopover)
      const before = documentStore.raw.records.length
      await wrapper.get('[data-testid="align-drop"]').trigger('click')
      expect(documentStore.raw.records.length).toBe(before + 1)
      const [min, max] = boundsOf('b')
      expect((min[0] + max[0]) / 2).toBeCloseTo(0, 6)
      expect((min[1] + max[1]) / 2).toBeCloseTo(0, 6)
      expect(min[2]).toBeCloseTo(0, 6)
    })

    it('Measure from a part measures that part and moves the whole body', async () => {
      placePi()
      selection.select('pi-1')
      const wrapper = mount(AlignPopover)
      await wrapper.get('[data-testid="align-reference"]').setValue('mb')
      expect(useAlignReferenceStore().get('pi-1')).toBe('mb')
      await wrapper.get('[data-testid="align-z-min"]').trigger('click')
      // The microSD hangs 1.5 mm under the board (`raspberrypi.bplus`), so with the board
      // on the grid the whole Pi's own floor is at −1.5.
      expect(boundsOf('pi-1')[0][2]).toBeCloseTo(-1.5, 6)
    })

    it('a drilled-in moving body is measured by its address, and Measure from is hidden so the two cannot disagree', async () => {
      placePi()
      selection.select('pi-1')
      selection.drillInto('mb')
      const wrapper = mount(AlignPopover)
      expect(wrapper.find('[data-testid="align-reference"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="align-operands"]').text()).toBe('Aligning Raspberry Pi B+ › mb to World origin')
      await wrapper.get('[data-testid="align-z-min"]').trigger('click')
      expect(boundsOf('pi-1')[0][2]).toBeCloseTo(-1.5, 6)
    })
  })

  describe('with 2 bodies selected', () => {
    it('offers both targets, defaulting to the second-selected body by name', () => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const wrapper = mount(AlignPopover)
      const target = wrapper.get('[data-testid="align-target"]')
      const options = target.findAll('option')
      expect(options.map((option) => option.attributes('value'))).toEqual(['second', 'origin'])
      expect(options[0].text()).toBe('Second selected (Cube B)')
      expect(/** @type {HTMLSelectElement} */ (target.element).value).toBe('second')
      expect(wrapper.get('[data-testid="align-operands"]').text()).toBe('Aligning Cube A to Cube B')
    })

    it('under Second selected: the Snap row and offset show, the shortcut and min/max are disabled with a hint, ctr is live', () => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const wrapper = mount(AlignPopover)
      expect(wrapper.find('[data-testid="align-relation"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="align-offset"]').exists()).toBe(true)
      const drop = wrapper.get('[data-testid="align-drop"]')
      expect(drop.attributes('disabled')).toBeDefined()
      expect(drop.attributes('title')).toMatch(/World origin/)
      for (const axis of ['x', 'y', 'z']) {
        expect(wrapper.get(`[data-testid="align-${axis}-center"]`).attributes('disabled')).toBeUndefined()
        for (const mode of ['min', 'max']) {
          const button = wrapper.get(`[data-testid="align-${axis}-${mode}"]`)
          expect(button.attributes('disabled')).toBeDefined()
          expect(button.attributes('title')).toMatch(/Inside/)
        }
        expect(wrapper.get(`[data-testid="align-${axis}-snap-minus"]`).attributes('disabled')).toBeUndefined()
        expect(wrapper.get(`[data-testid="align-${axis}-snap-plus"]`).attributes('disabled')).toBeUndefined()
      }
    })

    it('switching Target to World origin hides the Snap row and offset, enables the shortcut, and drops the second body’s role colour', async () => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const wrapper = mount(AlignPopover)
      const alignReference = useAlignReferenceStore()
      expect(alignReference.originOnly).toBe(false)

      await wrapper.get('[data-testid="align-target"]').setValue('origin')
      expect(wrapper.find('[data-testid="align-relation"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="align-offset"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="align-drop"]').attributes('disabled')).toBeUndefined()
      expect(wrapper.get('[data-testid="align-operands"]').text()).toBe('Aligning Cube A to World origin')
      expect(alignReference.originOnly).toBe(true)

      wrapper.unmount()
      expect(alignReference.originOnly).toBe(false)
    })

    it('World origin on a 2-selection moves the first-picked body only, and keeps both selected', async () => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const bBefore = boundsOf('b')
      const wrapper = mount(AlignPopover)
      await wrapper.get('[data-testid="align-target"]').setValue('origin')
      await wrapper.get('[data-testid="align-drop"]').trigger('click')
      expect(boundsOf('a')[0][2]).toBeCloseTo(0, 6)
      expect(boundsOf('b')).toEqual(bBefore)
      expect(selection.ids).toEqual(['a', 'b'])
    })

    it('◇ ctr commits group.align in the record shape the old Align button wrote, and the selection stays as it was', async () => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const wrapper = mount(AlignPopover)
      const appendSpy = vi.spyOn(documentStore, 'append')

      await wrapper.get('[data-testid="align-y-center"]').trigger('click')
      expect(appendSpy).toHaveBeenCalledTimes(1)
      const [record, transaction] = appendSpy.mock.calls[0]
      expect(record).toEqual({ id: record.id, op: 'group.align', target: 'a', operands: ['b'], supersedes: 'a', params: { axes: 'y', deltaMm: 0 } })
      expect(transaction).toEqual({ origin: 'local' })
      const [min, max] = boundsOf('a')
      expect((min[1] + max[1]) / 2).toBeCloseTo(50, 6)
      expect(min[0]).toBeCloseTo(-5, 6) // X untouched
      expect(selection.ids).toEqual(['a', 'b'])
    })

    it('the offset field applies to the next Second-selected tap', async () => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const wrapper = mount(AlignPopover)
      await wrapper.get('[data-testid="align-offset"]').setValue(3)
      await wrapper.get('[data-testid="align-x-center"]').trigger('click')
      expect(lastRecord().params).toEqual({ axes: 'x', deltaMm: 3 })
      const [min, max] = boundsOf('a')
      expect((min[0] + max[0]) / 2).toBeCloseTo(103, 6)
    })

    it('each Relation × side maps one-to-one onto the six canonical SNAP_SIDES keys, named by where the body ends up', async () => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const wrapper = mount(AlignPopover)
      /** @type {Array<[string, 'minus' | 'plus', string]>} */
      const table = [
        ['outside', 'minus', 'outside+'],
        ['outside', 'plus', 'outside-'],
        ['inside', 'minus', 'inside-'],
        ['inside', 'plus', 'inside+'],
        ['center', 'minus', 'center+'],
        ['center', 'plus', 'center-'],
      ]
      const seen = new Set()
      for (const [relation, side, orientation] of table) {
        await wrapper.get('[data-testid="align-relation"]').setValue(relation)
        await wrapper.get(`[data-testid="align-x-snap-${side}"]`).trigger('click')
        const record = lastRecord()
        expect(record.op).toBe('group.snap')
        expect(record.params).toEqual({ axes: 'x', orientation, deltaMm: 0 })
        seen.add(record.params?.orientation)
      }
      expect(seen.size).toBe(6)
    })

    it.each([
      // [relation, side, expected moving min-x]: B spans x 90..110 (centre 100); A is 10 wide.
      ['outside', 'minus', 80], // beside B on its − side: A's + face on B's − face
      ['outside', 'plus', 110], // beside B on its + side: A's − face on B's + face
      ['inside', 'minus', 90], // flush with B's − face, inside it
      ['inside', 'plus', 100], // flush with B's + face, inside it
      ['center', 'minus', 90], // covering B's − half: A's + face on B's centre
      ['center', 'plus', 100], // covering B's + half: A's − face on B's centre
    ])('%s %s side lands the moving body where its label says (min x = %d), and the target does not move', async (relation, side, minX) => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const bBefore = boundsOf('b')
      const wrapper = mount(AlignPopover)
      await wrapper.get('[data-testid="align-relation"]').setValue(relation)
      await wrapper.get(`[data-testid="align-x-snap-${side}"]`).trigger('click')
      expect(boundsOf('a')[0][0]).toBeCloseTo(minX, 6)
      expect(boundsOf('a')[0][1]).toBeCloseTo(-5, 6) // Y untouched
      expect(boundsOf('b')).toEqual(bBefore)
    })

    it('button labels follow the Relation', async () => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const wrapper = mount(AlignPopover)
      expect(wrapper.get('[data-testid="align-x-snap-plus"]').text()).toContain('+ side')
      await wrapper.get('[data-testid="align-relation"]').setValue('inside')
      expect(wrapper.get('[data-testid="align-x-snap-plus"]').text()).toContain('+ face')
      await wrapper.get('[data-testid="align-relation"]').setValue('center')
      expect(wrapper.get('[data-testid="align-x-snap-minus"]').text()).toContain('− half')
      expect(wrapper.get('[data-testid="align-x-snap-minus"]').attributes('title')).toMatch(/− half/)
    })

    it('remembers the Relation for the session, across a close and reopen', async () => {
      placeAandB()
      selection.selectMany(['a', 'b'])
      const first = mount(AlignPopover)
      await first.get('[data-testid="align-relation"]').setValue('inside')
      first.unmount()
      const second = mount(AlignPopover)
      expect(/** @type {HTMLSelectElement} */ (second.get('[data-testid="align-relation"]').element).value).toBe('inside')
    })

    it('Measure from addresses the moving operand at that part against a second body', async () => {
      placePi()
      placeAandB()
      selection.selectMany(['pi-1', 'a'])
      const wrapper = mount(AlignPopover)
      await wrapper.get('[data-testid="align-reference"]').setValue('mb')
      await wrapper.get('[data-testid="align-z-center"]').trigger('click')
      const record = lastRecord()
      expect(record.op).toBe('group.align')
      expect(record.target).toEqual({ id: 'pi-1-move', pieces: 'mb' })
      expect(record.supersedes).toBe('pi-1-move')
      expect(record.operands).toEqual(['a'])
    })

    it('a part the kernel rejects is shown in the popover, and nothing moves', async () => {
      placeAandB()
      placePi()
      selection.selectPart('pi-1', 'No Such Part')
      selection.toggle('a')
      const wrapper = mount(AlignPopover)
      const before = documentStore.raw.records.length
      await wrapper.get('[data-testid="align-x-center"]').trigger('click')
      expect(wrapper.get('[data-testid="align-error"]').text().length).toBeGreaterThan(0)
      expect(documentStore.raw.records.length).toBe(before)
    })
  })

  it('carries a ? that opens the one Align help topic', () => {
    placeAandB()
    selection.select('a')
    expect(mount(AlignPopover).find('[data-testid="help-align"]').exists()).toBe(true)
  })
})
