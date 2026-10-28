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
