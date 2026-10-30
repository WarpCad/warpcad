// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import PromptRow from './PromptRow.vue'

/**
 * `TODO/ai-031` — the Inspector's **Prompt** row: the request an agent was given, for a selected
 * body it produced. Collapsed by default; text only, never markup. With several bodies
 * selected it counts the prompts and shows no text.
 */

const mcp = { origin: 'mcp' }
const cube = (id, x = 0) => ({ id, op: 'primitive.cuboid', name: `Cube ${id}`, params: { size: [10, 10, 10], center: [x, 0, 5] } })

function setup() {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  const raw = documentStore.raw
  raw.append(cube('c1'), mcp)
  raw.append(cube('c2', 20), mcp)
  raw.append(cube('c3', 40), { origin: 'local' })
  const first = raw.recordPrompt({ text: 'a 140 × 250 mm fan duct, 1.6 mm walls' }, mcp)
  raw.addPromptProduced(first.id, ['c1'], mcp)
  const second = raw.recordPrompt({ text: 'now a mounting tab' }, mcp)
  raw.addPromptProduced(second.id, ['c2'], mcp)
  documentStore.version += 1
  return documentStore
}

describe('PromptRow', () => {
  it('shows the prompt for one selected body, collapsed; a tap expands it', async () => {
    setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1'] } })
    const row = wrapper.get('[data-testid="inspector-prompt"]')
    expect(row.text()).toContain('Prompt')
    expect(row.text()).toContain('a 140 × 250 mm fan duct, 1.6 mm walls')
    expect(row.attributes('aria-expanded')).toBe('false')
    expect(row.classes()).toContain('prompt--collapsed')
    await row.trigger('click')
    expect(row.attributes('aria-expanded')).toBe('true')
    expect(row.classes()).not.toContain('prompt--collapsed')
  })

  it('renders nothing for a body no prompt produced', () => {
    setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c3'] } })
    expect(wrapper.find('[data-testid="inspector-prompt"]').exists()).toBe(false)
  })

  it('with several bodies selected: "N prompts", and no text', () => {
    setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1', 'c2', 'c3'] } })
    const row = wrapper.get('[data-testid="inspector-prompt"]')
    expect(row.text()).toBe('2 prompts')
    expect(row.text()).not.toContain('fan duct')
    const one = mount(PromptRow, { props: { bodyIds: ['c1', 'c3'] } })
    expect(one.get('[data-testid="inspector-prompt"]').text()).toBe('1 prompt')
  })

  it('is inert text: <img onerror> is shown, never run', () => {
    setup()
    const documentStore = useDocumentStore()
    const raw = documentStore.raw
    const hostile = raw.recordPrompt({ text: '<img src=x onerror="window.__pwned=1"><b>x</b>' }, mcp)
    raw.addPromptProduced(hostile.id, ['c3'], mcp)
    documentStore.version += 1
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c3'] } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.get('[data-testid="inspector-prompt"]').text()).toContain('<img src=x onerror="window.__pwned=1"><b>x</b>')
  })

  it('follows the document: a prompt linked later appears', async () => {
    const documentStore = setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c3'] } })
    expect(wrapper.find('[data-testid="inspector-prompt"]').exists()).toBe(false)
    const raw = documentStore.raw
    const prompt = raw.recordPrompt({ text: 'late' }, mcp)
    raw.addPromptProduced(prompt.id, ['c3'], mcp)
    documentStore.version += 1
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="inspector-prompt"]').text()).toContain('late')
  })
})

/**
 * `TODO/ai-032` — the reply under the request, and **Add reply…**: one undo step through the
 * document store, as the local user.
 */
describe('PromptRow — the reply', () => {
  it('shows a saved reply under the request, collapsed with Show all when long; text only', async () => {
    const documentStore = setup()
    const [first] = documentStore.raw.prompts()
    const long = `Placed it.\n\n## Problems met\n- <img src=x onerror="window.__pwned=1"> @name\n${'line\n'.repeat(10)}`
    documentStore.raw.addPromptResponse(first.id, long, mcp)
    documentStore.version += 1
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1'] } })
    const text = wrapper.get('[data-testid="prompt-reply-text"]')
    expect(text.text()).toContain('Problems met')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(text.classes()).toContain('reply__text--collapsed')
    const toggle = wrapper.get('[data-testid="prompt-reply-toggle"]')
    expect(toggle.text()).toBe('Show all')
    await toggle.trigger('click')
    expect(text.classes()).not.toContain('reply__text--collapsed')
  })

  it('shows no reply and no Add reply… for several selected bodies', () => {
    setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1', 'c2'] } })
    expect(wrapper.find('[data-testid="prompt-reply"]').exists()).toBe(false)
  })

  it('Add reply… appends through the store as one local undo step; Undo removes it; Cancel adds nothing', async () => {
    const documentStore = setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1'] } })
    expect(wrapper.find('[data-testid="prompt-reply-text"]').exists()).toBe(false)
    await wrapper.get('[data-testid="prompt-reply-add"]').trigger('click')
    await wrapper.get('[data-testid="prompt-reply-input"]').setValue('not this one')
    await wrapper.get('[data-testid="prompt-reply-cancel"]').trigger('click')
    expect(documentStore.raw.prompts()[0]).not.toHaveProperty('responses')

    await wrapper.get('[data-testid="prompt-reply-add"]').trigger('click')
    expect(wrapper.get('[data-testid="prompt-reply-submit"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="prompt-reply-input"]').setValue('The duct is 140 × 250 mm.')
    await wrapper.get('[data-testid="prompt-reply-form"]').trigger('submit')
    expect(wrapper.find('[data-testid="prompt-reply-form"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="prompt-reply-text"]').text()).toBe('The duct is 140 × 250 mm.')
    expect(documentStore.raw.pendingUndo()?.label).toBe('Add reply')

    expect(documentStore.undo().ok).toBe(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-testid="prompt-reply-text"]').exists()).toBe(false)
  })

  it('says why a reply was refused, leaving the form open', async () => {
    const documentStore = setup()
    const [first] = documentStore.raw.prompts()
    documentStore.raw.addPromptResponse(first.id, 'a'.repeat(20_000), mcp)
    documentStore.version += 1
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1'] } })
    await wrapper.get('[data-testid="prompt-reply-add"]').trigger('click')
    await wrapper.get('[data-testid="prompt-reply-input"]').setValue('more')
    await wrapper.get('[data-testid="prompt-reply-form"]').trigger('submit')
    expect(wrapper.get('[data-testid="prompt-reply-problem"]').text()).toMatch(/full/)
    expect(wrapper.find('[data-testid="prompt-reply-form"]').exists()).toBe(true)
  })
})
