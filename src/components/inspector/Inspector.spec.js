// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

import Inspector from './Inspector.vue'
import { useDocumentStore } from '../../stores/document.js'
import { useHiddenPartVisibilityStore } from '../../stores/hiddenPartVisibility.js'
import { useSelectionStore } from '../../stores/selection.js'

enableAutoUnmount(afterEach)

/**
 * The Inspector as the one place that lists the scene (`TODO/ui-049`), at component level.
 *
 * What is pinned here is the state machine the task file spells out, not pixels: the list
 * is the whole content at 0 selected, a collapsible **Objects** section at 1 (collapsed) and
 * 2+ (expanded), the **Parts** section replaces `ui-047`'s hidden-only list, and the root
 * breadcrumb crumb re-opens the list. Reachability and the phone sheet's real layout are
 * `e2e/inspector-object-list.e2e.js`'s job.
 */
describe('Inspector — the object list (TODO/ui-049)', () => {
  let pinia
  /** @type {ReturnType<typeof useDocumentStore>} */
  let doc
  /** @type {ReturnType<typeof useSelectionStore>} */
  let selection

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    doc = useDocumentStore()
    selection = useSelectionStore()
  })

  function seed() {
    doc.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [0, 0, 20] } })
    doc.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12 } })
    doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: {} })
  }

  const mountInspector = () => mount(Inspector, { global: { plugins: [pinia] } })
  const rowNames = (wrapper) => wrapper.findAll('[data-testid="objects-row-name"]').map((node) => node.text())

  it('with nothing selected, the Inspector lists every body instead of "(nothing selected)"', () => {
    seed()
    const wrapper = mountInspector()
    expect(wrapper.text()).not.toContain('(nothing selected)')
    expect(rowNames(wrapper)).toEqual(['Cube 1', 'Bolt 1', 'Raspberry Pi 1'])
    // The whole content: not a collapsible section at 0 selected.
    expect(wrapper.get('[data-testid="inspector-objects"]').attributes('data-collapsible')).toBe('false')
  })

  it('an empty document shows the existing empty-state copy', () => {
    const wrapper = mountInspector()
    expect(wrapper.get('[data-testid="objects-empty"]').text()).toMatch(/No objects yet.*drag a shape in from the Library/)
  })

  it('the phone tab reads "Objects (n)" with nothing selected, and the body name once one is', async () => {
    seed()
    const wrapper = mountInspector()
    expect(wrapper.get('[data-testid="inspector-tab"]').text()).toBe('Objects (3)')
    selection.select('bolt')
    await nextTick()
    expect(wrapper.get('[data-testid="inspector-tab"]').text()).toBe('Bolt 1')
  })

  it('tapping the tab with nothing selected opens the sheet on the list, and reports it', async () => {
    seed()
    const wrapper = mountInspector()
    expect(wrapper.get('[data-testid="inspector"]').attributes('data-open')).toBe('false')
    await wrapper.get('[data-testid="inspector-tab"]').trigger('click')
    expect(wrapper.get('[data-testid="inspector"]').attributes('data-open')).toBe('true')
    expect(wrapper.emitted('sheet-change').at(-1)).toEqual(['open'])
    expect(wrapper.emitted('claim-sheet')).toHaveLength(1)
  })

  it('opening the list from the tab over the Library keeps it open once the Library has collapsed', async () => {
    seed()
    const wrapper = mount(Inspector, { props: { sheetSlotClaimed: true }, global: { plugins: [pinia] } })
    await wrapper.get('[data-testid="inspector-tab"]').trigger('click')
    expect(wrapper.emitted('claim-sheet')).toHaveLength(1)
    // AppView answers the claim by collapsing the Library, which releases the slot.
    await wrapper.setProps({ sheetSlotClaimed: false })
    expect(wrapper.get('[data-testid="inspector"]').attributes('data-open')).toBe('true')
    // ...and a sheet that takes the slot back does close it.
    await wrapper.setProps({ sheetSlotClaimed: true })
    expect(wrapper.get('[data-testid="inspector"]').attributes('data-open')).toBe('false')
  })

  it('unchecking the last row from inside the open sheet leaves it open on the list', async () => {
    seed()
    const wrapper = mountInspector()
    await wrapper.get('[data-testid="inspector-tab"]').trigger('click')
    await wrapper.get('[data-testid="objects-check-cube"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="inspector"]').attributes('data-open')).toBe('true')
    await wrapper.get('[data-testid="objects-check-cube"]').trigger('click')
    await nextTick()
    expect(selection.ids).toEqual([])
    expect(wrapper.get('[data-testid="inspector"]').attributes('data-open')).toBe('true')
  })

  it('a deselect made outside the list (empty viewport space) still closes the sheet', async () => {
    seed()
    selection.select('cube')
    const wrapper = mountInspector()
    expect(wrapper.get('[data-testid="inspector"]').attributes('data-open')).toBe('true')
    selection.clear()
    await nextTick()
    expect(wrapper.get('[data-testid="inspector"]').attributes('data-open')).toBe('false')
  })

  it('with nothing selected the collapsed tab is reported as a tab — it is on screen now', () => {
    seed()
    const wrapper = mountInspector()
    expect(wrapper.emitted('sheet-change').at(-1)).toEqual(['tab'])
  })

  it('an empty document has no tab to show — nothing to list, and the Library says what to do', () => {
    const wrapper = mountInspector()
    expect(wrapper.emitted('sheet-change').at(-1)).toEqual(['none'])
  })

  it('at 1 selected the Objects section is there but collapsed; one tap on its header opens it', async () => {
    seed()
    selection.select('cube')
    const wrapper = mountInspector()
    expect(wrapper.get('[data-testid="inspector-name"]').text()).toBe('Cube 1')
    const section = wrapper.get('[data-testid="inspector-objects"]')
    expect(section.attributes('data-collapsible')).toBe('true')
    const header = wrapper.get('[data-testid="inspector-objects-header"]')
    expect(header.attributes('aria-expanded')).toBe('false')
    expect(rowNames(wrapper)).toEqual([])
    await header.trigger('click')
    expect(wrapper.get('[data-testid="inspector-objects-header"]').attributes('aria-expanded')).toBe('true')
    expect(rowNames(wrapper)).toEqual(['Cube 1', 'Bolt 1', 'Raspberry Pi 1'])
  })

  it('at 2+ selected the list is open by default — where operand order matters most', async () => {
    seed()
    selection.select('cube')
    selection.toggle('bolt')
    const wrapper = mountInspector()
    expect(wrapper.get('[data-testid="inspector-multi"]').text()).toContain('2 selected')
    expect(wrapper.get('[data-testid="inspector-objects-header"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('[data-testid="objects-check-cube"]').text()).toBe('1')
    expect(wrapper.get('[data-testid="objects-check-bolt"]').text()).toBe('2')
  })

  it('the first check at 0 selected does not make the list vanish: body 2 is one more tap', async () => {
    seed()
    const wrapper = mountInspector()
    await wrapper.get('[data-testid="objects-check-cube"]').trigger('click')
    expect(selection.ids).toEqual(['cube'])
    await nextTick()
    expect(wrapper.get('[data-testid="inspector-name"]').text()).toBe('Cube 1')
    expect(wrapper.get('[data-testid="inspector-objects-header"]').attributes('aria-expanded')).toBe('true')
    await wrapper.get('[data-testid="objects-check-bolt"]').trigger('click')
    expect(selection.ids).toEqual(['cube', 'bolt'])
  })

  it('the breadcrumb has a root "Objects" crumb that opens the list, selection intact', async () => {
    seed()
    selection.select('pi')
    const wrapper = mountInspector()
    const crumb = wrapper.get('[data-testid="inspector-breadcrumb-root"]')
    expect(crumb.text()).toBe('Objects')
    expect(wrapper.find('[data-testid="inspector-breadcrumb-part"]').exists()).toBe(false)
    await crumb.trigger('click')
    expect(selection.ids).toEqual(['pi'])
    expect(wrapper.get('[data-testid="inspector-objects-header"]').attributes('aria-expanded')).toBe('true')
    expect(rowNames(wrapper)).toContain('Bolt 1')
  })

  it('drilled into a part the breadcrumb reads Objects ▸ group ▸ part', async () => {
    seed()
    selection.selectPart('pi', 'ethernet')
    const wrapper = mountInspector()
    expect(wrapper.get('[data-testid="inspector-breadcrumb"]').text().replace(/\s*▸\s*/g, ' ▸ ').trim()).toBe(
      'Objects ▸ Raspberry Pi 1 ▸ ethernet',
    )
  })

  it('a composite gets a Parts section listing ALL its parts, hidden ones labelled; the toggle moves in unchanged', async () => {
    seed()
    selection.select('bolt')
    const wrapper = mountInspector()
    const section = wrapper.get('[data-testid="inspector-parts"]')
    expect(section.find('h3').text()).toBe('Parts')
    const names = section.findAll('[data-testid^="inspector-part-item-"]').map((item) => item.attributes('data-testid'))
    expect(names).toEqual(
      ['head', 'thread', 'tap-head', 'tap-thread', 'tap-headClearSpace', 'tap'].map((name) => `inspector-part-item-${name}`),
    )
    // ui-047's hidden-only list is gone, replaced rather than duplicated.
    expect(wrapper.find('[data-testid="inspector-hidden-parts"]').exists()).toBe(false)
    const toggle = section.get('[data-testid="inspector-hidden-parts-toggle"]')
    expect(toggle.element.checked).toBe(false)
    await toggle.trigger('change')
    expect(useHiddenPartVisibilityStore().isShown('bolt')).toBe(true)
  })

  it("a Pi's Parts section lists its visible parts too — the board and the ethernet jack", () => {
    seed()
    selection.select('pi')
    const wrapper = mountInspector()
    expect(wrapper.find('[data-testid="inspector-part-item-ethernet"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="inspector-part-item-mb"]').exists()).toBe(true)
  })

  it('a bare solid gets no Parts section — absent, not disabled', () => {
    seed()
    selection.select('cube')
    const wrapper = mountInspector()
    expect(wrapper.find('[data-testid="inspector-parts"]').exists()).toBe(false)
  })
})
