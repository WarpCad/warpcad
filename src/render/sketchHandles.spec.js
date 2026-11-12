// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createOrbitCamera } from './camera.js'
import { createSketchHandles } from './sketchHandles.js'

/**
 * `createSketchHandles` is framework-free: the real orbit camera lays the dots out, and the sketch
 * editor is a plain object with the fields and methods the store exposes. The outline is a real
 * `polyline` profile in sketch millimetres.
 */

/** An identity frame: sketch X/Y on world X/Y, sketch Z on world Z. */
const FRAME = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

/** A closed 10 mm square, the outline the editor has selected. */
const SQUARE = { id: 'a', kind: 'polyline', role: 'solid', closed: true, pointsMm: [[0, 0], [10, 0], [10, 10], [0, 10]] }

/**
 * @param {object} [options]
 * @param {string} [options.tool]
 * @param {any} [options.selectedProfile]
 */
function setup({ tool = 'select', selectedProfile = SQUARE } = {}) {
  const orbit = createOrbitCamera()
  const draft = { id: 'draft', slices: [] }
  const editor = {
    tool,
    selectedProfile,
    frame: FRAME,
    selectedVertex: -1,
    hoverVertex: -1,
    selectedVertexMm: null,
    draft,
    insertVertexOn: vi.fn(() => -1),
    selectVertex: vi.fn((index) => {
      editor.selectedVertex = index
      editor.selectedVertexMm = selectedProfile ? selectedProfile.pointsMm[index] : null
    }),
    moveVertex: vi.fn(),
    setDraft: vi.fn(),
  }
  const layout = { vertices: /** @type {any[]} */ ([]), midpoints: /** @type {any[]} */ ([]) }
  const viewport = { left: 0, top: 0 }
  const deps = {
    orbit,
    editor,
    sliceZ: () => 0,
    widthPx: () => 800,
    heightPx: () => 600,
    viewport,
    layout,
    projectToSketch: vi.fn((clientX, clientY) => [clientX, clientY]),
    snap: vi.fn(() => false),
    hideSnap: vi.fn(),
    isTouchPress: vi.fn(() => false),
    requestPreview: vi.fn(),
  }
  const handles = createSketchHandles(deps)
  return { handles, deps, editor, layout, orbit, draft }
}

describe('createSketchHandles: layout', () => {
  it('lays a dot on every point of the selected outline while Select is armed', () => {
    const { handles, layout } = setup()
    handles.sync()
    expect(layout.vertices.length).toBe(SQUARE.pointsMm.length)
    expect(layout.vertices[0].index).toBe(0)
    expect(layout.vertices[0].xMm).toBe(0)
  })

  it('shows no handles while a drawing tool is armed, so a press on a stroke draws', () => {
    const { handles, layout } = setup({ tool: 'rect' })
    handles.sync()
    expect(layout.vertices.length).toBe(0)
    expect(layout.midpoints.length).toBe(0)
  })

  it('shows no handles for a curve outline with no free points', () => {
    const { handles, layout } = setup({ selectedProfile: { ...SQUARE, source: 'airfoil' } })
    handles.sync()
    expect(layout.vertices.length).toBe(0)
  })

  it('clear empties the dots', () => {
    const { handles, layout } = setup()
    handles.sync()
    handles.clear()
    expect(layout.vertices.length).toBe(0)
    expect(layout.midpoints.length).toBe(0)
  })
})

describe('createSketchHandles: the press', () => {
  it('a press on a dot records that vertex', () => {
    const { handles, layout } = setup()
    handles.sync()
    const dot = layout.vertices[2]
    expect(handles.hitTest(dot.x, dot.y)).toBe(true)
    expect(handles.press.kind).toBe('vertex')
    expect(handles.press.index).toBe(2)
  })

  it('a press well away from every dot records nothing', () => {
    const { handles } = setup()
    handles.sync()
    expect(handles.hitTest(-500, -500)).toBe(false)
    expect(handles.press.kind).toBe('')
    expect(handles.press.index).toBe(-1)
  })
})

describe('createSketchHandles: the drag', () => {
  it('moves the grabbed vertex to where the pointer goes, through the snap', () => {
    const { handles, deps, editor, layout } = setup()
    handles.sync()
    const dot = layout.vertices[1]
    handles.hitTest(dot.x, dot.y)
    // Pointer press point, then 5 mm further along x.
    expect(handles.beginDrag(dot.x, dot.y)).toBe(true)
    expect(handles.drag.active).toBe(true)
    handles.updateDrag(dot.x + 5, dot.y)
    expect(deps.snap).toHaveBeenCalled()
    expect(editor.moveVertex).toHaveBeenLastCalledWith(1, expect.any(Array))
  })

  it('a release keeps the move and asks for one preview', () => {
    const { handles, deps, layout } = setup()
    handles.sync()
    handles.hitTest(layout.vertices[0].x, layout.vertices[0].y)
    handles.beginDrag(0, 0)
    handles.endDrag(false)
    expect(handles.drag.active).toBe(false)
    expect(deps.requestPreview).toHaveBeenCalledTimes(1)
    expect(deps.hideSnap).toHaveBeenCalled()
  })

  it('a cancel puts the draft and the picked vertex back exactly as they were', () => {
    const { handles, deps, editor, draft, layout } = setup()
    handles.sync()
    handles.hitTest(layout.vertices[0].x, layout.vertices[0].y)
    handles.beginDrag(0, 0)
    handles.endDrag(true)
    expect(editor.setDraft).toHaveBeenCalledWith(draft)
    expect(deps.requestPreview).toHaveBeenCalledTimes(1)
  })

  it('an update with no drag in progress does nothing', () => {
    const { handles, deps, editor } = setup()
    handles.updateDrag(5, 5)
    expect(editor.moveVertex).not.toHaveBeenCalled()
    expect(deps.projectToSketch).not.toHaveBeenCalled()
  })

  it('a degenerate press off the sketch plane starts no drag', () => {
    const { handles, deps, layout } = setup()
    handles.sync()
    handles.hitTest(layout.vertices[0].x, layout.vertices[0].y)
    deps.projectToSketch.mockReturnValueOnce(/** @type {any} */ (null))
    expect(handles.beginDrag(0, 0)).toBe(false)
    expect(handles.drag.active).toBe(false)
  })
})

describe('createSketchHandles: hover', () => {
  it('hovering a dot highlights it, and leaving it clears the highlight', () => {
    const { handles, editor, layout } = setup()
    handles.sync()
    const dot = layout.vertices[3]
    handles.hover(dot.x, dot.y)
    expect(editor.hoverVertex).toBe(3)
    handles.hover(-500, -500)
    expect(editor.hoverVertex).toBe(-1)
  })

  it('forgetHover lets the next move at the same spot resolve again', () => {
    const { handles, editor, layout } = setup()
    handles.sync()
    const dot = layout.vertices[0]
    handles.hover(dot.x, dot.y)
    editor.hoverVertex = -1
    handles.hover(dot.x, dot.y)
    expect(editor.hoverVertex).toBe(-1)
    handles.forgetHover()
    handles.hover(dot.x, dot.y)
    expect(editor.hoverVertex).toBe(0)
  })
})
