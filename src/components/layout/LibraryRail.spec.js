// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { LIBRARY_SECTIONS } from '../../core/library.js'
import { useLibraryStore } from '../../stores/library.js'
import { usePanelLayoutStore } from '../../stores/panelLayout.js'
import LibraryRail from './LibraryRail.vue'

/**
 * `TODO/ui-084`: the Library's icons tier. The same rows as the labelled column, in the same
 * section order, as 44px tiles; a tap (not a drag) on a tile opens that row's pop-out, one at a
 * time, through the layout store's shared `openPopout`.
 */

enableAutoUnmount(afterEach)
beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/** @param {import('@vue/test-utils').VueWrapper} wrapper @param {string} op */
const tile = (wrapper, op) => wrapper.get(`[data-testid="library-row-${op}"]`)

const BOLT = 'hardware.bolt'
const CUBE = 'primitive.cuboid'

describe('LibraryRail — every catalogue row is a recognisable tile (TODO/ui-084)', () => {
  it('renders one tile per catalogue row, in section order, each with a swatch, a name and no visible label', () => {
    const wrapper = mount(LibraryRail)
    const expected = LIBRARY_SECTIONS.flatMap((section) => section.rows.map((row) => row.op))
    const tiles = wrapper.findAll('[data-testid^="library-row-"]').map((node) => node.attributes('data-op'))
    expect(tiles).toEqual(expected)
    for (const section of LIBRARY_SECTIONS) {
      for (const row of section.rows) {
        const button = tile(wrapper, row.op)
        expect(button.element.tagName).toBe('BUTTON')
        expect(button.attributes('aria-label')).toBe(row.label)
        expect(button.attributes('title')).toBe(row.label)
        expect(button.attributes('aria-expanded')).toBe('false')
        const swatch = button.find('.library__swatch')
        expect(swatch.exists()).toBe(true)
        expect(swatch.attributes('data-shape')).toBe(row.op)
        expect(button.text()).toBe('')
      }
    }
  })

  it('separates sections with a divider that names the section (title, aria-label and the heading test id)', () => {
    const wrapper = mount(LibraryRail)
    for (const section of LIBRARY_SECTIONS) {
      const divider = wrapper.get(`[data-testid="library-heading-${section.id}"]`)
      expect(divider.attributes('title')).toBe(section.title)
      expect(divider.attributes('aria-label')).toBe(section.title)
      expect(divider.text()).toBe(section.title)
    }
    // The section lists keep the ids specs wait on to know the Library is showing.
    expect(wrapper.find('[data-testid="library-rows"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="library-rows-hardware"]').exists()).toBe(true)
  })

  it('has the ? help button and the ⋯ menu with Import part file… and Import model… at the top', async () => {
    const wrapper = mount(LibraryRail)
    expect(wrapper.find('[data-testid="help-library"]').exists()).toBe(true)
    const more = wrapper.get('[data-testid="library-rail-more"]')
    expect(more.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="library-import"]').exists()).toBe(false)
    await more.trigger('click')
    expect(more.attributes('aria-expanded')).toBe('true')
    await wrapper.get('[data-testid="library-import"]').trigger('click')
    expect(wrapper.emitted('import-part')).toHaveLength(1)
    await more.trigger('click')
    await wrapper.get('[data-testid="library-import-model"]').trigger('click')
    expect(wrapper.emitted('import-model')).toHaveLength(1)
  })

  it('keeps My parts collapsible: its toggle is a tile with the count as a badge', async () => {
    const library = useLibraryStore()
    const wrapper = mount(LibraryRail)
    const toggle = wrapper.get('[data-testid="library-section-toggle-user"]')
    expect(toggle.attributes('aria-label')).toMatch(/My parts/)
    expect(wrapper.get('[data-testid="library-user-count"]').text()).toBe('0')
    expect(toggle.attributes('aria-expanded')).toBe(String(library.expanded))
    await toggle.trigger('click')
    expect(library.expanded).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })
})

describe('LibraryRail — the row pop-out (TODO/ui-084)', () => {
  it('a tap (keyboard click) opens the row pop-out, reflected in aria-expanded and the shared openPopout', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, { attachTo: document.body })
    await tile(wrapper, BOLT).trigger('click')
    expect(layout.openPopout).toBe(`library-row:${BOLT}`)
    expect(tile(wrapper, BOLT).attributes('aria-expanded')).toBe('true')
    const popout = wrapper.get('[data-testid="library-row-popout"]')
    expect(popout.attributes('data-op')).toBe(BOLT)
    expect(popout.text()).toContain('Bolt')
  })

  it('a row with no settings (Cube) still opens a pop-out with its name, so the tap is never silent', async () => {
    const wrapper = mount(LibraryRail, { attachTo: document.body })
    await tile(wrapper, CUBE).trigger('click')
    const popout = wrapper.get('[data-testid="library-row-popout"]')
    expect(popout.attributes('data-op')).toBe(CUBE)
    expect(popout.text()).toMatch(/Cube/)
  })

  it('opens only one pop-out at a time: tapping another tile switches, tapping the same one closes', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, { attachTo: document.body })
    await tile(wrapper, CUBE).trigger('click')
    await tile(wrapper, BOLT).trigger('click')
    expect(wrapper.findAll('[data-testid="library-row-popout"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="library-row-popout"]').attributes('data-op')).toBe(BOLT)
    expect(tile(wrapper, CUBE).attributes('aria-expanded')).toBe('false')
    await tile(wrapper, BOLT).trigger('click')
    expect(layout.openPopout).toBe(null)
    expect(wrapper.find('[data-testid="library-row-popout"]').exists()).toBe(false)
  })

  it('closes when another panel claims the shared pop-out slot', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, { attachTo: document.body })
    await tile(wrapper, BOLT).trigger('click')
    layout.openPopout = 'ops-group:combine'
    await nextTick()
    expect(wrapper.find('[data-testid="library-row-popout"]').exists()).toBe(false)
    expect(tile(wrapper, BOLT).attributes('aria-expanded')).toBe('false')
  })

  it('Escape closes the pop-out and returns focus to its tile', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, { attachTo: document.body })
    await tile(wrapper, BOLT).trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    await nextTick()
    expect(layout.openPopout).toBe(null)
    expect(wrapper.find('[data-testid="library-row-popout"]').exists()).toBe(false)
    expect(document.activeElement).toBe(tile(wrapper, BOLT).element)
  })

  it('a press outside the pop-out and the rail closes it without swallowing the press', async () => {
    const layout = usePanelLayoutStore()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const wrapper = mount(LibraryRail, { attachTo: document.body })
    await tile(wrapper, BOLT).trigger('click')
    const event = new Event('pointerdown', { bubbles: true, cancelable: true })
    outside.dispatchEvent(event)
    await nextTick()
    expect(layout.openPopout).toBe(null)
    expect(event.defaultPrevented).toBe(false)
  })

  it('a press inside the pop-out keeps it open', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, { attachTo: document.body })
    await tile(wrapper, BOLT).trigger('click')
    wrapper.get('[data-testid="library-row-popout"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(layout.openPopout).toBe(`library-row:${BOLT}`)
  })
})

describe('LibraryRail — names on long-press (TODO/ui-084)', () => {
  it('a touch held still on a tile shows its name in a callout', async () => {
    vi.useFakeTimers()
    const wrapper = mount(LibraryRail, { attachTo: document.body })
    // jsdom has no PointerEvent: a MouseEvent of the pointer type, with `pointerType` added.
    const press = new MouseEvent('pointerdown', { button: 0, clientX: 20, clientY: 20, bubbles: true, cancelable: true })
    Object.defineProperty(press, 'pointerType', { value: 'touch' })
    tile(wrapper, BOLT).element.dispatchEvent(press)
    await nextTick()
    expect(wrapper.find('[data-testid="library-tile-callout"]').exists()).toBe(false)
    vi.advanceTimersByTime(600)
    await nextTick()
    expect(wrapper.get('[data-testid="library-tile-callout"]').text()).toBe('Bolt / screw')
    window.dispatchEvent(new Event('pointerup'))
    await nextTick()
  })
})
