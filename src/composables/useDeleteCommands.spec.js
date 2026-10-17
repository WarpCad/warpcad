// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { piBoltRepeated } from '../core/__fixtures__/piScenes.js'
import { useDocumentStore } from '../stores/document.js'
import { useRepeatStore } from '../stores/repeat.js'
import { useSelectionStore } from '../stores/selection.js'
import { useDeleteCommands } from './useDeleteCommands.js'

/**
 * Delete on a linked Repeat (`TODO/ui-069`, the controls for `TODO/core-061` decisions 7 and 8):
 * one member at a time, and what happens to the repeats when the body they follow is deleted.
 * The user's own scene: Bolt 1 on a Pi 5's hole1, repeated on hole2–hole4 as `rep-1`.
 */

function scene() {
  setActivePinia(createPinia())
  const documentStore = useDocumentStore()
  documentStore.load(piBoltRepeated().entries.map((entry) => ({ ...entry })))
  return { documentStore, selection: useSelectionStore(), repeat: useRepeatStore(), commands: useDeleteCommands() }
}

/** @param {ReturnType<typeof useDocumentStore>} documentStore */
const targetsOf = (documentStore) => /** @type {any} */ (documentStore.raw.recordOf('rep-1'))?.params?.targets

describe('deleting one repeat', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('drilled into hole3 of the repeat body, Delete removes that one repeat — one Undo step', () => {
    const { documentStore, selection, commands } = scene()
    selection.select('rep-1')
    selection.drillInto('hole3')
    expect(commands.enabled.value).toBe(true)
    expect(commands.label.value).toBe('Remove this repeat')
    expect(commands.describe.value).toBe('Remove the repeat on hole3')
    expect(commands.run()).toBe(true)
    expect(targetsOf(documentStore)).toEqual(['hole2', 'hole4'])
    expect(commands.error.value).toBe('')
    expect(documentStore.undo().ok).toBe(true)
    expect(targetsOf(documentStore)).toEqual(['hole2', 'hole3', 'hole4'])
  })

  it('drilled into a member’s own hidden part (hole3.tap), Delete still removes the member', () => {
    const { documentStore, selection, commands } = scene()
    selection.select('rep-1')
    selection.drillInto('hole3.tap')
    expect(commands.describe.value).toBe('Remove the repeat on hole3')
    expect(commands.run()).toBe(true)
    expect(targetsOf(documentStore)).toEqual(['hole2', 'hole4'])
  })

  it('the last member is not refused as a "last visible part": it removes the repeat body', () => {
    const { documentStore, selection, commands } = scene()
    for (const target of ['hole2', 'hole3']) {
      selection.select('rep-1')
      selection.drillInto(target)
      commands.run()
    }
    selection.select('rep-1')
    selection.drillInto('hole4')
    expect(commands.reason.value).toBe('')
    expect(commands.run()).toBe(true)
    expect(documentStore.bodies.some((body) => body.id === 'rep-1')).toBe(false)
  })
})

describe('deleting the body the repeats follow', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('asks first — Delete the repeats too, or Leave them broken — instead of failing', () => {
    const { documentStore, selection, repeat, commands } = scene()
    const before = documentStore.raw.entries.length
    selection.select('bolt-1')
    expect(commands.run()).toBe(false)
    expect(commands.error.value).toBe('')
    expect(documentStore.raw.entries.length).toBe(before)
    expect(repeat.deleteConfirm).toEqual({
      ids: ['bolt-1'],
      followers: [{ id: 'rep-1', name: 'Bolt 1 ×3' }],
      question: 'Bolt 1 ×3 follows Bolt 1. Delete the repeats too, or leave them broken?',
    })
  })

  it('Delete the repeats: both go, as one Undo step', () => {
    const { documentStore, selection, repeat, commands } = scene()
    const before = documentStore.raw.entries.length
    selection.select('bolt-1')
    commands.run()
    expect(commands.resolveDelete('with-repeats')).toBe(true)
    expect(repeat.deleteConfirm).toBeNull()
    expect(documentStore.bodies.some((body) => body.id === 'bolt-1' || body.id === 'rep-1')).toBe(false)
    expect(documentStore.undo().ok).toBe(true)
    expect(documentStore.raw.entries.length).toBe(before)
  })

  it('Leave broken: the source goes, the repeat stays in History as a broken row', () => {
    const { documentStore, selection, commands } = scene()
    selection.select('bolt-1')
    commands.run()
    expect(commands.resolveDelete('leave-broken')).toBe(true)
    expect(documentStore.bodies.some((body) => body.id === 'bolt-1')).toBe(false)
    expect(documentStore.raw.brokenSteps().map((step) => step.id)).toContain('rep-1')
  })

  it('Cancel deletes nothing', () => {
    const { documentStore, selection, repeat, commands } = scene()
    const before = documentStore.raw.entries.length
    selection.select('bolt-1')
    commands.run()
    expect(commands.resolveDelete(null)).toBe(false)
    expect(repeat.deleteConfirm).toBeNull()
    expect(documentStore.raw.entries.length).toBe(before)
  })

  it('deleting the seed body (the Pi) asks the same question', () => {
    const { selection, repeat, commands } = scene()
    selection.select('pi-1')
    commands.run()
    expect(repeat.deleteConfirm?.followers).toEqual([{ id: 'rep-1', name: 'Bolt 1 ×3' }])
  })

  it('selecting the source and its repeat together needs no question', () => {
    const { documentStore, selection, repeat, commands } = scene()
    selection.selectMany(['bolt-1', 'rep-1'])
    expect(commands.run()).toBe(true)
    expect(repeat.deleteConfirm).toBeNull()
    expect(documentStore.bodies.some((body) => body.id === 'bolt-1' || body.id === 'rep-1')).toBe(false)
  })
})
