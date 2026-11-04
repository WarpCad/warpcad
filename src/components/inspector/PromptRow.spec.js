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
 * The Inspector's **Prompt** row (`TODO/ai-031`), after `TODO/ui-092` part 5: a compact link to
 * the Prompts view and nothing else. One prompt reads **Made by** and its first line, then **›**;
 * several read a count. The request text, the reply and **Add reply…** never render here (they
 * live in the Prompts view, `src/components/ai/PromptReply.spec.js`), and several prompts' texts
 * are never joined into one row. Text only, never markup. The link's wording, its click and its
 * hover are covered in `PromptsView.spec.js`.
 */

const mcp = { origin: 'mcp' }
const cube = (id, x = 0) => ({ id, op: 'primitive.cuboid', name: `Cube ${id}`, params: { size: [10, 10, 10], center: [x, 0, 5] } })

const FIRST = 'a 140 × 250 mm fan duct, 1.6 mm walls\nwith a 45° chamfer at the lip'
const SECOND = 'now a mounting tab'

function setup() {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  const raw = documentStore.raw
  raw.append(cube('c1'), mcp)
  raw.append(cube('c2', 20), mcp)
  raw.append(cube('c3', 40), { origin: 'local' })
  const first = raw.recordPrompt({ text: FIRST }, mcp)
  raw.addPromptProduced(first.id, ['c1'], mcp)
  const second = raw.recordPrompt({ text: SECOND }, mcp)
  raw.addPromptProduced(second.id, ['c2'], mcp)
  raw.addPromptResponse(first.id, 'Built the fan duct: 140 × 250 mm outside.', mcp)
  documentStore.refresh()
  return { documentStore, first: first.id, second: second.id }
}

/** Nothing of the old surface: no request text, no reply, no Add reply…. */
function expectLinkOnly(wrapper) {
  expect(wrapper.find('[data-testid="inspector-prompt-text"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="prompt-reply"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="prompt-reply-text"]').exists()).toBe(false)
  expect(wrapper.find('[data-testid="prompt-reply-add"]').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('Built the fan duct')
  expect(wrapper.text()).not.toContain('Add reply')
  expect(wrapper.findAll('button')).toHaveLength(1)
}

describe('PromptRow — the compact link only (TODO/ui-092, part 5)', () => {
  it('one prompt: the row is the link, Made by and the first line only; no request text, reply or Add reply…', () => {
    setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1'] } })
    const row = wrapper.get('[data-testid="inspector-prompt"]')
    const link = row.get('[data-testid="inspector-prompt-link"]')
    expect(link.get('[data-testid="inspector-prompt-link-lead"]').text()).toBe('Made by')
    expect(link.get('[data-testid="inspector-prompt-link-text"]').text()).toBe('a 140 × 250 mm fan duct, 1.6 mm walls')
    expect(row.text()).not.toContain('with a 45° chamfer at the lip')
    expect(link.attributes('aria-expanded')).toBeUndefined()
    expectLinkOnly(wrapper)
  })

  it('a body two prompts made: a count, and neither text, never the two joined', () => {
    const { documentStore } = setup()
    const third = documentStore.raw.recordPrompt({ text: 'and make the first one taller' }, mcp)
    documentStore.raw.addPromptProduced(third.id, ['c1'], mcp)
    documentStore.refresh()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1'] } })
    expect(wrapper.get('[data-testid="inspector-prompt-link-lead"]').text()).toBe('2 prompts')
    expect(wrapper.find('[data-testid="inspector-prompt-link-text"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('fan duct')
    expect(wrapper.text()).not.toContain('taller')
    expectLinkOnly(wrapper)
  })

  it('renders nothing for a body no prompt produced', () => {
    setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c3'] } })
    expect(wrapper.find('[data-testid="inspector-prompt"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="inspector-prompt-link"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="prompt-reply-add"]').exists()).toBe(false)
  })

  it('several bodies selected: the same link — "2 prompts", no text, no reply', () => {
    setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c1', 'c2', 'c3'] } })
    const row = wrapper.get('[data-testid="inspector-prompt"]')
    expect(row.get('[data-testid="inspector-prompt-link-lead"]').text()).toBe('2 prompts')
    expect(row.text()).not.toContain('fan duct')
    expect(row.text()).not.toContain(SECOND)
    expectLinkOnly(wrapper)
    // One prompt behind several bodies: the one-prompt link, not a "1 prompt" count.
    const one = mount(PromptRow, { props: { bodyIds: ['c1', 'c3'] } })
    expect(one.get('[data-testid="inspector-prompt-link-lead"]').text()).toBe('Made by')
    expectLinkOnly(one)
  })

  it('is inert text: <img onerror> is shown, never run', () => {
    const { documentStore } = setup()
    const raw = documentStore.raw
    const hostile = raw.recordPrompt({ text: '<img src=x onerror="window.__pwned=1"><b>x</b>' }, mcp)
    raw.addPromptProduced(hostile.id, ['c3'], mcp)
    documentStore.refresh()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c3'] } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('b').exists()).toBe(false)
    expect(wrapper.get('[data-testid="inspector-prompt-link-text"]').text()).toBe('<img src=x onerror="window.__pwned=1"><b>x</b>')
  })

  it('follows the document: a prompt linked later appears', async () => {
    const { documentStore } = setup()
    const wrapper = mount(PromptRow, { props: { bodyIds: ['c3'] } })
    expect(wrapper.find('[data-testid="inspector-prompt"]').exists()).toBe(false)
    const raw = documentStore.raw
    const prompt = raw.recordPrompt({ text: 'late' }, mcp)
    raw.addPromptProduced(prompt.id, ['c3'], mcp)
    documentStore.refresh()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="inspector-prompt-link-text"]').text()).toBe('late')
    expectLinkOnly(wrapper)
  })
})
