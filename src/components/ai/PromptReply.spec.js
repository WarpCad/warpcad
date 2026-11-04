// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck
import { createPinia, setActivePinia } from 'pinia'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../../stores/document.js'
import { usePromptsUiStore } from '../../stores/promptsUi.js'
import PromptsView from '../inspector/PromptsView.vue'

/**
 * `TODO/ai-032` — the reply under the request, and **Add reply…**: one undo step through the
 * document store, as the local user. Moved from `PromptRow.spec.js` by `TODO/ui-092` part 5: the
 * reply now lives in its request's expanded row in the Prompts view, so these drive it there, with
 * the same test ids.
 */

const mcp = { origin: 'mcp' }
const cube = (id, x = 0) => ({ id, op: 'primitive.cuboid', name: `Cube ${id}`, params: { size: [10, 10, 10], center: [x, 0, 5] } })

function setup() {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  const raw = documentStore.raw
  raw.append(cube('c1'), mcp)
  raw.append(cube('c2', 20), mcp)
  const first = raw.recordPrompt({ text: 'a 140 × 250 mm fan duct, 1.6 mm walls' }, mcp)
  raw.addPromptProduced(first.id, ['c1'], mcp)
  const second = raw.recordPrompt({ text: 'now a mounting tab' }, mcp)
  raw.addPromptProduced(second.id, ['c2'], mcp)
  documentStore.refresh()
  return { documentStore, first: first.id }
}

/** The Prompts view with the first request's row expanded; returns that row. */
async function expandFirst(first) {
  usePromptsUiStore().open()
  const wrapper = mount(PromptsView, { attachTo: document.body })
  const item = () => wrapper.get(`[data-testid="prompts-item"][data-prompt-id="${first}"]`)
  await item().get('[data-testid="prompts-row"]').trigger('click')
  return { wrapper, item }
}

describe('PromptReply — in the Prompts view', () => {
  it('shows a saved reply under the request, collapsed with Show all when long; text only', async () => {
    const { documentStore, first } = setup()
    const long = `Placed it.\n\n## Problems met\n- <img src=x onerror="window.__pwned=1"> @name\n${'line\n'.repeat(10)}`
    documentStore.raw.addPromptResponse(first, long, mcp)
    documentStore.refresh()
    const { wrapper, item } = await expandFirst(first)
    const text = item().get('[data-testid="prompt-reply-text"]')
    expect(text.text()).toContain('Problems met')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(text.classes()).toContain('reply__text--collapsed')
    const toggle = item().get('[data-testid="prompt-reply-toggle"]')
    expect(toggle.text()).toBe('Show all')
    await toggle.trigger('click')
    expect(text.classes()).not.toContain('reply__text--collapsed')
  })

  it('Add reply… appends through the store as one local undo step; Undo removes it; Cancel adds nothing', async () => {
    const { documentStore, first } = setup()
    const { wrapper, item } = await expandFirst(first)
    expect(item().find('[data-testid="prompt-reply-text"]').exists()).toBe(false)
    await item().get('[data-testid="prompt-reply-add"]').trigger('click')
    await item().get('[data-testid="prompt-reply-input"]').setValue('not this one')
    await item().get('[data-testid="prompt-reply-cancel"]').trigger('click')
    expect(documentStore.raw.prompts()[0]).not.toHaveProperty('responses')

    await item().get('[data-testid="prompt-reply-add"]').trigger('click')
    expect(item().get('[data-testid="prompt-reply-submit"]').attributes('disabled')).toBeDefined()
    await item().get('[data-testid="prompt-reply-input"]').setValue('The duct is 140 × 250 mm.')
    await item().get('[data-testid="prompt-reply-form"]').trigger('submit')
    expect(item().find('[data-testid="prompt-reply-form"]').exists()).toBe(false)
    expect(item().get('[data-testid="prompt-reply-text"]').text()).toBe('The duct is 140 × 250 mm.')
    expect(documentStore.raw.pendingUndo()?.label).toBe('Add reply')

    expect(documentStore.undo().ok).toBe(true)
    await wrapper.vm.$nextTick()
    expect(item().find('[data-testid="prompt-reply-text"]').exists()).toBe(false)
  })

  it('says why a reply was refused, leaving the form open', async () => {
    const { documentStore, first } = setup()
    documentStore.raw.addPromptResponse(first, 'a'.repeat(20_000), mcp)
    documentStore.refresh()
    const { item } = await expandFirst(first)
    await item().get('[data-testid="prompt-reply-add"]').trigger('click')
    await item().get('[data-testid="prompt-reply-input"]').setValue('more')
    await item().get('[data-testid="prompt-reply-form"]').trigger('submit')
    expect(item().get('[data-testid="prompt-reply-problem"]').text()).toMatch(/full/)
    expect(item().find('[data-testid="prompt-reply-form"]').exists()).toBe(true)
  })
})
