// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — test doubles.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { SKETCH_TOOLS, useSketchEditorStore } from './sketchEditor.js'
import { emptySketchParams } from '../sketch/profile.js'

/**
 * The sketch editor's tool and selection transitions (`TODO/sketch-005`) — UI state only.
 * The `select` tool is first in the list, never draws, and the selection reads back as a
 * one-line status a person can understand without opening the Inspector.
 */
describe('sketch editor store — Select tool and selection (TODO/sketch-005)', () => {
  /** @type {ReturnType<typeof useSketchEditorStore>} */
  let editor
  beforeEach(() => {
    setActivePinia(createPinia())
    editor = useSketchEditorStore()
    editor.open({ bodyId: null, params: emptySketchParams(), frame: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })
  })

  const circle = (id, r, role = 'solid', c = [0, 0]) => ({ id, kind: 'circle', role, centerMm: c, radiusMm: r })

  it('lists Select first, ahead of the four drawing tools', () => {
    expect(SKETCH_TOOLS[0]).toBe('select')
    expect(SKETCH_TOOLS.slice(1)).toEqual(['line', 'rect', 'circle', 'polygon'])
  })

  it('arming Select ends an open Line chain, and keeps the selection', () => {
    editor.addToActiveSlice(circle('p1', 10))
    editor.selectProfile('p1')
    editor.chainId = 'p1'
    editor.setTool('select')
    expect(editor.tool).toBe('select')
    expect(editor.chainId).toBe('')
    expect(editor.selectedProfileId).toBe('p1')
  })

  it('names the selection: kind, role and its size', () => {
    editor.addToActiveSlice(circle('p1', 15, 'hole'))
    editor.addToActiveSlice({ id: 'p2', kind: 'rect', role: 'solid', centerMm: [0, 0], widthMm: 40, heightMm: 20 })
    editor.addToActiveSlice({ id: 'p3', kind: 'polygon', role: 'solid', centerMm: [0, 0], radiusMm: 8, sides: 6, rotationDeg: 0 })
    editor.addToActiveSlice({ id: 'p4', kind: 'polyline', role: 'solid', closed: false, pointsMm: [[0, 0], [10, 0], [10, 5]] })
    expect(editor.selectionStatus).toBe('')
    editor.selectProfile('p1')
    expect(editor.selectionStatus).toBe('Circle, Hole — 15 mm radius')
    editor.selectProfile('p2')
    expect(editor.selectionStatus).toBe('Rectangle, Solid — 40 × 20 mm')
    editor.selectProfile('p3')
    expect(editor.selectionStatus).toBe('Polygon, Solid — 6 sides, 8 mm radius')
    editor.selectProfile('p4')
    expect(editor.selectionStatus).toBe('Open outline, Solid — 3 points')
  })

  it('the status follows a Solid/Hole change', () => {
    editor.addToActiveSlice(circle('p1', 15))
    editor.selectProfile('p1')
    editor.setSelectedRole('hole')
    expect(editor.selectionStatus).toBe('Circle, Hole — 15 mm radius')
  })

  it('deleting the selection removes only that outline and clears the selection', () => {
    editor.addToActiveSlice(circle('p1', 15))
    editor.addToActiveSlice(circle('p2', 5, 'solid', [30, 0]))
    editor.selectProfile('p2')
    editor.deleteSelected()
    expect(editor.slice.profiles.map((p) => p.id)).toEqual(['p1'])
    expect(editor.selectedProfileId).toBe('')
    expect(editor.selectionStatus).toBe('')
  })

  it('a hover never changes the selection', () => {
    editor.addToActiveSlice(circle('p1', 15))
    editor.hoverProfileId = 'p1'
    expect(editor.selectedProfileId).toBe('')
    editor.close()
    expect(editor.hoverProfileId).toBe('')
  })
})
