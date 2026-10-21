// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { LIBRARY_SECTIONS } from '../../core/library.js'
import { useLibraryDefaultsStore } from '../../stores/libraryDefaults.js'
import { usePlacementStore } from '../../stores/placement.js'
import LibraryRowPopout from './LibraryRowPopout.vue'

/**
 * `TODO/ui-084`: the row pop-out the icon rail opens on a tap. It holds the row's settings — label,
 * remembered-parameter summary, variant `<select>`s, reset — around the **same** draggable row the
 * labelled column renders (`LibraryRow`), so nothing about a row is lost in the icons tier.
 */

enableAutoUnmount(afterEach)
beforeEach(() => setActivePinia(createPinia()))

/** @param {string} op */
function rowFor(op) {
  for (const section of LIBRARY_SECTIONS) {
    const row = section.rows.find((candidate) => candidate.op === op)
    if (row) return row
  }
  throw new Error(`no catalogue row ${op}`)
}

const BOLT = 'hardware.bolt'

describe('LibraryRowPopout (TODO/ui-084)', () => {
  it('names the row and holds its variant selects, with the pop-out test id and the op', () => {
    const wrapper = mount(LibraryRowPopout, { props: { row: rowFor(BOLT), topPx: 40 } })
    const popout = wrapper.get('[data-testid="library-row-popout"]')
    expect(popout.attributes('data-op')).toBe(BOLT)
    expect(popout.attributes('role')).toBe('dialog')
    expect(popout.attributes('aria-label')).toBe('Bolt / screw')
    expect(wrapper.get('[data-testid="library-row-popout-title"]').text()).toBe('Bolt / screw')
    expect(wrapper.find(`[data-testid="library-choice-${BOLT}"]`).exists()).toBe(true)
    expect(wrapper.find(`[data-testid="library-choice-${BOLT}-spec"]`).exists()).toBe(true)
  })

  it('the row inside it is draggable, under its own test id so it never duplicates the tile’s', () => {
    const wrapper = mount(LibraryRowPopout, { props: { row: rowFor(BOLT), topPx: 0 } })
    const row = wrapper.get(`[data-testid="library-popout-row-${BOLT}"]`)
    expect(row.element.tagName).toBe('BUTTON')
    expect(row.attributes('data-op')).toBe(BOLT)
    expect(wrapper.find(`[data-testid="library-row-${BOLT}"]`).exists()).toBe(false)
  })

  it('a changed select writes the Library memory, and then shows the summary and the reset button', async () => {
    const remembered = useLibraryDefaultsStore()
    const wrapper = mount(LibraryRowPopout, { props: { row: rowFor(BOLT), topPx: 0 } })
    expect(wrapper.find(`[data-testid="library-reset-${BOLT}"]`).exists()).toBe(false)
    // Hex bolts start at M10; a socket cap screw offers M5.
    await wrapper.get(`[data-testid="library-choice-${BOLT}"]`).setValue('socket')
    await wrapper.get(`[data-testid="library-choice-${BOLT}-spec"]`).setValue('m5')
    expect(remembered.effectiveFor(rowFor(BOLT)).type).toBe('socket')
    expect(remembered.effectiveFor(rowFor(BOLT)).spec).toBe('m5')
    await nextTick()
    expect(wrapper.find(`[data-testid="library-reset-${BOLT}"]`).exists()).toBe(true)
  })

  it('a row with no settings still shows its name', () => {
    const wrapper = mount(LibraryRowPopout, { props: { row: rowFor('primitive.cuboid'), topPx: 0 } })
    expect(wrapper.get('[data-testid="library-row-popout-title"]').text()).toBe('Cube')
    expect(wrapper.findAll('select')).toHaveLength(0)
  })

  it('fades out of the way while a placement drag is under way, and comes back after it (staying open)', async () => {
    const placement = usePlacementStore()
    const wrapper = mount(LibraryRowPopout, { props: { row: rowFor(BOLT), topPx: 0 } })
    const popout = wrapper.get('[data-testid="library-row-popout"]')
    expect(popout.attributes('data-dragging')).toBe('false')
    placement.begin(BOLT, 'Bolt / screw', 10, 10)
    await nextTick()
    expect(popout.attributes('data-dragging')).toBe('true')
    placement.cancel()
    await nextTick()
    expect(popout.attributes('data-dragging')).toBe('false')
    expect(wrapper.find('[data-testid="library-row-popout"]').exists()).toBe(true)
  })

  it('sits at the top offset it is given, beside the rail', () => {
    const wrapper = mount(LibraryRowPopout, { props: { row: rowFor(BOLT), topPx: 132 } })
    expect(wrapper.get('[data-testid="library-row-popout"]').attributes('style')).toContain('top: 132px')
  })
})
