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
import { emptySketchParams } from '../sketch/profile.js'
import { useDeleteShortcut } from './useDeleteShortcut.js'

/**
 * Delete/Backspace while the sketch editor is open act on the selected *outline*, never
 * the body underneath (`TODO/sketch-005`) — and outside the editor they are unchanged.
 */
describe('useDeleteShortcut (TODO/ui-051, yielding to the sketch editor by TODO/sketch-005)', () => {
  let pinia
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    const doc = useDocumentStore()
    doc.append({ id: 'a', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [40, 40, 40], center: [0, 0, 20] } })
    mount(defineComponent({ setup: () => (useDeleteShortcut(), () => h('div')) }), { global: { plugins: [pinia] } })
  })

  const press = (key, target = window) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    return event
  }

  function openEditorWithOutline() {
    const editor = useSketchEditorStore()
    editor.open({ bodyId: null, params: emptySketchParams(), frame: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })
    editor.addToActiveSlice({ id: 'p1', kind: 'circle', role: 'solid', centerMm: [0, 0], radiusMm: 10 })
    return editor
  }

  it('outside the editor, Delete still deletes the selected body', () => {
    useSelectionStore().select('a')
    press('Delete')
    expect(useDocumentStore().bodies).toHaveLength(0)
  })

  it('inside the editor, Delete removes the selected outline and leaves the body alone', () => {
    useSelectionStore().select('a')
    const editor = openEditorWithOutline()
    editor.selectProfile('p1')
    const event = press('Delete')
    expect(editor.slice.profiles).toHaveLength(0)
    expect(editor.selectedProfileId).toBe('')
    expect(useDocumentStore().bodies).toHaveLength(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('inside the editor, Backspace does the same', () => {
    const editor = openEditorWithOutline()
    editor.selectProfile('p1')
    press('Backspace')
    expect(editor.slice.profiles).toHaveLength(0)
  })

  it('inside the editor with nothing selected, it does nothing at all', () => {
    useSelectionStore().select('a')
    const editor = openEditorWithOutline()
    press('Delete')
    expect(editor.slice.profiles).toHaveLength(1)
    expect(useDocumentStore().bodies).toHaveLength(1)
  })

  it('a text field keeps its own Backspace, even in the editor', () => {
    const editor = openEditorWithOutline()
    editor.selectProfile('p1')
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('Backspace', input)
    expect(editor.slice.profiles).toHaveLength(1)
    input.remove()
  })
})
