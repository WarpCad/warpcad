// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { toRaw } from 'vue'

import { useDocumentStore } from './document.js'

/**
 * `TODO/ui-092`, part 2: the store builds the prompt index (`core/prompt.js` `promptIndex`) once
 * per document version, in a computed, so the prompts view never walks lineages per row or per
 * hover — and nothing but a version change rebuilds it.
 */
describe('documentStore.promptIndex (TODO/ui-092)', () => {
  const mcp = { origin: 'mcp' }

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /** @param {number} x */
  const cube = (x) => ({ op: 'primitive.cuboid', name: `Cube ${x}`, params: { size: [20, 20, 20], center: [x, 0, 10] } })

  it('is rebuilt when the version changes, and not otherwise', () => {
    const documentStore = useDocumentStore()
    const raw = toRaw(documentStore.raw)
    const first = raw.nextId('cuboid')
    documentStore.append({ id: first, ...cube(0) }, mcp)
    const prompt = raw.recordPrompt({ text: 'a cube', produced: [first] }, mcp)
    documentStore.refresh()

    const reads = vi.spyOn(raw, 'prompts')
    const index = documentStore.promptIndex
    expect(index.byPrompt.get(prompt.id)).toEqual([{ bodyId: first, role: 'made' }])
    expect(reads).toHaveBeenCalledTimes(1)

    // Read again, refreshed with no change, a measurement landing: the same index, never rebuilt.
    expect(documentStore.promptIndex).toBe(index)
    documentStore.refresh()
    documentStore.measureRevision += 1
    expect(documentStore.promptIndex).toBe(index)
    expect(reads).toHaveBeenCalledTimes(1)

    // A document change is a new version: rebuilt once, and it sees the new body.
    const second = raw.nextId('cuboid')
    documentStore.append({ id: second, ...cube(60) }, mcp)
    raw.addPromptProduced(prompt.id, [second], mcp)
    documentStore.refresh()
    const next = documentStore.promptIndex
    expect(next).not.toBe(index)
    expect(next.byPrompt.get(prompt.id)).toEqual([
      { bodyId: first, role: 'made' },
      { bodyId: second, role: 'made' },
    ])
    expect(documentStore.promptIndex).toBe(next)
    expect(reads).toHaveBeenCalledTimes(2)
  })
})
