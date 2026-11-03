// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import { useHoverHighlightStore } from '../../stores/hoverHighlight.js'
import { usePromptsUiStore } from '../../stores/promptsUi.js'
import { useSelectionStore } from '../../stores/selection.js'
import { useVariablesUiStore } from '../../stores/variablesUi.js'
import { PRESS_FOCUS_MS } from '../../composables/usePromptHighlight.js'
import PromptsView from './PromptsView.vue'
import PromptRow from './PromptRow.vue'

/**
 * `TODO/ui-092`, part 3 — the Prompts view and the Inspector's link to it. Two requests over
 * overlapping bodies: the first made c1 and c2, the second made c3 and moved c2. A third only
 * defined a variable; a fourth made a cube that was deleted.
 */

const mcp = { origin: 'mcp' }
const local = { origin: 'local' }
const cube = (id, x = 0) => ({ id, op: 'primitive.cuboid', name: `Cube ${id}`, params: { size: [10, 10, 10], center: [x, 0, 5] } })

function setup() {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  documentStore.append(cube('c1'), mcp)
  documentStore.append(cube('c2', 20), mcp)
  const first = documentStore.raw.recordPrompt({ text: 'Two cubes\nside by side, 10 mm' }, mcp)
  documentStore.raw.addPromptProduced(first.id, ['c1', 'c2'], mcp)
  documentStore.append(cube('c3', 40), mcp)
  const terminal = documentStore.raw.bodies().find((body) => body.id === 'c2').recordId
  documentStore.append({ id: 'mv1', op: 'transform.translate', supersedes: terminal, target: terminal, params: { vector: [0, 5, 0], rotation: [0, 0, 0] } }, mcp)
  const second = documentStore.raw.recordPrompt({ text: '<b>a third</b> cube, and move the second' }, mcp)
  documentStore.raw.addPromptProduced(second.id, ['c3', 'mv1'], mcp)
  documentStore.raw.addPromptResponse(second.id, 'Done.', mcp)
  documentStore.refresh()
  return { documentStore, first: first.id, second: second.id }
}

function openView() {
  usePromptsUiStore().open()
  return mount(PromptsView, { attachTo: document.body })
}

const item = (wrapper, id) => wrapper.get(`[data-testid="prompts-item"][data-prompt-id="${id}"]`)

describe('PromptsView', () => {
  it('lists every request oldest first: first line, N parts, Reply / No reply; text only', () => {
    const { first, second } = setup()
    const wrapper = openView()
    const rows = wrapper.findAll('[data-testid="prompts-row"]')
    expect(rows.map((row) => row.attributes('data-prompt-id'))).toEqual([first, second])
    expect(rows[0].get('[data-testid="prompts-row-text"]').text()).toBe('Two cubes')
    expect(rows[0].get('[data-testid="prompts-row-parts"]').text()).toBe('2 parts')
    expect(rows[0].get('[data-testid="prompts-row-reply"]').text()).toBe('No reply')
    expect(rows[1].get('[data-testid="prompts-row-parts"]').text()).toBe('2 parts')
    expect(rows[1].get('[data-testid="prompts-row-reply"]').text()).toBe('Reply')
    expect(rows[1].text()).toContain('<b>a third</b>')
    expect(wrapper.find('b').exists()).toBe(false)
    expect(rows[0].attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-testid="prompt-reply-add"]').exists()).toBe(false)
  })

  it('No parts left for a request whose parts are gone; No parts for a variables-only one', async () => {
    const { documentStore } = setup()
    documentStore.append(cube('gone', 80), mcp)
    const lost = documentStore.raw.recordPrompt({ text: 'a cube I will delete' }, mcp)
    documentStore.raw.addPromptProduced(lost.id, ['gone'], mcp)
    const vars = documentStore.raw.recordPrompt({ text: 'think about it' }, mcp)
    documentStore.deleteBodies(['gone'])
    documentStore.refresh()
    const wrapper = openView()
    expect(item(wrapper, lost.id).get('[data-testid="prompts-row-parts"]').text()).toBe('No parts left')
    expect(item(wrapper, vars.id).get('[data-testid="prompts-row-parts"]').text()).toBe('No parts')
  })

  it('expanding a row shows the whole request, one Add reply…, its parts with roles, and lights its parts', async () => {
    const { first, second } = setup()
    const hover = useHoverHighlightStore()
    const wrapper = openView()
    await item(wrapper, second).get('[data-testid="prompts-row"]').trigger('click')
    const row = item(wrapper, second)
    expect(row.get('[data-testid="prompts-row"]').attributes('aria-expanded')).toBe('true')
    expect(row.get('[data-testid="prompts-row-full"]').text()).toBe('<b>a third</b> cube, and move the second')
    expect(row.findAll('[data-testid="prompt-reply-add"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="prompt-reply-add"]')).toHaveLength(1)
    const parts = row.findAll('[data-testid="prompts-part"]')
    expect(parts.map((part) => [part.attributes('data-body-id'), part.get('[data-testid="prompts-part-role"]').text()])).toEqual([
      ['c2', 'Changed'],
      ['c3', 'Made'],
    ])
    expect(hover.many).toEqual(['c2', 'c3'])
    expect(row.get('[data-testid="prompts-row-highlighting"]').text()).toBe('Highlighting 2 parts')

    // One row at a time: expanding the first collapses the second and lights the first's parts.
    await item(wrapper, first).get('[data-testid="prompts-row"]').trigger('click')
    expect(item(wrapper, second).attributes('data-expanded')).toBe('false')
    expect(hover.many).toEqual(['c1', 'c2'])
    // Collapsing clears it.
    await item(wrapper, first).get('[data-testid="prompts-row"]').trigger('click')
    expect(hover.many).toBeNull()
  })

  it('a mouse over a row lights its parts and wins over the expanded row; a touch lights nothing', async () => {
    const { first, second } = setup()
    const hover = useHoverHighlightStore()
    const wrapper = openView()
    await item(wrapper, first).get('[data-testid="prompts-row"]').trigger('click')
    expect(hover.many).toEqual(['c1', 'c2'])
    await item(wrapper, second).trigger('pointermove', { pointerType: 'mouse' })
    expect(hover.many).toEqual(['c2', 'c3'])
    expect(item(wrapper, first).find('[data-testid="prompts-row-highlighting"]').exists()).toBe(false)
    await item(wrapper, second).trigger('pointerleave', { pointerType: 'mouse' })
    expect(hover.many).toEqual(['c1', 'c2'])
    await item(wrapper, second).trigger('pointermove', { pointerType: 'touch' })
    expect(hover.many).toEqual(['c1', 'c2'])
  })

  it('a mouse over one part row lights only that part; leaving returns to the row', async () => {
    const { second } = setup()
    const hover = useHoverHighlightStore()
    const wrapper = openView()
    await item(wrapper, second).get('[data-testid="prompts-row"]').trigger('click')
    const c3 = item(wrapper, second).get('[data-testid="prompts-part"][data-body-id="c3"]')
    await c3.trigger('pointermove', { pointerType: 'mouse' })
    expect(hover.many).toBeNull()
    expect(hover.target).toEqual({ bodyId: 'c3', partName: null })
    expect(hover.hoveredBodyIds).toEqual(['c3'])
    expect(item(wrapper, second).get('[data-testid="prompts-row-highlighting"]').text()).toBe('Highlighting 1 part')
    await c3.trigger('pointerleave', { pointerType: 'mouse' })
    expect(hover.target).toBeNull()
    expect(hover.many).toEqual(['c2', 'c3'])
  })

  it('keyboard focus on a row lights it; a press’s own focus does not', async () => {
    const { first } = setup()
    const hover = useHoverHighlightStore()
    const wrapper = openView()
    const row = item(wrapper, first).get('[data-testid="prompts-row"]')
    await row.trigger('focus')
    expect(hover.many).toEqual(['c1', 'c2'])
    await row.trigger('blur')
    expect(hover.many).toBeNull()
    await item(wrapper, first).trigger('pointerdown')
    await row.trigger('focus')
    expect(hover.many).toBeNull()
    expect(PRESS_FOCUS_MS).toBeGreaterThan(0)
  })

  it('a hidden part says hidden and lights nothing', async () => {
    const { documentStore, first } = setup()
    documentStore.setViewHidden('c1', { hidden: true })
    const hover = useHoverHighlightStore()
    const wrapper = openView()
    await item(wrapper, first).get('[data-testid="prompts-row"]').trigger('click')
    const c1 = item(wrapper, first).get('[data-testid="prompts-part"][data-body-id="c1"]')
    expect(c1.get('[data-testid="prompts-part-hidden"]').text()).toBe('hidden')
    expect(hover.many).toEqual(['c2'])
    expect(item(wrapper, first).get('[data-testid="prompts-row-highlighting"]').text()).toBe('Highlighting 1 part')
    await c1.trigger('pointermove', { pointerType: 'mouse' })
    expect(hover.hoveredBodyIds).toEqual([])
  })

  it('a body leaving the scene leaves the lit set (ui-049); unmounting clears it', async () => {
    const { documentStore, first } = setup()
    const hover = useHoverHighlightStore()
    const wrapper = openView()
    await item(wrapper, first).get('[data-testid="prompts-row"]').trigger('click')
    expect(hover.many).toEqual(['c1', 'c2'])
    documentStore.deleteBodies(['c1'])
    await wrapper.vm.$nextTick()
    expect(hover.many).toEqual(['c2'])
    wrapper.unmount()
    expect(hover.many).toBeNull()
  })

  it('tapping a part row selects it and returns to the Inspector', async () => {
    const { second } = setup()
    const wrapper = openView()
    await item(wrapper, second).get('[data-testid="prompts-row"]').trigger('click')
    await item(wrapper, second).get('[data-testid="prompts-part"][data-body-id="c3"]').trigger('click')
    expect(useSelectionStore().ids).toEqual(['c3'])
    expect(useVariablesUiStore().view).toBe('inspector')
  })

  it('marks the rows behind a body selected while the view is open', async () => {
    const { first, second } = setup()
    const wrapper = openView()
    useSelectionStore().select('c1')
    await wrapper.vm.$nextTick()
    expect(item(wrapper, first).attributes('data-marked')).toBe('true')
    expect(item(wrapper, second).attributes('data-marked')).toBe('false')
  })

  it('filtered by a link: only those rows, For <part> · Show all', async () => {
    const { first, second } = setup()
    usePromptsUiStore().openFor([first, second], 'Cube c2')
    const wrapper = mount(PromptsView)
    expect(wrapper.get('[data-testid="prompts-view-filter"]').text()).toContain('For Cube c2')
    expect(wrapper.findAll('[data-testid="prompts-row"]')).toHaveLength(2)
    usePromptsUiStore().filterIds = Object.freeze([second])
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('[data-testid="prompts-row"]').map((row) => row.attributes('data-prompt-id'))).toEqual([second])
    await wrapper.get('[data-testid="prompts-view-show-all"]').trigger('click')
    expect(wrapper.findAll('[data-testid="prompts-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="prompts-view-filter"]').exists()).toBe(false)
  })
})

describe('PromptRow — the link to the Prompts view (TODO/ui-092)', () => {
  it('one prompt: Made by and its first line; it opens that request expanded', async () => {
    const { first } = setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1'] } })
    const link = wrapper.get('[data-testid="inspector-prompt-link"]')
    expect(link.get('[data-testid="inspector-prompt-link-lead"]').text()).toBe('Made by')
    expect(link.get('[data-testid="inspector-prompt-link-text"]').text()).toBe('Two cubes')
    await link.trigger('click')
    expect(useVariablesUiStore().view).toBe('prompts')
    expect(usePromptsUiStore().expandedId).toBe(first)
  })

  it('one prompt that changed it: Changed by', () => {
    setActivePinia(createPinia())
    const documentStore = useDocumentStore()
    documentStore.append(cube('c1'), local)
    const terminal = documentStore.raw.bodies()[0].recordId
    documentStore.append({ id: 'mv', op: 'transform.translate', supersedes: terminal, target: terminal, params: { vector: [5, 0, 0], rotation: [0, 0, 0] } }, mcp)
    const prompt = documentStore.raw.recordPrompt({ text: 'move it 5 mm' }, mcp)
    documentStore.raw.addPromptProduced(prompt.id, ['mv'], mcp)
    documentStore.refresh()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1'] } })
    expect(wrapper.get('[data-testid="inspector-prompt-link-lead"]').text()).toBe('Changed by')
  })

  it('made by one and changed by another: Made by 1, changed by 1 ›, filtered to both', async () => {
    const { first, second } = setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c2'] } })
    const link = wrapper.get('[data-testid="inspector-prompt-link"]')
    expect(link.get('[data-testid="inspector-prompt-link-lead"]').text()).toBe('Made by 1, changed by 1')
    expect(link.find('[data-testid="inspector-prompt-link-text"]').exists()).toBe(false)
    expect(link.attributes('data-prompt-ids')).toBe(`${first},${second}`)
    await link.trigger('click')
    expect(usePromptsUiStore().filterIds).toEqual([first, second])
    expect(usePromptsUiStore().filterLabel).toBe('Cube c2')
  })

  it('several bodies, roles that match: 2 prompts ›', () => {
    setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1', 'c3'] } })
    expect(wrapper.get('[data-testid="inspector-prompt-link-lead"]').text()).toBe('2 prompts')
  })

  it('no link for a body no prompt made', () => {
    setup()
    useDocumentStore().append(cube('mine', 90), local)
    const wrapper = mount(PromptRow, { props: { bodyIds: ['mine'] } })
    expect(wrapper.find('[data-testid="inspector-prompt-link"]').exists()).toBe(false)
  })

  it('a mouse over the link lights the request’s parts; leaving clears them', async () => {
    setup()
    const hover = useHoverHighlightStore()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c3'] } })
    const link = wrapper.get('[data-testid="inspector-prompt-link"]')
    await link.trigger('pointermove', { pointerType: 'mouse' })
    expect(hover.many).toEqual(['c2', 'c3'])
    await link.trigger('pointerleave', { pointerType: 'mouse' })
    expect(hover.many).toBeNull()
  })
})
