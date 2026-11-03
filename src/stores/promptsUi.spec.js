// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { usePromptsUiStore } from './promptsUi.js'
import { useVariablesUiStore } from './variablesUi.js'

/**
 * The Prompts view's UI state (`TODO/ui-092`, part 3): which row is expanded, which rows a part's
 * link filtered the list to, and which row to bring into view. UI only — never document state.
 */
describe('promptsUi (TODO/ui-092)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('open() shows the Prompts view, unfiltered and nothing expanded', () => {
    const prompts = usePromptsUiStore()
    prompts.open()
    expect(useVariablesUiStore().view).toBe('prompts')
    expect(prompts.filterIds).toBeNull()
    expect(prompts.expandedId).toBe('')
  })

  it('a link to one request opens it expanded and asks for it to be scrolled into view', () => {
    const prompts = usePromptsUiStore()
    prompts.openFor(['prompt-a-1'], 'Cube 1')
    expect(useVariablesUiStore().view).toBe('prompts')
    expect(prompts.expandedId).toBe('prompt-a-1')
    expect(prompts.revealId).toBe('prompt-a-1')
    expect(prompts.filterIds).toBeNull()
  })

  it('a link to several requests filters the list to them, labelled, and expands none', () => {
    const prompts = usePromptsUiStore()
    prompts.openFor(['prompt-a-1', 'prompt-a-2'], 'Cube 1')
    expect(prompts.filterIds).toEqual(['prompt-a-1', 'prompt-a-2'])
    expect(prompts.filterLabel).toBe('Cube 1')
    expect(prompts.expandedId).toBe('')
    prompts.showAll()
    expect(prompts.filterIds).toBeNull()
    expect(prompts.filterLabel).toBe('')
  })

  it('toggle expands one row at a time; a second toggle collapses it', () => {
    const prompts = usePromptsUiStore()
    prompts.toggle('prompt-a-1')
    expect(prompts.expandedId).toBe('prompt-a-1')
    prompts.toggle('prompt-a-2')
    expect(prompts.expandedId).toBe('prompt-a-2')
    prompts.toggle('prompt-a-2')
    expect(prompts.expandedId).toBe('')
  })

  it('close() returns to the Inspector and forgets the expansion and the filter', () => {
    const prompts = usePromptsUiStore()
    prompts.openFor(['prompt-a-1', 'prompt-a-2'], 'Cube 1')
    prompts.toggle('prompt-a-1')
    prompts.close()
    expect(useVariablesUiStore().view).toBe('inspector')
    expect(prompts.expandedId).toBe('')
    expect(prompts.filterIds).toBeNull()
  })
})
