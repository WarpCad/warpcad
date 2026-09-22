// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import { useObjectsPanelStore } from '../../stores/objectsPanel.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useSketchModeStore } from '../../stores/sketchMode.js'
import { useTimelineStore } from '../../stores/timeline.js'
import ObjectsPanel from './ObjectsPanel.vue'
import ObjectsToggle from './ObjectsToggle.vue'

/**
 * `TODO/ui-041` — the Objects list at component level: what a row says, what each of its
 * two buttons does, and what the panel prints when it cannot select. The reachability half
 * (mounted in the real root view, at three viewports) is `e2e/objects-panel.e2e.js`.
 */
describe('ObjectsPanel + ObjectsToggle (TODO/ui-041)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const doc = useDocumentStore()
    doc.append({ id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [0, 0, 20] } })
    doc.append({ id: 'b', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 20, center: [80, 0, 10] } })
  })

  const mountPanel = () => mount(ObjectsPanel, { global: { plugins: [pinia] } })

  it('renders nothing until it is opened — closed by default', async () => {
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="objects-panel"]').exists()).toBe(false)
    useObjectsPanelStore().setOpen(true)
    await nextTick()
    expect(wrapper.find('[data-testid="objects-panel"]').exists()).toBe(true)
  })

  it('shows a row per body with its name and size, and the selection count in the header', async () => {
    const objects = useObjectsPanelStore()
    objects.setOpen(true)
    const wrapper = mountPanel()
    expect(wrapper.findAll('[data-testid="objects-row-name"]').map((n) => n.text())).toEqual(['Cube 1', 'Sphere 1'])
    expect(wrapper.get('[data-testid="objects-row-a"]').text()).toContain('40 × 40 × 40 mm')
    expect(wrapper.get('[data-testid="objects-count"]').text()).toBe('2 objects')

    useSelectionStore().select('a')
    await nextTick()
    expect(wrapper.get('[data-testid="objects-count"]').text()).toBe('2 objects · 1 selected')
  })

  it('a row click selects that body only; the check adds and removes — with the order on it', async () => {
    useObjectsPanelStore().setOpen(true)
    const selection = useSelectionStore()
    const wrapper = mountPanel()

    await wrapper.get('[data-testid="objects-row-a"]').trigger('click')
    expect(selection.ids).toEqual(['a'])
    expect(wrapper.get('[data-testid="objects-item-a"]').attributes('data-selected')).toBe('true')

    await wrapper.get('[data-testid="objects-check-b"]').trigger('click')
    expect(selection.ids).toEqual(['a', 'b'])
    expect(wrapper.get('[data-testid="objects-check-a"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="objects-check-b"]').text()).toBe('2')
    expect(wrapper.get('[data-testid="objects-check-b"]').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('[data-testid="objects-item-b"]').attributes('data-role')).toBe('secondary')

    await wrapper.get('[data-testid="objects-check-b"]').trigger('click')
    expect(selection.ids).toEqual(['a'])

    // A plain row click replaces the whole selection.
    await wrapper.get('[data-testid="objects-check-b"]').trigger('click')
    await wrapper.get('[data-testid="objects-row-b"]').trigger('click')
    expect(selection.ids).toEqual(['b'])
  })

  it('Shift, Ctrl and Cmd on a row are additive, the same as Shift-click in the viewport', async () => {
    useObjectsPanelStore().setOpen(true)
    const selection = useSelectionStore()
    const wrapper = mountPanel()
    await wrapper.get('[data-testid="objects-row-a"]').trigger('click')
    await wrapper.get('[data-testid="objects-row-b"]').trigger('click', { shiftKey: true })
    expect(selection.ids).toEqual(['a', 'b'])
    await wrapper.get('[data-testid="objects-row-b"]').trigger('click', { ctrlKey: true })
    expect(selection.ids).toEqual(['a'])
    await wrapper.get('[data-testid="objects-row-b"]').trigger('click', { metaKey: true })
    expect(selection.ids).toEqual(['a', 'b'])
  })

  it('the check buttons are real buttons, not inputs — Ctrl+Z is not swallowed as text entry', () => {
    useObjectsPanelStore().setOpen(true)
    const wrapper = mountPanel()
    const check = wrapper.get('[data-testid="objects-check-a"]')
    // HistoryControls treats INPUT/TEXTAREA/SELECT as text entry and ignores undo there.
    expect(check.element.tagName).toBe('BUTTON')
    expect(wrapper.findAll('input')).toHaveLength(0)
  })

  it('says why it cannot select while History previews, and disables every row', async () => {
    useObjectsPanelStore().setOpen(true)
    const timeline = useTimelineStore()
    const wrapper = mountPanel()
    timeline.selectRow('a')
    await nextTick()
    expect(wrapper.get('[data-testid="objects-disabled-reason"]').text()).toMatch(/Previewing history/)
    expect(wrapper.get('[data-testid="objects-row-a"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="objects-check-a"]').attributes('disabled')).toBeDefined()
    // The list shows the previewed scene: only the cube existed at step 1.
    expect(wrapper.findAll('[data-testid="objects-row-name"]').map((n) => n.text())).toEqual(['Cube 1'])
  })

  it('explains an absent body: suppressed steps are not in the scene, so they are not listed', async () => {
    useObjectsPanelStore().setOpen(true)
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="objects-absent-note"]').exists()).toBe(false)
    useDocumentStore().raw.setSuppressed('b', true, { origin: 'local' })
    useDocumentStore().refresh()
    await nextTick()
    expect(wrapper.get('[data-testid="objects-absent-note"]').text()).toMatch(/1 suppressed or rolled-back step/)
    expect(wrapper.findAll('[data-testid="objects-row-name"]')).toHaveLength(1)
  })

  it('the empty state names the way out', () => {
    setActivePinia((pinia = createPinia()))
    useObjectsPanelStore().setOpen(true)
    const wrapper = mountPanel()
    expect(wrapper.get('[data-testid="objects-empty"]').text()).toMatch(/drag a shape in from the Library/)
  })

  it('the toggle reflects and flips the open state, with an accessible name', async () => {
    const wrapper = mount(ObjectsToggle, { global: { plugins: [pinia] } })
    const button = wrapper.get('[data-testid="objects-toggle"]')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.attributes('aria-label')).toBe('Open Objects')
    await button.trigger('click')
    expect(useObjectsPanelStore().open).toBe(true)
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(button.attributes('aria-label')).toBe('Close Objects')
  })
})

/**
 * `TODO/ui-042` — expandable part rows, at component level: what a chevron and a child row
 * say and do. The reachability half (mounted in the real root view, at three viewports,
 * with a real Subtract measured against the kernel) is `e2e/objects-panel.e2e.js`.
 */
describe('ObjectsPanel — part rows (TODO/ui-042)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const doc = useDocumentStore()
    doc.append({ id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [100, 70, 40], center: [42, 27, 10] } })
    doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} })
    useObjectsPanelStore().setOpen(true)
  })

  const mountPanel = () => mount(ObjectsPanel, { global: { plugins: [pinia] } })
  const part = (name) => `[data-testid="objects-part-pi-${name}"]`
  const partCheck = (name) => `[data-testid="objects-part-check-pi-${name}"]`

  it('only the composite gets a chevron; it starts collapsed, with aria-expanded and no child rows', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="objects-expand-shell"]').exists()).toBe(false)
    const chevron = wrapper.get('[data-testid="objects-expand-pi"]')
    expect(chevron.element.tagName).toBe('BUTTON')
    expect(chevron.attributes('aria-expanded')).toBe('false')
    expect(chevron.attributes('aria-label')).toMatch(/Show .*parts of Raspberry Pi B\+/)
    expect(wrapper.find(part('ethernet')).exists()).toBe(false)
  })

  it('the chevron expands the parts in place — and expanding selects nothing', async () => {
    const wrapper = mountPanel()
    const selection = useSelectionStore()
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    expect(wrapper.get('[data-testid="objects-expand-pi"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[data-testid="objects-expand-pi"]').attributes('aria-label')).toMatch(/Hide .*parts of Raspberry Pi B\+/)
    expect(wrapper.find(part('ethernet')).exists()).toBe(true)
    expect(selection.ids).toEqual([])
    // The body rows' own name list is unchanged: child rows use their own name testid.
    expect(wrapper.findAll('[data-testid="objects-row-name"]').map((n) => n.text())).toEqual(['Shell 1', 'Raspberry Pi B+'])
    expect(wrapper.get('[data-testid="objects-part-name-pi-ethernet"]').text()).toBe('ethernet')

    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    expect(wrapper.find(part('ethernet')).exists()).toBe(false)
  })

  it('labels hidden parts as hidden, and lists them after the visible ones', async () => {
    const wrapper = mountPanel()
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    const items = wrapper.findAll('[data-testid^="objects-part-item-pi-"]')
    const flags = items.map((item) => item.attributes('data-hidden'))
    expect(flags.includes('true')).toBe(true)
    expect(flags.indexOf('true')).toBeGreaterThan(flags.lastIndexOf('false'))
    expect(wrapper.get('[data-testid="objects-part-item-pi-ethernet"]').text()).not.toMatch(/hidden/)
    expect(wrapper.get('[data-testid="objects-part-item-pi-usb1-body"]').text()).toMatch(/hidden/)
  })

  it('a child row tap selects that part of that body — the same two selections a second viewport click makes', async () => {
    const wrapper = mountPanel()
    const selection = useSelectionStore()
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    await wrapper.get(part('ethernet')).trigger('click')
    expect(selection.ids).toEqual(['pi'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    expect(wrapper.get('[data-testid="objects-part-item-pi-ethernet"]').attributes('data-selected')).toBe('true')
    expect(wrapper.get(part('ethernet')).attributes('aria-pressed')).toBe('true')
    // Re-targeting to a sibling moves the fill.
    await wrapper.get(part('hdmi')).trigger('click')
    expect(wrapper.get('[data-testid="objects-part-item-pi-ethernet"]').attributes('data-selected')).toBe('false')
    expect(wrapper.get('[data-testid="objects-part-item-pi-hdmi"]').attributes('data-selected')).toBe('true')
    // Depth is never a second body.
    expect(selection.count).toBe(1)
  })

  it('shell row, then the part\'s check: two bodies in the right order, the part named on the Pi row even collapsed', async () => {
    const wrapper = mountPanel()
    const selection = useSelectionStore()
    await wrapper.get('[data-testid="objects-row-shell"]').trigger('click')
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    await wrapper.get(partCheck('ethernet')).trigger('click')
    expect(selection.ids).toEqual(['shell', 'pi'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    expect(wrapper.get('[data-testid="objects-check-shell"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="objects-check-pi"]').text()).toBe('2')
    expect(wrapper.get(partCheck('ethernet')).text()).toBe('2')
    expect(wrapper.get(partCheck('ethernet')).attributes('aria-checked')).toBe('true')
    // Collapse: the drilled part is still named on the parent row, so the address is never hidden.
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    expect(wrapper.get('[data-testid="objects-drilled-pi"]').text()).toContain('ethernet')
    // Toggling the part's check off again un-addresses it, and the body stays.
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    await wrapper.get(partCheck('ethernet')).trigger('click')
    expect(selection.ids).toEqual(['shell', 'pi'])
    expect(selection.subPart).toBeNull()
    expect(wrapper.find('[data-testid="objects-drilled-pi"]').exists()).toBe(false)
  })

  it('Shift on a child row is the additive gesture, like Shift on a body row', async () => {
    const wrapper = mountPanel()
    const selection = useSelectionStore()
    await wrapper.get('[data-testid="objects-row-shell"]').trigger('click')
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    await wrapper.get(part('ethernet')).trigger('click', { shiftKey: true })
    expect(selection.ids).toEqual(['shell', 'pi'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  })

  it('the parent\'s check does not disturb the depth; a plain tap on the parent row steps back up', async () => {
    const wrapper = mountPanel()
    const selection = useSelectionStore()
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    await wrapper.get(part('ethernet')).trigger('click')
    await wrapper.get('[data-testid="objects-check-shell"]').trigger('click') // add shell, after the Pi
    expect(selection.ids).toEqual(['pi', 'shell'])
    expect(selection.subPart).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    await wrapper.get('[data-testid="objects-row-pi"]').trigger('click')
    expect(selection.ids).toEqual(['pi'])
    expect(selection.subPart).toBeNull()
  })

  it('part rows are buttons (never inputs — Ctrl+Z guard), and the checkbox role carries a name', async () => {
    const wrapper = mountPanel()
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    expect(wrapper.get(part('ethernet')).element.tagName).toBe('BUTTON')
    expect(wrapper.get(partCheck('ethernet')).element.tagName).toBe('BUTTON')
    expect(wrapper.get(partCheck('ethernet')).attributes('aria-label')).toMatch(/ethernet/)
    expect(wrapper.findAll('input')).toHaveLength(0)
  })

  it('in sketch mode the part rows are disabled with the printed reason, but the chevron still reads', async () => {
    const wrapper = mountPanel()
    useSketchModeStore().active = true
    await nextTick()
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    expect(wrapper.get(part('ethernet')).attributes('disabled')).toBeDefined()
    expect(wrapper.get(partCheck('ethernet')).attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="objects-expand-pi"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="objects-disabled-reason"]').text()).toMatch(/Sketch mode/)
    await wrapper.get(part('ethernet')).trigger('click')
    expect(useSelectionStore().ids).toEqual([])
  })

  it('a body deleted while expanded takes its child rows with it, without an error', async () => {
    const wrapper = mountPanel()
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    expect(wrapper.find(part('ethernet')).exists()).toBe(true)
    useDocumentStore().undo()
    await nextTick()
    expect(wrapper.find('[data-testid="objects-expand-pi"]').exists()).toBe(false)
    expect(wrapper.find(part('ethernet')).exists()).toBe(false)
  })
})
