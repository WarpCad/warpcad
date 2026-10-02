// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import { useHoverHighlightStore } from '../../stores/hoverHighlight.js'
import { useObjectListStore } from '../../stores/objectList.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useSketchEditorStore } from '../../stores/sketchEditor.js'
import { useTimelineStore } from '../../stores/timeline.js'
import ObjectList from './ObjectList.vue'

/**
 * `TODO/ui-041` — the object list at component level: what a row says, what each of its
 * two buttons does, and what the list prints when it cannot select. Ported from
 * `ObjectsPanel.spec.js` when `TODO/ui-049` moved the list into the Inspector: the panel
 * chrome (its open state, its header toggle) is gone, and every case about the rows
 * themselves is kept. The reachability half (mounted in the real root view, at three
 * viewports) is `e2e/inspector-object-list.e2e.js`.
 */
describe('ObjectList (TODO/ui-041, moved into the Inspector by ui-049)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const doc = useDocumentStore()
    doc.append({ id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [0, 0, 20] } })
    doc.append({ id: 'b', op: 'primitive.sphere', name: 'Sphere 1', params: { diameter: 20, center: [80, 0, 10] } })
  })

  const mountPanel = () => mount(ObjectList, { global: { plugins: [pinia] } })

  it('renders its rows as soon as it is mounted — it has no open state of its own', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('[data-testid="object-list"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="objects-row-name"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="objects-close"]').exists()).toBe(false)
  })

  it('shows a row per body with its name and size, and the selection count in the header', async () => {
    const wrapper = mountPanel()
    expect(wrapper.findAll('[data-testid="objects-row-name"]').map((n) => n.text())).toEqual(['Cube 1', 'Sphere 1'])
    expect(wrapper.get('[data-testid="objects-row-a"]').text()).toContain('40 × 40 × 40 mm')
    expect(wrapper.get('[data-testid="objects-count"]').text()).toBe('2 objects')

    useSelectionStore().select('a')
    await nextTick()
    expect(wrapper.get('[data-testid="objects-count"]').text()).toBe('2 objects · 1 selected')
  })

  it('a row click selects that body only; the check adds and removes — with the order on it', async () => {
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
    const wrapper = mountPanel()
    const check = wrapper.get('[data-testid="objects-check-a"]')
    // HistoryControls treats INPUT/TEXTAREA/SELECT as text entry and ignores undo there.
    expect(check.element.tagName).toBe('BUTTON')
    expect(wrapper.findAll('input')).toHaveLength(0)
  })

  it('says why it cannot select while History previews, and disables every row', async () => {
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
    const wrapper = mountPanel()
    expect(wrapper.get('[data-testid="objects-empty"]').text()).toMatch(/drag a shape in from the Library/)
  })
})

/**
 * `TODO/ui-042` — expandable part rows, at component level: what a chevron and a child row
 * say and do. The reachability half (mounted in the real root view, at three viewports,
 * with a real Subtract measured against the kernel) is `e2e/inspector-object-list.e2e.js`.
 */
describe('ObjectList — part rows (TODO/ui-042)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const doc = useDocumentStore()
    doc.append({ id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [100, 70, 40], center: [42, 27, 10] } })
    doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} })
  })

  const mountPanel = () => mount(ObjectList, { global: { plugins: [pinia] } })
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

  it('while a sketch is being edited the part rows are disabled with the printed reason, but the chevron still reads', async () => {
    const wrapper = mountPanel()
    useSketchEditorStore().active = true
    await nextTick()
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    expect(wrapper.get(part('ethernet')).attributes('disabled')).toBeDefined()
    expect(wrapper.get(partCheck('ethernet')).attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="objects-expand-pi"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="objects-disabled-reason"]').text()).toMatch(/Editing a sketch/)
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

/**
 * `TODO/ui-049` — hover-to-highlight. The list is the hover store's only writer. A mouse
 * pointer entering a row, or keyboard focus landing on it, names that body (or that one
 * part); touch never does, because touch has no hover and this task invents none.
 */
describe('ObjectList — hover (TODO/ui-049)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const doc = useDocumentStore()
    doc.append({ id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [100, 70, 40], center: [42, 27, 10] } })
    doc.append({ id: 'pi', op: 'raspberrypi.bplus', name: 'Raspberry Pi B+', params: {} })
  })

  const mountList = (props = {}) => mount(ObjectList, { props, global: { plugins: [pinia] } })
  const mouse = { pointerType: 'mouse' }

  it('a mouse entering a body row highlights that body; leaving clears it', async () => {
    const wrapper = mountList()
    const hover = useHoverHighlightStore()
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointermove', mouse)
    expect(hover.target).toEqual({ bodyId: 'shell', partName: null })
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointerleave', mouse)
    expect(hover.target).toBeNull()
  })

  it('a part row highlights only that part, not its whole body', async () => {
    const wrapper = mountList()
    const hover = useHoverHighlightStore()
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    await wrapper.get('[data-testid="objects-part-item-pi-ethernet"]').trigger('pointermove', mouse)
    expect(hover.target).toEqual({ bodyId: 'pi', partName: 'ethernet' })
    // Moving from the part back onto its parent row re-targets to the whole body.
    await wrapper.get('[data-testid="objects-part-item-pi-ethernet"]').trigger('pointerleave', mouse)
    await wrapper.get('[data-testid="objects-line-pi"]').trigger('pointermove', mouse)
    expect(hover.target).toEqual({ bodyId: 'pi', partName: null })
  })

  it('touch and pen never hover — a tap selects, and the selection highlight is the feedback', async () => {
    const wrapper = mountList()
    const hover = useHoverHighlightStore()
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointermove', { pointerType: 'touch' })
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointermove', { pointerType: 'pen' })
    expect(hover.target).toBeNull()
  })

  it('a mouse-typed pointerenter with no mouse movement (a reflow after a tap) is not a hover', async () => {
    // Found hand-driving at 390px WebKit: after a touch tap, the browser keeps a phantom
    // "mouse" at the tap point, and when the Inspector reflows it fires mouse-typed
    // pointerover/pointerenter at whatever row slid under it — with no pointermove at all.
    const wrapper = mountList()
    const hover = useHoverHighlightStore()
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointerenter', mouse)
    expect(hover.target).toBeNull()
    // A real mouse moves, and that is what counts.
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointermove', mouse)
    expect(hover.target).toEqual({ bodyId: 'shell', partName: null })
  })

  it('WebKit\'s phantom mouse: a mouse-typed pointermove at the exact point of the last tap is not a hover', async () => {
    // WebKit follows the reflow with a real-looking `pointermove` of type `mouse` — at the
    // very coordinates the finger lifted from. A mouse that moves anywhere else is real.
    const wrapper = mountList()
    const hover = useHoverHighlightStore()
    // jsdom's MouseEvent has read-only coordinates, so build the events by hand.
    const pointer = (type, pointerType, clientX, clientY) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        pointerType: { value: pointerType },
        clientX: { value: clientX },
        clientY: { value: clientY },
      })
      return event
    }
    const line = wrapper.get('[data-testid="objects-line-shell"]').element
    window.dispatchEvent(pointer('pointerdown', 'touch', 120, 300))
    line.dispatchEvent(pointer('pointermove', 'mouse', 120, 300))
    await nextTick()
    expect(hover.target).toBeNull()
    line.dispatchEvent(pointer('pointermove', 'mouse', 140, 310))
    await nextTick()
    expect(hover.target).toEqual({ bodyId: 'shell', partName: null })
  })

  it('moving within the hovered row writes nothing more', async () => {
    const wrapper = mountList()
    const hover = useHoverHighlightStore()
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointermove', mouse)
    const first = hover.target
    let changes = 0
    hover.$subscribe(() => { changes += 1 }, { flush: 'sync' })
    for (let i = 0; i < 20; i += 1) await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointermove', mouse)
    expect(hover.target).toBe(first)
    expect(changes).toBe(0)
  })

  it('a tap that focuses a button is not keyboard focus — touch still invents no hover', async () => {
    const wrapper = mountList()
    const hover = useHoverHighlightStore()
    // A real tap: pointerdown on the row, then the browser focuses the button it landed on.
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointerdown', { pointerType: 'touch' })
    await wrapper.get('[data-testid="objects-check-shell"]').trigger('focusin')
    expect(hover.target).toBeNull()
  })

  it('keyboard focus on a row counts as hover, and blur clears it', async () => {
    const wrapper = mountList()
    const hover = useHoverHighlightStore()
    await wrapper.get('[data-testid="objects-row-shell"]').trigger('focusin')
    expect(hover.target).toEqual({ bodyId: 'shell', partName: null })
    await wrapper.get('[data-testid="objects-row-shell"]').trigger('focusout')
    expect(hover.target).toBeNull()
    await wrapper.get('[data-testid="objects-check-pi"]').trigger('focusin')
    expect(hover.target).toEqual({ bodyId: 'pi', partName: null })
  })

  it('unmounting the list (a selection change swaps the Inspector content) clears the hover', async () => {
    const wrapper = mountList()
    const hover = useHoverHighlightStore()
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointermove', mouse)
    wrapper.unmount()
    expect(hover.target).toBeNull()
  })

  it('unmounting a list that did not set the hover leaves someone else\'s hover alone', async () => {
    const a = mountList()
    const b = mountList({ mode: 'parts', bodyId: 'pi' })
    const hover = useHoverHighlightStore()
    await b.get('[data-testid="inspector-part-item-ethernet"]').trigger('pointermove', mouse)
    a.unmount()
    expect(hover.target).toEqual({ bodyId: 'pi', partName: 'ethernet' })
  })

  it('hovering is view state: it selects nothing', async () => {
    const wrapper = mountList()
    await wrapper.get('[data-testid="objects-line-shell"]').trigger('pointermove', mouse)
    expect(useSelectionStore().ids).toEqual([])
  })

  it('a selecting gesture announces itself first, so the Inspector can tell a list tap from a viewport click', async () => {
    const wrapper = mountList()
    await wrapper.get('[data-testid="objects-check-shell"]').trigger('click')
    await wrapper.get('[data-testid="objects-row-pi"]').trigger('click')
    expect(wrapper.emitted('select-intent')).toHaveLength(2)
    // Expanding selects nothing, so it announces nothing.
    await wrapper.get('[data-testid="objects-expand-pi"]').trigger('click')
    expect(wrapper.emitted('select-intent')).toHaveLength(2)
  })
})

/**
 * `TODO/ui-049` — the Inspector's **Parts** section is the same part-row rendering, for one
 * body: every part in group order, hidden ones labelled, the same two gestures, and the same
 * hover. It replaces `ui-047`'s hidden-only list.
 */
describe('ObjectList — parts mode, the Inspector\'s Parts section (TODO/ui-049)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const doc = useDocumentStore()
    doc.append({ id: 'shell', op: 'primitive.cuboid', name: 'Shell 1', params: { size: [40, 40, 40], center: [0, 0, 20] } })
    doc.append({ id: 'bolt', op: 'hardware.bolt', name: 'Bolt 1', params: { spec: 'm10 hex', length: 12 } })
    useSelectionStore().select('bolt')
  })

  const mountParts = () => mount(ObjectList, { props: { mode: 'parts', bodyId: 'bolt' }, global: { plugins: [pinia] } })

  it('lists every part, visible then hidden, with hidden ones labelled — and no body rows', () => {
    const wrapper = mountParts()
    const items = wrapper.findAll('[data-testid^="inspector-part-item-"]')
    expect(items.map((item) => item.attributes('data-testid').replace('inspector-part-item-', ''))).toEqual([
      'head',
      'thread',
      'tap-head',
      'tap-thread',
      'tap-headClearSpace',
      'tap',
    ])
    expect(items.map((item) => item.attributes('data-hidden'))).toEqual(['false', 'false', 'true', 'true', 'true', 'true'])
    expect(wrapper.get('[data-testid="inspector-part-hidden-tap"]').text()).toBe('hidden')
    expect(wrapper.find('[data-testid="inspector-part-hidden-head"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="objects-row-"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="objects-count"]').exists()).toBe(false)
  })

  it('a tap drills to that part, a check toggles its address — the same gestures as the list', async () => {
    const wrapper = mountParts()
    const selection = useSelectionStore()
    await wrapper.get('[data-testid="inspector-part-tap"]').trigger('click')
    expect(selection.ids).toEqual(['bolt'])
    expect(selection.subPart).toEqual({ bodyId: 'bolt', partName: 'tap' })
    await wrapper.get('[data-testid="inspector-part-check-tap"]').trigger('click')
    expect(selection.subPart).toBeNull()
    expect(selection.ids).toEqual(['bolt'])
  })

  it('hovering a part row names that part of this body', async () => {
    const wrapper = mountParts()
    await wrapper.get('[data-testid="inspector-part-item-tap"]').trigger('pointermove', { pointerType: 'mouse' })
    expect(useHoverHighlightStore().target).toEqual({ bodyId: 'bolt', partName: 'tap' })
  })

  it('renders nothing for a bare solid — absent, not disabled', () => {
    const wrapper = mount(ObjectList, { props: { mode: 'parts', bodyId: 'shell' }, global: { plugins: [pinia] } })
    expect(wrapper.find('[data-testid^="inspector-part-item-"]').exists()).toBe(false)
  })
})
