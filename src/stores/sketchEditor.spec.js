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

/**
 * Vertex editing on a selected outline (`TODO/sketch-002`): a selected point, the contextual
 * Delete (a point when one is picked, else the outline — sketch-005's toolbar Delete and
 * Delete/Backspace share it), Convert to outline and Simplify. Every edit lands in the
 * draft; nothing reaches the document until Done.
 */
describe('sketch editor store — vertex editing (TODO/sketch-002)', () => {
  /** @type {ReturnType<typeof useSketchEditorStore>} */
  let editor
  beforeEach(() => {
    setActivePinia(createPinia())
    editor = useSketchEditorStore()
    editor.open({ bodyId: null, params: emptySketchParams(), frame: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })
  })

  const square = (id = 'p1') => ({ id, kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 0], [10, 10], [0, 10]] })

  it('selecting a point needs a selected outline, and picking another outline clears it', () => {
    editor.addToActiveSlice(square())
    editor.addToActiveSlice({ ...square('p2'), pointsMm: [[20, 0], [30, 0], [30, 10]] })
    editor.selectVertex(1)
    expect(editor.selectedVertex).toBe(-1)
    editor.selectProfile('p1')
    editor.selectVertex(1)
    expect(editor.selectedVertex).toBe(1)
    expect(editor.selectedVertexMm).toEqual([10, 0])
    expect(editor.selectionStatus).toBe('Closed outline, Solid — 4 points · point 2 selected')
    editor.selectProfile('p2')
    expect(editor.selectedVertex).toBe(-1)
  })

  it('moves a point in the draft, and only that point', () => {
    editor.addToActiveSlice(square())
    editor.selectProfile('p1')
    editor.moveVertex(2, [12, 15])
    expect(editor.selectedProfile.pointsMm).toEqual([[0, 0], [10, 0], [12, 15], [0, 10]])
  })

  it('inserting a point selects the new one', () => {
    editor.addToActiveSlice(square())
    editor.selectProfile('p1')
    const index = editor.insertVertexOn(2)
    expect(index).toBe(3)
    expect(editor.selectedVertex).toBe(3)
    expect(editor.selectedVertexMm).toEqual([5, 10])
  })

  it('Delete is contextual: a picked point goes first, and then the outline', () => {
    editor.addToActiveSlice({ ...square(), pointsMm: [[0, 0], [10, 0], [10, 10], [5, 15], [0, 10]] })
    editor.selectProfile('p1')
    editor.selectVertex(3)
    expect(editor.deleteTarget).toBe('vertex')
    expect(editor.deleteProblem).toBe('')
    editor.deleteSelection()
    expect(editor.selectedProfile.pointsMm).toHaveLength(4)
    expect(editor.selectedVertex).toBe(-1)
    expect(editor.deleteTarget).toBe('outline')
    editor.selectVertex(0)
    editor.deleteSelection()
    expect(editor.selectedProfile.pointsMm).toHaveLength(3)
    // 3 → 2 is refused, with the reason, and never falls through to deleting the outline.
    editor.selectVertex(0)
    expect(editor.deleteProblem).toBe('An outline needs at least 3 points')
    editor.deleteSelection()
    expect(editor.slice.profiles).toHaveLength(1)
    expect(editor.selectedProfile.pointsMm).toHaveLength(3)
    // With no point picked, the outline goes.
    editor.selectVertex(-1)
    editor.deleteSelection()
    expect(editor.slice.profiles).toHaveLength(0)
  })

  it('Convert to outline swaps the selected rectangle for an equal polyline, keeping the selection', () => {
    editor.addToActiveSlice({ id: 'p1', kind: 'rect', role: 'hole', centerMm: [0, 0], widthMm: 20, heightMm: 10 })
    editor.selectProfile('p1')
    editor.convertSelectedToOutline()
    expect(editor.selectedProfile).toMatchObject({ id: 'p1', kind: 'polyline', role: 'hole', closed: true })
    expect(editor.selectedProfile.pointsMm).toHaveLength(4)
    expect(editor.selectionStatus).toBe('Closed outline, Hole — 4 points')
  })

  it('Simplify thins the selected outline, or says why it cannot', () => {
    const ring = Array.from({ length: 200 }, (_, i) => [30 * Math.cos((i / 200) * Math.PI * 2), 30 * Math.sin((i / 200) * Math.PI * 2)])
    editor.addToActiveSlice({ id: 'p1', kind: 'polyline', role: 'solid', closed: true, pointsMm: ring })
    editor.selectProfile('p1')
    editor.selectVertex(5)
    expect(editor.simplifySelected(0.5)).toBe('')
    expect(editor.selectedProfile.pointsMm.length).toBeLessThan(40)
    expect(editor.selectedVertex).toBe(-1)
    expect(editor.simplifySelected(100)).toMatch(/fewer than 3 points/)
    expect(editor.selectedProfile.pointsMm.length).toBeGreaterThan(3)
  })

  it('arming a drawing tool clears the picked point (its dots are Select-only), and keeps the outline', () => {
    editor.addToActiveSlice(square())
    editor.selectProfile('p1')
    editor.setTool('select')
    editor.selectVertex(2)
    editor.setTool('select')
    expect(editor.selectedVertex).toBe(2)
    editor.setTool('rect')
    expect(editor.selectedVertex).toBe(-1)
    expect(editor.selectedProfileId).toBe('p1')
    expect(editor.deleteTarget).toBe('outline')
  })

  it('an edit that removes the selected point’s index clears it (Cancel/slice switch too)', () => {
    editor.addToActiveSlice(square())
    editor.selectProfile('p1')
    editor.selectVertex(3)
    editor.setActiveSlice(0)
    expect(editor.selectedVertex).toBe(-1)
  })
})

describe('sketch editor store — continuous Line chain (TODO/sketch-006)', () => {
  /** @type {ReturnType<typeof useSketchEditorStore>} */
  let editor
  const opts = { closeToleranceMm: 2, minLengthMm: 0.5 }
  beforeEach(() => {
    setActivePinia(createPinia())
    editor = useSketchEditorStore()
    editor.open({ bodyId: null, params: emptySketchParams(), frame: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] })
    editor.setTool('line')
  })
  const points = () => editor.slice.profiles[0]?.pointsMm

  it('the first fixed vertex only starts a chain; the second makes the outline', () => {
    expect(editor.fixChainVertex([0, 0], opts)).toBe('started')
    expect(editor.chainLive).toBe(true)
    expect(editor.slice.profiles).toHaveLength(0)
    expect(editor.fixChainVertex([10, 0], opts)).toBe('added')
    expect(points()).toEqual([[0, 0], [10, 0]])
    expect(editor.chainId).toBe('p1')
  })

  it('draws a triangle and closes it on the first vertex; the chain then ends, unselected', () => {
    for (const p of [[0, 0], [10, 0], [10, 10]]) editor.fixChainVertex(p, opts)
    expect(editor.fixChainVertex([0.4, 0.2], opts)).toBe('closed')
    expect(editor.slice.profiles[0].closed).toBe(true)
    expect(editor.chainLive).toBe(false)
    expect(editor.selectedProfileId).toBe('')
  })

  it('ignores a degenerate vertex and a close at 2 vertices', () => {
    editor.fixChainVertex([0, 0], opts)
    expect(editor.fixChainVertex([0.1, 0], opts)).toBe('ignored')
    editor.fixChainVertex([10, 0], opts)
    expect(editor.fixChainVertex([0.2, 0.2], opts)).toBe('ignored')
    expect(points()).toHaveLength(2)
  })

  it('finishChain keeps a one-segment chain as an open outline and ends the chain', () => {
    editor.fixChainVertex([0, 0], opts)
    editor.fixChainVertex([10, 0], opts)
    editor.finishChain()
    expect(editor.chainLive).toBe(false)
    expect(editor.slice.profiles).toHaveLength(1)
    expect(editor.slice.profiles[0].closed).toBe(false)
  })

  it('finishChain with only a start point leaves nothing behind', () => {
    editor.fixChainVertex([0, 0], opts)
    editor.finishChain()
    expect(editor.chainLive).toBe(false)
    expect(editor.slice.profiles).toHaveLength(0)
  })

  it('undoPoint pops the last vertex and keeps the chain live; the only segment discards it', () => {
    for (const p of [[0, 0], [10, 0], [10, 10]]) editor.fixChainVertex(p, opts)
    editor.undoPoint()
    expect(points()).toEqual([[0, 0], [10, 0]])
    expect(editor.chainLive).toBe(true)
    editor.undoPoint()
    expect(editor.slice.profiles).toHaveLength(0)
    expect(editor.chainLive).toBe(false)
  })

  it('undoPoint with only the start point clears it', () => {
    editor.fixChainVertex([0, 0], opts)
    editor.undoPoint()
    expect(editor.chainLive).toBe(false)
  })

  it('cancelChain removes the whole unfinished chain', () => {
    for (const p of [[0, 0], [10, 0], [10, 10]]) editor.fixChainVertex(p, opts)
    editor.cancelChain()
    expect(editor.slice.profiles).toHaveLength(0)
    expect(editor.chainLive).toBe(false)
  })

  it('switching tool finishes the chain and keeps it open', () => {
    editor.fixChainVertex([0, 0], opts)
    editor.fixChainVertex([10, 0], opts)
    editor.setTool('rect')
    expect(editor.chainLive).toBe(false)
    expect(editor.slice.profiles).toHaveLength(1)
  })

  it('switching tool with only a start point discards it', () => {
    editor.fixChainVertex([0, 0], opts)
    editor.setTool('circle')
    expect(editor.chainLive).toBe(false)
    expect(editor.slice.profiles).toHaveLength(0)
  })
})

describe('sketch editor store — snapping toggle (TODO/sketch-007)', () => {
  beforeEach(() => setActivePinia(createPinia()))
  const frame = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

  it('is on by default and survives closing and reopening the editor in the same session', () => {
    const editor = useSketchEditorStore()
    expect(editor.snapEnabled).toBe(true)
    editor.open({ bodyId: null, params: emptySketchParams(), frame })
    editor.toggleSnap()
    expect(editor.snapEnabled).toBe(false)
    editor.close()
    editor.open({ bodyId: null, params: emptySketchParams(), frame })
    expect(editor.snapEnabled).toBe(false)
    editor.toggleSnap()
    expect(editor.snapEnabled).toBe(true)
  })
})
