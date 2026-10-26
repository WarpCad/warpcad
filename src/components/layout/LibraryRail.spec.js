// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { LIBRARY_SECTIONS } from '../../core/library.js'
import { useLibraryStore } from '../../stores/library.js'
import { usePanelLayoutStore } from '../../stores/panelLayout.js'
import { usePlacementStore } from '../../stores/placement.js'
import LibraryPanel from './LibraryPanel.vue'
import LibraryRail from './LibraryRail.vue'

/**
 * `TODO/ui-084`: the Library's icons tier. The same rows as the labelled column, in the same
 * section order, as 44px tiles; a tap (not a drag) on a tile opens that row's pop-out, one at a
 * time, through the layout store's shared `openPopout`.
 *
 * `TODO/ui-081`: the same rail as section launchers in the pop-out tier, each opening its section's
 * pop-out in that same slot.
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

/** @param {import('@vue/test-utils').VueWrapper} wrapper @param {string} id */
const launcher = (wrapper, id) => wrapper.get(`[data-testid="library-launcher-${id}"]`)

/** The launcher form, as `LibraryPanel` mounts it in the `popout` tier. */
const LAUNCHERS = { props: { form: /** @type {const} */ ('launchers') }, attachTo: document.body }

describe('LibraryRail — the section launchers (TODO/ui-081)', () => {
  it('renders one launcher per section, then My parts, each a glyph with its visible short name, and no tiles', () => {
    const wrapper = mount(LibraryRail, LAUNCHERS)
    const ids = wrapper.findAll('[data-testid^="library-launcher-"]').map((node) => node.attributes('data-section'))
    expect(ids).toEqual([...LIBRARY_SECTIONS.map((section) => section.id), 'user'])
    for (const section of LIBRARY_SECTIONS) {
      const button = launcher(wrapper, section.id)
      expect(button.element.tagName).toBe('BUTTON')
      expect(button.attributes('aria-expanded')).toBe('false')
      expect(button.attributes('aria-controls')).toBe('library-section-popout')
      expect(button.find('.library-rail__launcher-glyph').exists()).toBe(true)
      expect(button.get('.library-rail__launcher-name').text()).toBe(section.title)
    }
    expect(launcher(wrapper, 'user').get('.library-rail__launcher-name').text()).toBe('My parts')
    // The catalogue's rows are not on the rail in this form: they are in the pop-out.
    expect(wrapper.findAll('[data-testid^="library-row-"]')).toHaveLength(0)
    expect(wrapper.find('[data-testid="library-section-popout"]').exists()).toBe(false)
  })

  it('keeps the ? help button and the ⋯ menu at the top of the rail', () => {
    const wrapper = mount(LibraryRail, LAUNCHERS)
    expect(wrapper.find('[data-testid="help-library"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="library-rail-more"]').exists()).toBe(true)
  })

  it('a tap opens the section pop-out: heading and rows from the labelled column, aria-expanded, the shared openPopout', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, LAUNCHERS)
    await launcher(wrapper, 'hardware').trigger('click')
    expect(layout.openPopout).toBe('library-section:hardware')
    expect(launcher(wrapper, 'hardware').attributes('aria-expanded')).toBe('true')
    const popout = wrapper.get('[data-testid="library-section-popout"]')
    expect(popout.attributes('data-section')).toBe('hardware')
    expect(popout.attributes('id')).toBe('library-section-popout')
    expect(popout.get('[data-testid="library-heading-hardware"]').text()).toBe('Hardware')
    const hardware = LIBRARY_SECTIONS.find((section) => section.id === 'hardware')
    const rows = popout.findAll('[data-testid^="library-row-"]').map((node) => node.attributes('data-op'))
    expect(rows).toEqual(hardware?.rows.map((row) => row.op))
    // The same LibraryRow as the full column: a labelled row with its variant selects, not a tile.
    expect(popout.get(`[data-testid="library-row-${BOLT}"]`).text()).toContain('Bolt')
    expect(popout.find('.library__tile').exists()).toBe(false)
    expect(popout.find(`[data-testid="library-choice-${BOLT}"]`).exists()).toBe(true)
  })

  it('opens one section at a time: another launcher switches, the same one closes', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, LAUNCHERS)
    await launcher(wrapper, 'primitive').trigger('click')
    await launcher(wrapper, 'hardware').trigger('click')
    expect(wrapper.findAll('[data-testid="library-section-popout"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="library-section-popout"]').attributes('data-section')).toBe('hardware')
    expect(launcher(wrapper, 'primitive').attributes('aria-expanded')).toBe('false')
    await launcher(wrapper, 'hardware').trigger('click')
    expect(layout.openPopout).toBe(null)
    expect(wrapper.find('[data-testid="library-section-popout"]').exists()).toBe(false)
  })

  it('Escape closes the pop-out and returns focus to its launcher', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, LAUNCHERS)
    await launcher(wrapper, 'hardware').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    await nextTick()
    expect(layout.openPopout).toBe(null)
    expect(wrapper.find('[data-testid="library-section-popout"]').exists()).toBe(false)
    expect(document.activeElement).toBe(launcher(wrapper, 'hardware').element)
  })

  it('only one pop-out across kinds: an Operations group pop-out closes it, and opening it closes that', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, LAUNCHERS)
    await launcher(wrapper, 'hardware').trigger('click')
    layout.openPopout = 'ops-group:combine'
    await nextTick()
    expect(wrapper.find('[data-testid="library-section-popout"]').exists()).toBe(false)
    expect(launcher(wrapper, 'hardware').attributes('aria-expanded')).toBe('false')
    await launcher(wrapper, 'kit').trigger('click')
    expect(layout.openPopout).toBe('library-section:kit')
  })

  it('a press outside closes it without swallowing the press; a press inside keeps it open', async () => {
    const layout = usePanelLayoutStore()
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const wrapper = mount(LibraryRail, LAUNCHERS)
    await launcher(wrapper, 'hardware').trigger('click')
    wrapper.get('[data-testid="library-section-popout"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(layout.openPopout).toBe('library-section:hardware')
    const event = new Event('pointerdown', { bubbles: true, cancelable: true })
    outside.dispatchEvent(event)
    await nextTick()
    expect(layout.openPopout).toBe(null)
    expect(event.defaultPrevented).toBe(false)
  })

  it('fades out of the way during a placement drag and is still open after the drop', async () => {
    const placement = usePlacementStore()
    const wrapper = mount(LibraryRail, LAUNCHERS)
    await launcher(wrapper, 'hardware').trigger('click')
    const popout = () => wrapper.get('[data-testid="library-section-popout"]')
    expect(popout().attributes('data-dragging')).toBe('false')
    placement.begin('hardware.nut', 'Nut', 10, 10)
    await nextTick()
    expect(popout().attributes('data-dragging')).toBe('true')
    placement.drop(400, 300)
    await nextTick()
    expect(popout().attributes('data-dragging')).toBe('false')
  })

  it('is min(280px, P − 32px) wide, from the layout store’s pane width', async () => {
    const layout = usePanelLayoutStore()
    layout.setBodyWidth(760)
    const wrapper = mount(LibraryRail, LAUNCHERS)
    await launcher(wrapper, 'hardware').trigger('click')
    const expected = Math.min(280, layout.layout.paneWidthPx - 32)
    expect(wrapper.get('[data-testid="library-section-popout"]').attributes('style')).toContain(`width: ${expected}px`)
  })

  it('My parts is a launcher with the count as a badge; its pop-out lists the saved parts or says there are none', async () => {
    const wrapper = mount(LibraryRail, LAUNCHERS)
    expect(launcher(wrapper, 'user').get('[data-testid="library-user-count"]').text()).toBe('0')
    await launcher(wrapper, 'user').trigger('click')
    const popout = wrapper.get('[data-testid="library-section-popout"]')
    expect(popout.attributes('data-section')).toBe('user')
    expect(popout.get('[data-testid="library-heading-user"]').text()).toContain('My parts')
    expect(popout.find('[data-testid="library-user-empty"]').exists()).toBe(true)
  })

  it('a tier change that removes the launchers closes the pop-out at once, leaving no orphan', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, LAUNCHERS)
    await launcher(wrapper, 'hardware').trigger('click')
    await wrapper.setProps({ form: 'tiles' })
    expect(layout.openPopout).toBe(null)
    expect(wrapper.find('[data-testid="library-section-popout"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="library-launcher-"]').exists()).toBe(false)
    expect(wrapper.find(`[data-testid="library-row-${BOLT}"]`).exists()).toBe(true)
  })

  it('a tier change into the launchers closes an open row pop-out, whose tile is gone', async () => {
    const layout = usePanelLayoutStore()
    const wrapper = mount(LibraryRail, { attachTo: document.body })
    await tile(wrapper, BOLT).trigger('click')
    await wrapper.setProps({ form: 'launchers' })
    expect(layout.openPopout).toBe(null)
    expect(wrapper.find('[data-testid="library-row-popout"]').exists()).toBe(false)
  })
})

describe('LibraryPanel — the tier swap waits for a drag to end (TODO/ui-081)', () => {
  it('keeps the launchers (and the open pop-out) mounted while a drag is under way, and swaps at its end', async () => {
    const layout = usePanelLayoutStore()
    const placement = usePlacementStore()
    layout.setBodyWidth(760)
    const wrapper = mount(LibraryPanel, { attachTo: document.body })
    await launcher(wrapper, 'hardware').trigger('click')
    placement.begin('hardware.nut', 'Nut', 10, 10)
    await nextTick()
    layout.setBodyWidth(900)
    // The grid track has finished widening (`AppView`'s `transitionend`, ui-079 stage 7): only the
    // drag is holding the launchers now.
    layout.finishTrackAnimation()
    await nextTick()
    expect(wrapper.find('[data-testid="library-launcher-hardware"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="library-section-popout"]').exists()).toBe(true)
    placement.cancel()
    await nextTick()
    await nextTick()
    expect(wrapper.find('[data-testid="library-launcher-hardware"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="library-section-popout"]').exists()).toBe(false)
    expect(layout.openPopout).toBe(null)
  })

  it('shows the launchers in the popout tier and the icon tiles in the icons tier', async () => {
    const layout = usePanelLayoutStore()
    layout.setBodyWidth(760)
    const wrapper = mount(LibraryPanel, { attachTo: document.body })
    expect(wrapper.find('[data-testid="library-launcher-primitive"]').exists()).toBe(true)
    layout.setBodyWidth(900)
    // Growing: the tiles come in once the track has widened (ui-079 stage 7's `transitionend`).
    layout.finishTrackAnimation()
    await nextTick()
    expect(wrapper.find('[data-testid="library-launcher-primitive"]').exists()).toBe(false)
    expect(wrapper.find('.library__tile').exists()).toBe(true)
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
