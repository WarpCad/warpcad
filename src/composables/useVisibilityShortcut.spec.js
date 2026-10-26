// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — test doubles.
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'

enableAutoUnmount(afterEach)

import { useDocumentStore } from '../stores/document.js'
import { useSelectionStore } from '../stores/selection.js'
import { useSketchEditorStore } from '../stores/sketchEditor.js'
import { useVisibilityShortcut } from './useVisibilityShortcut.js'

/**
 * `H` hides (or shows) the selection and `Shift+H` is Show all (`TODO/ui-089`) — secondary to
 * the Objects list's eyes, which are the route a phone has. Not in the sketch editor, not
 * while a text field has focus, not with Ctrl/Cmd/Alt held, and not on key repeat.
 */
describe('useVisibilityShortcut (TODO/ui-089)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const doc = useDocumentStore()
    doc.append({ id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [0, 0, 20] } })
    doc.append({ id: 'b', op: 'primitive.cuboid', name: 'Cube 2', params: { size: [10, 10, 10], center: [60, 0, 5] } })
    mount(defineComponent({ setup: () => (useVisibilityShortcut(), () => h('div')) }), { global: { plugins: [pinia] } })
  })

  const press = (key, options = {}, target = window) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
    target.dispatchEvent(event)
    return event
  }

  const hiddenIds = () => useDocumentStore().bodies.filter((body) => body.viewHidden).map((body) => body.id)

  it('H hides the selected body and takes it out of the selection', () => {
    useSelectionStore().select('a')
    const event = press('h')
    expect(hiddenIds()).toEqual(['a'])
    expect(useSelectionStore().count).toBe(0)
    expect(event.defaultPrevented).toBe(true)
  })

  it('H on a hidden body ticked from the list shows it again', () => {
    useDocumentStore().setViewHidden('b', { hidden: true })
    useSelectionStore().select('b')
    press('h')
    expect(hiddenIds()).toEqual([])
  })

  it('Shift+H is Show all', () => {
    useDocumentStore().setViewHidden('a', { hidden: true })
    useDocumentStore().setViewHidden('b', { hidden: true })
    press('H', { shiftKey: true })
    expect(hiddenIds()).toEqual([])
  })

  it('does nothing with nothing selected, and leaves the key alone', () => {
    const event = press('h')
    expect(hiddenIds()).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  it('is inactive while a text field has focus', () => {
    useSelectionStore().select('a')
    const input = document.createElement('input')
    document.body.append(input)
    press('h', {}, input)
    input.remove()
    expect(hiddenIds()).toEqual([])
  })

  it('is inactive in the sketch editor', () => {
    useSelectionStore().select('a')
    useSketchEditorStore().active = true
    press('h')
    press('H', { shiftKey: true })
    expect(hiddenIds()).toEqual([])
  })

  it('ignores Ctrl/Cmd/Alt chords and auto-repeat', () => {
    useSelectionStore().select('a')
    press('h', { ctrlKey: true })
    press('h', { metaKey: true })
    press('h', { altKey: true })
    press('h', { repeat: true })
    expect(hiddenIds()).toEqual([])
  })
})
