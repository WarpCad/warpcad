// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useDocumentStore } from './document.js'

/**
 * `TODO/ui-092`, part 4 on the store: thin wrappers over core's prompt edits, each the local
 * user's, each one step on the top-bar Undo with its label, and a refusal that leaves everything
 * as it was (the component says it in words).
 */

const mcp = { origin: 'mcp' }

function setup() {
  const documentStore = useDocumentStore()
  documentStore.appendAll([{ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }])
  const raw = documentStore.raw
  const p1 = raw.recordPrompt({ text: 'Part one', produced: ['cube-1'] }, mcp)
  const p2 = raw.recordPrompt({ text: 'Part two' }, mcp)
  raw.addPromptResponse(p1.id, 'Reply one', mcp)
  raw.addPromptResponse(p2.id, 'Reply two', mcp)
  documentStore.refresh()
  return { documentStore, p1, p2 }
}

describe('the document store’s prompt edits (TODO/ui-092 part 4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('each edit is one undo step with its label, and Undo takes exactly that step back', () => {
    const { documentStore, p1, p2 } = setup()
    const before = documentStore.raw.prompts()
    const baseLabel = documentStore.undoLabel
    /** @type {[string, () => unknown][]} */
    const steps = [
      ['Edit request', () => documentStore.editPromptText(p1.id, 'Part one, edited')],
      ['Edit reply', () => documentStore.editPromptReply(p1.id, 'Reply one, edited')],
      ['Remove reply', () => documentStore.removePromptReply(p2.id)],
      ['Combine requests', () => documentStore.combinePrompts(p1.id, p2.id)],
      ['Remove request', () => documentStore.removePrompt(p1.id)],
    ]
    for (const [label, run] of steps) {
      const version = documentStore.version
      run()
      expect(documentStore.version).toBeGreaterThan(version)
      expect(documentStore.undoLabel).toBe(label)
    }
    for (const [label] of [...steps].reverse()) {
      expect(documentStore.undo()).toMatchObject({ ok: true, label })
    }
    expect(documentStore.raw.prompts().map((p) => [p.text, p.responses?.map((r) => r.text)])).toEqual(
      before.map((p) => [p.text, p.responses?.map((r) => r.text)])
    )
    // Only the setup's own placement is left on the list.
    expect(documentStore.undoLabel).toBe(baseLabel)
    expect(documentStore.redo()).toMatchObject({ ok: true, label: 'Edit request' })
    expect(documentStore.raw.promptOf(p1.id)?.text).toBe('Part one, edited')
  })

  it('a refusal throws in words and leaves the prompts, the version and the undo list unchanged', () => {
    const { documentStore, p1, p2 } = setup()
    const before = documentStore.raw.prompts()
    const version = documentStore.version
    const baseLabel = documentStore.undoLabel
    expect(() => documentStore.editPromptText(p1.id, 'x'.repeat(20_001))).toThrow(/over the cap of 20000/)
    expect(() => documentStore.editPromptReply(p1.id, '   ')).toThrow(/empty/)
    expect(() => documentStore.combinePrompts(p2.id, p1.id)).toThrow(/not the next request/)
    expect(documentStore.raw.prompts()).toEqual(before)
    expect(documentStore.version).toBe(version)
    expect(documentStore.undoLabel).toBe(baseLabel)
  })
})
