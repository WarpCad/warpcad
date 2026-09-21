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
